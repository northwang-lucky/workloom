/**
 * 记录一条会话：写 journal、更新个人与全局索引，按配置自动 git 提交。
 * @param {string} root 项目根（或根下任意目录）
 * @param {import('./journal.d.ts').JournalEntryParams} params
 * @returns {Promise<[Error | null, import('./journal.d.ts').AddSessionResult | null]>}
 */
export function addSession(root: string, params: import("./journal.d.ts").JournalEntryParams): Promise<[Error | null, import("./journal.d.ts").AddSessionResult | null]>;
/**
 * 列出 workspace 下各 developer 的 journal 文件与总行数。
 * @param {string} root 项目根（或根下任意目录）
 * @param {import('./journal.d.ts').ListJournalsParams} [params]
 * @returns {[Error | null, import('./journal.d.ts').JournalSummary[] | null]}
 */
export function listJournals(root: string, params?: import("./journal.d.ts").ListJournalsParams): [Error | null, import("./journal.d.ts").JournalSummary[] | null];
