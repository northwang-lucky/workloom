/**
 * storage/create：任务创建与 slug 校验。
 *
 * 设计意图：
 * - 承载 createTask 全链：slug 派生与校验、parent 归一与校验、记录组装、目录与
 *   四文件落盘（task.json/prd.md/两个 jsonl）、after_create hooks 与父子联动；
 * - 校验全部前置于任何写盘，失败即零部分状态；
 * - 会话指针绑定归编排层（executeCreateTask），存储层不消费 contextKey；
 * - 公开函数返回 [err, value] 命名元组，内部错误统一转换为 Error。
 */
import type { CreateTaskParams, CreateTaskResult } from './records.ts';
/**
 * 由标题生成 kebab-case slug：非字母数字转连字符、去首尾连字符、全小写、截断 40 字符。
 * @param title 任务标题
 * @returns slug
 */
export declare function slugify(title: string): string;
/** 生成 {YYYY-MM} 归档前缀。 */
export declare function formatYearMonth(date: Date): string;
/**
 * 创建任务：建目录、写 task.json/prd.md/两个 jsonl，执行 after_create hooks。
 * 会话指针绑定归编排层（executeCreateTask），存储层不消费 contextKey。
 * @param root 项目根（或根下任意目录）
 * @param params 创建参数
 * @returns [err, result]
 */
export declare function createTask(root: string, params: CreateTaskParams): Promise<[Error | null, CreateTaskResult | null]>;
