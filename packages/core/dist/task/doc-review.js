/**
 * doc-review：任务文档复核服务的 runtime 无关编排（TypeScript）。
 * workloom_task_align（PRD/PLAN review 与 confirm）与 workloom_task_case
 * （CASE review-only）共用同一编排模块，按 target 分段。
 *
 * 设计意图：
 * - align review 只读：按 target 返回 PRD 或 PLAN 的内容快照、结构诊断与现有
 *   确认记录（零写盘）；不完整的草稿照样可读，就绪与否由 readyToConfirm 表达；
 * - align confirm 同步全链路：内容 blocker（prd-structure 单一解析器）聚合拒绝
 *   → summary（人工确认必填；semi/auto 的 PLAN 与 auto 的 PRD 自动记录）→
 *   只经 state-machine 的确认迁移窄写口原子落盘（confirmPrd / confirmPlan）；
 *   确认记录含 passedAt/summary/source/autonomy，无哈希，每次确认刷新为最近一次；
 * - PLAN 确认要求 PRD 已有确认记录且 planReview 轨道 clean（守卫在状态机硬校验，
 *   与 autonomy 无关）；
 * - case review 只读：CASE 由主会话对照 PRD、PLAN 与实际代码复核；复核满意后
 *   直接续接同一 designSession 执行，不写任何复核凭证；
 * - cwd/root/task 解析与 task-ops 同款（requireWorkloomCwd + resolveTaskRelPath +
 *   findWorkloomRoot），adapter 只负责投影返回与主会话限制。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CASE_FILES, inspectCaseStructure } from "./case-structure.js";
import { listCaseChangedFiles } from "./case-scope.js";
import { PRD_MISSING, inspectPlanDoc, inspectPrdStructure } from "./prd-structure.js";
import { findWorkloomRoot, insideWorkloom } from '../workspace/locate.js';
import { findArchivedTaskPath } from "./task-storage.js";
import { AUTONOMY, confirmPlan, confirmPrd, readTaskView } from "./state-machine.js";
import { ERR_PREFIX } from "../injection/surface.js";
import { requireWorkloomCwd, resolveTaskRelPath } from "./task-ops.js";
/** task 目录内 prd/plan 文件名（与 task-storage 数据布局一致）。 */
const PRD_FILE = 'prd.md';
const PLAN_FILE = 'plan.md';
/** confirm 聚合内容 blocker 的消息标题（失败仍只抛一个 Error）。 */
const PRD_BLOCKERS_PREFIX = 'prd.md content blockers:';
const PLAN_BLOCKERS_PREFIX = 'plan.md content blockers:';
/**
 * 执行 workloom_task_align 编排（全程同步）。
 * @param cwd 会话工作目录
 * @param contextKey 会话标识（taskPath 缺省时取活跃任务）
 * @param params 工具参数
 * @returns [err, result]：err 为任一失败（消息含前缀；失败零写入）
 */
export function executeAlignTask(cwd, contextKey, params) {
    try {
        return [null, executeAlignInternal(cwd, contextKey, params)];
    }
    catch (error) {
        return [toError(error), null];
    }
}
/**
 * 执行 workloom_task_case 编排（全程同步，review-only）。
 * @param cwd 会话工作目录
 * @param contextKey 会话标识（taskPath 缺省时取活跃任务）
 * @param params 工具参数
 * @returns [err, result]：err 为任一失败（消息含前缀；失败零写入）
 */
export function executeTaskCase(cwd, contextKey, params) {
    try {
        requireWorkloomCwd(cwd);
        // 协议只保留 review：其他动作显式拒绝（无用户确认动作，也不写复核凭证）。
        if (params.action !== 'review') {
            throw new Error(`${ERR_PREFIX.taskTool}: only action=review is supported ` +
                '(the main session reviews the CASE and then continues the design session for execution)');
        }
        const taskRelPath = resolveTaskRelPath(cwd, contextKey, params.taskPath, ERR_PREFIX.taskTool);
        const root = requireProjectRoot(cwd);
        const [taskErr, task] = readTaskView(root, taskRelPath);
        if (taskErr !== null || task === null) {
            throw taskErr ?? new Error(`${ERR_PREFIX.taskTool}: read returned no task: ${taskRelPath}`);
        }
        return [null, reviewCase(root, taskRelPath, task)];
    }
    catch (error) {
        return [toError(error), null];
    }
}
/**
 * align 编排实现（内部）：任一失败抛错，由外层转元组。
 */
function executeAlignInternal(cwd, contextKey, params) {
    requireWorkloomCwd(cwd);
    const taskRelPath = resolveTaskRelPath(cwd, contextKey, params.taskPath, ERR_PREFIX.taskTool);
    const root = requireProjectRoot(cwd);
    // 任务记录：确认记录与状态来自 task.json 归一化读取（门禁对旧数据安全）。
    const [taskErr, task] = readTaskView(root, taskRelPath);
    if (taskErr !== null || task === null) {
        throw taskErr ?? new Error(`${ERR_PREFIX.taskTool}: read returned no task: ${taskRelPath}`);
    }
    // target 缺省 prd（兼容旧调用）；非法取值按缺省处理与参数描述口径一致。
    const target = params.target === 'plan' ? 'plan' : 'prd';
    if (params.action === 'review') {
        return reviewAlign(root, taskRelPath, task, target);
    }
    return target === 'plan'
        ? confirmPlanAlign(root, taskRelPath, params, task)
        : confirmPrdAlign(root, taskRelPath, params, task);
}
/**
 * align review 编排：读确认对象文档（缺失以结构问题表达，不报错——模型据此判断
 * 文档还没写），附结构诊断与现有确认记录；零写盘。
 */
function reviewAlign(root, taskRelPath, task, target) {
    const prd = readTaskDocument(root, taskRelPath, PRD_FILE);
    const plan = target === 'plan' ? readTaskDocument(root, taskRelPath, PLAN_FILE) : null;
    // PLAN 结构校验以 prd 的 AC 清单为基准：prd 缺失时直接复用 PRD 分类器报缺失。
    const structureIssues = target === 'plan'
        ? prd === null
            ? inspectPrdStructure(prd)
            : inspectPlanDoc(plan, prd)
        : inspectPrdStructure(prd);
    return {
        action: 'review',
        target,
        taskRelPath,
        status: task.status,
        prd,
        plan,
        structureIssues,
        confirmBlockers: structureIssues.map((issue) => issue.message),
        readyToConfirm: structureIssues.length === 0,
        alignment: task.alignment,
        planConfirmation: task.planConfirmation,
    };
}
/**
 * PRD confirm 编排：前置校验全部通过才写确认记录（失败零写入）。
 * 校验顺序固定：prd 内容 blocker（分类器聚合）→ summary 非空 → 窄写口原子落盘。
 */
function confirmPrdAlign(root, taskRelPath, params, view) {
    const prd = readTaskDocument(root, taskRelPath, PRD_FILE);
    if (prd === null) {
        throw new Error(`${ERR_PREFIX.taskTool}: confirm rejected: ${PRD_MISSING}`);
    }
    // 内容 blocker 一次取全（H1 → 骨架小节 → R/AC 追踪），仍只抛一个 Error。
    const blockers = inspectPrdStructure(prd).map((issue) => issue.message);
    if (blockers.length > 0) {
        throw new Error(`${ERR_PREFIX.taskTool}: confirm rejected: ${PRD_BLOCKERS_PREFIX}\n` +
            blockers.map((blocker) => `- ${blocker}`).join('\n'));
    }
    // autonomy=auto 自动记录（summary 由状态机注明自动来源）；manual/semi 的 PRD
    // 确认保持人工，summary 必填非空。
    const entry = view.autonomy === AUTONOMY.AUTO ? {} : { summary: requireConfirmSummary(params) };
    const [err, saved] = confirmPrd(root, taskRelPath, entry);
    if (err !== null || saved === null || saved.alignment === null) {
        throw err ?? new Error(`${ERR_PREFIX.taskTool}: confirm returned no result`);
    }
    return {
        action: 'confirm',
        target: 'prd',
        taskRelPath,
        alignment: saved.alignment,
        planConfirmation: null,
    };
}
/**
 * PLAN confirm 编排：PLAN 结构校验通过 + summary 非空后写 PLAN 确认记录。
 * 「PRD 已确认」的顺序前置在窄写口硬校验（拒绝时指引先确认 PRD）。
 */
function confirmPlanAlign(root, taskRelPath, params, view) {
    const prd = readTaskDocument(root, taskRelPath, PRD_FILE);
    if (prd === null) {
        throw new Error(`${ERR_PREFIX.taskTool}: confirm rejected: ${PRD_MISSING}`);
    }
    const plan = readTaskDocument(root, taskRelPath, PLAN_FILE);
    // PLAN 缺失或结构不完整时一次返回全部结构问题（仍只抛一个 Error）。
    const blockers = inspectPlanDoc(plan, prd).map((issue) => issue.message);
    if (blockers.length > 0) {
        throw new Error(`${ERR_PREFIX.taskTool}: confirm rejected: ${PLAN_BLOCKERS_PREFIX}\n` +
            blockers.map((blocker) => `- ${blocker}`).join('\n'));
    }
    // autonomy=semi/auto 的 PLAN 确认自动记录（Judger 评审轨道与 autonomy 无关，
    // plan-review-clean 守卫在状态机内硬拦）；manual 保持人工，summary 必填非空。
    const entry = view.autonomy === AUTONOMY.MANUAL ? { summary: requireConfirmSummary(params) } : {};
    const [err, saved] = confirmPlan(root, taskRelPath, entry);
    if (err !== null || saved === null || saved.planConfirmation === null) {
        throw err ?? new Error(`${ERR_PREFIX.taskTool}: confirm returned no result`);
    }
    return {
        action: 'confirm',
        target: 'plan',
        taskRelPath,
        alignment: null,
        planConfirmation: saved.planConfirmation,
    };
}
/**
 * 校验 confirm 必填的非空摘要（内部）：缺失或空白即拒绝。
 * @returns trim 后的摘要
 */
function requireConfirmSummary(params) {
    const summary = typeof params.summary === 'string' ? params.summary.trim() : '';
    if (summary === '') {
        throw new Error(`${ERR_PREFIX.taskTool}: confirm rejected: a non-empty summary is required ` +
            '(record the coverage, key decisions, and the confirmation result)');
    }
    return summary;
}
/**
 * case review 编排（内部）：CASE 全文 + 结构诊断 + 会话链现状（零写盘）。
 */
function reviewCase(root, taskRelPath, task) {
    const caseContent = readTaskDocument(root, taskRelPath, CASE_FILES.document);
    const prdContent = readTaskDocument(root, taskRelPath, PRD_FILE);
    if (prdContent === null)
        throw new Error(`${ERR_PREFIX.taskTool}: prd.md is missing`);
    const [gitErr, changedFiles] = listCaseChangedFiles(root, task);
    if (gitErr !== null || changedFiles === null) {
        throw gitErr ?? new Error(`${ERR_PREFIX.taskTool}: git changed files returned no result`);
    }
    const structureIssues = inspectCaseStructure(caseContent, prdContent, {
        taskRelPath,
        children: task.children,
        changedFiles,
    });
    for (const child of task.children) {
        // 子任务归档后 children 仍指向归档前路径：先读当前路径，缺失时按任务名
        // 兼容解析 tasks/archive/<YYYY-MM>/<name>/plan.md；两处都缺失才报缺失。
        const plan = readTaskDocument(root, child, 'plan.md') ?? readArchivedChildPlan(root, child);
        if (plan === null) {
            structureIssues.push({ code: 'parent_plan_missing', message: `${child}/plan.md is missing` });
        }
    }
    return {
        action: 'review',
        taskRelPath,
        status: task.status,
        case: caseContent,
        designSession: task.case?.designSession ?? null,
        structureIssues,
        blockers: structureIssues.map((item) => item.message),
        readyForExecution: structureIssues.length === 0,
    };
}
/** 子任务已归档时按任务名回退读取归档目录内的 plan.md（内部）。 */
function readArchivedChildPlan(root, child) {
    const archived = findArchivedTaskPath(root, child);
    return archived === null ? null : readTaskDocument(root, archived, 'plan.md');
}
/**
 * 解析项目根（cwd 或其祖先含 .workloom；缺失抛错）。
 */
function requireProjectRoot(cwd) {
    const found = findWorkloomRoot(cwd);
    if (found === null) {
        throw new Error(`${ERR_PREFIX.taskTool}: no .workloom directory found (searched up from ${cwd})`);
    }
    return found.root;
}
/**
 * 读取任务目录内的文档全文（缺失返回 null，其他错误透传）。
 */
function readTaskDocument(root, taskRelPath, fileName) {
    try {
        return readFileSync(join(insideWorkloom(root, taskRelPath), fileName), 'utf8');
    }
    catch (error) {
        if (isEnoent(error))
            return null;
        throw error;
    }
}
/** 判断异常是否为文件不存在（内部）。 */
function isEnoent(error) {
    return error?.code === 'ENOENT';
}
/** 把任意异常归一为 Error（内部）。 */
function toError(value) {
    return value instanceof Error ? value : new Error(String(value));
}
//# sourceMappingURL=doc-review.js.map