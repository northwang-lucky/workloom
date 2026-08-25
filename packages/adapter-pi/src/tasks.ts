/**
 * adapter-pi 的任务管理工具注册（registerTool）。
 *
 * 设计意图：
 * - 把 core 的任务生命周期暴露为模型可调工具，参数 schema 用 TypeBox
 *   （Pi 的 registerTool 约定），字段与 DSH 的 JSON Schema 完全一致；
 * - execute 统一从 ExtensionContext 取 cwd 与会话 id 组装 contextKey，
 *   返回 {content: 文本, details: 结构化值}；失败直接 throw（Pi 工具管线
 *   按失败处理）。
 */

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import { Type, type Static } from 'typebox'

import {
  archiveTask,
  createTask,
  finishTask,
  listTasks,
  resolveActiveTask,
  startTask,
} from '@workloom/core'

import {
  COMMAND_FINISH,
  contextKeyOf,
  TASK_ARCHIVE_TOOL,
  TASK_CREATE_TOOL,
  TASK_FINISH_TOOL,
  TASK_ERR_PREFIX,
  TASK_LIST_TOOL,
  TASK_START_TOOL,
} from './constants.ts'

/** 任务路径参数说明（三个工具共用，消除同义字符串）。 */
const TASK_PATH_DESCRIPTION = 'Task directory relative to .workloom; defaults to the active task'

/** create 工具参数 schema。 */
const TASK_CREATE_PARAMS = Type.Object({
  title: Type.String({ description: 'Task title' }),
  slug: Type.Optional(
    Type.String({ description: 'Optional kebab-case slug; derived from title when omitted' }),
  ),
  priority: Type.Optional(Type.String({ description: 'Priority: P0/P1/P2/P3; defaults to P2' })),
  description: Type.Optional(Type.String({ description: 'Optional task description' })),
})

/** start/finish 工具参数 schema（仅可选 taskPath）。 */
const TASK_PATH_PARAMS = Type.Object({
  taskPath: Type.Optional(Type.String({ description: TASK_PATH_DESCRIPTION })),
})

/** archive 工具参数 schema（taskPath + autoCommit）。 */
const TASK_ARCHIVE_PARAMS = Type.Object({
  taskPath: Type.Optional(Type.String({ description: TASK_PATH_DESCRIPTION })),
  autoCommit: Type.Optional(
    Type.Boolean({ description: 'Override the config session_auto_commit for this archive' }),
  ),
})

/** list 工具参数 schema（可选 status 过滤）。 */
const TASK_LIST_PARAMS = Type.Object({
  status: Type.Optional(Type.String({ description: 'Filter: planning/in_progress/completed' })),
})

/** 工具执行上下文的最小形状（读 cwd 与会话 id）。 */
interface ToolContextLike {
  cwd: string
  sessionManager: { getSessionId(): string }
}

/**
 * 注册五个任务管理工具（create/start/finish/archive/list）。
 * @param pi Extension API
 */
export function registerTaskTools(pi: ExtensionAPI): void {
  pi.registerTool({
    name: TASK_CREATE_TOOL,
    label: 'Workloom Task Create',
    description:
      'Create a new workloom task in planning state (with prd.md skeleton and jsonl seeds)',
    parameters: TASK_CREATE_PARAMS,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      return executeCreate(ctx, params)
    },
  })
  pi.registerTool({
    name: TASK_START_TOOL,
    label: 'Workloom Task Start',
    description: 'Move the active task (or the given taskPath) from planning to in_progress',
    parameters: TASK_PATH_PARAMS,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      return executeStart(ctx, params.taskPath)
    },
  })
  pi.registerTool({
    name: TASK_FINISH_TOOL,
    label: 'Workloom Task Finish',
    description: 'Clear the active-task pointer for this session (status unchanged)',
    parameters: TASK_PATH_PARAMS,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      return executeFinish(ctx, params.taskPath)
    },
  })
  pi.registerTool({
    name: TASK_ARCHIVE_TOOL,
    label: 'Workloom Task Archive',
    description: 'Archive the task (completed + moved to archive/, optional git auto-commit)',
    parameters: TASK_ARCHIVE_PARAMS,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      return executeArchive(ctx, params.taskPath, params.autoCommit)
    },
  })
  pi.registerTool({
    name: TASK_LIST_TOOL,
    label: 'Workloom Task List',
    description: 'List task summaries (optionally filtered by status)',
    parameters: TASK_LIST_PARAMS,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      return executeList(ctx, params.status)
    },
  })
}

/** 从工具上下文解析会话 cwd（缺省抛错）。 */
function requireCwd(ctx: ToolContextLike): string {
  if (ctx.cwd === '') {
    throw new Error(`${TASK_ERR_PREFIX}: cannot determine the working directory of this session`)
  }
  return ctx.cwd
}

/** 解析任务路径：显式 taskPath 优先，缺省取活跃任务（无则抛错）。 */
function resolveTaskRelPath(
  cwd: string,
  ctx: ToolContextLike,
  taskPath: string | undefined,
): string {
  if (taskPath !== undefined && taskPath !== '') return taskPath
  const contextKey = contextKeyOf(ctx.sessionManager.getSessionId())
  const [ptrErr, active] = resolveActiveTask(cwd, contextKey)
  if (ptrErr) throw ptrErr
  if (active === null) {
    throw new Error(`${TASK_ERR_PREFIX}: no active task and no taskPath given`)
  }
  return active
}

/** 组装工具成功结果（文本 + 结构化 details）。 */
function resultOf(value: unknown): {
  content: [{ type: 'text'; text: string }]
  details: unknown
} {
  return { content: [{ type: 'text', text: JSON.stringify(value) }], details: value }
}

/** create 工具：创建任务并设为当前会话活跃任务。 */
async function executeCreate(
  ctx: ToolContextLike,
  params: Static<typeof TASK_CREATE_PARAMS>,
): Promise<{ content: [{ type: 'text'; text: string }]; details: unknown }> {
  const cwd = requireCwd(ctx)
  const [err, result] = await createTask(cwd, {
    title: params.title,
    ...(params.slug !== undefined ? { slug: params.slug } : {}),
    ...(params.priority !== undefined ? { priority: params.priority } : {}),
    ...(params.description !== undefined ? { description: params.description } : {}),
    contextKey: contextKeyOf(ctx.sessionManager.getSessionId()),
  })
  if (err || result === null)
    throw err ?? new Error(`${TASK_ERR_PREFIX}: create returned no result`)
  return resultOf({ taskRelPath: result.taskRelPath, task: result.task })
}

/** start 工具：把任务从 planning 移到 in_progress。 */
async function executeStart(
  ctx: ToolContextLike,
  taskPath: string | undefined,
): Promise<{ content: [{ type: 'text'; text: string }]; details: unknown }> {
  const cwd = requireCwd(ctx)
  const taskRelPath = resolveTaskRelPath(cwd, ctx, taskPath)
  const [err, task] = await startTask(cwd, {
    taskRelPath,
    contextKey: contextKeyOf(ctx.sessionManager.getSessionId()),
  })
  if (err || task === null) throw err ?? new Error(`${TASK_ERR_PREFIX}: start returned no result`)
  return resultOf({ taskRelPath, task })
}

/** finish 工具：清除会话活跃任务指针（状态不变）。 */
async function executeFinish(
  ctx: ToolContextLike,
  taskPath: string | undefined,
): Promise<{ content: [{ type: 'text'; text: string }]; details: unknown }> {
  const cwd = requireCwd(ctx)
  const taskRelPath = resolveTaskRelPath(cwd, ctx, taskPath)
  const [err] = await finishTask(cwd, {
    taskRelPath,
    contextKey: contextKeyOf(ctx.sessionManager.getSessionId()),
  })
  if (err) throw err
  return resultOf({ taskRelPath, finished: true })
}

/** archive 工具：归档任务（completed + 移入 archive/，可选 git 自动提交）。 */
async function executeArchive(
  ctx: ToolContextLike,
  taskPath: string | undefined,
  autoCommit: boolean | undefined,
): Promise<{ content: [{ type: 'text'; text: string }]; details: unknown }> {
  const cwd = requireCwd(ctx)
  const taskRelPath = resolveTaskRelPath(cwd, ctx, taskPath)
  const [err, task] = await archiveTask(cwd, {
    taskRelPath,
    ...(autoCommit !== undefined ? { autoCommit } : {}),
  })
  if (err || task === null) throw err ?? new Error(`${TASK_ERR_PREFIX}: archive returned no result`)
  return resultOf({
    taskRelPath: task.taskRelPath,
    task,
    note: `Task archived. When the session ends, run /${COMMAND_FINISH} to record the session journal.`,
  })
}

/** list 工具：列出任务摘要（可选 status 过滤）。 */
async function executeList(
  ctx: ToolContextLike,
  status: string | undefined,
): Promise<{ content: [{ type: 'text'; text: string }]; details: unknown }> {
  const cwd = requireCwd(ctx)
  const [err, list] = listTasks(cwd, {
    ...(status !== undefined && status !== '' ? { status } : {}),
  })
  if (err || list === null) throw err ?? new Error(`${TASK_ERR_PREFIX}: list returned no result`)
  return resultOf({ tasks: list })
}
