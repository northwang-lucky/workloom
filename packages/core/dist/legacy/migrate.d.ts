/**
 * 迁移旧 .trellis 项目到 .workloom（目录复制 + config 映射 + workflow 存档）。
 * @param {string} root 项目根（或根下任意目录）
 * @param {import('./migrate.d.ts').MigrateLegacyTrellisParams} [params] 迁移参数
 * @returns {[Error | null, import('./migrate.d.ts').MigrateLegacyTrellisResult | null]}
 */
export function migrateLegacyTrellis(root: string, params?: import("./migrate.d.ts").MigrateLegacyTrellisParams): [Error | null, import("./migrate.d.ts").MigrateLegacyTrellisResult | null];
