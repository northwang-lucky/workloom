/**
 * adapter-dsh 的任务管理工具注册（W4 落地）：把 core 的任务生命周期
 * 暴露为模型可调工具；参数一律标准 JSON Schema（宿主原样转发 API）。
 */

import type { Context } from '@deepseek-ai/cordis'

import {
  archiveTask,
  createTask,
  finishTask,
  listTasks,
  resolveActiveTask,
  startTask,
} from '@workloom/core'

import { CONTEXT_KEY_PREFIX } from './constants.js'

/** 错误消息前缀（运行时文案英文）。 */
const ERR_PREFIX = 'workloom task tool'

/** 工具执行上下文最小形状（仅消费 agent 与 signal）。 */
interface ToolExec {
  agent?: { id: string; session: { header: { cwd?: string } } }
  signal: AbortSignal
}

/** 工具注册面最小形状。 */
export interface TaskToolsServices {
  tools: {
    register(definition: {
      name: string
      description: string
      parameters: Record<string, unknown>
      output: { schema: Record<string, unknown>; render(args: unknown, value: unknown): unknown[] }
      isConcurrencySafe(): boolean
      execute(args: unknown, exec: unknown): Promise<unknown>
    }): () => void
  }
}

/** 文本结果块。 */
interface TextBlockLike {
  type: 'text'
  text: string
}

/**
 * 注册五个任务管理工具（create/start/finish/archive/list）。
 * @param ctx 插件作用域上下文
 */
export function registerTaskTools(ctx: Context & TaskToolsServices): void {
  const tools = ctx.tools

  tools.register({
    name: 'workloom_task_create',
    description:
      'Create a new workloom task in planning state (with prd.md skeleton and jsonl seeds)',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Task title' },
        slug: {
          type: 'string',
          description: 'Optional kebab-case slug; derived from title when omitted',
        },
        priority: { type: 'string', description: 'Priority: P0/P1/P2/P3; defaults to P2' },
        description: { type: 'string', description: 'Optional task description' },
      },
      required: ['title'],
      additionalProperties: false,
    },
    output: { schema: { type: 'object', additionalProperties: true }, render: renderTask },
    isConcurrencySafe: () => true,
    execute: (args, exec) => createTaskTool(ctx, args, exec),
  })

  tools.register({
    name: 'workloom_task_start',
    description: 'Move the active task (or the given taskPath) from planning to in_progress',
    parameters: {
      type: 'object',
      properties: {
        taskPath: {
          type: 'string',
          description: 'Task directory relative to .workloom; defaults to the active task',
        },
      },
      required: [],
      additionalProperties: false,
    },
    output: { schema: { type: 'object', additionalProperties: true }, render: renderTask },
    isConcurrencySafe: () => true,
    execute: (args, exec) => startTaskTool(ctx, args, exec),
  })

  tools.register({
    name: 'workloom_task_finish',
    description: 'Clear the active-task pointer for this session (status unchanged)',
    parameters: {
      type: 'object',
      properties: {
        taskPath: {
          type: 'string',
          description: 'Task directory relative to .workloom; defaults to the active task',
        },
      },
      required: [],
      additionalProperties: false,
    },
    output: { schema: { type: 'object', additionalProperties: true }, render: renderTask },
    isConcurrencySafe: () => true,
    execute: (args, exec) => finishTaskTool(ctx, args, exec),
  })

  tools.register({
    name: 'workloom_task_archive',
    description: 'Archive the task (completed + moved to archive/, optional git auto-commit)',
    parameters: {
      type: 'object',
      properties: {
        taskPath: {
          type: 'string',
          description: 'Task directory relative to .workloom; defaults to the active task',
        },
        autoCommit: {
          type: 'boolean',
          description: 'Override the config session_auto_commit for this archive',
        },
      },
      required: [],
      additionalProperties: false,
    },
    output: { schema: { type: 'object', additionalProperties: true }, render: renderTask },
    isConcurrencySafe: () => true,
    execute: (args, exec) => archiveTaskTool(ctx, args, exec),
  })

  tools.register({
    name: 'workloom_task_list',
    description: 'List task summaries (optionally filtered by status)',
    parameters: {
      type: 'object',
      properties: {
        status: { type: 'string', description: 'Filter: planning/in_progress/completed' },
      },
      required: [],
      additionalProperties: false,
    },
    output: { schema: { type: 'object', additionalProperties: true }, render: renderTask },
    isConcurrencySafe: () => true,
    execute: (args, exec) => listTasksTool(ctx, args, exec),
  })
}

/** 从执行上下文解析会话 cwd（缺省抛错）。 */
function requireCwd(exec: unknown): string {
  const typed = exec as ToolExec
  const cwd = typed.agent?.session.header.cwd
  if (cwd === undefined || cwd === '') {
    throw new Error(`${ERR_PREFIX}: cannot determine the working directory of this session`)
  }
  return cwd
}

/** 解析任务路径：显式 taskPath 优先，缺省取活跃任务（无则抛错）。 */
function resolveTaskRelPath(cwd: string, agentId: string, taskPath: unknown): string {
  if (typeof taskPath === 'string' && taskPath !== '') return taskPath
  const [ptrErr, active] = resolveActiveTask(cwd, `${CONTEXT_KEY_PREFIX}_${agentId}`)
  if (ptrErr) throw ptrErr
  if (active === null) {
    throw new Error(`${ERR_PREFIX}: no active task and no taskPath given`)
  }
  return active
}

/** create 工具：创建任务并设为当前会话活跃任务。 */
async function createTaskTool(
  ctx: Context & TaskToolsServices,
  args: unknown,
  exec: unknown,
): Promise<unknown> {
  const typed = args as Record<string, unknown>
  const cwd = requireCwd(exec)
  const agentId = (exec as ToolExec).agent?.id ?? ''
  const [err, result] = await createTask(cwd, {
    title: String(typed.title ?? ''),
    ...(typeof typed.slug === 'string' && typed.slug !== '' ? { slug: typed.slug } : {}),
    ...(typeof typed.priority === 'string' && typed.priority !== ''
      ? { priority: typed.priority }
      : {}),
    ...(typeof typed.description === 'string' && typed.description !== ''
      ? { description: typed.description }
      : {}),
    contextKey: `${CONTEXT_KEY_PREFIX}_${agentId}`,
  })
  if (err || result === null) throw err ?? new Error(`${ERR_PREFIX}: create returned no result`)
  return { taskRelPath: result.taskRelPath, task: result.task }
}

/** start 工具。 */
async function startTaskTool(
  ctx: Context & TaskToolsServices,
  args: unknown,
  exec: unknown,
): Promise<unknown> {
  const cwd = requireCwd(exec)
  const agentId = (exec as ToolExec).agent?.id ?? ''
  const taskRelPath = resolveTaskRelPath(cwd, agentId, (args as Record<string, unknown>).taskPath)
  const [err, task] = await startTask(cwd, {
    taskRelPath,
    contextKey: `${CONTEXT_KEY_PREFIX}_${agentId}`,
  })
  if (err || task === null) throw err ?? new Error(`${ERR_PREFIX}: start returned no result`)
  return { taskRelPath, task }
}

/** finish 工具。 */
async function finishTaskTool(
  ctx: Context & TaskToolsServices,
  args: unknown,
  exec: unknown,
): Promise<unknown> {
  const cwd = requireCwd(exec)
  const agentId = (exec as ToolExec).agent?.id ?? ''
  const taskRelPath = resolveTaskRelPath(cwd, agentId, (args as Record<string, unknown>).taskPath)
  const [err] = await finishTask(cwd, {
    taskRelPath,
    contextKey: `${CONTEXT_KEY_PREFIX}_${agentId}`,
  })
  if (err) throw err
  return { taskRelPath, finished: true }
}

/** archive 工具。 */
async function archiveTaskTool(
  ctx: Context & TaskToolsServices,
  args: unknown,
  exec: unknown,
): Promise<unknown> {
  const typed = args as Record<string, unknown>
  const cwd = requireCwd(exec)
  const agentId = (exec as ToolExec).agent?.id ?? ''
  const taskRelPath = resolveTaskRelPath(cwd, agentId, typed.taskPath)
  const [err, task] = await archiveTask(cwd, {
    taskRelPath,
    ...(typeof typed.autoCommit === 'boolean' ? { autoCommit: typed.autoCommit } : {}),
  })
  if (err || task === null) throw err ?? new Error(`${ERR_PREFIX}: archive returned no result`)
  return {
    taskRelPath: task.taskRelPath,
    task,
    note: 'Task archived. When the session ends, run /workloom-finish to record the session journal.',
  }
}

/** list 工具。 */
async function listTasksTool(
  ctx: Context & TaskToolsServices,
  args: unknown,
  exec: unknown,
): Promise<unknown> {
  const typed = args as Record<string, unknown>
  const cwd = requireCwd(exec)
  const [err, list] = listTasks(cwd, {
    ...(typeof typed.status === 'string' && typed.status !== '' ? { status: typed.status } : {}),
  })
  if (err || list === null) throw err ?? new Error(`${ERR_PREFIX}: list returned no result`)
  return { tasks: list }
}

/** 渲染任务工具结果（结构化摘要文本）。 */
function renderTask(_args: unknown, value: unknown): TextBlockLike[] {
  const text = JSON.stringify(value)
  return [{ type: 'text', text }]
}
