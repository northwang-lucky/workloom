/**
 * 计算「states 声明了但文档缺对应 tag 块」的警告列表。
 * 内部导出：breadcrumb 合并 overlay 后重算 warnings 时复用。
 * @param {string[]} states 契约声明的状态
 * @param {Map<string, string>} breadcrumbs 已解析的 tag 块
 * @returns {string[]}
 */
export function buildWarnings(states: string[], breadcrumbs: Map<string, string>): string[];
/**
 * 解析契约文档；front-matter 是否必需由 requireFrontMatter 决定。
 * 内部导出：breadcrumb.mergeOverlay 用它解析 overlay（front-matter 可选）。
 * @param {string} markdownText 文档全文
 * @param {{ requireFrontMatter: boolean }} opts 解析选项
 * @returns {import('../workflow-contract-types.js').WorkflowContract}
 */
export function parseDocument(markdownText: string, { requireFrontMatter }: {
    requireFrontMatter: boolean;
}): import("../workflow-contract-types.js").WorkflowContract;
/**
 * 解析工作流契约文档（front-matter 必需）；坏文档返回 err。
 * @param {string} markdownText 契约文档全文
 * @returns {[Error | null, import('../workflow-contract-types.js').WorkflowContract | null]}
 */
export function parseContract(markdownText: string): [Error | null, import("../workflow-contract-types.js").WorkflowContract | null];
/**
 * 契约解析错误：携带字段路径与原因，便于上层显式报告。
 */
export class WorkflowContractError extends Error {
    /**
     * @param {string} field 出错位置（字段路径或行号上下文）
     * @param {string} reason 具体原因
     */
    constructor(field: string, reason: string);
    field: string;
}
