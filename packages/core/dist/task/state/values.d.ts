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
export declare const ERR_PREFIX = "workloom task state machine";
/** 任务模式（task.json.mode 的新值域；旧 full 经兼容读映射为 standard）。 */
export declare const MODES: Readonly<{
    readonly LIGHT: "light";
    readonly STANDARD: "standard";
    readonly PARENT: "parent";
}>;
/** 任务模式取值。 */
export type TaskModeValue = (typeof MODES)[keyof typeof MODES];
/** 主线阶段（task.json.stage 的新值域；parent 专属 orchestrating/integrating）。 */
export declare const STAGES: Readonly<{
    readonly ALIGNING: "aligning";
    readonly PLANNING: "planning";
    readonly IMPLEMENTING: "implementing";
    readonly CHECKING: "checking";
    readonly ORCHESTRATING: "orchestrating";
    readonly INTEGRATING: "integrating";
    readonly ARCHIVED: "archived";
}>;
/** 主线阶段取值。 */
export type TaskStageValue = (typeof STAGES)[keyof typeof STAGES];
/** CASE 轨道阶段（task.json case.phase；与主线并行，缺省读作 none）。 */
export declare const CASE_PHASES: Readonly<{
    readonly NONE: "none";
    readonly DESIGNING: "designing";
    readonly REVIEWING: "reviewing";
    readonly APPROVED: "approved";
    readonly EXECUTING: "executing";
    readonly DONE: "done";
}>;
/** CASE 轨道阶段取值。 */
export type CasePhaseValue = (typeof CASE_PHASES)[keyof typeof CASE_PHASES];
/** PLAN 评审轨道阶段（task.json planReview.phase；缺省读作 none）。 */
export declare const PLAN_REVIEW_PHASES: Readonly<{
    readonly NONE: "none";
    readonly REVIEWING: "reviewing";
    readonly REVISING: "revising";
    readonly CLEAN: "clean";
}>;
/** PLAN 评审轨道阶段取值。 */
export type PlanReviewPhaseValue = (typeof PLAN_REVIEW_PHASES)[keyof typeof PLAN_REVIEW_PHASES];
/** 任务自治度（task.json.autonomy；缺省读作 manual，只影响未发生的确认迁移）。 */
export declare const AUTONOMY: Readonly<{
    readonly MANUAL: "manual";
    readonly SEMI: "semi";
    readonly AUTO: "auto";
}>;
/** 任务自治度取值。 */
export type AutonomyValue = (typeof AUTONOMY)[keyof typeof AUTONOMY];
/** 主线阶段取值集合（兼容读判定用）。 */
export declare const STAGE_VALUES: ReadonlySet<string>;
/** CASE 轨道取值集合（兼容读判定用）。 */
export declare const CASE_PHASE_VALUES: ReadonlySet<string>;
/** PLAN 评审轨道取值集合（兼容读判定用）。 */
export declare const PLAN_REVIEW_PHASE_VALUES: ReadonlySet<string>;
/** 自治度取值集合（兼容读判定用）。 */
export declare const AUTONOMY_VALUES: ReadonlySet<string>;
/** 旧 mode 值（存量任务落盘 full；缺省与旧值同路推断）。 */
export declare const LEGACY_MODE_FULL = "full";
/** 旧 stage 值（implement/check 二相；缺省按 implement 语义推导）。 */
export declare const LEGACY_STAGE_IMPLEMENT = "implement";
export declare const LEGACY_STAGE_CHECK = "check";
/** 把任意异常归一为 Error。 */
export declare function toError(value: unknown): Error;
