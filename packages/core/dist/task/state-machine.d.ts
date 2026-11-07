/**
 * state-machine：任务模式状态机的单一事实源（TypeScript）。
 *
 * 设计意图：
 * - 五个冻结枚举（MODES/STAGES/CASE_PHASES/PLAN_REVIEW_PHASES/AUTONOMY）是任务
 *   模式、主线阶段与两条并行轨道的值域单源；一律 as const + Object.freeze，
 *   禁用 TS enum（Node 类型擦除运行约束）；
 * - readTaskView 是旧任务记录的兼容读单点：full 读作 standard、children 非空且
 *   mode 缺省或旧值兜底推断为 parent、stage 旧值按模式映射新枚举、completed 与
 *   归档路径读作 archived 视图（status 与 stage 双字段呈现一致）、planning 按
 *   确认记录推导 aligning 或 planning；未映射值报可判定错误，不静默默认；
 * - TRANSITIONS 是三模式主线允许迁移与守卫条件的冻结迁移表（唯一事实源），
 *   条目为 {mode, from, to, guards}；轨道值（casePhase/planReview）不入主线表，
 *   由 recordCasePhase/recordPlanReview 各自携带合法边表；
 * - GUARDS 守卫注册表收编旧六类门禁（决定 8 映射），migrateTask 为 status 与
 *   stage 的单一写入口（查表、跑守卫、经 task-storage 落盘）；confirmPrd 与
 *   confirmPlan 按 autonomy 决定人工或自动记录并落 source 与 autonomy 审计字段；
 * - 物理读写在 task-storage（本模块只经其读取口做兼容映射与写口落盘）。
 */
import type { GateValue, TaskRecordWithPath, TaskRecord, TaskStatusValue } from './task-storage.ts';
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
/**
 * 任务视图（兼容读产物）：原始记录字段 + 映射后的模式/阶段/轨道/自治度。
 * status 由 stage 反推（archived ⇔ completed），保证归档态双字段呈现一致。
 */
export type TaskView = Omit<TaskRecordWithPath, 'mode' | 'stage' | 'status'> & {
    /** 呈现状态（由 stage 反推：planning/in_progress/completed）。 */
    status: TaskStatusValue;
    /** 兼容映射后的任务模式。 */
    mode: TaskModeValue;
    /** 兼容映射后的主线阶段。 */
    stage: TaskStageValue;
    /** CASE 轨道阶段（缺省 none）。 */
    casePhase: CasePhaseValue;
    /** PLAN 评审轨道阶段（缺省 none）。 */
    planReview: PlanReviewPhaseValue;
    /** PLAN 评审 revising 轮数（只记录不判定；缺省 0）。 */
    planReviewRevisions: number;
    /** 自治度（缺省 manual）。 */
    autonomy: AutonomyValue;
};
/** 守卫注册表键值域（步骤 3 实现守卫函数注册表）。 */
export declare const GUARD_KEYS: readonly ["prd-confirmed", "plan-confirmed", "plan-review-clean", "start-ready", "check-ready", "archive-ready", "light-dispatch", "ui-dispatch-ready", "case-approved", "case-execution-ready", "case-outcome-ready", "children-archived", "integration-case-passed"];
/** 守卫键类型。 */
export type GuardKey = (typeof GUARD_KEYS)[number];
/** 主线迁移表条目：{mode, from, to, guards}（冻结数组，唯一事实源）。 */
export interface TaskTransition {
    mode: TaskModeValue;
    from: TaskStageValue;
    to: TaskStageValue;
    guards: readonly GuardKey[];
}
/**
 * 三模式主线迁移表：
 * - standard：aligning→planning→implementing→checking→archived；
 * - light：无 CASE 轨道，implementing 直达 archived（无 checking 边）；
 * - parent：aligning→planning→orchestrating→integrating→archived。
 * 归档出口边（每模式归档前各阶段直达 archived）：保留旧 archiveTask 的逃生
 * 语义——任意在档阶段可归档（archive-ready 拦截无 check 凭据，force 豁免留痕；
 * case-outcome-ready 硬拦 RESULT 不成立），任务做大的出口是做完或归档重建。
 * 轨道值不入本表；守卫实现在 GUARDS 注册表。
 */
export declare const TRANSITIONS: readonly TaskTransition[];
/**
 * 读取任务视图（兼容读单点）：task.json 缺失或损坏返回 err；
 * 未映射的 mode/stage/status/轨道/自治度值报可判定错误。
 * @param root 项目根
 * @param taskRelPath 任务目录相对 .workloom 的路径
 * @returns [err, view]
 */
export declare function readTaskView(root: string, taskRelPath: string): [Error | null, TaskView | null];
/**
 * 判定记录是否已是任务视图（兼容读产物）：下游组装器（回合缓存、注入链）会把
 * 视图再次喂给 toTaskView，判别后幂等返回，防止扁平化轨道字段被二次映射。
 * @param value 原始记录或视图
 * @returns 是否为任务视图
 */
export declare function isTaskView(value: TaskRecordWithPath): value is TaskView;
/**
 * 把原始记录映射为任务视图（纯函数，兼容读规则单点；零 IO，
 * 供已解析记录的下游组装器复用，不产生额外读盘；对视图入参幂等）。
 * @param record 结构化归一后的原始记录（或已映射的视图）
 * @param taskRelPath 任务目录相对 .workloom 的路径
 * @returns 任务视图
 */
export declare function toTaskView(record: TaskRecordWithPath, taskRelPath: string): TaskView;
/**
 * 由主线阶段反推呈现状态（归档态双字段一致：archived ⇔ completed）。
 * @param stage 主线阶段
 * @returns 呈现状态
 */
export declare function statusOfStage(stage: TaskStageValue): TaskStatusValue;
/** 判定任务相对路径是否位于归档区（tasks/archive/<YYYY-MM>/<name>）。 */
export declare function isArchivePath(taskRelPath: string): boolean;
/**
 * force 豁免留痕的卡点枚举（task.json overrides[].gate 取值；原 task-gates 的
 * GATES，决定 8 新名导出，字面不变）。
 */
export declare const OVERRIDE_GATES: Readonly<{
    readonly START: "start";
    readonly CHECK: "check";
    readonly ARCHIVE: "archive";
    readonly EXECUTOR_MODEL_EFFORT: "executor_model_effort";
    readonly LIGHT_DISPATCH: "light_dispatch";
}>;
/** 卡点枚举键。 */
export type OverrideGateKey = keyof typeof OVERRIDE_GATES;
/**
 * 卡点对应的工具名（overrides[].tool 取值，供审计对照调用入口；原 GATE_TOOLS，
 * 键与 OVERRIDE_GATES 取值一一对应，Record 类型强制完备）。
 */
export declare const GATE_TOOL_NAMES: Readonly<Record<GateValue, string>>;
/** 轻量任务派发拒绝文案（主会话包办语义；原 LIGHT_DISPATCH_REJECT，字面不变）。 */
export declare const LIGHT_DISPATCH_REJECT_TEXT: string;
/** PLAN 门禁缺失项文案：plan.md 不存在（原 PLAN_MISSING，字面单源在 prd-structure）。 */
export declare const PLAN_CONFIRM_MISSING = "plan.md is missing";
/** PLAN 门禁缺失项文案：PLAN 结构合格但内容未确认（原 PLAN_NOT_CONFIRMED，字面不变）。 */
export declare const PLAN_CONFIRM_MISSING_TEXT = "plan.md content has not been confirmed (run workloom_task_align with target=plan after reviewing plan.md)";
/** 守卫求值上下文（任务定位；文件读取经 task-storage 只读口）。 */
export interface GuardContext {
    /** 项目根（必须已是 findWorkloomRoot 的结果）。 */
    root: string;
    /** 任务目录相对 .workloom 的路径。 */
    taskRelPath: string;
}
/**
 * 守卫求值结果：[err, reason]。err 空即通过（reason 同为 null）；
 * 拒绝时 err 携带可判定错误、reason 为拒绝理由文本。
 */
export type GuardResult = [Error | null, string | null];
/** 守卫函数签名：(view, ctx) → [err, reason]。 */
export type GuardFn = (view: TaskView, ctx: GuardContext) => GuardResult;
/** 守卫注册表：键到函数映射（迁移表与查询入口共查的唯一实现）。 */
export declare const GUARDS: Readonly<Record<GuardKey, GuardFn>>;
/**
 * 按守卫键求值（派发入口与编排层的单守卫查询口）。
 * @param key 守卫键
 * @param view 任务视图
 * @param ctx 守卫上下文
 * @returns [err, reason]（err 空即通过）
 */
export declare function evaluateGuard(key: GuardKey, view: TaskView, ctx: GuardContext): GuardResult;
/** evaluateTransition 产物（干跑：查表 + 守卫求值，不写盘）。 */
export interface TransitionEvaluation {
    /** 迁移前视图。 */
    view: TaskView;
    /** 迁移前原始记录（可变引用，供调用方在写盘前打补丁）。 */
    record: TaskRecordWithPath;
    /** 迁移路径（表条目序列；单跳为一条）。 */
    path: readonly TaskTransition[];
    /** 被拦截但可 force 豁免的守卫键。 */
    bypassedGuards: GuardKey[];
    /** 豁免对应的 override 审计 gate 值（去重，保持首现序）。 */
    bypassedGates: GateValue[];
}
/** migrateTask 入参。 */
export interface MigrateTaskParams {
    taskRelPath: string;
    /** 目标主线阶段（路径由迁移表推导，支持多跳）。 */
    to: TaskStageValue;
    /** 豁免可 force 守卫（须带非空 reason，逐项留痕 overrides）。 */
    force?: boolean;
    /** force 豁免原因（审计用）。 */
    reason?: string;
    /** 随迁移同一次落盘的附加字段（worktree 回填、check 凭据、case 初始化等）。 */
    patch?: Partial<TaskRecord>;
}
/** migrateTask 成功结果。 */
export interface MigrateTaskResult {
    /** 迁移后视图。 */
    view: TaskView;
    from: TaskStageValue;
    to: TaskStageValue;
    bypassedGuards: GuardKey[];
}
/**
 * 查迁移路径（BFS，按表内声明序扩展；同模式子图无环，路径唯一确定）。
 * @param mode 任务模式
 * @param from 当前阶段
 * @param to 目标阶段
 * @returns 迁移路径；不可达返回 null
 */
export declare function findTransitionPath(mode: TaskModeValue, from: TaskStageValue, to: TaskStageValue): readonly TaskTransition[] | null;
/**
 * 迁移干跑：查表 + 逐边跑守卫，不写盘（编排层在守卫合流后、写盘前插入
 * worktree 创建/清理与目录移动等副作用）。硬守卫拦截时 force 也不放行；
 * 可 force 守卫拦截且 force=true 时给出待留痕的 gate 值。
 * @param root 项目根
 * @param taskRelPath 任务目录相对 .workloom 的路径
 * @param to 目标阶段
 * @param options force/reason
 * @returns [err, evaluation]
 */
export declare function evaluateTransition(root: string, taskRelPath: string, to: TaskStageValue, options?: {
    force?: boolean;
    reason?: string;
}): [Error | null, TransitionEvaluation | null];
/**
 * 主线迁移单一写入口：查表、跑守卫、经 task-storage 写 status 与 stage 与
 * casePhase（patch 随同一次落盘）；force 豁免逐项留痕 overrides（原子同写）。
 * @param root 项目根
 * @param params 迁移入参
 * @returns [err, result]
 */
export declare function migrateTask(root: string, params: MigrateTaskParams): [Error | null, MigrateTaskResult | null];
/** CASE 轨道合法边（冻结；none→designing→reviewing→approved→executing→done 单向链）。 */
export declare const CASE_PHASE_EDGES: readonly (readonly [CasePhaseValue, CasePhaseValue])[];
/** PLAN 评审轨道合法边（冻结；revising 可回环 reviewing，轮数只记录不判定）。 */
export declare const PLAN_REVIEW_EDGES: readonly (readonly [PlanReviewPhaseValue, PlanReviewPhaseValue])[];
/** 判定 CASE 轨道边是否合法（dispatch-records 单点推进共用）。 */
export declare function isLegalCasePhaseEdge(from: CasePhaseValue, to: CasePhaseValue): boolean;
/** 判定 PLAN 评审轨道边是否合法。 */
export declare function isLegalPlanReviewEdge(from: PlanReviewPhaseValue, to: PlanReviewPhaseValue): boolean;
/**
 * CASE 轨道写入口：按合法边表推进 case.phase（落 task.json 的 case.phase 字段）；
 * 非法边拒绝并给可判定错误。case 记录缺失时先建 required=false 的默认记录。
 * @param root 项目根
 * @param taskRelPath 任务目录相对 .workloom 的路径
 * @param to 目标轨道阶段
 * @returns [err, view]
 */
export declare function recordCasePhase(root: string, taskRelPath: string, to: CasePhaseValue): [Error | null, TaskView | null];
/**
 * PLAN 评审轨道写入口：按合法边表推进 planReview（落 task.json 的 planReview
 * 字段，形态 {phase, revisions}）；进入 revising 时轮数 +1（只记录不判定）；
 * 非法边拒绝并给可判定错误。
 * @param root 项目根
 * @param taskRelPath 任务目录相对 .workloom 的路径
 * @param to 目标轨道阶段
 * @returns [err, view]
 */
export declare function recordPlanReview(root: string, taskRelPath: string, to: PlanReviewPhaseValue): [Error | null, TaskView | null];
/** 确认入口入参（manual 人工确认必填 summary；自动记录路径忽略入参 summary）。 */
export interface ConfirmEntryInput {
    summary?: string;
}
/** 确认记录来源（decision 5 审计字段：user 人工确认 / auto 自治度自动记录）。 */
export type ConfirmSource = 'user' | 'auto';
/**
 * PRD 确认迁移（workloom_task_align target=prd confirm 的窄写口）：
 * - autonomy=auto 自动记录（summary 注明自动来源，source=auto）；manual/semi
 *   维持人工确认（summary 必填非空，source=user）；记录均带 autonomy 快照；
 * - 任务处于 aligning 时经迁移表推进到 planning（prd-confirmed 守卫）；
 *   更晚阶段只刷新凭据不迁移（重复确认语义与旧记录口一致）；
 * - 校验失败零写入；PRD 结构等前置校验归服务层（doc-review）。
 * @param root 项目根
 * @param taskRelPath 任务目录相对 .workloom 的路径
 * @param entry 确认入参
 * @returns [err, view]
 */
export declare function confirmPrd(root: string, taskRelPath: string, entry: ConfirmEntryInput): [Error | null, TaskView | null];
/**
 * PLAN 确认迁移（workloom_task_align target=plan confirm 的窄写口）：
 * - 顺序前置：PRD 已确认；守卫含 plan-review-clean（Judger 评审零意见），
 *   与 autonomy 无关——auto 模式也先跑评审轨道到 clean 才自动记录；
 * - autonomy=semi/auto 自动记录（summary 注明自动来源，source=auto）；manual
 *   维持人工确认（summary 必填非空，source=user）；记录均带 autonomy 快照；
 * - PLAN 结构校验归服务层（doc-review），本口只落凭据；校验失败零写入。
 * @param root 项目根
 * @param taskRelPath 任务目录相对 .workloom 的路径
 * @param entry 确认入参
 * @returns [err, view]
 */
export declare function confirmPlan(root: string, taskRelPath: string, entry: ConfirmEntryInput): [Error | null, TaskView | null];
/** 会话指针文件内容（.workloom/.runtime/sessions/<contextKey>.json）。 */
export interface SessionPointer {
    /** 当前任务目录（相对 .workloom 的路径，如 tasks/08-24-foo）。 */
    current_task: string;
    /** 最近一次写入指针的时间（ISO 时间戳）。 */
    last_seen_at: string;
}
/** 列出全部会话指针（只读，不清理；带 contextKey 与绝对路径，供 doctor 消费）。 */
export interface SessionPointerWithContext extends SessionPointer {
    contextKey: string;
    absPath: string;
}
/**
 * 写入会话指针；目录不存在时自动创建。
 * @param root 项目根
 * @param contextKey 会话标识（adapter 组装）
 * @param taskRelPath 任务目录相对 .workloom 的路径
 * @returns [err]
 */
export declare function setActiveTask(root: string, contextKey: string, taskRelPath: string): [Error | null];
/**
 * 删除会话指针（幂等：文件不存在也视为成功）。
 * @param root 项目根
 * @param contextKey 会话标识
 * @returns [err]
 */
export declare function clearActiveTask(root: string, contextKey: string): [Error | null];
/**
 * 解析会话指针：返回当前任务相对路径；无指针或指针悬挂（目录已删）时返回 null 并清理。
 * @param root 项目根
 * @param contextKey 会话标识
 * @returns [err, taskRelPath]
 */
export declare function resolveActiveTask(root: string, contextKey: string): [Error | null, string | null];
/**
 * 列出全部会话指针（只读，不清理；供 doctor 健康检查用，避免 resolve 的清理副作用）。
 * 损坏的指针文件跳过，不阻塞列取。
 * @param root 项目根
 * @returns [err, pointers]
 */
export declare function listPointers(root: string): [Error | null, SessionPointerWithContext[] | null];
/**
 * 删除所有指向指定任务的指针文件（归档时清理会话，幂等）。
 * @param root 项目根
 * @param taskRelPath 任务目录相对 .workloom 的路径
 * @returns [err]
 */
export declare function clearPointersToTask(root: string, taskRelPath: string): [Error | null];
