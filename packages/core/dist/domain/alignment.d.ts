/**
 * 归一化 prd.md 全文行尾：CRLF/CR 一律转 LF（hash 输入规范化）。
 * @param {string} content prd.md 全文
 * @returns {string} 行尾归一后的全文
 */
export function normalizePrdEol(content: string): string;
/**
 * 对归一化后的 prd 全文计算 SHA-256（hex 小写）。
 * @param {string} content prd.md 全文（含 Alignment Decisions 小节）
 * @returns {string} 64 位 hex 摘要
 */
export function computePrdHash(content: string): string;
/**
 * 扫描全文中的开放节点标记（语言无关注释）：
 * 无标记返回 null（未声明，不得视为已收敛）；任一带 pending 返回 pending
 * （标记冲突按保守口径判未收敛）；全部为 none 返回 none。
 * @param {string} content prd.md 全文
 * @returns {'pending' | 'none' | null}
 */
export function findOpenNodeState(content: string): "pending" | "none" | null;
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
export function evaluateAlignmentGate(status: import("./task-store.d.ts").TaskStatusValue, alignment: import("./task-store.d.ts").TaskAlignmentRecord | null, currentPrdHash: string): string[];
/**
 * 开放节点标记值域（`<!-- workloom:open-nodes=pending|none -->`）。
 * 收敛后必须为 none；pending 表示还有开放节点未收敛。
 * @type {Readonly<{ PENDING: 'pending', NONE: 'none' }>}
 */
export const OPEN_NODE_MARKER: Readonly<{
    PENDING: "pending";
    NONE: "none";
}>;
/** alignment 门禁缺失项文案：无凭据（planning start 拦截，指引下一步动作）。 */
export const ALIGNMENT_MISSING: "no alignment credential recorded (run workloom_task_align with action=confirm after Phase 1.1 converges)";
/** alignment 门禁缺失项文案：凭据 hash 与当前 prd 不一致（stale，指引重新确认）。 */
export const ALIGNMENT_STALE: "alignment credential is stale (prd.md changed since confirm; re-run workloom_task_align with action=confirm)";
