/**
 * executor 并发容量判定（行为移植模块，纯 JS + JSDoc）。
 *
 * 设计意图：
 * - 无状态判定纯函数：输入本会话 running executor 记录集合 + 全局上限 + 本次 kind 上限，
 *   输出放行/拒绝 + 撞限层级与两边计数上下文；
 * - 语义：按主会话计数（唯一 childId 数）；同一 childId 多条 running 记录合并占 1 槽；
 *   双层均配置时各自独立判定，任一撞限即拒绝（取严）；
 * - 不计入本次待派发记录（调用方传入在途集合，判定是否可再加入一笔）；
 * - 纯同步、无副作用。
 */
/** at capacity 错误消息前缀（运行时文案英文）。 */
const AT_CAPACITY_PREFIX = 'at capacity';
/**
 * 判定 executor 派发是否放行（纯函数，无状态）。
 *
 * 判定顺序：先全局闸、后 kind 闸。两闸各自独立计数（按 childId 去重），任一撞限即拒绝；
 * 同时撞限时优先报全局闸（全局层更宽）。
 * @param {import('./executor-capacity.d.ts').CapacityCheckParams} params
 * @returns {import('./executor-capacity.d.ts').CapacityResult}
 */
export function evaluateExecutorCapacity({ running, kind, globalLimit, kindLimit }) {
    // 按 childId 去重计数（同一 childId 多条 running 合并占 1 槽）。
    const globalChildIds = new Set();
    const kindChildIds = new Set();
    for (const record of running) {
        globalChildIds.add(record.childId);
        if (record.kind === kind)
            kindChildIds.add(record.childId);
    }
    const globalCount = globalChildIds.size;
    const kindCount = kindChildIds.size;
    // 全局闸：globalLimit > 0 时生效（0 = 不限）。
    if (globalLimit > 0 && globalCount >= globalLimit) {
        return { allow: false, layer: 'global', globalCount, kindCount, globalLimit, kindLimit };
    }
    // kind 闸：kindLimit 已配置（非 undefined）且 > 0 时生效。
    if (kindLimit !== undefined && kindLimit > 0 && kindCount >= kindLimit) {
        return { allow: false, layer: 'kind', globalCount, kindCount, globalLimit, kindLimit };
    }
    return { allow: true, globalCount, kindCount, globalLimit, kindLimit };
}
/**
 * 组装 at capacity 失败回执文案（英文运行时文案）。
 * 格式：`<kind> kind at capacity (<kindCount>/<kindLimit>), global <globalCount>/<globalLimit>`
 * 或 `at capacity (<globalCount>/<globalLimit>)`（撞全局闸）。
 * @param {string} kind executor 类型
 * @param {import('./executor-capacity.d.ts').CapacityResult} result 判定结果（allow = false）
 * @returns {string} 英文回执文案
 */
export function formatAtCapacityReceipt(kind, result) {
    if (result.allow)
        return '';
    if (result.layer === 'kind') {
        return `${kind} kind at capacity (${result.kindCount}/${result.kindLimit}), global ${result.globalCount}/${result.globalLimit}`;
    }
    return `${AT_CAPACITY_PREFIX} (${result.globalCount}/${result.globalLimit})`;
}
//# sourceMappingURL=executor-capacity.js.map