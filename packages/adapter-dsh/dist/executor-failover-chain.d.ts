/**
 * adapter-dsh executor 失败转移的走链机制（编排辅助，不含注册表/通知）：按链顺序
 * 重试 + agentOptions 组装 + 失败派发留痕。
 *
 * 设计意图：
 * - 与 executor-failover.ts（转移上下文注册表 / 结算后重派 / 父会话通知）分离：
 *   本模块只管「一次派发如何按链换模型重试」——每跳的实际启动动作由调用方注入，
 *   派发时同步走链与结算后重派共用同一循环与穷尽语义；
 * - 分类与文案全部来自 core（isModelInaccessibleCode / extractFailureCode），
 *   adapter 不私造错误码口径；失败尝试即时写 failed dispatches 记录（审计可溯）；
 * - PARENT_MODEL_LABEL 单一来源在 core（dispatch-binding）：本模块转发保持既有
 *   转出口径；buildFallbackAgentOptions 对该 label 特判（继承主模型位条目不携带
 *   provider/model，仅 effort）——同类并发轮换绕回继承位时的走链消费分支。
 */
import type { AgentOptions } from '@deepseek-ai/dsh-agent';
import { PARENT_MODEL_LABEL } from '@workloom-ai/core';
import type { DispatchModelSource } from '@workloom-ai/core';
export { PARENT_MODEL_LABEL };
/** 尝试链展示分隔符（与 core 穷尽文案同形：m1 → m2；失败转移各模块共用）。 */
export declare const CHAIN_SEPARATOR = " \u2192 ";
/** 链穷尽文案前缀（错误消息与 dispatches error 后缀共用同一字面量）。 */
export declare const CHAIN_EXHAUSTED_PREFIX = " (fallback chain exhausted: ";
/** 失败转移链条目（配置解析后的模型字符串 + 可选 effort）。 */
export interface FallbackModelEntry {
    model: string;
    effort?: string;
}
/** 走链的一跳（attempt：主模型 = 1，链首条 = 2）。 */
export interface FallbackChainStep {
    model: string;
    effort?: string;
    attempt: number;
}
/** 走链成功结果：实际生效模型/effort 与本跳序号。 */
export interface FallbackChainOutcome<T> {
    result: T;
    model: string;
    effort?: string;
    attempt: number;
}
/** 走链参数：初始已尝试模型用于穷尽消息里的完整链。 */
export interface RunFallbackChainParams<T> {
    chain: readonly FallbackModelEntry[];
    /** 从链的哪一项开始（0 基）：同步派发恒 0，结算转移为已消费跳数。 */
    startIndex: number;
    /** 进入链之前已经尝试过的模型（失败消息按顺序拼接）。 */
    attemptedModels: readonly string[];
    start: (step: FallbackChainStep) => Promise<T>;
    /** 每跳失败回调（写 failed dispatches 记录等），可为异步。 */
    onAttemptFailed?: (step: FallbackChainStep, error: unknown) => void | Promise<void>;
}
/** 走链穷尽错误：携带完整尝试链（调用方据此写 error 后缀与穷尽通知）。 */
export declare class FallbackChainExhaustedError extends Error {
    /** 已尝试的完整模型链（按顺序）。 */
    readonly models: readonly string[];
    constructor(cause: unknown, models: readonly string[]);
}
/**
 * 按链顺序尝试：命中白名单 code 继续下一跳，非白名单错误立即中断（原样抛出）；
 * 链穷尽抛 FallbackChainExhaustedError（消息附完整尝试链）。
 * @param params 链、起始下标、已尝试模型、启动动作、失败回调
 * @returns 成功跳的结果与实际生效模型
 */
export declare function runFallbackChain<T>(params: RunFallbackChainParams<T>): Promise<FallbackChainOutcome<T>>;
/**
 * 组装链条目的 agentOptions：provider 前缀拆分 + 有条目 effort 才携带（省略则用
 * 目标模型默认档位，避开 effort-compat 坑）。继承主模型位条目（PARENT_MODEL_LABEL，
 * 轮换绕回继承形态的主模型位）特判：不携带 provider/model（保持继承父会话），
 * 仅携带条目 effort——走链模块唯一的 label 特判分支。
 * @param step 链条目（{model, effort?} 形状；FallbackChainStep 结构兼容）
 * @returns DSH agentOptions
 */
export declare function buildFallbackAgentOptions(step: {
    model: string;
    effort?: string;
}): AgentOptions;
/**
 * 逐条校验 fallback 条目 effort 合法档位（fail loud 在首次尝试之前，避免转到一半
 * 才发现配置坏）。
 * @param chain fallback 链
 */
export declare function assertFallbackChainEfforts(chain: readonly FallbackModelEntry[]): void;
/**
 * 把同步异常渲染为 dispatches error 行（单行 + 可选 ` (<code>)`）。
 * @param error 同步异常
 * @returns 单行错误文本
 */
export declare function formatFailureLine(error: unknown): string;
/** 一次失败派发留痕的入参。 */
export interface FailedDispatchAttempt {
    root: string;
    taskRelPath: string;
    kind: string;
    title: string;
    childId: string;
    error: unknown;
    model?: string;
    effort?: string;
    /** model 绑定来源（与 dispatches[].modelSource 值域一致）。 */
    modelSource?: DispatchModelSource;
    fallbackOf?: string;
    fallbackAttempt?: number;
    toolsAllow?: string[];
}
/**
 * 为一次失败尝试写 failed dispatches 记录（记录失败只 WARNING，不阻断转移）。
 * @param attempt 失败尝试要素
 */
export declare function recordFailedDispatchAttempt(attempt: FailedDispatchAttempt): void;
