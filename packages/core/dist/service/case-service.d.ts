import type { CaseStructureIssue } from '../domain/case.d.ts';
import type { TaskStatusValue } from '../domain/task-store.d.ts';
/** review 成功结果：CASE 内容 + 结构诊断 + 会话链现状（零写盘，无哈希）。 */
export interface CaseReviewResult {
    action: 'review';
    taskRelPath: string;
    status: TaskStatusValue;
    /** case.md 全文快照（缺失为 null，由结构问题表达）。 */
    case: string | null;
    /** 当前 CASE 设计会话（未记录为 null；执行续接的定位依据）。 */
    designSession: string | null;
    /** CASE 结构问题（顺序由分类器决定，一次返回全部）。 */
    structureIssues: CaseStructureIssue[];
    /** structureIssues 的英文文案投影，供主会话直接展示。 */
    blockers: string[];
    /** 严格等价于 structureIssues 为空：主会话复核的机器可读参考。 */
    readyForExecution: boolean;
}
export interface ExecuteTaskCaseParams {
    taskPath?: string;
    /** 只支持 review：复核诊断只读，不写任何记录。 */
    action: 'review';
}
export type ExecuteTaskCaseResult = CaseReviewResult;
export declare function executeTaskCase(cwd: string, contextKey: string, params: ExecuteTaskCaseParams): [Error | null, ExecuteTaskCaseResult | null];
