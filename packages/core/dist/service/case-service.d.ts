import type { CaseStructureIssue, TaskCaseRecord } from '../domain/case.d.ts';
import type { TaskStatusValue } from '../domain/task-store.d.ts';
export interface CaseReviewResult {
    action: 'review';
    taskRelPath: string;
    status: TaskStatusValue;
    case: string | null;
    caseHash: string | null;
    structureIssues: CaseStructureIssue[];
    confirmBlockers: string[];
    readyToConfirm: boolean;
    caseRecord: TaskCaseRecord | null;
}
export interface CaseConfirmResult {
    action: 'confirm';
    taskRelPath: string;
    caseHash: string;
    idempotent: boolean;
    caseRecord: TaskCaseRecord;
}
export interface ExecuteTaskCaseParams {
    taskPath?: string;
    action: 'review' | 'confirm';
    expectedCaseHash?: string;
    summary?: string;
}
export type ExecuteTaskCaseResult = CaseReviewResult | CaseConfirmResult;
export declare function executeTaskCase(cwd: string, contextKey: string, params: ExecuteTaskCaseParams): [Error | null, ExecuteTaskCaseResult | null];
