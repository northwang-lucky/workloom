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
import { readFileSync } from 'node:fs';
import { ERR_PREFIX } from "./prompt-compose.js";
/** 截断提示前缀（limitByBytes 超预算截断后追加）。 */
const TRUNCATED_PREFIX = '[...truncated at ';
/** 截断提示结尾。 */
const TRUNCATED_SUFFIX = ' bytes]';
/**
 * 按字节上限截断文本；超限时截断内容后追加截断提示，返回截断标记。
 * maxBytes 为 0 表示不限制。
 * @param {string} text 原始文本
 * @param {number} maxBytes 字节上限
 * @returns {{text: string, truncated: boolean}}
 */
export function limitByBytes(text, maxBytes) {
    if (maxBytes === 0 || byteLength(text) <= maxBytes) {
        return { text, truncated: false };
    }
    return {
        text: `${truncateUtf8(text, maxBytes)}\n${TRUNCATED_PREFIX}${maxBytes}${TRUNCATED_SUFFIX}`,
        truncated: true,
    };
}
/**
 * UTF-8 安全截断：不切断多字节字符（避免 U+FFFD 乱码）。
 * @param {string} text 原始文本
 * @param {number} maxBytes 字节上限
 * @returns {string}
 */
export function truncateUtf8(text, maxBytes) {
    let sliced = Buffer.from(text, 'utf8').subarray(0, maxBytes);
    while (sliced.length > 0 && sliced.toString('utf8').endsWith('\uFFFD')) {
        sliced = sliced.subarray(0, sliced.length - 1);
    }
    return sliced.toString('utf8');
}
/** @param {string} text @returns {number} UTF-8 字节数 */
export function byteLength(text) {
    return Buffer.byteLength(text, 'utf8');
}
/**
 * 读取任务目录内文件（缺失返回 null，其他错误透传）。
 * @param {string} absPath 绝对路径
 * @returns {string | null}
 */
export function readTaskFile(absPath) {
    try {
        return readFileSync(absPath, 'utf8');
    }
    catch (error) {
        if (isEnoent(error))
            return null;
        throw error;
    }
}
/** 校验 params 的字符串字段（内部）。
 * @param {object} params 入参对象
 * @param {string} field 字段名
 */
export function requireStringField(params, field) {
    const value = /** @type {Record<string, unknown>} */ (params)[field];
    if (typeof value !== 'string') {
        throw new Error(`${ERR_PREFIX}: ${field} must be a string (got ${typeof value})`);
    }
}
/** @param {unknown} value @returns {Error} */
export function toError(value) {
    return value instanceof Error ? value : new Error(String(value));
}
/** 判断异常是否为文件不存在（内部）。 */
export function isEnoent(error) {
    return error?.code === 'ENOENT';
}
/**
 * 缺失或形态不符（目录不存在/父级是文件）均按“无”处理。
 * @param {unknown} error 捕获的异常
 * @returns {boolean}
 */
export function isMissingLike(error) {
    const code = error.code;
    return code === 'ENOENT' || code === 'ENOTDIR';
}
//# sourceMappingURL=prompt-io.js.map