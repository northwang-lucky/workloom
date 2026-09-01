/**
 * 任务 CRUD 与状态迁移（行为移植模块，纯 JS + JSDoc）。
 *
 * 设计意图：
 * - 数据布局约定：.workloom/tasks/{MM-DD-slug}/task.json（snake_case 字段）；
 * - 所有公开函数返回 [err, value] 命名元组，内部错误统一转换为 Error；
 * - hooks 与 git 失败只收集 WARNING（console.warn），不阻塞主操作；
 * - 路径一律经 locate.insideWorkloom 防越界。
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'

import { findWorkloomRoot, insideWorkloom } from './locate.js'
import { loadConfig } from './config.js'
import { EXECUTOR_KINDS } from './executor-context.js'
import {
  clearActiveTask,
  clearPointersToTask,
  resolveActiveTask,
  setActiveTask,
} from './active-task.js'
import { gitAddCommit } from './git.js'
import {
  GATES,
  PRD_SECTIONS,
  evaluateCheckLogGate,
  evaluateFrontendDispatchGate,
  evaluateStartGate,
  makeOverride,
} from './task-gates.js'

/** 错误消息前缀。 */
const ERR_PREFIX = 'workloom task'

/** slug 最大长度（目录名的一部分）。 */
const SLUG_MAX_LENGTH = 40

/** 两位数字补零宽度。 */
const PAD_WIDTH = 2

/** task.json 写入缩进。 */
const JSON_INDENT = 2

/** hooks 注入的 task.json 环境变量名。 */
const TASK_JSON_ENV = 'TASK_JSON_PATH'

/** 归档自动提交信息前缀。 */
const ARCHIVE_COMMIT_PREFIX = 'chore(task): archive'

/** 目录名常量。 */
const DIR_NAMES = Object.freeze({
  tasks: 'tasks',
  archive: 'archive',
})

/** 文件名常量。 */
const FILE_NAMES = Object.freeze({
  taskJson: 'task.json',
  prd: 'prd.md',
  implementLog: 'implement.jsonl',
  checkLog: 'check.jsonl',
  developer: '.developer',
})

/**
 * hooks 事件名（task.json.hooks 的键；旧格式任务缺省时统一补齐为空数组）。
 * @type {readonly (keyof import('./task-store.d.ts').TaskHooks)[]}
 */
const HOOK_KEYS = Object.freeze(['after_create', 'after_start', 'after_finish', 'after_archive'])

/**
 * 任务状态枚举（task.json.status 取值）。
 * @type {Readonly<Record<import('./task-store.d.ts').TaskStatusKey, import('./task-store.d.ts').TaskStatusValue>>}
 */
export const TaskStatus = Object.freeze({
  PLANNING: 'planning',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
})

/**
 * 优先级枚举（task.json.priority 取值）。
 * @type {Readonly<Record<import('./task-store.d.ts').TaskPriorityKey, import('./task-store.d.ts').TaskPriorityValue>>}
 */
export const TaskPriority = Object.freeze({
  P0: 'P0',
  P1: 'P1',
  P2: 'P2',
  P3: 'P3',
})

/** 默认优先级。 */
const DEFAULT_PRIORITY = TaskPriority.P2

/** 合法优先级集合（校验用）。 */
const PRIORITY_SET = new Set(Object.values(TaskPriority))

/**
 * 任务阶段枚举（task.json.stage 取值；implement/check 二相）。
 * @type {Readonly<Record<import('./task-store.d.ts').TaskStageKey, import('./task-store.d.ts').TaskStageValue>>}
 */
export const TaskStage = Object.freeze({
  IMPLEMENT: 'implement',
  CHECK: 'check',
})

/**
 * 由标题生成 kebab-case slug：非字母数字转连字符、去首尾连字符、全小写、截断 40 字符。
 * @param {string} title 任务标题
 * @returns {string}
 */
export function slugify(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX_LENGTH)
}

/**
 * 解析并校验项目根（向上查找 .workloom）。
 * @param {string} root 起始目录（项目根或其子目录）
 * @returns {string} 项目根绝对路径
 */
function requireProjectRoot(root) {
  const found = findWorkloomRoot(root)
  if (!found) {
    throw new Error(`${ERR_PREFIX}: no .workloom directory found (searched up from ${root})`)
  }
  return found.root
}

/**
 * 读取 .workloom/.developer 内容作为 creator；文件缺失返回空串。
 * @param {string} root 项目根
 * @returns {string}
 */
function readDeveloper(root) {
  try {
    return readFileSync(insideWorkloom(root, FILE_NAMES.developer), 'utf8').trim()
  } catch (error) {
    if (isEnoent(error)) return ''
    throw error
  }
}

/**
 * 生成 {MM-DD} 目录前缀（月份从 0 起，需 +1）。
 * @param {Date} date
 * @returns {string}
 */
function formatMonthDay(date) {
  return `${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

/**
 * 生成 {YYYY-MM} 归档前缀。
 * @param {Date} date
 * @returns {string}
 */
function formatYearMonth(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`
}

/** @param {number} value @returns {string} 补零到两位 */
function pad2(value) {
  return String(value).padStart(PAD_WIDTH, '0')
}

/**
 * 归一化 task.json 记录：旧格式任务缺 hooks 字段时补齐空数组，
 * 保证 create/start/finish/archive 各 hook 调用点对旧数据安全；
 * 缺 check/overrides/dispatches 字段时补 null/空数组，保证门禁读取对旧数据安全；
 * 缺 stage 字段时补默认 implement（旧任务未进入 check 阶段，门禁维持拦截）。
 * @param {import('./task-store.d.ts').TaskRecord} parsed task.json 解析结果
 * @returns {import('./task-store.d.ts').TaskRecord} 归一化后的记录
 */
function normalizeTaskRecord(parsed) {
  const rawHooks = /** @type {Partial<import('./task-store.d.ts').TaskHooks> | undefined} */ (
    parsed.hooks
  )
  /** @type {import('./task-store.d.ts').TaskHooks} */
  const hooks = {
    after_create: [],
    after_start: [],
    after_finish: [],
    after_archive: [],
  }
  for (const key of HOOK_KEYS) {
    const value = rawHooks?.[key]
    hooks[key] = Array.isArray(value) ? value : []
  }
  return {
    ...parsed,
    hooks,
    check: parsed.check ?? null,
    // grilling 凭据（判定/收敛）缺失补 null：与 check 同策，保证门禁对旧数据安全。
    grilling: parsed.grilling ?? null,
    overrides: Array.isArray(parsed.overrides) ? parsed.overrides : [],
    // 任务阶段：旧任务缺 stage 归一化默认 implement（未进入 check 阶段，门禁维持拦截）。
    stage: parsed.stage ?? TaskStage.IMPLEMENT,
    dispatches: Array.isArray(parsed.dispatches) ? parsed.dispatches : [],
    // parent/children 兜底：旧任务缺字段时补 null/空数组，保证父子校验与联动对旧数据安全。
    parent: parsed.parent ?? null,
    children: Array.isArray(parsed.children) ? parsed.children : [],
  }
}

/**
 * 读取任务记录：task.json 缺失或损坏返回 err；成功时对象附带 taskRelPath。
 * 导出供 workflow-service 编排使用（读取只读任务状态）。
 * @param {string} root 项目根
 * @param {string} taskRelPath 任务目录相对 .workloom 的路径
 * @returns {[Error | null, import('./task-store.d.ts').TaskRecordWithPath | null]}
 */
export function readTask(root, taskRelPath) {
  try {
    const file = join(insideWorkloom(root, taskRelPath), FILE_NAMES.taskJson)
    let raw
    try {
      raw = readFileSync(file, 'utf8')
    } catch (error) {
      if (isEnoent(error)) {
        return [new Error(`${ERR_PREFIX}: task.json missing: ${taskRelPath}`), null]
      }
      throw error
    }
    let parsed
    try {
      parsed = JSON.parse(raw)
    } catch (error) {
      return [
        new Error(`${ERR_PREFIX}: failed to parse task.json: ${taskRelPath}: ${String(error)}`),
        null,
      ]
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return [new Error(`${ERR_PREFIX}: task.json is not an object: ${taskRelPath}`), null]
    }
    return [null, { ...normalizeTaskRecord(parsed), taskRelPath }]
  } catch (error) {
    return [toError(error), null]
  }
}

/**
 * 读取任务记录并确保非空（内部，失败抛错）。
 * @param {string} root 项目根
 * @param {string} taskRelPath 任务目录相对 .workloom 的路径
 * @returns {import('./task-store.d.ts').TaskRecordWithPath}
 */
function requireTask(root, taskRelPath) {
  const [taskErr, task] = readTask(root, taskRelPath)
  if (taskErr || !task)
    throw taskErr ?? new Error(`${ERR_PREFIX}: empty task record: ${taskRelPath}`)
  return task
}

/**
 * 序列化并写入 task.json（内部）。
 * @param {string} taskDir 任务目录绝对路径
 * @param {import('./task-store.d.ts').TaskRecord} record 任务记录（不含 taskRelPath）
 */
function writeTaskJson(taskDir, record) {
  writeFileSync(
    join(taskDir, FILE_NAMES.taskJson),
    `${JSON.stringify(record, null, JSON_INDENT)}\n`,
  )
}

/**
 * 剔除记录上附带的 taskRelPath，得到可落盘的纯记录（内部）。
 * @param {import('./task-store.d.ts').TaskRecordWithPath} task
 * @returns {import('./task-store.d.ts').TaskRecord}
 */
function stripTaskPath(task) {
  const { taskRelPath: _dropped, ...record } = task
  return record
}

/**
 * 组装新任务记录（task.json 数据，hooks 从配置播种）。
 * @param {object} input
 * @param {import('./task-store.d.ts').CreateTaskParams} input.params 创建参数
 * @param {string} input.slug 任务 slug
 * @param {string} input.creator 创建者（.developer 内容）
 * @param {import('./config.d.ts').WorkloomConfig} input.config 配置（hooks 种子）
 * @param {string} input.now 创建时间 ISO
 * @returns {import('./task-store.d.ts').TaskRecord}
 */
function buildTaskRecord(input) {
  /** @type {import('./task-store.d.ts').TaskRecord} */
  const task = {
    id: randomUUID(),
    name: input.slug,
    title: input.params.title,
    description: input.params.description ?? '',
    status: TaskStatus.PLANNING,
    priority: input.params.priority ?? DEFAULT_PRIORITY,
    creator: input.creator,
    assignee: '',
    package: null,
    branch: '',
    base_branch: '',
    createdAt: input.now,
    completedAt: null,
    parent: input.params.parent ?? null,
    children: [],
    subtasks: [],
    scope: '',
    commit: '',
    pr_url: '',
    worktree_path: '',
    relatedFiles: [],
    notes: '',
    meta: {},
    check: null,
    // grilling 凭据（required/passedAt/summary）：planning 阶段经 checkTask phase=grilling 记录。
    grilling: null,
    overrides: [],
    // 任务阶段：新建任务显式落盘 implement（首次派发前处于实现期）。
    stage: TaskStage.IMPLEMENT,
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
 * 骨架常量 PRD_SECTIONS 在 task-gates.js（placeholder 判定与骨架生成共享）。
 * @param {string} title 任务标题（prd 首行 H1）
 * @returns {string}
 */
function buildPrdContent(title) {
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
 * 执行 hooks：注入 TASK_JSON_PATH 环境变量；单个失败收集为 WARNING，不抛错。
 * @param {string} root 项目根（作为 hooks 的工作目录）
 * @param {string} taskJsonPath task.json 绝对路径
 * @param {string[]} commands shell 命令列表
 * @returns {Promise<string[]>} WARNING 消息列表（空数组表示全部成功）
 */
export async function runTaskHooks(root, taskJsonPath, commands) {
  const warnings = []
  for (const command of commands) {
    const error = await runHookOnce(root, taskJsonPath, command)
    if (error) {
      warnings.push(`hook failed (${command}): ${error.message}`)
    }
  }
  return warnings
}

/**
 * 执行单条 hook 命令（内部）。
 * @param {string} root 工作目录
 * @param {string} taskJsonPath task.json 绝对路径
 * @param {string} command shell 命令
 * @returns {Promise<Error | null>}
 */
function runHookOnce(root, taskJsonPath, command) {
  return new Promise((resolve) => {
    execFile(
      '/bin/sh',
      ['-c', command],
      { cwd: root, env: { ...process.env, [TASK_JSON_ENV]: taskJsonPath } },
      (error) => resolve(error ?? null),
    )
  })
}

/**
 * 非阻塞告警统一出口（内部）。
 * @param {string[]} warnings WARNING 消息列表
 */
function logWarnings(warnings) {
  for (const warning of warnings) {
    console.warn(`${ERR_PREFIX}: WARNING: ${warning}`)
  }
}
/**
 * 归一化 parent 参数为 parentRelPath（内部）。
 * 接受 `tasks/08-29-xxx`（原样）或 `08-29-xxx`（补 `tasks/` 前缀）两种形式；
 * null/undefined/空串视同未传，返回 null。
 * @param {string | null | undefined} parent 原始 parent 参数
 * @returns {string | null} 归一后的 parentRelPath，或 null（未传）
 */
function normalizeParentRelPath(parent) {
  if (parent === undefined || parent === null || parent === '') return null
  if (parent.startsWith('tasks/')) return parent
  return join(DIR_NAMES.tasks, parent)
}

/**
 * 校验 parent 任务（顺序固定，任一失败抛错，均不产生写入）。
 * ① 存在性：task.json 可读且非空；
 * ② 自引用：parentRelPath ≠ childRelPath；
 * ③ 状态：parent.status ∈ {planning, in_progress}，completed 拒绝；
 * ④ 逃逸防护：readTask 经 insideWorkloom 解析路径，越界自动抛错。
 * @param {string} root 项目根
 * @param {string} parentRelPath 归一后的 parentRelPath
 * @param {string} childRelPath 新任务的 taskRelPath
 * @returns {import('./task-store.d.ts').TaskRecordWithPath} 校验通过的 parent 记录
 */
function validateParent(root, parentRelPath, childRelPath) {
  const [parentErr, parent] = readTask(root, parentRelPath)
  if (parentErr) {
    // 不可读/损坏/越界均在此拦截（readTask 经 insideWorkloom 防越界）。
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
 * children 反向联动（内部）：子任务创建成功后，把 childRelPath 追加到父任务 children（去重）并写回。
 * 父任务不可读或写回失败时抛错（消息指明「子任务已创建、父 children 未更新」，不做回滚）。
 * @param {string} root 项目根
 * @param {string} parentRelPath 父任务 taskRelPath
 * @param {string} childRelPath 子任务 taskRelPath
 */
function linkChildToParent(root, parentRelPath, childRelPath) {
  const [parentErr, parent] = readTask(root, parentRelPath)
  if (parentErr || !parent) {
    throw new Error(
      `${ERR_PREFIX}: child task created but parent children not updated: parent task unreadable: ${parentRelPath}`,
    )
  }
  if (!parent.children.includes(childRelPath)) {
    parent.children.push(childRelPath)
  }
  try {
    writeTaskJson(insideWorkloom(root, parentRelPath), stripTaskPath(parent))
  } catch (error) {
    throw new Error(
      `${ERR_PREFIX}: child task created but parent children not updated: ${toError(error).message}`,
      { cause: error },
    )
  }
}

/**
 * 创建任务：建目录、写 task.json/prd.md/两个 jsonl，可选激活会话并执行 after_create hooks。
 * @param {string} root 项目根（或根下任意目录）
 * @param {import('./task-store.d.ts').CreateTaskParams} params
 * @returns {Promise<[Error | null, import('./task-store.d.ts').CreateTaskResult | null]>}
 */
export async function createTask(root, params) {
  try {
    return [null, await createTaskInternal(root, params)]
  } catch (error) {
    return [toError(error), null]
  }
}

/**
 * 创建任务（内部实现，失败抛错由外层转元组）。
 * @param {string} root 项目根
 * @param {import('./task-store.d.ts').CreateTaskParams} params
 * @returns {Promise<import('./task-store.d.ts').CreateTaskResult>}
 */
async function createTaskInternal(root, params) {
  const projectRoot = requireProjectRoot(root)
  const slug = params.slug ?? slugify(params.title)
  if (slug.length === 0) {
    throw new Error(
      `${ERR_PREFIX}: title cannot produce a valid slug: ${JSON.stringify(params.title)}`,
    )
  }
  // 单次取 now：目录前缀与 createdAt 时间戳共用同一时刻，避免跨日/跨月不一致。
  const now = new Date()
  const taskRelPath = join(DIR_NAMES.tasks, `${formatMonthDay(now)}-${slug}`)
  const taskDir = insideWorkloom(projectRoot, taskRelPath)
  assertPriority(params.priority)
  // parent 归一与校验：任一失败在写入前抛错（不产生任何目录/文件写入）。
  // 自引用（parent 与新任务路径一致）由校验 ② 拦截，故校验先于 existsSync 目录冲突检查。
  const parentRelPath = normalizeParentRelPath(params.parent)
  if (parentRelPath !== null) {
    validateParent(projectRoot, parentRelPath, taskRelPath)
  }
  // 目录冲突检查：置于 parent 校验之后，避免自引用被误报为「目录已存在」。
  if (existsSync(taskDir)) {
    throw new Error(`${ERR_PREFIX}: task directory already exists: ${taskRelPath}`)
  }
  const creator = readDeveloper(projectRoot)
  const config = loadConfig(projectRoot)
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
  writeTaskJson(taskDir, task)
  writeFileSync(join(taskDir, FILE_NAMES.prd), buildPrdContent(task.title))
  writeFileSync(join(taskDir, FILE_NAMES.implementLog), `${LOG_SEEDS.implement}\n`)
  writeFileSync(join(taskDir, FILE_NAMES.checkLog), `${LOG_SEEDS.check}\n`)
  if (params.contextKey !== undefined) {
    const [ptrErr] = setActiveTask(projectRoot, params.contextKey, taskRelPath)
    if (ptrErr) throw ptrErr
  }
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
 * @param {import('./task-store.d.ts').TaskPriorityValue | undefined} priority
 */
function assertPriority(priority) {
  if (priority !== undefined && !PRIORITY_SET.has(priority)) {
    throw new Error(`${ERR_PREFIX}: invalid priority: ${priority} (must be one of P0/P1/P2/P3)`)
  }
}

/**
 * 启动任务：planning → in_progress，可选激活会话并执行 after_start hooks。
 * @param {string} root 项目根
 * @param {import('./task-store.d.ts').StartTaskParams} params
 * @returns {Promise<[Error | null, import('./task-store.d.ts').TaskRecordWithPath | null]>}
 */
export async function startTask(root, params) {
  try {
    return [null, await startTaskInternal(root, params)]
  } catch (error) {
    return [toError(error), null]
  }
}

/**
 * 启动任务（内部实现）。
 * @param {string} root 项目根
 * @param {import('./task-store.d.ts').StartTaskParams} params
 * @returns {Promise<import('./task-store.d.ts').StartedTaskRecord>}
 */
async function startTaskInternal(root, params) {
  const projectRoot = requireProjectRoot(root)
  const task = requireTask(projectRoot, params.taskRelPath)
  if (task.status !== TaskStatus.PLANNING) {
    throw new Error(
      `${ERR_PREFIX}: only tasks in planning state can be started (current: ${task.status})`,
    )
  }
  if (params.force === true) {
    // force 豁免：留痕后放行（hotfix 等无 spec 可引用的场景）。
    task.overrides.push(makeOverride(GATES.START, params.reason))
  } else {
    // 门禁消费归一化后的任务记录（grilling 凭据缺失时读 null，存量任务零阻塞）。
    const missing = evaluateStartGate(projectRoot, params.taskRelPath, task)
    if (missing.length > 0) {
      throw new Error(
        `${ERR_PREFIX}: start gate failed: ${missing.join('; ')} ` +
          '(pass force: true to bypass; the bypass is recorded in task.json overrides)',
      )
    }
  }
  task.status = TaskStatus.IN_PROGRESS
  writeTaskJson(insideWorkloom(projectRoot, params.taskRelPath), stripTaskPath(task))
  if (params.contextKey !== undefined) {
    const [ptrErr] = setActiveTask(projectRoot, params.contextKey, params.taskRelPath)
    if (ptrErr) throw ptrErr
  }
  const taskJsonPath = join(insideWorkloom(projectRoot, params.taskRelPath), FILE_NAMES.taskJson)
  const warnings = await runTaskHooks(projectRoot, taskJsonPath, task.hooks.after_start)
  logWarnings(warnings)
  // 收敛判定提示（不落盘）：grilling 未判定时返回记录附 true，供模型建议补录。
  const started = /** @type {import('./task-store.d.ts').StartedTaskRecord} */ (task)
  started.grillingPending = task.grilling === null
  return started
}

/**
 * 记录任务凭据：phase=check（缺省）写 2.2 check 通过凭据（task.json check 字段）；
 * phase=grilling 写 grilling 判定/收敛凭据（task.json grilling 字段，planning 阶段可用）。
 * @param {string} root 项目根
 * @param {import('./task-store.d.ts').CheckTaskParams} params
 * @returns {[Error | null, import('./task-store.d.ts').TaskRecordWithPath | null]}
 */
export function checkTask(root, params) {
  try {
    return [null, checkTaskInternal(root, params)]
  } catch (error) {
    return [toError(error), null]
  }
}

/**
 * 记录任务凭据（内部实现）：按 phase 分支写 task.json 的 check 或 grilling 字段。
 * - phase=check（缺省）：维持现状——要求 in_progress、summary 非空、
 *   force!==true 时要求 check.jsonl 有有效记录与 frontend 派发门禁；
 * - phase=grilling：允许 planning/in_progress 记录，跳过 check.jsonl 与
 *   frontend 门禁（grilling 凭据与 2.2 check 凭据互不干涉，force 不入口）；
 *   参数校验见 recordGrillingCredential。
 * @param {string} root 项目根
 * @param {import('./task-store.d.ts').CheckTaskParams} params
 * @returns {import('./task-store.d.ts').TaskRecordWithPath}
 */
function checkTaskInternal(root, params) {
  const projectRoot = requireProjectRoot(root)
  const task = requireTask(projectRoot, params.taskRelPath)
  const phase = params.phase ?? 'check'
  if (phase === 'grilling') {
    return recordGrillingCredential(projectRoot, task, params)
  }
  if (phase !== 'check') {
    throw new Error(`${ERR_PREFIX}: invalid check phase: ${phase} (must be check or grilling)`)
  }
  if (task.status !== TaskStatus.IN_PROGRESS) {
    throw new Error(
      `${ERR_PREFIX}: only tasks in in_progress can record a check (current: ${task.status})`,
    )
  }
  // 局部收窄：属性访问在门禁调用间不保持窄化，summary 先取到局部变量。
  const summary = params.summary
  if (typeof summary !== 'string' || summary.trim() === '') {
    throw new Error(`${ERR_PREFIX}: checkTask requires a non-empty summary`)
  }
  if (params.force === true) {
    // force 豁免：留痕后放行（「必须真跑过 check executor」跨会话无法可靠校验）。
    task.overrides.push(makeOverride(GATES.CHECK, params.reason))
  } else {
    const missing = evaluateCheckLogGate(projectRoot, params.taskRelPath)
    // 前端派发门禁（机制强制）：prd 含「UI Design」小节的任务必须经 frontend 派发。
    // prd 内容在 task-store 侧读取（任务读写分层），纯求值在 task-gates。
    const prd = readTaskContent(
      insideWorkloom(projectRoot, params.taskRelPath),
      FILE_NAMES.prd,
    )
    missing.push(...evaluateFrontendDispatchGate(prd, task.dispatches))
    if (missing.length > 0) {
      throw new Error(
        `${ERR_PREFIX}: check gate failed: ${missing.join('; ')} ` +
          '(pass force: true to bypass; the bypass is recorded in task.json overrides)',
      )
    }
  }
  task.check = { passedAt: new Date().toISOString(), summary }
  writeTaskJson(insideWorkloom(projectRoot, params.taskRelPath), stripTaskPath(task))
  return task
}

/**
 * 记录 grilling 凭据（内部）：向 task.json 写 grilling 字段，两次调用分离——
 * ① 判定（用户回答固定问题后，phase=grilling + required=yes/no，落 required）；
 * ② 收敛（grilling 收敛后，phase=grilling + summary，落 passedAt + summary）。
 * 参数校验：required 与 summary 至少提供一个；只有 required → 落判定（required
 * 必须显式布尔）；只有 summary → 收敛调用（要求任务已有 grilling.required，
 * 否则报「先记录判定」）；都有 → 判定 + 收敛一起落。
 * @param {string} root 项目根
 * @param {import('./task-store.d.ts').TaskRecordWithPath} task 归一化后的任务记录
 * @param {import('./task-store.d.ts').CheckTaskParams} params
 * @returns {import('./task-store.d.ts').TaskRecordWithPath}
 */
function recordGrillingCredential(root, task, params) {
  if (task.status === TaskStatus.COMPLETED) {
    throw new Error(
      `${ERR_PREFIX}: only planning/in_progress tasks can record grilling (current: ${task.status})`,
    )
  }
  // 局部收窄：属性访问不保持窄化，required/summary 先取到局部变量再校验。
  const requiredValue = params.required
  const summaryText = typeof params.summary === 'string' ? params.summary.trim() : ''
  const hasRequired = requiredValue !== undefined
  const hasSummary = summaryText !== ''
  if (!hasRequired && !hasSummary) {
    throw new Error(
      `${ERR_PREFIX}: phase=grilling requires required (judgment) and/or summary (convergence)`,
    )
  }
  if (hasRequired && typeof requiredValue !== 'boolean') {
    throw new Error(
      `${ERR_PREFIX}: phase=grilling required must be an explicit boolean (true/false)`,
    )
  }
  /** @type {import('./task-store.d.ts').TaskGrillingRecord} */
  let grilling
  if (hasRequired && hasSummary) {
    // 判定 + 收敛一起落：一次调用完成两段记录。
    grilling = {
      required: /** @type {boolean} */ (requiredValue),
      passedAt: new Date().toISOString(),
      summary: summaryText,
    }
  } else if (hasRequired) {
    // 仅判定：覆盖旧判定并清空收敛凭据（改判后必须重新收敛）。
    grilling = {
      required: /** @type {boolean} */ (requiredValue),
      passedAt: null,
      summary: null,
    }
  } else {
    // 仅收敛：要求任务已有判定（区分「答过 no」与「根本没问」）。
    const previous = task.grilling
    if (previous === null || typeof previous.required !== 'boolean') {
      throw new Error(
        `${ERR_PREFIX}: record the grilling judgment first ` +
          '(workloom_task_check with phase=grilling and required=yes/no)',
      )
    }
    grilling = {
      ...previous,
      passedAt: new Date().toISOString(),
      summary: summaryText,
    }
  }
  task.grilling = grilling
  writeTaskJson(insideWorkloom(root, params.taskRelPath), stripTaskPath(task))
  return task
}

/**
 * 记录 executor 参数覆盖（adapter 在 force 放行后调用）：向 task.json overrides
 * 追加 EXECUTOR_MODEL_EFFORT 条目（gate/tool/at/reason?，空串不记）。
 * 记录失败只返回 err（调用方 WARNING 不阻塞派发），不涉及状态迁移与 hooks。
 * @param {string} root 项目根
 * @param {string} taskRelPath 任务目录相对 .workloom 的路径
 * @param {string | undefined} reason 覆盖原因（审计用）
 * @returns {[Error | null]}
 */
export function recordExecutorOverride(root, taskRelPath, reason) {
  try {
    recordExecutorOverrideInternal(root, taskRelPath, reason)
    return [null]
  } catch (error) {
    return [toError(error)]
  }
}

/**
 * 记录 executor 参数覆盖（内部实现，失败抛错由外层转元组）。
 * @param {string} root 项目根
 * @param {string} taskRelPath 任务目录相对 .workloom 的路径
 * @param {string | undefined} reason 覆盖原因
 */
function recordExecutorOverrideInternal(root, taskRelPath, reason) {
  const projectRoot = requireProjectRoot(root)
  const task = requireTask(projectRoot, taskRelPath)
  task.overrides.push(makeOverride(GATES.EXECUTOR_MODEL_EFFORT, reason))
  writeTaskJson(insideWorkloom(projectRoot, taskRelPath), stripTaskPath(task))
}

/**
 * 记录一次 executor 派发成功（adapter 在派发成功后调用）：向 task.json dispatches
 * 追加 { kind, at, title, childId? } 条目（at 自动生成；childId 为 continuable
 * 子代理的 durable session id，续用定位与同 kind 校验的依据，旧记录缺省）。
 * 只审计「成功」派发——失败派发无产出，不满足分工证明，不记录。记录失败只返回
 * err（调用方 WARNING 不阻塞派发），与 recordExecutorOverride 同一「元组 + WARNING」口径。
 * @param {string} root 项目根
 * @param {string} taskRelPath 任务目录相对 .workloom 的路径
 * @param {import('./task-store.d.ts').DispatchRecordInput} entry 派发条目（kind/title/childId?，at 由函数生成）
 * @returns {[Error | null]}
 */
export function recordExecutorDispatch(root, taskRelPath, entry) {
  try {
    recordExecutorDispatchInternal(root, taskRelPath, entry)
    return [null]
  } catch (error) {
    return [toError(error)]
  }
}

/**
 * 记录 executor 派发成功（内部实现，失败抛错由外层转元组）。
 * @param {string} root 项目根
 * @param {string} taskRelPath 任务目录相对 .workloom 的路径
 * @param {import('./task-store.d.ts').DispatchRecordInput} entry 派发条目
 */
function recordExecutorDispatchInternal(root, taskRelPath, entry) {
  const projectRoot = requireProjectRoot(root)
  const task = requireTask(projectRoot, taskRelPath)
  task.dispatches.push(buildDispatchRecord(entry))
  // 与 dispatches 同点更新 stage：research 保持，implement/frontend → implement，check → check。
  task.stage = computeTaskStage(task.stage, entry.kind)
  writeTaskJson(insideWorkloom(projectRoot, taskRelPath), stripTaskPath(task))
}

/**
 * 组装派发审计记录（内部）：补 at（ISO 时间），并校验 kind/title/childId（防御，fail loud）。
 * @param {import('./task-store.d.ts').DispatchRecordInput} entry 输入
 * @returns {import('./task-store.d.ts').DispatchRecord}
 */
function buildDispatchRecord(entry) {
  if (typeof entry !== 'object' || entry === null) {
    throw new Error(`${ERR_PREFIX}: dispatch entry must be an object`)
  }
  if (typeof entry.title !== 'string' || entry.title.trim() === '') {
    throw new Error(`${ERR_PREFIX}: dispatch entry title must be a non-empty string`)
  }
  if (!Object.values(EXECUTOR_KINDS).includes(entry.kind)) {
    throw new Error(
      `${ERR_PREFIX}: invalid dispatch kind: ${String(entry.kind)} (must be one of ${Object.values(
        EXECUTOR_KINDS,
      ).join('/')})`,
    )
  }
  // childId 可选：提供时必须是可用的 session id 形状（非空 string），否则 fail loud
  // （错误 childId 会污染续用定位依据，宁可拒绝记录）。
  if (entry.childId !== undefined) {
    if (typeof entry.childId !== 'string' || entry.childId.trim() === '') {
      throw new Error(`${ERR_PREFIX}: dispatch entry childId must be a non-empty string when provided`)
    }
  }
  const record = {
    kind: entry.kind,
    at: new Date().toISOString(),
    title: entry.title,
    ...(entry.childId !== undefined ? { childId: entry.childId } : {}),
  }
  return record
}

/**
 * 计算派发后的任务阶段（纯函数，独立可测）：research 保持 current；
 * implement/frontend → 'implement'；check → 'check'。
 * kind 非法（含 undefined）抛错（fail loud，与 assertKind 同语义）。
 * @param {import('./task-store.d.ts').TaskStageValue} current 当前阶段（readTask 归一化后必有值）
 * @param {string} kind executor 类型
 * @returns {import('./task-store.d.ts').TaskStageValue}
 */
export function computeTaskStage(current, kind) {
  if (typeof kind !== 'string' || !Object.values(EXECUTOR_KINDS).includes(kind)) {
    throw new Error(
      `${ERR_PREFIX}: invalid kind: ${String(kind)} (must be one of ${Object.values(
        EXECUTOR_KINDS,
      ).join('/')})`,
    )
  }
  if (kind === EXECUTOR_KINDS.research) return current
  if (kind === EXECUTOR_KINDS.check) return TaskStage.CHECK
  return TaskStage.IMPLEMENT
}

/**
 * 结束任务会话：清指针（若该 contextKey 指向本任务）并执行 after_finish hooks；不改状态。
 * @param {string} root 项目根
 * @param {import('./task-store.d.ts').FinishTaskParams} params
 * @returns {Promise<[Error | null]>}
 */
export async function finishTask(root, params) {
  try {
    await finishTaskInternal(root, params)
    return [null]
  } catch (error) {
    return [toError(error)]
  }
}

/**
 * 结束任务会话（内部实现）。
 * @param {string} root 项目根
 * @param {import('./task-store.d.ts').FinishTaskParams} params
 */
async function finishTaskInternal(root, params) {
  const projectRoot = requireProjectRoot(root)
  const task = requireTask(projectRoot, params.taskRelPath)
  if (params.contextKey !== undefined) {
    const [ptrErr, current] = resolveActiveTask(projectRoot, params.contextKey)
    if (ptrErr) throw ptrErr
    if (current === params.taskRelPath) {
      const [clearErr] = clearActiveTask(projectRoot, params.contextKey)
      if (clearErr) throw clearErr
    }
  }
  const taskJsonPath = join(insideWorkloom(projectRoot, params.taskRelPath), FILE_NAMES.taskJson)
  const warnings = await runTaskHooks(projectRoot, taskJsonPath, task.hooks.after_finish)
  logWarnings(warnings)
}

/**
 * 归档任务：置 completed、移动目录、清理会话指针、执行 after_archive hooks，可选 git 自动提交。
 * @param {string} root 项目根
 * @param {import('./task-store.d.ts').ArchiveTaskParams} params
 * @returns {Promise<[Error | null, import('./task-store.d.ts').TaskRecordWithPath | null]>}
 */
export async function archiveTask(root, params) {
  try {
    return [null, await archiveTaskInternal(root, params)]
  } catch (error) {
    return [toError(error), null]
  }
}

/**
 * 归档任务（内部实现）。
 * @param {string} root 项目根
 * @param {import('./task-store.d.ts').ArchiveTaskParams} params
 * @returns {Promise<import('./task-store.d.ts').TaskRecordWithPath>}
 */
async function archiveTaskInternal(root, params) {
  const projectRoot = requireProjectRoot(root)
  const task = requireTask(projectRoot, params.taskRelPath)
  // 门禁先于任何写盘：无 check 凭据一律拒绝（不区分新旧任务）；
  // force 豁免的 overrides 记录随归档写入移动后的 task.json。
  if (params.force === true) {
    task.overrides.push(makeOverride(GATES.ARCHIVE, params.reason))
  } else if (task.check === null) {
    throw new Error(
      `${ERR_PREFIX}: archive gate failed: no recorded check in task.json ` +
        '(run workloom_task_check after 2.2 passes, or pass force: true to bypass; ' +
        'the bypass is recorded in task.json overrides)',
    )
  }
  // 先查冲突再动手：避免改完状态后因冲突失败留下半完成态。
  const now = new Date()
  const archiveRel = join(DIR_NAMES.tasks, DIR_NAMES.archive, formatYearMonth(now), task.name)
  const archiveDir = insideWorkloom(projectRoot, archiveRel)
  if (existsSync(archiveDir)) {
    throw new Error(`${ERR_PREFIX}: archive target already exists: ${archiveRel}`)
  }
  // 先移动、再在归档位置改状态：任一写盘失败都不会把原目录改成 completed。
  mkdirSync(dirname(archiveDir), { recursive: true })
  renameSync(insideWorkloom(projectRoot, params.taskRelPath), archiveDir)
  task.status = TaskStatus.COMPLETED
  task.completedAt = now.toISOString()
  writeTaskJson(archiveDir, stripTaskPath(task))
  const [ptrErr] = clearPointersToTask(projectRoot, params.taskRelPath)
  if (ptrErr) throw ptrErr
  const warnings = await runTaskHooks(
    projectRoot,
    join(archiveDir, FILE_NAMES.taskJson),
    task.hooks.after_archive,
  )
  warnings.push(...(await autoCommitIfEnabled(projectRoot, params.autoCommit, task.name)))
  logWarnings(warnings)
  // 返回归档后的新路径，避免调用方拿着旧路径继续操作。
  task.taskRelPath = archiveRel
  return task
}

/**
 * 按配置决定是否 git 自动提交归档（git 失败只告警，不阻塞）。
 * @param {string} root 项目根
 * @param {boolean | undefined} autoCommit 显式开关
 * @param {string} slug 任务 slug（提交信息用）
 * @returns {Promise<string[]>} WARNING 消息列表
 */
async function autoCommitIfEnabled(root, autoCommit, slug) {
  if (autoCommit === undefined) {
    autoCommit = loadConfig(root).sessionAutoCommit
  }
  if (!autoCommit) return []
  const [gitErr] = await gitAddCommit(root, `${ARCHIVE_COMMIT_PREFIX} ${slug}`)
  if (gitErr) return [`git auto-commit failed (archival proceeds anyway): ${gitErr.message}`]
  return []
}

/**
 * 列出任务摘要（不含 archive/），可按状态过滤；缺失或损坏的目录跳过。
 * @param {string} root 项目根
 * @param {import('./task-store.d.ts').ListTasksParams} [params]
 * @returns {[Error | null, import('./task-store.d.ts').TaskSummary[] | null]}
 */
export function listTasks(root, params = {}) {
  try {
    return [null, listTasksInternal(root, params)]
  } catch (error) {
    return [toError(error), null]
  }
}

/**
 * 列出任务摘要（内部实现）。
 * @param {string} root 项目根
 * @param {import('./task-store.d.ts').ListTasksParams} params
 * @returns {import('./task-store.d.ts').TaskSummary[]}
 */
function listTasksInternal(root, params) {
  const projectRoot = requireProjectRoot(root)
  const tasksDir = insideWorkloom(projectRoot, DIR_NAMES.tasks)
  if (!existsSync(tasksDir)) return []
  /** @type {import('./task-store.d.ts').TaskSummary[]} */
  const summaries = []
  for (const entry of readdirSync(tasksDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === DIR_NAMES.archive) continue
    const taskRelPath = join(DIR_NAMES.tasks, entry.name)
    const [taskErr, task] = readTask(projectRoot, taskRelPath)
    if (taskErr || !task) continue // 缺失或损坏的目录不阻塞列表
    if (params.status !== undefined && task.status !== params.status) continue
    summaries.push({
      name: task.name,
      title: task.title,
      status: task.status,
      priority: task.priority,
      createdAt: task.createdAt,
      parent: task.parent ?? null,
    })
  }
  return summaries
}

/** @param {unknown} value @returns {Error} */
function toError(value) {
  return value instanceof Error ? value : new Error(String(value))
}

/**
 * 读取任务目录内文件内容（缺失返回 null，其他错误透传；内部）。
 * @param {string} taskDir 任务目录绝对路径
 * @param {string} name 文件名
 * @returns {string | null}
 */
function readTaskContent(taskDir, name) {
  try {
    return readFileSync(join(taskDir, name), 'utf8')
  } catch (error) {
    if (isEnoent(error)) return null
    throw error
  }
}

/** @param {unknown} error @returns {boolean} 是否文件不存在 */
function isEnoent(error) {
  return /** @type {NodeJS.ErrnoException} */ (error)?.code === 'ENOENT'
}
