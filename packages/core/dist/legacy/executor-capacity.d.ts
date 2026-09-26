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
 * 或 `at capacity (<globalCount>/<globalLimit>)`（撞全局闸）。
 * @param {string} kind executor 类型
 * @param {import('./executor-capacity.d.ts').CapacityResult} result 判定结果（allow = false）
 * @returns {string} 英文回执文案
 */
export function formatAtCapacityReceipt(kind: string, result: import("./executor-capacity.d.ts").CapacityResult): string;
