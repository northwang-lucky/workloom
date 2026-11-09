/**
 * storage/create：任务创建与 slug 校验。
 *
 * 设计意图：
 * - 承载 createTask 全链：slug 派生与校验、parent 归一与校验、记录组装、目录与
 *   四文件落盘（task.json/prd.md/两个 jsonl）、after_create hooks 与父子联动；
 * - 校验全部前置于任何写盘，失败即零部分状态；
 * - 会话指针绑定归编排层（executeCreateTask），存储层不消费 contextKey；
 * - 公开函数返回 [err, value] 命名元组，内部错误统一转换为 Error。
 */

import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

import type { Dirent } from 'node:fs'

import { loadConfig } from '../../workspace/config-load.ts'
import { insideWorkloom } from '../../workspace/locate.js'
import { PRD_SECTIONS } from '../prd-structure.ts'
import { logWarnings, runTaskHooks } from './list-archive.ts'
import {
  readTaskRecord,
  requireProjectRoot,
  writeTaskRecord,
  writeTaskRecordToDir,
} from './read-write.ts'
import {
  DEFAULT_PRIORITY,
  DIR_NAMES,
  ERR_PREFIX,
  FILE_NAMES,
  isEnoent,
  PRIORITY_SET,
  TASK_DIR_DATE_PREFIX,
  TaskStatus,
  toError,
} from './records.ts'

import type { WorkloomConfig } from '../../workspace/config.d.ts'
// 新模式值域的单源在 task/state 的 MODES；创建层只以类型钉住字面量
// （type-only import 不成运行时环，值域漂移由 tsc 拦截）。
import type { AutonomyValue, TaskModeValue, TaskStageValue } from '../state/index.ts'
import type {
  CreateTaskParams,
  CreateTaskResult,
  TaskPriorityValue,
  TaskRecord,
  TaskRecordWithPath,
} from './records.ts'

/** slug 最大长度（目录名的一部分）。 */
const SLUG_MAX_LENGTH = 40

/** 显式 slug 的合法形态：小写字母数字段以单连字符相连，首尾不带连字符。 */
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * slug 自带日期前缀的形态（MM-DD，月 01-12、日 01-31，后接连字符或到此为止）。
 * 目录名的日期段由 createTask 生成，slug 再带一段就得到 `10-30-10-30-x` 这种双前缀。
 */
const SLUG_DATE_PREFIX_PATTERN = /^(?:0[1-9]|1[0-2])-(?:0[1-9]|[12][0-9]|3[01])(?:-|$)/

/** 两位数字补零宽度。 */
const PAD_WIDTH = 2

/**
 * 由标题生成 kebab-case slug：非字母数字转连字符、去首尾连字符、全小写、截断 40 字符。
 * @param title 任务标题
 * @returns slug
 */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX_LENGTH)
}

/**
 * 校验创建任务用的 slug，不合法即抛错（与 assertPriority/assertTaskMode 同风格）。
 *
 * 设计意图：目录名恒为 `{MM-DD}-{slug}`，日期段归工具，所以 slug 自带日期前缀一律
 * 拒绝而不是静默剥离——剥离会误改 `12-25-release-notes` 这类合法命名，报错则把改写
 * 决定留给调用方。显式 slug 另需满足 kebab-case 与长度上限（超长不截断，截断会让
 * 调用方拿到的目录名与传入值不一致）；标题派生的 slug 已由 slugify 归一字符集与长度，
 * 只查日期前缀，文案指向「改传显式 slug」。
 * @param slug 待校验 slug（调用前已保证非空）
 * @param explicit true 表示调用方显式传入，false 表示由标题派生
 */
function assertValidSlug(slug: string, explicit: boolean): void {
  if (explicit && slug.length > SLUG_MAX_LENGTH) {
    throw new Error(
      `${ERR_PREFIX}: slug is longer than ${SLUG_MAX_LENGTH} characters ` +
        `(${slug.length}): ${JSON.stringify(slug)}`,
    )
  }
  if (explicit && !SLUG_PATTERN.test(slug)) {
    throw new Error(
      `${ERR_PREFIX}: slug must be kebab-case (lowercase letters and digits joined by ` +
        `single hyphens, no leading or trailing hyphen): ${JSON.stringify(slug)}`,
    )
  }
  if (SLUG_DATE_PREFIX_PATTERN.test(slug)) {
    const hint = explicit ? 'pass the slug without that prefix' : 'pass an explicit slug instead'
    throw new Error(
      `${ERR_PREFIX}: slug must not carry a MM-DD date prefix, the task directory already ` +
        `gets one: ${JSON.stringify(slug)}; ${hint}`,
    )
  }
}

/** 创建任务的缺省模式（值域单源在 task/state 的 MODES.STANDARD，类型钉住字面量）。 */
const DEFAULT_CREATE_MODE: TaskModeValue = 'standard'

/** 新建任务的初始主线阶段（值域单源在 task/state 的 STAGES.ALIGNING）。 */
const INITIAL_STAGE: TaskStageValue = 'aligning'

/** 创建缺省自治度（值域单源在 task/state 的 AUTONOMY.MANUAL，类型钉住字面量）。 */
const DEFAULT_AUTONOMY: AutonomyValue = 'manual'

/** 合法自治度集合（值域单源在 task/state 的 AUTONOMY；Record 形态由 tsc 守护漂移）。 */
const AUTONOMY_VALUE_SET = Object.freeze({
  manual: true,
  semi: true,
  auto: true,
} as const satisfies Record<AutonomyValue, true>)

/** 合法创建模式集合（值域单源在 task/state 的 MODES；Record 形态由 tsc 守护漂移）。 */
const CREATE_MODE_VALUES = Object.freeze({
  light: true,
  standard: true,
  parent: true,
} as const satisfies Record<TaskModeValue, true>)

/** 生成 {MM-DD} 目录前缀（月份从 0 起，需 +1）。 */
function formatMonthDay(date: Date): string {
  return `${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

/** 生成 {YYYY-MM} 归档前缀。 */
export function formatYearMonth(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`
}

/** @param value 数字 @returns 补零到两位 */
function pad2(value: number): string {
  return String(value).padStart(PAD_WIDTH, '0')
}

/**
 * 组装新任务记录（task.json 数据，hooks 从配置播种）。
 * @param input 组装入参
 * @returns 新任务记录
 */
function buildTaskRecord(input: {
  params: CreateTaskParams
  slug: string
  creator: string
  config: WorkloomConfig
  now: string
}): TaskRecord {
  const task: TaskRecord = {
    id: randomUUID(),
    name: input.slug,
    title: input.params.title,
    description: input.params.description ?? '',
    status: TaskStatus.PLANNING,
    priority: input.params.priority ?? DEFAULT_PRIORITY,
    // 任务模式在创建时定死（light/standard/parent，缺省 standard），后续没有转换通道。
    mode: input.params.mode ?? DEFAULT_CREATE_MODE,
    creator: input.creator,
    assignee: '',
    // package 归属（create 传入时落值，存量直调面缺省 null；成员校验在 createTaskInternal）。
    package: input.params.package ?? null,
    branch: '',
    base_branch: '',
    createdAt: input.now,
    completedAt: null,
    parent: input.params.parent ?? null,
    children: [],
    scope: '',
    commit: '',
    pr_url: '',
    worktree_path: '',
    relatedFiles: [],
    notes: '',
    meta: {},
    check: null,
    // CASE 生命周期（required/designSession/phase）：新建任务落 null；
    // start 完整任务时才转换（旧任务保留既有确认数据）。
    case: null,
    // PRD 内容确认（passedAt/summary）：planning 阶段经确认入口原子写入；
    // 新建任务仅落 null（旧 grilling 不再写入新任务）。
    alignment: null,
    // PLAN 内容确认（passedAt/summary）：PLAN 复核后经 target=plan confirm 写入。
    planConfirmation: null,
    overrides: [],
    // 主线阶段：新建任务显式落盘 aligning（Phase 1.1 对齐期起点）。
    stage: INITIAL_STAGE,
    // 自治度：创建参数指定，缺省 manual（切换留痕见 autonomyLog）。
    autonomy: input.params.autonomy ?? DEFAULT_AUTONOMY,
    autonomyLog: [],
    dispatches: [],
    hooks: {
      after_create: input.config.hooks.afterCreate,
      after_start: input.config.hooks.afterStart,
      after_finish: input.config.hooks.afterFinish,
      after_archive: input.config.hooks.afterArchive,
    },
  }
  return task
}

/**
 * 生成 prd.md 骨架内容：以 `# <任务 title>` 一级标题开头，后接既有小节顺序。
 * 骨架常量 PRD_SECTIONS 在 prd-structure（placeholder 判定与骨架生成共享）。
 * @param title 任务标题（prd 首行 H1）
 * @returns prd.md 骨架全文
 */
function buildPrdContent(title: string): string {
  return (
    `# ${title}\n\n` +
    PRD_SECTIONS.map((section) => `## ${section.heading}\n\n${section.placeholder}`).join('\n\n') +
    '\n'
  )
}

/** implement/check 日志的 seed 行（无 file 字段，消费者自动跳过）。 */
const LOG_SEEDS = Object.freeze({
  implement:
    '{"_example": "implement event log: one JSON object per line; lines without a file field are skipped automatically"}',
  check:
    '{"_example": "check event log: one JSON object per line; lines without a file field are skipped automatically"}',
})

/**
 * 归一化 parent 参数为 parentRelPath（内部）。
 * 接受 `tasks/08-29-xxx`（原样）或 `08-29-xxx`（补 `tasks/` 前缀）两种形式；
 * null/undefined/空串视同未传，返回 null。
 * @param parent 原始 parent 参数
 * @returns 归一后的 parentRelPath，或 null（未传）
 */
function normalizeParentRelPath(parent: string | null | undefined): string | null {
  if (parent === undefined || parent === null || parent === '') return null
  if (parent.startsWith('tasks/')) return parent
  return join(DIR_NAMES.tasks, parent)
}

/**
 * 校验 parent 任务（顺序固定，任一失败抛错，均不产生写入）。
 * ① 存在性：task.json 可读且非空；
 * ② 自引用：parentRelPath ≠ childRelPath；
 * ③ 状态：parent.status ∈ {planning, in_progress}，completed 拒绝；
 * ④ 逃逸防护：readTaskRecord 经 insideWorkloom 解析路径，越界自动抛错。
 * @param root 项目根
 * @param parentRelPath 归一后的 parentRelPath
 * @param childRelPath 新任务的 taskRelPath
 * @returns 校验通过的 parent 记录
 */
function validateParent(
  root: string,
  parentRelPath: string,
  childRelPath: string,
): TaskRecordWithPath {
  const [parentErr, parent] = readTaskRecord(root, parentRelPath)
  if (parentErr) {
    // 不可读/损坏/越界均在此拦截（readTaskRecord 经 insideWorkloom 防越界）。
    throw new Error(
      `${ERR_PREFIX}: parent task not found: ${parentRelPath}: ${parentErr.message}`,
    )
  }
  if (!parent) {
    throw new Error(`${ERR_PREFIX}: parent task not found: ${parentRelPath}`)
  }
  if (parentRelPath === childRelPath) {
    throw new Error(`${ERR_PREFIX}: task cannot be its own parent: ${parentRelPath}`)
  }
  if (parent.status !== TaskStatus.PLANNING && parent.status !== TaskStatus.IN_PROGRESS) {
    throw new Error(
      `${ERR_PREFIX}: parent task must be planning or in_progress (current: ${parent.status})`,
    )
  }
  return parent
}

/**
 * slug 活跃树全库唯一校验（内部）：递归扫描 tasks/ 活跃区（跳过 archive），
 * 目录名去日期前缀后与 slug 相等即冲突。分支名撞车（task.name=slug）在 start
 * 才暴露，把拒绝提前到创建期。tasks/ 尚不存在（全新项目）按无冲突处理；
 * 其余读目录失败按原错误透传（调用方统一转元组）。
 * @param root 项目根
 * @param slug 归一后的 slug
 */
function assertSlugUniqueActiveTree(root: string, slug: string): void {
  const walk = (dir: string): void => {
    let entries: Dirent[]
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch (error) {
      if (isEnoent(error)) return
      throw error
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === DIR_NAMES.archive) continue
      if (TASK_DIR_DATE_PREFIX.test(entry.name)) {
        if (entry.name.replace(TASK_DIR_DATE_PREFIX, '') === slug) {
          throw new Error(`${ERR_PREFIX}: slug already exists in active tree: ${slug}`)
        }
      }
      walk(join(dir, entry.name))
    }
  }
  walk(insideWorkloom(root, DIR_NAMES.tasks))
}

/** 被指向父任务归一后的 mode 值（值域单源在 task/state 的 MODES.PARENT）。 */
const PARENT_MODE_VALUE: TaskModeValue = 'parent'

/**
 * children 反向联动（内部）：子任务创建成功后，把 childRelPath 追加到父任务
 * children（去重）、把父任务 mode 归一为 parent（写路径认定，读路径的兜底推断
 * 在 readTaskView），一次写回。父任务不可读或写回失败时抛错（消息指明「子任务
 * 已创建、父 children 未更新」，不做回滚）。
 * @param root 项目根
 * @param parentRelPath 父任务 taskRelPath
 * @param childRelPath 子任务 taskRelPath
 */
function linkChildToParent(root: string, parentRelPath: string, childRelPath: string): void {
  const [parentErr, parent] = readTaskRecord(root, parentRelPath)
  if (parentErr || !parent) {
    throw new Error(
      `${ERR_PREFIX}: child task created but parent children not updated: parent task unreadable: ${parentRelPath}`,
    )
  }
  if (!parent.children.includes(childRelPath)) {
    parent.children.push(childRelPath)
  }
  // parent 认定双路的写路径：被指向的父任务 mode 归一为 parent（旧值 full 一并升级）。
  parent.mode = PARENT_MODE_VALUE
  try {
    writeTaskRecord(root, parentRelPath, parent)
  } catch (error) {
    throw new Error(
      `${ERR_PREFIX}: child task created but parent children not updated: ${toError(error).message}`,
      { cause: error },
    )
  }
}

/**
 * 创建任务：建目录、写 task.json/prd.md/两个 jsonl，执行 after_create hooks。
 * 会话指针绑定归编排层（executeCreateTask），存储层不消费 contextKey。
 * @param root 项目根（或根下任意目录）
 * @param params 创建参数
 * @returns [err, result]
 */
export async function createTask(
  root: string,
  params: CreateTaskParams,
): Promise<[Error | null, CreateTaskResult | null]> {
  try {
    return [null, await createTaskInternal(root, params)]
  } catch (error) {
    return [toError(error), null]
  }
}

/**
 * 创建任务（内部实现，失败抛错由外层转元组）。
 * @param root 项目根
 * @param params 创建参数
 * @returns 创建结果
 */
async function createTaskInternal(root: string, params: CreateTaskParams): Promise<CreateTaskResult> {
  const projectRoot = requireProjectRoot(root)
  // 显式 slug 与标题派生 slug 共用同一校验入口；空值按来源分别报错（显式空串不再
  // 误报成「标题无法派生」）。校验全部前置于任何写盘，失败即零部分状态。
  const hasExplicitSlug = params.slug !== undefined && params.slug !== null
  const slug = hasExplicitSlug ? String(params.slug) : slugify(params.title)
  if (slug.length === 0) {
    throw new Error(
      hasExplicitSlug
        ? `${ERR_PREFIX}: slug cannot be empty`
        : `${ERR_PREFIX}: title cannot produce a valid slug: ${JSON.stringify(params.title)}`,
    )
  }
  assertValidSlug(slug, hasExplicitSlug)
  // parent 归一先于路径计算：带 parent 的子任务落位嵌套目录 tasks/<father>/subtasks/<dir>。
  // 自引用（parent 与新任务路径一致）由校验 ② 拦截，故校验先于 existsSync 目录冲突检查。
  const parentRelPath = normalizeParentRelPath(params.parent)
  // 单次取 now：目录前缀与 createdAt 时间戳共用同一时刻，避免跨日/跨月不一致。
  const now = new Date()
  const dirName = `${formatMonthDay(now)}-${slug}`
  // 带 parent 落位父任务目录内的 subtasks 层：tasks/<father>/subtasks/<MM-DD-slug>；
  // 无 parent 落顶层 tasks/<MM-DD-slug>。
  const taskRelPath =
    parentRelPath !== null
      ? join(parentRelPath, DIR_NAMES.subtasks, dirName)
      : join(DIR_NAMES.tasks, dirName)
  const taskDir = insideWorkloom(projectRoot, taskRelPath)
  assertPriority(params.priority)
  assertTaskMode(params.mode)
  assertAutonomy(params.autonomy)
  if (parentRelPath !== null) {
    validateParent(projectRoot, parentRelPath, taskRelPath)
  }
  // slug 活跃树全库唯一：顶层与各 subtasks 层递归查重，写盘前拒绝。
  assertSlugUniqueActiveTree(projectRoot, slug)
  // 目录冲突检查：置于 parent 校验之后，避免自引用被误报为「目录已存在」。
  if (existsSync(taskDir)) {
    throw new Error(`${ERR_PREFIX}: task directory already exists: ${taskRelPath}`)
  }
  // 身份能力退役：.developer 读取整体去除，creator 恒为空串（字段保留保数据布局兼容）。
  const creator = ''
  const config = loadConfig(projectRoot)
  // package 归属校验：传入即校验 ∈ config.packages，未知值 fail loud
  // （文案列已声明包 + 指引 workloom-packages-scan）；置于任何写盘（mkdirSync）
  // 之前 → 零部分状态。直调面 package 可选（存量 createTask 调用不下沉必填；
  // executeCreateTask 层另行强制非空）。
  if (params.package !== undefined && params.package !== null) {
    if (typeof params.package !== 'string' || config.packages[params.package] === undefined) {
      const declared = Object.keys(config.packages)
      throw new Error(
        `${ERR_PREFIX}: unknown package ${JSON.stringify(params.package)} ` +
          `(declared: ${declared.length > 0 ? declared.join(', ') : 'none'}); ` +
          'declare it under "packages" in .workloom/config.json ' +
          '(run workloom-packages-scan to generate the list)',
      )
    }
  }
  // 子任务落盘 parent 用归一后的 parentRelPath（tasks/ 规范形），保证两种输入格式存储一致。
  const recordParams = { ...params, parent: parentRelPath }
  const task = buildTaskRecord({
    params: recordParams,
    slug,
    creator,
    config,
    now: now.toISOString(),
  })
  mkdirSync(taskDir, { recursive: true })
  writeTaskRecordToDir(taskDir, task)
  writeFileSync(join(taskDir, FILE_NAMES.prd), buildPrdContent(task.title))
  writeFileSync(join(taskDir, FILE_NAMES.implementLog), `${LOG_SEEDS.implement}\n`)
  writeFileSync(join(taskDir, FILE_NAMES.checkLog), `${LOG_SEEDS.check}\n`)
  // children 联动：子任务创建成功后才执行；写回失败抛错（子任务已创建、父 children 未更新）。
  if (parentRelPath !== null) {
    linkChildToParent(projectRoot, parentRelPath, taskRelPath)
  }
  const warnings = await runTaskHooks(
    projectRoot,
    join(taskDir, FILE_NAMES.taskJson),
    task.hooks.after_create,
  )
  logWarnings(warnings)
  return { taskRelPath, task }
}

/**
 * 校验优先级（内部）。
 * @param priority 创建入参优先级
 */
function assertPriority(priority: TaskPriorityValue | undefined): void {
  if (priority !== undefined && !PRIORITY_SET.has(priority)) {
    throw new Error(`${ERR_PREFIX}: invalid priority: ${priority} (must be one of P0/P1/P2/P3)`)
  }
}

/**
 * 校验任务模式（内部）：缺省 standard；显式值必须是合法枚举（fail loud，写入前拦截）。
 * @param mode 创建入参模式
 */
function assertTaskMode(mode: TaskModeValue | undefined): void {
  if (mode !== undefined && !Object.hasOwn(CREATE_MODE_VALUES, mode)) {
    throw new Error(
      `${ERR_PREFIX}: invalid mode: ${JSON.stringify(mode)} (must be one of light/standard/parent)`,
    )
  }
}

/**
 * 校验任务自治度（内部）：缺省 manual；显式值必须是合法枚举（fail loud，
 * 非法值在 schema 校验报可判定错误，写入前拦截）。
 * @param autonomy 创建入参自治度
 */
function assertAutonomy(autonomy: AutonomyValue | undefined): void {
  if (autonomy !== undefined && !Object.hasOwn(AUTONOMY_VALUE_SET, autonomy)) {
    throw new Error(
      `${ERR_PREFIX}: invalid autonomy: ${JSON.stringify(autonomy)} (must be one of manual/semi/auto)`,
    )
  }
}
