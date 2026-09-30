/**
 * 校验 effort 档位；undefined 通过（未指定）。非法值抛 Error（英文文案）。
 * @param {string | undefined} effort effort 档位
 */
export function assertEffort(effort: string | undefined): void;
/**
 * 校验 executor kind；undefined 通过（未指定）。非法值抛 Error（英文文案）。
 * @param {string | undefined} kind executor 类型
 */
export function assertKind(kind: string | undefined): void;
/**
 * 组装 executor 首条 prompt：段落按 kind 白名单排序（任务标注 + marker → prd 块
 * → Pointer list → Research materials → prd 软指针 → Local directives → Task prompt
 * → Executor contract）。
 * @param {import('./executor-context.d.ts').BuildExecutorPromptParams} params
 *   入参（root 为项目根；taskRelPath 为任务目录相对 .workloom 的路径）
 * @returns {[Error | null, import('./executor-context.d.ts').ExecutorPromptResult | null]}
 *   err 为 jsonl 坏行等结构性故障；成功返回 {text, stats}
 */
export function buildExecutorPrompt(params: import("./executor-context.d.ts").BuildExecutorPromptParams): [Error | null, import("./executor-context.d.ts").ExecutorPromptResult | null];
/**
 * 解析 jsonl 全文为有效条目列表（导出供 task-gates 复用同一判定逻辑）。
 * 空行跳过；seed _example 行跳过；坏行/无 file 非 seed 行抛错（fail loud）。
 * @param {string} content jsonl 全文
 * @param {string} jsonlName jsonl 文件名（错误消息用）
 * @returns {import('./executor-context.d.ts').JsonlEntry[]}
 */
export function parseJsonlEntries(content: string, jsonlName: string): import("./executor-context.d.ts").JsonlEntry[];
/** effort 合法档位（低 → 高）。 */
export const EFFORT_LEVELS: readonly string[];
/** executor 类型枚举（子代理角色）。 */
export const EXECUTOR_KINDS: Readonly<{
    research: "research";
    implement: "implement";
    check: "check";
    frontend: "frontend";
}>;
/**
 * 按 kind 的执行器纪律段正文（硬指令，单一来源，DSH/Pi 两 runtime 共享；
 * 与 adapter-pi 的 agent 角色总述互补不冲突）。
 * 并入注入文本末尾的终极权威段（`## Executor contract` 内 `### <Kind> executor
 * directives` 子段）；去重只看 leaf 关键词且仅豁免 leaf 规则行——纪律段与
 * 权威声明始终注入（kind 标题去重分支已删除）。
 * 键为 kind 字符串（运行时按 params.kind 索引，放宽为 Record<string, string>）。
 * @type {Record<string, string>}
 */
export const EXECUTOR_CONTRACT_BY_KIND: Record<string, string>;
