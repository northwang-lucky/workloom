import type { CaseStructureIssue, CaseStructureOptions } from './case-structure.ts';
import type { TaskRecord } from './storage/index.ts';
/**
 * 最终执行前置：仅 required=true 的新流程任务受约束。
 * @param {string} root 项目根
 * @param {string} taskRelPath 任务相对路径
 * @param {TaskRecord} task 任务记录
 * @returns {string[]} 缺失项描述列表
 */
export declare function evaluateCaseExecutionGate(root: string, taskRelPath: string, task: TaskRecord): string[];
/**
 * 最终 check/archive 共用的硬校验。
 * @param {string} root 项目根
 * @param {string} taskRelPath 任务相对路径
 * @param {TaskRecord} task 任务记录
 * @param {CaseStructureOptions} [options] 变更文件等求值选项
 * @returns {CaseStructureIssue[]} 全部核心问题
 */
export declare function evaluateCaseOutcomeGate(root: string, taskRelPath: string, task: TaskRecord, options?: CaseStructureOptions): CaseStructureIssue[];
