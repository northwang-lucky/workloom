/**
 * alignment-service：workloom_task_align 工具的 runtime 无关编排（TypeScript）。
 * PRD 与 PLAN 分阶段内容确认的 review/confirm 两步协议与结构校验的「服务编排」。
 *
 * 设计意图：
 * - review 只读：按 target 返回 PRD 或 PLAN 的内容快照、结构诊断与现有确认记录
 *   （零写盘）；不完整的草稿照样可读，就绪与否由 readyToConfirm 表达；
 * - confirm 同步全链路：内容 blocker（复用 task-gates 的结构分类器）聚合拒绝
 *   → summary 非空 → 只经 task-store 的窄写口原子落盘（PRD 用
 *   recordAlignmentCredential，PLAN 用 recordPlanConfirmation）；确认记录只含
 *   passedAt 与 summary，无哈希，每次确认都刷新为最近一次；
 * - PLAN 确认要求 PRD 已有确认记录（顺序前置在窄写口硬校验，R3）；
 * - cwd/root/task 解析与 task-ops 同款（requireWorkloomCwd + resolveTaskRelPath +
 *   findWorkloomRoot），adapter 只负责投影返回与主会话限制。
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { inspectPlanStructure, inspectPrdStructure, PRD_MISSING } from '../domain/task-gates.js'
import { findWorkloomRoot, insideWorkloom } from '../domain/locate.js'
import { readTask, recordAlignmentCredential, recordPlanConfirmation } from '../domain/task-store.js'
import { ERR_PREFIX } from '../surface.js'
import { requireWorkloomCwd, resolveTaskRelPath } from './task-ops.js'

import type {
  TaskAlignmentRecord,
  TaskPlanConfirmationRecord,
  TaskRecordWithPath,
  TaskStatusValue,
} from '../domain/task-store.d.ts'

/** task 目录内 prd/plan 文件名（与 task-store 数据布局一致）。 */
const PRD_FILE = 'prd.md'
const PLAN_FILE = 'plan.md'

/** 确认对象：prd（缺省，兼容旧调用）或 plan。 */
export type AlignTarget = 'prd' | 'plan'

/** 结构诊断的公共形态（PRD 与 PLAN 结构分类器产物形状一致，section 字段可选）。 */
export type ConfirmStructureIssue = { code: string; message: string }

/** confirm 聚合内容 blocker 的消息标题（失败仍只抛一个 Error）。 */
const PRD_BLOCKERS_PREFIX = 'prd.md content blockers:'
const PLAN_BLOCKERS_PREFIX = 'plan.md content blockers:'

/**
 * review 成功结果：内容快照 + 结构诊断 + 现有确认记录（零写盘）。
 * target=prd 时只填 prd 侧字段；target=plan 时 plan 为 PLAN 快照，
 * 结构问题来自 PLAN 分类器（PLAN 缺失同样以结构问题表达，不报错）。
 */
export interface AlignReviewResult {
  action: 'review'
  target: AlignTarget
  taskRelPath: string
  status: TaskStatusValue
  prd: string | null
  /** target=plan 时的 PLAN 快照；target=prd 恒为 null。 */
  plan: string | null
  /** 当前确认对象的结构问题（PRD：H1 → 骨架小节 → R/AC 追踪；PLAN：标题/Steps/字段/AC 覆盖）。 */
  structureIssues: ConfirmStructureIssue[]
  /** structureIssues 的英文文案投影，供主会话直接展示。 */
  confirmBlockers: string[]
  /** 严格等价于 structureIssues 为空：只表达内容级 confirm 前置条件。 */
  readyToConfirm: boolean
  alignment: TaskAlignmentRecord | null
  planConfirmation: TaskPlanConfirmationRecord | null
}

/** PRD confirm 成功结果：写入后的 PRD 确认记录。 */
export interface PrdConfirmResult {
  action: 'confirm'
  target: 'prd'
  taskRelPath: string
  alignment: TaskAlignmentRecord
  planConfirmation: null
}

/** PLAN confirm 成功结果：写入后的 PLAN 确认记录。 */
export interface PlanConfirmResult {
  action: 'confirm'
  target: 'plan'
  taskRelPath: string
  alignment: null
  planConfirmation: TaskPlanConfirmationRecord
}

/** confirm 成功结果（target 二态）。 */
export type AlignConfirmResult = PrdConfirmResult | PlanConfirmResult

/** executeAlignTask 入参（taskPath 缺省取活跃任务）。 */
export interface ExecuteAlignTaskParams {
  taskPath?: string
  /** 确认对象：prd（缺省，兼容旧调用）或 plan。 */
  target?: AlignTarget
  /** review 只读返回内容快照与诊断；confirm 校验后写入确认记录。 */
  action: 'review' | 'confirm'
  /** confirm 必填：内容确认摘要（覆盖范围、关键决策与确认结果）。 */
  summary?: string
}

/** 工具成功结果（review/confirm 两态）。 */
export type ExecuteAlignTaskResult = AlignReviewResult | AlignConfirmResult

/**
 * 执行 workloom_task_align 编排（全程同步）。
 * @param cwd 会话工作目录
 * @param contextKey 会话标识（taskPath 缺省时取活跃任务）
 * @param params 工具参数
 * @returns [err, result]：err 为任一失败（消息含前缀；失败零写入）
 */
export function executeAlignTask(
  cwd: string,
  contextKey: string,
  params: ExecuteAlignTaskParams,
): [Error | null, ExecuteAlignTaskResult | null] {
  try {
    return [null, executeAlignInternal(cwd, contextKey, params)]
  } catch (error) {
    return [toError(error), null]
  }
}

/**
 * align 编排实现（内部）：任一失败抛错，由外层转元组。
 * @param cwd 会话工作目录
 * @param contextKey 会话标识
 * @param params 工具参数
 * @returns 编排结果（review/confirm 两态）
 */
function executeAlignInternal(
  cwd: string,
  contextKey: string,
  params: ExecuteAlignTaskParams,
): ExecuteAlignTaskResult {
  requireWorkloomCwd(cwd)
  const taskRelPath = resolveTaskRelPath(cwd, contextKey, params.taskPath, ERR_PREFIX.taskTool)
  const root = requireProjectRoot(cwd)
  // 任务记录：确认记录与状态来自 task.json 归一化读取（门禁对旧数据安全）。
  const [taskErr, task] = readTask(root, taskRelPath)
  if (taskErr !== null || task === null) {
    throw taskErr ?? new Error(`${ERR_PREFIX.taskTool}: read returned no task: ${taskRelPath}`)
  }
  // target 缺省 prd（兼容旧调用）；非法取值按缺省处理与参数描述口径一致。
  const target: AlignTarget = params.target === 'plan' ? 'plan' : 'prd'
  if (params.action === 'review') {
    return reviewAlign(root, taskRelPath, task, target)
  }
  return target === 'plan'
    ? confirmPlanAlign(root, taskRelPath, params)
    : confirmPrdAlign(root, taskRelPath, params)
}

/**
 * review 编排：读确认对象文档（缺失以结构问题表达，不报错——模型据此判断
 * 文档还没写），附结构诊断与现有确认记录；零写盘。
 * @param root 项目根
 * @param taskRelPath 任务目录相对 .workloom 的路径
 * @param task 归一化后的任务记录
 * @param target 确认对象
 * @returns review 结果
 */
function reviewAlign(
  root: string,
  taskRelPath: string,
  task: TaskRecordWithPath,
  target: AlignTarget,
): AlignReviewResult {
  const prd = readPrd(root, taskRelPath)
  const plan = target === 'plan' ? readPlan(root, taskRelPath) : null
  // PLAN 结构校验以 prd 的 AC 清单为基准：prd 缺失时直接复用 PRD 分类器报缺失。
  const structureIssues: ConfirmStructureIssue[] =
    target === 'plan'
      ? prd === null
        ? inspectPrdStructure(prd)
        : inspectPlanStructure(plan, prd)
      : inspectPrdStructure(prd)
  return {
    action: 'review',
    target,
    taskRelPath,
    status: task.status,
    prd,
    plan,
    structureIssues,
    confirmBlockers: structureIssues.map((issue) => issue.message),
    readyToConfirm: structureIssues.length === 0,
    alignment: task.alignment,
    planConfirmation: task.planConfirmation,
  }
}

/**
 * PRD confirm 编排：前置校验全部通过才写确认记录（失败零写入）。
 * 校验顺序固定：prd 内容 blocker（分类器聚合）→ summary 非空 → 窄写口原子落盘。
 * @param root 项目根
 * @param taskRelPath 任务目录相对 .workloom 的路径
 * @param params 工具参数
 * @returns PRD confirm 结果
 */
function confirmPrdAlign(
  root: string,
  taskRelPath: string,
  params: ExecuteAlignTaskParams,
): PrdConfirmResult {
  const prd = readPrd(root, taskRelPath)
  if (prd === null) {
    throw new Error(`${ERR_PREFIX.taskTool}: confirm rejected: ${PRD_MISSING}`)
  }
  // 内容 blocker 一次取全（H1 → 骨架小节 → R/AC 追踪），仍只抛一个 Error。
  const blockers = inspectPrdStructure(prd).map((issue) => issue.message)
  if (blockers.length > 0) {
    throw new Error(
      `${ERR_PREFIX.taskTool}: confirm rejected: ${PRD_BLOCKERS_PREFIX}\n` +
        blockers.map((blocker) => `- ${blocker}`).join('\n'),
    )
  }
  const summary = requireConfirmSummary(params)
  const [err, saved] = recordAlignmentCredential(root, taskRelPath, { summary })
  if (err !== null || saved === null || saved.alignment === null) {
    throw err ?? new Error(`${ERR_PREFIX.taskTool}: confirm returned no result`)
  }
  return {
    action: 'confirm',
    target: 'prd',
    taskRelPath,
    alignment: saved.alignment as TaskAlignmentRecord,
    planConfirmation: null,
  }
}

/**
 * PLAN confirm 编排：PLAN 结构校验通过 + summary 非空后写 PLAN 确认记录。
 * 「PRD 已确认」的顺序前置在窄写口硬校验（拒绝时指引先确认 PRD）。
 * @param root 项目根
 * @param taskRelPath 任务目录相对 .workloom 的路径
 * @param params 工具参数
 * @returns PLAN confirm 结果
 */
function confirmPlanAlign(
  root: string,
  taskRelPath: string,
  params: ExecuteAlignTaskParams,
): PlanConfirmResult {
  const prd = readPrd(root, taskRelPath)
  if (prd === null) {
    throw new Error(`${ERR_PREFIX.taskTool}: confirm rejected: ${PRD_MISSING}`)
  }
  const plan = readPlan(root, taskRelPath)
  // PLAN 缺失或结构不完整时一次返回全部结构问题（仍只抛一个 Error）。
  const blockers = inspectPlanStructure(plan, prd).map((issue) => issue.message)
  if (blockers.length > 0) {
    throw new Error(
      `${ERR_PREFIX.taskTool}: confirm rejected: ${PLAN_BLOCKERS_PREFIX}\n` +
        blockers.map((blocker) => `- ${blocker}`).join('\n'),
    )
  }
  const summary = requireConfirmSummary(params)
  const [err, saved] = recordPlanConfirmation(root, taskRelPath, { summary })
  if (err !== null || saved === null || saved.planConfirmation === null) {
    throw err ?? new Error(`${ERR_PREFIX.taskTool}: confirm returned no result`)
  }
  return {
    action: 'confirm',
    target: 'plan',
    taskRelPath,
    alignment: null,
    planConfirmation: saved.planConfirmation as TaskPlanConfirmationRecord,
  }
}

/**
 * 校验 confirm 必填的非空摘要（内部）：缺失或空白即拒绝。
 * @param params 工具参数
 * @returns trim 后的摘要
 */
function requireConfirmSummary(params: ExecuteAlignTaskParams): string {
  const summary = typeof params.summary === 'string' ? params.summary.trim() : ''
  if (summary === '') {
    throw new Error(
      `${ERR_PREFIX.taskTool}: confirm rejected: a non-empty summary is required ` +
        '(record the coverage, key decisions, and the confirmation result)',
    )
  }
  return summary
}

/**
 * 解析项目根（cwd 或其祖先含 .workloom；缺失抛错）。
 * @param cwd 会话工作目录
 * @returns 项目根绝对路径
 */
function requireProjectRoot(cwd: string): string {
  const found = findWorkloomRoot(cwd)
  if (found === null) {
    throw new Error(`${ERR_PREFIX.taskTool}: no .workloom directory found (searched up from ${cwd})`)
  }
  return found.root
}

/**
 * 读取任务文档全文（缺失返回 null）。
 * @param root 项目根
 * @param taskRelPath 任务目录相对 .workloom 的路径
 * @param fileName 文件名
 * @returns 文档全文或 null
 */
function readTaskDocument(root: string, taskRelPath: string, fileName: string): string | null {
  try {
    return readFileSync(join(insideWorkloom(root, taskRelPath), fileName), 'utf8')
  } catch (error) {
    if (isEnoent(error)) return null
    throw error
  }
}

/** @param root 项目根 @param taskRelPath 任务相对路径 @returns prd.md 全文或 null */
function readPrd(root: string, taskRelPath: string): string | null {
  return readTaskDocument(root, taskRelPath, PRD_FILE)
}

/** @param root 项目根 @param taskRelPath 任务相对路径 @returns plan.md 全文或 null */
function readPlan(root: string, taskRelPath: string): string | null {
  return readTaskDocument(root, taskRelPath, PLAN_FILE)
}

/** @param error 错误 @returns 是否文件不存在 */
function isEnoent(error: unknown): boolean {
  return (error as NodeJS.ErrnoException)?.code === 'ENOENT'
}

/** @param value 任意异常 @returns 归一化 Error */
function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value))
}
