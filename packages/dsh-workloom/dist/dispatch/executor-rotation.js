/**
 * executor 同类并发轮换选取纯函数（行为移植模块，TS 重写非文件搬迁）。
 *
 * 设计意图：
 * - 把 `[主模型位条目, fallbackModels…]` 池视为环形：新派发按「同类已占用模型」
 *   顺延取首个未占用条目作为起始绑定，并把环形顺序在派发时刻物化为线性失败
 *   转移链——走链模块（runModelFailoverRetry）按线性链消费，零改动；
 * - 纯同步、无 IO、无副作用：入参均为值对象，adapter 在容量放行后的同步段调用
 *   （判定→选取→in-flight 登记之间不得有 await 间隙）；
 * - 全占用回绕主模型位（下标 0）：不拒绝、不排队（回绕即现状绑定，零行为变化）；
 * - 主模型位 label（继承形态的 PARENT_MODEL_LABEL）由调用方归一进池，本模块
 *   不感知 label 语义，占用集合的来源归一同属调用方；
 * - 环形物化协议：materializeRingChain 把环形顺序线性化为「起始条目 + 起点后继
 *   转移链」（链不含起点自身，绕回段含主模型位条目），与失败转移链的线性消费
 *   协议完全兼容—— startIndex = 0 时恒等现状链 [F1..FN]，startIndex > 0 时链为
 *   [第 i+1 项..第 N 项, 主模型位, 第 1 项..第 i-1 项]。
 */
import { PARENT_MODEL_LABEL } from '@workloom-ai/core';
import { collectUsedModels } from "./executor-capacity.js";
/**
 * 轮换判定（编排组合纯函数，供 adapter 容量闸放行后的同步段调用）：按进入条件
 * 构建环形池并选取起步条目，物化环序链一并返回。全程无 await——判定→选取→
 * in-flight 登记之间的同步纪律由调用方保证（并行两笔同角色派发在登记时互见
 * 实际选定模型、不撞同一模型）。不满足进入条件或 startIndex = 0（含全占用回绕）
 * 返回空决策：回绕即现状绑定，全路径零行为变化、零留痕。
 * @param params.rotateOnBusy 轮换开关生效值（effective.rotateOnBusy === true）
 * @param params.explicitModel 工具显式 model 参数（undefined = 未显式传）
 * @param params.effectiveModel 生效 model（undefined = 继承主会话模型，池首条目
 *   按 PARENT_MODEL_LABEL 归一）
 * @param params.effectiveEffort 生效 effort（池首条目随带档位）
 * @param params.fallbackChain 失败转移链（轮换池 1..N 段）
 * @param params.running 本主会话 running 集合（容量闸放行返回值，同帧透出）
 * @param params.role 本次派发的 executor 角色（占用统计的同角色过滤基准）
 * @returns rotation = 选中起步条目；chain = 起点后继的环序线性链（结算重试消费）
 */
export function decideRotationStart(params) {
    if (!params.rotateOnBusy || params.explicitModel !== undefined || params.fallbackChain.length === 0) {
        return {};
    }
    const pool = [
        {
            model: params.effectiveModel ?? PARENT_MODEL_LABEL,
            ...(params.effectiveEffort !== undefined ? { effort: params.effectiveEffort } : {}),
        },
        ...params.fallbackChain,
    ];
    const usedModels = collectUsedModels(params.running, params.role, pool[0]?.model ?? PARENT_MODEL_LABEL);
    const startIndex = selectRotationStartIndex({
        poolModels: pool.map((entry) => entry.model),
        usedModels,
    });
    // 起点后移才轮换：物化环序链作为本轮绑定与结算重试的消费链。
    if (startIndex === 0)
        return {};
    const materialized = materializeRingChain({ pool, startIndex });
    return { rotation: materialized.startEntry, chain: materialized.chain };
}
/**
 * 选取轮换起始下标（纯函数）：按池顺序返回首个不在占用集合的下标；全占用返回
 * 0（回绕主模型位，调用方按现状绑定处理）。池为空时返回 0。
 * @param params.poolModels 池内模型 label 顺序表（下标 0 = 主模型位）
 * @param params.usedModels 同角色已占用的模型 label 集合
 * @returns 起始下标（池非空时 0..poolModels.length-1；全占用或空池返回 0）
 */
export function selectRotationStartIndex(params) {
    const { poolModels, usedModels } = params;
    for (let index = 0; index < poolModels.length; index++) {
        const model = poolModels[index];
        if (model !== undefined && !usedModels.has(model))
            return index;
    }
    return 0;
}
/**
 * 物化环形链（纯函数）：按起始下标把环形顺序产出为「起始条目 + 线性转移链」，
 * 与失败转移链的线性消费协议完全兼容：
 * - startIndex = 0：起始即主模型位条目，转移链为 [F1..FN]（现状恒等）；
 * - startIndex > 0：起始为池内第 i 项，转移链为环的剩余部分
 *   [第 i+1 项..第 N 项, 主模型位, 第 1 项..第 i-1 项]。
 * 空池 fail loud（无灰区：派发侧链非空才进入轮换，空池属调用方错误）。
 * @param params.pool 轮换池（下标 0 = 主模型位条目）
 * @param params.startIndex selectRotationStartIndex 的返回值
 * @returns 起始条目与线性化转移链（链不含起始条目本身）
 */
export function materializeRingChain(params) {
    const { pool, startIndex } = params;
    if (pool.length === 0) {
        throw new Error('materializeRingChain: pool must not be empty (rotation requires a fallback pool)');
    }
    // 防御式归一：下标越界夹回池内（调用方传 selectRotationStartIndex 的返回值时恒在界内）。
    const start = Math.max(0, Math.min(startIndex, pool.length - 1));
    const startEntry = pool[start];
    if (startEntry === undefined) {
        throw new Error('materializeRingChain: clamped start index out of pool bounds');
    }
    const chain = [];
    for (let step = 1; step < pool.length; step++) {
        const entry = pool[(start + step) % pool.length];
        if (entry !== undefined)
            chain.push(entry);
    }
    return { startEntry, chain };
}
//# sourceMappingURL=executor-rotation.js.map