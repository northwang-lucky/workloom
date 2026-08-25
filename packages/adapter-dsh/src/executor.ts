/**
 * adapter-dsh 的 executor 工具：把 workloom 任务上下文组装成子代理首条 prompt 并前台派发。
 *
 * 设计意图：
 * - 暴露一个模型可见工具 workloom_execute：按 kind（research/implement/check）用
 *   core 的 buildExecutorPrompt 组装上下文，经 ctx.subagents.startContinuable
 *   （spawn，in-process）前台派发子代理，回合结束取最终输出返回；
 * - effort 走 PoC P1 通道：子代理建立后（inbox 已收 prompt、回合未开始）经
 *   session.append('request/header', {reason: 'change'}) 写入含 reasoningEffort
 *   的 header，验证 selection 折叠链下一次请求即生效；
 * - 工具依赖的 tools/subagents/agents 服务按注册面做局部结构化声明
 *   （参考 plugin.ts 的 SystemPromptService 做法），运行时由宿主注入；
 * - 子代理释放失败只 WARNING 不阻塞结果返回；其余故障 fail loud（抛错由
 *   DSH 工具管线转失败结果）。
 */

import type { Context } from '@deepseek-ai/cordis'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { finalAssistantOutput } from '@deepseek-ai/dsh-subagent'

import {
  assertEffort,
  buildExecutorPrompt,
  findWorkloomRoot,
  resolveActiveTask,
} from '@workloom/core'

import { CONTEXT_KEY_PREFIX } from './constants.js'

/** 工具名常量（模型可见）。 */
export const EXECUTOR_TOOL = 'workloom_execute'

/** spawn provider 名（DSH in-process 子代理提供方，continuable 能力齐备）。 */
const SPAWN_PROVIDER = 'spawn'

/** 错误消息前缀（运行时文案英文）。 */
const ERR_PREFIX = 'workloom executor'

/** 子代理无文本输出时的返回提示（运行时文案英文）。 */
const EMPTY_OUTPUT_TEXT = 'The executor subagent produced no text output.'

/** 释放子代理失败告警前缀（运行时文案英文）。 */
const DRAIN_WARN_PREFIX = `${ERR_PREFIX}: WARNING: failed to release continuable child:`

/** effort 写入失败告警前缀（effort 是可选增强，失败不阻塞执行）。 */
const EFFORT_WARN_PREFIX = `${ERR_PREFIX}: WARNING: effort header not written:`

/** 纯文本块最小形状（render 与返回值共用）。 */
interface TextBlockLike {
  type: 'text'
  text: string
}

/** 工具参数最小形状（execute 入参）。 */
interface ExecutorArgs {
  kind: string
  taskPath?: string
  model?: string
  effort?: string
  prompt: string
}

/** 工具执行上下文最小形状（exec 参数，仅消费 agent 与 signal）。 */
interface ToolExec {
  [k: string]: unknown
  agent?: MinimalAgent
  signal: AbortSignal
}

/** agent 会话的最小形状（读 cwd/事件/折叠请求头、写 request/header）。 */
interface MinimalAgent {
  id: string
  whenIdle(): Promise<void>
  options: {
    provider?: string
    model?: string
  }
  session: {
    header: { cwd?: string }
    events: readonly SessionEvent[]
    requestHeader(): { config: Record<string, unknown> } | undefined
    append(
      type: 'request/header',
      data: {
        header: { config: Record<string, unknown> }
        reason: 'initial' | 'resume' | 'change'
      },
    ): unknown
  }
}

/** tools 服务的最小接口（register 即可）。 */
interface ToolsService {
  register(definition: MinimalToolDefinition): () => void
}

/** subagents 服务的最小接口（前台派发 + 释放子代理）。 */
interface SubagentsService {
  startContinuable(spec: {
    provider: string
    label: string
    request: {
      prompt: TextBlockLike[]
      parent: MinimalAgent
      agentOptions?: { model?: string }
      maxDepth?: number
    }
    signal: AbortSignal
  }): Promise<{ childId: string }>
  drainContinuableChildren(parent: MinimalAgent, childIds: readonly string[]): Promise<void>
}

/** agents 服务的最小接口（按 id 取子代理）。 */
interface AgentsService {
  get(id: string): MinimalAgent | undefined
}

/** 工具定义的最小形状（与 DSH 工具注册面兼容的子集）。 */
interface MinimalToolDefinition {
  name: string
  description: string
  parameters: Record<string, unknown>
  output: {
    schema: { type: 'object' }
    render(args: unknown, value: unknown): TextBlockLike[]
  }
  isConcurrencySafe(): boolean
  execute(args: unknown, exec: unknown): Promise<unknown>
}

/** executor 依赖的服务注入面（运行时由宿主注入）。 */
export interface ExecutorServices {
  tools: ToolsService
  subagents: SubagentsService
  agents: AgentsService
}

/** 工具成功返回的 canonical 值形状。 */
interface ExecutorValue {
  kind: 'foreground'
  runId: string
  output: TextBlockLike[]
}

/**
 * 注册 workloom_execute 工具（register 自绑定 fiber 生命周期，插件卸载自动注销）。
 * @param ctx 插件上下文（tools/subagents/agents 由宿主注入）
 */
export function registerExecutor(ctx: Context & ExecutorServices): void {
  const { tools } = ctx
  tools.register({
    name: EXECUTOR_TOOL,
    description:
      'Dispatch a workloom executor subagent (research/implement/check) with the task context inlined',
    parameters: {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          description: 'Executor role: research, implement, or check',
        },
        taskPath: {
          type: 'string',
          description:
            'Task directory relative to .workloom; defaults to the active task of this session',
        },
        model: {
          type: 'string',
          description: 'Model id for the executor subagent; defaults to the parent session model',
        },
        effort: {
          type: 'string',
          description: 'Reasoning effort: low/medium/high/xhigh/max',
        },
        prompt: {
          type: 'string',
          description: 'Task instructions for the executor subagent',
        },
      },
      required: ['kind', 'prompt'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object' },
      render: (_args, value) => [renderOutput(value)],
    },
    isConcurrencySafe: () => true,
    execute: (args, exec: unknown) => executeTool(ctx, args, exec as ToolExec),
  })
}

/**
 * 前台派发 executor 子代理并返回其输出。
 * @param ctx 插件上下文（含 subagents/agents 服务）
 * @param args 工具参数
 * @param exec 工具执行上下文（发起 agent 与取消信号）
 * @returns canonical 结果 {kind, runId, output}
 */
async function executeTool(
  ctx: Context & ExecutorServices,
  args: unknown,
  exec: ToolExec,
): Promise<ExecutorValue> {
  const params = args as ExecutorArgs
  const parent = exec.agent
  if (parent === undefined) {
    throw new Error(`${ERR_PREFIX}: tool call has no owning agent`)
  }
  const cwd = parent.session.header.cwd
  if (cwd === undefined || cwd === '') {
    throw new Error(`${ERR_PREFIX}: cannot determine the working directory of this session`)
  }
  const found = findWorkloomRoot(cwd)
  if (found === null) {
    throw new Error(`${ERR_PREFIX}: no .workloom directory found (searched up from ${cwd})`)
  }
  const root = found.root
  if (params.effort !== undefined) assertEffort(params.effort)
  const taskRelPath = resolveTaskRelPath(root, parent, params)
  const [promptErr, built] = buildExecutorPrompt({
    root,
    taskRelPath,
    kind: params.kind,
    userPrompt: params.prompt,
  })
  if (promptErr || built === null) {
    throw promptErr ?? new Error(`${ERR_PREFIX}: prompt assembly returned no result`)
  }
  const agentOptions = params.model === undefined ? undefined : { model: params.model }
  const subagents = ctx.subagents
  const { childId } = await subagents.startContinuable({
    provider: SPAWN_PROVIDER,
    label: `workloom ${params.kind}`,
    // maxDepth 是子代理自身深度的绝对上限：顶层派发的子代理深度为 1，
    // 设 1 恰好放行本次派发；executor（深度 1）再派发时深度 2 > 1 被拒，
    // 即「executor 子代理禁止再派发 workloom_execute」。
    request: { prompt: [{ type: 'text', text: built.text }], parent, agentOptions, maxDepth: 1 },
    signal: exec.signal,
  })
  // 子代理在 inbox 收 prompt 后即返回，回合尚未开始：这是写 request/header 的窗口。
  const child = ctx.agents.get(childId)
  if (child === undefined) {
    throw new Error(
      `${ERR_PREFIX}: effort channel failed: child agent ${childId} is not resolvable`,
    )
  }
  // 输出边界：只取子代理自身产出的事件（排除继承的父历史种子前缀）。
  const boundary = child.session.events.length
  if (params.effort !== undefined) {
    const headerErr = writeEffortHeader(child, parent, params)
    if (headerErr !== null) {
      console.warn(`${EFFORT_WARN_PREFIX} ${headerErr}`)
    }
  }
  await child.whenIdle()
  const blocks = finalAssistantOutput(child.session.events.slice(boundary)) ?? []
  const text = blocks
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
  try {
    await subagents.drainContinuableChildren(parent, [childId])
  } catch (error) {
    // 释放失败不阻塞结果返回：子代理已 idle，仅告警记录。
    console.warn(`${DRAIN_WARN_PREFIX} ${String(error)}`)
  }
  return {
    kind: 'foreground',
    runId: childId,
    output: [{ type: 'text', text: text === '' ? EMPTY_OUTPUT_TEXT : text }],
  }
}

/**
 * 解析任务相对路径：优先 taskPath 参数，缺省取当前会话活跃任务。
 * @param root 项目根
 * @param parent 发起 agent
 * @param params 工具参数
 * @returns 任务目录相对 .workloom 的路径
 */
function resolveTaskRelPath(root: string, parent: MinimalAgent, params: ExecutorArgs): string {
  if (params.taskPath !== undefined) return params.taskPath
  const contextKey = `${CONTEXT_KEY_PREFIX}_${parent.id}`
  const [ptrErr, active] = resolveActiveTask(root, contextKey)
  if (ptrErr) throw ptrErr
  if (active === null) {
    throw new Error(`${ERR_PREFIX}: no active task and no taskPath given`)
  }
  return active
}

/**
 * 从 canonical 值投影模型可见文本（纯函数，仅提取 output 首块文本）。
 * @param value canonical 结果
 * @returns 文本块
 */
function renderOutput(value: unknown): TextBlockLike {
  const result = value as { output?: readonly { text?: string }[] }
  const text = result.output?.[0]?.text ?? ''
  return { type: 'text', text }
}

/**
 * 写入 effort header（PoC P1 通道）。
 * request/header 是整体替换折叠：必须保留完整 LlmCallConfig（provider/model 必填），
 * 只改 reasoningEffort；从子代理现有折叠头或父 agent 的 options 补齐必填字段。
 * @param child 子代理
 * @param parent 发起 agent
 * @param params 工具参数（model/effort）
 * @returns 失败原因文案（effort 失效），成功返回 null
 */
function writeEffortHeader(
  child: MinimalAgent,
  parent: MinimalAgent,
  params: ExecutorArgs,
): string | null {
  const existing = child.session.requestHeader()?.config
  const provider = existing?.provider ?? parent.options.provider
  const model = existing?.model ?? parent.options.model
  if (provider === undefined || model === undefined) {
    return 'cannot resolve provider/model for the child agent'
  }
  child.session.append('request/header', {
    header: {
      config: {
        ...existing,
        provider,
        model,
        reasoningEffort: params.effort,
      },
    },
    reason: 'change',
  })
  return null
}
