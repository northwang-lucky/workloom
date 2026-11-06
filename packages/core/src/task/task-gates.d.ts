/** 流程卡点（task-gates）模块的公共类型（供 JSDoc 引用）。 */

import type { DispatchRecord, GateOverride, TaskRecord } from './task-store.d.ts'

/** 卡点枚举键。 */
export type GateKey =
  | 'START'
  | 'CHECK'
  | 'ARCHIVE'
  | 'EXECUTOR_MODEL_EFFORT'
  | 'LIGHT_DISPATCH'

/** 卡点取值（task.json overrides[].gate）。 */
export type GateValue =
  | 'start'
  | 'check'
  | 'archive'
  | 'executor_model_effort'
  | 'light_dispatch'

/** 卡点枚举常量对象。 */
export const GATES: Readonly<Record<GateKey, GateValue>>

/** 卡点对应的工具名常量对象。 */
export const GATE_TOOLS: Readonly<Record<GateValue, string>>

/** PLAN 文件缺失文案（完整实施任务 start 门禁拦截）。 */
export const PLAN_MISSING: string

/** PLAN 内容未确认文案（PLAN 结构合格但无 planConfirmation 时 start 拦截）。 */
export const PLAN_NOT_CONFIRMED: string

/** 单条 PLAN 结构问题：稳定 code + 英文运行时文案。 */
export interface PlanStructureIssue {
  code:
    | 'plan_missing'
    | 'plan_title_missing'
    | 'plan_steps_missing'
    | 'plan_steps_empty'
    | 'plan_step_field'
    | 'plan_protocol_missing'
    | 'plan_protocol_duplicate'
    | 'plan_protocol_order'
    | 'plan_ac_missing'
  message: string
}

/**
 * 校验完整实施任务的 PLAN：步骤四要素齐全，Edit 区域五字段伪代码协议成立，
 * 且 PRD 的每个 AC 至少被 Covers 一次。
 */
export function inspectPlanStructure(planContent: string | null, prdContent: string): PlanStructureIssue[]

/** 统计 jsonl 内容中的有效记录数（有 file 字段的行；坏行抛错）。 */
export function countEffectiveJsonlRecords(content: string, jsonlName: string): number

/** 求值 start 门禁（含 alignment 门禁分支）：返回缺失项描述列表（空数组表示通过；坏行抛错）。 */
export function evaluateStartGate(root: string, taskRelPath: string, task: TaskRecord): string[]

/** 轻量任务派发拒绝文案（主会话包办语义）。 */
export const LIGHT_DISPATCH_REJECT: string

/** 求值轻量任务派发门禁（纯函数）：light 任务返回拒绝文案，full/旧任务放行。 */
export function evaluateLightDispatchGate(
  task: TaskRecord | null | undefined,
): string[]

/** 求值 check 门禁（check.jsonl 有效记录）：返回缺失项描述列表（空数组表示通过）。 */
export function evaluateCheckLogGate(root: string, taskRelPath: string): string[]

/**
 * 求值前端派发门禁（纯函数）：prd 含「UI Design」实质内容小节（正文首行非显式
 * 不适用声明）且无 frontend 派发时返回缺失项；正文声明不适用视同无 UI 需求放行。
 */
export function evaluateFrontendDispatchGate(
  prdContent: string | null,
  dispatches: DispatchRecord[],
): string[]

/** 组装一条 force 豁免记录（gate/tool/at/reason?）。 */
export function makeOverride(gate: GateValue, reason?: string): GateOverride
