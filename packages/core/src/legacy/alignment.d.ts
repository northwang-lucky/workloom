/** alignment 凭据纯函数（alignment 模块）的公共类型（供 JSDoc 引用）。 */

import type { TaskAlignmentRecord, TaskStatusValue } from './task-store.d.ts'

/** 开放节点标记取值（`<!-- workloom:open-nodes=pending|none -->`）。 */
export type OpenNodeState = 'pending' | 'none'

/** 开放节点标记值域常量对象。 */
export const OPEN_NODE_MARKER: Readonly<{ PENDING: 'pending'; NONE: 'none' }>

/** alignment 门禁缺失项文案：无凭据（planning start 拦截）。 */
export const ALIGNMENT_MISSING: string

/** alignment 门禁缺失项文案：凭据 hash 与当前 prd 不一致（stale）。 */
export const ALIGNMENT_STALE: string

/** 归一化 prd.md 全文行尾：CRLF/CR 一律转 LF。 */
export function normalizePrdEol(content: string): string

/** 对归一化后的 prd 全文计算 SHA-256（hex 小写）。 */
export function computePrdHash(content: string): string

/** 扫描全文中的开放节点标记：无标记 null；任一 pending → pending；全 none → none。 */
export function findOpenNodeState(content: string): OpenNodeState | null

/**
 * 求值 alignment 门禁矩阵：按 status × alignment 凭据 × 当前 prd hash 产出缺失项。
 * planning 无凭据/凭据 stale 均拦截；in_progress 仅凭据 stale 拦截；旧 in_progress
 * 空凭据与 completed 放行。
 */
export function evaluateAlignmentGate(
  status: TaskStatusValue,
  alignment: TaskAlignmentRecord | null,
  currentPrdHash: string,
): string[]
