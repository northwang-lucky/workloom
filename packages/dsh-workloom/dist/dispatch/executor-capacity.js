import { evaluateExecutorCapacity, formatAtCapacityReceipt, readTaskView, ROLE_LABELS, tryNormalizeExecutorRole, } from '@workloom-ai/core';
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
 * 登记 in-flight 派发（同步：闸判定通过后立即调用，再 await startActivation）。
 * @param seq 派发序号（generateDispatchSeq 生成）
 * @param role 本次派发的 executor 角色
 * @param model 本次派发实际选定的模型 label（缺省 undefined：读不到时由
 *   collectUsedModels 按主模型位保守归一）
 */
export function registerInFlightDispatch(seq, role, model) {
    inFlightDispatches.set(seq, { role, ...(model !== undefined ? { model } : {}) });
}
/**
 * 释放 in-flight 派发（startActivation 成功返回后 child 已进 native 视野，
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
        records.push({
            childId: `${IN_FLIGHT_PREFIX}${seq}`,
            // 登记值经兼容读归一（调用方传新角色值；归一落空的脏值置空，仅占全局槽）。
            role: tryNormalizeExecutorRole(entry.role) ?? '',
            // model 直取登记值（轮换占用统计用；缺省不落字段，语义同 native 记录）。
            ...(entry.model !== undefined ? { model: entry.model } : {}),
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
/**
 * label 显示标签 → executor 角色反向映射（回退解析用，枚举禁 Magic String）：
 * 由 buildChildLabel 使用的 core ROLE_LABELS 单一来源反转派生，两侧永不失配
 * （'Frontend Developer' 含空格标签由 [^\]]+ 括号解析整段捕获）。
 */
const LABEL_TO_ROLE = Object.fromEntries(Object.entries(ROLE_LABELS).map(([role, label]) => [label, role]));
/** 从 listDescendants label（[<RoleLabel>] <title>）回退解析角色。 */
function roleFromLabel(label) {
    if (!label)
        return undefined;
    const match = label.match(/^\[([^\]]+)\]/);
    if (!match)
        return undefined;
    const labelText = match[1];
    if (labelText === undefined)
        return undefined;
    return LABEL_TO_ROLE[labelText];
}
/**
 * 收集本主会话 running executor 集合（DSH native 会话级 + dispatches 补 role）。
 * @param service 子代理服务（listDescendants 枚举）
 * @param parent 发起 agent（取 id 作为 listDescendants 的根会话 id）
 * @param signal 取消信号
 * @param root 项目根
 * @param taskRelPath 任务目录相对 .workloom 的路径（读 dispatches 补 role）
 * @param excludeChildId 排除的 childId（续用路径：目标 child 不重复占槽）
 * @returns running executor 记录集合
 */
export async function collectRunningExecutors(service, parent, signal, root, taskRelPath, excludeChildId) {
    const entries = await service.listDescendants(parent.id, signal);
    // childId → role：优先本任务 dispatches 记录（workloom 派发留痕，权威来源；
    // 视图层已归一为新角色值）。
    const [taskErr, task] = readTaskView(root, taskRelPath);
    const roleByChildId = new Map();
    const modelByChildId = new Map();
    if (taskErr === null && task !== null) {
        for (const d of task.dispatches ?? []) {
            if (d.childId && d.kind)
                roleByChildId.set(d.childId, d.kind);
            // 旧记录无 model 字段时不落映射，视为读不到（由 collectUsedModels 保守归一）。
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
        const rawRole = roleByChildId.get(entry.id) ?? roleFromLabel(entry.label) ?? '';
        // 收集面归一失败的语义分面（R3-4）：保留该记录并计入全局闸（与现状 kind 解析
        // 落空的在飞子会话仍占全局槽位一致，避免全局容量漏计），仅角色闸计数将其
        // 排除（role 置空）并加 WARNING。
        const role = tryNormalizeExecutorRole(rawRole);
        if (role === null) {
            if (rawRole !== '') {
                console.warn(`workloom executor: WARNING: unknown executor role in running record, counted in the global gate only: ${rawRole}`);
            }
            records.push({ childId: entry.id, role: '' });
            continue;
        }
        // model 二级来源：本任务 dispatches 记录（一级 in-flight 直取见下方合并）；
        // native 视野无记录项留空（读不到时由 collectUsedModels 按主模型位保守归一）。
        const model = modelByChildId.get(entry.id);
        records.push({
            childId: entry.id,
            role,
            ...(model !== undefined ? { model } : {}),
        });
    }
    // 合并进程内同步 in-flight 集：关闭闸判定→startActivation 的异步窗口竞态。
    records.push(...getInFlightDispatches());
    return records;
}
/**
 * 归一统计同角色占用模型集合（轮换选取的取数面，纯函数）：同角色条目取登记的
 * model，读不到按主模型位 label 计入（保守，宁多占主模型位也不误判空闲）；
 * role 为空的未知 child 不算同类（不占任何角色槽的口径一致）。角色值已经
 * collectRunningExecutors 归一，此处直取直比。
 * @param running 本主会话 running executor 集合
 * @param role 本次派发的 executor 角色
 * @param primaryModelLabel 主模型位 label（读不到时的归一目标）
 * @returns 同角色已占用的模型 label 集合
 */
export function collectUsedModels(running, role, primaryModelLabel) {
    const used = new Set();
    for (const record of running) {
        if (record.role !== role)
            continue;
        used.add(record.model ?? primaryModelLabel);
    }
    return used;
}
/**
 * 判定并发闸（纯同步，无副作用）：放行返回 null，拒绝返回 at capacity 回执文案。
 * @param running 本主会话 running executor 集合
 * @param role 本次派发的 executor 角色
 * @param globalLimit 全局并发上限（0 = 不限）
 * @param roleLimit 本次角色上限（undefined = 该层不限，0 = 不限，> 0 = 上限）
 * @returns null = 放行；非 null = 拒绝，值为英文 at capacity 回执文案
 */
export function evaluateCapacityGate(running, role, globalLimit, roleLimit) {
    const result = evaluateExecutorCapacity({ running, role, globalLimit, roleLimit });
    if (result.allow)
        return null;
    return formatAtCapacityReceipt(role, result);
}
//# sourceMappingURL=executor-capacity.js.map