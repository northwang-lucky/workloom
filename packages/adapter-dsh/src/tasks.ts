/**
 * adapter-dsh 的任务管理工具注册（薄投影层）：把 core task-ops 的任务生命周期
 * 暴露为模型可调工具；参数一律标准 JSON Schema（宿主原样转发 API）。
 *
 * 设计意图：
 * - 六个工具的编排（cwd 校验、taskPath 解析、core 调用、兜底报错）已下沉
 *   core task-ops，本文件只做宿主投影：从执行上下文提取 cwd/agentId 组装
 *   contextKey，把工具返回投影为 plain object；
 * - 工具名/描述/参数描述/错误前缀改引 core surface 常量，与 core 逐字一致。
 */

import type { Context } from '@deepseek-ai/cordis'

import {
  ERR_PREFIX,
  executeArchiveTask,
  executeCheckTask,
  executeCreateTask,
  executeFinishTask,
  executeListTasks,
  executeStartTask,
  PARAM_DESCRIPTIONS,
  requireWorkloomCwd,
  TOOL_DESCRIPTIONS,
  TOOL_NAMES,
} from '@workloom-ai/core'

import { CONTEXT_KEY_PREFIX } from './constants.js'

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
 * 注册六个任务管理工具（create/start/check/finish/archive/list）。
 * @param ctx 插件作用域上下文
 */
export function registerTaskTools(ctx: Context & TaskToolsServices): void {
  const tools = ctx.tools

  tools.register({
    name: TOOL_NAMES.taskCreate,
    description: TOOL_DESCRIPTIONS.taskCreate,
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: PARAM_DESCRIPTIONS.title },
        slug: { type: 'string', description: PARAM_DESCRIPTIONS.slug },
        priority: { type: 'string', description: PARAM_DESCRIPTIONS.priority },
        description: { type: 'string', description: PARAM_DESCRIPTIONS.description },
        parent: { type: 'string', description: PARAM_DESCRIPTIONS.parent },
      },
      required: ['title'],
      additionalProperties: false,
    },
    output: { schema: { type: 'object', additionalProperties: true }, render: renderTask },
    isConcurrencySafe: () => true,
    execute: (args, exec) => createTaskTool(args, exec),
  })

  tools.register({
    name: TOOL_NAMES.taskStart,
    description: TOOL_DESCRIPTIONS.taskStart,
    parameters: {
      type: 'object',
      properties: {
        taskPath: { type: 'string', description: PARAM_DESCRIPTIONS.taskPath },
        force: { type: 'boolean', description: PARAM_DESCRIPTIONS.force },
        reason: { type: 'string', description: PARAM_DESCRIPTIONS.reason },
      },
      required: [],
      additionalProperties: false,
    },
    output: { schema: { type: 'object', additionalProperties: true }, render: renderTask },
    isConcurrencySafe: () => true,
    execute: (args, exec) => startTaskTool(args, exec),
  })

  tools.register({
    name: TOOL_NAMES.taskCheck,
    description: TOOL_DESCRIPTIONS.taskCheck,
    parameters: {
      type: 'object',
      properties: {
        // phase 缺省 check：grilling 判定/收敛调用不需要 summary，故 summary 不再必填。
        phase: {
          type: 'string',
          enum: ['check', 'grilling'],
          default: 'check',
          // 描述拼接 phaseGrilling：模型在 schema 中可见 grilling 判定/收敛两次调用的完整语义。
          description: `${PARAM_DESCRIPTIONS.phase}. ${PARAM_DESCRIPTIONS.phaseGrilling}`,
        },
        summary: { type: 'string', description: PARAM_DESCRIPTIONS.summary },
        required: { type: 'boolean', description: PARAM_DESCRIPTIONS.grillingRequired },
        taskPath: { type: 'string', description: PARAM_DESCRIPTIONS.taskPath },
        force: { type: 'boolean', description: PARAM_DESCRIPTIONS.force },
        reason: { type: 'string', description: PARAM_DESCRIPTIONS.reason },
      },
      required: [],
      additionalProperties: false,
    },
    output: { schema: { type: 'object', additionalProperties: true }, render: renderTask },
    isConcurrencySafe: () => true,
    execute: (args, exec) => checkTaskTool(args, exec),
  })

  tools.register({
    name: TOOL_NAMES.taskFinish,
    description: TOOL_DESCRIPTIONS.taskFinish,
    parameters: {
      type: 'object',
      properties: {
        taskPath: { type: 'string', description: PARAM_DESCRIPTIONS.taskPath },
      },
      required: [],
      additionalProperties: false,
    },
    output: { schema: { type: 'object', additionalProperties: true }, render: renderTask },
    isConcurrencySafe: () => true,
    execute: (args, exec) => finishTaskTool(args, exec),
  })

  tools.register({
    name: TOOL_NAMES.taskArchive,
    description: TOOL_DESCRIPTIONS.taskArchive,
    parameters: {
      type: 'object',
      properties: {
        taskPath: { type: 'string', description: PARAM_DESCRIPTIONS.taskPath },
        autoCommit: { type: 'boolean', description: PARAM_DESCRIPTIONS.autoCommit },
        force: { type: 'boolean', description: PARAM_DESCRIPTIONS.force },
        reason: { type: 'string', description: PARAM_DESCRIPTIONS.reason },
      },
      required: [],
      additionalProperties: false,
    },
    output: { schema: { type: 'object', additionalProperties: true }, render: renderTask },
    isConcurrencySafe: () => true,
    execute: (args, exec) => archiveTaskTool(args, exec),
  })

  tools.register({
    name: TOOL_NAMES.taskList,
    description: TOOL_DESCRIPTIONS.taskList,
    parameters: {
      type: 'object',
      properties: {
        status: { type: 'string', description: PARAM_DESCRIPTIONS.status },
      },
      required: [],
      additionalProperties: false,
    },
    output: { schema: { type: 'object', additionalProperties: true }, render: renderTask },
    isConcurrencySafe: () => true,
    execute: (args, exec) => listTasksTool(args, exec),
  })
}

/** 从执行上下文解析会话 cwd（空串抛错，消息前缀来自 core）。 */
function cwdOf(exec: unknown): string {
  return requireWorkloomCwd((exec as ToolExec).agent?.session.header.cwd ?? '')
}

/** 组装会话 contextKey（DSH 会话指针前缀约定）。 */
function contextKeyOf(exec: unknown): string {
  return `${CONTEXT_KEY_PREFIX}_${(exec as ToolExec).agent?.id ?? ''}`
}

/** 提取可选 taskPath 参数（非字符串按未指定处理）。 */
function taskPathOf(args: Record<string, unknown>): string | undefined {
  const value = args['taskPath']
  return typeof value === 'string' ? value : undefined
}

/** 提取可选布尔参数（非布尔按未指定处理）。 */
function boolOf(args: Record<string, unknown>, key: string): boolean | undefined {
  const value = args[key]
  return typeof value === 'boolean' ? value : undefined
}

/** 提取可选字符串参数（非字符串按未指定处理）。 */
function stringOf(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key]
  return typeof value === 'string' ? value : undefined
}

/** create 工具：创建任务并设为当前会话活跃任务（编排下沉 core）。 */
async function createTaskTool(args: unknown, exec: unknown): Promise<unknown> {
  const typed = args as Record<string, unknown>
  const cwd = cwdOf(exec)
  const [err, result] = await executeCreateTask(cwd, contextKeyOf(exec), {
    title: String(typed.title ?? ''),
    slug: typeof typed.slug === 'string' ? typed.slug : undefined,
    priority: typeof typed.priority === 'string' ? typed.priority : undefined,
    description: typeof typed.description === 'string' ? typed.description : undefined,
    parent: stringOf(typed, 'parent'),
  })
  if (err !== null || result === null) {
    throw err ?? new Error(`${ERR_PREFIX.taskTool}: create returned no result`)
  }
  // nextStepNote 透传（core 附 Phase 1.1 行动指引，render 自动带出）。
  return {
    taskRelPath: result.taskRelPath,
    task: result.task,
    nextStepNote: result.nextStepNote,
  }
}

/** start 工具：把任务从 planning 移到 in_progress。 */
async function startTaskTool(args: unknown, exec: unknown): Promise<unknown> {
  const typed = args as Record<string, unknown>
  const cwd = cwdOf(exec)
  const [err, task] = await executeStartTask(cwd, contextKeyOf(exec), {
    taskPath: taskPathOf(typed),
    force: boolOf(typed, 'force'),
    reason: stringOf(typed, 'reason'),
  })
  if (err !== null || task === null) {
    throw err ?? new Error(`${ERR_PREFIX.taskTool}: start returned no result`)
  }
  return { taskRelPath: task.taskRelPath, task }
}

/** check 工具：记录任务凭据（phase=check 写 2.2 check；phase=grilling 写判定/收敛）。 */
async function checkTaskTool(args: unknown, exec: unknown): Promise<unknown> {
  const typed = args as Record<string, unknown>
  const cwd = cwdOf(exec)
  const [err, task] = await executeCheckTask(cwd, contextKeyOf(exec), {
    phase: typed.phase === 'grilling' ? 'grilling' : undefined,
    required: boolOf(typed, 'required'),
    summary: typeof typed.summary === 'string' ? typed.summary : undefined,
    taskPath: taskPathOf(typed),
    force: boolOf(typed, 'force'),
    reason: stringOf(typed, 'reason'),
  })
  if (err !== null || task === null) {
    throw err ?? new Error(`${ERR_PREFIX.taskTool}: check returned no result`)
  }
  return { taskRelPath: task.taskRelPath, task }
}

/** finish 工具：清除会话活跃任务指针（状态不变）。 */
async function finishTaskTool(args: unknown, exec: unknown): Promise<unknown> {
  const typed = args as Record<string, unknown>
  const cwd = cwdOf(exec)
  const [err, result] = await executeFinishTask(cwd, contextKeyOf(exec), taskPathOf(typed))
  if (err !== null || result === null) {
    throw err ?? new Error(`${ERR_PREFIX.taskTool}: finish returned no result`)
  }
  return result
}

/** archive 工具：归档任务（completed + 移入 archive/，可选 git 自动提交）。 */
async function archiveTaskTool(args: unknown, exec: unknown): Promise<unknown> {
  const typed = args as Record<string, unknown>
  const cwd = cwdOf(exec)
  const [err, result] = await executeArchiveTask(cwd, contextKeyOf(exec), {
    taskPath: taskPathOf(typed),
    autoCommit: boolOf(typed, 'autoCommit'),
    force: boolOf(typed, 'force'),
    reason: stringOf(typed, 'reason'),
  })
  if (err !== null || result === null) {
    throw err ?? new Error(`${ERR_PREFIX.taskTool}: archive returned no result`)
  }
  return result
}

/** list 工具：列出任务摘要（可选 status 过滤）。 */
async function listTasksTool(args: unknown, exec: unknown): Promise<unknown> {
  const typed = args as Record<string, unknown>
  const cwd = cwdOf(exec)
  const [err, result] = await executeListTasks(
    cwd,
    typeof typed.status === 'string' ? typed.status : undefined,
  )
  if (err !== null || result === null) {
    throw err ?? new Error(`${ERR_PREFIX.taskTool}: list returned no result`)
  }
  return result
}

/** 渲染任务工具结果（结构化摘要文本）。 */
function renderTask(_args: unknown, value: unknown): TextBlockLike[] {
  const text = JSON.stringify(value)
  return [{ type: 'text', text }]
}
