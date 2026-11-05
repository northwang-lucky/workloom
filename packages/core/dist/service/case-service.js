/**
 * workloom_task_case 的 runtime 无关 review/confirm 编排。
 * review 只读；confirm 在完整校验后只经 task-store 窄写口落盘。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CASE_FILES, CASE_MISSING, computeCaseHash, inspectCaseStructure, listCaseChangedFiles } from '../domain/case.js';
import { findWorkloomRoot, insideWorkloom } from '../domain/locate.js';
import { findArchivedTaskPath, readTask, recordCaseConfirmation } from '../domain/task-store.js';
import { ERR_PREFIX } from '../surface.js';
import { requireWorkloomCwd, resolveTaskRelPath } from './task-ops.js';
export function executeTaskCase(cwd, contextKey, params) {
    try {
        requireWorkloomCwd(cwd);
        const taskRelPath = resolveTaskRelPath(cwd, contextKey, params.taskPath, ERR_PREFIX.taskTool);
        const root = requireProjectRoot(cwd);
        const [taskErr, task] = readTask(root, taskRelPath);
        if (taskErr !== null || task === null)
            throw taskErr ?? new Error('task not found');
        if (params.action === 'review')
            return [null, reviewCase(root, taskRelPath, task)];
        return [null, confirmCase(root, taskRelPath, task, params)];
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
        caseHash: caseContent === null ? null : computeCaseHash(caseContent),
        structureIssues,
        confirmBlockers: structureIssues.map((item) => item.message),
        readyToConfirm: structureIssues.length === 0,
        caseRecord: task.case,
    };
}
function confirmCase(root, taskRelPath, task, params) {
    if (typeof params.expectedCaseHash !== 'string' || params.expectedCaseHash.trim() === '') {
        throw new Error(`${ERR_PREFIX.taskTool}: confirm rejected: expectedCaseHash is required`);
    }
    const review = reviewCase(root, taskRelPath, task);
    if (review.case === null)
        throw new Error(`${ERR_PREFIX.taskTool}: confirm rejected: ${CASE_MISSING}`);
    if (!review.readyToConfirm) {
        throw new Error(`${ERR_PREFIX.taskTool}: confirm rejected: case.md content blockers:\n` +
            review.confirmBlockers.map((item) => `- ${item}`).join('\n'));
    }
    if (review.caseHash !== params.expectedCaseHash) {
        throw new Error(`${ERR_PREFIX.taskTool}: confirm rejected: CASE hash mismatch; re-run action=review`);
    }
    const summary = typeof params.summary === 'string' ? params.summary.trim() : '';
    if (summary === '')
        throw new Error(`${ERR_PREFIX.taskTool}: confirm rejected: summary is required`);
    const previousHash = task.case?.caseHash ?? null;
    const [err, saved] = recordCaseConfirmation(root, taskRelPath, {
        caseHash: review.caseHash,
        summary,
    });
    if (err !== null || saved === null || saved.case === null) {
        throw err ?? new Error(`${ERR_PREFIX.taskTool}: confirm returned no result`);
    }
    return {
        action: 'confirm',
        taskRelPath,
        caseHash: review.caseHash,
        idempotent: previousHash === review.caseHash,
        caseRecord: saved.case,
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