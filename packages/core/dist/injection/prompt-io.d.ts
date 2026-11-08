/**
 * prompt-io：executor prompt 组装的预算与文件工具（prompt-compose 兄弟文件）。
 *
 * 设计意图：
 * - 承载与组装语义无关的底层工具：字节预算截断（UTF-8 安全，不切断多字节
 *   字符）、任务文件读取（缺失返回 null，其他错误透传）、入参字符串字段校验
 *   与异常归一；
 * - 仅供 injection/ 内 prompt-compose 入口与 prompt-sections 消费，不进 core
 *   index.ts 的对外重导出面；
 * - 跨文件共享的 ERR_PREFIX 单源在 prompt-compose 入口（兄弟文件相对导入）。
 */
import type { BuildExecutorPromptParams } from './prompt-compose.ts';
/**
 * 按字节上限截断文本；超限时截断内容后追加截断提示，返回截断标记。
 * maxBytes 为 0 表示不限制。
 * @param {string} text 原始文本
 * @param {number} maxBytes 字节上限
 * @returns {{text: string, truncated: boolean}}
 */
export declare function limitByBytes(text: string, maxBytes: number): {
    text: string;
    truncated: boolean;
};
/**
 * UTF-8 安全截断：不切断多字节字符（避免 U+FFFD 乱码）。
 * @param {string} text 原始文本
 * @param {number} maxBytes 字节上限
 * @returns {string}
 */
export declare function truncateUtf8(text: string, maxBytes: number): string;
/** @param {string} text @returns {number} UTF-8 字节数 */
export declare function byteLength(text: string): number;
/**
 * 读取任务目录内文件（缺失返回 null，其他错误透传）。
 * @param {string} absPath 绝对路径
 * @returns {string | null}
 */
export declare function readTaskFile(absPath: string): string | null;
/** 校验 params 的字符串字段（内部）。
 * @param {object} params 入参对象
 * @param {string} field 字段名
 */
export declare function requireStringField(params: BuildExecutorPromptParams, field: 'root' | 'taskRelPath' | 'userPrompt'): void;
/** @param {unknown} value @returns {Error} */
export declare function toError(value: unknown): Error;
/** 判断异常是否为文件不存在（内部）。 */
export declare function isEnoent(error: unknown): boolean;
/**
 * 缺失或形态不符（目录不存在/父级是文件）均按“无”处理。
 * @param {unknown} error 捕获的异常
 * @returns {boolean}
 */
export declare function isMissingLike(error: unknown): boolean;
