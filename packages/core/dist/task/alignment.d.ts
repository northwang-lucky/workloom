/** alignment 凭据纯函数（alignment 模块）的公共类型（供 JSDoc 引用）。 */

import type { TaskAlignmentRecord, TaskStatusValue } from './task-store.d.ts'

/** alignment 门禁缺失项文案：无凭据（planning start 拦截）。 */
export const ALIGNMENT_MISSING: string

/**
 * 求值 alignment 门禁矩阵：凭据只判「有无」，不比对文档哈希。
 * planning 无凭据拦截；有凭据即放行（确认后的文档改动不再自动失效）；
 * 旧 in_progress 空凭据与 completed 放行。
 */
export function evaluateAlignmentGate(
  status: TaskStatusValue,
  alignment: TaskAlignmentRecord | null,
): string[]
