/**
 * 把 overlay 文档合并进内置契约（同键覆盖，返回新对象，不改原 contract）。
 * @param {import('../workflow-contract-types.js').WorkflowContract} contract 内置契约
 * @param {string} overlayText overlay 文档全文（front-matter 可选）
 * @returns {[Error | null, import('../workflow-contract-types.js').WorkflowContract | null]}
 */
export function mergeOverlay(contract: import("../workflow-contract-types.js").WorkflowContract, overlayText: string): [Error | null, import("../workflow-contract-types.js").WorkflowContract | null];
/**
 * 按状态组装 breadcrumb 正文。
 * @param {import('../workflow-contract-types.js').WorkflowContract} contract 契约
 * @param {string} status 任务当前状态（须先映射进契约 states）
 * @returns {[Error | null, string | null]}
 */
export function buildBreadcrumb(contract: import("../workflow-contract-types.js").WorkflowContract, status: string): [Error | null, string | null];
/**
 * 判断用户消息是否命中逃生舱关键词（独立词、大小写不敏感）。
 * @param {import('./config.d.ts').WorkloomConfig} config 配置
 * @param {string} userPrompt 用户消息
 * @returns {boolean}
 */
export function shouldSkipBreadcrumb(config: import("./config.d.ts").WorkloomConfig, userPrompt: string): boolean;
