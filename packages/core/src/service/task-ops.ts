/**
 * task-ops：五个任务管理工具（create/start/finish/archive/list）的 runtime 无关
 * 编排（新增抽象，TypeScript）。
 *
 * 设计意图：
 * - 把两个 adapter 逐行对应的任务工具序列（cwd 校验 → 显式 taskPath 优先 →
 *   活跃任务 fallback → core 任务调用 → null 结果兜底报错）下沉为单一调用，
 *   adapter 只负责从执行上下文提取 cwd/contextKey 并投影返回值；
 * - create 的入参过滤（空串 slug/priority/description 不传）照 DSH 现状；
 * - archive 的内层 archiveTask 调用不需要 contextKey，但包裹层的 taskPath
 *   fallback 需要（照现状）；
 * - 所有错误消息使用 surface.ERR_PREFIX.taskTool 前缀，与下沉前逐字一致。
 */

import { resolveActiveTask } from '../legacy/active-task.js'
import { archiveTask, createTask, finishTask, listTasks, startTask } from '../legacy/task-store.js'
import { ERR_PREFIX, TASK_ARCHIVE_NOTE } from '../surface.js'

import type {
  TaskPriorityValue,
  TaskRecord,
  TaskRecordWithPath,
  TaskStatusValue,
  TaskSummary,
} from '../legacy/task-store.d.ts'

/**
 * 校验工具 cwd：空串直接抛错（消息含前缀，与下沉前 adapter 文案逐字一致）。
 * @param cwd 工具执行上下文的工作目录
 * @returns cwd（非空）
 */
export function requireWorkloomCwd(cwd: string): string {
  if (cwd === '') {
    throw new Error(
      `${ERR_PREFIX.taskTool}: cannot determine the working directory of this session`,
    )
  }
  return cwd
}

/**
 * 解析任务相对路径：显式 taskPath 优先，缺省取活跃任务（无则抛错）。
 * @param cwd 会话工作目录
 * @param contextKey 会话标识（adapter 组装）
 * @param taskPath 显式任务路径（可选）
 * @param errPrefix 「无活跃任务」错误消息的前缀（任务工具传 taskTool，
 *   executor 传 executor，保持与下沉前各消费方的文案一致）
 * @returns 任务目录相对 .workloom 的路径
 */
export function resolveTaskRelPath(
  cwd: string,
  contextKey: string,
  taskPath: string | undefined,
  errPrefix: string,
): string {
  if (typeof taskPath === 'string' && taskPath !== '') return taskPath
  const [ptrErr, active] = resolveActiveTask(cwd, contextKey)
  if (ptrErr) throw ptrErr
  if (active === null) {
    throw new Error(`${errPrefix}: no active task and no taskPath given`)
  }
  return active
}

/** executeCreateTask 入参（title 必填；slug/priority/description 可选）。 */
export interface ExecuteCreateTaskParams {
  title: string
  slug?: string
  priority?: string
  description?: string
}

/** create 工具成功结果（task 为无 taskRelPath 的原始记录）。 */
export interface ExecuteCreateTaskResult {
  taskRelPath: string
  task: TaskRecord
}

/**
 * create 工具编排：创建任务并设为当前会话活跃任务。
 * @param cwd 会话工作目录
 * @param contextKey 会话标识（adapter 组装）
 * @param params 工具参数（空串 slug/priority/description 不传，照 DSH 现状）
 * @returns [err, result]：err 为任一失败（消息含前缀）
 */
export async function executeCreateTask(
  cwd: string,
  contextKey: string,
  params: ExecuteCreateTaskParams,
): Promise<[Error | null, ExecuteCreateTaskResult | null]> {
  try {
    return [null, await executeCreateInternal(cwd, contextKey, params)]
  } catch (error) {
    return [toError(error), null]
  }
}

/**
 * create 编排实现（内部）：任一失败抛错，由外层转元组。
 * @param cwd 会话工作目录
 * @param contextKey 会话标识
 * @param params 工具参数
 * @returns 创建结果
 */
async function executeCreateInternal(
  cwd: string,
  contextKey: string,
  params: ExecuteCreateTaskParams,
): Promise<ExecuteCreateTaskResult> {
  requireWorkloomCwd(cwd)
  const [err, result] = await createTask(cwd, {
    title: params.title,
    ...(typeof params.slug === 'string' && params.slug !== '' ? { slug: params.slug } : {}),
    ...(typeof params.priority === 'string' && params.priority !== ''
      ? { priority: params.priority as TaskPriorityValue }
      : {}),
    ...(typeof params.description === 'string' && params.description !== ''
      ? { description: params.description }
      : {}),
    contextKey,
  })
  if (err || result === null) {
    throw err ?? new Error(`${ERR_PREFIX.taskTool}: create returned no result`)
  }
  return result
}

/**
 * start 工具编排：把任务从 planning 移到 in_progress（返回记录含 taskRelPath）。
 * @param cwd 会话工作目录
 * @param contextKey 会话标识（adapter 组装）
 * @param taskPath 显式任务路径（可选，缺省取活跃任务）
 * @returns [err, task]：err 为任一失败（消息含前缀）
 */
export async function executeStartTask(
  cwd: string,
  contextKey: string,
  taskPath: string | undefined,
): Promise<[Error | null, TaskRecordWithPath | null]> {
  try {
    return [null, await executeStartInternal(cwd, contextKey, taskPath)]
  } catch (error) {
    return [toError(error), null]
  }
}

/**
 * start 编排实现（内部）：任一失败抛错，由外层转元组。
 * @param cwd 会话工作目录
 * @param contextKey 会话标识
 * @param taskPath 显式任务路径（可选）
 * @returns 启动后的任务记录
 */
async function executeStartInternal(
  cwd: string,
  contextKey: string,
  taskPath: string | undefined,
): Promise<TaskRecordWithPath> {
  requireWorkloomCwd(cwd)
  const taskRelPath = resolveTaskRelPath(cwd, contextKey, taskPath, ERR_PREFIX.taskTool)
  const [err, task] = await startTask(cwd, { taskRelPath, contextKey })
  if (err || task === null) {
    throw err ?? new Error(`${ERR_PREFIX.taskTool}: start returned no result`)
  }
  return task
}

/** finish 工具成功结果（finished 恒 true，供 adapter 投影）。 */
export interface ExecuteFinishTaskResult {
  taskRelPath: string
  finished: boolean
}

/**
 * finish 工具编排：清除会话活跃任务指针（任务状态不变）。
 * @param cwd 会话工作目录
 * @param contextKey 会话标识（adapter 组装）
 * @param taskPath 显式任务路径（可选，缺省取活跃任务）
 * @returns [err, result]：err 为任一失败（消息含前缀）
 */
export async function executeFinishTask(
  cwd: string,
  contextKey: string,
  taskPath: string | undefined,
): Promise<[Error | null, ExecuteFinishTaskResult | null]> {
  try {
    return [null, await executeFinishInternal(cwd, contextKey, taskPath)]
  } catch (error) {
    return [toError(error), null]
  }
}

/**
 * finish 编排实现（内部）：任一失败抛错，由外层转元组。
 * @param cwd 会话工作目录
 * @param contextKey 会话标识
 * @param taskPath 显式任务路径（可选）
 * @returns 完成结果
 */
async function executeFinishInternal(
  cwd: string,
  contextKey: string,
  taskPath: string | undefined,
): Promise<ExecuteFinishTaskResult> {
  requireWorkloomCwd(cwd)
  const taskRelPath = resolveTaskRelPath(cwd, contextKey, taskPath, ERR_PREFIX.taskTool)
  const [err] = await finishTask(cwd, { taskRelPath, contextKey })
  if (err !== null) throw err
  return { taskRelPath, finished: true }
}

/** archive 工具成功结果（note 为收尾提示文案）。 */
export interface ExecuteArchiveTaskResult {
  taskRelPath: string
  task: TaskRecord
  note: string
}

/**
 * archive 工具编排：归档任务（completed + 移入 archive/，可选 git 自动提交）。
 * @param cwd 会话工作目录
 * @param contextKey 会话标识（adapter 组装，taskPath 缺省时取活跃任务）
 * @param taskPath 显式任务路径（可选）
 * @param autoCommit 覆盖 config session_auto_commit（可选）
 * @returns [err, result]：err 为任一失败（消息含前缀）
 */
export async function executeArchiveTask(
  cwd: string,
  contextKey: string,
  taskPath: string | undefined,
  autoCommit: boolean | undefined,
): Promise<[Error | null, ExecuteArchiveTaskResult | null]> {
  try {
    return [null, await executeArchiveInternal(cwd, contextKey, taskPath, autoCommit)]
  } catch (error) {
    return [toError(error), null]
  }
}

/**
 * archive 编排实现（内部）：任一失败抛错，由外层转元组。
 * @param cwd 会话工作目录
 * @param contextKey 会话标识
 * @param taskPath 显式任务路径（可选）
 * @param autoCommit 覆盖 config session_auto_commit（可选）
 * @returns 归档结果
 */
async function executeArchiveInternal(
  cwd: string,
  contextKey: string,
  taskPath: string | undefined,
  autoCommit: boolean | undefined,
): Promise<ExecuteArchiveTaskResult> {
  requireWorkloomCwd(cwd)
  const taskRelPath = resolveTaskRelPath(cwd, contextKey, taskPath, ERR_PREFIX.taskTool)
  const [err, task] = await archiveTask(cwd, {
    taskRelPath,
    ...(autoCommit !== undefined ? { autoCommit } : {}),
  })
  if (err || task === null) {
    throw err ?? new Error(`${ERR_PREFIX.taskTool}: archive returned no result`)
  }
  return { taskRelPath: task.taskRelPath, task, note: TASK_ARCHIVE_NOTE }
}

/** list 工具成功结果（tasks 为摘要数组）。 */
export interface ExecuteListTasksResult {
  tasks: TaskSummary[]
}

/**
 * list 工具编排：列出任务摘要（可选 status 过滤，空串视为未指定）。
 * @param cwd 会话工作目录
 * @param status 状态过滤（可选）
 * @returns [err, result]：err 为任一失败（消息含前缀）
 */
export async function executeListTasks(
  cwd: string,
  status: string | undefined,
): Promise<[Error | null, ExecuteListTasksResult | null]> {
  try {
    return [null, await executeListInternal(cwd, status)]
  } catch (error) {
    return [toError(error), null]
  }
}

/**
 * list 编排实现（内部）：任一失败抛错，由外层转元组。
 * @param cwd 会话工作目录
 * @param status 状态过滤（可选）
 * @returns 列表结果
 */
async function executeListInternal(
  cwd: string,
  status: string | undefined,
): Promise<ExecuteListTasksResult> {
  requireWorkloomCwd(cwd)
  const [err, tasks] = listTasks(cwd, {
    ...(status !== undefined && status !== '' ? { status: status as TaskStatusValue } : {}),
  })
  if (err || tasks === null) {
    throw err ?? new Error(`${ERR_PREFIX.taskTool}: list returned no result`)
  }
  return { tasks }
}

/** 把任意异常归一为 Error（内部）。 */
function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value))
}
