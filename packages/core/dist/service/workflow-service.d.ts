/**
 * workflow-service：adapter 侧组装 breadcrumb 的编排服务（新增抽象，TypeScript）。
 *
 * 设计意图：
 * - 把「校验项目根 → 加载配置 → 读 overlay → 解析契约 → 解析当前任务 →
 *   逃生舱判定 → 组装指引」编排成单次调用，adapter 只需提供 root/contextKey/契约全文；
 * - 任何一步失败显式抛错（fail loud），仅 overlay 文件缺失视为无 overlay；
 * - assembleBreadcrumb 是异步入口（规格约定）；同步核心 assembleBreadcrumbSync
 *   供 systemPrompt 的同步 text provider 直接调用，避免编排逻辑重复。
 */
/** overlay 文件相对 .workloom 的路径（doctor overlay 检查等共享）。 */
export declare const OVERLAY_REL_PATH = "workflow.override.md";
/** assembleBreadcrumb 入参。 */
export interface AssembleBreadcrumbParams {
    /** 项目根（或根下任意目录；需位于 .workloom 资产树内）。 */
    root: string;
    /** runtime 会话标识（adapter 组装，如 dsh_<session-id>）。 */
    contextKey: string;
    /** 工作流契约全文（来自 assets 包）。 */
    contractText: string;
    /** 本轮用户消息（逃生舱关键词判定用，可选）。 */
    userPrompt?: string;
    /** 委派深度（agent 持久化 delegationDepth；缺省 0 为顶层）。深度>0 时不注入 breadcrumb。 */
    delegationDepth?: number;
}
/**
 * 组装当前会话的 breadcrumb 指引文本（异步入口，规格约定）。
 * @param params 入参
 * @returns [err, text]：err 为任一编排步骤的失败；skip 命中时 text 为 null
 */
export declare function assembleBreadcrumb(params: AssembleBreadcrumbParams): Promise<[Error | null, string | null]>;
/**
 * 组装当前会话的 breadcrumb 指引文本（同步核心）。
 * 全部编排步骤均为同步 I/O，故可同步求值；adapter 的 systemPrompt
 * text provider 是同步签名，必须走本函数而不是异步入口。
 * @param params 入参
 * @returns [err, text]：err 为任一编排步骤的失败；skip 命中时 text 为 null
 */
export declare function assembleBreadcrumbSync(params: AssembleBreadcrumbParams): [Error | null, string | null];
