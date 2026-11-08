/**
 * storage/list-archive：hooks 执行、任务列举与归档物理写。
 *
 * 设计意图：
 * - hooks 与 git 失败只收集 WARNING（console.warn），不阻塞主操作；
 * - 列举只读（缺失或损坏的目录跳过不阻塞）；归档是物理移动（renameSync 整体
 *   搬迁任务目录），状态写与指针清理归编排层（task-ops）；
 * - 公开函数返回 [err, value] 命名元组；路径一律经 locate.insideWorkloom 防越界。
 */
import type { ListTasksParams, TaskSummary } from './records.ts';
/**
 * hooks 事件名（task.json.hooks 的键；旧格式任务缺省时统一补齐为空数组，
 * 消费点在 read-write 的 normalizeTaskRecord）。
 */
export declare const HOOK_KEYS: readonly ["after_create", "after_start", "after_finish", "after_archive"];
/**
 * 执行 hooks：注入 TASK_JSON_PATH 环境变量；单个失败收集为 WARNING，不抛错。
 * @param root 项目根（作为 hooks 的工作目录）
 * @param taskJsonPath task.json 绝对路径
 * @param commands shell 命令列表
 * @returns WARNING 消息列表（空数组表示全部成功）
 */
export declare function runTaskHooks(root: string, taskJsonPath: string, commands: string[]): Promise<string[]>;
/**
 * 非阻塞告警统一出口（内部；编排层共用）。
 * @param warnings WARNING 消息列表
 */
export declare function logWarnings(warnings: string[]): void;
/**
 * 列出任务摘要（不含 archive/），可按状态过滤；缺失或损坏的目录跳过。
 * @param root 项目根
 * @param params 过滤参数
 * @returns [err, summaries]
 */
export declare function listTasks(root: string, params?: ListTasksParams): [Error | null, TaskSummary[] | null];
/**
 * 计算归档目标相对路径（tasks/archive/<YYYY-MM>/<task.name>）。
 * @param taskName 任务 slug（task.name）
 * @param now 归档时刻
 * @returns 归档相对路径
 */
export declare function archiveRelPathOf(taskName: string, now: Date): string;
/**
 * 归档物理移动（内部写口）：目标冲突先查（避免半完成态），mkdir 父目录后
 * renameSync 整体移动任务目录；不做状态写与指针清理（归编排层）。
 * @param root 项目根
 * @param taskRelPath 任务目录相对 .workloom 的路径
 * @param archiveRel 归档目标相对路径
 * @returns [err, 归档目录绝对路径]
 */
export declare function moveTaskToArchive(root: string, taskRelPath: string, archiveRel: string): [Error | null, string | null];
/**
 * 按任务名在 tasks/archive/<YYYY-MM>/ 下查找归档目录，返回最新月份的归档任务相对路径。
 * 供归档兼容解析使用：子任务归档后 task.children 仍指向归档前路径，
 * 读子任务材料（如 plan.md）时应先用原路径，缺失时回退到本函数结果。
 * @param root 项目根
 * @param taskRelPath 任务相对路径（如 tasks/<name>）
 * @returns 归档任务相对路径；未归档或无归档目录时返回 null
 */
export declare function findArchivedTaskPath(root: string, taskRelPath: string): string | null;
