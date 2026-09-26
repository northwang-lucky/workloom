/**
 * doctor 检查引擎的任务扫描与 issue/报告辅助（只读）。
 *
 * 设计意图：
 * - collectTasks 统一枚举 active + archive 任务，供 10 类检查与修复器复用；
 * - allIssues/issueKey 在检查与修复度量之间共享「拉平」「唯一键」口径；
 * - taskJsonPath/canonicalRef/pointerPath 拼装 issue 引用的路径；makeIssue 组装 issue 字段；
 * - 运行时 issue/message 文案英文；注释中文。
 */
import type { DoctorCheck, DoctorIssue, DoctorIssueCode, DoctorSeverity, TaskNode } from './doctor-types.js';
/** 枚举全部任务目录（active + archive），损坏/缺失目录跳过。 */
export declare function collectTasks(root: string): TaskNode[];
/** 拉平全部检查的 issue 列表。 */
export declare function allIssues(checks: DoctorCheck[]): DoctorIssue[];
/** issue 唯一键：code+task+title+message（修复前后判「已消解」用）。 */
export declare function issueKey(issue: DoctorIssue): string;
/** 把某检查产出追加到 issueMap 对应桶（初始化过，恒存在）。 */
export declare function pushIssues(issueMap: Map<DoctorIssueCode, DoctorIssue[]>, code: DoctorIssueCode, issues: DoctorIssue[]): void;
/** 任务级 issue 的 task.json 路径（相对项目根）。 */
export declare function taskJsonPath(relPath: string): string;
/** 规范化父子引用：tasks/<name>。 */
export declare function canonicalRef(name: string): string;
/** 指针文件路径（相对项目根，给 issue.path 用）。 */
export declare function pointerPath(contextKey: string): string;
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
