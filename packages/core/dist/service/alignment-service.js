/**
 * alignment-service：workloom_task_align 工具的 runtime 无关编排（新增抽象，
 * TypeScript）。review/confirm 两步协议与 PRD 校验的「服务编排」。
 *
 * 设计意图：
 * - review 只读：返回当前 prd 快照、其 hash、开放节点状态、内容结构诊断与现有
 *   alignment 凭据（零写盘）；不完整的草稿照样可读，就绪与否由 readyToConfirm 表达；
 * - confirm 同步全链路：内容 blocker（复用 task-gates 的 PRD 结构分类器）聚合拒绝
 *   → 重算 hash 与 expectedPrdHash 比对 → 只经 task-store 的
 *   recordAlignmentCredential 窄写口原子落盘（同 hash 幂等，不刷新 passedAt）；
 *   任一步失败零写入；
 * - cwd/root/task 解析与 task-ops 同款（requireWorkloomCwd + resolveTaskRelPath +
 *   findWorkloomRoot），adapter 只负责投影返回与主会话限制。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { computePrdHash, findOpenNodeState } from '../legacy/alignment.js';
import { inspectPrdStructure, PRD_MISSING } from '../legacy/task-gates.js';
import { findWorkloomRoot, insideWorkloom } from '../legacy/locate.js';
import { readTask, recordAlignmentCredential } from '../legacy/task-store.js';
import { ERR_PREFIX } from '../surface.js';
import { requireWorkloomCwd, resolveTaskRelPath } from './task-ops.js';
/** task 目录内 prd 文件名（与 task-store 数据布局一致）。 */
const PRD_FILE = 'prd.md';
/** confirm 聚合内容 blocker 的消息标题（失败仍只抛一个 Error）。 */
const CONTENT_BLOCKERS_PREFIX = 'prd.md content blockers:';
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
    // 任务记录：凭据与状态来自 task.json 归一化读取（门禁对旧数据安全）。
    const [taskErr, task] = readTask(root, taskRelPath);
    if (taskErr !== null || task === null) {
        throw taskErr ?? new Error(`${ERR_PREFIX.taskTool}: read returned no task: ${taskRelPath}`);
    }
    if (params.action === 'review') {
        return reviewAlign(root, taskRelPath, task);
    }
    return confirmAlign(root, taskRelPath, task, params);
}
/**
 * review 编排：读 prd（缺失返回 null 不报错——模型据此判断还没写 prd），
 * 计算当前 hash 与开放节点状态，附内容结构诊断与现有凭据；零写盘。
 * @param root 项目根
 * @param taskRelPath 任务目录相对 .workloom 的路径
 * @param task 归一化后的任务记录
 * @returns review 结果
 */
function reviewAlign(root, taskRelPath, task) {
    const prd = readPrd(root, taskRelPath);
    const prdHash = prd === null ? null : computePrdHash(prd);
    const openNodeState = prd === null ? null : findOpenNodeState(prd);
    // 内容级 confirm 就绪诊断与 confirm/start 共用同一分类器（不复制 PRD 解析规则）。
    const structureIssues = inspectPrdStructure(prd);
    return {
        action: 'review',
        taskRelPath,
        status: task.status,
        prd,
        prdHash,
        openNodeState,
        structureIssues,
        confirmBlockers: structureIssues.map((issue) => issue.message),
        readyToConfirm: structureIssues.length === 0,
        alignment: task.alignment,
    };
}
/**
 * confirm 编排：前置校验全部通过才写凭据（失败零写入）。
 * 校验顺序固定：expectedPrdHash 必填 → prd 内容 blocker（分类器聚合）→ 重算 hash 与
 * expectedPrdHash 一致 → summary 非空 → recordAlignmentCredential 原子窄写口。
 * @param root 项目根
 * @param taskRelPath 任务目录相对 .workloom 的路径
 * @param task 归一化后的任务记录
 * @param params 工具参数
 * @returns confirm 结果
 */
function confirmAlign(root, taskRelPath, task, params) {
    // confirm 必填 expectedPrdHash（R10）：缺失时显式拒绝，不落入 hash 失配的歧义文案。
    if (typeof params.expectedPrdHash !== 'string' || params.expectedPrdHash.trim() === '') {
        throw new Error(`${ERR_PREFIX.taskTool}: confirm rejected: expectedPrdHash is required ` +
            '(run action=review to obtain the current prd hash first)');
    }
    const prd = readPrd(root, taskRelPath);
    if (prd === null) {
        throw new Error(`${ERR_PREFIX.taskTool}: confirm rejected: ${PRD_MISSING}`);
    }
    // 内容 blocker 一次取全（H1 → 骨架小节 → open nodes），仍只抛一个 Error。
    const blockers = inspectPrdStructure(prd).map((issue) => issue.message);
    if (blockers.length > 0) {
        throw new Error(`${ERR_PREFIX.taskTool}: confirm rejected: ${CONTENT_BLOCKERS_PREFIX}\n` +
            blockers.map((blocker) => `- ${blocker}`).join('\n'));
    }
    const prdHash = computePrdHash(prd);
    if (params.expectedPrdHash !== prdHash) {
        throw new Error(`${ERR_PREFIX.taskTool}: confirm rejected: prd hash mismatch ` +
            `(expected ${String(params.expectedPrdHash)} but current prd.md hashes to ${prdHash}); ` +
            're-run action=review to refresh the snapshot before confirming');
    }
    const summary = typeof params.summary === 'string' ? params.summary.trim() : '';
    if (summary === '') {
        throw new Error(`${ERR_PREFIX.taskTool}: confirm rejected: a non-empty summary is required ` +
            '(record covered nodes, key decisions, and the confirmation result)');
    }
    // 幂等早退在窄写口内（同 prdHash 不刷新 passedAt）；此处只做同步编排。
    const [err, saved] = recordAlignmentCredential(root, taskRelPath, { summary, prdHash });
    if (err !== null || saved === null) {
        throw err ?? new Error(`${ERR_PREFIX.taskTool}: confirm returned no result`);
    }
    const previousHash = task.alignment?.prdHash ?? null;
    return {
        action: 'confirm',
        taskRelPath,
        prdHash,
        idempotent: previousHash === prdHash,
        alignment: saved.alignment,
    };
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
 * 读取任务 prd.md 全文（缺失返回 null）。
 * @param root 项目根
 * @param taskRelPath 任务目录相对 .workloom 的路径
 * @returns prd.md 全文或 null
 */
function readPrd(root, taskRelPath) {
    try {
        return readFileSync(join(insideWorkloom(root, taskRelPath), PRD_FILE), 'utf8');
    }
    catch (error) {
        if (isEnoent(error))
            return null;
        throw error;
    }
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