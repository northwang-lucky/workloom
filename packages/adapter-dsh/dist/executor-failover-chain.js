import { ReasoningEffortId } from '@deepseek-ai/dsh-llm';
import { assertEffort, extractFailureCode, isModelInaccessibleCode, PARENT_MODEL_LABEL, recordExecutorDispatch, splitProviderModel, } from '@workloom-ai/core';
import { DISPATCH_WARN_PREFIX } from './constants.js';
// 继承主模型位的展示标签单一来源在 core（dispatch-binding 模块）：本模块转发
// 供既有 executor-failover.ts → executor.ts 的转出口径不变。
export { PARENT_MODEL_LABEL };
/** 尝试链展示分隔符（与 core 穷尽文案同形：m1 → m2；失败转移各模块共用）。 */
export const CHAIN_SEPARATOR = ' → ';
/** 链穷尽文案前缀（错误消息与 dispatches error 后缀共用同一字面量）。 */
export const CHAIN_EXHAUSTED_PREFIX = ' (fallback chain exhausted: ';
/** 走链穷尽错误：携带完整尝试链（调用方据此写 error 后缀与穷尽通知）。 */
export class FallbackChainExhaustedError extends Error {
    /** 已尝试的完整模型链（按顺序）。 */
    models;
    constructor(cause, models) {
        const detail = cause instanceof Error ? cause.message : String(cause);
        super(`${detail}${CHAIN_EXHAUSTED_PREFIX}${models.join(CHAIN_SEPARATOR)})`, { cause });
        this.name = 'FallbackChainExhaustedError';
        this.models = models;
    }
}
/**
 * 按链顺序尝试：命中白名单 code 继续下一跳，非白名单错误立即中断（原样抛出）；
 * 链穷尽抛 FallbackChainExhaustedError（消息附完整尝试链）。
 * @param params 链、起始下标、已尝试模型、启动动作、失败回调
 * @returns 成功跳的结果与实际生效模型
 */
export async function runFallbackChain(params) {
    const { chain, startIndex, attemptedModels, start, onAttemptFailed } = params;
    const attempted = [...attemptedModels];
    let lastError;
    for (let index = Math.max(0, startIndex); index < chain.length; index++) {
        const entry = chain[index];
        if (entry === undefined)
            continue;
        const step = {
            model: entry.model,
            attempt: index + 2,
            ...(entry.effort !== undefined ? { effort: entry.effort } : {}),
        };
        attempted.push(step.model);
        try {
            const result = await start(step);
            return {
                result,
                model: step.model,
                ...(step.effort !== undefined ? { effort: step.effort } : {}),
                attempt: step.attempt,
            };
        }
        catch (error) {
            lastError = error;
            if (onAttemptFailed !== undefined)
                await onAttemptFailed(step, error);
            // 非白名单失败（业务性错误/配置错误）：立即中断，维持原错误语义。
            if (!isModelInaccessibleCode(extractFailureCode(error)))
                throw error;
        }
    }
    throw new FallbackChainExhaustedError(lastError, attempted);
}
/**
 * 组装链条目的 agentOptions：provider 前缀拆分 + 有条目 effort 才携带（省略则用
 * 目标模型默认档位，避开 effort-compat 坑）。继承主模型位条目（PARENT_MODEL_LABEL，
 * 轮换绕回继承形态的主模型位）特判：不携带 provider/model（保持继承父会话），
 * 仅携带条目 effort——走链模块唯一的 label 特判分支。
 * @param step 链条目（{model, effort?} 形状；FallbackChainStep 结构兼容）
 * @returns DSH agentOptions
 */
export function buildFallbackAgentOptions(step) {
    if (step.model === PARENT_MODEL_LABEL) {
        return step.effort !== undefined
            ? { reasoningEffort: ReasoningEffortId(step.effort) }
            : {};
    }
    const split = splitProviderModel(step.model);
    return {
        ...split,
        ...(step.effort !== undefined ? { reasoningEffort: ReasoningEffortId(step.effort) } : {}),
    };
}
/**
 * 逐条校验 fallback 条目 effort 合法档位（fail loud 在首次尝试之前，避免转到一半
 * 才发现配置坏）。
 * @param chain fallback 链
 */
export function assertFallbackChainEfforts(chain) {
    for (const entry of chain)
        assertEffort(entry.effort);
}
/**
 * 把同步异常渲染为 dispatches error 行（单行 + 可选 ` (<code>)`）。
 * @param error 同步异常
 * @returns 单行错误文本
 */
export function formatFailureLine(error) {
    const message = error instanceof Error ? error.message : String(error);
    const oneLine = message.replace(/\s+/g, ' ').trim();
    const code = extractFailureCode(error);
    return code === null ? oneLine : `${oneLine} (${code})`;
}
/**
 * 为一次失败尝试写 failed dispatches 记录（记录失败只 WARNING，不阻断转移）。
 * @param attempt 失败尝试要素
 */
export function recordFailedDispatchAttempt(attempt) {
    const [recordErr] = recordExecutorDispatch(attempt.root, attempt.taskRelPath, {
        kind: attempt.kind,
        title: attempt.title,
        childId: attempt.childId,
        status: 'failed',
        error: formatFailureLine(attempt.error),
        ...(attempt.model !== undefined ? { model: attempt.model } : {}),
        ...(attempt.effort !== undefined ? { effort: attempt.effort } : {}),
        ...(attempt.modelSource !== undefined ? { modelSource: attempt.modelSource } : {}),
        ...(attempt.fallbackOf !== undefined ? { fallbackOf: attempt.fallbackOf } : {}),
        ...(attempt.fallbackAttempt !== undefined
            ? { fallbackAttempt: attempt.fallbackAttempt }
            : {}),
        ...(attempt.toolsAllow !== undefined ? { toolsAllow: attempt.toolsAllow } : {}),
    });
    if (recordErr !== null) {
        console.warn(`${DISPATCH_WARN_PREFIX} ${recordErr}`);
    }
}
//# sourceMappingURL=executor-failover-chain.js.map