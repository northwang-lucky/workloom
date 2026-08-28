/**
 * adapter-dsh 的 executor 工具：把 workloom 任务上下文组装成子代理首条 prompt 并前台派发。
 *
 * 设计意图：
 * - 暴露一个模型可见工具 workloom_execute：按 kind（research/implement/check）用
 *   core 的 buildExecutorPrompt 组装上下文，经 ctx.subagents.start（spawn，
 *   in-process）前台派发一次性（one-shot）子代理，await run.result 取最终输出返回；
 * - one-shot 子代理是封闭的一次性记录：DSH 客户端对 mode=one-shot 渲染只读
 *   composer（“一次性任务不支持后续消息”），服务端 subagent.prompt 端点只接受
 *   continuable 子代理，用户无法对派发结果发送 follow-up 消息（双保险）；
 * - 工具依赖的 tools/subagents 服务按注册面做局部结构化声明（参考 plugin.ts 的
 *   SystemPromptService 做法），运行时由宿主注入；agents 服务不再需要（one-shot
 *   无创建后句柄，输出经 run.result 读取，runId 即 child session id）；
 * - 子代理释放失败（run.dispose）只 WARNING 不阻塞结果返回；其余故障 fail loud
 *   （抛错由 DSH 工具管线转失败结果）；
 * - model 未显式传入时回退到 .workloom/config.yaml 的 subagents 配置（按 executor
 *   kind 取值，字段独立合并），供用户配置默认派发参数；
 * - effort 通道已在 DSH 侧移除：工具 schema、冲突门与 receipt 均无 effort 维度
 *   （core 的共享解析仍返回 effort 字段，此处不读取；Pi 适配器经 --thinking 保留）；
 * - model 字符串支持 "provider/model" 前缀形式：拆分后 provider 一并传给子代理
 *   agentOptions，跨 provider 派发才不会报 UNKNOWN_MODEL；裸 id 按父 provider 解析；
 * - 子会话标题语义化：label 为 `[<KindLabel>] <title>`（title 是 main 会话传入的
 *   语义部分且 schema 必填非空，executor 只组装前缀；回退仅作纯函数防御，
 *   仍缺失/空白回退 task title，再退 workloom-<kind>），title 完整不截断（截断
 *   交给 UI），便于会话列表一眼分辨派发角色与任务；
 * - 冲突中断：显式 model 与 subagents 配置不一致时，无 force 直接返回
 *   buildConflictNotice 提示文本不派发；force: true 须带非空 reason 留痕（写入
 *   task.json overrides），放行后 receipt 追加 (forced) 标注便于审计；
 * - 异常终止：run.result.stopReason 非 completed 时以工具错误返回（文本为
 *   diagnostic，缺失用 stopReason 兜底），不附输出文本（避免把中止当成功消费）；
 * - 返回文本尾部追加 receipt 行，标注生效 model 及来源，使配置未生效一眼可辨。
 */
import type { Context } from '@deepseek-ai/cordis'

import {
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

/** spawn provider 名（DSH in-process 子代理提供方，one-shot start-time capability 齐备）。 */
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

/** 释放子代理运行失败告警前缀（运行时文案英文；释放失败不阻塞结果返回）。 */
const DISPOSE_WARN_PREFIX = `${ERR_PREFIX.executor}: WARNING: failed to dispose executor run:`

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

/** 发起 agent 的最小形状（one-shot 无子代理句柄，仅读 id 与 cwd）。 */
interface MinimalAgent {
  id: string
  session: {
    header: { cwd?: string }
  }
}

/** tools 服务的最小接口（register 即可）。 */
interface ToolsService {
  register(definition: MinimalToolDefinition): () => void
}

/** 一次性子代理运行的最小形状（读取结果与释放；@deepseek-ai/dsh-subagent 契约）。 */
interface SubagentRunLike {
  id: string
  result: Promise<{
    output: readonly TextBlockLike[]
    stopReason: string
    diagnostic?: string
  }>
  dispose(): Promise<void>
}

/** subagents 服务的最小接口（one-shot 前台派发）。 */
interface SubagentsService {
  start(
    name: string,
    request: {
      label?: string
      prompt: readonly TextBlockLike[]
      parent: MinimalAgent
      signal: AbortSignal
      agentOptions?: { provider?: string; model?: string }
      maxDepth?: number
    },
  ): Promise<SubagentRunLike>
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
}

/** 工具成功返回的 canonical 值形状。 */
interface ExecutorValue {
  kind: 'foreground'
  runId: string
  output: TextBlockLike[]
}

/**
 * 注册 workloom_execute 工具（register 自绑定 fiber 生命周期，插件卸载自动注销）。
 * @param ctx 插件上下文（tools/subagents 由宿主注入）
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
 * @param ctx 插件上下文（含 subagents 服务）
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
  // DSH 侧只消费 model 维度：effort 是 Pi 专属通道，此处不读取也不校验。
  const config = loadConfig(root)
  const effective = resolveSubagentDefaults(config, params.kind, { model: params.model }, 'dsh')
  // 冲突检测：显式 model 与 subagents 配置不一致时，无 force 返回提示（不派发）；
  // force 放行须带非空 reason 留痕，覆盖审计写入 task.json。
  const conflicts = detectExecutorConflicts(config, params.kind, { model: params.model }, 'dsh')
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
  // one-shot 派发（descriptor mode=one-shot）：客户端渲染只读 composer、服务端
  // 拒绝 follow-up；maxDepth 是子代理自身深度的绝对上限：顶层派发的子代理
  // 深度为 1，设 1 恰好放行本次派发；executor（深度 1）再派发时深度 2 > 1 被拒，
  // 即「executor 子代理禁止再派发 workloom_execute」。
  const run = await ctx.subagents.start(SPAWN_PROVIDER, {
    label: buildChildLabel(root, taskRelPath, params.kind, params.title),
    prompt: [{ type: 'text', text: built.text }],
    parent,
    signal: exec.signal,
    agentOptions,
    maxDepth: 1,
  })
  try {
    // run.result 对子代理级失败（模型/传输错误等）resolve 而非 reject，
    // 由 stopReason 表达原因；基础设施故障才 reject（fail loud 透传）。
    const result = await run.result
    if (result.stopReason !== 'completed') {
      // 异常终止：不附输出文本（避免把中止/失败当成功消费），错误文本用
      // diagnostic，缺失时用 stopReason 的兜底文案（前缀与其余工具错误一致）。
      throw new Error(
        `${ERR_PREFIX.executor}: ${
          result.diagnostic ?? `the executor subagent ended with ${result.stopReason}`
        }`,
      )
    }
    const text = result.output
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
    // 返回文本尾部追加 receipt 行，标注生效 model 及来源（DSH 无 effort 维度）；
    // force 放行时追加 (forced) 标记，使覆盖派发在输出中一眼可辨。
    const receiptBase = buildExecutorReceipt({
      model: effective.model,
      modelSource: effective.sources.model,
    })
    const receipt = forced ? `${receiptBase} (forced)` : receiptBase
    // 空输出时 receipt 同样保留：可观测性不依赖子代理是否有文本产出（与 adapter-pi 对齐）。
    const baseText = text === '' ? EMPTY_OUTPUT_TEXT : text
    const outputText = `${baseText}\n\n${receipt}`
    return {
      kind: 'foreground',
      runId: run.id,
      output: [{ type: 'text', text: outputText }],
    }
  } finally {
    try {
      await run.dispose()
    } catch (error) {
      // 释放失败不阻塞结果返回：run 已结算，仅告警记录（对齐 drain 语义）。
      console.warn(`${DISPOSE_WARN_PREFIX} ${String(error)}`)
    }
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
