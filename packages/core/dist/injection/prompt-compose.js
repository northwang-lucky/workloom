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
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { insideWorkloom, WORKLOOM_DIR } from '../workspace/locate.js';
import { loadConfig } from "../workspace/config-load.js";
import { evaluateGuard, readTaskView } from "../task/state-machine.js";
import { CASE_FILES, CASE_PURPOSES } from "../task/case-structure.js";
// kind 值域与 jsonl 解析的单一实现外移（纯常量与共享解析层，任务层与注入层
// 共用）；相对导入带 .ts 后缀，构建期重写为 .js。
import { EXECUTOR_KINDS } from "../dispatch/executor-kinds.js";
import { jsonlPointerLines } from "../task/jsonl.js";
/** effort 合法档位（低 → 高）。 */
export const EFFORT_LEVELS = Object.freeze(['low', 'medium', 'high', 'xhigh', 'max']);
/** 错误消息前缀（运行时文案英文）。 */
const ERR_PREFIX = 'workloom executor context';
/** prd 文件名（唯一物化 artifact：check/research/review 内联全文节块，implement/frontend 软指针）。 */
const PRD_ARTIFACT = 'prd.md';
/** Pointer list 首部的 artifact 指针文件名（按顺序；文件缺失不出行）。 */
const ARTIFACT_POINTER_FILES = Object.freeze(['plan.md']);
/** jsonl 文件名（相对任务目录），按 executor kind 取。 */
/** @type {Record<string, string>} */
const JSONL_FILES = Object.freeze({
    [EXECUTOR_KINDS.implement]: 'implement.jsonl',
    [EXECUTOR_KINDS.check]: 'check.jsonl',
    // frontend 上下文同 implement：plan.md 指针 + implement.jsonl。
    [EXECUTOR_KINDS.frontend]: 'implement.jsonl',
    // review 审计划：与 implement 阶段消费同一批 spec（复用 implement.jsonl）。
    [EXECUTOR_KINDS.review]: 'implement.jsonl',
});
/** 文件块分隔模板：--- <path> ---（path 相对项目根）。 */
const BLOCK_SEPARATOR = '--- ';
/** 文件块分隔结尾。 */
const BLOCK_SEPARATOR_END = ' ---';
/** 任务正文节标题。 */
const TASK_PROMPT_HEADING = '## Task prompt';
/** 首行任务标注模板。 */
const ACTIVE_TASK_PREFIX = 'Active task: ';
/** 本机片段注入段标题（prd 软指针之后、Task prompt 之前插入）。 */
const LOCAL_DIRECTIVES_HEADING = '## Local directives';
/** worktree 纪律段标题（task.worktree_path 非空时注入，与 Local directives 同层级的独立段）。 */
const WORKTREE_HEADING = '## Worktree';
/** worktree 段绝对路径标签行前缀。 */
const WORKTREE_PATH_LABEL = 'Path: ';
/**
 * worktree 纪律要点（英文运行时文案，段内无占位）：代码面一律指向 worktree、任务
 * 元数据写主仓 .workloom、代码提交在 worktree 任务分支（design §1）。
 */
const WORKTREE_DISCIPLINE_LINES = Object.freeze([
    '- All code reads, writes, builds, and tests target this worktree: point bash at it via workdir or absolute paths.',
    '- Task metadata (.workloom content: jsonl, context, research, prd, etc.) is always written to the main repository .workloom; injected relative paths resolve against the main repository root.',
    '- Code commits happen in this worktree on the task branch.',
]);
/** 防重复判定关键词（userPrompt 已含时不再追加本机片段段）。 */
const LOCAL_DIRECTIVES_KEYWORD = 'Local directives';
/** research 产物目录名（相对任务目录）。 */
const RESEARCH_DIR = 'research';
/** research 材料注入段标题（Pointer list 之后、prd 软指针/Task prompt 之前）。 */
const RESEARCH_MATERIALS_HEADING = '## Research materials';
/** jsonl 指针清单段标题（Pointer list：artifacts 指针之后、research 之前；指针行极轻量无预算语义）。 */
const POINTER_LIST_HEADING = '## Pointer list';
/**
 * prd 软指针行（implement/frontend 专有，独立一行无标题）：仅在派发正文或计划
 * 有歧义时按需查阅 prd.md——刻意不进 `## Pointer list`，避免被强制加载语义
 * 变成必读；prd.md 缺失时不出该行。
 * @param {string} prdRelPath prd 相对项目根的路径
 * @returns {string} 软指针行
 */
function prdSoftPointerLine(prdRelPath) {
    return `If the task prompt or the plan is ambiguous, consult ${prdRelPath} before deciding.`;
}
/** prd 全文保留节（Requirements/Acceptance 两节全文；其余节只留标题指针）。 */
const PRD_FULL_SECTIONS = Object.freeze(['Requirements', 'Acceptance Criteria']);
/** H2 标题行判定正则（## 起头且非 ###/####）。 */
const H2_HEADING_RE = /^##\s+\S/;
/** H2 标题文字捕获正则（截取 ## 之后的标题文本）。 */
const H2_TITLE_RE = /^##\s+(.+)$/;
/**
 * 内置 LSP 主基线句子（产品内置，runtime 无关，不带条件；检测到 LSP 工具时由
 * 本机片段加强为硬指令）。统一软措辞（"When available"）确保无 LSP 插件环境
 * 不产生指向虚无的硬指令。场景语言点名五类 LSP 能力（结构大纲/签名、补全、
 * 改名、修复动作、diagnostics 验证），不指名 runtime 特有工具名。
 */
const INJECTION_MARKER_PREFIX = 'Injection marker: ';
/**
 * 生成唯一注入标记行（任务相对路径 + 时间戳 + 随机后缀）：同一任务两次派发的
 * token 必然不同（单次注入标记回声机制的判定依据）。返回整行（含前缀）。
 * @param {string} taskRelPath 任务目录相对 .workloom 的路径
 * @returns {string} 注入标记行
 */
function buildInjectionMarkerLine(taskRelPath) {
    const nonce = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
    return `${INJECTION_MARKER_PREFIX}${taskRelPath}:${nonce}`;
}
/**
 * 按 kind 的执行器纪律段正文（硬指令，单一来源，DSH/Pi 两 runtime 共享；
 * 与 adapter-pi 的 agent 角色总述互补不冲突）。
 * 并入注入文本末尾的终极权威段（`## Executor contract` 内 `### <Kind> executor
 * directives` 子段）；去重只看 leaf 关键词且仅豁免 leaf 规则行——纪律段与
 * 权威声明始终注入（kind 标题去重分支已删除）。
 * 键为 kind 字符串（运行时按 params.kind 索引，放宽为 Record<string, string>）。
 * @type {Record<string, string>}
 */
const TRUNCATED_PREFIX = '[...truncated at ';
/** 截断提示结尾。 */
const TRUNCATED_SUFFIX = ' bytes]';
/**
 * 校验 effort 档位；undefined 通过（未指定）。非法值抛 Error（英文文案）。
 * @param {string | undefined} effort effort 档位
 */
export function assertEffort(effort) {
    if (effort === undefined)
        return;
    if (typeof effort !== 'string' || !EFFORT_LEVELS.includes(effort)) {
        throw new Error(`${ERR_PREFIX}: invalid effort: ${String(effort)} (must be one of ${EFFORT_LEVELS.join('/')})`);
    }
}
/**
 * 校验 executor kind；undefined 通过（未指定）。非法值抛 Error（英文文案）。
 * @param {string | undefined} kind executor 类型
 */
export function assertKind(kind) {
    if (kind === undefined)
        return;
    if (typeof kind !== 'string' || !Object.values(EXECUTOR_KINDS).some((value) => value === kind)) {
        throw new Error(`${ERR_PREFIX}: invalid kind: ${String(kind)} (must be one of ${Object.values(EXECUTOR_KINDS).join('/')})`);
    }
}
export function buildExecutorPrompt(params) {
    try {
        return [null, buildInternal(params)];
    }
    catch (error) {
        return [toError(error), null];
    }
}
/**
 * 组装实现（内部，失败抛错由外层转元组）。
 * @param {import('./executor-context.d.ts').BuildExecutorPromptParams} params
 * @returns {import('./executor-context.d.ts').ExecutorPromptResult}
 */
function buildInternal(params) {
    assertKind(params.kind);
    requireStringField(params, 'root');
    requireStringField(params, 'taskRelPath');
    requireStringField(params, 'userPrompt');
    const config = loadConfig(params.root);
    const ci = config.contextInjection;
    /** @type {import('./executor-context.d.ts').ExecutorPromptStats} */
    const stats = {
        filesInlined: 0,
        filesPointed: 0,
        truncated: 0,
    };
    // 首行任务标注 + 注入标记（单次注入标记回声机制）：每次派发生成唯一 marker
    // token 随注入文本首行注入，纪律句要求执行器在报告首行回显，证明注入到达且
    // 分层加载协议被读。
    const parts = [
        `${ACTIVE_TASK_PREFIX}${params.taskRelPath}\n${buildInjectionMarkerLine(params.taskRelPath)}`,
    ];
    const taskDir = insideWorkloom(params.root, params.taskRelPath);
    // check/research/review 物化 prd 全文节块（验收基线/问题框架/审查对象，职责必需）；
    // implement/frontend 不物化 prd（下方软指针行代替，正文按需查阅）。
    if (params.kind === EXECUTOR_KINDS.check ||
        params.kind === EXECUTOR_KINDS.research ||
        params.kind === EXECUTOR_KINDS.review) {
        inlinePrdArtifact(parts, params.taskRelPath, taskDir, ci, stats);
    }
    // CASE 全文与模板（仅 check）：CASE 紧跟 prd（验收基线之后、指针之前），模板在
    // Pointer list 之前；execution 轮先校验确认状态，超预算直接抛错不静默截断。
    inlineCurrentCase(parts, params, taskDir, ci, stats);
    inlineCaseTemplates(parts, params, stats);
    // Pointer list（research 无此段）：首行固定 plan.md 纯指针行（文件缺失
    // 不出行），后接当前 kind 的 jsonl 条目指针行；文件不存在不指向空。
    if (params.kind !== EXECUTOR_KINDS.research) {
        const pointerLines = ARTIFACT_POINTER_FILES.filter((name) => existsSync(join(taskDir, name))).map((name) => pointerLine(join(WORKLOOM_DIR, params.taskRelPath, name)));
        stats.filesPointed += pointerLines.length;
        const jsonlName = JSONL_FILES[params.kind];
        if (typeof jsonlName === 'string') {
            pointerLines.push(...jsonlPointerLines({ root: params.root, taskDir, jsonlName, stats }));
        }
        if (pointerLines.length > 0) {
            parts.push(`${POINTER_LIST_HEADING}\n${pointerLines.join('\n')}`);
        }
    }
    // research 产物指针注入（自动行为，不由主会话控制）：指针行给路径，正文由
    // 执行器按分层协议在步骤需要时读；无 research 产物时为空段，不报错。
    inlineResearchMaterials(parts, params.taskRelPath, taskDir, stats);
    // prd 软指针行（implement/frontend 专有，独立一行无标题）：有歧义时按需查阅，
    // 不进 Pointer list（避免被强制加载语义变成必读）；prd 缺失不出行。
    if ((params.kind === EXECUTOR_KINDS.implement || params.kind === EXECUTOR_KINDS.frontend) &&
        existsSync(join(taskDir, PRD_ARTIFACT))) {
        parts.push(prdSoftPointerLine(join(WORKLOOM_DIR, params.taskRelPath, PRD_ARTIFACT)));
        stats.filesPointed += 1;
    }
    // worktree 纪律段（design §1）：task.worktree_path 非空时注入（prd 软指针/artifact
    // 块之后、Local directives/Task prompt 之前）；readTask 失败或路径为空静默降级
    // 不注入（prompt 产物零变化）。段为常量文本，不计 filesInlined/filesPointed。
    const worktreeSection = buildWorktreeSection(params.root, params.taskRelPath);
    if (worktreeSection !== null) {
        parts.push(worktreeSection);
    }
    // 本机片段段（adapter 探测后传入的合成文本，core 不做 IO）：prd 软指针之后、
    // Task prompt 之前、终极权威段之前（内容段收尾吃近因效应，正文在最后）；
    // userPrompt 已含标题时不重复注入（与权威段同规则）；空串/未传不插入
    // （Pi 不传参 = 不注入，向后兼容）。
    const localDirectives = params.localDirectives;
    if (localDirectives !== undefined &&
        localDirectives !== '' &&
        !params.userPrompt.includes(LOCAL_DIRECTIVES_KEYWORD)) {
        parts.push(`${LOCAL_DIRECTIVES_HEADING}\n${localDirectives}`);
    }
    if (params.userPrompt !== '') {
        parts.push(`${TASK_PROMPT_HEADING}\n${params.userPrompt}`);
    }
    // 契约节（注入文本末尾）：runtime 纪律文本由调用方组装后经 contractSection
    // 注入（dsh 从 discipline-text 组装；core 组装机制 runtime 无关，不携带话语）；
    // 未传 = 不注入（增量续接路径）。
    if (params.contractSection !== undefined && params.contractSection !== '') {
        parts.push(params.contractSection);
    }
    return { text: parts.join('\n\n'), stats };
}
/**
 * 普通增量续用文本：只追加本轮执行指令；execution 轮先校验执行前置
 * （CASE 文档缺失/设计会话缺失直接抛错，拒绝发送增量）；非 check kind
 * 原文返回，不做 CASE 校验。
 * @param {import('./executor-context.d.ts').BuildExecutorPromptParams} params 增量参数
 * @returns {string} 发送给原会话的增量指令
 */
export function buildExecutorIncrementalPrompt(params) {
    const [taskErr, task] = readTaskView(params.root, params.taskRelPath);
    if (taskErr !== null || task === null)
        throw taskErr ?? new Error('executor task not found');
    if (params.kind !== EXECUTOR_KINDS.check)
        return params.userPrompt;
    const purpose = params.purpose ?? CASE_PURPOSES.EXECUTION;
    if (purpose === CASE_PURPOSES.EXECUTION) {
        assertCheckDispatchGuards(params.root, params.taskRelPath, task);
    }
    return params.userPrompt;
}
/**
 * check 派发入口的状态机守卫查询（execution 轮专用）：case-execution-ready
 * （CASE 文档与设计会话链可用，拒绝文案保持 CASE execution rejected 前缀）与
 * ui-dispatch-ready（涉及前端展示的任务须先有 frontend 派发；本任务不接
 * executor，查询点即本派发入口，子任务四按角色重接）。
 * @param root 项目根
 * @param taskRelPath 任务目录相对 .workloom 的路径
 * @param task 任务视图
 */
function assertCheckDispatchGuards(root, taskRelPath, task) {
    const ctx = { root, taskRelPath };
    const [caseErr, caseReason] = evaluateGuard('case-execution-ready', task, ctx);
    if (caseErr !== null) {
        throw new Error(`CASE execution rejected: ${caseReason ?? caseErr.message}`);
    }
    const [uiErr, uiReason] = evaluateGuard('ui-dispatch-ready', task, ctx);
    if (uiErr !== null) {
        throw new Error(`check dispatch rejected: ${uiReason ?? uiErr.message}`);
    }
}
/**
 * 内联当前 CASE 全文（内部，仅 check）：紧跟 prd 块。execution 轮先校验执行
 * 前置（CASE 文档缺失/设计会话缺失抛错，拒绝启动 child）；文件缺失静默跳过
 * （case-design 首轮尚未写 case.md）；超预算直接抛错——CASE 是验收基线，
 * 不允许静默截断。
 * @param {string[]} parts prompt 段落列表
 * @param {import('./executor-context.d.ts').BuildExecutorPromptParams} params 注入参数
 * @param {string} taskDir 任务目录绝对路径
 * @param {import('../workspace/config.d.ts').WorkloomConfig['contextInjection']} ci 注入预算
 * @param {import('./executor-context.d.ts').ExecutorPromptStats} stats 注入统计
 */
function inlineCurrentCase(parts, params, taskDir, ci, stats) {
    if (params.kind !== EXECUTOR_KINDS.check)
        return;
    const [taskErr, task] = readTaskView(params.root, params.taskRelPath);
    // 任务记录缺失/损坏静默降级（与 worktree 段同口径：prompt 组装对坏记录宽容，
    // S2 零 diff 用例钉死该不变量）；记录可读时 execution 轮才做执行前置校验（fail loud）。
    if (taskErr !== null || task === null)
        return;
    const purpose = params.purpose ?? CASE_PURPOSES.EXECUTION;
    if (purpose === CASE_PURPOSES.EXECUTION) {
        assertCheckDispatchGuards(params.root, params.taskRelPath, task);
    }
    const path = join(taskDir, CASE_FILES.document);
    const text = readTaskFile(path);
    if (text === null)
        return;
    const bytes = byteLength(text);
    if (ci.maxArtifactBytes > 0 && bytes > ci.maxArtifactBytes) {
        throw new Error(`case.md is ${bytes} bytes, exceeding maxArtifactBytes=${ci.maxArtifactBytes}; reduce the CASE or raise the project budget`);
    }
    const relPath = join(WORKLOOM_DIR, params.taskRelPath, CASE_FILES.document);
    parts.push(`${BLOCK_SEPARATOR}${relPath}${BLOCK_SEPARATOR_END}\n${text}`);
    stats.filesInlined += 1;
}
/**
 * 内联 CASE 模板（内部，仅 check）：adapter 从 assets 读取两份模板正文传入
 * （core 不 import assets），按传入顺序紧随 CASE 块、Pointer list 之前。
 * @param {string[]} parts prompt 段落列表
 * @param {import('./executor-context.d.ts').BuildExecutorPromptParams} params 注入参数
 * @param {import('./executor-context.d.ts').ExecutorPromptStats} stats 注入统计
 */
function inlineCaseTemplates(parts, params, stats) {
    if (params.kind !== EXECUTOR_KINDS.check)
        return;
    for (const artifact of params.caseTemplates ?? []) {
        parts.push(`${BLOCK_SEPARATOR}${artifact.path}${BLOCK_SEPARATOR_END}\n${artifact.content}`);
        stats.filesInlined += 1;
    }
}
/**
 * 组装 `## Worktree` 纪律段（内部）：task.worktree_path 非空时产出（绝对路径 +
 * Branch 行 + 纪律要点）；readTask 失败或路径为空时返回 null 静默降级（prompt
 * 组装对缺失/损坏任务记录本就宽容，产物与现状零变化，AC1）。branch/base 空串
 * 降级省略对应行/括注段。
 * @param {string} root 项目根
 * @param {string} taskRelPath 任务目录相对 .workloom 的路径
 * @returns {string | null} 段文本（不注入为 null）
 */
function buildWorktreeSection(root, taskRelPath) {
    const [taskErr, task] = readTaskView(root, taskRelPath);
    if (taskErr || task === null)
        return null;
    const worktreePath = task.worktree_path;
    if (typeof worktreePath !== 'string' || worktreePath === '')
        return null;
    const lines = [WORKTREE_HEADING, `${WORKTREE_PATH_LABEL}${resolve(root, worktreePath)}`];
    const branch = typeof task.branch === 'string' ? task.branch : '';
    const baseBranch = typeof task.base_branch === 'string' ? task.base_branch : '';
    if (branch !== '') {
        lines.push(baseBranch === '' ? `Branch: ${branch}` : `Branch: ${branch} (base ${baseBranch})`);
    }
    lines.push(...WORKTREE_DISCIPLINE_LINES);
    return lines.join('\n');
}
/**
 * 内联 prd.md 全文节块（check/research/review 共用；验收基线/偏差判定/审查对象，职责必需）：
 * 按节提取注入，文件缺失跳过；块文本写入 parts；返回实际写入的字节数（缺失为 0）。
 * Requirements/Acceptance 两节全文保留，其余节只留标题指针；按 maxArtifactBytes
 * 截断（预算兜底）。
 * @param {string[]} parts prompt 段落列表（块文本追加于此）
 * @param {string} taskRelPath 任务目录相对 .workloom 的路径
 * @param {string} taskDir 任务目录绝对路径
 * @param {import('../workspace/config.d.ts').WorkloomConfig['contextInjection']} ci 注入预算
 * @param {import('./executor-context.d.ts').ExecutorPromptStats} stats 统计
 * @returns {number} 注入字节数（写入调用方累计预算）
 */
function inlinePrdArtifact(parts, taskRelPath, taskDir, ci, stats) {
    const text = readTaskFile(join(taskDir, PRD_ARTIFACT));
    if (text === null)
        return 0;
    const relPath = join(WORKLOOM_DIR, taskRelPath, PRD_ARTIFACT);
    const content = extractPrdContent(text);
    const limited = limitByBytes(content, ci.maxArtifactBytes);
    parts.push(`${BLOCK_SEPARATOR}${relPath}${BLOCK_SEPARATOR_END}\n${limited.text}`);
    if (limited.truncated)
        stats.truncated += 1;
    stats.filesInlined += 1;
    return byteLength(limited.text);
}
/**
 * prd 提取：Requirements/Acceptance 两节全文保留，其余 H2 节只留标题指针。
 * 无 Requirements/Acceptance 节时整体只给文件指针（不猜节、无启发式）。
 * @param {string} text prd 全文
 * @returns {string} 注入正文
 */
function extractPrdContent(text) {
    const kept = [];
    const others = [];
    for (const section of splitH2Sections(text)) {
        if (PRD_FULL_SECTIONS.includes(section.heading)) {
            kept.push(`## ${section.heading}\n${section.body.trim()}`);
        }
        else {
            others.push(`## ${section.heading}`);
        }
    }
    const parts = [];
    if (kept.length > 0)
        parts.push(kept.join('\n\n'));
    if (others.length > 0)
        parts.push(`Read in file: ${others.join(', ')}`);
    if (parts.length === 0) {
        parts.push('Read the full document in the file (no Requirements or Acceptance Criteria sections).');
    }
    return parts.join('\n\n');
}
/**
 * 按 H2 节切分 markdown 文本：返回 [{heading, body}]，body 不含标题行；
 * H2 之前（H1 标题等）的内容不属于任何节，跳过。
 * @param {string} text markdown 全文
 * @returns {{heading: string, body: string}[]}
 */
function splitH2Sections(text) {
    const sections = [];
    let current = null;
    for (const line of text.split('\n')) {
        if (H2_HEADING_RE.test(line)) {
            const title = H2_TITLE_RE.exec(line)?.[1]?.trim() ?? '';
            current = { heading: title, bodyLines: [] };
            sections.push(current);
            continue;
        }
        if (current !== null)
            current.bodyLines.push(line);
    }
    return sections.map((section) => ({
        heading: section.heading,
        body: section.bodyLines.join('\n'),
    }));
}
/**
 * 拼装指针行：`- <file>` 或 `- <file> (<reason>)`（reason 缺失省略括号；逐行
 * 「read before acting」后缀已删，逐行 mandate 由分层加载协议句统一取代）。
 * @param {string} file 条目路径
 * @param {string | undefined} [reason] 引用理由
 * @returns {string} 指针行
 */
function pointerLine(file, reason) {
    const reasonPart = reason === undefined ? '' : ` (${reason})`;
    return `- ${file}${reasonPart}`;
}
/**
 * 内联任务 research/*.md 指针（切片 ②，自动行为，不由主会话控制）：
 * 按文件名排序逐文件给路径指针行，不内联正文（与 jsonl ① 同口径）；无 research
 * 目录或无 .md 产物时为空段，不影响注入链与统计（缺省 0）。
 * @param {string[]} parts prompt 段落列表（块文本追加于此）
 * @param {string} taskRelPath 任务目录相对 .workloom 的路径
 * @param {string} taskDir 任务目录绝对路径
 * @param {import('./executor-context.d.ts').ExecutorPromptStats} stats 统计
 */
function inlineResearchMaterials(parts, taskRelPath, taskDir, stats) {
    const names = listResearchMarkdownNames(taskDir);
    if (names.length === 0)
        return;
    const lines = [];
    for (const name of names) {
        const absPath = join(taskDir, RESEARCH_DIR, name);
        if (!existsSync(absPath))
            continue; // 产物缺失跳过
        const relPath = join(WORKLOOM_DIR, taskRelPath, RESEARCH_DIR, name);
        lines.push(pointerLine(relPath));
        stats.filesPointed += 1;
    }
    if (lines.length > 0) {
        parts.push(`${RESEARCH_MATERIALS_HEADING}\n${lines.join('\n')}`);
    }
}
/**
 * 列出任务 research 目录下 *.md 文件名（字典序）；目录缺失/形态不符按空处理。
 * @param {string} taskDir 任务目录绝对路径
 * @returns {string[]}
 */
function listResearchMarkdownNames(taskDir) {
    let entries;
    try {
        entries = readdirSync(join(taskDir, RESEARCH_DIR));
    }
    catch (error) {
        if (isMissingLike(error))
            return [];
        throw error;
    }
    return entries.filter((name) => name.endsWith('.md')).sort();
}
/**
 * 按字节上限截断文本；超限时截断内容后追加截断提示，返回截断标记。
 * maxBytes 为 0 表示不限制。
 * @param {string} text 原始文本
 * @param {number} maxBytes 字节上限
 * @returns {{text: string, truncated: boolean}}
 */
function limitByBytes(text, maxBytes) {
    if (maxBytes === 0 || byteLength(text) <= maxBytes) {
        return { text, truncated: false };
    }
    return {
        text: `${truncateUtf8(text, maxBytes)}\n${TRUNCATED_PREFIX}${maxBytes}${TRUNCATED_SUFFIX}`,
        truncated: true,
    };
}
/**
 * UTF-8 安全截断：不切断多字节字符（避免 U+FFFD 乱码）。
 * @param {string} text 原始文本
 * @param {number} maxBytes 字节上限
 * @returns {string}
 */
function truncateUtf8(text, maxBytes) {
    let sliced = Buffer.from(text, 'utf8').subarray(0, maxBytes);
    while (sliced.length > 0 && sliced.toString('utf8').endsWith('\uFFFD')) {
        sliced = sliced.subarray(0, sliced.length - 1);
    }
    return sliced.toString('utf8');
}
/** @param {string} text @returns {number} UTF-8 字节数 */
function byteLength(text) {
    return Buffer.byteLength(text, 'utf8');
}
/**
 * 读取任务目录内文件（缺失返回 null，其他错误透传）。
 * @param {string} absPath 绝对路径
 * @returns {string | null}
 */
function readTaskFile(absPath) {
    try {
        return readFileSync(absPath, 'utf8');
    }
    catch (error) {
        if (isEnoent(error))
            return null;
        throw error;
    }
}
/** 校验 params 的字符串字段（内部）。
 * @param {object} params 入参对象
 * @param {string} field 字段名
 */
function requireStringField(params, field) {
    const value = /** @type {Record<string, unknown>} */ (params)[field];
    if (typeof value !== 'string') {
        throw new Error(`${ERR_PREFIX}: ${field} must be a string (got ${typeof value})`);
    }
}
/** @param {unknown} value @returns {Error} */
function toError(value) {
    return value instanceof Error ? value : new Error(String(value));
}
/** 判断异常是否为文件不存在（内部）。 */
function isEnoent(error) {
    return error?.code === 'ENOENT';
}
/**
 * 缺失或形态不符（目录不存在/父级是文件）均按“无”处理。
 * @param {unknown} error 捕获的异常
 * @returns {boolean}
 */
function isMissingLike(error) {
    const code = error.code;
    return code === 'ENOENT' || code === 'ENOTDIR';
}
//# sourceMappingURL=prompt-compose.js.map