/**
 * adapter-dsh executor 的失败转移编排：转移上下文注册表 + 派发时同步走链 +
 * 结算后重派 + 父会话一行通知（走链循环本身在 executor-failover-chain.ts）。
 *
 * 设计意图：
 * - 两条触发路径共用同一走链函数 runFallbackChain：派发时 startActivation 同步
 *   抛白名单错误（executor.ts 调用）与结算后 fire-and-forget 重派（executor-settle
 *   钩子调用）；分类与文案全部来自 core（isModelInaccessibleCode /
 *   extractFailureCode / buildFailoverNote / buildFailoverNotice），adapter 只编排；
 * - 转移上下文在派发时刻登记（结算监听是同步边界，拿不到原派发参数）：root/
 *   taskRelPath/kind/title/首次 prompt/链/当前跳/父 agent/白名单/LSP 面；结算即
 *   消费删除，防无界增长。插件重启后注册表丢失，退化为现状回报（只 WARNING）；
 * - 重派是全量重注入（composeLocalDirectivesText + buildFullInjection），prompt 用
 *   首次派发 prompt + 一行 failover 说明（工作区可能有半成品；续用轮的增量指令
 *   随旧会话丢失）。信号用新 AbortController：原工具调用 signal 已随调用结束失效；
 * - 父会话通知走宿主现成通道：sessionController.resolveAgent → createUserMessage
 *   （source kind workloom）→ agent.followup → sessions.flush；通道不可用/投递失败
 *   只 WARNING，不阻断转移；
 * - 所有异步工作经 trackFailoverWork 登记（flushFailoverWork 供测试等待）。
 */
import type { Context } from '@deepseek-ai/cordis';
import type { Agent, AgentOptions } from '@deepseek-ai/dsh-agent';
import type { DispatchModelSource } from '@workloom-ai/core';
import type { FallbackModelEntry } from './executor-failover-chain.js';
import type { SettledDispatch } from './executor-settle.js';
export { PARENT_MODEL_LABEL } from './executor-failover-chain.js';
export type { FallbackModelEntry } from './executor-failover-chain.js';
/** 新派轮主模型绑定（buildNewDispatchBinding 产物的结构子集，首跳失败留痕用）。 */
export interface PrimaryDispatchBinding {
    model?: string;
    effort?: string;
    modelSource: Exclude<DispatchModelSource, 'spawn'>;
}
/** 同步派发走链的入参（executor.ts 新派发路径；对象封装多参数）。 */
export interface StartDispatchWithFailoverParams {
    ctx: Context;
    parent: Agent;
    signal: AbortSignal;
    root: string;
    taskRelPath: string;
    kind: string;
    title: string;
    /** 子会话展示标题（`[<KindLabel>] <title>`，各跳一致）。 */
    label: string;
    /** 全量注入后的首条 prompt 文本（各跳一致）。 */
    sendText: string;
    allowNames: readonly string[];
    /** 主模型的 agentOptions（首跳；链跳按条目另组）。 */
    agentOptions: AgentOptions | undefined;
    /** 失败转移链（显式 model / 未配置时为空，走零行为变化路径）。 */
    chain: readonly FallbackModelEntry[];
    primaryBinding: PrimaryDispatchBinding;
    /** 主模型展示名（穷尽消息的链起点）。 */
    primaryModel: string;
}
/** 同步派发走链结果：成功的启动结果 + 走链成功时的实际生效模型与跳序号。 */
export interface StartDispatchWithFailoverResult {
    started: {
        childId: string;
    };
    failover?: {
        attempt: number;
        model: string;
        effort?: string;
        fallbackOf: string;
    };
}
/** 失败转移上下文（派发时刻登记，结算 / 转移时消费）。 */
export interface FailoverContext {
    root: string;
    taskRelPath: string;
    kind: string;
    title: string;
    /** 首次派发的用户 prompt（重派时重新全量注入的正文）。 */
    firstPrompt: string;
    /** 失败轮是否为续用轮（续用增量指令随旧会话丢失，说明里要注明）。 */
    continued: boolean;
    /** 首次派发解析出的完整 fallback 链。 */
    chain: readonly FallbackModelEntry[];
    /** 当前跳序号（主模型 = 1，链首条 = 2）。 */
    attempt: number;
    /** 当前子会话实际生效的模型（通知/说明里的失败模型）。 */
    currentModel: string;
    /** 首次派发的主模型（穷尽时完整尝试链的起点）。 */
    primaryModel: string;
    /** 父会话 agent（重派与通知的发起方）。 */
    parent: Agent;
    /** 首次派发施加的工具白名单（重派沿用）。 */
    allowNames: readonly string[];
    /** 首次派发是否具备 LSP 工具面（重派注入沿用）。 */
    hasLsp: boolean;
}
/**
 * 同步派发走链（executor.ts 新派发路径）：主模型 startActivation 抛白名单错误时
 * 按链逐跳重试；每跳预分配 childId 并在创建前登记工具白名单（agent/created 早于
 * startActivation 返回），失败撤销登记并留一条 failed dispatches 记录。链穷尽抛
 * FallbackChainExhaustedError（消息附完整尝试链）；非白名单错误原样抛出（不留痕）。
 * @param params 走链入参（agentOptions/链/白名单/主模型绑定等）
 * @returns 成功跳的启动结果与转移标注（主模型直接成功时不带 failover）
 */
export declare function startDispatchWithFailover(params: StartDispatchWithFailoverParams): Promise<StartDispatchWithFailoverResult>;
/**
 * 登记一次新派发的转移上下文（链为空 / 显式 model 时不登记，转移天然不发生）。
 * @param childId 子代理 durable session id
 * @param context 转移上下文
 */
export declare function registerFailoverContext(childId: string, context: FailoverContext): void;
/**
 * 标记该 childId 的最近一轮为续用轮（sendMessage 投递成功后调用）：只置 continued，
 * 首次 prompt 与链保持首次派发值。
 * @param childId 子代理 durable session id
 */
export declare function markFailoverContinued(childId: string): void;
/** 清空转移上下文注册表（仅测试用，恢复干净状态）。 */
export declare function clearFailoverContexts(): void;
/**
 * 等待全部在途转移工作完成（仅测试用，让 fire-and-forget 断言可确定）。
 */
export declare function flushFailoverWork(): Promise<void>;
/**
 * 结算钩子（executor-settle 在 dispatch settle 后调用，同步边界内发起）：
 * 先消费上下文条目（成功 / 非白名单 / 穷尽均不再保留），仅当失败码命中白名单时
 * 启动 fire-and-forget 转移。
 * @param ctx 插件上下文
 * @param settled 结算信息（childId/任务/stopReason/结构化错误）
 */
export declare function handleSettledDispatch(ctx: Context, settled: SettledDispatch): void;
