/**
 * 判定 prd.md 是否缺一级标题（H1）：跳过开头空行后，首个非空行必须
 * 是以 `# ` 开头且带非空标题文本的标题行。
 * @param {string} prdContent prd.md 全文
 * @returns {string | null} 缺失时返回缺失文案，通过返回 null
 */
export function findMissingPrdTitle(prdContent: string): string | null;
/**
 * 检查 prd.md 的结构与内容门禁，一次性返回全部问题（review/confirm/start/doctor 共用）。
 *
 * 设计意图：把「当前 prd 内容能否通过 confirm」的判断收敛为单一纯函数，
 * 调用方只消费结构化 issue，不再各自复制 PRD 解析规则。
 * 顺序固定：H1 → PRD_SECTIONS 顺序的四个小节 → open-nodes marker。
 * @param {string | null} prdContent prd.md 全文（缺失传 null）
 * @returns {import('./task-gates.d.ts').PrdStructureIssue[]} 结构问题列表（空数组表示通过）
 */
export function inspectPrdStructure(prdContent: string | null): import("./task-gates.d.ts").PrdStructureIssue[];
/**
 * 找出未填的 prd 小节标题列表（缺失与 placeholder 均视为未填）。
 * 兼容包装：从分类结果中只投影两类 section issue，保持旧调用方需要的字符串数组语义。
 * @param {string} prdContent prd.md 全文
 * @returns {string[]} 未填小节标题列表（空数组表示全部填写）
 */
export function findUnfilledPrdSections(prdContent: string): string[];
/**
 * 统计 jsonl 内容中的有效记录数（有 file 字段的行）。
 * 解析语义复用 executor-context：seed _example 行豁免，结构性坏行抛错透传。
 * @param {string} content jsonl 全文
 * @param {string} jsonlName jsonl 文件名（错误消息用）
 * @returns {number}
 */
export function countEffectiveJsonlRecords(content: string, jsonlName: string): number;
/**
 * 求值 stale alignment 门禁（含 IO，供 executor 派发/check/archive 复用）：
 * 只对 in_progress 且有 alignment 凭据的任务判 stale——读取当前 prd.md 计算
 * hash 与凭据快照比对，失配返回缺失项（R13：旧 in_progress 空凭据任务与
 * planning research 不受此门影响）。prd 缺失返回空（缺失由其他门禁覆盖）。
 * @param {string} root 项目根（必须已是 findWorkloomRoot 的结果）
 * @param {string} taskRelPath 任务目录相对 .workloom 的路径
 * @param {import('./task-store.d.ts').TaskRecord} task 归一化后的任务记录（alignment 凭据）
 * @returns {string[]} 缺失项描述列表（空数组表示通过）
 */
export function evaluateStaleAlignmentGate(root: string, taskRelPath: string, task: import("./task-store.d.ts").TaskRecord): string[];
/**
 * 求值 start 门禁：返回缺失项描述列表（空数组表示通过）。
 * prd.md 缺失/一级标题缺失/小节未填、implement.jsonl 与 check.jsonl 无有效记录、
 * alignment 门禁缺失项（planning 无凭据或凭据 hash 与当前 prd 不一致）各占一项；
 * jsonl 结构性坏行抛错（fail loud，不放行）。
 * @param {string} root 项目根（必须已是 findWorkloomRoot 的结果）
 * @param {string} taskRelPath 任务目录相对 .workloom 的路径
 * @param {import('./task-store.d.ts').TaskRecord} task 归一化后的任务记录（alignment 凭据）
 * @returns {string[]} 缺失项描述列表
 */
export function evaluateStartGate(root: string, taskRelPath: string, task: import("./task-store.d.ts").TaskRecord): string[];
/**
 * 求值 check 门禁：check.jsonl 至少一条有效记录才允许写 check 字段。
 * @param {string} root 项目根（必须已是 findWorkloomRoot 的结果）
 * @param {string} taskRelPath 任务目录相对 .workloom 的路径
 * @returns {string[]} 缺失项描述列表（空数组表示通过）
 */
export function evaluateCheckLogGate(root: string, taskRelPath: string): string[];
/**
 * 求值前端派发门禁（纯函数，无 IO，只求值不读写）：prd.md 含「UI Design」小节
 * 但 dispatches 无 `kind === 'frontend'` 条目时返回缺失项（机制强制：涉及前端
 * 展示的任务，其前端文件实现必须经 frontend executor 派发；逻辑/后端仍走
 * implement）；否则返回空数组。prd 内容与派发记录由调用方（checkTaskInternal）
 * 喂入，维持「任务读写仍在 task-store」的分层。
 * @param {string | null} prdContent prd.md 全文（缺失传 null）
 * @param {import('./task-store.d.ts').DispatchRecord[]} dispatches 派发记录数组
 * @returns {string[]} 缺失项描述列表（空数组表示通过）
 */
export function evaluateFrontendDispatchGate(prdContent: string | null, dispatches: import("./task-store.d.ts").DispatchRecord[]): string[];
/**
 * 组装一条 force 豁免记录（gate/tool/at/reason?，reason 空串不记）。
 * @param {import('./task-gates.d.ts').GateValue} gate 卡点
 * @param {string | undefined} reason 豁免原因（审计用）
 * @returns {import('./task-store.d.ts').GateOverride}
 */
export function makeOverride(gate: import("./task-gates.d.ts").GateValue, reason: string | undefined): import("./task-store.d.ts").GateOverride;
/**
 * 卡点枚举（task.json overrides[].gate 取值）。
 * @type {Readonly<Record<import('./task-gates.d.ts').GateKey, import('./task-gates.d.ts').GateValue>>}
 */
export const GATES: Readonly<Record<import("./task-gates.d.ts").GateKey, import("./task-gates.d.ts").GateValue>>;
/**
 * 卡点对应的工具名（overrides[].tool 取值，供审计对照调用入口）。
 * 键与 GATES 取值一一对应，Record 类型强制完备。
 * @type {Readonly<Record<import('./task-gates.d.ts').GateValue, string>>}
 */
export const GATE_TOOLS: Readonly<Record<import("./task-gates.d.ts").GateValue, string>>;
/**
 * prd.md 骨架：各小节标题与占位说明（顺序即文档顺序）。
 * task-store 生成骨架与本模块 placeholder 判定共用此常量。
 * @type {readonly import('./task-gates.d.ts').PrdSection[]}
 */
export const PRD_SECTIONS: readonly import("./task-gates.d.ts").PrdSection[];
/**
 * prd 结构问题 code（冻结值域，消费方禁止散落字符串字面量）。
 * @type {Readonly<{
 *   PRD_MISSING: 'prd_missing',
 *   PRD_TITLE_MISSING: 'prd_title_missing',
 *   PRD_SECTION_MISSING: 'prd_section_missing',
 *   PRD_SECTION_PLACEHOLDER: 'prd_section_placeholder',
 *   PRD_OPEN_NODES_MISSING: 'prd_open_nodes_missing',
 *   PRD_OPEN_NODES_NOT_NONE: 'prd_open_nodes_not_none',
 * }>}
 */
export const PRD_STRUCTURE_CODES: Readonly<{
    PRD_MISSING: "prd_missing";
    PRD_TITLE_MISSING: "prd_title_missing";
    PRD_SECTION_MISSING: "prd_section_missing";
    PRD_SECTION_PLACEHOLDER: "prd_section_placeholder";
    PRD_OPEN_NODES_MISSING: "prd_open_nodes_missing";
    PRD_OPEN_NODES_NOT_NONE: "prd_open_nodes_not_none";
}>;
/** prd 文件缺失文案（start 门禁、review 诊断、confirm 拦截共用同一句）。 */
export const PRD_MISSING: "prd.md is missing";
