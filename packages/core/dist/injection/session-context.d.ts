/**
 * session-context：为 systemPrompt 的 context 注入组装会话上下文快照（新增抽象，TypeScript）。
 *
 * 设计意图：
 * - DSH 的 systemPrompt.context 是「取代式快照」：每次提示词组装渲染一份上下文快照，
 *   新快照取代旧快照，适合承载每轮更新的会话状态，不会随轮次膨胀；
 * - always-on 行为规范（norms）随快照每轮重新组装：契约升级后下一轮即生效，
 *   不依赖模型自觉或新开会话；
 * - 内容全部英文，整块包裹在 <workloom-session-context> 标记内，便于模型识别边界；
 * - 数据读取采取「可降级」策略：developer/git 读取失败降级为占位值，任务解析失败显式
 *   返回 err（结构性故障不静默）；全部同步 I/O，供同步 text provider 直接调用；
 * - root 约定为项目根（由 adapter 传 findWorkloomRoot 的结果），内部只拼路径不再向上查找。
 */
/** assembleSessionContext 入参。 */
export interface SessionContextParams {
    /** 项目根（必须已是 findWorkloomRoot 的结果，不再向上查找）。 */
    root: string;
    /** runtime 会话标识（adapter 组装，如 dsh_<session-id>）。 */
    contextKey: string;
    /** 工作流步骤概览（契约 steps 的投影：id + title）。 */
    workflowSteps: readonly {
        id: string;
        title: string;
    }[];
    /** always-on 行为规范原文（契约 norms 块，可多行）；缺失或空白时快照不输出该小节。 */
    norms?: string | null;
    /** 委派深度（agent 持久化 delegationDepth；缺省 0 为顶层）。深度>0 时 norms 段整体替换为 executor 版。 */
    delegationDepth?: number;
    /**
     * 本机片段合成文本（主 agent 目标：all + main；adapter 探测可用工具集后经 core
     * composeLocalDirectivesText 组装）。depth=0 且文本非空时在 norms 之后追加
     * Local directives 小节；depth>0 不注入（executor 的片段由首条 prompt 注入一次，
     * 避免 all.md 重复注入）；空串/未传 = 不注入。
     */
    localDirectives?: string | null;
    /**
     * 主会话模型（"provider/model"，adapter 从请求头快照读取后传入）。Executor
     * profiles 节的 whenMain 条目按它匹配、首行标题展示；缺省/空白/null = 取不到
     * （whenMain 条目跳过，标题标注 main model unknown）。
     */
    mainModel?: string | null;
}
/**
 * 组装当前会话的上下文快照文本（同步）。
 * @param params 入参
 * @returns [err, text]：err 为任务解析等结构性故障；成功时 text 为整块快照
 */
export declare function assembleSessionContext(params: SessionContextParams): [Error | null, string | null];
