/**
 * adapter-pi 的任务管理工具注册（薄投影层，registerTool）。
 *
 * 设计意图：
 * - 五个工具的编排（cwd 校验、taskPath 解析、core 调用、兜底报错）已下沉
 *   core task-ops，本文件只做宿主投影：从 ExtensionContext 取 cwd 与会话 id
 *   组装 contextKey，返回 {content: 文本, details: 结构化值}；
 * - 工具名/描述/参数描述/错误前缀改引 core surface 常量，与下沉前逐字一致；
 * - 失败直接 throw（Pi 工具管线按失败处理）。
 */

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import { Type, type Static } from 'typebox'

import {
  ERR_PREFIX,
  executeArchiveTask,
  executeCreateTask,
  executeFinishTask,
  executeListTasks,
  executeStartTask,
  PARAM_DESCRIPTIONS,
  requireWorkloomCwd,
  TOOL_DESCRIPTIONS,
  TOOL_NAMES,
} from '@workloom/core'

import { contextKeyOf } from './constants.ts'

/** create 工具参数 schema。 */
const TASK_CREATE_PARAMS = Type.Object({
  title: Type.String({ description: PARAM_DESCRIPTIONS.title }),
  slug: Type.Optional(Type.String({ description: PARAM_DESCRIPTIONS.slug })),
  priority: Type.Optional(Type.String({ description: PARAM_DESCRIPTIONS.priority })),
  description: Type.Optional(Type.String({ description: PARAM_DESCRIPTIONS.description })),
})

/** start/finish 工具参数 schema（仅可选 taskPath）。 */
const TASK_PATH_PARAMS = Type.Object({
  taskPath: Type.Optional(Type.String({ description: PARAM_DESCRIPTIONS.taskPath })),
})

/** archive 工具参数 schema（taskPath + autoCommit）。 */
const TASK_ARCHIVE_PARAMS = Type.Object({
  taskPath: Type.Optional(Type.String({ description: PARAM_DESCRIPTIONS.taskPath })),
  autoCommit: Type.Optional(Type.Boolean({ description: PARAM_DESCRIPTIONS.autoCommit })),
})

/** list 工具参数 schema（可选 status 过滤）。 */
const TASK_LIST_PARAMS = Type.Object({
  status: Type.Optional(Type.String({ description: PARAM_DESCRIPTIONS.status })),
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
    name: TOOL_NAMES.taskCreate,
    label: 'Workloom Task Create',
    description: TOOL_DESCRIPTIONS.taskCreate,
    parameters: TASK_CREATE_PARAMS,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      return executeCreate(ctx, params)
    },
  })
  pi.registerTool({
    name: TOOL_NAMES.taskStart,
    label: 'Workloom Task Start',
    description: TOOL_DESCRIPTIONS.taskStart,
    parameters: TASK_PATH_PARAMS,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      return executeStart(ctx, params.taskPath)
    },
  })
  pi.registerTool({
    name: TOOL_NAMES.taskFinish,
    label: 'Workloom Task Finish',
    description: TOOL_DESCRIPTIONS.taskFinish,
    parameters: TASK_PATH_PARAMS,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      return executeFinish(ctx, params.taskPath)
    },
  })
  pi.registerTool({
    name: TOOL_NAMES.taskArchive,
    label: 'Workloom Task Archive',
    description: TOOL_DESCRIPTIONS.taskArchive,
    parameters: TASK_ARCHIVE_PARAMS,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      return executeArchive(ctx, params.taskPath, params.autoCommit)
    },
  })
  pi.registerTool({
    name: TOOL_NAMES.taskList,
    label: 'Workloom Task List',
    description: TOOL_DESCRIPTIONS.taskList,
    parameters: TASK_LIST_PARAMS,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      return executeList(ctx, params.status)
    },
  })
}

/** 组装工具成功结果（文本 + 结构化 details）。 */
function resultOf(value: unknown): {
  content: [{ type: 'text'; text: string }]
  details: unknown
} {
  return { content: [{ type: 'text', text: JSON.stringify(value) }], details: value }
}

/** create 工具：创建任务并设为当前会话活跃任务（编排下沉 core）。 */
async function executeCreate(
  ctx: ToolContextLike,
  params: Static<typeof TASK_CREATE_PARAMS>,
): Promise<{ content: [{ type: 'text'; text: string }]; details: unknown }> {
  const cwd = requireWorkloomCwd(ctx.cwd)
  const [err, result] = await executeCreateTask(
    cwd,
    contextKeyOf(ctx.sessionManager.getSessionId()),
    {
      title: params.title,
      slug: params.slug,
      priority: params.priority,
      description: params.description,
    },
  )
  if (err !== null || result === null)
    throw err ?? new Error(`${ERR_PREFIX.taskTool}: create returned no result`)
  return resultOf({ taskRelPath: result.taskRelPath, task: result.task })
}

/** start 工具：把任务从 planning 移到 in_progress。 */
async function executeStart(
  ctx: ToolContextLike,
  taskPath: string | undefined,
): Promise<{ content: [{ type: 'text'; text: string }]; details: unknown }> {
  const cwd = requireWorkloomCwd(ctx.cwd)
  const [err, task] = await executeStartTask(
    cwd,
    contextKeyOf(ctx.sessionManager.getSessionId()),
    taskPath,
  )
  if (err !== null || task === null)
    throw err ?? new Error(`${ERR_PREFIX.taskTool}: start returned no result`)
  return resultOf({ taskRelPath: task.taskRelPath, task })
}

/** finish 工具：清除会话活跃任务指针（状态不变）。 */
async function executeFinish(
  ctx: ToolContextLike,
  taskPath: string | undefined,
): Promise<{ content: [{ type: 'text'; text: string }]; details: unknown }> {
  const cwd = requireWorkloomCwd(ctx.cwd)
  const [err, result] = await executeFinishTask(
    cwd,
    contextKeyOf(ctx.sessionManager.getSessionId()),
    taskPath,
  )
  if (err !== null || result === null)
    throw err ?? new Error(`${ERR_PREFIX.taskTool}: finish returned no result`)
  return resultOf(result)
}

/** archive 工具：归档任务（completed + 移入 archive/，可选 git 自动提交）。 */
async function executeArchive(
  ctx: ToolContextLike,
  taskPath: string | undefined,
  autoCommit: boolean | undefined,
): Promise<{ content: [{ type: 'text'; text: string }]; details: unknown }> {
  const cwd = requireWorkloomCwd(ctx.cwd)
  const [err, result] = await executeArchiveTask(
    cwd,
    contextKeyOf(ctx.sessionManager.getSessionId()),
    taskPath,
    autoCommit,
  )
  if (err !== null || result === null)
    throw err ?? new Error(`${ERR_PREFIX.taskTool}: archive returned no result`)
  return resultOf(result)
}

/** list 工具：列出任务摘要（可选 status 过滤）。 */
async function executeList(
  ctx: ToolContextLike,
  status: string | undefined,
): Promise<{ content: [{ type: 'text'; text: string }]; details: unknown }> {
  const cwd = requireWorkloomCwd(ctx.cwd)
  const [err, result] = await executeListTasks(cwd, status)
  if (err !== null || result === null)
    throw err ?? new Error(`${ERR_PREFIX.taskTool}: list returned no result`)
  return resultOf(result)
}
