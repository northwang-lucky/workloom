/**
 * adapter-dsh executor 并发容量闸：会话级 running 取数 + core 判定 + 回执。
 *
 * 设计意图：
 * - running 集合取 DSH 原生 listDescendants(parentId) 的直子级行（depth=1 且
 *   kind='child' 且 activity='running'），仅计本主会话在途 child，符合「按主会话
 *   计数」语义（对齐决策 2A），不跨会话；0.1.7 起 listChildren 只回目录投影
 *   （无 activity），enriched 行（kind/activity/hasChildren）由 listDescendants 返回；
 * - childId→kind 映射：优先从本任务 dispatches 记录读取（workloom 派发留痕，权威来源），
 *   缺失时回退解析 listDescendants 的 label（[<KindLabel>] <title>），两路均无则 kind 置空
 *   （仍占全局槽、不占任何 kind 槽——保守安全）；
 * - 判定委托 core 的 evaluateExecutorCapacity 纯函数，拒绝时返回 formatAtCapacityReceipt
 *   文案（不抛错、不写 dispatches、不 spawn），主会话稍后自行重试；
 * - 续用路径调用方传入 excludeChildId，把目标 child 从 running 集合排除（其槽不重复计）；
 * - 进程内同步 in-flight 结构：DSH 同轮可并行多工具调用，闸判定→startContinuable 之间
 *   存在异步窗口，两笔派发可同时过闸（与 Pi 缺陷 4 同款）。镜像 Pi 的 provisional 方案：
 *   闸判定通过后同步登记 in-flight 条目（键用派发序号），取数 = native listDescendants(running)
 *   ∪ in-flight 本地集；startContinuable 成功返回后 child 已进 native 视野→移除本地项；
 *   失败/异常路径 catch 中移除。in-flight 是会话进程内结构，本会话计数语义不变。
 */
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { SubagentDescendantListEntry } from '@deepseek-ai/dsh-subagent';
import type { RunningExecutorRecord } from '@workloom-ai/core';
/**
 * 生成唯一派发序号（同步，进程内单调递增）。
 * @returns 派发序号（"dispatch-<counter>"）
 */
export declare function generateDispatchSeq(): string;
/**
 * 登记 in-flight 派发（同步：闸判定通过后立即调用，再 await startContinuable）。
 * @param seq 派发序号（generateDispatchSeq 生成）
 * @param kind 本次派发的 executor 类型
 */
export declare function registerInFlightDispatch(seq: string, kind: string): void;
/**
 * 释放 in-flight 派发（startContinuable 成功返回后 child 已进 native 视野，
 * 或失败/异常路径）。
 * @param seq 派发序号
 */
export declare function releaseInFlightDispatch(seq: string): void;
/**
 * 读取当前 in-flight 派发记录（合并到 native running 集合）。
 * @returns in-flight executor 记录集合
 */
export declare function getInFlightDispatches(): RunningExecutorRecord[];
/**
 * 清空全部 in-flight 派发（仅测试用，恢复干净状态）。
 */
export declare function clearInFlightDispatches(): void;
/** 子代理服务的最小 running 取数接口（DSH 原生 listDescendants 会话级枚举）。 */
export interface RunningCollectionService {
    listDescendants(parentId: Agent['id'], signal?: AbortSignal): Promise<SubagentDescendantListEntry[]>;
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
export declare function collectRunningExecutors(service: RunningCollectionService, parent: Agent, signal: AbortSignal, root: string, taskRelPath: string, excludeChildId?: string): Promise<RunningExecutorRecord[]>;
/**
 * 判定并发闸（纯同步，无副作用）：放行返回 null，拒绝返回 at capacity 回执文案。
 * @param running 本主会话 running executor 集合
 * @param kind 本次派发的 executor 类型
 * @param globalLimit 全局并发上限（0 = 不限）
 * @param kindLimit 本次 kind 上限（undefined = 该层不限，0 = 不限，> 0 = 上限）
 * @returns null = 放行；非 null = 拒绝，值为英文 at capacity 回执文案
 */
export declare function evaluateCapacityGate(running: RunningExecutorRecord[], kind: string, globalLimit: number, kindLimit: number | undefined): string | null;
