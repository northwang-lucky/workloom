/**
 * state/values：任务模式状态机的值域单源（五个冻结枚举与兼容读判定集合）。
 *
 * 设计意图：
 * - 五个冻结枚举（MODES/STAGES/CASE_PHASES/PLAN_REVIEW_PHASES/AUTONOMY）是任务
 *   模式、主线阶段与两条并行轨道的值域单源；一律 as const + Object.freeze，
 *   禁用 TS enum（Node 类型擦除运行约束）；
 * - 兼容读判定集合与 LEGACY_* 旧值常量随值域同文件（view 的映射函数消费）；
 * - 全 state 共享的私有件（ERR_PREFIX、toError）落在本文件，由兄弟文件相对导入
 *   ——本文件对 state 内部零依赖，避免分文件间形成循环导入面；仅供 state 内部
 *   消费的符号不进 index.ts 的对外重导出面。
 */

/** 错误消息前缀（运行时文案英文；state 子包共享）。 */
export const ERR_PREFIX = 'workloom task state machine'

/* ---------------- 五个冻结枚举（值域单源） ---------------- */

/** 任务模式（task.json.mode 的新值域；旧 full 经兼容读映射为 standard）。 */
export const MODES = Object.freeze({
  LIGHT: 'light',
  STANDARD: 'standard',
  PARENT: 'parent',
} as const)

/** 任务模式取值。 */
export type TaskModeValue = (typeof MODES)[keyof typeof MODES]

/** 主线阶段（task.json.stage 的新值域；parent 专属 orchestrating/integrating）。 */
export const STAGES = Object.freeze({
  ALIGNING: 'aligning',
  PLANNING: 'planning',
  IMPLEMENTING: 'implementing',
  CHECKING: 'checking',
  ORCHESTRATING: 'orchestrating',
  INTEGRATING: 'integrating',
  ARCHIVED: 'archived',
} as const)

/** 主线阶段取值。 */
export type TaskStageValue = (typeof STAGES)[keyof typeof STAGES]

/** CASE 轨道阶段（task.json case.phase；与主线并行，缺省读作 none）。 */
export const CASE_PHASES = Object.freeze({
  NONE: 'none',
  DESIGNING: 'designing',
  REVIEWING: 'reviewing',
  APPROVED: 'approved',
  EXECUTING: 'executing',
  DONE: 'done',
} as const)

/** CASE 轨道阶段取值。 */
export type CasePhaseValue = (typeof CASE_PHASES)[keyof typeof CASE_PHASES]

/** PLAN 评审轨道阶段（task.json planReview.phase；缺省读作 none）。 */
export const PLAN_REVIEW_PHASES = Object.freeze({
  NONE: 'none',
  REVIEWING: 'reviewing',
  REVISING: 'revising',
  CLEAN: 'clean',
} as const)

/** PLAN 评审轨道阶段取值。 */
export type PlanReviewPhaseValue = (typeof PLAN_REVIEW_PHASES)[keyof typeof PLAN_REVIEW_PHASES]

/** 任务自治度（task.json.autonomy；缺省读作 manual，只影响未发生的确认迁移）。 */
export const AUTONOMY = Object.freeze({
  MANUAL: 'manual',
  SEMI: 'semi',
  AUTO: 'auto',
} as const)

/** 任务自治度取值。 */
export type AutonomyValue = (typeof AUTONOMY)[keyof typeof AUTONOMY]

/** 主线阶段取值集合（兼容读判定用）。 */
export const STAGE_VALUES: ReadonlySet<string> = new Set(Object.values(STAGES))

/** CASE 轨道取值集合（兼容读判定用）。 */
export const CASE_PHASE_VALUES: ReadonlySet<string> = new Set(Object.values(CASE_PHASES))

/** PLAN 评审轨道取值集合（兼容读判定用）。 */
export const PLAN_REVIEW_PHASE_VALUES: ReadonlySet<string> = new Set(
  Object.values(PLAN_REVIEW_PHASES),
)

/** 自治度取值集合（兼容读判定用）。 */
export const AUTONOMY_VALUES: ReadonlySet<string> = new Set(Object.values(AUTONOMY))

/* ---------------- 旧值常量（兼容读映射的输入域） ---------------- */

/** 旧 mode 值（存量任务落盘 full；缺省与旧值同路推断）。 */
export const LEGACY_MODE_FULL = 'full'

/** 旧 stage 值（implement/check 二相；缺省按 implement 语义推导）。 */
export const LEGACY_STAGE_IMPLEMENT = 'implement'
export const LEGACY_STAGE_CHECK = 'check'

/* ---------------- 共享辅助（state 子包内部） ---------------- */

/** 把任意异常归一为 Error。 */
export function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value))
}
