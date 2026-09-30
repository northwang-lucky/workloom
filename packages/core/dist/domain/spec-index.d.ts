/**
 * 收集 spec 索引路径列表（同步）。
 * @param {string} root 项目根（必须已是 findWorkloomRoot 的结果）
 * @param {import('./config.d.ts').WorkloomConfig} config loadConfig 产物
 * @returns {[Error | null, import('./spec-index.d.ts').SpecIndexResult | null]}
 */
export function collectSpecIndexes(root: string, config: import("./config.d.ts").WorkloomConfig): [Error | null, import("./spec-index.d.ts").SpecIndexResult | null];
/** guidelines 段累计字节上限，超限停止收集。 */
export const MAX_GUIDELINES_BYTES: 8192;
