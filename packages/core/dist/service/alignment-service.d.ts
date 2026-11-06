/**
 * alignment-service：workloom_task_align 工具的 runtime 无关编排（TypeScript）。
 * PRD 与 PLAN 分阶段内容确认的 review/confirm 两步协议与结构校验的「服务编排」。
 *
 * 设计意图：
 * - review 只读：按 target 返回 PRD 或 PLAN 的内容快照、结构诊断与现有确认记录
 *   （零写盘）；不完整的草稿照样可读，就绪与否由 readyToConfirm 表达；
 * - confirm 同步全链路：内容 blocker（复用 task-gates 的结构分类器）聚合拒绝
 *   → summary 非空 → 只经 task-store 的窄写口原子落盘（PRD 用
 *   recordAlignmentCredential，PLAN 用 recordPlanConfirmation）；确认记录只含
 *   passedAt 与 summary，无哈希，每次确认都刷新为最近一次；
 * - PLAN 确认要求 PRD 已有确认记录（顺序前置在窄写口硬校验，R3）；
 * - cwd/root/task 解析与 task-ops 同款（requireWorkloomCwd + resolveTaskRelPath +
 *   findWorkloomRoot），adapter 只负责投影返回与主会话限制。
 */
import type { TaskAlignmentRecord, TaskPlanConfirmationRecord, TaskStatusValue } from '../domain/task-store.d.ts';
/** 确认对象：prd（缺省，兼容旧调用）或 plan。 */
export type AlignTarget = 'prd' | 'plan';
/** 结构诊断的公共形态（PRD 与 PLAN 结构分类器产物形状一致，section 字段可选）。 */
export type ConfirmStructureIssue = {
    code: string;
    message: string;
};
/**
 * review 成功结果：内容快照 + 结构诊断 + 现有确认记录（零写盘）。
 * target=prd 时只填 prd 侧字段；target=plan 时 plan 为 PLAN 快照，
 * 结构问题来自 PLAN 分类器（PLAN 缺失同样以结构问题表达，不报错）。
 */
export interface AlignReviewResult {
    action: 'review';
    target: AlignTarget;
    taskRelPath: string;
    status: TaskStatusValue;
    prd: string | null;
    /** target=plan 时的 PLAN 快照；target=prd 恒为 null。 */
    plan: string | null;
    /** 当前确认对象的结构问题（PRD：H1 → 骨架小节 → R/AC 追踪；PLAN：标题/Steps/字段/AC 覆盖）。 */
    structureIssues: ConfirmStructureIssue[];
    /** structureIssues 的英文文案投影，供主会话直接展示。 */
    confirmBlockers: string[];
    /** 严格等价于 structureIssues 为空：只表达内容级 confirm 前置条件。 */
    readyToConfirm: boolean;
    alignment: TaskAlignmentRecord | null;
    planConfirmation: TaskPlanConfirmationRecord | null;
}
/** PRD confirm 成功结果：写入后的 PRD 确认记录。 */
export interface PrdConfirmResult {
    action: 'confirm';
    target: 'prd';
    taskRelPath: string;
    alignment: TaskAlignmentRecord;
    planConfirmation: null;
}
/** PLAN confirm 成功结果：写入后的 PLAN 确认记录。 */
export interface PlanConfirmResult {
    action: 'confirm';
    target: 'plan';
    taskRelPath: string;
    alignment: null;
    planConfirmation: TaskPlanConfirmationRecord;
}
/** confirm 成功结果（target 二态）。 */
export type AlignConfirmResult = PrdConfirmResult | PlanConfirmResult;
/** executeAlignTask 入参（taskPath 缺省取活跃任务）。 */
export interface ExecuteAlignTaskParams {
    taskPath?: string;
    /** 确认对象：prd（缺省，兼容旧调用）或 plan。 */
    target?: AlignTarget;
    /** review 只读返回内容快照与诊断；confirm 校验后写入确认记录。 */
    action: 'review' | 'confirm';
    /** confirm 必填：内容确认摘要（覆盖范围、关键决策与确认结果）。 */
    summary?: string;
}
/** 工具成功结果（review/confirm 两态）。 */
export type ExecuteAlignTaskResult = AlignReviewResult | AlignConfirmResult;
/**
 * 执行 workloom_task_align 编排（全程同步）。
 * @param cwd 会话工作目录
 * @param contextKey 会话标识（taskPath 缺省时取活跃任务）
 * @param params 工具参数
 * @returns [err, result]：err 为任一失败（消息含前缀；失败零写入）
 */
export declare function executeAlignTask(cwd: string, contextKey: string, params: ExecuteAlignTaskParams): [Error | null, ExecuteAlignTaskResult | null];
