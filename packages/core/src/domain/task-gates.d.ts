/** 流程卡点（task-gates）模块的公共类型（供 JSDoc 引用）。 */

import type { DispatchRecord, GateOverride, TaskRecord } from './task-store.d.ts'

/** 卡点枚举键。 */
export type GateKey = 'START' | 'CHECK' | 'ARCHIVE' | 'EXECUTOR_MODEL_EFFORT' | 'STALE_ALIGN'

/** 卡点取值（task.json overrides[].gate）。 */
export type GateValue =
  | 'start'
  | 'check'
  | 'archive'
  | 'executor_model_effort'
  | 'stale_alignment'

/** 卡点枚举常量对象。 */
export const GATES: Readonly<Record<GateKey, GateValue>>

/** 卡点对应的工具名常量对象。 */
export const GATE_TOOLS: Readonly<Record<GateValue, string>>

/** prd 骨架小节定义。 */
export interface PrdSection {
  heading: string
  placeholder: string
}

/** prd.md 骨架小节常量（顺序即文档顺序）。 */
export const PRD_SECTIONS: readonly PrdSection[]

/** prd 结构问题 code（冻结值域，覆盖缺文件/H1/小节/marker 六类）。 */
export type PrdStructureCode =
  | 'prd_missing'
  | 'prd_title_missing'
  | 'prd_section_missing'
  | 'prd_section_placeholder'
  | 'prd_open_nodes_missing'
  | 'prd_open_nodes_not_none'

/** 单条 prd 结构问题：稳定 code + 英文运行时文案 + 可选小节名。 */
export interface PrdStructureIssue {
  code: PrdStructureCode
  message: string
  section?: string
}

/** 小节类结构问题 code（PrdStructureCode 的子集，携带 section 字段）。 */
export type PrdSectionIssueCode = 'prd_section_missing' | 'prd_section_placeholder'

/** prd 结构问题 code 常量对象（键名与 code 一一对应）。 */
export const PRD_STRUCTURE_CODES: Readonly<{
  PRD_MISSING: 'prd_missing'
  PRD_TITLE_MISSING: 'prd_title_missing'
  PRD_SECTION_MISSING: 'prd_section_missing'
  PRD_SECTION_PLACEHOLDER: 'prd_section_placeholder'
  PRD_OPEN_NODES_MISSING: 'prd_open_nodes_missing'
  PRD_OPEN_NODES_NOT_NONE: 'prd_open_nodes_not_none'
}>

/** prd 文件缺失文案（start 门禁、review 诊断、confirm 拦截共用同一句）。 */
export const PRD_MISSING: string

/** 判定 prd.md 是否缺一级标题（H1）：缺失返回缺失文案，通过返回 null。 */
export function findMissingPrdTitle(prdContent: string): string | null

/** 找出仍为 placeholder 的 prd 小节标题列表（缺失小节视为未填）。 */
export function findUnfilledPrdSections(prdContent: string): string[]

/** 检查 prd.md 结构与内容门禁，一次性返回全部问题（顺序：H1 → 小节 → open nodes）。 */
export function inspectPrdStructure(prdContent: string | null): PrdStructureIssue[]

/** 统计 jsonl 内容中的有效记录数（有 file 字段的行；坏行抛错）。 */
export function countEffectiveJsonlRecords(content: string, jsonlName: string): number

/** 求值 start 门禁（含 alignment 门禁分支）：返回缺失项描述列表（空数组表示通过；坏行抛错）。 */
export function evaluateStartGate(root: string, taskRelPath: string, task: TaskRecord): string[]

/**
 * 求值 stale alignment 门禁（含 IO：读当前 prd.md 计算 hash）：
 * in_progress 且有 alignment 凭据但 hash 失配 → 返回缺失项；其余（旧任务空凭据、
 * planning/completed、prd 缺失）一律放行。executor 派发/check/archive 共用。
 */
export function evaluateStaleAlignmentGate(
  root: string,
  taskRelPath: string,
  task: TaskRecord,
): string[]

/** 求值 check 门禁（check.jsonl 有效记录）：返回缺失项描述列表（空数组表示通过）。 */
export function evaluateCheckLogGate(root: string, taskRelPath: string): string[]

/** 求值前端派发门禁（纯函数）：prd 含「UI Design」且无 frontend 派发时返回缺失项。 */
export function evaluateFrontendDispatchGate(
  prdContent: string | null,
  dispatches: DispatchRecord[],
): string[]

/** 组装一条 force 豁免记录（gate/tool/at/reason?）。 */
export function makeOverride(gate: GateValue, reason?: string): GateOverride
