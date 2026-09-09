/**
 * adapter-dsh executor 并发容量闸：会话级 running 取数 + core 判定 + 回执。
 *
 * 设计意图：
 * - running 集合取 DSH 原生 listChildren(parentId)，仅计本主会话在途 child（activity='running'），
 *   符合「按主会话计数」语义（对齐决策 2A），不跨会话；
 * - childId→kind 映射：优先从本任务 dispatches 记录读取（workloom 派发留痕，权威来源），
 *   缺失时回退解析 listChildren 的 label（[<KindLabel>] <title>），两路均无则 kind 置空
 *   （仍占全局槽、不占任何 kind 槽——保守安全）；
 * - 判定委托 core 的 evaluateExecutorCapacity 纯函数，拒绝时返回 formatAtCapacityReceipt
 *   文案（不抛错、不写 dispatches、不 spawn），主会话稍后自行重试；
 * - 续用路径调用方传入 excludeChildId，把目标 child 从 running 集合排除（其槽不重复计）；
 * - 进程内同步 in-flight 结构：DSH 同轮可并行多工具调用，闸判定→startContinuable 之间
 *   存在异步窗口，两笔派发可同时过闸（与 Pi 缺陷 4 同款）。镜像 Pi 的 provisional 方案：
 *   闸判定通过后同步登记 in-flight 条目（键用派发序号），取数 = native listChildren(running)
 *   ∪ in-flight 本地集；startContinuable 成功返回后 child 已进 native 视野→移除本地项；
 *   失败/异常路径 catch 中移除。in-flight 是会话进程内结构，本会话计数语义不变。
 */
import type { SubagentListEntry } from '@deepseek-ai/dsh-subagent'
import { evaluateExecutorCapacity, formatAtCapacityReceipt, readTask } from '@workloom-ai/core'
import type { RunningExecutorRecord } from '@workloom-ai/core'

import type { MinimalAgent } from './executor.js'
import { KIND_LABELS } from './executor-injection.js'

/* ---- 进程内同步 in-flight 结构（DSH 闸异步窗口竞态防治） ---- */

/** in-flight 派发条目（闸判定通过后、startContinuable 返回前占槽）。 */
interface InFlightEntry {
  /** 本次派发的 executor 类型。 */
  kind: string
}

/** 派发序号 → in-flight 条目（进程内同步，本会话计数语义不变）。 */
const inFlightDispatches = new Map<string, InFlightEntry>()

/** 派发序号计数器（进程内单调递增，同毫秒内区分多笔派发）。 */
let dispatchSeqCounter = 0

/** in-flight 条目的 childId 前缀（避免与真实 childId 碰撞）。 */
const IN_FLIGHT_PREFIX = '__inflight_'

/**
 * 生成唯一派发序号（同步，进程内单调递增）。
 * @returns 派发序号（"dispatch-<counter>"）
 */
export function generateDispatchSeq(): string {
  dispatchSeqCounter += 1
  return `dispatch-${dispatchSeqCounter}`
}

/**
 * 登记 in-flight 派发（同步：闸判定通过后立即调用，再 await startContinuable）。
 * @param seq 派发序号（generateDispatchSeq 生成）
 * @param kind 本次派发的 executor 类型
 */
export function registerInFlightDispatch(seq: string, kind: string): void {
  inFlightDispatches.set(seq, { kind })
}

/**
 * 释放 in-flight 派发（startContinuable 成功返回后 child 已进 native 视野，
 * 或失败/异常路径）。
 * @param seq 派发序号
 */
export function releaseInFlightDispatch(seq: string): void {
  inFlightDispatches.delete(seq)
}

/**
 * 读取当前 in-flight 派发记录（合并到 native running 集合）。
 * @returns in-flight executor 记录集合
 */
export function getInFlightDispatches(): RunningExecutorRecord[] {
  const records: RunningExecutorRecord[] = []
  for (const [seq, entry] of inFlightDispatches) {
    records.push({ childId: `${IN_FLIGHT_PREFIX}${seq}`, kind: entry.kind })
  }
  return records
}

/**
 * 清空全部 in-flight 派发（仅测试用，恢复干净状态）。
 */
export function clearInFlightDispatches(): void {
  inFlightDispatches.clear()
}

/** 子代理服务的最小 running 取数接口（DSH 原生 listChildren 会话级枚举）。 */
export interface RunningCollectionService {
  listChildren(parentId: string, signal?: AbortSignal): Promise<SubagentListEntry[]>
}

/**
 * label 显示标签 → executor kind 反向映射（回退解析用，枚举禁 Magic String）：
 * 由 buildChildLabel 使用的 KIND_LABELS 单一来源反转派生，两侧永不失配。
 */
const LABEL_TO_KIND: Record<string, string> = Object.fromEntries(
  Object.entries(KIND_LABELS).map(([kind, label]) => [label, kind]),
)

/** 从 listChildren label（[<KindLabel>] <title>）回退解析 kind。 */
function kindFromLabel(label: string | undefined): string | undefined {
  if (!label) return undefined
  const match = label.match(/^\[([^\]]+)\]/)
  if (!match) return undefined
  const labelText = match[1]
  if (labelText === undefined) return undefined
  return LABEL_TO_KIND[labelText]
}

/**
 * 收集本主会话 running executor 集合（DSH native 会话级 + dispatches 补 kind）。
 * @param service 子代理服务（listChildren 枚举）
 * @param parent 发起 agent（取 id 作为 listChildren 的 parentSessionId）
 * @param signal 取消信号
 * @param root 项目根
 * @param taskRelPath 任务目录相对 .workloom 的路径（读 dispatches 补 kind）
 * @param excludeChildId 排除的 childId（续用路径：目标 child 不重复占槽）
 * @returns running executor 记录集合
 */
export async function collectRunningExecutors(
  service: RunningCollectionService,
  parent: MinimalAgent,
  signal: AbortSignal,
  root: string,
  taskRelPath: string,
  excludeChildId?: string,
): Promise<RunningExecutorRecord[]> {
  const entries = await service.listChildren(parent.id, signal)
  // childId → kind：优先本任务 dispatches 记录（workloom 派发留痕，权威来源）。
  const [taskErr, task] = readTask(root, taskRelPath)
  const kindByChildId = new Map<string, string>()
  if (taskErr === null && task !== null) {
    for (const d of task.dispatches ?? []) {
      if (d.childId && d.kind) kindByChildId.set(d.childId, d.kind)
    }
  }
  const records: RunningExecutorRecord[] = []
  for (const entry of entries) {
    // 仅计本主会话在途 child（activity='running'），排除续用目标。
    if (entry.kind !== 'child' || entry.activity !== 'running') continue
    if (entry.id === excludeChildId) continue
    const kind = kindByChildId.get(entry.id) ?? kindFromLabel(entry.label) ?? ''
    records.push({ childId: entry.id, kind })
  }
  // 合并进程内同步 in-flight 集：关闭闸判定→startContinuable 的异步窗口竞态。
  records.push(...getInFlightDispatches())
  return records
}

/**
 * 判定并发闸（纯同步，无副作用）：放行返回 null，拒绝返回 at capacity 回执文案。
 * @param running 本主会话 running executor 集合
 * @param kind 本次派发的 executor 类型
 * @param globalLimit 全局并发上限（0 = 不限）
 * @param kindLimit 本次 kind 上限（undefined = 该层不限，0 = 不限，> 0 = 上限）
 * @returns null = 放行；非 null = 拒绝，值为英文 at capacity 回执文案
 */
export function evaluateCapacityGate(
  running: RunningExecutorRecord[],
  kind: string,
  globalLimit: number,
  kindLimit: number | undefined,
): string | null {
  const result = evaluateExecutorCapacity({ running, kind, globalLimit, kindLimit })
  if (result.allow) return null
  return formatAtCapacityReceipt(kind, result)
}
