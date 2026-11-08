/**
 * state/view：任务视图与兼容读单点。
 *
 * 设计意图：
 * - readTaskView 是旧任务记录的兼容读单点：full 读作 standard、children 非空且
 *   mode 缺省或旧值兜底推断为 parent、stage 旧值按模式映射新枚举、completed 与
 *   归档路径读作 archived 视图（status 与 stage 双字段呈现一致）、planning 按
 *   确认记录推导 aligning 或 planning；未映射值报可判定错误，不静默默认；
 * - toTaskView 是纯函数映射（零 IO），供已解析记录的下游组装器复用；对视图入参
 *   幂等（isTaskView 判别后原样返回），防止扁平化轨道字段被二次映射；
 * - 物理读写在 task/storage（本文件只经其读取口做兼容映射）。
 */

import { requireTaskRecord } from '../storage/index.ts'
import { normalizeExecutorRole } from '../../dispatch/executor-roles.ts'

import type { DispatchRecord, TaskRecordWithPath, TaskStatusValue } from '../storage/index.ts'
import type {
  AutonomyValue,
  CasePhaseValue,
  PlanReviewPhaseValue,
  TaskModeValue,
  TaskStageValue,
} from './values.ts'
import {
  AUTONOMY,
  AUTONOMY_VALUES,
  CASE_PHASES,
  CASE_PHASE_VALUES,
  ERR_PREFIX,
  LEGACY_MODE_FULL,
  LEGACY_STAGE_CHECK,
  LEGACY_STAGE_IMPLEMENT,
  MODES,
  PLAN_REVIEW_PHASES,
  PLAN_REVIEW_PHASE_VALUES,
  STAGES,
  STAGE_VALUES,
  toError,
} from './values.ts'

/**
 * 任务视图（兼容读产物）：原始记录字段 + 映射后的模式/阶段/轨道/自治度。
 * status 由 stage 反推（archived ⇔ completed），保证归档态双字段呈现一致。
 */
export type TaskView = Omit<TaskRecordWithPath, 'mode' | 'stage' | 'status'> & {
  /** 呈现状态（由 stage 反推：planning/in_progress/completed）。 */
  status: TaskStatusValue
  /** 兼容映射后的任务模式。 */
  mode: TaskModeValue
  /** 兼容映射后的主线阶段。 */
  stage: TaskStageValue
  /** CASE 轨道阶段（缺省 none）。 */
  casePhase: CasePhaseValue
  /** PLAN 评审轨道阶段（缺省 none）。 */
  planReview: PlanReviewPhaseValue
  /** PLAN 评审 revising 轮数（只记录不判定；缺省 0）。 */
  planReviewRevisions: number
  /** 自治度（缺省 manual）。 */
  autonomy: AutonomyValue
}

/**
 * 读取任务视图（兼容读单点）：task.json 缺失或损坏返回 err；
 * 未映射的 mode/stage/status/轨道/自治度值报可判定错误。
 * @param root 项目根
 * @param taskRelPath 任务目录相对 .workloom 的路径
 * @returns [err, view]
 */
export function readTaskView(root: string, taskRelPath: string): [Error | null, TaskView | null] {
  try {
    const record = requireTaskRecord(root, taskRelPath)
    return [null, toTaskView(record, taskRelPath)]
  } catch (error) {
    return [toError(error), null]
  }
}

/**
 * 判定记录是否已是任务视图（兼容读产物）：下游组装器（回合缓存、注入链）会把
 * 视图再次喂给 toTaskView，判别后幂等返回，防止扁平化轨道字段被二次映射。
 * @param value 原始记录或视图
 * @returns 是否为任务视图
 */
export function isTaskView(value: TaskRecordWithPath): value is TaskView {
  const candidate = value as Partial<TaskView>
  return (
    typeof candidate.casePhase === 'string' &&
    typeof candidate.planReview === 'string' &&
    typeof candidate.planReviewRevisions === 'number' &&
    typeof candidate.autonomy === 'string'
  )
}

/**
 * 把原始记录映射为任务视图（纯函数，兼容读规则单点；零 IO，
 * 供已解析记录的下游组装器复用，不产生额外读盘；对视图入参幂等）。
 * @param record 结构化归一后的原始记录（或已映射的视图）
 * @param taskRelPath 任务目录相对 .workloom 的路径
 * @returns 任务视图
 */
export function toTaskView(record: TaskRecordWithPath, taskRelPath: string): TaskView {
  if (isTaskView(record)) return { ...record, taskRelPath }
  const mode = mapMode(record, taskRelPath)
  const stage = deriveStage(record, taskRelPath, mode)
  const planReview = mapPlanReview(record, taskRelPath)
  return {
    ...record,
    status: statusOfStage(stage),
    mode,
    stage,
    // 派发记录兼容读（视图层归一）：kind 逐条经映射单点归一为新角色值域，
    // 守卫与展示消费方天然见新值；存储层不改写历史记录，归一只发生在读取视图。
    dispatches: normalizeDispatches(record.dispatches),
    casePhase: mapCasePhase(record, taskRelPath),
    planReview: planReview.phase,
    planReviewRevisions: planReview.revisions,
    autonomy: mapAutonomy(record, taskRelPath),
  }
}

/**
 * 派发记录逐条兼容读归一（内部）：kind 经 normalizeExecutorRole 映射为新角色值
 * （旧五值映射、未知值报可判定错误，与其他字段的兼容读同口径）；防御性容忍
 * 未归一部分记录（直连调用方夹具），非数组/非对象条目原样透传。
 */
function normalizeDispatches(dispatches: DispatchRecord[]): DispatchRecord[] {
  if (!Array.isArray(dispatches)) return dispatches
  return dispatches.map((entry) =>
    entry !== null && typeof entry === 'object'
      ? { ...entry, kind: normalizeExecutorRole(entry.kind) }
      : entry,
  )
}

/**
 * 由主线阶段反推呈现状态（归档态双字段一致：archived ⇔ completed）。
 * @param stage 主线阶段
 * @returns 呈现状态
 */
export function statusOfStage(stage: TaskStageValue): TaskStatusValue {
  if (stage === STAGES.ARCHIVED) return 'completed'
  if (stage === STAGES.ALIGNING || stage === STAGES.PLANNING) return 'planning'
  return 'in_progress'
}

/**
 * 模式兼容映射：light/standard/parent 原样；缺省与旧值 full 按 children 兜底
 * 推断（非空读作 parent，否则 standard）；未映射值报可判定错误。
 */
function mapMode(record: TaskRecordWithPath, taskRelPath: string): TaskModeValue {
  const raw = record.mode
  if (raw === MODES.LIGHT || raw === MODES.STANDARD || raw === MODES.PARENT) return raw
  if (raw === undefined || raw === LEGACY_MODE_FULL) {
    // children 防御性读取：直连调用方（回合缓存夹具）可能喂未归一的部分记录。
    const children = Array.isArray(record.children) ? record.children : []
    return children.length > 0 ? MODES.PARENT : MODES.STANDARD
  }
  throw new Error(`${ERR_PREFIX}: unmapped mode value: ${taskRelPath}: ${JSON.stringify(raw)}`)
}

/**
 * 阶段兼容推导：
 * - completed 或归档路径记录读作 archived；
 * - 落盘为新枚举值时原样采用；
 * - status=planning 按确认记录推导 aligning（无 PRD 确认）或 planning（已确认），
 *   旧 stage 落盘值对 planning 任务无意义（旧数据创建即默认 implement）；
 * - status=in_progress 的旧值按模式映射：implement/缺省 → implementing
 *   （parent 读作 orchestrating），check → checking（parent 读作 integrating）；
 * - 其余未映射值报可判定错误。
 */
function deriveStage(
  record: TaskRecordWithPath,
  taskRelPath: string,
  mode: TaskModeValue,
): TaskStageValue {
  if (record.status === 'completed' || isArchivePath(taskRelPath)) return STAGES.ARCHIVED
  if (record.status !== 'planning' && record.status !== 'in_progress') {
    throw new Error(
      `${ERR_PREFIX}: unmapped status value: ${taskRelPath}: ${JSON.stringify(record.status)}`,
    )
  }
  const raw = record.stage
  if (raw !== undefined && STAGE_VALUES.has(raw)) return raw as TaskStageValue
  if (record.status === 'planning') {
    return record.alignment === null ? STAGES.ALIGNING : STAGES.PLANNING
  }
  if (raw === undefined || raw === LEGACY_STAGE_IMPLEMENT) {
    return mode === MODES.PARENT ? STAGES.ORCHESTRATING : STAGES.IMPLEMENTING
  }
  if (raw === LEGACY_STAGE_CHECK) {
    return mode === MODES.PARENT ? STAGES.INTEGRATING : STAGES.CHECKING
  }
  throw new Error(
    `${ERR_PREFIX}: unmapped stage value: ${taskRelPath}: ${JSON.stringify(raw)}`,
  )
}

/** CASE 轨道兼容读：case 缺失或无 phase 读作 none；未映射值报可判定错误。 */
function mapCasePhase(record: TaskRecordWithPath, taskRelPath: string): CasePhaseValue {
  const raw = record.case?.phase
  if (raw === undefined || raw === null) return CASE_PHASES.NONE
  if (CASE_PHASE_VALUES.has(raw)) return raw as CasePhaseValue
  throw new Error(
    `${ERR_PREFIX}: unmapped case phase value: ${taskRelPath}: ${JSON.stringify(raw)}`,
  )
}

/** PLAN 评审轨道兼容读：缺省 none/0 轮；形状或取值非法报可判定错误。 */
function mapPlanReview(
  record: TaskRecordWithPath,
  taskRelPath: string,
): { phase: PlanReviewPhaseValue; revisions: number } {
  const raw = record.planReview
  if (raw === undefined || raw === null) return { phase: PLAN_REVIEW_PHASES.NONE, revisions: 0 }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(
      `${ERR_PREFIX}: unmapped planReview value: ${taskRelPath}: ${JSON.stringify(raw)}`,
    )
  }
  const shape = raw as { phase?: unknown; revisions?: unknown }
  const phase = shape.phase ?? PLAN_REVIEW_PHASES.NONE
  if (typeof phase !== 'string' || !PLAN_REVIEW_PHASE_VALUES.has(phase)) {
    throw new Error(
      `${ERR_PREFIX}: unmapped planReview phase value: ${taskRelPath}: ${JSON.stringify(phase)}`,
    )
  }
  const revisions = shape.revisions ?? 0
  if (typeof revisions !== 'number' || !Number.isInteger(revisions) || revisions < 0) {
    throw new Error(
      `${ERR_PREFIX}: invalid planReview revisions: ${taskRelPath}: ${JSON.stringify(revisions)}`,
    )
  }
  return { phase: phase as PlanReviewPhaseValue, revisions }
}

/** 自治度兼容读：缺省 manual；未映射值报可判定错误。 */
function mapAutonomy(record: TaskRecordWithPath, taskRelPath: string): AutonomyValue {
  const raw = record.autonomy
  if (raw === undefined || raw === null) return AUTONOMY.MANUAL
  if (typeof raw === 'string' && AUTONOMY_VALUES.has(raw)) return raw as AutonomyValue
  throw new Error(
    `${ERR_PREFIX}: unmapped autonomy value: ${taskRelPath}: ${JSON.stringify(raw)}`,
  )
}

/** 判定任务相对路径是否位于归档区（tasks/archive/<YYYY-MM>/<name>）。 */
export function isArchivePath(taskRelPath: string): boolean {
  const segments = taskRelPath.split(/[\\/]+/)
  return segments[0] === 'tasks' && segments[1] === 'archive' && segments.length > 2
}
