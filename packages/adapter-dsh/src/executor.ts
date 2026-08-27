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
 * - 子会话标题语义化：label 为 `[<KindLabel>] <title>`（title 是 main 会话传入的
 *   语义部分且 schema 必填非空，executor 只组装前缀；回退仅作纯函数防御，
 *   仍缺失/空白回退 task title，再退 workloom-<kind>），title 完整不截断（截断
 *   交给 UI），便于会话列表一眼分辨派发角色与任务；
 * - 冲突中断：显式 model/effort 与 subagents 配置不一致时，无 force 直接返回
 *   buildConflictNotice 提示文本不派发；force: true 须带非空 reason 留痕（写入
 *   task.json overrides），放行后 receipt 追加 (forced) 标注便于审计；
 * - 返回文本尾部追加 receipt 行，标注生效 model/effort 及来源，使配置未生效一眼可辨。
 */
import type { Context } from '@deepseek-ai/cordis'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { finalAssistantOutput } from '@deepseek-ai/dsh-subagent'

import {
  assertEffort,
  assertForceReason,
  buildConflictNotice,
  buildExecutorPrompt,
  buildExecutorReceipt,
  detectExecutorConflicts,
  EMPTY_OUTPUT_TEXT,
  ERR_PREFIX,
  findWorkloomRoot,
  loadConfig,
  PARAM_DESCRIPTIONS,
  readTask,
  recordExecutorOverride,
  resolveSubagentDefaults,
  resolveTaskRelPath,
  splitProviderModel,
  TOOL_DESCRIPTIONS,
  TOOL_NAMES,
} from '@workloom-ai/core'

import { CONTEXT_KEY_PREFIX } from './constants.js'

/** spawn provider 名（DSH in-process 子代理提供方，continuable 能力齐备）。 */
const SPAWN_PROVIDER = 'spawn'

/** executor kind → 子会话标题展示标签（枚举，禁 Magic String）。 */
const KIND_LABELS = {
  research: 'Research',
  implement: 'Implement',
  check: 'Check',
} as const

/** KIND_LABELS 的键类型（assertKind 已保证 kind 合法，此处仅防御缺键）。 */
type KindLabelKey = keyof typeof KIND_LABELS

/** 冲突中断返回值的 runId（未派发子代理，无 run id 可用）。 */
const NO_CHILD_RUN_ID = ''

/** 覆盖审计记录失败告警前缀（记录失败不阻塞派发）。 */
const OVERRIDE_WARN_PREFIX = `${ERR_PREFIX.executor}: WARNING: failed to record executor override:`

/** 释放子代理失败告警前缀（运行时文案英文）。 */
const DRAIN_WARN_PREFIX = `${ERR_PREFIX.executor}: WARNING: failed to release continuable child:`

/** effort 写入失败告警前缀（effort 是可选增强，失败不阻塞执行）。 */
const EFFORT_WARN_PREFIX = `${ERR_PREFIX.executor}: WARNING: effort header not written:`

/** 纯文本块最小形状（render 与返回值共用）。 */
interface TextBlockLike {
  type: 'text'
  text: string
}

/** 工具参数最小形状（execute 入参；title 由 schema 保证必填非空）。 */
interface ExecutorArgs {
  kind: string
  taskPath?: string
  model?: string
  effort?: string
  force?: boolean
  reason?: string
  title: string
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
        force: {
          type: 'boolean',
          description: PARAM_DESCRIPTIONS.forceExecutor,
        },
        reason: {
          type: 'string',
          description: PARAM_DESCRIPTIONS.reasonExecutor,
        },
        title: {
          type: 'string',
          minLength: 1,
          description: PARAM_DESCRIPTIONS.titleExecutor,
        },
        prompt: {
          type: 'string',
          description: PARAM_DESCRIPTIONS.prompt,
        },
      },
      required: ['kind', 'prompt', 'title'],
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
  // 冲突检测：显式 model/effort 与 subagents 配置不一致时，无 force 返回提示
  // （不派发）；force 放行须带非空 reason 留痕，覆盖审计写入 task.json。
  const conflicts = detectExecutorConflicts(config, params.kind, {
    model: params.model,
    effort: params.effort,
  }, 'dsh')
  if (conflicts.length > 0 && params.force !== true) {
    return {
      kind: 'foreground',
      runId: NO_CHILD_RUN_ID,
      output: [{ type: 'text', text: buildConflictNotice(params.kind, conflicts) }],
    }
  }
  const forced = conflicts.length > 0
  if (forced) assertForceReason(params.force, params.reason)
  const contextKey = `${CONTEXT_KEY_PREFIX}_${parent.id}`
  const taskRelPath = resolveTaskRelPath(root, contextKey, params.taskPath, ERR_PREFIX.executor)
  // force 放行后记录覆盖审计（任务路径已解析；记录失败仅告警不阻塞派发）。
  if (forced) {
    const [overrideErr] = recordExecutorOverride(root, taskRelPath, params.reason)
    if (overrideErr !== null) {
      console.warn(`${OVERRIDE_WARN_PREFIX} ${overrideErr}`)
    }
  }
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
    label: buildChildLabel(root, taskRelPath, params.kind, params.title),
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
  // 返回文本尾部追加 receipt 行，标注生效 model/effort 及来源；
  // force 放行时追加 (forced) 标记，使覆盖派发在输出中一眼可辨。
  const receiptBase = buildExecutorReceipt({
    model: effective.model,
    modelSource: effective.sources.model,
    effort: effective.effort,
    effortSource: effective.sources.effort,
  })
  const receipt = forced ? `${receiptBase} (forced)` : receiptBase
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
 * 组装子会话标题：`[<KindLabel>] <title>`（title 为语义部分、不含前缀；缺省回退
 * task title，仍缺失/空白时整体回退 `workloom-<kind>`；标题仅供展示，不因任务
 * 元数据异常阻塞派发）。
 * @param root 项目根
 * @param taskRelPath 任务目录相对 .workloom 的路径
 * @param kind executor 类型（research/implement/check）
 * @param title 模型传入的语义标题（schema 必填非空；可选类型仅作纯函数防御回退）
 * @returns 子会话标题
 */
function buildChildLabel(root: string, taskRelPath: string, kind: string, title?: string): string {
  const kindLabel = KIND_LABELS[kind as KindLabelKey]
  const semantic = title?.trim()
  if (kindLabel === undefined) {
    return `workloom-${kind}`
  }
  if (semantic !== undefined && semantic !== '') {
    return `[${kindLabel}] ${semantic}`
  }
  const [taskErr, task] = readTask(root, taskRelPath)
  const taskTitle = task?.title
  if (taskErr !== null || taskTitle === undefined || taskTitle.trim() === '') {
    return `workloom-${kind}`
  }
  return `[${kindLabel}] ${taskTitle}`
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
