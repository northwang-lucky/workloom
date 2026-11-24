import type { ChangedLineRange } from '../workspace/git-query.ts';
import type { TaskRecord } from './storage/index.ts';
/**
 * @param {string} root 项目根
 * @param {string} taskRelPath 任务相对路径
 * @returns {string} 任务目录绝对路径
 */
export declare function taskDirectory(root: string, taskRelPath: string): string;
/**
 * @param {string} root 项目根
 * @param {TaskRecord} task 任务记录
 * @returns {string} 代码 worktree 或项目根
 */
export declare function worktreeDirectory(root: string, task: TaskRecord): string;
/**
 * 返回实际 git 变更；无变更时由结果校验回退到 SR 声明范围。
 * @param {string} root 项目根
 * @param {TaskRecord} task 任务记录
 * @returns {[Error | null, string[] | null]} git 错误或变更文件列表
 */
export declare function listCaseChangedFiles(root: string, task: TaskRecord): [Error | null, string[] | null];
/**
 * 任务 diff 变更行清单（增量覆盖率门禁的分母口径）：
 * branch 与 base_branch 均非空时用 base_branch...HEAD 三点 diff；字段为空时走
 * 两点工作区 diff + 未跟踪文件；声明 ref 无效由原语 err 透传，不回退。
 * .workloom/ 元数据不属源码分母，直接过滤。
 * @returns {[Error | null, Map<string, ChangedLineRange[]> | null]} git 错误或变更行
 */
export declare function listCaseChangedLines(root: string, task: TaskRecord): [Error | null, Map<string, ChangedLineRange[]> | null];
