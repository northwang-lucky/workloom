/**
 * executor 上下文注入组装（行为移植模块，纯 JS + JSDoc）。
 *
 * 设计意图（注入瘦身任务 09-22：段落白名单 + 分层加载协议）：
 * - 子代理派发前组装首条 prompt，段落按 kind 白名单统一排序：任务标注 + 注入
 *   marker → （check/research/review：prd 全文节块）→ Pointer list（research 无；首行为
 *   plan.md 纯指针行，后接 jsonl 条目）→ Research materials → （implement/
 *   frontend：prd 软指针行）→ （worktree_path 非空：`## Worktree` 纪律段）→
 *   Local directives → Task prompt → Executor contract；
 * - 指针化（体积压到指针级）：jsonl 条目、research/*.md、plan.md 均只给
 *   「路径 + reason」指针行，无逐行读后判后缀；prd 仅 check/research/review 物化
 *   Requirements/Acceptance 全文 + 其余节标题指针（验收基线/问题框架，职责必需），
 *   implement/frontend 只出软指针行（有歧义时按需查阅，非必读）；
 * - 分层加载协议（取代开工前强制全读）：开工前必读计划 artifact，其余指针步骤
 *   需要时定点读区间，显式禁止 upfront 通读整个指针清单；措辞与 assets 契约
 *   workflow.md Loading protocol 行同源（check 逐字核对）；
 * - 可靠性护栏（切片 ⑤）：每次派发注入唯一 marker token，纪律句要求执行器报告
 *   首行回显（证明注入到达且协议被读）；
 * - 预算来自 config.contextInjection：max_artifact_bytes 限 prd 块、max_total_bytes
 *   限总量；指针行极轻量无截断语义，预算仅对 artifact 内容生效（128KB 上限保留
 *   作兜底）；超限截断并追加 [...truncated at N bytes] 提示；
 * - jsonl 缺失按空处理；jsonl 行解析失败显式报错（fail loud，无灰区）。
 */
/** effort 合法档位（低 → 高）。 */
export declare const EFFORT_LEVELS: readonly string[];
/**
 * 校验 effort 档位；undefined 通过（未指定）。非法值抛 Error（英文文案）。
 * @param {string | undefined} effort effort 档位
 */
export declare function assertEffort(effort: string | undefined): void;
/**
 * 校验 executor kind；undefined 通过（未指定）。非法值抛 Error（英文文案）。
 * @param {string | undefined} kind executor 类型
 */
export declare function assertKind(kind: string | undefined): void;
/**
 * 组装 executor 首条 prompt：段落按 kind 白名单排序（任务标注 + marker → prd 块
 * → Pointer list → Research materials → prd 软指针 → worktree 纪律段（worktree_path
 * 非空时）→ Local directives → Task prompt → Executor contract）。
 * @param {import('./executor-context.d.ts').BuildExecutorPromptParams} params
 *   入参（root 为项目根；taskRelPath 为任务目录相对 .workloom 的路径）
 * @returns {[Error | null, import('./executor-context.d.ts').ExecutorPromptResult | null]}
 *   err 为 jsonl 坏行等结构性故障；成功返回 {text, stats}
 */
export interface BuildExecutorPromptParams {
    /** 项目根（必须已是 findWorkloomRoot 的结果）。 */
    root: string;
    /** 任务目录相对 .workloom 的路径。 */
    taskRelPath: string;
    /** executor 类型（research/implement/check/frontend/review）。 */
    kind: string;
    /** 用户任务正文（拼在 prompt 末尾的 ## Task prompt 节）。 */
    userPrompt: string;
    /**
     * 契约节整段文本（runtime 纪律话语，调用方组装；dsh 从 discipline-text 组装）。
     * 注入文本末尾整段追加；未传 = 不注入（增量续接路径不需要契约节）。
     */
    contractSection?: string;
    /** check 派发目的（CASE 设计轮保持 stage；execution 轮要求确认有效）。缺省 execution。 */
    purpose?: 'case-design' | 'execution';
    /** CASE 模板正文（仅 check kind 注入）。缺省不注入。 */
    caseTemplates?: {
        path: string;
        content: string;
    }[];
    /** 本机片段合成文本；空串/未传 = 不注入。 */
    localDirectives?: string;
    /** 目标环境是否具备 LSP 工具面（仅透传给统计语义，纪律过滤在契约节组装方）。 */
    hasLsp?: boolean;
}
/** 组装统计：内联/指针/截断计数。 */
export interface ExecutorPromptStats {
    /** 注入的 artifact 块数（check/research/review 物化的 prd 全文节块）。 */
    filesInlined: number;
    /** 指针引用条数（plan.md/jsonl/research/prd 软指针等）。 */
    filesPointed: number;
    /** 发生内容截断的次数（artifact 按预算截断）。 */
    truncated: number;
}
/** buildExecutorPrompt 成功结果。 */
export interface ExecutorPromptResult {
    /** 组装好的 prompt 全文。 */
    text: string;
    /** 组装统计。 */
    stats: ExecutorPromptStats;
}
export declare function buildExecutorPrompt(params: BuildExecutorPromptParams): [Error | null, ExecutorPromptResult | null];
/**
 * 普通增量续用文本：只追加本轮执行指令；execution 轮先校验执行前置
 * （CASE 文档缺失/设计会话缺失直接抛错，拒绝发送增量）；非 check kind
 * 原文返回，不做 CASE 校验。
 * @param {import('./executor-context.d.ts').BuildExecutorPromptParams} params 增量参数
 * @returns {string} 发送给原会话的增量指令
 */
export declare function buildExecutorIncrementalPrompt(params: BuildExecutorPromptParams): string;
