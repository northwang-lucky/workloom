/**
 * storage/read-write：task.json 物理读写与序列化。
 *
 * 设计意图：
 * - 只承载 task.json 的读取（结构化归一，不解释 mode/stage 值域）与原子写入
 *   （file-atomic 临时文件 + rename 替换，并发写串行化由原子替换保证）；
 * - 公开函数返回 [err, value] 命名元组，内部错误统一转换为 Error；
 * - 归一只补默认值（hooks/overrides/dispatches 等缺省字段），mode/stage/status
 *   保持落盘原值，值域解释归 task/state 的 readTaskView 兼容读单点；
 * - 路径一律经 locate.insideWorkloom 防越界。
 */
import type { TaskRecord, TaskRecordWithPath } from './records.ts';
/** hooks 注入的 task.json 环境变量名（消费点在 list-archive 的 runHookOnce）。 */
export declare const TASK_JSON_ENV = "TASK_JSON_PATH";
/**
 * 解析并校验项目根（向上查找 .workloom）。
 * @param root 起始目录（项目根或其子目录）
 * @returns 项目根绝对路径
 */
export declare function requireProjectRoot(root: string): string;
/**
 * 读取任务原始记录：task.json 缺失或损坏返回 err；成功时对象附带 taskRelPath。
 * 结构化归一只补默认值；mode/stage/status 值域解释归 task/state 的兼容读。
 * @param root 项目根
 * @param taskRelPath 任务目录相对 .workloom 的路径
 * @returns [err, record]
 */
export declare function readTaskRecord(root: string, taskRelPath: string): [Error | null, TaskRecordWithPath | null];
/**
 * 读取任务原始记录并确保非空（失败抛错；存储层与编排层共用的读取入口）。
 * @param root 项目根
 * @param taskRelPath 任务目录相对 .workloom 的路径
 * @returns 归一后的原始记录（含 taskRelPath）
 */
export declare function requireTaskRecord(root: string, taskRelPath: string): TaskRecordWithPath;
/**
 * 序列化并原子写入 task.json（常规写口；file-atomic 临时文件 + rename 替换，
 * 并发写串行化由原子替换保证）。
 * @param root 项目根
 * @param taskRelPath 任务目录相对 .workloom 的路径
 * @param record 任务记录（可含 taskRelPath，落盘前剔除）
 */
export declare function writeTaskRecord(root: string, taskRelPath: string, record: TaskRecordWithPath | TaskRecord): void;
/**
 * 序列化并原子写入指定目录内的 task.json（归档位置写回等目录已知的场景）。
 * @param taskDir 任务目录绝对路径
 * @param record 任务记录
 */
export declare function writeTaskRecordToDir(taskDir: string, record: TaskRecordWithPath | TaskRecord): void;
/**
 * 读取任务目录内文件内容（缺失返回 null，其他错误透传；守卫与编排层共用）。
 * @param root 项目根
 * @param taskRelPath 任务目录相对 .workloom 的路径
 * @param fileName 文件名
 * @returns 文件全文或 null
 */
export declare function readTaskFileOrNull(root: string, taskRelPath: string, fileName: string): string | null;
