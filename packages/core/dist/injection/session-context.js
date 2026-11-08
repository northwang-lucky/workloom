/**
 * session-context：为 systemPrompt 的 context 注入组装会话上下文快照（新增抽象，TypeScript）。
 *
 * 设计意图：
 * - DSH 的 systemPrompt.context 是「取代式快照」：每次提示词组装渲染一份上下文快照，
 *   新快照取代旧快照，适合承载每轮更新的会话状态，不会随轮次膨胀；
 * - always-on 行为规范（norms）随快照每轮重新组装：契约升级后下一轮即生效，
 *   不依赖模型自觉或新开会话；
 * - 内容全部英文，整块包裹在 <workloom-session-context> 标记内，便于模型识别边界；
 * - 数据读取采取「可降级」策略：git 读取失败降级为占位值，任务解析失败显式
 *   返回 err（结构性故障不静默）；全部同步 I/O，供同步 text provider 直接调用；
 * - root 约定为项目根（由 adapter 传 findWorkloomRoot 的结果），内部只拼路径不再向上查找。
 */
import { join } from 'node:path';
import { countDirtyLines, gitCurrentBranchSync, gitStatusSync } from "../workspace/git-query.js";
import { EXECUTOR_ROLES, tryNormalizeExecutorRole } from "../dispatch/executor-roles.js";
import { resolveSubagentDefaults } from "../workspace/config-subagent.js";
import { listTasks, TaskStatus } from "../task/storage/index.js";
import { MODES, toTaskView } from "../task/state/index.js";
import { loadConfig } from "../workspace/config-load.js";
import { collectSpecIndexes } from './spec-index.js';
/** 错误消息前缀（运行时文案英文）。 */
const ERR_PREFIX = 'workloom session context';
/** 注入块开/闭标记（包住整份快照）。 */
const BLOCK_OPEN = '<workloom-session-context>';
const BLOCK_CLOSE = '</workloom-session-context>';
/** 未知占位值（git 分支读取失败时使用）。 */
const UNKNOWN_VALUE = 'unknown';
/** 无活跃任务行（整行固定文案）。 */
const NO_ACTIVE_TASK_LINE = 'No active task.';
/** 候选任务节标签行（无活跃任务且 depth=0 时输出，指引会话接续既有任务）。 */
const CANDIDATE_LABEL = 'Candidate tasks (in_progress first; workloom_task_list for all):';
/** 候选任务条目缩进。 */
const CANDIDATE_INDENT = '  ';
/** 候选任务节条目上限（注入预算；超出截断并输出提示行）。 */
const CANDIDATE_TASK_LIMIT = 8;
/** 候选状态排序权重：接续优先 in_progress，其次 completed 待收尾，planning 待推进。 */
const CANDIDATE_STATUS_RANK = new Map([
    [TaskStatus.IN_PROGRESS, 0],
    [TaskStatus.COMPLETED, 1],
    [TaskStatus.PLANNING, 2],
]);
/** Last dispatch 行前缀（派发记录展示，无记录不输出）。 */
const LAST_DISPATCH_PREFIX = 'Last dispatch: ';
/** 各行的固定标签前缀。 */
const LINE_LABELS = Object.freeze({
    activeTask: 'Active task: "',
    git: 'Git: branch ',
    worktree: 'Worktree: ',
    workflow: 'Workflow: ',
});
/** git 行脏文件数后缀。 */
const DIRTY_SUFFIX = ' dirty file(s).';
/** 工作流概览步骤间的分隔符。 */
const STEP_SEPARATOR = ' | ';
/** guidelines 段标签行（固定文案，行为规格 §4.1）。 */
const GUIDELINES_LABEL = 'Guidelines (spec index — read files as needed):';
/** norms 段标签行（固定文案）。 */
const NORMS_LABEL = 'Always-on norms:';
/** 本机片段小节标签行（depth=0 时 norms 之后追加；depth>0 由 executor 首条 prompt 注入一次）。 */
const LOCAL_DIRECTIVES_LABEL = 'Local directives:';
/**
 * executor 版 norms（delegationDepth>0 时整体替换契约 norms，核心静态常量）。
 * 叶子执行器实施纪律：零派发语义（不含 dispatch 字样），措辞与现有 norms 风格一致。
 */
const EXECUTOR_NORMS = [
    'Executor (always-on):',
    '- You are a leaf executor: implement the task directly, never delegate to other agents.',
    '- Do not call workloom orchestration tools (workloom_execute, workloom_step, workloom_task_*) or any subagent-spawning tools.',
    '- Implement strictly per the task artifacts (prd/plan) and the files referenced by the task jsonl.',
    '- Follow test-first discipline: write the failing test, then the minimal implementation, then run it green.',
    '- Verify your work (lint, typecheck, tests, build) before reporting; never commit or push.',
    '- Report concisely: changed files, red-green evidence, and remaining risks.',
].join('\n');
/** guidelines 条目缩进。 */
const GUIDELINES_INDENT = '  ';
/** guidelines 截断提示（行为规格 §4.2）。 */
const TRUNCATED_NOTICE = 'more index files; raise context_injection or trim spec/';
/**
 * 组装当前会话的上下文快照文本（同步）。
 * @param params 入参
 * @returns [err, text]：err 为任务解析等结构性故障；成功时 text 为整块快照
 */
export function assembleSessionContext(params) {
    try {
        return [null, assembleInternal(params)];
    }
    catch (error) {
        return [toError(error), null];
    }
}
/**
 * 组装实现（内部）：depth=0 按 Active task / 候选任务（无活跃任务时）/
 * Last dispatch / Git / Worktree / 工作流顺序拼行，结尾按需追加 norms 小节
 * （always-on 规范原文）；depth>0（executor 等叶子子代理）按白名单只拼
 * Active task / guidelines / executor norms——Last dispatch / Git /
 * 工作流概览对执行器无价值，裁剪省注入体积。整体包进块标记。配置一次读取供
 * guidelines 节消费，配置解析失败时该节整节降级，不拖垮快照。
 * @param params 入参
 * @returns 快照文本
 */
function assembleInternal(params) {
    // 配置单点：adapter 已注入时直接消费（含显式 null = 加载失败降级），
    // 缺省时内部尽力加载（直连调用方兼容）。
    const config = params.config !== undefined ? params.config : loadConfigSafely(params.root);
    const depth = params.delegationDepth ?? 0;
    // 活跃任务只走单一解析链（调用方回合缓存的 resolveTurnTask 产物）；
    // 缺省/null 视同无活跃任务，本入口不再自解析指针（回退直读通道已退役）。
    const active = params.turnTask != null
        ? activeTaskContextFromRecord(params.turnTask)
        : { line: NO_ACTIVE_TASK_LINE, task: null };
    const lines = [];
    lines.push(active.line);
    if (depth === 0) {
        lines.push(...candidateTaskLines(params.root, active.task), ...lastDispatchLines(active.task), 
        // 执行器画像节：Last dispatch 行后、Git 节前（历史形态实际线序）。
        ...executorProfilesLines(config, params.mainModel), gitLine(params.root), ...worktreeLines(params.root, active.task));
        if (params.workflowSteps.length > 0) {
            const overview = params.workflowSteps
                .map((step) => `${step.id} ${step.title}`)
                .join(STEP_SEPARATOR);
            lines.push(`${LINE_LABELS.workflow}${overview}`);
        }
    }
    lines.push(...guidelinesLines(params.root, config));
    // 深度>0（executor 等叶子子代理）：norms 段整体替换为 executor 版（无视契约 norms，
    // 保证纪律注入不依赖契约内容）；深度=0 保持现状（契约 norms 原文，缺失不输出）。
    if (depth > 0) {
        lines.push(NORMS_LABEL, EXECUTOR_NORMS);
    }
    else if (hasNorms(params.norms)) {
        lines.push(NORMS_LABEL, params.norms);
    }
    // 本机片段小节（主 agent 专用）：depth=0 且文本非空时追加在 norms 段之后；
    // depth>0 忽略——executor 的片段由 buildExecutorPrompt 首条 prompt 注入一次，
    // 避免 all.md 在主会话与子代理两端重复注入。
    if (depth === 0 && hasText(params.localDirectives)) {
        lines.push(LOCAL_DIRECTIVES_LABEL, params.localDirectives);
    }
    return `${BLOCK_OPEN}\n${lines.join('\n')}\n${BLOCK_CLOSE}`;
}
/**
 * 尽力加载配置（内部）：配置解析失败返回 null（配置错误不 fail loud——guidelines
 * 节整节降级，保持既有降级策略，不拖垮整份快照）。
 * @param root 项目根
 * @returns 配置对象或 null
 */
function loadConfigSafely(root) {
    try {
        return loadConfig(root);
    }
    catch {
        return null;
    }
}
/** norms 是否非空（null/undefined/空白视为无 norms，快照结构不变）。 */
function hasNorms(norms) {
    return norms !== null && norms !== undefined && norms.trim() !== '';
}
/** 注入文本是否非空（null/undefined/空白视为无注入，快照结构不变）。 */
function hasText(text) {
    return text !== null && text !== undefined && text.trim() !== '';
}
/**
 * 组装 guidelines 段：收集 spec 索引并逐行缩进；无 spec 返回空（段不输出）。
 * config 解析失败时整段降级为空（与 git 降级同策，不拖垮整份快照）；
 * spec 目录读取失败仍抛错上行（fail loud，行为规格 §3.6）。
 * @param root 项目根
 * @param config 配置对象（assembleInternal 已加载；解析失败为 null）
 * @returns 段行列表（可能为空）
 */
function guidelinesLines(root, config) {
    if (config === null)
        return [];
    const [specErr, spec] = collectSpecIndexes(root, config);
    if (specErr)
        throw specErr;
    if (spec === null || spec.indexes.length === 0)
        return [];
    const lines = [GUIDELINES_LABEL, ...spec.indexes.map((rel) => `${GUIDELINES_INDENT}${rel}`)];
    if (spec.truncated > 0) {
        lines.push(`${GUIDELINES_INDENT}(… ${spec.truncated} ${TRUNCATED_NOTICE})`);
    }
    return lines;
}
/**
 * 从已解析的任务记录组装活跃任务行（单一解析链下游；零额外读盘）。
 * @param task 活跃任务记录
 * @returns 活跃任务行与任务记录
 */
function activeTaskContextFromRecord(task) {
    // 数据布局被破坏（缺 title/status）属结构性故障：显式抛错而非渲染 undefined。
    if (typeof task.title !== 'string' || typeof task.status !== 'string') {
        throw new Error(`${ERR_PREFIX}: task record missing title or status: ${task.taskRelPath}`);
    }
    // 兼容读单点：模式/阶段/轨道值经 toTaskView 映射（full→standard 等），未映射值抛错。
    const view = toTaskView(task, task.taskRelPath);
    // 旧任务迁移提示：本功能前开始的非轻量任务（case=null）指路 workloom-case-active。
    const legacyCase = view.status === 'in_progress' && view.mode !== MODES.LIGHT && view.case === null
        ? ' CASE migration: use workloom-case-active to design and confirm case.md before the final check.'
        : '';
    return {
        // 快照展示当前自治度（autonomy 三值；确认迁移行为的会话可见面）。
        line: `${LINE_LABELS.activeTask}${task.title}" (${view.status}, autonomy: ${view.autonomy}) at ${task.taskRelPath}.${legacyCase}`,
        task,
    };
}
/**
 * 组装候选任务节（内部）：无活跃任务时列出项目内既有任务，按接续优先级排序
 * （in_progress > completed > planning，组内保持 listTasks 的目录遍历序，目录名
 * 带日期前缀即创建序），让新会话开局就能定位可接续的工作；有活跃任务、listTasks
 * 失败或无可渲染任务时输出空列表。信息节整体降级（与 git 降级同策），
 * 不拖垮快照。
 * @param root 项目根
 * @param task 活跃任务记录（无任务为 null）
 * @returns 节行列表（空数组 = 不输出）
 */
function candidateTaskLines(root, task) {
    if (task !== null)
        return [];
    const [listErr, summaries] = listTasks(root);
    if (listErr || summaries === null)
        return [];
    const renderable = summaries.filter(isRenderableSummary);
    if (renderable.length === 0)
        return [];
    // sort 稳定排序：同状态内保持目录遍历序（filter 已产出新数组，原地排序安全）。
    const ordered = renderable.sort((a, b) => candidateRank(a.status) - candidateRank(b.status));
    const shown = ordered.slice(0, CANDIDATE_TASK_LIMIT);
    const lines = [
        CANDIDATE_LABEL,
        ...shown.map((summary) => `${CANDIDATE_INDENT}- "${summary.title}" (${summary.status}) at ${summary.taskRelPath}`),
    ];
    const rest = ordered.length - shown.length;
    if (rest > 0) {
        lines.push(`${CANDIDATE_INDENT}(… ${rest} more; run workloom_task_list)`);
    }
    return lines;
}
/**
 * 摘要是否可渲染（内部）：防御手改 task.json 导致字段缺失（与活跃任务行的字段
 * 校验同策）；不可渲染的条目跳过，不阻塞整节。
 * @param summary 任务摘要
 * @returns 是否可渲染
 */
function isRenderableSummary(summary) {
    return (typeof summary.title === 'string' &&
        summary.title !== '' &&
        typeof summary.status === 'string' &&
        typeof summary.taskRelPath === 'string' &&
        summary.taskRelPath !== '');
}
/**
 * 状态排序权重（内部）：未知状态排最后（防御手改记录），保证排序比较不产出 NaN。
 * @param status 任务状态
 * @returns 排序权重
 */
function candidateRank(status) {
    return CANDIDATE_STATUS_RANK.get(status) ?? Number.MAX_SAFE_INTEGER;
}
/**
 * 组装 Last dispatch 行（内部）：活跃任务 dispatches 非空时取最新一条（append-only，
 * 末位即最新）展示角色（经兼容读归一，历史旧值显示为新角色）/status/时间
 * （task.json 存储的 ISO 原文，确定性）/childId/错误；无任务、无记录、记录缺
 * kind/status 或 kind 为畸形值时输出空（不输出该行，防御分支保留）。
 * @param task 活跃任务记录（无任务为 null）
 * @returns 派发行列表（空数组 = 不输出）
 */
function lastDispatchLines(task) {
    if (task === null)
        return [];
    const dispatches = task.dispatches;
    if (dispatches.length === 0)
        return [];
    const latest = dispatches[dispatches.length - 1];
    if (latest === undefined)
        return [];
    if (typeof latest.kind !== 'string' || latest.kind === '')
        return [];
    if (typeof latest.status !== 'string' || latest.status.trim() === '')
        return [];
    // 显示前经兼容读归一（非抛错变体）：新旧值域均显示为新角色，畸形值防御跳过。
    const role = tryNormalizeExecutorRole(latest.kind);
    if (role === null)
        return [];
    let line = `${LAST_DISPATCH_PREFIX}${role} ${latest.status} at ${latest.at}`;
    if (typeof latest.childId === 'string' && latest.childId !== '') {
        line += ` (child ${latest.childId})`;
    }
    // 无 error 不接破折号段（completed 常态）。
    if (typeof latest.error === 'string' && latest.error !== '') {
        line += ` — ${latest.error}`;
    }
    return [line];
}
/** 画像节标题前缀（节头文案逐字沿历史实现）。 */
const PROFILES_HEADER_PREFIX = 'Executor profiles (';
/** 画像行缩进（与 guidelines 条目同宽）。 */
const PROFILES_ROW_INDENT = '  ';
/** 未配置角色行的固定文案（继承父会话模型语义；逐字沿历史实现）。 */
const PROFILES_NOT_CONFIGURED_TEXT = 'not configured (inherits parent session model)';
/**
 * 组装执行器画像节（内部）：首行节头 + 五角色各一行（顺序 = EXECUTOR_ROLES
 * 定义序）。每角色经 resolveSubagentDefaults 取生效 model/effort 与来源：
 * 有配置行输出 model 与 effort 及来源标注（whenMain=<匹配值> 或 fallback），
 * 无配置行输出 not configured（inherits parent session model）。
 * 节头文案逐字沿历史实现：mainModel 在位时 `Executor profiles (main model
 * <mainModel>):`，缺失时 `Executor profiles (main model unknown; whenMain
 * entries skipped):`。config 为 null（加载失败）时整节降级不渲染（会话上下文
 * 不因配置错误中断，WARNING 归加载侧）。
 * @param config 配置对象（加载失败为 null）
 * @param mainModel 主会话模型（缺省/null/空白 = 未知）
 * @returns 画像节行列表（空数组 = 不渲染）
 */
function executorProfilesLines(config, mainModel) {
    if (config === null)
        return [];
    const normalizedMain = typeof mainModel === 'string' && mainModel.trim() !== '' ? mainModel.trim() : null;
    const header = normalizedMain === null
        ? `${PROFILES_HEADER_PREFIX}main model unknown; whenMain entries skipped):`
        : `${PROFILES_HEADER_PREFIX}main model ${normalizedMain}):`;
    const lines = [header];
    for (const role of Object.values(EXECUTOR_ROLES)) {
        // overrides 恒为空对象：画像只展示配置层生效结果，不含工具调用参数覆盖。
        const resolved = resolveSubagentDefaults(config, role, {}, normalizedMain ?? undefined);
        lines.push(`${PROFILES_ROW_INDENT}${role}: ${profileRowValue(resolved)}`);
    }
    return lines;
}
/**
 * 组装单个角色的画像行值段（内部）：model/effort 均未配置时输出继承文案；
 * 有配置时按 model、effort、来源标注三段以 ' | ' 拼接（来源取字段级 config
 * 来源，model 优先；whenMain 带匹配值）。
 * @param resolved resolveSubagentDefaults 产物
 * @returns 行值段文本
 */
function profileRowValue(resolved) {
    if (resolved.model === undefined && resolved.effort === undefined) {
        return PROFILES_NOT_CONFIGURED_TEXT;
    }
    const parts = [];
    if (resolved.model !== undefined)
        parts.push(resolved.model);
    if (resolved.effort !== undefined)
        parts.push(`effort ${resolved.effort}`);
    const mode = resolved.configSources.model ?? resolved.configSources.effort;
    if (mode === 'whenMain') {
        parts.push(`whenMain=${resolved.whenMainValue ?? resolved.model ?? resolved.effort}`);
    }
    else if (mode === 'fallback') {
        parts.push('fallback');
    }
    return parts.join(' | ');
}
/**
 * 组装 git 行：分支读取失败或为空降级为 unknown；脏文件数读取失败按 0 处理（忽略）。
 * @param root 项目根
 * @returns git 行
 */
function gitLine(root) {
    const [branchErr, branch] = gitCurrentBranchSync(root);
    const branchName = branchErr || branch === null || branch === '' ? UNKNOWN_VALUE : branch;
    const [statusErr, status] = gitStatusSync(root);
    const dirtyCount = statusErr || status === null ? 0 : countDirtyLines(status);
    return `${LINE_LABELS.git}${branchName}, ${dirtyCount}${DIRTY_SUFFIX}`;
}
/**
 * 组装 Worktree 行（内部）：活跃任务 worktree_path 非空时输出一行（Git 行之后），
 * branch/base 空串降级省略对应括注段；无任务、路径为空或字段缺失时输出空列表
 * （行不出现，零变化面 AC3/AC6）。
 * @param root 项目根
 * @param task 活跃任务记录（无任务为 null）
 * @returns 行列表（空数组 = 不输出）
 */
function worktreeLines(root, task) {
    if (task === null)
        return [];
    const worktreePath = task.worktree_path;
    if (typeof worktreePath !== 'string' || worktreePath === '')
        return [];
    const notes = [];
    if (typeof task.branch === 'string' && task.branch !== '')
        notes.push(`branch ${task.branch}`);
    if (typeof task.base_branch === 'string' && task.base_branch !== '') {
        notes.push(`base ${task.base_branch}`);
    }
    const suffix = notes.length > 0 ? ` (${notes.join(', ')})` : '';
    return [`${LINE_LABELS.worktree}${join(root, worktreePath)}${suffix}`];
}
/** 把任意异常归一为 Error（内部）。 */
function toError(value) {
    return value instanceof Error ? value : new Error(String(value));
}
//# sourceMappingURL=session-context.js.map