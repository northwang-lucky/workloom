/**
 * doc-review：任务文档复核服务的 runtime 无关编排（TypeScript）。
 * workloom_task_align（PRD/PLAN review 与 confirm）与 workloom_task_case
 * （CASE review-only）共用同一编排模块，按 target 分段。
 *
 * 设计意图：
 * - align review 只读：按 target 返回 PRD 或 PLAN 的内容快照、结构诊断与现有
 *   确认记录（零写盘）；不完整的草稿照样可读，就绪与否由 readyToConfirm 表达；
 * - align confirm 同步全链路：内容 blocker（prd-structure 单一解析器）聚合拒绝
 *   → summary 非空 → 只经 task-store 的窄写口原子落盘（PRD 用
 *   recordAlignmentCredential，PLAN 用 recordPlanConfirmation）；确认记录只含
 *   passedAt 与 summary，无哈希，每次确认都刷新为最近一次；
 * - PLAN 确认要求 PRD 已有确认记录（顺序前置在窄写口硬校验，R3）；
 * - case review 只读：CASE 由主会话对照 PRD、PLAN 与实际代码复核；复核满意后
 *   直接续接同一 designSession 执行，不写任何复核凭证；
 * - cwd/root/task 解析与 task-ops 同款（requireWorkloomCwd + resolveTaskRelPath +
 *   findWorkloomRoot），adapter 只负责投影返回与主会话限制。
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { CASE_FILES, inspectCaseStructure } from './case-structure.ts'
import { listCaseChangedFiles } from './case-scope.ts'
import { inspectPlanStructure } from './task-gates.js'
import { PRD_MISSING, inspectPrdStructure } from './prd-structure.ts'
import type { CaseStructureIssue } from './case.d.ts'
import { findWorkloomRoot, insideWorkloom } from '../workspace/locate.js'
import { findArchivedTaskPath, readTask, recordAlignmentCredential, recordPlanConfirmation } from './task-store.js'
import { ERR_PREFIX } from '../injection/surface.ts'
import { requireWorkloomCwd, resolveTaskRelPath } from './task-ops.ts'

import type {
  TaskAlignmentRecord,
  TaskPlanConfirmationRecord,
  TaskRecordWithPath,
  TaskStatusValue,
} from './task-store.d.ts'

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

/** align 工具成功结果（review/confirm 两态）。 */
export type ExecuteAlignTaskResult = AlignReviewResult | AlignConfirmResult

/** case review 成功结果：CASE 内容 + 结构诊断 + 会话链现状（零写盘，无哈希）。 */
export interface CaseReviewResult {
  action: 'review'
  taskRelPath: string
  status: TaskStatusValue
  /** case.md 全文快照（缺失为 null，由结构问题表达）。 */
  case: string | null
  /** 当前 CASE 设计会话（未记录为 null；执行续接的定位依据）。 */
  designSession: string | null
  /** CASE 结构问题（顺序由分类器决定，一次返回全部）。 */
  structureIssues: CaseStructureIssue[]
  /** structureIssues 的英文文案投影，供主会话直接展示。 */
  blockers: string[]
  /** 严格等价于 structureIssues 为空：主会话复核的机器可读参考。 */
  readyForExecution: boolean
}

/** executeTaskCase 入参（taskPath 缺省取活跃任务）。 */
export interface ExecuteTaskCaseParams {
  taskPath?: string
  /** 只支持 review：复核诊断只读，不写任何记录。 */
  action: 'review'
}

/** case 工具成功结果（review 单态）。 */
export type ExecuteTaskCaseResult = CaseReviewResult

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
 * 执行 workloom_task_case 编排（全程同步，review-only）。
 * @param cwd 会话工作目录
 * @param contextKey 会话标识（taskPath 缺省时取活跃任务）
 * @param params 工具参数
 * @returns [err, result]：err 为任一失败（消息含前缀；失败零写入）
 */
export function executeTaskCase(
  cwd: string,
  contextKey: string,
  params: ExecuteTaskCaseParams,
): [Error | null, ExecuteTaskCaseResult | null] {
  try {
    requireWorkloomCwd(cwd)
    // 协议只保留 review：其他动作显式拒绝（无用户确认动作，也不写复核凭证）。
    if (params.action !== 'review') {
      throw new Error(
        `${ERR_PREFIX.taskTool}: only action=review is supported ` +
          '(the main session reviews the CASE and then continues the design session for execution)',
      )
    }
    const taskRelPath = resolveTaskRelPath(cwd, contextKey, params.taskPath, ERR_PREFIX.taskTool)
    const root = requireProjectRoot(cwd)
    const [taskErr, task] = readTask(root, taskRelPath)
    if (taskErr !== null || task === null) {
      throw taskErr ?? new Error(`${ERR_PREFIX.taskTool}: read returned no task: ${taskRelPath}`)
    }
    return [null, reviewCase(root, taskRelPath, task)]
  } catch (error) {
    return [toError(error), null]
  }
}

/**
 * align 编排实现（内部）：任一失败抛错，由外层转元组。
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
 * align review 编排：读确认对象文档（缺失以结构问题表达，不报错——模型据此判断
 * 文档还没写），附结构诊断与现有确认记录；零写盘。
 */
function reviewAlign(
  root: string,
  taskRelPath: string,
  task: TaskRecordWithPath,
  target: AlignTarget,
): AlignReviewResult {
  const prd = readTaskDocument(root, taskRelPath, PRD_FILE)
  const plan = target === 'plan' ? readTaskDocument(root, taskRelPath, PLAN_FILE) : null
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
 */
function confirmPrdAlign(
  root: string,
  taskRelPath: string,
  params: ExecuteAlignTaskParams,
): PrdConfirmResult {
  const prd = readTaskDocument(root, taskRelPath, PRD_FILE)
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
 */
function confirmPlanAlign(
  root: string,
  taskRelPath: string,
  params: ExecuteAlignTaskParams,
): PlanConfirmResult {
  const prd = readTaskDocument(root, taskRelPath, PRD_FILE)
  if (prd === null) {
    throw new Error(`${ERR_PREFIX.taskTool}: confirm rejected: ${PRD_MISSING}`)
  }
  const plan = readTaskDocument(root, taskRelPath, PLAN_FILE)
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
 * case review 编排（内部）：CASE 全文 + 结构诊断 + 会话链现状（零写盘）。
 */
function reviewCase(root: string, taskRelPath: string, task: TaskRecordWithPath): CaseReviewResult {
  const caseContent = readTaskDocument(root, taskRelPath, CASE_FILES.document)
  const prdContent = readTaskDocument(root, taskRelPath, PRD_FILE)
  if (prdContent === null) throw new Error(`${ERR_PREFIX.taskTool}: prd.md is missing`)
  const [gitErr, changedFiles] = listCaseChangedFiles(root, task)
  if (gitErr !== null || changedFiles === null) {
    throw gitErr ?? new Error(`${ERR_PREFIX.taskTool}: git changed files returned no result`)
  }
  const structureIssues = inspectCaseStructure(caseContent, prdContent, {
    taskRelPath,
    children: task.children,
    changedFiles,
  })
  for (const child of task.children) {
    // 子任务归档后 children 仍指向归档前路径：先读当前路径，缺失时按任务名
    // 兼容解析 tasks/archive/<YYYY-MM>/<name>/plan.md；两处都缺失才报缺失。
    const plan = readTaskDocument(root, child, 'plan.md') ?? readArchivedChildPlan(root, child)
    if (plan === null) {
      structureIssues.push({ code: 'parent_plan_missing', message: `${child}/plan.md is missing` })
    }
  }
  return {
    action: 'review',
    taskRelPath,
    status: task.status,
    case: caseContent,
    designSession: task.case?.designSession ?? null,
    structureIssues,
    blockers: structureIssues.map((item) => item.message),
    readyForExecution: structureIssues.length === 0,
  }
}

/** 子任务已归档时按任务名回退读取归档目录内的 plan.md（内部）。 */
function readArchivedChildPlan(root: string, child: string): string | null {
  const archived = findArchivedTaskPath(root, child)
  return archived === null ? null : readTaskDocument(root, archived, 'plan.md')
}

/**
 * 解析项目根（cwd 或其祖先含 .workloom；缺失抛错）。
 */
function requireProjectRoot(cwd: string): string {
  const found = findWorkloomRoot(cwd)
  if (found === null) {
    throw new Error(`${ERR_PREFIX.taskTool}: no .workloom directory found (searched up from ${cwd})`)
  }
  return found.root
}

/**
 * 读取任务目录内的文档全文（缺失返回 null，其他错误透传）。
 */
function readTaskDocument(root: string, taskRelPath: string, fileName: string): string | null {
  try {
    return readFileSync(join(insideWorkloom(root, taskRelPath), fileName), 'utf8')
  } catch (error) {
    if (isEnoent(error)) return null
    throw error
  }
}

/** 判断异常是否为文件不存在（内部）。 */
function isEnoent(error: unknown): boolean {
  return (error as NodeJS.ErrnoException)?.code === 'ENOENT'
}

/** 把任意异常归一为 Error（内部）。 */
function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value))
}
