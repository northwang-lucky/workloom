/**
 * 判定 executor 派发是否放行（纯函数，无状态）。
 *
 * 判定顺序：先全局闸、后 kind 闸。两闸各自独立计数（按 childId 去重），任一撞限即拒绝；
 * 同时撞限时优先报全局闸（全局层更宽）。
 * @param {import('./executor-capacity.d.ts').CapacityCheckParams} params
 * @returns {import('./executor-capacity.d.ts').CapacityResult}
 */
export function evaluateExecutorCapacity({ running, kind, globalLimit, kindLimit }: import("./executor-capacity.d.ts").CapacityCheckParams): import("./executor-capacity.d.ts").CapacityResult;
/**
 * 组装 at capacity 失败回执文案（英文运行时文案）。
 * 格式：`<kind> kind at capacity (<kindCount>/<kindLimit>), global <globalCount>/<globalLimit>`
 * （撞 kind 闸且 globalLimit > 0）；globalLimit = 0（全局不限）时省略 global 段，
 * 输出 `<kind> kind at capacity (<kindCount>/<kindLimit>)`；
 * 撞全局闸时为 `at capacity (<globalCount>/<globalLimit>)`。
 * @param {string} kind executor 类型
 * @param {import('./executor-capacity.d.ts').CapacityResult} result 判定结果（allow = false）
 * @returns {string} 英文回执文案
 */
export function formatAtCapacityReceipt(kind: string, result: import("./executor-capacity.d.ts").CapacityResult): string;
