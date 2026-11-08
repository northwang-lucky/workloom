/**
 * dsh-workloom 派发记录的新派轮绑定构造（纯函数，自 core dispatch-binding.js
 * 迁入）。
 *
 * 设计意图：
 * - 派发记录（dispatches[]）的审计价值是回答「子会话实际跑在什么模型上」；
 *   新派绑定构造是 dsh 派发链路自身职责（Pi adapter 已退役，不再有跨 runtime
 *   共用面），模块随消费方落 dsh，executor.ts 单向引入；
 * - modelSource 恒有值：param（显式参数）> whenMain/fallback（配置命中细分）
 *   > inherit（全部未命中，子会话继承主会话模型；绑定值取主模型快照，不可读
 *   时不落 model，审计仍可辨来源）；'legacy' 来源分支已随根层级 subagents 退役
 *   删除（解析链不再产生；DispatchModelSource 的 'legacy' 类型成员保留为历史
 *   记录惰性值）；
 * - 续派沿用绑定（modelSource: spawn）为结算/续派语义，在 executor.ts 的
 *   buildSpawnEntryBinding 组装，不入本模块；
 * - 纯同步、无副作用（不修改入参）。
 */
import type { DispatchModelSource, ResolveSubagentDefaultsResult } from '@workloom-ai/core';
/**
 * 构造新派轮派发记录的绑定字段（design §8.2）：把本次解析后实际生效的
 * model/effort 与来源层组装为 dispatch entry 片段。model/effort 未解析出
 * （未配置）时不带对应字段；inherit 时绑定值取主模型快照（可读时）。
 * @param params 工具调用参数（显式 model 判定）
 * @param effective resolveSubagentDefaults 结果（消费 model/effort/configSources.model）
 * @param mainModel 主会话模型（inherit 时的绑定快照来源）
 * @returns dispatch entry 绑定字段（modelSource 恒有值）
 */
export declare function buildNewDispatchBinding(params: {
    model?: string;
}, effective: ResolveSubagentDefaultsResult, mainModel?: string): {
    model?: string;
    effort?: string;
    modelSource: DispatchModelSource;
};
