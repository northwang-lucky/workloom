/**
 * alignment 凭据纯函数（行为移植模块，纯 JS + JSDoc）。
 *
 * 设计意图：
 * - 对齐凭据的机器面收敛为两类纯函数：开放节点标记扫描、凭据门禁矩阵
 *   （planning start 拦截无凭据）；
 * - 凭据只判「有无」，不比对文档哈希：确认后的文档改动不再自动失效，
 *   由 workflow 的内容变更规则与主会话复核兜底（有意取舍，见任务 R2）；
 * - 开放节点只认语言无关的 HTML 注释标记（pending|none），不新增 H2
 *   小节解析器；无标记视为「未声明」，不当作已收敛；
 * - 本模块不触盘、不 import task-store（防循环）：门禁按调用方传入的
 *   status/凭据求值，文件读取留在 task-gates/task-store。
 */
/** planning 状态取值（task.json.status；与 task-store 枚举一致，此处防循环逐字重复）。 */
const PLANNING_STATUS = 'planning';
/** alignment 门禁生效的状态集合（planning 挡 start）。 */
const GATED_STATUSES = new Set(['planning']);
/**
 * 开放节点标记值域（`<!-- workloom:open-nodes=pending|none -->`）。
 * 收敛后必须为 none；pending 表示还有开放节点未收敛。
 * @type {Readonly<{ PENDING: 'pending', NONE: 'none' }>}
 */
export const OPEN_NODE_MARKER = Object.freeze({
    PENDING: 'pending',
    NONE: 'none',
});
/** 开放节点标记整体匹配（捕获 pending|none；宽容空白）。 */
const OPEN_NODE_MARKER_RE = /<!--\s*workloom:open-nodes=(pending|none)\s*-->/g;
/** alignment 门禁缺失项文案：无凭据（planning start 拦截，指引下一步动作）。 */
export const ALIGNMENT_MISSING = 'no alignment credential recorded (run workloom_task_align with action=confirm after Phase 1.1 converges)';
/**
 * 扫描全文中的开放节点标记（语言无关注释）：
 * 无标记返回 null（未声明，不得视为已收敛）；任一带 pending 返回 pending
 * （标记冲突按保守口径判未收敛）；全部为 none 返回 none。
 * @param {string} content prd.md 全文
 * @returns {'pending' | 'none' | null}
 */
export function findOpenNodeState(content) {
    let state = null;
    for (const match of content.matchAll(OPEN_NODE_MARKER_RE)) {
        if (match[1] === OPEN_NODE_MARKER.PENDING)
            return OPEN_NODE_MARKER.PENDING;
        state = OPEN_NODE_MARKER.NONE;
    }
    return state;
}
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
    if (!GATED_STATUSES.has(status))
        return [];
    if (alignment === null) {
        return status === PLANNING_STATUS ? [ALIGNMENT_MISSING] : [];
    }
    return [];
}
//# sourceMappingURL=alignment.js.map