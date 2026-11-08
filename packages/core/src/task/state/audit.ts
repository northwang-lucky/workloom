/**
 * state/audit：审计常量与门禁文案（字面量与历史 overrides 记录保持稳定）。
 *
 * 设计意图：
 * - OVERRIDE_GATES 是 force 豁免留痕的卡点枚举（task.json overrides[].gate 取值，
 *   字面量与历史审计记录保持稳定）；GATE_TOOL_NAMES 供审计对照调用入口；
 * - 各门禁拒绝文案常量单源在此（守卫实现消费在 guards.ts）；
 * - 运行时文案英文（repo/language 纪律）。
 */

import { PLAN_DOC_MISSING } from '../prd-structure.ts'

import type { GateValue } from '../storage/index.ts'

/**
 * force 豁免留痕的卡点枚举（task.json overrides[].gate 取值；原 task-gates 的
 * GATES，新名导出，字面不变）。
 */
export const OVERRIDE_GATES = Object.freeze({
  START: 'start',
  CHECK: 'check',
  ARCHIVE: 'archive',
  // executor 参数与 subagent_profiles 配置冲突的 force 覆盖（override 审计门，不入守卫）。
  EXECUTOR_MODEL_EFFORT: 'executor_model_effort',
  // 轻量任务派发拒绝的 force 覆盖（轻量任务由主会话包办，不需要执行器）。
  LIGHT_DISPATCH: 'light_dispatch',
} as const)

/** 卡点枚举键。 */
export type OverrideGateKey = keyof typeof OVERRIDE_GATES

/**
 * 卡点对应的工具名（overrides[].tool 取值，供审计对照调用入口；原 GATE_TOOLS，
 * 键与 OVERRIDE_GATES 取值一一对应，Record 类型强制完备）。
 */
export const GATE_TOOL_NAMES: Readonly<Record<GateValue, string>> = Object.freeze({
  start: 'workloom_task_start',
  check: 'workloom_task_check',
  archive: 'workloom_task_archive',
  // 与 surface.TOOL_NAMES.executor 一致（按既有风格逐字重复，防跨层依赖）。
  executor_model_effort: 'workloom_execute',
  // light_dispatch 同由 workloom_execute 触发（轻量任务拒绝派发的 force 豁免留痕）。
  light_dispatch: 'workloom_execute',
})

/** 轻量任务派发拒绝文案（主会话包办语义；原 LIGHT_DISPATCH_REJECT，字面不变）。 */
export const LIGHT_DISPATCH_REJECT_TEXT =
  'light task: executor dispatch is not available because the main session handles ' +
  'light tasks end to end (implementation, self-check, and commit)'

/** PLAN 门禁缺失项文案：plan.md 不存在（原 PLAN_MISSING，字面单源在 prd-structure）。 */
export const PLAN_CONFIRM_MISSING = PLAN_DOC_MISSING

/** PLAN 门禁缺失项文案：PLAN 结构合格但内容未确认（原 PLAN_NOT_CONFIRMED，字面不变）。 */
export const PLAN_CONFIRM_MISSING_TEXT =
  'plan.md content has not been confirmed (run workloom_task_align with target=plan after reviewing plan.md)'

/** alignment 门禁缺失项文案：无凭据（prd-confirmed 守卫拒绝理由，字面与旧 ALIGNMENT_MISSING 一致）。 */
export const ALIGNMENT_MISSING =
  'no alignment credential recorded (run workloom_task_align with action=confirm after Phase 1.1 converges)'

/** 前端派发门禁缺失项文案（涉及前端展示但无 frontend-developer 派发，机制强制）。 */
export const FRONTEND_DISPATCH_MISSING =
  'no frontend-developer dispatch recorded for a task with UI requirements'

/** prd.md 中标识「涉及前端展示」的小节标题（与 alignment 的 UI 适用性节点一致）。 */
export const UI_DESIGN_SECTION = 'UI Design'

/**
 * UI Design 小节「不适用」声明词表（ui-dispatch-ready 守卫的放行口径）：小节正文
 * 首个非空行以其一为前缀（英文按小写归一）即认定为显式声明不适用，视同无 UI
 * 需求。中英双语对齐任务文档语言纪律；只认首行前缀，声明词出现在正文中部不触发。
 */
export const UI_NOT_APPLICABLE_PREFIXES: readonly string[] = Object.freeze([
  '不适用',
  'n/a',
  'not applicable',
  'none',
])

/** 轻量任务 start 门保留的 prd 小节：只要求 Goal（最低可审计性）。 */
export const LIGHT_START_SECTION = 'Goal'
