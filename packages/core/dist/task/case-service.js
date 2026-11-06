/**
 * workloom_task_case 的 runtime 无关 review-only 编排（TypeScript）。
 * CASE 由主会话对照 PRD、PLAN 与实际代码复核；复核满意后直接续接同一
 * designSession 执行，不再有用户确认动作，也不写任何复核凭证。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CASE_FILES, inspectCaseStructure, listCaseChangedFiles } from './case.js';
import { findWorkloomRoot, insideWorkloom } from '../workspace/locate.js';
import { findArchivedTaskPath, readTask } from './task-store.js';
import { ERR_PREFIX } from "../injection/surface.js";
import { requireWorkloomCwd, resolveTaskRelPath } from "./task-ops.js";
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
        const [taskErr, task] = readTask(root, taskRelPath);
        if (taskErr !== null || task === null)
            throw taskErr ?? new Error('task not found');
        return [null, reviewCase(root, taskRelPath, task)];
    }
    catch (error) {
        return [toError(error), null];
    }
}
function reviewCase(root, taskRelPath, task) {
    const caseContent = readTaskFile(root, taskRelPath, CASE_FILES.document);
    const prdContent = readTaskFile(root, taskRelPath, 'prd.md');
    if (prdContent === null)
        throw new Error(`${ERR_PREFIX.taskTool}: prd.md is missing`);
    const [gitErr, changedFiles] = listCaseChangedFiles(root, task);
    if (gitErr !== null || changedFiles === null)
        throw gitErr ?? new Error('git changed files returned no result');
    const structureIssues = inspectCaseStructure(caseContent, prdContent, {
        taskRelPath,
        children: task.children,
        changedFiles,
    });
    for (const child of task.children) {
        // 子任务归档后 children 仍指向归档前路径：先读当前路径，缺失时按任务名
        // 兼容解析 tasks/archive/<YYYY-MM>/<name>/plan.md；两处都缺失才报缺失。
        const plan = readTaskFile(root, child, 'plan.md') ?? readArchivedChildPlan(root, child);
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
function readTaskFile(root, taskRelPath, name) {
    try {
        return readFileSync(join(insideWorkloom(root, taskRelPath), name), 'utf8');
    }
    catch (error) {
        if (error?.code === 'ENOENT')
            return null;
        throw error;
    }
}
/** 子任务已归档时按任务名回退读取归档目录内的 plan.md。 */
function readArchivedChildPlan(root, child) {
    const archived = findArchivedTaskPath(root, child);
    return archived === null ? null : readTaskFile(root, archived, 'plan.md');
}
function requireProjectRoot(cwd) {
    const found = findWorkloomRoot(cwd);
    if (found === null)
        throw new Error(`${ERR_PREFIX.taskTool}: no .workloom directory found`);
    return found.root;
}
function toError(value) {
    return value instanceof Error ? value : new Error(String(value));
}
//# sourceMappingURL=case-service.js.map