/**
 * state/tracks：CASE 与 planReview 两条并行轨道的写入口（合法边表随入口自带）。
 *
 * 设计意图：
 * - 轨道值不入主线迁移表：recordCasePhase/recordPlanReview 各自携带冻结合法边表
 *   （CASE 单向链、planReview 含 revising→reviewing 回环），非法边拒绝并给
 *   可判定错误；
 * - revising 轮数只记录不判定（进入 revising 时 +1）；
 * - case 记录缺失时先建 required=false 的默认记录（轨道推进不隐式开启 CASE 门禁）；
 * - 写盘经 task/storage 写口，返回归一后的任务视图。
 */

import { createCaseRecord } from '../case-structure.ts'
import { requireProjectRoot, requireTaskRecord, writeTaskRecord } from '../storage/index.ts'
import { CASE_PHASES, ERR_PREFIX, PLAN_REVIEW_PHASES, toError } from './values.ts'
import { toTaskView } from './view.ts'

import type { CasePhaseValue, PlanReviewPhaseValue } from './values.ts'
import type { TaskView } from './view.ts'

/** CASE 轨道合法边（冻结；none→designing→reviewing→approved→executing→done 单向链）。 */
export const CASE_PHASE_EDGES: readonly (readonly [CasePhaseValue, CasePhaseValue])[] = Object.freeze([
  Object.freeze([CASE_PHASES.NONE, CASE_PHASES.DESIGNING] as const),
  Object.freeze([CASE_PHASES.DESIGNING, CASE_PHASES.REVIEWING] as const),
  Object.freeze([CASE_PHASES.REVIEWING, CASE_PHASES.APPROVED] as const),
  Object.freeze([CASE_PHASES.APPROVED, CASE_PHASES.EXECUTING] as const),
  Object.freeze([CASE_PHASES.EXECUTING, CASE_PHASES.DONE] as const),
])

/** PLAN 评审轨道合法边（冻结；revising 可回环 reviewing，轮数只记录不判定）。 */
export const PLAN_REVIEW_EDGES: readonly (readonly [PlanReviewPhaseValue, PlanReviewPhaseValue])[] =
  Object.freeze([
    Object.freeze([PLAN_REVIEW_PHASES.NONE, PLAN_REVIEW_PHASES.REVIEWING] as const),
    Object.freeze([PLAN_REVIEW_PHASES.REVIEWING, PLAN_REVIEW_PHASES.REVISING] as const),
    Object.freeze([PLAN_REVIEW_PHASES.REVIEWING, PLAN_REVIEW_PHASES.CLEAN] as const),
    Object.freeze([PLAN_REVIEW_PHASES.REVISING, PLAN_REVIEW_PHASES.REVIEWING] as const),
  ])

/** 判定 CASE 轨道边是否合法（dispatch-records 单点推进共用）。 */
export function isLegalCasePhaseEdge(from: CasePhaseValue, to: CasePhaseValue): boolean {
  return CASE_PHASE_EDGES.some((edge) => edge[0] === from && edge[1] === to)
}

/** 判定 PLAN 评审轨道边是否合法。 */
export function isLegalPlanReviewEdge(from: PlanReviewPhaseValue, to: PlanReviewPhaseValue): boolean {
  return PLAN_REVIEW_EDGES.some((edge) => edge[0] === from && edge[1] === to)
}

/**
 * CASE 轨道写入口：按合法边表推进 case.phase（落 task.json 的 case.phase 字段）；
 * 非法边拒绝并给可判定错误。case 记录缺失时先建 required=false 的默认记录。
 * @param root 项目根
 * @param taskRelPath 任务目录相对 .workloom 的路径
 * @param to 目标轨道阶段
 * @returns [err, view]
 */
export function recordCasePhase(
  root: string,
  taskRelPath: string,
  to: CasePhaseValue,
): [Error | null, TaskView | null] {
  try {
    const projectRoot = requireProjectRoot(root)
    const record = requireTaskRecord(projectRoot, taskRelPath)
    const view = toTaskView(record, taskRelPath)
    if (!isLegalCasePhaseEdge(view.casePhase, to)) {
      throw new Error(
        `${ERR_PREFIX}: illegal case phase transition: ${taskRelPath}: ${view.casePhase} -> ${to} ` +
          '(legal edges: none->designing->reviewing->approved->executing->done)',
      )
    }
    record.case = { ...(record.case ?? createCaseRecord(false, null)), phase: to }
    writeTaskRecord(projectRoot, taskRelPath, record)
    return [null, toTaskView(record, taskRelPath)]
  } catch (error) {
    return [toError(error), null]
  }
}

/**
 * PLAN 评审轨道写入口：按合法边表推进 planReview（落 task.json 的 planReview
 * 字段，形态 {phase, revisions}）；进入 revising 时轮数 +1（只记录不判定）；
 * 非法边拒绝并给可判定错误。
 * @param root 项目根
 * @param taskRelPath 任务目录相对 .workloom 的路径
 * @param to 目标轨道阶段
 * @returns [err, view]
 */
export function recordPlanReview(
  root: string,
  taskRelPath: string,
  to: PlanReviewPhaseValue,
): [Error | null, TaskView | null] {
  try {
    const projectRoot = requireProjectRoot(root)
    const record = requireTaskRecord(projectRoot, taskRelPath)
    const view = toTaskView(record, taskRelPath)
    if (!isLegalPlanReviewEdge(view.planReview, to)) {
      throw new Error(
        `${ERR_PREFIX}: illegal plan review transition: ${taskRelPath}: ${view.planReview} -> ${to} ` +
          '(legal edges: none->reviewing, reviewing->revising, reviewing->clean, revising->reviewing)',
      )
    }
    const revisions =
      to === PLAN_REVIEW_PHASES.REVISING ? view.planReviewRevisions + 1 : view.planReviewRevisions
    record.planReview = { phase: to, revisions }
    writeTaskRecord(projectRoot, taskRelPath, record)
    return [null, toTaskView(record, taskRelPath)]
  } catch (error) {
    return [toError(error), null]
  }
}
