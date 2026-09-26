/**
 * adapter-dsh 的 Cordis 插件：注入 workloom breadcrumb 指引与会话上下文快照，
 * 并注册 slash 命令、executor 工具、runtime skills 与步骤详情工具。
 *
 * 设计意图：
 * - 通过 systemPrompt 服务注册一个 section（order 90）与一个 context（order 85）：
 *   - section：工作流状态指引（breadcrumb），persona 之后、工具指引之前；
 *   - context：取代式会话上下文快照（session-context），注入顺序排在 section 之前；
 * - 两个 text provider 都是同步签名，共用同一套自激活判定（agent → cwd → 项目根）；
 * - 自激活：cwd 不在 .workloom 项目内时静默返回空串，不注入任何内容；
 * - 注入失败只 console.warn，绝不阻塞会话（注入是增强，不是门禁）；
 * - 服务面全部使用宿主官方类型（Context 增强）：systemPrompt/agents/commands/
 *   tools/subagents/skills 由 inject 声明硬依赖，缺任一插件不激活；
 * - effort 经 startContinuable 的 agentOptions.reasoningEffort 原生通道透传
 *   （0.1.7 起 DSH 原生消费并持久化），不再需要 agent/created 监听补丁。
 */
import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
/** 自激活判定的结果：当前发起 agent 与所在项目根（导出供组装函数公共签名引用）。 */
export interface InjectionTarget {
    agent: Agent;
    root: string;
}
/** 插件名（与 cordis.patch.yml 的插件行 id 一致）。 */
export declare const name = "workloom-dsh";
/** 硬依赖：systemPrompt 注册 section/context，agents 读取发起会话，commands 注册 slash 命令，tools 注册 executor 与步骤详情工具，subagents 派发子代理，skills 注册 runtime skills；缺任一服务插件不激活。 */
export declare const inject: readonly ["systemPrompt", "agents", "commands", "tools", "subagents", "skills"];
/**
 * 插件入口：注册 session-context 与 breadcrumb 两个注入、三个 workloom slash
 * 命令、executor 工具、6 个 runtime skills（含统一 alignment 与 packages-scan）
 * 与步骤详情工具。
 * @param ctx 插件作用域上下文
 */
export declare function apply(ctx: Context): void;
/**
 * 组装当前发起会话的 session-context 注入文本（取代式快照）。
 * 契约缺失静默返回空串；解析/组装出错只告警，不阻塞会话。
 * 本机片段（主 agent 目标 main）：三层（全局 → 项目共享 → 项目本机）叠加组装
 * （all + main），经快照尾部 Local directives 小节注入；组装失败只告警，以空
 * directives 继续组装快照（小节级降级，与 Pi 侧 injectSessionContext 对齐）。
 * @param target 注入目标（agent + 项目根）
 * @returns 注入文本（可能为空串）
 */
export declare function renderSessionContext(target: InjectionTarget): string;
/**
 * 从契约文本组装 session-context 快照文本。
 * 契约文本作为入参注入（导出供测试喂自定义契约，不依赖真实资产内容）：
 * norms 随快照每轮重组装，契约升级后下一轮即生效；解析/组装失败只告警，不阻塞会话。
 * 委派深度透传 core（缺省 0）：深度>0 时 norms 段整体替换为 executor 版。
 * localDirectives 为本机片段合成文本（缺省空串）：depth=0 时由 core 在 norms 后
 * 追加 Local directives 小节（depth>0 由 executor 首条 prompt 注入一次，不重复）。
 * mainModel 由 target.agent 的 requestHeader 快照读取（design §6）：Executor
 * profiles 节的 whenMain 条目按它匹配、首行标题展示；取不到时传 undefined（core
 * 走 main model unknown 分支，whenMain 条目跳过，不 fail loud）。
 * @param target 注入目标（agent + 项目根）
 * @param contractText 契约全文
 * @param delegationDepth 委派深度（agent 持久化 delegationDepth；缺省 0 为顶层）
 * @param localDirectives 本机片段合成文本（主 agent 目标；空串 = 不注入）
 * @returns 注入文本（可能为空串）
 */
export declare function assembleSessionContextText(target: InjectionTarget, contractText: string, delegationDepth?: number, localDirectives?: string): string;
