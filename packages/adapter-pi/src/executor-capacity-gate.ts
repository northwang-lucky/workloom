/**
 * adapter-pi 的 executor 并发容量闸（取数 + 判定接线）。
 *
 * 设计意图：
 * - 从 pi-child-registry 的进程内表取在途 running 记录（本会话计数），
 *   调 core 的 evaluateExecutorCapacity 判定放行/拒绝；
 * - 计槽口径：starting/running（占槽），idle 不计（完工常驻待续用）；
 * - 续用时把目标 childId 从 running 排除后再判（避免自占槽误拒）。
 */

import { evaluateExecutorCapacity } from '@workloom-ai/core'
import type { CapacityResult, RunningExecutorRecord } from '@workloom-ai/core'

import { getAllChildren } from './pi-child-registry.ts'

/**
 * 从 Pi child 注册表读取在途（占槽）记录（纯读取，无副作用）。
 * 计槽口径：starting（provisional）+ running；idle 不计（已完工常驻，待续用）。
 * @returns 占槽 executor 记录集合（childId + kind）
 */
export function readRunningFromRegistry(): RunningExecutorRecord[] {
  const records: RunningExecutorRecord[] = []
  for (const [childId, entry] of getAllChildren()) {
    // 计槽：starting + running；idle 不计（完工常驻）；终态已移除。
    if (entry.status === 'starting' || entry.status === 'running') {
      records.push({ childId, kind: entry.kind })
    }
  }
  return records
}

/**
 * 并发容量闸（注册表取数 + core 判定）。
 * @param kind 本次派发/续用的 executor 类型
 * @param globalLimit 全局上限（0 = 不限）
 * @param kindLimit kind 上限（undefined = 不限，0 = 不限）
 * @param excludeChildId 续用时排除的目标 childId（避免自占槽误拒；新派发不传）
 * @returns core 判定结果
 */
export function checkExecutorCapacity(
  kind: string,
  globalLimit: number,
  kindLimit: number | undefined,
  excludeChildId?: string,
): CapacityResult {
  const running = readRunningFromRegistry()
  const filtered = excludeChildId !== undefined
    ? running.filter((r) => r.childId !== excludeChildId)
    : running
  return evaluateExecutorCapacity({ running: filtered, kind, globalLimit, kindLimit })
}
