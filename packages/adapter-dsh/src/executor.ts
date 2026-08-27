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
 *   DSH 工具管线转失败结果）；
 * - model/effort 未显式传入时回退到 .workloom/config.yaml 的 subagents 配置
 *   （按 executor kind 取值，字段独立合并），供用户配置默认派发参数；
 * - model 字符串支持 "provider/model" 前缀形式：拆分后 provider 一并传给子代理
 *   agentOptions，跨 provider 派发才不会报 UNKNOWN_MODEL；裸 id 按父 provider 解析；
 * - 返回文本尾部追加 receipt 行，标注生效 model/effort 及来源，使配置未生效一眼可辨。
 */
import type { Context } from '@deepseek-ai/cordis'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { finalAssistantOutput } from '@deepseek-ai/dsh-subagent'

import {
  assertEffort,
  buildExecutorPrompt,
  buildExecutorReceipt,
  EMPTY_OUTPUT_TEXT,
  ERR_PREFIX,
  findWorkloomRoot,
  loadConfig,
  PARAM_DESCRIPTIONS,
  resolveSubagentDefaults,
  resolveTaskRelPath,
  splitProviderModel,
  TOOL_DESCRIPTIONS,
  TOOL_NAMES,
} from '@workloom-ai/core'

import { CONTEXT_KEY_PREFIX } from './constants.js'

/** spawn provider 名（DSH in-process 子代理提供方，continuable 能力齐备）。 */
const SPAWN_PROVIDER = 'spawn'

/** 释放子代理失败告警前缀（运行时文案英文）。 */
const DRAIN_WARN_PREFIX = `${ERR_PREFIX.executor}: WARNING: failed to release continuable child:`

/** effort 写入失败告警前缀（effort 是可选增强，失败不阻塞执行）。 */
const EFFORT_WARN_PREFIX = `${ERR_PREFIX.executor}: WARNING: effort header not written:`

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
      agentOptions?: { provider?: string; model?: string }
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
    name: TOOL_NAMES.executor,
    description: TOOL_DESCRIPTIONS.executor,
    parameters: {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          description: PARAM_DESCRIPTIONS.kind,
        },
        taskPath: {
          type: 'string',
          description: PARAM_DESCRIPTIONS.taskPathExecutor,
        },
        model: {
          type: 'string',
          description: PARAM_DESCRIPTIONS.model,
        },
        effort: {
          type: 'string',
          description: PARAM_DESCRIPTIONS.effort,
        },
        prompt: {
          type: 'string',
          description: PARAM_DESCRIPTIONS.prompt,
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
    throw new Error(`${ERR_PREFIX.executor}: tool call has no owning agent`)
  }
  const cwd = parent.session.header.cwd
  if (cwd === undefined || cwd === '') {
    throw new Error(
      `${ERR_PREFIX.executor}: cannot determine the working directory of this session`,
    )
  }
  const found = findWorkloomRoot(cwd)
  if (found === null) {
    throw new Error(
      `${ERR_PREFIX.executor}: no .workloom directory found (searched up from ${cwd})`,
    )
  }
  const root = found.root
  // 合并子代理默认值：工具参数优先，未出现回退到 subagents 配置（字段独立合并）。
  const config = loadConfig(root)
  const effective = resolveSubagentDefaults(config, params.kind, {
    model: params.model,
    effort: params.effort,
  }, 'dsh')
  if (effective.effort !== undefined) assertEffort(effective.effort)
  const contextKey = `${CONTEXT_KEY_PREFIX}_${parent.id}`
  const taskRelPath = resolveTaskRelPath(root, contextKey, params.taskPath, ERR_PREFIX.executor)
  const [promptErr, built] = buildExecutorPrompt({
    root,
    taskRelPath,
    kind: params.kind,
    userPrompt: params.prompt,
  })
  if (promptErr || built === null) {
    throw promptErr ?? new Error(`${ERR_PREFIX.executor}: prompt assembly returned no result`)
  }
  // model 字符串支持 "provider/model" 前缀：拆分后 provider 一并传入 agentOptions，
  // 跨 provider 派发才不会报 UNKNOWN_MODEL；裸 id 无 provider，按父 provider 解析。
  const agentOptions = effective.model === undefined
    ? undefined
    : splitProviderModel(effective.model)
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
      `${ERR_PREFIX.executor}: effort channel failed: child agent ${childId} is not resolvable`,
    )
  }
  // 输出边界：只取子代理自身产出的事件（排除继承的父历史种子前缀）。
  const boundary = child.session.events.length
  if (effective.effort !== undefined) {
    const headerErr = writeEffortHeader(child, parent, effective.effort, agentOptions)
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
  // 返回文本尾部追加 receipt 行，标注生效 model/effort 及来源。
  const receipt = buildExecutorReceipt({
    model: effective.model,
    modelSource: effective.sources.model,
    effort: effective.effort,
    effortSource: effective.sources.effort,
  })
  // 空输出时 receipt 同样保留：可观测性不依赖子代理是否有文本产出（与 adapter-pi 对齐）。
  const baseText = text === '' ? EMPTY_OUTPUT_TEXT : text
  const outputText = `${baseText}\n\n${receipt}`
  return {
    kind: 'foreground',
    runId: childId,
    output: [{ type: 'text', text: outputText }],
  }
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
 * 只改 reasoningEffort；兜底链为「子代理既有 header → 本次派发生效值 → 父 options」，
 * 跨 provider 派发时不再错写父 provider/model。
 * @param child 子代理
 * @param parent 发起 agent
 * @param effort 合并后的 effort 档位（未指定时调用方不进入此函数）
 * @param effectiveOptions 本次派发生效的 provider/model（可能为 undefined）
 * @returns 失败原因文案（effort 失效），成功返回 null
 */
function writeEffortHeader(
  child: MinimalAgent,
  parent: MinimalAgent,
  effort: string | undefined,
  effectiveOptions: { provider?: string; model?: string } | undefined,
): string | null {
  const existing = child.session.requestHeader()?.config
  const provider = existing?.provider ?? effectiveOptions?.provider ?? parent.options.provider
  const model = existing?.model ?? effectiveOptions?.model ?? parent.options.model
  if (provider === undefined || model === undefined) {
    return 'cannot resolve provider/model for the child agent'
  }
  child.session.append('request/header', {
    header: {
      config: {
        ...existing,
        provider,
        model,
        reasoningEffort: effort,
      },
    },
    reason: 'change',
  })
  return null
}
