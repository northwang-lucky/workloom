import { evaluateExecutorCapacity, formatAtCapacityReceipt, readTask } from '@workloom-ai/core';
import { KIND_LABELS } from './executor-injection.js';
/** 派发序号 → in-flight 条目（进程内同步，本会话计数语义不变）。 */
const inFlightDispatches = new Map();
/** 派发序号计数器（进程内单调递增，同毫秒内区分多笔派发）。 */
let dispatchSeqCounter = 0;
/** in-flight 条目的 childId 前缀（避免与真实 childId 碰撞）。 */
const IN_FLIGHT_PREFIX = '__inflight_';
/**
 * 生成唯一派发序号（同步，进程内单调递增）。
 * @returns 派发序号（"dispatch-<counter>"）
 */
export function generateDispatchSeq() {
    dispatchSeqCounter += 1;
    return `dispatch-${dispatchSeqCounter}`;
}
/**
 * 登记 in-flight 派发（同步：闸判定通过后立即调用，再 await startContinuable）。
 * @param seq 派发序号（generateDispatchSeq 生成）
 * @param kind 本次派发的 executor 类型
 */
export function registerInFlightDispatch(seq, kind) {
    inFlightDispatches.set(seq, { kind });
}
/**
 * 释放 in-flight 派发（startContinuable 成功返回后 child 已进 native 视野，
 * 或失败/异常路径）。
 * @param seq 派发序号
 */
export function releaseInFlightDispatch(seq) {
    inFlightDispatches.delete(seq);
}
/**
 * 读取当前 in-flight 派发记录（合并到 native running 集合）。
 * @returns in-flight executor 记录集合
 */
export function getInFlightDispatches() {
    const records = [];
    for (const [seq, entry] of inFlightDispatches) {
        records.push({ childId: `${IN_FLIGHT_PREFIX}${seq}`, kind: entry.kind });
    }
    return records;
}
/**
 * 清空全部 in-flight 派发（仅测试用，恢复干净状态）。
 */
export function clearInFlightDispatches() {
    inFlightDispatches.clear();
}
/**
 * label 显示标签 → executor kind 反向映射（回退解析用，枚举禁 Magic String）：
 * 由 buildChildLabel 使用的 KIND_LABELS 单一来源反转派生，两侧永不失配。
 */
const LABEL_TO_KIND = Object.fromEntries(Object.entries(KIND_LABELS).map(([kind, label]) => [label, kind]));
/** 从 listDescendants label（[<KindLabel>] <title>）回退解析 kind。 */
function kindFromLabel(label) {
    if (!label)
        return undefined;
    const match = label.match(/^\[([^\]]+)\]/);
    if (!match)
        return undefined;
    const labelText = match[1];
    if (labelText === undefined)
        return undefined;
    return LABEL_TO_KIND[labelText];
}
/**
 * 收集本主会话 running executor 集合（DSH native 会话级 + dispatches 补 kind）。
 * @param service 子代理服务（listDescendants 枚举）
 * @param parent 发起 agent（取 id 作为 listDescendants 的根会话 id）
 * @param signal 取消信号
 * @param root 项目根
 * @param taskRelPath 任务目录相对 .workloom 的路径（读 dispatches 补 kind）
 * @param excludeChildId 排除的 childId（续用路径：目标 child 不重复占槽）
 * @returns running executor 记录集合
 */
export async function collectRunningExecutors(service, parent, signal, root, taskRelPath, excludeChildId) {
    const entries = await service.listDescendants(parent.id, signal);
    // childId → kind：优先本任务 dispatches 记录（workloom 派发留痕，权威来源）。
    const [taskErr, task] = readTask(root, taskRelPath);
    const kindByChildId = new Map();
    if (taskErr === null && task !== null) {
        for (const d of task.dispatches ?? []) {
            if (d.childId && d.kind)
                kindByChildId.set(d.childId, d.kind);
        }
    }
    const records = [];
    for (const entry of entries) {
        // 仅计本主会话在途直子级 child（depth=1 且 activity='running'），排除续用目标。
        if (entry.kind !== 'child' || entry.depth !== 1 || entry.activity !== 'running')
            continue;
        if (entry.id === excludeChildId)
            continue;
        const kind = kindByChildId.get(entry.id) ?? kindFromLabel(entry.label) ?? '';
        records.push({ childId: entry.id, kind });
    }
    // 合并进程内同步 in-flight 集：关闭闸判定→startContinuable 的异步窗口竞态。
    records.push(...getInFlightDispatches());
    return records;
}
/**
 * 判定并发闸（纯同步，无副作用）：放行返回 null，拒绝返回 at capacity 回执文案。
 * @param running 本主会话 running executor 集合
 * @param kind 本次派发的 executor 类型
 * @param globalLimit 全局并发上限（0 = 不限）
 * @param kindLimit 本次 kind 上限（undefined = 该层不限，0 = 不限，> 0 = 上限）
 * @returns null = 放行；非 null = 拒绝，值为英文 at capacity 回执文案
 */
export function evaluateCapacityGate(running, kind, globalLimit, kindLimit) {
    const result = evaluateExecutorCapacity({ running, kind, globalLimit, kindLimit });
    if (result.allow)
        return null;
    return formatAtCapacityReceipt(kind, result);
}
//# sourceMappingURL=executor-capacity.js.map