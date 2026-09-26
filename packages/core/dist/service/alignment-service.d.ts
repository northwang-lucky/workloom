/**
 * alignment-service：workloom_task_align 工具的 runtime 无关编排（新增抽象，
 * TypeScript）。review/confirm 两步协议与 PRD 校验的「服务编排」。
 *
 * 设计意图：
 * - review 只读：返回当前 prd 快照、其 hash、开放节点状态、内容结构诊断与现有
 *   alignment 凭据（零写盘）；不完整的草稿照样可读，就绪与否由 readyToConfirm 表达；
 * - confirm 同步全链路：内容 blocker（复用 task-gates 的 PRD 结构分类器）聚合拒绝
 *   → 重算 hash 与 expectedPrdHash 比对 → 只经 task-store 的
 *   recordAlignmentCredential 窄写口原子落盘（同 hash 幂等，不刷新 passedAt）；
 *   任一步失败零写入；
 * - cwd/root/task 解析与 task-ops 同款（requireWorkloomCwd + resolveTaskRelPath +
 *   findWorkloomRoot），adapter 只负责投影返回与主会话限制。
 */
import type { TaskAlignmentRecord, TaskStatusValue } from '../legacy/task-store.d.ts';
import type { OpenNodeState } from '../legacy/alignment.d.ts';
import type { PrdStructureIssue } from '../legacy/task-gates.d.ts';
/**
 * review 成功结果：prd 快照 + hash + 开放节点状态 + 内容就绪诊断 + 现有凭据（零写盘）。
 */
export interface AlignReviewResult {
    action: 'review';
    taskRelPath: string;
    status: TaskStatusValue;
    prd: string | null;
    prdHash: string | null;
    openNodeState: OpenNodeState | null;
    /** 当前 prd 内容的结构问题（顺序固定：H1 → 骨架小节 → open nodes）。 */
    structureIssues: PrdStructureIssue[];
    /** structureIssues 的英文文案投影，供主会话直接展示。 */
    confirmBlockers: string[];
    /** 严格等价于 structureIssues 为空：只表达内容级 confirm 前置条件。 */
    readyToConfirm: boolean;
    alignment: TaskAlignmentRecord | null;
}
/** confirm 成功结果：写入（或幂等早退）后的凭据。 */
export interface AlignConfirmResult {
    action: 'confirm';
    taskRelPath: string;
    prdHash: string;
    /** 幂等早退（相同 hash 重复 confirm）为 true；本次新写/覆盖为 false。 */
    idempotent: boolean;
    alignment: TaskAlignmentRecord;
}
/** executeAlignTask 入参（taskPath 缺省取活跃任务）。 */
export interface ExecuteAlignTaskParams {
    taskPath?: string;
    /** review 只读返回快照/hash；confirm 校验后写入凭据。 */
    action: 'review' | 'confirm';
    /** confirm 必填：用户审阅版本的 prd hash。 */
    expectedPrdHash?: string;
    /** confirm 必填：Phase 1.1 收敛摘要。 */
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
