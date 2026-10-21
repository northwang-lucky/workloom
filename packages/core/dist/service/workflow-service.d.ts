/**
 * workflow-service：adapter 侧组装 breadcrumb 与会话上下文投影的编排服务（新增抽象，TypeScript）。
 *
 * 设计意图：
 * - 把「校验项目根 → 加载配置 → 解析主契约 → 解析当前任务（mode/status）→
 *   light 时切换轻量契约 → 读 overlay（仅 full 轨）→ 组装指引」编排成单次调用，
 *   adapter 只需提供 root/contextKey/契约全文；
 * - 轻量任务（task.json mode=light）使用独立的 workflow-light.md，状态文案与步骤
 *   整体切换；norms 恒出自主契约（单源，轻量契约不含 norms 块）；项目 overlay
 *   是 full 轨的项目定制通道，light 轨不叠加；
 * - 任何一步失败显式抛错（fail loud），仅 overlay 文件缺失视为无 overlay；
 * - assembleBreadcrumb 是异步入口（规格约定）；同步核心 assembleBreadcrumbSync
 *   供 systemPrompt 的同步 text provider 直接调用，避免编排逻辑重复。
 */
import type { WorkflowStep } from '../workflow-contract-types.js';
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
    /**
     * 轻量契约全文（来自 assets 包的 workflow-light.md）。活跃任务为 light 时
     * 必须提供；full/无任务时忽略。
     */
    lightContractText?: string | null;
    /** 本轮用户消息（逃生舱关键词判定用，可选）。 */
    userPrompt?: string;
    /** 委派深度（agent 持久化 delegationDepth；缺省 0 为顶层）。深度>0 时不注入 breadcrumb。 */
    delegationDepth?: number;
}
/** 会话上下文投影（adapter 交给 assembleSessionContext 的 steps/norms）。 */
export interface WorkflowProjection {
    /** 生效契约的步骤投影（light 任务来自轻量契约，其余来自主契约）。 */
    steps: WorkflowStep[];
    /** always-on 规范原文，恒取自主契约（缺失为 null）。 */
    norms: string | null;
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
/**
 * 组装会话上下文的工作流投影（steps + norms）：adapter 只需把结果交给
 * assembleSessionContext，mode 解析不下沉到 adapter。
 *
 * steps 取生效契约（light 任务为轻量契约，其余为主契约）的 id/title；norms
 * 恒自主契约。full 轨的 overlay 只改状态/步骤正文，不改 id/title，概览投影
 * 无需合并 overlay（也避免 overlay 错误拖垮上下文注入）。
 * @param root 项目根（或根下任意目录）
 * @param contextKey runtime 会话标识
 * @param contractText 主契约全文
 * @param lightContractText 轻量契约全文（活跃任务为 light 时必须提供）
 * @returns [err, projection]：失败时 err 非空
 */
export declare function assembleWorkflowProjection(root: string, contextKey: string, contractText: string, lightContractText: string | null | undefined): [Error | null, WorkflowProjection | null];
