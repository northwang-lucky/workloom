/**
 * task-ops：任务生命周期编排（TypeScript）。
 *
 * 设计意图：
 * - 两层职责：① 六个任务管理工具（create/start/check/finish/archive/list）的
 *   runtime 无关编排（cwd 校验 → 显式 taskPath 优先 → 活跃任务 fallback →
 *   生命周期调用 → null 结果兜底报错），adapter 只负责从执行上下文提取
 *   cwd/contextKey 并投影返回值；② start/check/finish/archive 四个生命周期
 *   编排（守卫判断 + task-storage 物理写 + 指针联动 + hooks），状态迁移判断
 *   经 task/state 的 migrateTask/evaluateTransition 单一入口；
 * - create 的入参过滤（空串 slug/priority/description 不传）照 DSH 现状；
 *   mode 三值（light/standard/parent，缺省 standard），会话指针绑定在本层
 *   （存储层不消费 contextKey）；
 * - archive 的 taskPath 必填（requireTaskRelPath，缺参即报错不回退活跃任务），
 *   归档必须显式绑定目标任务；start/check/finish/align 保持活跃任务回退；
 * - 生命周期错误消息沿用旧 task-store 的 `workloom task` 前缀（行为移植，
 *   测试钉住字面量）；工具编排错误消息使用 surface.ERR_PREFIX.taskTool 前缀。
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { findWorkloomRoot, insideWorkloom, WORKLOOM_DIR } from '../workspace/locate.js'
import { loadConfig } from '../workspace/config-load.ts'
import { gitAddCommit } from '../workspace/git-ops.ts'
import { cleanupTaskWorktree, createTaskWorktree } from '../workspace/worktree-lifecycle.ts'
import { createCaseRecord } from './case-structure.ts'
import { recordGateOverride } from './dispatch-records.ts'
import {
  AUTONOMY,
  MODES,
  OVERRIDE_GATES,
  STAGES,
  clearActiveTask,
  clearPointersToTask,
  evaluateGuard,
  evaluateTransition,
  migrateTask,
  resolveActiveTask,
  setActiveTask,
  toTaskView,
} from './state/index.ts'
import {
  TaskStatus,
  archiveRelPathOf,
  createTask,
  listTasks,
  logWarnings,
  moveTaskToArchive,
  requireProjectRoot,
  requireTaskRecord,
  runTaskHooks,
  writeTaskRecord,
  writeTaskRecordToDir,
  FILE_NAMES,
} from './storage/index.ts'
import { ERR_PREFIX, TASK_ARCHIVE_NOTE, TASK_CREATE_LIGHT_NOTE, TASK_CREATE_NOTE } from '../injection/surface.ts'

import type { AutonomyValue, TaskModeValue, TaskView } from './state/index.ts'
import type {
  TaskPriorityValue,
  TaskRecord,
  TaskStatusValue,
  TaskSummary,
} from './storage/index.ts'
import type { CleanupTaskWorktreeResult } from '../workspace/worktree.d.ts'

/** 生命周期错误消息前缀（旧 task-store 字面量，测试钉住）。 */
const TASK_ERR_PREFIX = 'workloom task'

/** 归档自动提交信息前缀。 */
const ARCHIVE_COMMIT_PREFIX = 'chore(task): archive'

/**
 * 校验工具 cwd：空串直接抛错（消息含前缀，与下沉前 adapter 文案逐字一致）。
 * @param cwd 工具执行上下文的工作目录
 * @returns cwd（非空）
 */
export function requireWorkloomCwd(cwd: string): string {
  if (cwd === '') {
    throw new Error(
      `${ERR_PREFIX.taskTool}: cannot determine the working directory of this session`,
    )
  }
  return cwd
}

/**
 * 解析任务相对路径：显式 taskPath 优先，缺省取活跃任务（无则抛错）。
 * @param cwd 会话工作目录（项目根或其任意子目录）
 * @param contextKey 会话标识（adapter 组装）
 * @param taskPath 显式任务路径（可选）
 * @param errPrefix 「无活跃任务」错误消息的前缀（任务工具与 executor 各按自身
 *   消费方文案传入；权威校验在 core，adapter schema 只是投影）
 * @returns 任务目录相对 .workloom 的路径
 */
export function resolveTaskRelPath(
  cwd: string,
  contextKey: string,
  taskPath: string | undefined,
  errPrefix: string,
): string {
  if (typeof taskPath === 'string' && taskPath !== '') return taskPath
  // 缺省取活跃任务：先向上定位 .workloom 根再读会话指针——深层子目录 cwd 下若把
  // 原始 cwd 当根直接拼 <cwd>/.workloom/.runtime 会 ENOENT 而误报无活跃任务；
  // 状态机指针段约定 root 为项目根不做向上查找，此处复用 findWorkloomRoot 补齐。
  const found = findWorkloomRoot(cwd)
  if (found === null) {
    throw new Error(`${errPrefix}: no .workloom directory found from cwd: ${cwd}`)
  }
  const [ptrErr, active] = resolveActiveTask(found.root, contextKey)
  if (ptrErr) throw ptrErr
  if (active === null) {
    throw new Error(`${errPrefix}: no active task and no taskPath given`)
  }
  return active
}

/**
 * 解析必填任务相对路径：taskPath 缺失或空串直接抛错，不回退活跃任务
 * （archive 等必须显式绑定任务的消费方用；权威校验在 core，
 * adapter schema 的 required 只是投影）。
 * @param taskPath 显式任务路径（必填）
 * @param errPrefix 错误消息前缀（任务工具传 taskTool，其余消费方按自身文案传入）
 * @returns 任务目录相对 .workloom 的路径
 */
export function requireTaskRelPath(taskPath: string | undefined, errPrefix: string): string {
  if (typeof taskPath === 'string' && taskPath !== '') return taskPath
  throw new Error(`${errPrefix}: taskPath is required (task directory relative to .workloom)`)
}

/* ---------------- create ---------------- */

/** executeCreateTask 入参（title/package 必填；slug/priority/description/parent/mode 可选）。 */
export interface ExecuteCreateTaskParams {
  title: string
  /**
   * package 归属（必填，与 worktree 开关无关）：必须是 config.packages 的键，
   * 缺失/未知值 fail loud（错误文案指引补配置 / workloom-packages-scan）。
   */
  package: string
  slug?: string
  priority?: string
  description?: string
  /** 父任务相对路径（tasks/<id> 或 <id>）；空串视同未传。 */
  parent?: string
  /**
   * 任务模式：light（轻量任务，主会话包办实现与自查）、standard（完整任务）、
   * parent（容器任务）；缺省/空串视为 standard，其他取值 fail loud。
   */
  mode?: string
  /** 任务自治度（manual/semi/auto）；缺省/空串视为 manual，其他取值 fail loud。 */
  autonomy?: string
}

/** create 工具成功结果（task 为无 taskRelPath 的原始记录；nextStepNote 为下一步行动指引）。 */
export interface ExecuteCreateTaskResult {
  taskRelPath: string
  task: TaskRecord
  nextStepNote: string
}

/**
 * create 工具编排：创建任务并设为当前会话活跃任务。
 * @param cwd 会话工作目录
 * @param contextKey 会话标识（adapter 组装）
 * @param params 工具参数（空串 slug/priority/description 不传，照 DSH 现状）
 * @returns [err, result]：err 为任一失败（消息含前缀）
 */
export async function executeCreateTask(
  cwd: string,
  contextKey: string,
  params: ExecuteCreateTaskParams,
): Promise<[Error | null, ExecuteCreateTaskResult | null]> {
  try {
    return [null, await executeCreateInternal(cwd, contextKey, params)]
  } catch (error) {
    return [toError(error), null]
  }
}

/**
 * create 编排实现（内部）：任一失败抛错，由外层转元组。
 * @param cwd 会话工作目录
 * @param contextKey 会话标识
 * @param params 工具参数
 * @returns 创建结果
 */
async function executeCreateInternal(
  cwd: string,
  contextKey: string,
  params: ExecuteCreateTaskParams,
): Promise<ExecuteCreateTaskResult> {
  requireWorkloomCwd(cwd)
  // package 恒必填（与 worktree 开关无关）：非空字符串校验在 execute
  // 层（调用方为 adapter 薄投影，schema required 之外的兜底）；成员校验在 core。
  if (typeof params.package !== 'string' || params.package.trim() === '') {
    throw new Error(
      `${ERR_PREFIX.taskTool}: package is required (pass a declared "packages" key from .workloom/config.json; ` +
        'run workloom-packages-scan if no package is declared)',
    )
  }
  const mode = resolveCreateMode(params.mode)
  const autonomy = resolveCreateAutonomy(params.autonomy)
  const [err, result] = await createTask(cwd, {
    title: params.title,
    package: params.package,
    mode,
    autonomy,
    ...(typeof params.slug === 'string' && params.slug !== '' ? { slug: params.slug } : {}),
    ...(typeof params.priority === 'string' && params.priority !== ''
      ? { priority: params.priority as TaskPriorityValue }
      : {}),
    ...(typeof params.description === 'string' && params.description !== ''
      ? { description: params.description }
      : {}),
    ...(typeof params.parent === 'string' && params.parent !== '' ? { parent: params.parent } : {}),
  })
  if (err || result === null) {
    throw err ?? new Error(`${ERR_PREFIX.taskTool}: create returned no result`)
  }
  // 会话指针绑定在编排层（存储层不消费 contextKey）：创建成功后激活会话任务。
  const found = findWorkloomRoot(cwd)
  if (found === null) {
    throw new Error(`${ERR_PREFIX.taskTool}: no .workloom directory found from cwd: ${cwd}`)
  }
  const [ptrErr] = setActiveTask(found.root, contextKey, result.taskRelPath)
  if (ptrErr) throw ptrErr
  // 附下一步行动指引：light 任务走轻量轨（免对齐/免 jsonl），其余引导 Phase 1.1。
  return {
    ...result,
    nextStepNote: mode === MODES.LIGHT ? TASK_CREATE_LIGHT_NOTE : TASK_CREATE_NOTE,
  }
}

/**
 * 解析 create 的 mode 入参（内部）：缺省/空串视为 standard；
 * light/standard/parent 三值放行；其他取值 fail loud。
 * @param mode 工具入参原值
 * @returns 归一后的任务模式
 */
function resolveCreateMode(mode: string | undefined): TaskModeValue {
  if (mode === undefined || mode === '') return MODES.STANDARD
  if (mode !== MODES.LIGHT && mode !== MODES.STANDARD && mode !== MODES.PARENT) {
    throw new Error(
      `${ERR_PREFIX.taskTool}: invalid mode: ${JSON.stringify(mode)} ` +
        '(must be one of light/standard/parent; defaults to standard)',
    )
  }
  return mode
}

/**
 * 解析 create 的 autonomy 入参（内部）：缺省/空串视为 manual；
 * manual/semi/auto 三值放行；其他取值 fail loud（schema 校验报可判定错误）。
 * @param autonomy 工具入参原值
 * @returns 归一后的自治度
 */
function resolveCreateAutonomy(autonomy: string | undefined): AutonomyValue {
  if (autonomy === undefined || autonomy === '') return AUTONOMY.MANUAL
  if (autonomy !== AUTONOMY.MANUAL && autonomy !== AUTONOMY.SEMI && autonomy !== AUTONOMY.AUTO) {
    throw new Error(
      `${ERR_PREFIX.taskTool}: invalid autonomy: ${JSON.stringify(autonomy)} ` +
        '(must be one of manual/semi/auto; defaults to manual)',
    )
  }
  return autonomy
}

/* ---------------- autonomy 切换 ---------------- */

/** workloom_task_autonomy 工具编排入参（taskPath 缺省取活跃任务）。 */
export interface ExecuteSetAutonomyParams {
  taskPath?: string
  /** 目标自治度（manual/semi/auto，必填）。 */
  autonomy: string
}

/** autonomy 切换成功结果。 */
export interface ExecuteSetAutonomyResult {
  taskRelPath: string
  task: TaskView
}

/**
 * autonomy 切换工具编排：三值互切均允许，切换记录带时间戳（autonomyLog 留痕）；
 * 只影响未发生的确认迁移（已记录的确认不追溯改变）。
 * @param cwd 会话工作目录
 * @param contextKey 会话标识（adapter 组装）
 * @param params 工具参数
 * @returns [err, result]：err 为任一失败（消息含前缀）
 */
export function executeSetAutonomy(
  cwd: string,
  contextKey: string,
  params: ExecuteSetAutonomyParams,
): [Error | null, ExecuteSetAutonomyResult | null] {
  try {
    requireWorkloomCwd(cwd)
    const taskRelPath = resolveTaskRelPath(cwd, contextKey, params.taskPath, ERR_PREFIX.taskTool)
    const autonomy = resolveCreateAutonomy(params.autonomy)
    const [err, view] = setAutonomy(cwd, taskRelPath, autonomy)
    if (err !== null || view === null) {
      throw err ?? new Error(`${ERR_PREFIX.taskTool}: autonomy returned no result`)
    }
    return [null, { taskRelPath, task: view }]
  } catch (error) {
    return [toError(error), null]
  }
}

/**
 * 切换任务自治度（生命周期口）：写入 task.json autonomy 并向 autonomyLog 追加
 * 带时间戳的切换记录；同值切换幂等成功（不追加留痕）。
 * @param root 项目根
 * @param taskRelPath 任务目录相对 .workloom 的路径
 * @param autonomy 目标自治度
 * @returns [err, view]
 */
export function setAutonomy(
  root: string,
  taskRelPath: string,
  autonomy: AutonomyValue,
): [Error | null, TaskView | null] {
  try {
    const projectRoot = requireProjectRoot(root)
    const record = requireTaskRecord(projectRoot, taskRelPath)
    const view = toTaskView(record, taskRelPath)
    if (view.autonomy === autonomy) {
      return [null, view]
    }
    record.autonomy = autonomy
    record.autonomyLog = [
      ...(Array.isArray(record.autonomyLog) ? record.autonomyLog : []),
      { at: new Date().toISOString(), from: view.autonomy, to: autonomy },
    ]
    writeTaskRecord(projectRoot, taskRelPath, record)
    return [null, toTaskView(record, taskRelPath)]
  } catch (error) {
    return [toError(error), null]
  }
}

/* ---------------- start ---------------- */

/** startTask 参数（生命周期口）。 */
export interface StartTaskParams {
  taskRelPath: string
  contextKey?: string
  /** 豁免 start 门禁（留痕 overrides）。 */
  force?: boolean
  /** force 豁免原因（审计用）。 */
  reason?: string
}

/** startTask 返回的任务视图（planning → in_progress）。 */
export type StartedTaskRecord = TaskView

/**
 * 启动任务：planning → in_progress，可选激活会话并执行 after_start hooks。
 * @param root 项目根
 * @param params 启动参数
 * @returns [err, view]
 */
export async function startTask(
  root: string,
  params: StartTaskParams,
): Promise<[Error | null, StartedTaskRecord | null]> {
  try {
    return [null, await startTaskInternal(root, params)]
  } catch (error) {
    return [toError(error), null]
  }
}

/**
 * 启动任务（内部实现；过渡期消费旧门禁，步骤 3 收编为状态机迁移入口）。
 * @param root 项目根
 * @param params 启动参数
 * @returns 启动后的任务视图
 */
async function startTaskInternal(root: string, params: StartTaskParams): Promise<StartedTaskRecord> {
  const projectRoot = requireProjectRoot(root)
  const record = requireTaskRecord(projectRoot, params.taskRelPath)
  const view = toTaskView(record, params.taskRelPath)
  if (view.status !== TaskStatus.PLANNING) {
    throw new Error(
      `${TASK_ERR_PREFIX}: only tasks in planning state can be started (current: ${view.status})`,
    )
  }
  // force 契约（与旧门禁口一致）：force=true 恒要求非空 reason，无论是否有实际拦截。
  if (params.force === true) assertTaskForceReason(params.reason)
  // 目标阶段按模式查表：parent 进入编排期，其余进入实现期。
  const to = view.mode === MODES.PARENT ? STAGES.ORCHESTRATING : STAGES.IMPLEMENTING
  const forceOpts = {
    ...(params.force !== undefined ? { force: params.force } : {}),
    ...(params.reason !== undefined ? { reason: params.reason } : {}),
  }
  // 守卫干跑（查表 + force 判定）：失败即中止——worktree 与任务记录均未触碰
  // （零部分状态；force reason 缺失也在此拦截，与旧门禁口口径一致）。
  const [gateErr] = evaluateTransition(root, params.taskRelPath, to, forceOpts)
  if (gateErr !== null) throw gateErr
  // worktree 创建（插在守卫合流后、状态写盘前）：任一失败抛错即中止，
  // branch/base_branch/worktree_path 与迁移同一次落盘（经 migrateTask 的 patch）。
  const config = loadConfig(projectRoot)
  const patch: Partial<TaskRecord> = {}
  if (config.worktree.enabled) {
    if (!record.package) {
      throw new Error(
        `${TASK_ERR_PREFIX}: task has no package; edit .workloom/${params.taskRelPath}/task.json ` +
          'and set "package" to a declared packages key before start',
      )
    }
    const [wtErr, wt] = await createTaskWorktree(projectRoot, view, params.taskRelPath, config)
    if (wt === null) {
      throw wtErr ?? new Error(`${TASK_ERR_PREFIX}: worktree creation returned no result`)
    }
    patch.branch = wt.branch
    patch.base_branch = wt.baseBranch
    patch.worktree_path = wt.worktreePath
  }
  // 完整任务进入实现期即启用新 CASE 通过条件（新记录只含 required/designSession，
  // 旧任务的历史字段原样保留但不参与新逻辑；轻量任务无 CASE 流程，保持 null）。
  if (view.mode !== MODES.LIGHT) {
    patch.case = createCaseRecord(true, record.case)
  }
  const [migErr, migrated] = migrateTask(root, { taskRelPath: params.taskRelPath, to, ...forceOpts, patch })
  if (migErr !== null || migrated === null) {
    throw migErr ?? new Error(`${TASK_ERR_PREFIX}: start transition returned no result`)
  }
  if (params.contextKey !== undefined) {
    const [ptrErr] = setActiveTask(projectRoot, params.contextKey, params.taskRelPath)
    if (ptrErr) throw ptrErr
  }
  const taskJsonPath = join(insideWorkloom(projectRoot, params.taskRelPath), FILE_NAMES.taskJson)
  const warnings = await runTaskHooks(projectRoot, taskJsonPath, migrated.view.hooks.after_start)
  logWarnings(warnings)
  return migrated.view
}

/* ---------------- check ---------------- */

/** checkTask 参数（生命周期口）。 */
export interface CheckTaskParams {
  taskRelPath: string
  /** 2.2 check 通过摘要（必填非空）。 */
  summary?: string
  /** 豁免 check 门禁（留痕 overrides；仅在实际绕过 gate 时记录）。 */
  force?: boolean
  /** force 豁免原因（force=true 时必填非空，审计用）。 */
  reason?: string
}

/**
 * 记录 2.2 check 通过凭据（task.json check 字段，同步）。
 * 前置：in_progress、summary 非空；force 豁免见 checkTaskInternal。
 * @param root 项目根
 * @param params check 参数
 * @returns [err, view]
 */
export function checkTask(
  root: string,
  params: CheckTaskParams,
): [Error | null, TaskView | null] {
  try {
    return [null, checkTaskInternal(root, params)]
  } catch (error) {
    return [toError(error), null]
  }
}

/**
 * 记录 2.2 check 凭据（内部实现）：
 * - in_progress + summary 非空为硬前置；
 * - 门禁面：CASE 结果门禁（硬拦，不可 force）+ check.jsonl 有效记录 +
 *   frontend 派发门禁（非 force 求值并拦截）；force 放行须按实际绕过的 gate 留痕。
 * @param root 项目根
 * @param params check 参数
 * @returns 写入凭据后的任务视图
 */
function checkTaskInternal(root: string, params: CheckTaskParams): TaskView {
  const projectRoot = requireProjectRoot(root)
  const record = requireTaskRecord(projectRoot, params.taskRelPath)
  const view = toTaskView(record, params.taskRelPath)
  if (view.status !== TaskStatus.IN_PROGRESS) {
    throw new Error(
      `${TASK_ERR_PREFIX}: only tasks in in_progress can record a check (current: ${view.status})`,
    )
  }
  // 局部收窄：属性访问在门禁调用间不保持窄化，summary 先取到局部变量。
  const summary = params.summary
  if (typeof summary !== 'string' || summary.trim() === '') {
    throw new Error(`${TASK_ERR_PREFIX}: checkTask requires a non-empty summary`)
  }
  // force 契约（与旧门禁口一致）：force=true 恒要求非空 reason。
  if (params.force === true) assertTaskForceReason(params.reason)
  const ctx = { root: projectRoot, taskRelPath: params.taskRelPath }
  // CASE 核心门禁（不可 force）：CASE 文档/会话链/RESULT 实质校验不过一律拒绝写凭据。
  const [outcomeErr, outcomeReason] = evaluateGuard('case-outcome-ready', view, ctx)
  if (outcomeErr !== null) {
    throw new Error(
      `${TASK_ERR_PREFIX}: CASE gate failed: ${outcomeReason ?? outcomeErr.message} ` +
        '(core CASE failures cannot be bypassed with force)',
    )
  }
  const forced = params.force === true
  const credential = { passedAt: new Date().toISOString(), summary }
  // 完整任务首次 check：经迁移表进入 checking（case-approved 硬拦未批 CASE；
  // check-ready 与 ui-dispatch-ready 可 force 豁免并随迁移原子留痕）。
  if (view.mode === MODES.STANDARD && view.stage === STAGES.IMPLEMENTING) {
    const [migErr, migrated] = migrateTask(root, {
      taskRelPath: params.taskRelPath,
      to: STAGES.CHECKING,
      ...(forced ? { force: true, reason: params.reason } : {}),
      patch: { check: credential },
    })
    if (migErr !== null || migrated === null) {
      throw migErr ?? new Error(`${TASK_ERR_PREFIX}: check transition returned no result`)
    }
    return migrated.view
  }
  // 复查/轻量/容器路径：无主线迁移，守卫求值后经存储层写凭据。
  const missing: string[] = []
  for (const key of ['check-ready', 'ui-dispatch-ready'] as const) {
    const [guardErr, reason] = evaluateGuard(key, view, ctx)
    if (guardErr !== null) missing.push(reason ?? guardErr.message)
  }
  if (missing.length > 0) {
    if (!forced) {
      throw new Error(
        `${TASK_ERR_PREFIX}: check gate failed: ${missing.join('; ')} ` +
          '(pass force: true with a non-empty reason to bypass; the bypass is recorded in task.json overrides)',
      )
    }
    assertTaskForceReason(params.reason)
    // override 留痕经 dispatch-records（凭据写入前记录，失败即中止不留半状态凭据）。
    const [ovErr] = recordGateOverride(projectRoot, params.taskRelPath, OVERRIDE_GATES.CHECK, params.reason)
    if (ovErr !== null) throw ovErr
  }
  record.check = credential
  writeTaskRecord(projectRoot, params.taskRelPath, record)
  return toTaskView(record, params.taskRelPath)
}

/**
 * 校验 force 豁免 reason（内部）：force=true 必须带非空 reason，
 * 否则抛错（force 路径只留痕、绝不写确认凭据）。
 * @param reason 豁免原因
 */
function assertTaskForceReason(reason: string | undefined): void {
  if (typeof reason !== 'string' || reason.trim() === '') {
    throw new Error(
      `${TASK_ERR_PREFIX}: force: true requires a non-empty reason (the override is recorded in task.json overrides)`,
    )
  }
}

/* ---------------- finish ---------------- */

/** finishTask 参数（生命周期口）。 */
export interface FinishTaskParams {
  taskRelPath: string
  contextKey?: string
}

/**
 * 结束任务会话：清指针（若该 contextKey 指向本任务）并执行 after_finish hooks；不改状态。
 * @param root 项目根
 * @param params finish 参数
 * @returns [err]
 */
export async function finishTask(root: string, params: FinishTaskParams): Promise<[Error | null]> {
  try {
    const projectRoot = requireProjectRoot(root)
    const record = requireTaskRecord(projectRoot, params.taskRelPath)
    if (params.contextKey !== undefined) {
      const [ptrErr, current] = resolveActiveTask(projectRoot, params.contextKey)
      if (ptrErr) throw ptrErr
      if (current === params.taskRelPath) {
        const [clearErr] = clearActiveTask(projectRoot, params.contextKey)
        if (clearErr) throw clearErr
      }
    }
    const taskJsonPath = join(insideWorkloom(projectRoot, params.taskRelPath), FILE_NAMES.taskJson)
    const warnings = await runTaskHooks(projectRoot, taskJsonPath, record.hooks.after_finish)
    logWarnings(warnings)
    return [null]
  } catch (error) {
    return [toError(error)]
  }
}

/* ---------------- archive ---------------- */

/** archiveTask 参数（生命周期口）。 */
export interface ArchiveTaskParams {
  taskRelPath: string
  autoCommit?: boolean
  /** 豁免 archive 门禁（留痕 overrides）。 */
  force?: boolean
  /** force 豁免原因（审计用）。 */
  reason?: string
}

/**
 * 归档任务结果（三元组）：成功时第三元素为 worktree 清理摘要（cleanup 内的
 * rebased/merged/gitlinkCommitted/worktreeRemoved/branchDeleted/skipped，供
 * archive 回执展示）；失败时第三元素缺省。
 */
export type ArchiveTaskResult = [Error | null, TaskView | null, CleanupTaskWorktreeResult?]

/**
 * 归档任务：清理任务 worktree（失败即阻断）、置 completed、移动目录、清理会话指针、
 * 执行 after_archive hooks，可选 git 自动提交。
 * @param root 项目根
 * @param params 归档参数
 * @returns 三元组 [err, 归档后视图, worktree 清理摘要]
 */
export async function archiveTask(root: string, params: ArchiveTaskParams): Promise<ArchiveTaskResult> {
  try {
    const { view, worktreeCleanup } = await archiveTaskInternal(root, params)
    return [null, view, worktreeCleanup]
  } catch (error) {
    return [toError(error), null]
  }
}

/**
 * 归档任务（内部实现；过渡期消费旧门禁，步骤 3 收编为状态机迁移入口）。
 * @param root 项目根
 * @param params 归档参数
 * @returns 归档后视图与 worktree 清理摘要
 */
async function archiveTaskInternal(
  root: string,
  params: ArchiveTaskParams,
): Promise<{ view: TaskView; worktreeCleanup: CleanupTaskWorktreeResult }> {
  const projectRoot = requireProjectRoot(root)
  const record = requireTaskRecord(projectRoot, params.taskRelPath)
  const view = toTaskView(record, params.taskRelPath)
  const forced = params.force === true
  // force 契约（与旧门禁口一致）：force=true 恒要求非空 reason。
  if (forced) assertTaskForceReason(params.reason)
  // 守卫干跑先于任何写盘（查表：归档出口边任意在档阶段直达 archived；
  // parent integrating→archived）：case-outcome/integration-case 硬拦，archive-ready
  // 可 force 豁免；force reason 缺失在此拦截。
  const [evalErr, evaluation] = evaluateTransition(root, params.taskRelPath, STAGES.ARCHIVED, {
    ...(forced ? { force: true, reason: params.reason } : {}),
  })
  if (evalErr !== null || evaluation === null) {
    throw evalErr ?? new Error(`${TASK_ERR_PREFIX}: archive transition returned no evaluation`)
  }
  // 先查冲突再动手：避免改完状态后因冲突失败留下半完成态。
  const now = new Date()
  const archiveRel = archiveRelPathOf(record.name, now)
  if (existsSync(insideWorkloom(projectRoot, archiveRel))) {
    throw new Error(`${TASK_ERR_PREFIX}: archive target already exists: ${archiveRel}`)
  }
  // worktree 清理（插在冲突检查后、rename 不可逆点前）：清理失败即阻断 archive
  // ——不改 status、不移动目录、不 autoCommit；gitlink 提交已在 cleanup 内独立
  // 完成（fail loud）。清理成功但后续 rename 失败 → 接受「worktree 已删、任务
  // 未归档」中间态（重跑时 cleanup 步骤幂等）。
  const worktreeConfig = loadConfig(projectRoot)
  const [wtErr, worktreeCleanup] = await cleanupTaskWorktree(projectRoot, view, worktreeConfig)
  if (worktreeCleanup === null) {
    throw wtErr ?? new Error(`${TASK_ERR_PREFIX}: worktree cleanup returned no result`)
  }
  // 先移动、再在归档位置改状态：任一写盘失败都不会把原目录改成 completed。
  const [moveErr, archiveDir] = moveTaskToArchive(projectRoot, params.taskRelPath, archiveRel)
  if (moveErr !== null || archiveDir === null) {
    throw moveErr ?? new Error(`${TASK_ERR_PREFIX}: archive move returned no directory`)
  }
  // 归档态落盘：status/stage/completedAt 与兼容读归一的 casePhase 同一次写入；
  // force 豁免的 override 留痕经 dispatch-records 追加写（审计口单一）。
  record.status = TaskStatus.COMPLETED
  record.completedAt = now.toISOString()
  record.stage = STAGES.ARCHIVED
  if (record.case !== null) {
    record.case = { ...record.case, phase: view.casePhase }
  }
  writeTaskRecordToDir(archiveDir, record)
  for (const gate of evaluation.bypassedGates) {
    const [ovErr] = recordGateOverride(projectRoot, archiveRel, gate, params.reason)
    if (ovErr !== null) throw ovErr
  }
  const [ptrErr] = clearPointersToTask(projectRoot, params.taskRelPath)
  if (ptrErr) throw ptrErr
  const warnings = await runTaskHooks(
    projectRoot,
    join(archiveDir, FILE_NAMES.taskJson),
    record.hooks.after_archive,
  )
  warnings.push(
    ...(await autoCommitIfEnabled(projectRoot, params.autoCommit, record.name, [
      // 收窄暂存：仅本任务移动前路径（删除）与归档后路径（新增），指针文件
      // 位于 gitignore 的 .runtime/，无需暂存；路径均相对项目根供 git 消费。
      join(WORKLOOM_DIR, params.taskRelPath),
      join(WORKLOOM_DIR, archiveRel),
    ])),
  )
  logWarnings(warnings)
  // 返回归档后的新路径视图（重读落盘结果，override 留痕经 dispatch-records
  // 追加写，内存副本不含），避免调用方拿着旧路径或过期字段继续操作。
  const saved = requireTaskRecord(projectRoot, archiveRel)
  return { view: toTaskView(saved, archiveRel), worktreeCleanup }
}

/**
 * 按配置决定是否 git 自动提交归档（git 失败只告警，不阻塞）。
 * 暂存范围由调用方枚举收窄，其他在途任务的脏文件零接触。
 * @param root 项目根
 * @param autoCommit 显式开关
 * @param slug 任务 slug（提交信息用）
 * @param paths 相对项目根的待暂存路径列表（归档删除/新增两侧）
 * @returns WARNING 消息列表
 */
async function autoCommitIfEnabled(
  root: string,
  autoCommit: boolean | undefined,
  slug: string,
  paths: string[],
): Promise<string[]> {
  const enabled = autoCommit ?? loadConfig(root).sessionAutoCommit
  if (!enabled) return []
  const [gitErr] = await gitAddCommit(root, `${ARCHIVE_COMMIT_PREFIX} ${slug}`, paths)
  if (gitErr) return [`git auto-commit failed (archival proceeds anyway): ${gitErr.message}`]
  return []
}

/* ---------------- 工具编排（start/check/finish/archive/list） ---------------- */

/** start 工具编排入参（force 豁免 start 门禁并留痕）。 */
export interface ExecuteStartTaskParams {
  taskPath?: string
  force?: boolean
  reason?: string
}

/**
 * start 工具编排：把任务从 planning 移到 in_progress。
 * 默认硬阻断：prd 小节未填、PLAN 结构/确认缺失、jsonl 无有效记录、PRD 内容
 * 未确认时拒绝；force 豁免需非空 reason 并按实际绕过的 gate 留痕。
 * @param cwd 会话工作目录
 * @param contextKey 会话标识（adapter 组装）
 * @param params 工具参数（taskPath 缺省取活跃任务）
 * @returns [err, task]：err 为任一失败（消息含前缀）
 */
export async function executeStartTask(
  cwd: string,
  contextKey: string,
  params: ExecuteStartTaskParams,
): Promise<[Error | null, StartedTaskRecord | null]> {
  try {
    requireWorkloomCwd(cwd)
    const taskRelPath = resolveTaskRelPath(cwd, contextKey, params.taskPath, ERR_PREFIX.taskTool)
    const [err, task] = await startTask(cwd, {
      taskRelPath,
      contextKey,
      ...forceOverride(params),
    })
    if (err !== null || task === null) {
      throw err ?? new Error(`${ERR_PREFIX.taskTool}: start returned no result`)
    }
    return [null, task]
  } catch (error) {
    return [toError(error), null]
  }
}

/** check 工具编排入参（summary 为 2.2 通过摘要）。 */
export interface ExecuteCheckTaskParams {
  taskPath?: string
  /** 2.2 check 通过摘要。 */
  summary?: string
  force?: boolean
  reason?: string
}

/**
 * check 工具编排：记录 2.2 check 通过凭据（task.json check）。
 * @param cwd 会话工作目录
 * @param contextKey 会话标识（adapter 组装）
 * @param params 工具参数（taskPath 缺省取活跃任务）
 * @returns [err, task]：err 为任一失败（消息含前缀）
 */
export function executeCheckTask(
  cwd: string,
  contextKey: string,
  params: ExecuteCheckTaskParams,
): [Error | null, TaskView | null] {
  try {
    requireWorkloomCwd(cwd)
    const taskRelPath = resolveTaskRelPath(cwd, contextKey, params.taskPath, ERR_PREFIX.taskTool)
    const [err, task] = checkTask(cwd, {
      taskRelPath,
      ...(params.summary !== undefined ? { summary: params.summary } : {}),
      ...forceOverride(params),
    })
    if (err !== null || task === null) {
      throw err ?? new Error(`${ERR_PREFIX.taskTool}: check returned no result`)
    }
    return [null, task]
  } catch (error) {
    return [toError(error), null]
  }
}

/** finish 工具成功结果（finished 恒 true，供 adapter 投影）。 */
export interface ExecuteFinishTaskResult {
  taskRelPath: string
  finished: boolean
}

/**
 * finish 工具编排：清除会话活跃任务指针（任务状态不变）。
 * @param cwd 会话工作目录
 * @param contextKey 会话标识（adapter 组装）
 * @param taskPath 显式任务路径（可选，缺省取活跃任务）
 * @returns [err, result]：err 为任一失败（消息含前缀）
 */
export async function executeFinishTask(
  cwd: string,
  contextKey: string,
  taskPath: string | undefined,
): Promise<[Error | null, ExecuteFinishTaskResult | null]> {
  try {
    requireWorkloomCwd(cwd)
    const taskRelPath = resolveTaskRelPath(cwd, contextKey, taskPath, ERR_PREFIX.taskTool)
    const [err] = await finishTask(cwd, { taskRelPath, contextKey })
    if (err !== null) throw err
    return [null, { taskRelPath, finished: true }]
  } catch (error) {
    return [toError(error), null]
  }
}

/** archive 工具成功结果（note 为收尾提示文案；worktreeCleanup 为 worktree 清理摘要）。 */
export interface ExecuteArchiveTaskResult {
  taskRelPath: string
  task: TaskView
  note: string
  /** 本次归档的 worktree 清理摘要（rebased/merged/gitlinkCommitted/worktreeRemoved/branchDeleted/skipped）。 */
  worktreeCleanup?: CleanupTaskWorktreeResult
}

/** archive 工具编排入参（taskPath 必填；force 豁免 archive 门禁并留痕）。 */
export interface ExecuteArchiveTaskParams {
  /** 任务目录相对 .workloom 的路径（必填，不回退活跃任务）。 */
  taskPath: string
  autoCommit?: boolean
  force?: boolean
  reason?: string
}

/**
 * archive 工具编排：归档任务（completed + 移入 archive/，可选 git 自动提交）。
 * 默认硬阻断：task.json 无 check 凭据时拒绝；force 豁免并留痕。
 * @param cwd 会话工作目录
 * @param params 工具参数（taskPath 必填）
 * @returns [err, result]：err 为任一失败（消息含前缀）
 */
export async function executeArchiveTask(
  cwd: string,
  params: ExecuteArchiveTaskParams,
): Promise<[Error | null, ExecuteArchiveTaskResult | null]> {
  try {
    requireWorkloomCwd(cwd)
    const taskRelPath = requireTaskRelPath(params.taskPath, ERR_PREFIX.taskTool)
    const [err, task, worktreeCleanup] = await archiveTask(cwd, {
      taskRelPath,
      ...(params.autoCommit !== undefined ? { autoCommit: params.autoCommit } : {}),
      ...forceOverride(params),
    })
    if (err || task === null) {
      throw err ?? new Error(`${ERR_PREFIX.taskTool}: archive returned no result`)
    }
    return [
      null,
      {
        taskRelPath: task.taskRelPath,
        task,
        note: TASK_ARCHIVE_NOTE,
        ...(worktreeCleanup !== undefined ? { worktreeCleanup } : {}),
      },
    ]
  } catch (error) {
    return [toError(error), null]
  }
}

/** list 工具成功结果（tasks 为摘要数组）。 */
export interface ExecuteListTasksResult {
  tasks: TaskSummary[]
}

/**
 * list 工具编排：列出任务摘要（可选 status 过滤，空串视为未指定）。
 * @param cwd 会话工作目录
 * @param status 状态过滤（可选）
 * @returns [err, result]：err 为任一失败（消息含前缀）
 */
export async function executeListTasks(
  cwd: string,
  status: string | undefined,
): Promise<[Error | null, ExecuteListTasksResult | null]> {
  try {
    requireWorkloomCwd(cwd)
    const [err, tasks] = listTasks(cwd, {
      ...(status !== undefined && status !== '' ? { status: status as TaskStatusValue } : {}),
    })
    if (err || tasks === null) {
      throw err ?? new Error(`${ERR_PREFIX.taskTool}: list returned no result`)
    }
    return [null, { tasks }]
  } catch (error) {
    return [toError(error), null]
  }
}

/** 提取 force/reason 豁免入参（内部：空串 reason 不传）。 */
function forceOverride(params: { force?: boolean; reason?: string }): {
  force?: boolean
  reason?: string
} {
  return {
    ...(params.force !== undefined ? { force: params.force } : {}),
    ...(typeof params.reason === 'string' && params.reason !== '' ? { reason: params.reason } : {}),
  }
}

/** 把任意异常归一为 Error（内部）。 */
function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value))
}
