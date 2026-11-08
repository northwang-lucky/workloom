/**
 * executor 并发容量判定（行为移植模块，纯 JS + JSDoc）。
 *
 * 设计意图：
 * - 无状态判定纯函数：输入本会话 running executor 记录集合 + 全局上限 + 本次角色上限，
 *   输出放行/拒绝 + 撞限层级与两边计数上下文；
 * - 语义：按主会话计数（唯一 childId 数）；同一 childId 多条 running 记录合并占 1 槽；
 *   双层均配置时各自独立判定，任一撞限即拒绝（取严）；
 * - 角色闸判定两侧经兼容读归一（过渡期 running 记录值与 role 入参新旧值域混合，
 *   归一后比较避免漏计；值域单源在 executor-roles，禁止在本模块私拷映射）；
 * - 不计入本次待派发记录（调用方传入在途集合，判定是否可再加入一笔）；
 * - 纯同步、无副作用。
 */
import { tryNormalizeExecutorRole } from "./executor-roles.js";
/** at capacity 错误消息前缀（运行时文案英文）。 */
const AT_CAPACITY_PREFIX = 'at capacity';
/**
 * 判定 executor 派发是否放行（纯函数，无状态）。
 *
 * 判定顺序：先全局闸、后角色闸。两闸各自独立计数（按 childId 去重），任一撞限即拒绝；
 * 同时撞限时优先报全局闸（全局层更宽）。
 * @param {import('./executor-capacity.d.ts').CapacityCheckParams} params
 * @returns {import('./executor-capacity.d.ts').CapacityResult}
 */
export function evaluateExecutorCapacity({ running, role, globalLimit, roleLimit }) {
    // 角色闸比较两侧归一：入参与记录值均经非抛错变体归一为新角色值域后比较
    // （旧值混合正确计数）；归一落空的脏值不入角色闸计数，全局闸仍按 childId
    // 去重照常计入（不漏全局容量）。
    const targetRole = tryNormalizeExecutorRole(role);
    // 按 childId 去重计数（同一 childId 多条 running 合并占 1 槽）。
    const globalChildIds = new Set();
    const roleChildIds = new Set();
    for (const record of running) {
        globalChildIds.add(record.childId);
        if (targetRole !== null && tryNormalizeExecutorRole(record.role) === targetRole) {
            roleChildIds.add(record.childId);
        }
    }
    const globalCount = globalChildIds.size;
    const roleCount = roleChildIds.size;
    // 全局闸：globalLimit > 0 时生效（0 = 不限）。
    if (globalLimit > 0 && globalCount >= globalLimit) {
        return { allow: false, layer: 'global', globalCount, roleCount, globalLimit, roleLimit };
    }
    // 角色闸：roleLimit 已配置（非 undefined）且 > 0 时生效。
    if (roleLimit !== undefined && roleLimit > 0 && roleCount >= roleLimit) {
        return { allow: false, layer: 'role', globalCount, roleCount, globalLimit, roleLimit };
    }
    return { allow: true, globalCount, roleCount, globalLimit, roleLimit };
}
/**
 * 组装 at capacity 失败回执文案（英文运行时文案）。
 * 格式：`<role> role at capacity (<roleCount>/<roleLimit>), global <globalCount>/<globalLimit>`
 * （撞角色闸且 globalLimit > 0）；globalLimit = 0（全局不限）时省略 global 段，
 * 输出 `<role> role at capacity (<roleCount>/<roleLimit>)`；
 * 撞全局闸时为 `at capacity (<globalCount>/<globalLimit>)`。
 * @param {string} role executor 角色
 * @param {import('./executor-capacity.d.ts').CapacityResult} result 判定结果（allow = false）
 * @returns {string} 英文回执文案
 */
export function formatAtCapacityReceipt(role, result) {
    if (result.allow)
        return '';
    if (result.layer === 'role') {
        const rolePart = `${role} role at capacity (${result.roleCount}/${result.roleLimit})`;
        // 全局闸 0 = 不限：global 段冗余（X/0 费解），省略。
        if (result.globalLimit === 0)
            return rolePart;
        return `${rolePart}, global ${result.globalCount}/${result.globalLimit}`;
    }
    return `${AT_CAPACITY_PREFIX} (${result.globalCount}/${result.globalLimit})`;
}
//# sourceMappingURL=executor-capacity.js.map