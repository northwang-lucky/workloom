/**
 * alignment-service：workloom_task_align 工具的 runtime 无关编排（TypeScript）。
 * PRD 与 PLAN 分阶段内容确认的 review/confirm 两步协议与结构校验的「服务编排」。
 *
 * 设计意图：
 * - review 只读：按 target 返回 PRD 或 PLAN 的内容快照、结构诊断与现有确认记录
 *   （零写盘）；不完整的草稿照样可读，就绪与否由 readyToConfirm 表达；
 * - confirm 同步全链路：内容 blocker（复用 task-gates 的结构分类器）聚合拒绝
 *   → summary 非空 → 只经 task-store 的窄写口原子落盘（PRD 用
 *   recordAlignmentCredential，PLAN 用 recordPlanConfirmation）；确认记录只含
 *   passedAt 与 summary，无哈希，每次确认都刷新为最近一次；
 * - PLAN 确认要求 PRD 已有确认记录（顺序前置在窄写口硬校验，R3）；
 * - cwd/root/task 解析与 task-ops 同款（requireWorkloomCwd + resolveTaskRelPath +
 *   findWorkloomRoot），adapter 只负责投影返回与主会话限制。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { inspectPlanStructure, inspectPrdStructure, PRD_MISSING } from '../domain/task-gates.js';
import { findWorkloomRoot, insideWorkloom } from '../domain/locate.js';
import { readTask, recordAlignmentCredential, recordPlanConfirmation } from '../domain/task-store.js';
import { ERR_PREFIX } from '../surface.js';
import { requireWorkloomCwd, resolveTaskRelPath } from './task-ops.js';
/** task 目录内 prd/plan 文件名（与 task-store 数据布局一致）。 */
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
 * align 编排实现（内部）：任一失败抛错，由外层转元组。
 * @param cwd 会话工作目录
 * @param contextKey 会话标识
 * @param params 工具参数
 * @returns 编排结果（review/confirm 两态）
 */
function executeAlignInternal(cwd, contextKey, params) {
    requireWorkloomCwd(cwd);
    const taskRelPath = resolveTaskRelPath(cwd, contextKey, params.taskPath, ERR_PREFIX.taskTool);
    const root = requireProjectRoot(cwd);
    // 任务记录：确认记录与状态来自 task.json 归一化读取（门禁对旧数据安全）。
    const [taskErr, task] = readTask(root, taskRelPath);
    if (taskErr !== null || task === null) {
        throw taskErr ?? new Error(`${ERR_PREFIX.taskTool}: read returned no task: ${taskRelPath}`);
    }
    // target 缺省 prd（兼容旧调用）；非法取值按缺省处理与参数描述口径一致。
    const target = params.target === 'plan' ? 'plan' : 'prd';
    if (params.action === 'review') {
        return reviewAlign(root, taskRelPath, task, target);
    }
    return target === 'plan'
        ? confirmPlanAlign(root, taskRelPath, params)
        : confirmPrdAlign(root, taskRelPath, params);
}
/**
 * review 编排：读确认对象文档（缺失以结构问题表达，不报错——模型据此判断
 * 文档还没写），附结构诊断与现有确认记录；零写盘。
 * @param root 项目根
 * @param taskRelPath 任务目录相对 .workloom 的路径
 * @param task 归一化后的任务记录
 * @param target 确认对象
 * @returns review 结果
 */
function reviewAlign(root, taskRelPath, task, target) {
    const prd = readPrd(root, taskRelPath);
    const plan = target === 'plan' ? readPlan(root, taskRelPath) : null;
    // PLAN 结构校验以 prd 的 AC 清单为基准：prd 缺失时直接复用 PRD 分类器报缺失。
    const structureIssues = target === 'plan'
        ? prd === null
            ? inspectPrdStructure(prd)
            : inspectPlanStructure(plan, prd)
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
 * @param root 项目根
 * @param taskRelPath 任务目录相对 .workloom 的路径
 * @param params 工具参数
 * @returns PRD confirm 结果
 */
function confirmPrdAlign(root, taskRelPath, params) {
    const prd = readPrd(root, taskRelPath);
    if (prd === null) {
        throw new Error(`${ERR_PREFIX.taskTool}: confirm rejected: ${PRD_MISSING}`);
    }
    // 内容 blocker 一次取全（H1 → 骨架小节 → R/AC 追踪），仍只抛一个 Error。
    const blockers = inspectPrdStructure(prd).map((issue) => issue.message);
    if (blockers.length > 0) {
        throw new Error(`${ERR_PREFIX.taskTool}: confirm rejected: ${PRD_BLOCKERS_PREFIX}\n` +
            blockers.map((blocker) => `- ${blocker}`).join('\n'));
    }
    const summary = requireConfirmSummary(params);
    const [err, saved] = recordAlignmentCredential(root, taskRelPath, { summary });
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
 * @param root 项目根
 * @param taskRelPath 任务目录相对 .workloom 的路径
 * @param params 工具参数
 * @returns PLAN confirm 结果
 */
function confirmPlanAlign(root, taskRelPath, params) {
    const prd = readPrd(root, taskRelPath);
    if (prd === null) {
        throw new Error(`${ERR_PREFIX.taskTool}: confirm rejected: ${PRD_MISSING}`);
    }
    const plan = readPlan(root, taskRelPath);
    // PLAN 缺失或结构不完整时一次返回全部结构问题（仍只抛一个 Error）。
    const blockers = inspectPlanStructure(plan, prd).map((issue) => issue.message);
    if (blockers.length > 0) {
        throw new Error(`${ERR_PREFIX.taskTool}: confirm rejected: ${PLAN_BLOCKERS_PREFIX}\n` +
            blockers.map((blocker) => `- ${blocker}`).join('\n'));
    }
    const summary = requireConfirmSummary(params);
    const [err, saved] = recordPlanConfirmation(root, taskRelPath, { summary });
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
 * @param params 工具参数
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
 * 解析项目根（cwd 或其祖先含 .workloom；缺失抛错）。
 * @param cwd 会话工作目录
 * @returns 项目根绝对路径
 */
function requireProjectRoot(cwd) {
    const found = findWorkloomRoot(cwd);
    if (found === null) {
        throw new Error(`${ERR_PREFIX.taskTool}: no .workloom directory found (searched up from ${cwd})`);
    }
    return found.root;
}
/**
 * 读取任务文档全文（缺失返回 null）。
 * @param root 项目根
 * @param taskRelPath 任务目录相对 .workloom 的路径
 * @param fileName 文件名
 * @returns 文档全文或 null
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
/** @param root 项目根 @param taskRelPath 任务相对路径 @returns prd.md 全文或 null */
function readPrd(root, taskRelPath) {
    return readTaskDocument(root, taskRelPath, PRD_FILE);
}
/** @param root 项目根 @param taskRelPath 任务相对路径 @returns plan.md 全文或 null */
function readPlan(root, taskRelPath) {
    return readTaskDocument(root, taskRelPath, PLAN_FILE);
}
/** @param error 错误 @returns 是否文件不存在 */
function isEnoent(error) {
    return error?.code === 'ENOENT';
}
/** @param value 任意异常 @returns 归一化 Error */
function toError(value) {
    return value instanceof Error ? value : new Error(String(value));
}
//# sourceMappingURL=alignment-service.js.map