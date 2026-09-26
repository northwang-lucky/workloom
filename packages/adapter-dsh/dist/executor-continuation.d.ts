import type { ExecutorInjectionStats, ResolveSubagentDefaultsResult } from '@workloom-ai/core';
/** 一轮 executor 派发的结算元数据（后台 receipt 渲染用）。 */
export interface TurnMeta {
    forced: boolean;
    reused: boolean;
    /** 注入统计（receipt 渲染用；总字节取实际发送内容，计数来自 buildExecutorPrompt stats）。 */
    injection: ExecutorInjectionStats;
    /**
     * 续派轮的 spawn 绑定（design §8.3）：子会话首次派发记录落盘的 model/effort。
     * reused=true 时由 executor.ts 读首次派发记录填入；值为空/旧记录无绑定字段时
     * 回执渲染 (unrecorded spawn binding)。新派轮不设（undefined），走现状渲染。
     */
    spawnBinding?: {
        model?: string;
        effort?: string;
    };
}
/** buildTurnReceiptText 消费的生效默认值形状（core ResolveSubagentDefaultsResult）。 */
export type ResolvedDefaultsLike = ResolveSubagentDefaultsResult;
/**
 * 拼装一轮 turn 的 receipt 文本（后台返回值与对模型可见文本共用同一渲染）：生效
 * model/effort 及来源 + 注入统计 + (forced)/(reused) 标注。
 * 续派轮（meta.reused）改用 spawn 绑定渲染（design §8.3）：子会话模型/effort
 * 在派发时已绑定，回执须如实展示 spawn 绑定值，不再回显续派时刻重新解析的
 * 当前配置来源（否则主会话换模型后续派会谎报生效）；spawn 记录无绑定值时显示
 * (unrecorded spawn binding)。
 * @param meta 本轮元数据（forced/reused/injection/spawnBinding）
 * @param effective 生效的 model/effort（仅新派轮 receipt 渲染；续派轮不消费）
 * @returns receipt 文本行
 */
export declare function buildTurnReceiptText(meta: TurnMeta, effective: ResolvedDefaultsLike): string;
/**
 * 读取子会话首次派发记录的绑定（design §8.3，纯读取，无副作用）：dispatches 中
 * 最早出现该 childId 的记录即 spawn 记录（dispatches append-only，同 childId 的
 * 续派记录在后续位置），取其落盘的 model/effort 供续派轮沿用；旧记录无绑定字段
 * 时返回 null（回执渲染 (unrecorded spawn binding)）。读取失败（任务不可读）
 * 返回 null，不抛错——续派轮有 spawnBinding 与否只影响回执标注，不阻塞派发。
 * @param root 项目根
 * @param taskRelPath 任务目录相对 .workloom 的路径
 * @param childId 续用子代理的 durable session id
 * @returns 首次派发记录的绑定 {model?, effort?}，无记录/无绑定字段返回 null
 */
export declare function readSpawnBinding(root: string, taskRelPath: string, childId: string): {
    model?: string;
    effort?: string;
} | null;
/**
 * 定位续用 childId（dispatches 记录，同 kind 边界）：'latest' 取同 kind 最近一条的
 * childId；显式 id 必须在 dispatches 中存在且 kind 一致，否则拒绝（跨 kind / 无记录
 * 均返回提示）。定位失败不抛错——续用是主会话显式请求，提示面返回更利于模型修正。
 * @param root 项目根
 * @param taskRelPath 任务目录相对 .workloom 的路径
 * @param kind 本次调用的 executor kind（同 kind 校验基准）
 * @param input continue_executor 参数值（'latest' 或记录的 childId）
 * @returns [失败提示, childId]（失败时 childId 为空串）
 */
export declare function locateContinueChildId(root: string, taskRelPath: string, kind: string, input: string): [string | null, string];
