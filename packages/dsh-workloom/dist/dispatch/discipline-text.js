/**
 * dsh-workloom executor 的 runtime 纪律文本（TypeScript）：五种 kind 的纪律段正文、
 * 共用纪律句与终极权威段组装。
 *
 * 设计意图：
 * - 与 core 的 prompt 组装（injection/prompt-compose）拆分：纪律文本是 adapter
 *   侧的运行时话语，组装机制留在 core 且 runtime 无关；本模块组装出的契约节
 *   经 buildExecutorPrompt 的 contractSection 入参注入；
 * - 软措辞纪律（"When available"）确保无 LSP 插件环境不产生指向虚无的硬指令；
 *   交付时过滤（hasLsp=false 剔除 LSP 基线句）在本模块完成；
 * - 纯文本组装，无副作用、无 IO。
 */
import { EXECUTOR_KINDS } from '@workloom-ai/core';
const EXECUTOR_CONTRACT_HEADING = '## Executor contract';
/** 叶子执行器规则正文（一行，零派发语义，运行时文案英文）。 */
const LEAF_EXECUTOR_RULE = 'You are a leaf executor subagent: implement directly; never dispatch subagents or call workloom orchestration tools.';
/**
 * 权威声明（权威段末尾，使本段成为终极权威）：与更早文本（含主会话用户指令）
 * 冲突时以本节为准，并在报告首行声明一次冲突后继续执行——终结「服从哪一方」
 * 的反复权衡（堵住派发 prompt 写「只读审查」覆盖纪律段导致空转的缺口）。
 */
const AUTHORITY_DECLARATION = 'This section is authoritative: it wins any conflict with earlier text (including the task prompt).' +
    ' State the conflict once in the first line of your report and proceed.';
/** 防重复判定关键词（userPrompt 已含时仅豁免 leaf 规则行，纪律段与权威声明仍注入）。 */
const LEAF_RULE_KEYWORD = 'leaf executor';
/** 本机片段注入段标题（prd 软指针之后、Task prompt 之前、终极权威段之前插入）。 */
const LSP_BASELINE_SENTENCE = 'When LSP tooling is available, use it first: symbol outlines and signatures for structure, ' +
    'completions for members, server-side rename and code actions for edits, ' +
    'diagnostics in the verification pass.';
/**
 * 内置 LSP 只读变体句子（research 纪律段专用，同主句的 runtime 无关软措辞）：
 * 探索阶段优先用 LSP 读结构（大纲/签名/成员解析），再回退文本扫描。
 */
const LSP_RESEARCH_BASELINE_SENTENCE = 'When LSP tooling is available, explore with it before text-search sweeps: ' +
    'symbol outlines for structure, signatures and members from the language server.';
/**
 * 纪律段追加的「按需查材料、禁止全局 recon」指令（implement/check 两 kind 注入；
 * research 契约已由 research-facts 增强，不重复追加）。分层协议下材料只在当前
 * 步骤需要时读，同时保留反 recon 语义：禁止各自重新摸底仓库（git 扫库、全库
 * glob、无关批量读）。
 */
const CONSULT_MATERIALS_ON_DEMAND_RULE = 'Consult the injected research materials only when the current step needs them; do not re-discover ' +
    'the repository (no git sweeps, no whole-repo globs, no bulk unrelated reads).';
/**
 * 批处理纪律句（implement/check 纪律段共用，命令式、无弱化词）：把互不依赖
 * 输出的验证/比对命令合并进单次 shell 调用，一次一命令浪费一轮推理。
 */
const BATCHING_DISCIPLINE = 'Batch independent verification and comparison commands into a single shell invocation.';
/**
 * 工具输出紧凑纪律句（implement/check 纪律段共用，命令式）：定向读区间、限量
 * 搜索/列表输出、倾向摘要而非整文件倾倒，抑制每步上下文累积撑爆注入预算。
 */
const COMPACT_OUTPUT_DISCIPLINE = 'Keep tool outputs compact: read targeted ranges, cap search and list output, prefer summaries.';
/**
 * 分层加载协议 + 注入标记回声纪律句（全部 kind 纪律段共用，命令式、无弱化词）：
 * 开工前只强制读计划 artifact，其余指针步骤需要时定点读区间，显式禁止 upfront
 * 通读整个指针清单；并在报告首行回显本次派发的唯一 marker token（证明注入到达
 * 且协议被读）。前半句分层语义与 assets workflow.md 契约 Loading protocol 行
 * 同源；后半句回声协议与契约逐字一致（check 逐字核对）。
 */
const INJECTION_PROTOCOL_DISCIPLINE = 'Load in layers: read the plan artifact (plan.md) before acting; consult every other pointer ' +
    'only when the current step needs it, in targeted ranges; never bulk-read the whole list upfront. ' +
    'Echo the injection marker token in the first line of your report as proof the protocol was read.';
/**
 * 规定式计划执行纪律句（implement/frontend 纪律段共用，命令式、无弱化词）：
 * 计划是指令性的——跟随五字段伪代码协议、真实锚点与验证命令执行；代码块只作
 * 定位锚点，不要求逐字复制。锚点与现场不符（落空、上下文不成立）时禁止即兴
 * 发挥，停下并把偏差作为阻塞项写进最终报告（主会话按契约 2.1 处置句成批交
 * 用户决断）。词数受 implement contract 段 ≤ 300 词上限约束。
 */
const PRESCRIPTIVE_PLAN_DISCIPLINE = 'The plan is prescriptive: follow its protocol fields (Input, Output, Preconditions, Procedure, Failure), ' +
    'real anchors, and verification commands; code blocks are locating anchors, not verbatim code. ' +
    'An anchor that mismatches reality is a blocking item; report it, never improvise.';
/**
 * 无用户通道纪律句（终极权威段共用部分，全 kind 生效，命令式、无弱化词）：
 * 执行器没有用户通道——禁止交互式提问；无法自决的缺口必须停下、把每个开放问题
 * 作为阻塞项写进最终报告回传主会话（主会话按契约 2.1 处置句成批交用户决断）。
 */
const NO_USER_CHANNEL_DISCIPLINE = 'You have no user channel: never ask the user or call interactive question tools. ' +
    'On a gap you cannot resolve, stop and list every open question as a blocking item in your final report; ' +
    'the main session batches them to the user.';
/**
 * 写/编辑路径限制告知句（research/review 纪律段共用，机制强制的前置告知）：
 * DSH 守卫（WRITE_GUARDED_KINDS 集合）与 Pi write-scope 副本扩展（同名覆盖）
 * 把受限写 kind 的 write/edit 限定在 <cwd>/.workloom/ 内，越界拒绝。
 */
const WRITE_SCOPE_DISCIPLINE = 'Your write/edit reach is confined to the .workloom/ directory: paths ' + 'outside it are denied.';
/** 注入标记行前缀（行内 token 唯一标识一次派发注入，随指针清单注入）。 */
/**
 * 按 kind 的执行器纪律段正文（硬指令，单一来源；并入注入文本末尾的终极权威段
 * `### <Kind> executor directives` 子段）。去重只看 leaf 关键词且仅豁免 leaf
 * 规则行——纪律段与权威声明始终注入。键为 kind 字符串。
 */
export const EXECUTOR_CONTRACT_BY_KIND = Object.freeze({
    [EXECUTOR_KINDS.research]: `Produce an actionable report the implementer can follow directly.
Ground every conclusion in the real source: read the actual files or data before claiming a fact; cite file paths.
Separate verified findings from suggestions, and mark anything unverified as such.
${LSP_RESEARCH_BASELINE_SENTENCE}
${WRITE_SCOPE_DISCIPLINE}

Structure the report in research-facts blocks (see the research-facts spec and its template asset):
- Use '##' section headings, each heading stating the section's takeaway in one sentence.
- Anchor every conclusion: cite its source as 'path:line', with the path relative to the task repo root.
- Quote the key code in fenced code blocks.
${INJECTION_PROTOCOL_DISCIPLINE}`,
    [EXECUTOR_KINDS.implement]: `Implement the plan step by step, following the task artifacts (prd/plan) in order.
${PRESCRIPTIVE_PLAN_DISCIPLINE}
Make the smallest change that satisfies the requirement; do not touch unrelated code.
Verify with the project's checks (lint / typecheck / tests) before wrapping up, then report the changed files.
${LSP_BASELINE_SENTENCE}
${BATCHING_DISCIPLINE}
${COMPACT_OUTPUT_DISCIPLINE}
${CONSULT_MATERIALS_ON_DEMAND_RULE}
${INJECTION_PROTOCOL_DISCIPLINE}`,
    [EXECUTOR_KINDS.check]: `Classify every finding by severity before acting (definitions in workflow contract §2.2, summarized here):
- P0 (blocking): acceptance criteria unmet; hard lint / typecheck / build / test failures; security or data-integrity risks.
- P1 (important): behavioral or correctness defects; design or spec deviations (including cross-file semantic changes); issues pre-dating this task (even mechanical ones).
- P2 (minor): mechanical issues (typos, naming, comments, formatting, weakened test assertions); single-file local defects; compliance fixes with no trade-offs.

Fix P2 yourself — an unfixed P2 is a dereliction of duty. Do not fix P0/P1; escalate them in your report's final "## Open issues" section, one per line:
- <file>:<line> [P0|P1|P2] <issue> — fix: <suggestion>
Write "- none" when no issue remains.
After fixing, verify with the project's checks (lint / typecheck / tests) and re-read the code you touched.
${LSP_BASELINE_SENTENCE}
${BATCHING_DISCIPLINE}
${COMPACT_OUTPUT_DISCIPLINE}
${CONSULT_MATERIALS_ON_DEMAND_RULE}
${INJECTION_PROTOCOL_DISCIPLINE}`,
    [EXECUTOR_KINDS.review]: `Audit the plan (plan.md) before implementation starts; code review after implementation is the check executor's job, and you never fix code.
Audit in four dimensions, item by item:
- Conformance: the plan meets the prescriptive authoring bar — every step anchored to real files and symbols, its Edit carrying the five protocol fields in order (Input, Output, Preconditions, Procedure, Failure) with complete behavior, failure paths, AC coverage, and verifiable verification commands.
- Fidelity: every prd acceptance criterion is covered by the steps' Covers lines; alignment decisions are honored; nothing drifts beyond scope; prd format gaps (missing R/AC numbers or verification methods) are findings.
- Feasibility: verify anchors against the real code — files exist, symbols resolve, current-code anchors locate uniquely, the pseudocode fits the actual context, and verification commands run; never hunt for after-code — the plan must not contain it; read the actual files (LSP first where available) before claiming a fact.
- Quality: the planned approach complies with the referenced specs, reuses existing utilities, and weighs better alternatives.
Classify every finding: P0 = executing the plan as written must fail or violates acceptance; P1 = feasibility risk or a clearly better approach not adopted; P2 = imprecise wording or incomplete references.
Write the report to plan-review.md in the task directory (append a new section per round); every finding carries its severity, the plan anchor, and a fix suggestion. The plan, the prd, and all code files stay untouched by you.
${WRITE_SCOPE_DISCIPLINE}
${LSP_BASELINE_SENTENCE}
${BATCHING_DISCIPLINE}
${COMPACT_OUTPUT_DISCIPLINE}
${CONSULT_MATERIALS_ON_DEMAND_RULE}
${INJECTION_PROTOCOL_DISCIPLINE}`,
    [EXECUTOR_KINDS.frontend]: `Follow the PRD's '## UI Design' section as the baseline and deliver all seven UI axes it asks for.
${PRESCRIPTIVE_PLAN_DISCIPLINE}
Touch frontend files only; verify with the project's frontend checks (lint / typecheck / build / relevant tests).
When a backend interface is missing, use an annotated mock or placeholder and mark it for later wiring.
${LSP_BASELINE_SENTENCE}
${INJECTION_PROTOCOL_DISCIPLINE}`,
});
/** 纪律段子标题前缀（权威段内 Markdown H3）。 */
const HEADING_PREFIX = '### ';
/** 纪律段子标题后缀（如 `Check executor directives`）。 */
const DIRECTIVE_HEADING_SUFFIX = ' executor directives';
/**
 * kind 纪律段子标题（权威段内 `### <Kind> executor directives`），仅作可读性
 * 导航；去重不看该标题（kind 标题去重分支已删除，去重只看 leaf 关键词）。
 * @param kind executor 类型
 * @returns 子标题
 */
function kindDirectiveHeading(kind) {
    return `${HEADING_PREFIX}${kind.charAt(0).toUpperCase()}${kind.slice(1)}${DIRECTIVE_HEADING_SUFFIX}`;
}
/**
 * 渲染 kind 纪律段正文（交付时过滤）：目标环境无 LSP 工具（hasLsp === false）
 * 时剔除 LSP 基线句（主句与 research 只读变体），使纪律段不产生指向虚无的
 * LSP 指令；缺省（undefined）视为有 LSP，保持原输出（向后兼容）。
 * @param kind executor 类型
 * @param hasLsp 目标环境是否具备 LSP 工具面
 * @returns 纪律段正文
 */
function renderKindDiscipline(kind, hasLsp) {
    // kind 已由 assertKind 在组装入口校验，此处 ?? '' 仅防御索引类型边界。
    const body = EXECUTOR_CONTRACT_BY_KIND[kind] ?? '';
    if (hasLsp !== false)
        return body;
    return body
        .split(`${LSP_BASELINE_SENTENCE}\n`)
        .join('')
        .split(`${LSP_RESEARCH_BASELINE_SENTENCE}\n`)
        .join('');
}
/**
 * 组装终极权威段（注入文本末尾，所有 kind 一致生效）：`## Executor contract` 标题 +
 * kind 纪律段（`### <Kind> executor directives` 子标题 + 正文）+ 无用户通道纪律句 +
 * leaf 规则 + 权威声明；去重仅豁免 leaf 规则行（userPrompt 已含 leaf 关键词时
 * 不重复追加该行）——kind 纪律段与权威声明始终注入：即使主会话用户指令自带
 * 旧版契约/只读审查约束，权威兜底也不因去重分支丢失。
 * @param kind executor 类型
 * @param hasLsp 目标环境是否具备 LSP 工具面（undefined 视为有）
 * @param userPrompt 用户任务正文（leaf 关键词去重判定用）
 * @returns 契约节整段文本
 */
export function buildExecutorContractSection(kind, hasLsp, userPrompt) {
    const leafRule = userPrompt.includes(LEAF_RULE_KEYWORD) ? '' : `${LEAF_EXECUTOR_RULE}\n\n`;
    return (`${EXECUTOR_CONTRACT_HEADING}\n${kindDirectiveHeading(kind)}\n` +
        `${renderKindDiscipline(kind, hasLsp)}\n\n` +
        `${NO_USER_CHANNEL_DISCIPLINE}\n\n${leafRule}${AUTHORITY_DECLARATION}`);
}
//# sourceMappingURL=discipline-text.js.map