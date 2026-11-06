/**
 * doctor 检查引擎的任务扫描与 issue/报告辅助（只读）。
 *
 * 设计意图：
 * - allIssues 在检查度量之间共享「拉平」口径；
 * - makeIssue 组装 issue 字段；
 * - 运行时 issue/message 文案英文；注释中文。
 */
import type { DoctorCheck, DoctorIssue, DoctorIssueCode, DoctorSeverity } from './doctor-types.ts';
/** 拉平全部检查的 issue 列表。 */
export declare function allIssues(checks: DoctorCheck[]): DoctorIssue[];
/** issue 唯一键：code+task+title+message（修复前后判「已消解」用）。 */
export declare function issueKey(issue: DoctorIssue): string;
/** 把某检查产出追加到 issueMap 对应桶（初始化过，恒存在）。 */
export declare function pushIssues(issueMap: Map<DoctorIssueCode, DoctorIssue[]>, code: DoctorIssueCode, issues: DoctorIssue[]): void;
/** makeIssue 入参（hint 可省略）。 */
export interface IssueInput {
    code: DoctorIssueCode;
    title: string;
    severity: DoctorSeverity;
    task: string | null;
    message: string;
    path: string | null;
    fixable: boolean;
    hint?: string | null;
}
/** 组装一条 issue（缺省 hint 为 null，保证字段齐全）。 */
export declare function makeIssue(input: IssueInput): DoctorIssue;
