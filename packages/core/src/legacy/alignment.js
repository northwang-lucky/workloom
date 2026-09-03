/**
 * alignment 凭据纯函数（行为移植模块，纯 JS + JSDoc）。
 *
 * 设计意图：
 * - 对齐凭据的机器面收敛为三类纯函数：prd 全文规范化 hash、开放节点标记
 *   扫描、凭据门禁矩阵（planning start / in_progress stale 共用）；
 * - hash 输入是含 `## Alignment Decisions` 的最终 prd 全文，行尾仅把
 *   CRLF/CR 归一为 LF（与 skill 写入格式无关，避免凭据随换行抖动）；
 * - 开放节点只认语言无关的 HTML 注释标记（pending|none），不新增 H2
 *   小节解析器；无标记视为「未声明」，不当作已收敛；
 * - 本模块不触盘、不 import task-store（防循环）：门禁按调用方传入的
 *   status/凭据/当前 hash 求值，文件读取留在 task-gates/task-store。
 */

import { createHash } from 'node:crypto'

/** planning 状态取值（task.json.status；与 task-store 枚举一致，此处防循环逐字重复）。 */
const PLANNING_STATUS = 'planning'

/** alignment 门禁生效的状态集合（planning 挡 start；in_progress 挡 executor/check/archive）。 */
const GATED_STATUSES = new Set(['planning', 'in_progress'])

/**
 * 开放节点标记值域（`<!-- workloom:open-nodes=pending|none -->`）。
 * 收敛后必须为 none；pending 表示还有开放节点未收敛。
 * @type {Readonly<{ PENDING: 'pending', NONE: 'none' }>}
 */
export const OPEN_NODE_MARKER = Object.freeze({
  PENDING: 'pending',
  NONE: 'none',
})

/** 开放节点标记整体匹配（捕获 pending|none；宽容空白）。 */
const OPEN_NODE_MARKER_RE = /<!--\s*workloom:open-nodes=(pending|none)\s*-->/g

/** alignment 门禁缺失项文案：无凭据（planning start 拦截，指引下一步动作）。 */
export const ALIGNMENT_MISSING =
  'no alignment credential recorded (run workloom_task_align with action=confirm after Phase 1.1 converges)'

/** alignment 门禁缺失项文案：凭据 hash 与当前 prd 不一致（stale，指引重新确认）。 */
export const ALIGNMENT_STALE =
  'alignment credential is stale (prd.md changed since confirm; re-run workloom_task_align with action=confirm)'

/**
 * 归一化 prd.md 全文行尾：CRLF/CR 一律转 LF（hash 输入规范化）。
 * @param {string} content prd.md 全文
 * @returns {string} 行尾归一后的全文
 */
export function normalizePrdEol(content) {
  return content.replace(/\r\n|\r/g, '\n')
}

/**
 * 对归一化后的 prd 全文计算 SHA-256（hex 小写）。
 * @param {string} content prd.md 全文（含 Alignment Decisions 小节）
 * @returns {string} 64 位 hex 摘要
 */
export function computePrdHash(content) {
  return createHash('sha256').update(normalizePrdEol(content), 'utf8').digest('hex')
}

/**
 * 扫描全文中的开放节点标记（语言无关注释）：
 * 无标记返回 null（未声明，不得视为已收敛）；任一带 pending 返回 pending
 * （标记冲突按保守口径判未收敛）；全部为 none 返回 none。
 * @param {string} content prd.md 全文
 * @returns {'pending' | 'none' | null}
 */
export function findOpenNodeState(content) {
  let state = null
  for (const match of content.matchAll(OPEN_NODE_MARKER_RE)) {
    if (match[1] === OPEN_NODE_MARKER.PENDING) return OPEN_NODE_MARKER.PENDING
    state = OPEN_NODE_MARKER.NONE
  }
  return state
}

/**
 * 求值 alignment 门禁矩阵（纯函数，无 IO）：按「status × alignment 凭据 ×
 * 当前 prd hash」产出缺失项描述：
 * - planning 且无凭据 → 拦截（旧 planning 任务须重新 alignment，R17）；
 * - status 在门禁面（planning/in_progress）且有凭据但 hash 失配 → 拦截
 *   （stale：planning 挡 start；in_progress 挡 executor 派发/check/archive，R13）；
 * - in_progress 无凭据（旧任务）与 completed → 放行（不追溯阻断，R17）。
 * 相同 hash 幂等放行；hash 只认凭据里的 prdHash 快照与当前计算值逐字节相等。
 * @param {import('./task-store.d.ts').TaskStatusValue} status 任务状态
 * @param {import('./task-store.d.ts').TaskAlignmentRecord | null} alignment task.json alignment 字段
 * @param {string} currentPrdHash 当前 prd.md 的 computePrdHash 结果
 * @returns {string[]} 缺失项描述列表（空数组表示通过）
 */
export function evaluateAlignmentGate(status, alignment, currentPrdHash) {
  if (!GATED_STATUSES.has(status)) return []
  if (alignment === null) {
    return status === PLANNING_STATUS ? [ALIGNMENT_MISSING] : []
  }
  return alignment.prdHash === currentPrdHash ? [] : [ALIGNMENT_STALE]
}
