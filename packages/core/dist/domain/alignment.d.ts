/** alignment 凭据纯函数（alignment 模块）的公共类型（供 JSDoc 引用）。 */

import type { TaskAlignmentRecord, TaskStatusValue } from './task-store.d.ts'

/** 开放节点标记取值（`<!-- workloom:open-nodes=pending|none -->`）。 */
export type OpenNodeState = 'pending' | 'none'

/** 开放节点标记值域常量对象。 */
export const OPEN_NODE_MARKER: Readonly<{ PENDING: 'pending'; NONE: 'none' }>

/** alignment 门禁缺失项文案：无凭据（planning start 拦截）。 */
export const ALIGNMENT_MISSING: string

/** 扫描全文中的开放节点标记：无标记 null；任一 pending → pending；全 none → none。 */
export function findOpenNodeState(content: string): OpenNodeState | null

/**
 * 求值 alignment 门禁矩阵：凭据只判「有无」，不比对文档哈希。
 * planning 无凭据拦截；有凭据即放行（确认后的文档改动不再自动失效）；
 * 旧 in_progress 空凭据与 completed 放行。
 */
export function evaluateAlignmentGate(
  status: TaskStatusValue,
  alignment: TaskAlignmentRecord | null,
): string[]
