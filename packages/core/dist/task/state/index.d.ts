/**
 * task/state：任务模式状态机唯一对外入口（自旧 state-machine.ts 拆分）。
 *
 * 设计意图：
 * - 状态机分文件布局：值域枚举与共享私有件（values）、兼容读视图（view）、
 *   主线迁移表（transitions）、审计常量（audit）、守卫注册表（guards）、
 *   迁移执行（migrate）、轨道写入口（tracks）、确认迁移（confirm）、会话指针
 *   （pointers）；
 * - 五个冻结枚举是任务模式、主线阶段与两条并行轨道的值域单源；readTaskView
 *   是旧任务记录的兼容读单点；TRANSITIONS 是主线迁移唯一事实源；migrateTask
 *   是 status 与 stage 的单一写入口；
 * - 物理读写在 task/storage（状态机只经其读取口做兼容映射与写口落盘）；
 * - 本入口只做重导出、承载零实现：task/ 外代码与 task/ 内同级文件一律经本入口
 *   导入，不直接引用子目录内分文件；子目录内部文件可互相直引。
 */
export { AUTONOMY, CASE_PHASES, MODES, PLAN_REVIEW_PHASES, STAGES, } from './values.ts';
export { isArchivePath, isTaskView, readTaskView, statusOfStage, toTaskView } from './view.ts';
export { GUARD_KEYS, TRANSITIONS } from './transitions.ts';
export { GATE_TOOL_NAMES, LIGHT_DISPATCH_REJECT_TEXT, OVERRIDE_GATES, PLAN_CONFIRM_MISSING, PLAN_CONFIRM_MISSING_TEXT, } from './audit.ts';
export { GUARDS, evaluateGuard } from './guards.ts';
export { evaluateTransition, findTransitionPath, migrateTask } from './migrate.ts';
export { CASE_PHASE_EDGES, PLAN_REVIEW_EDGES, isLegalCasePhaseEdge, isLegalPlanReviewEdge, recordCasePhase, recordPlanReview, } from './tracks.ts';
export { confirmPlan, confirmPrd } from './confirm.ts';
export { clearActiveTask, clearPointersToTask, listPointers, resolveActiveTask, setActiveTask, } from './pointers.ts';
export type { AutonomyValue, CasePhaseValue, PlanReviewPhaseValue, TaskModeValue, TaskStageValue, } from './values.ts';
export type { TaskView } from './view.ts';
export type { GuardKey, TaskTransition } from './transitions.ts';
export type { OverrideGateKey } from './audit.ts';
export type { GuardContext, GuardFn, GuardResult } from './guards.ts';
export type { MigrateTaskParams, MigrateTaskResult, TransitionEvaluation } from './migrate.ts';
export type { ConfirmEntryInput, ConfirmSource } from './confirm.ts';
export type { SessionPointer, SessionPointerWithContext } from './pointers.ts';
