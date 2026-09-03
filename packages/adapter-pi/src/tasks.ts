/**
 * adapter-pi 的任务管理工具注册（薄投影层，registerTool）。
 *
 * 设计意图：
 * - 六个工具的编排（cwd 校验、taskPath 解析、core 调用、兜底报错）已下沉
 *   core task-ops，本文件只做宿主投影：从 ExtensionContext 取 cwd 与会话 id
 *   组装 contextKey，返回 {content: 文本, details: 结构化值}；
 * - 工具名/描述/参数描述/错误前缀改引 core surface 常量，与 core 逐字一致；
 * - 失败直接 throw（Pi 工具管线按失败处理）。
 */

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import { Type, type Static } from 'typebox'

import {
  ERR_PREFIX,
  executeAlignTask,
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
  TOOL_SNIPPETS,
} from '@workloom-ai/core'

import { contextKeyOf } from './constants.ts'

/** create 工具参数 schema。 */
const TASK_CREATE_PARAMS = Type.Object({
  title: Type.String({ description: PARAM_DESCRIPTIONS.title }),
  slug: Type.Optional(Type.String({ description: PARAM_DESCRIPTIONS.slug })),
  priority: Type.Optional(Type.String({ description: PARAM_DESCRIPTIONS.priority })),
  description: Type.Optional(Type.String({ description: PARAM_DESCRIPTIONS.description })),
  parent: Type.Optional(Type.String({ description: PARAM_DESCRIPTIONS.parent })),
})

/** finish 工具参数 schema（仅可选 taskPath）。 */
const TASK_PATH_PARAMS = Type.Object({
  taskPath: Type.Optional(Type.String({ description: PARAM_DESCRIPTIONS.taskPath })),
})

/** start 工具参数 schema（taskPath + force/reason 门禁豁免）。 */
const TASK_START_PARAMS = Type.Object({
  taskPath: Type.Optional(Type.String({ description: PARAM_DESCRIPTIONS.taskPath })),
  force: Type.Optional(Type.Boolean({ description: PARAM_DESCRIPTIONS.force })),
  reason: Type.Optional(Type.String({ description: PARAM_DESCRIPTIONS.reason })),
})

/** check 工具参数 schema（summary 为 2.2 通过摘要）。 */
const TASK_CHECK_PARAMS = Type.Object({
  summary: Type.Optional(Type.String({ description: PARAM_DESCRIPTIONS.summary })),
  taskPath: Type.Optional(Type.String({ description: PARAM_DESCRIPTIONS.taskPath })),
  force: Type.Optional(Type.Boolean({ description: PARAM_DESCRIPTIONS.force })),
  reason: Type.Optional(Type.String({ description: PARAM_DESCRIPTIONS.reason })),
})

/** align 工具参数 schema（action 必填 review/confirm；confirm 需 expectedPrdHash + summary）。 */
const TASK_ALIGN_PARAMS = Type.Object({
  action: Type.Union([Type.Literal('review'), Type.Literal('confirm')], {
    description: PARAM_DESCRIPTIONS.action,
  }),
  taskPath: Type.Optional(Type.String({ description: PARAM_DESCRIPTIONS.taskPath })),
  expectedPrdHash: Type.Optional(
    Type.String({ description: PARAM_DESCRIPTIONS.expectedPrdHash }),
  ),
  summary: Type.Optional(Type.String({ description: PARAM_DESCRIPTIONS.alignmentSummary })),
})

/** archive 工具参数 schema（taskPath + autoCommit + force/reason 门禁豁免）。 */
const TASK_ARCHIVE_PARAMS = Type.Object({
  taskPath: Type.Optional(Type.String({ description: PARAM_DESCRIPTIONS.taskPath })),
  autoCommit: Type.Optional(Type.Boolean({ description: PARAM_DESCRIPTIONS.autoCommit })),
  force: Type.Optional(Type.Boolean({ description: PARAM_DESCRIPTIONS.force })),
  reason: Type.Optional(Type.String({ description: PARAM_DESCRIPTIONS.reason })),
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
 * 注册六个任务管理工具（create/start/check/finish/archive/list）。
 * @param pi Extension API
 */
export function registerTaskTools(pi: ExtensionAPI): void {
  pi.registerTool({
    name: TOOL_NAMES.taskCreate,
    label: 'Workloom Task Create',
    description: TOOL_DESCRIPTIONS.taskCreate,
    promptSnippet: TOOL_SNIPPETS.taskCreate,
    parameters: TASK_CREATE_PARAMS,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      return executeCreate(ctx, params)
    },
  })
  pi.registerTool({
    name: TOOL_NAMES.taskStart,
    label: 'Workloom Task Start',
    description: TOOL_DESCRIPTIONS.taskStart,
    promptSnippet: TOOL_SNIPPETS.taskStart,
    parameters: TASK_START_PARAMS,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      return executeStart(ctx, params)
    },
  })
  pi.registerTool({
    name: TOOL_NAMES.taskCheck,
    label: 'Workloom Task Check',
    description: TOOL_DESCRIPTIONS.taskCheck,
    promptSnippet: TOOL_SNIPPETS.taskCheck,
    parameters: TASK_CHECK_PARAMS,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      return executeCheck(ctx, params)
    },
  })
  pi.registerTool({
    name: TOOL_NAMES.taskAlign,
    label: 'Workloom Task Align',
    description: TOOL_DESCRIPTIONS.taskAlign,
    promptSnippet: TOOL_SNIPPETS.taskAlign,
    parameters: TASK_ALIGN_PARAMS,
    // 主会话专用（R10）：Pi 的 child pi 以 --no-extensions spawn，工具天然不可达；
    // 主会话经 review/confirm 两步与用户确认，本注册面无需额外深度检查。
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      return executeAlign(ctx, params)
    },
  })
  pi.registerTool({
    name: TOOL_NAMES.taskFinish,
    label: 'Workloom Task Finish',
    description: TOOL_DESCRIPTIONS.taskFinish,
    promptSnippet: TOOL_SNIPPETS.taskFinish,
    parameters: TASK_PATH_PARAMS,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      return executeFinish(ctx, params.taskPath)
    },
  })
  pi.registerTool({
    name: TOOL_NAMES.taskArchive,
    label: 'Workloom Task Archive',
    description: TOOL_DESCRIPTIONS.taskArchive,
    promptSnippet: TOOL_SNIPPETS.taskArchive,
    parameters: TASK_ARCHIVE_PARAMS,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      return executeArchive(ctx, params)
    },
  })
  pi.registerTool({
    name: TOOL_NAMES.taskList,
    label: 'Workloom Task List',
    description: TOOL_DESCRIPTIONS.taskList,
    promptSnippet: TOOL_SNIPPETS.taskList,
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
      parent: params.parent,
    },
  )
  if (err !== null || result === null)
    throw err ?? new Error(`${ERR_PREFIX.taskTool}: create returned no result`)
  // nextStepNote 透传（core 附 Phase 1.1 行动指引，渲染自动带出）。
  return resultOf({
    taskRelPath: result.taskRelPath,
    task: result.task,
    nextStepNote: result.nextStepNote,
  })
}

/** start 工具：把任务从 planning 移到 in_progress。 */
async function executeStart(
  ctx: ToolContextLike,
  params: Static<typeof TASK_START_PARAMS>,
): Promise<{ content: [{ type: 'text'; text: string }]; details: unknown }> {
  const cwd = requireWorkloomCwd(ctx.cwd)
  const [err, task] = await executeStartTask(cwd, contextKeyOf(ctx.sessionManager.getSessionId()), {
    taskPath: params.taskPath,
    force: params.force,
    reason: params.reason,
  })
  if (err !== null || task === null)
    throw err ?? new Error(`${ERR_PREFIX.taskTool}: start returned no result`)
  return resultOf({ taskRelPath: task.taskRelPath, task })
}

/** check 工具：记录 2.2 check 通过凭据。 */
async function executeCheck(
  ctx: ToolContextLike,
  params: Static<typeof TASK_CHECK_PARAMS>,
): Promise<{ content: [{ type: 'text'; text: string }]; details: unknown }> {
  const cwd = requireWorkloomCwd(ctx.cwd)
  const [err, task] = await executeCheckTask(cwd, contextKeyOf(ctx.sessionManager.getSessionId()), {
    summary: params.summary,
    taskPath: params.taskPath,
    force: params.force,
    reason: params.reason,
  })
  if (err !== null || task === null)
    throw err ?? new Error(`${ERR_PREFIX.taskTool}: check returned no result`)
  return resultOf({ taskRelPath: task.taskRelPath, task })
}

/** align 工具：Phase 1.1 review/confirm（编排同步下沉 core）。 */
async function executeAlign(
  ctx: ToolContextLike,
  params: Static<typeof TASK_ALIGN_PARAMS>,
): Promise<{ content: [{ type: 'text'; text: string }]; details: unknown }> {
  const cwd = requireWorkloomCwd(ctx.cwd)
  const [err, result] = executeAlignTask(cwd, contextKeyOf(ctx.sessionManager.getSessionId()), {
    action: params.action,
    taskPath: params.taskPath,
    expectedPrdHash: params.expectedPrdHash,
    summary: params.summary,
  })
  if (err !== null || result === null)
    throw err ?? new Error(`${ERR_PREFIX.taskTool}: align returned no result`)
  return resultOf(result)
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
  params: Static<typeof TASK_ARCHIVE_PARAMS>,
): Promise<{ content: [{ type: 'text'; text: string }]; details: unknown }> {
  const cwd = requireWorkloomCwd(ctx.cwd)
  const [err, result] = await executeArchiveTask(
    cwd,
    contextKeyOf(ctx.sessionManager.getSessionId()),
    {
      taskPath: params.taskPath,
      autoCommit: params.autoCommit,
      force: params.force,
      reason: params.reason,
    },
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
