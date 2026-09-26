/**
 * task-ops：六个任务管理工具（create/start/check/finish/archive/list）的 runtime 无关
 * 编排（新增抽象，TypeScript）。
 *
 * 设计意图：
 * - 把两个 adapter 逐行对应的任务工具序列（cwd 校验 → 显式 taskPath 优先 →
 *   活跃任务 fallback → core 任务调用 → null 结果兜底报错）下沉为单一调用，
 *   adapter 只负责从执行上下文提取 cwd/contextKey 并投影返回值；
 * - create 的入参过滤（空串 slug/priority/description 不传）照 DSH 现状；
 * - archive 的 taskPath 必填（requireTaskRelPath，缺参即报错不回退活跃任务），
 *   归档必须显式绑定目标任务；start/check/finish/align 保持活跃任务回退；
 * - 所有错误消息使用 surface.ERR_PREFIX.taskTool 前缀，与下沉前逐字一致。
 */
import { resolveActiveTask } from '../legacy/active-task.js';
import { findWorkloomRoot } from '../legacy/locate.js';
import { archiveTask, checkTask, createTask, finishTask, listTasks, startTask, } from '../legacy/task-store.js';
import { ERR_PREFIX, TASK_ARCHIVE_NOTE, TASK_CREATE_NOTE } from '../surface.js';
/**
 * 校验工具 cwd：空串直接抛错（消息含前缀，与下沉前 adapter 文案逐字一致）。
 * @param cwd 工具执行上下文的工作目录
 * @returns cwd（非空）
 */
export function requireWorkloomCwd(cwd) {
    if (cwd === '') {
        throw new Error(`${ERR_PREFIX.taskTool}: cannot determine the working directory of this session`);
    }
    return cwd;
}
/**
 * 解析任务相对路径：显式 taskPath 优先，缺省取活跃任务（无则抛错）。
 * @param cwd 会话工作目录（项目根或其任意子目录）
 * @param contextKey 会话标识（adapter 组装）
 * @param taskPath 显式任务路径（可选）
 * @param errPrefix 「无活跃任务」错误消息的前缀（任务工具传 taskTool，
 *   executor 传 executor，保持与下沉前各消费方的文案一致）
 * @returns 任务目录相对 .workloom 的路径
 */
export function resolveTaskRelPath(cwd, contextKey, taskPath, errPrefix) {
    if (typeof taskPath === 'string' && taskPath !== '')
        return taskPath;
    // 缺省取活跃任务：先向上定位 .workloom 根再读会话指针——深层子目录 cwd 下若把
    // 原始 cwd 当根直接拼 <cwd>/.workloom/.runtime 会 ENOENT 而误报无活跃任务；
    // active-task.js 约定 root 为项目根不做向上查找，此处复用 findWorkloomRoot 补齐。
    const found = findWorkloomRoot(cwd);
    if (found === null) {
        throw new Error(`${errPrefix}: no .workloom directory found from cwd: ${cwd}`);
    }
    const [ptrErr, active] = resolveActiveTask(found.root, contextKey);
    if (ptrErr)
        throw ptrErr;
    if (active === null) {
        throw new Error(`${errPrefix}: no active task and no taskPath given`);
    }
    return active;
}
/**
 * 解析必填任务相对路径：taskPath 缺失或空串直接抛错，不回退活跃任务
 * （archive/journal 等必须显式绑定任务的消费方用；权威校验在 core，
 * adapter schema 的 required 只是投影）。
 * @param taskPath 显式任务路径（必填）
 * @param errPrefix 错误消息前缀（任务工具传 taskTool，journal 传 command）
 * @returns 任务目录相对 .workloom 的路径
 */
export function requireTaskRelPath(taskPath, errPrefix) {
    if (typeof taskPath === 'string' && taskPath !== '')
        return taskPath;
    throw new Error(`${errPrefix}: taskPath is required (task directory relative to .workloom)`);
}
/**
 * create 工具编排：创建任务并设为当前会话活跃任务。
 * @param cwd 会话工作目录
 * @param contextKey 会话标识（adapter 组装）
 * @param params 工具参数（空串 slug/priority/description 不传，照 DSH 现状）
 * @returns [err, result]：err 为任一失败（消息含前缀）
 */
export async function executeCreateTask(cwd, contextKey, params) {
    try {
        return [null, await executeCreateInternal(cwd, contextKey, params)];
    }
    catch (error) {
        return [toError(error), null];
    }
}
/**
 * create 编排实现（内部）：任一失败抛错，由外层转元组。
 * @param cwd 会话工作目录
 * @param contextKey 会话标识
 * @param params 工具参数
 * @returns 创建结果
 */
async function executeCreateInternal(cwd, contextKey, params) {
    requireWorkloomCwd(cwd);
    const [err, result] = await createTask(cwd, {
        title: params.title,
        ...(typeof params.slug === 'string' && params.slug !== '' ? { slug: params.slug } : {}),
        ...(typeof params.priority === 'string' && params.priority !== ''
            ? { priority: params.priority }
            : {}),
        ...(typeof params.description === 'string' && params.description !== ''
            ? { description: params.description }
            : {}),
        ...(typeof params.parent === 'string' && params.parent !== '' ? { parent: params.parent } : {}),
        contextKey,
    });
    if (err || result === null) {
        throw err ?? new Error(`${ERR_PREFIX.taskTool}: create returned no result`);
    }
    // 附 Phase 1.1 行动指引：引导模型立即加载 brainstorm 并问固定问题，消除时序迟滞。
    return { ...result, nextStepNote: TASK_CREATE_NOTE };
}
/**
 * start 工具编排：把任务从 planning 移到 in_progress。
 * 默认硬阻断：prd 小节未填、jsonl 无有效记录、alignment 门禁未过（无凭据或
 * 凭据 stale）时拒绝；force 豁免需非空 reason 并按实际绕过的 gate 留痕。
 * @param cwd 会话工作目录
 * @param contextKey 会话标识（adapter 组装）
 * @param params 工具参数（taskPath 缺省取活跃任务）
 * @returns [err, task]：err 为任一失败（消息含前缀）
 */
export async function executeStartTask(cwd, contextKey, params) {
    try {
        return [null, await executeStartInternal(cwd, contextKey, params)];
    }
    catch (error) {
        return [toError(error), null];
    }
}
/**
 * start 编排实现（内部）：任一失败抛错，由外层转元组。
 * @param cwd 会话工作目录
 * @param contextKey 会话标识
 * @param params 工具参数
 * @returns 启动后的任务记录
 */
async function executeStartInternal(cwd, contextKey, params) {
    requireWorkloomCwd(cwd);
    const taskRelPath = resolveTaskRelPath(cwd, contextKey, params.taskPath, ERR_PREFIX.taskTool);
    const [err, task] = await startTask(cwd, {
        taskRelPath,
        contextKey,
        ...forceOverride(params),
    });
    if (err !== null || task === null) {
        throw err ?? new Error(`${ERR_PREFIX.taskTool}: start returned no result`);
    }
    return task;
}
/**
 * check 工具编排：记录 2.2 check 通过凭据（task.json check）。
 * @param cwd 会话工作目录
 * @param contextKey 会话标识（adapter 组装）
 * @param params 工具参数（taskPath 缺省取活跃任务）
 * @returns [err, task]：err 为任一失败（消息含前缀）
 */
export async function executeCheckTask(cwd, contextKey, params) {
    try {
        return [null, executeCheckInternal(cwd, contextKey, params)];
    }
    catch (error) {
        return [toError(error), null];
    }
}
/**
 * check 编排实现（内部）：任一失败抛错，由外层转元组。
 * @param cwd 会话工作目录
 * @param contextKey 会话标识
 * @param params 工具参数
 * @returns 写入凭据后的任务记录
 */
function executeCheckInternal(cwd, contextKey, params) {
    requireWorkloomCwd(cwd);
    const taskRelPath = resolveTaskRelPath(cwd, contextKey, params.taskPath, ERR_PREFIX.taskTool);
    const [err, task] = checkTask(cwd, {
        taskRelPath,
        ...(params.summary !== undefined ? { summary: params.summary } : {}),
        ...forceOverride(params),
    });
    if (err !== null || task === null) {
        throw err ?? new Error(`${ERR_PREFIX.taskTool}: check returned no result`);
    }
    return task;
}
/** 提取 force/reason 豁免入参（内部：空串 reason 不传）。 */
function forceOverride(params) {
    return {
        ...(params.force !== undefined ? { force: params.force } : {}),
        ...(typeof params.reason === 'string' && params.reason !== '' ? { reason: params.reason } : {}),
    };
}
/**
 * finish 工具编排：清除会话活跃任务指针（任务状态不变）。
 * @param cwd 会话工作目录
 * @param contextKey 会话标识（adapter 组装）
 * @param taskPath 显式任务路径（可选，缺省取活跃任务）
 * @returns [err, result]：err 为任一失败（消息含前缀）
 */
export async function executeFinishTask(cwd, contextKey, taskPath) {
    try {
        return [null, await executeFinishInternal(cwd, contextKey, taskPath)];
    }
    catch (error) {
        return [toError(error), null];
    }
}
/**
 * finish 编排实现（内部）：任一失败抛错，由外层转元组。
 * @param cwd 会话工作目录
 * @param contextKey 会话标识
 * @param taskPath 显式任务路径（可选）
 * @returns 完成结果
 */
async function executeFinishInternal(cwd, contextKey, taskPath) {
    requireWorkloomCwd(cwd);
    const taskRelPath = resolveTaskRelPath(cwd, contextKey, taskPath, ERR_PREFIX.taskTool);
    const [err] = await finishTask(cwd, { taskRelPath, contextKey });
    if (err !== null)
        throw err;
    return { taskRelPath, finished: true };
}
/**
 * archive 工具编排：归档任务（completed + 移入 archive/，可选 git 自动提交）。
 * 默认硬阻断：task.json 无 check 凭据时拒绝；force 豁免并留痕。
 * @param cwd 会话工作目录
 * @param params 工具参数（taskPath 必填）
 * @returns [err, result]：err 为任一失败（消息含前缀）
 */
export async function executeArchiveTask(cwd, params) {
    try {
        return [null, await executeArchiveInternal(cwd, params)];
    }
    catch (error) {
        return [toError(error), null];
    }
}
/**
 * archive 编排实现（内部）：任一失败抛错，由外层转元组。
 * @param cwd 会话工作目录
 * @param params 工具参数
 * @returns 归档结果
 */
async function executeArchiveInternal(cwd, params) {
    requireWorkloomCwd(cwd);
    const taskRelPath = requireTaskRelPath(params.taskPath, ERR_PREFIX.taskTool);
    const [err, task] = await archiveTask(cwd, {
        taskRelPath,
        ...(params.autoCommit !== undefined ? { autoCommit: params.autoCommit } : {}),
        ...forceOverride(params),
    });
    if (err || task === null) {
        throw err ?? new Error(`${ERR_PREFIX.taskTool}: archive returned no result`);
    }
    return { taskRelPath: task.taskRelPath, task, note: TASK_ARCHIVE_NOTE };
}
/**
 * list 工具编排：列出任务摘要（可选 status 过滤，空串视为未指定）。
 * @param cwd 会话工作目录
 * @param status 状态过滤（可选）
 * @returns [err, result]：err 为任一失败（消息含前缀）
 */
export async function executeListTasks(cwd, status) {
    try {
        return [null, await executeListInternal(cwd, status)];
    }
    catch (error) {
        return [toError(error), null];
    }
}
/**
 * list 编排实现（内部）：任一失败抛错，由外层转元组。
 * @param cwd 会话工作目录
 * @param status 状态过滤（可选）
 * @returns 列表结果
 */
async function executeListInternal(cwd, status) {
    requireWorkloomCwd(cwd);
    const [err, tasks] = listTasks(cwd, {
        ...(status !== undefined && status !== '' ? { status: status } : {}),
    });
    if (err || tasks === null) {
        throw err ?? new Error(`${ERR_PREFIX.taskTool}: list returned no result`);
    }
    return { tasks };
}
/** 把任意异常归一为 Error（内部）。 */
function toError(value) {
    return value instanceof Error ? value : new Error(String(value));
}
//# sourceMappingURL=task-ops.js.map