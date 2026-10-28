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
 * @param model 本次派发实际选定的模型 label（轮换结果或主模型位）
 */
export function registerInFlightDispatch(seq, kind, model) {
    inFlightDispatches.set(seq, { kind, model });
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
 * 读取当前 in-flight 派发记录（合并到 native running 集合；条目携带已选模型，
 * 同轮并行两笔同类派发在同步段互见选择）。
 * @returns in-flight executor 记录集合
 */
export function getInFlightDispatches() {
    const records = [];
    for (const [seq, entry] of inFlightDispatches) {
        records.push({
            childId: `${IN_FLIGHT_PREFIX}${seq}`,
            kind: entry.kind,
            model: entry.model,
        });
    }
    return records;
}
/**
 * 清空全部 in-flight 派发（仅测试用，恢复干净状态）。
 */
export function clearInFlightDispatches() {
    inFlightDispatches.clear();
}
/** childId → 绑定登记（进程内，插件重启丢失：回退 dispatches 记录 → 主模型位归一）。 */
const childModelBindings = new Map();
/**
 * 登记一个成功启动 child 的绑定（派发成功含转移跳、异步重派时写入；childId
 * 换新时以新 id 重新登记）。
 * @param childId 子代理 durable session id
 * @param kind 本次派发的 executor 类型
 * @param model 该 child 实际生效的模型 label
 */
export function registerChildModelBinding(childId, kind, model) {
    childModelBindings.set(childId, { kind, model });
}
/**
 * 消费一个 child 的绑定登记（结算时删除：child 已不在 running 视野，登记失效；
 * 成功/失败终态均消费，防无界增长）。
 * @param childId 子代理 durable session id
 * @returns 被消费的绑定（无登记时 undefined）
 */
export function consumeChildModelBinding(childId) {
    const binding = childModelBindings.get(childId);
    childModelBindings.delete(childId);
    return binding;
}
/**
 * 清空全部绑定登记（仅测试用，恢复干净状态）。
 */
export function clearChildModelBindings() {
    childModelBindings.clear();
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
 * 收集本主会话 running executor 集合（DSH native 会话级 + dispatches 补 kind/model）。
 * @param service 子代理服务（listDescendants 枚举）
 * @param parent 发起 agent（取 id 作为 listDescendants 的根会话 id）
 * @param signal 取消信号
 * @param root 项目根
 * @param taskRelPath 任务目录相对 .workloom 的路径（读 dispatches 补 kind/model）
 * @param excludeChildId 排除的 childId（续用路径：目标 child 不重复占槽）
 * @returns running executor 记录集合（model 按三级优先读取，读不到缺省 undefined）
 */
export async function collectRunningExecutors(service, parent, signal, root, taskRelPath, excludeChildId) {
    const entries = await service.listDescendants(parent.id, signal);
    // childId → kind/model：优先本任务 dispatches 记录（workloom 派发留痕，权威来源；
    // 旧记录无 model 字段时不落映射，视为读不到）。
    const [taskErr, task] = readTask(root, taskRelPath);
    const kindByChildId = new Map();
    const modelByChildId = new Map();
    if (taskErr === null && task !== null) {
        for (const d of task.dispatches ?? []) {
            if (d.childId && d.kind)
                kindByChildId.set(d.childId, d.kind);
            if (d.childId && d.model !== undefined)
                modelByChildId.set(d.childId, d.model);
        }
    }
    const records = [];
    for (const entry of entries) {
        // 仅计本主会话在途直子级 child（depth=1 且 activity='running'），排除续用目标。
        if (entry.kind !== 'child' || entry.depth !== 1 || entry.activity !== 'running')
            continue;
        if (entry.id === excludeChildId)
            continue;
        // model 三级优先：进程内绑定登记 → dispatches 记录 → 读不到（undefined，
        // 由调用方归一为主模型位 label，保守宁多占主模型位也不误判空闲）。
        const kind = kindByChildId.get(entry.id) ?? kindFromLabel(entry.label) ?? '';
        const registered = childModelBindings.get(entry.id);
        const model = registered?.model ?? modelByChildId.get(entry.id);
        records.push({
            childId: entry.id,
            kind,
            ...(model !== undefined ? { model } : {}),
        });
    }
    // 合并进程内同步 in-flight 集：关闭闸判定→startContinuable 的异步窗口竞态。
    records.push(...getInFlightDispatches());
    return records;
}
/**
 * 归一统计同 kind 占用模型集合（轮换选取的取数面，纯函数）：同 kind 条目取登记
 * 的 model，读不到按主模型位 label 计（保守，宁多占主模型位也不误判空闲）；
 * kind 为空的未知 child 不算同类（不占任何 kind 槽的口径一致）。
 * @param running 本主会话 running executor 集合
 * @param kind 本次派发的 executor 类型
 * @param primaryLabel 主模型位 label（读不到时的归一目标）
 * @returns 同 kind 已占用的模型 label 集合
 */
export function collectUsedModels(running, kind, primaryLabel) {
    const used = new Set();
    for (const record of running) {
        if (record.kind !== kind)
            continue;
        used.add(record.model ?? primaryLabel);
    }
    return used;
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