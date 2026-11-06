/**
 * alignment 凭据纯函数（行为移植模块，纯 JS + JSDoc）。
 *
 * 设计意图：
 * - 对齐凭据的机器面收敛为凭据门禁矩阵（planning start 拦截无凭据）；
 *   开放节点 HTML 标记已删除，收敛判断由主会话阅读 Risks and Open
 *   Questions 的实际内容作出，用户确认记录承担后续启动依据；
 * - 凭据只判「有无」，不比对文档哈希：确认后的文档改动不再自动失效，
 *   由 workflow 的内容变更规则与主会话复核兜底（有意取舍，见任务 R2）；
 * - 本模块不触盘、不 import task-store（防循环）：门禁按调用方传入的
 *   status/凭据求值，文件读取留在 task-gates/task-store。
 */

/** planning 状态取值（task.json.status；与 task-store 枚举一致，此处防循环逐字重复）。 */
const PLANNING_STATUS = 'planning'

/** alignment 门禁生效的状态集合（planning 挡 start）。 */
const GATED_STATUSES = new Set(['planning'])

/** alignment 门禁缺失项文案：无凭据（planning start 拦截，指引下一步动作）。 */
export const ALIGNMENT_MISSING =
  'no alignment credential recorded (run workloom_task_align with action=confirm after Phase 1.1 converges)'

/**
 * 求值 alignment 门禁矩阵（纯函数，无 IO）：凭据只判「有无」，不比对文档哈希：
 * - planning 且无凭据 → 拦截（PRD 内容确认是 start 的前置，旧 planning 任务
 *   须重新 alignment）；
 * - 有凭据即放行：确认后的文档改动不再自动失效（stale 分支已删除），由
 *   workflow 的内容变更规则与主会话复核兜底；
 * - in_progress 无凭据（旧任务）与 completed → 放行（不追溯阻断）。
 * @param {import('./task-store.d.ts').TaskStatusValue} status 任务状态
 * @param {import('./task-store.d.ts').TaskAlignmentRecord | null} alignment task.json alignment 字段
 * @returns {string[]} 缺失项描述列表（空数组表示通过）
 */
export function evaluateAlignmentGate(status, alignment) {
  if (!GATED_STATUSES.has(status)) return []
  if (alignment === null) {
    return status === PLANNING_STATUS ? [ALIGNMENT_MISSING] : []
  }
  return []
}
