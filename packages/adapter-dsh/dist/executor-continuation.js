/**
 * adapter-dsh executor 的 continuable 会话辅助：续用定位（dispatches 同 kind 校验）
 * 与后台 receipt 渲染。
 *
 * 设计意图：
 * - 与 executor.ts（工具注册与执行编排）分离，聚焦 continuable 生命周期里
 *   派发之后仍需要纯逻辑的部分（续用目标定位、首派绑定读取、receipt 拼装）；
 * - 完成报告由 DSH 的 subagent-settled 通知送达，本模块不等待 turn 结算、
 *   不判定终止、不释放 Activation（executor 派发恒为后台语义）。
 */
import { buildContinueNoChildIdText, buildContinueNoDispatchText, buildCrossKindReuseRejectText, buildExecutorReceipt, buildSpawnBindingReceipt, CONTINUE_EXECUTOR_LATEST, ERR_PREFIX, readTask, } from '@workloom-ai/core';
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
export function buildTurnReceiptText(meta, effective) {
    // 续派轮：绑定值有记录时展示 (spawn binding)，无绑定记录时展示 unrecorded；
    // 新派轮维持 buildExecutorReceipt（(param)/(config: …)/(default)）现状。
    const receiptBase = meta.reused
        ? buildSpawnBindingReceipt({
            binding: meta.spawnBinding ?? null,
            injection: meta.injection,
        })
        : buildExecutorReceipt({
            model: effective.model,
            modelSource: effective.sources.model,
            modelConfigSource: effective.configSources.model,
            modelWhenMainValue: effective.whenMainValue,
            effort: effective.effort,
            effortSource: effective.sources.effort,
            effortConfigSource: effective.configSources.effort,
            effortWhenMainValue: effective.whenMainValue,
            injection: meta.injection,
        });
    return `${meta.forced ? `${receiptBase} (forced)` : receiptBase}${meta.reused ? ' (reused)' : ''}`;
}
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
export function readSpawnBinding(root, taskRelPath, childId) {
    const [taskErr, task] = readTask(root, taskRelPath);
    if (taskErr !== null || task === null)
        return null;
    const dispatches = task.dispatches ?? [];
    for (const entry of dispatches) {
        if (entry === undefined)
            continue;
        if (entry.childId !== childId)
            continue;
        const model = entry.model;
        const effort = entry.effort;
        if (model === undefined && effort === undefined)
            return null;
        return { model, effort };
    }
    return null;
}
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
export function locateContinueChildId(root, taskRelPath, kind, input) {
    const [taskErr, task] = readTask(root, taskRelPath);
    if (taskErr !== null || task === null) {
        return [
            `${ERR_PREFIX.executor}: cannot read the task record to locate the previous executor session ` +
                `(${taskErr?.message ?? 'task not found'}); dispatch a new executor instead`,
            '',
        ];
    }
    const dispatches = task.dispatches ?? [];
    if (input === CONTINUE_EXECUTOR_LATEST) {
        for (let i = dispatches.length - 1; i >= 0; i--) {
            const entry = dispatches[i];
            if (entry === undefined)
                continue;
            if (entry.kind !== kind)
                continue;
            if (entry.childId !== undefined && entry.childId !== '')
                return [null, entry.childId];
        }
        return [`${ERR_PREFIX.executor}: ${buildContinueNoDispatchText(kind)}`, ''];
    }
    const match = dispatches.find((entry) => entry.childId === input);
    if (match === undefined) {
        return [`${ERR_PREFIX.executor}: ${buildContinueNoChildIdText(input, kind)}`, ''];
    }
    if (match.kind !== kind) {
        return [
            `${ERR_PREFIX.executor}: ${buildCrossKindReuseRejectText(input, match.kind, kind)}`,
            '',
        ];
    }
    return [null, input];
}
//# sourceMappingURL=executor-continuation.js.map