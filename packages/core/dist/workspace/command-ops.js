/**
 * command-ops：init 命令的 runtime 无关编排（新增抽象，TypeScript）。
 *
 * 设计意图：
 * - init 的命令序列（cwd 校验 → 项目定位 → 骨架初始化 → 文本组装）下沉为单一
 *   调用，adapter 只负责投影结果；
 * - 命令恒定 force 语义（幂等补缺件，已有内容一律不覆盖），不再解析自由输入；
 * - 命令资产缺失检查不在本模块：adapter 先 readAssetText（路径用 surface 的
 *   ASSET_COMMAND_*），缺失按现状文案报错后直接返回；
 * - 所有错误消息使用 surface.ERR_PREFIX.command 前缀，与下沉前 adapter
 *   输出的文本逐字一致。
 */
import { initWorkloom } from "./init.js";
import { ERR_PREFIX } from "../injection/surface.js";
/**
 * 执行 init 命令编排：初始化骨架，返回最终成功文本。
 * @param cwd 会话工作目录
 * @returns [err, text]：err 为任一失败步骤（消息含 ERR_PREFIX.command 前缀）
 */
export function executeInitCommand(cwd) {
    try {
        return [null, executeInitInternal(cwd)];
    }
    catch (error) {
        return [toError(error), null];
    }
}
/**
 * init 编排实现（内部）：任一失败抛错，由外层转元组。
 * @param cwd 会话工作目录
 * @returns 最终成功文本
 */
function executeInitInternal(cwd) {
    requireNonEmptyCwd(cwd);
    const [err, result] = initWorkloom(cwd, { force: true });
    if (err !== null) {
        throw new Error(`${ERR_PREFIX.command}: ${err.message}`);
    }
    if (result === null) {
        throw new Error(`${ERR_PREFIX.command}: init returned no result`);
    }
    const lines = [`Workloom initialized at ${result.root}.`];
    if (result.created.length === 0) {
        lines.push('The skeleton is already complete; nothing was created.');
    }
    else {
        lines.push(`Created: ${result.created.join(', ')}.`);
    }
    return lines.join('\n');
}
/** cwd 为空串直接抛错（消息含前缀，与下沉前 adapter 文案逐字一致）。 */
function requireNonEmptyCwd(cwd) {
    if (cwd === '') {
        throw new Error(`${ERR_PREFIX.command}: cannot determine the working directory of this session`);
    }
}
/** 把任意异常归一为 Error（内部）。 */
function toError(value) {
    return value instanceof Error ? value : new Error(String(value));
}
//# sourceMappingURL=command-ops.js.map