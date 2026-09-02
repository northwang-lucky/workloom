/**
 * adapter-dsh 的 executor 工具：把 workloom 任务上下文组装成子代理首条 prompt 并前台派发。
 *
 * 设计意图：
 * - 暴露一个模型可见工具 workloom_execute：按 kind（research/implement/check/frontend）用
 *   core 的 buildExecutorPrompt 组装上下文，经 ctx.subagents.startContinuable（spawn，
 *   in-process）前台派发 continuable 子代理：startContinuable resolve 拿到 durable
 *   childId 后 agents.get(childId) 解析会话，记录事件边界，whenIdle 等回合结束，
 *   finalAssistantOutput 取本轮输出，最后 drainContinuableChildren 释放 Activation；
 * - 子代理会话为 continuable：客户端 composer 可写、会话记录 mode=continuable、服务端
 *   接受 follow-up；主会话可经 continue_executor 参数显式续用同一会话跑多阶段——
 *   followup(parent, childId, content) 投递下一指令（投递前按 dispatches 记录做同
 *   kind 校验，跨 kind 返回提示不投递；投递被上游 parent 严格校验拒绝时——fork 分身
 *   接续源会话派发的 executor 必然命中——转译为全新派发引导文案），等待与输出语义同
 *   新派发；
 * - 工具依赖的 tools/subagents/agents 服务按注册面做局部结构化声明（参考 plugin.ts 的
 *   SystemPromptService 做法），运行时由宿主注入；
 * - 子代理释放失败（drain）只 WARNING 不阻塞结果返回；其余故障 fail loud（抛错由
 *   DSH 工具管线转失败结果）；
 * - model 未显式传入时回退到 .workloom/config.yaml 的 subagents 配置（按 executor
 *   kind 取值，字段独立合并）；配置支持 subagent_profiles 按主会话当前模型
 *   （requestHeader 快照的 provider/model）分档匹配，命中的条目优先于旧
 *   subagents，供用户配置默认派发参数；
 * - effort 同名直通：工具显式 effort 或 subagents 配置的 effort 原样传入子代理
 *   agentOptions.reasoningEffort（DSH branded），不做 workloom 侧映射；非法档位
 *   由 assertEffort 在派发前 fail loud，provider 自有合法值空间在子会话请求时校验；
 * - model 字符串支持 "provider/model" 前缀形式：拆分后 provider 一并传给子代理
 *   agentOptions，跨 provider 派发才不会报 UNKNOWN_MODEL；裸 id 按父 provider 解析；
 * - 子会话标题语义化：label 为 `[<KindLabel>] <title>`（title 是 main 会话传入的
 *   语义部分且 schema 必填非空，executor 只组装前缀；回退仅作纯函数防御，
 *   仍缺失/空白回退 task title，再退 workloom-<kind>），title 完整不截断（截断
 *   交给 UI），便于会话列表一眼分辨派发角色与任务；
 * - 冲突中断：显式 model 与 subagents 配置不一致时，无 force 直接返回
 *   buildConflictNotice 提示文本不派发；force: true 须带非空 reason 留痕（写入
 *   task.json overrides），放行后 receipt 追加 (forced) 标注便于审计；
 * - 工具面硬屏蔽（deny 清单组装与 toolFilter capability 校验）下沉到
 *   executor-dispatch.ts，与工具注册/执行编排分离；派发请求携带 toolFilter deny
 *   （workloom 9 工具全量 + DSH 原生委派候选与运行时可见工具名的交集），使
 *   executor 子代理的可见工具集与执行面同时剔除编排/委派工具（未知名字会使
 *   restrict fail，候选必须求交）；派发前校验 provider 的 toolFilter capability，
 *   缺失时 fail loud（不静默丢弃），startContinuable reject 的
 *   UNSUPPORTED_CAPABILITY 同样转为清晰英文错误兜底；
 * - 异常终止（continuable 无 run.result）：以会话事件面的 turn/end 终止原因为准——
 *   最后一个 turn/end 缺失或 reason.kind 非 completed（aborted/blocked/error/
 *   max-tokens/interrupted 等）即转工具错误（文本取 error 事件的结构化 message，
 *   缺失用终止原因兜底），不附输出文本（避免把中止当成功消费）；
 * - 返回文本尾部追加 receipt 行，标注生效 model 及来源与复用标记：续用轮追加
 *   (reused)，使会话复用一眼可辨（配置来源细分随 configSources 渲染）。
 */
import type { Context } from '@deepseek-ai/cordis'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { ReasoningEffortId } from '@deepseek-ai/dsh-llm'

import {
  assertEffort,
  assertForceReason,
  buildConflictNotice,
  buildExecutorPrompt,
  composeLocalDirectivesText,
  detectExecutorConflicts,
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
import {
  assertToolFilterCapability,
  availableToolNames,
  buildDenyList,
  SPAWN_PROVIDER,
  toCapabilityError,
} from './executor-dispatch.js'
import type { SpawnProviderLike } from './executor-dispatch.js'
import { collectExecutorTurn, drainContinuableChild, locateContinueChildId } from './executor-continuation.js'

/** executor kind → 子会话标题展示标签（枚举，禁 Magic String）。 */
const KIND_LABELS = {
  research: 'Research',
  implement: 'Implement',
  check: 'Check',
  frontend: 'Frontend',
} as const

/** KIND_LABELS 的键类型（assertKind 已保证 kind 合法，此处仅防御缺键）。 */
type KindLabelKey = keyof typeof KIND_LABELS

/** 冲突中断/续用拒绝返回值的 runId（未派发子代理，无 run id 可用）。 */
const NO_CHILD_RUN_ID = ''

/** 覆盖审计记录失败告警前缀（记录失败不阻塞派发）。 */
const OVERRIDE_WARN_PREFIX = `${ERR_PREFIX.executor}: WARNING: failed to record executor override:`

/**
 * 上游 DSH 接续拒绝的错误片段（parent 严格校验：child.parentSession ≠ 当前会话，
 * fork 分身接续源会话派发的 executor 必然命中）。依赖注意：匹配的是上游错误文案，
 * 该文案变更会让转译退化为原样透传（fail loud 仍在，只是少了引导）。
 */
const FORK_PARENT_ERROR_FRAGMENT = 'belongs to another parent session'

/** fork 接续失败转译的引导文案（design §4.2：提示全新派发并携带所需上下文）。 */
const FORK_CONTINUE_GUIDANCE =
  'Cannot continue the recorded executor: it belongs to the session that dispatched it, not this one ' +
  '(typically because the current session is a fork). Dispatch a fresh executor instead, carrying the ' +
  'needed context in the prompt.'

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
  /** 续用参数（schema key 与模型面一致：continue_executor）。 */
  continue_executor?: string
}

/** 工具执行上下文最小形状（exec 参数，仅消费 agent 与 signal）。 */
interface ToolExec {
  [k: string]: unknown
  agent?: MinimalAgent
  signal: AbortSignal
}

/** 发起 agent 的最小形状（continuable 派发需读 cwd/事件与最近请求头）。 */
export interface MinimalAgent {
  id: string
  whenIdle(): Promise<void>
  session: {
    header: { cwd?: string }
    /** 会话事件日志（SessionEvent 最小契约，输出边界与终止判定用）。 */
    events: readonly SessionEvent[]
    /**
     * 会话日志最新 request/header 快照（主模型来源；只声明 config 投影，不依赖
     * dsh-session 的完整 LlmCallConfig 类型）。
     */
    requestHeader?(): { config?: { provider?: string; model?: string } } | undefined
  }
}

/** tools 服务的最小接口（register + schemas 全局视图）。 */
interface ToolsService {
  register(definition: MinimalToolDefinition): () => void
  schemas(): readonly { name: string }[]
}

/** subagents 服务的最小接口（continuable 派发/续用/释放 + provider 查询）。 */
interface SubagentsService {
  getProvider(name: string): SpawnProviderLike | undefined
  startContinuable(spec: {
    provider: string
    label: string
    request: {
      prompt: TextBlockLike[]
      parent: MinimalAgent
      agentOptions?: { provider?: string; model?: string; reasoningEffort?: ReasoningEffortId }
      maxDepth?: number
      toolFilter?: { deny: string[] }
    }
    signal: AbortSignal
  }): Promise<{ childId: string }>
  followup(
    parent: MinimalAgent,
    childId: string,
    content: readonly TextBlockLike[],
    options: { source: { kind: 'user' }; signal: AbortSignal },
  ): Promise<string>
  drainContinuableChildren(parent: MinimalAgent, childIds: readonly string[]): Promise<void>
}

/** agents 服务的最小接口（按 id 取 continuable 子代理会话）。 */
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
        continue_executor: {
          type: 'string',
          description: PARAM_DESCRIPTIONS.continueExecutor,
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

/* ---- 下文分段追加：executeTool 与辅助函数 ---- */
/**
 * 前台派发（或续用）executor 子代理并返回其输出。
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
  // 合并子代理默认值：工具参数优先，未出现回退到 subagent_profiles 命中条目
  // （按主会话当前模型匹配），再回退到 subagents 配置（字段独立合并）；
  // effort 同名直通：显式参数或配置的档位原样进入 effective.effort，派发前由
  // assertEffort 校验合法档位（非法值 fail loud，不静默丢弃）。
  const config = loadConfig(root)
  const mainModel = readMainModel(parent)
  const effective = resolveSubagentDefaults(
    config,
    params.kind,
    { model: params.model, effort: params.effort },
    'dsh',
    mainModel,
  )
  // effort 非法档位 fail loud（core 校验，与 adapter-pi 语义一致）；冲突检测：
  // 显式 model/effort 与配置（按主模型合并后的生效值）不一致时，无 force 返回
  // 提示（不派发）；force 放行须带非空 reason 留痕，覆盖审计写入 task.json。
  assertEffort(effective.effort)
  const conflicts = detectExecutorConflicts(
    config,
    params.kind,
    { model: params.model, effort: params.effort },
    'dsh',
    mainModel,
  )
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
  // 工具面硬屏蔽：派发前校验 provider 的 toolFilter capability（缺失 fail loud，
  // 不静默丢弃）；deny 清单 = workloom 9 工具全量 + 委派候选与运行时可见工具名的
  // 交集（未知名字会使 restrict fail，候选名必须求交，不得硬编码）。
  const provider = ctx.subagents.getProvider(SPAWN_PROVIDER)
  assertToolFilterCapability(provider)
  const visibleNames = new Set(ctx.tools.schemas().map((schema) => schema.name))
  const denyList = buildDenyList(visibleNames)
  // 本机片段（executor 首条 prompt 注入一次）：可用工具集 = 可见工具名 − denyList
  // （与 toolFilter deny 后子代理真实可见集一致，故 buildExecutorPrompt 调用必须
  // 在 denyList 计算之后执行）；组装失败 fail loud（本机片段是有意增强，静默失效
  // 最难排查），条件不满足时返回空串（不注入）。
  const [localErr, localDirectives] = composeLocalDirectivesText(
    root,
    params.kind,
    availableToolNames(visibleNames, denyList),
  )
  if (localErr !== null) throw localErr
  const [promptErr, built] = buildExecutorPrompt({
    root,
    taskRelPath,
    kind: params.kind,
    userPrompt: params.prompt,
    localDirectives,
  })
  if (promptErr || built === null) {
    throw promptErr ?? new Error(`${ERR_PREFIX.executor}: prompt assembly returned no result`)
  }
  // model/effort 独立组装：model 字符串支持 "provider/model" 前缀（拆分后 provider
  // 一并传入，跨 provider 派发才不报 UNKNOWN_MODEL；裸 id 无 provider 按父 provider
  // 解析）；effort 原样 brand 进 reasoningEffort（同名直通），model 缺省时也能
  // 单独携带 effort；两者均未生效时保持 undefined（不覆盖父会话的模型选择）。
  const splitModel = effective.model === undefined ? undefined : splitProviderModel(effective.model)
  const agentOptions =
    splitModel === undefined && effective.effort === undefined
      ? undefined
      : {
          ...(splitModel ?? {}),
          ...(effective.effort !== undefined
            ? { reasoningEffort: ReasoningEffortId(effective.effort) }
            : {}),
        }
  // 定位本轮 childId：续用（continue_executor）按 dispatches 记录做同 kind 校验后
  // followup 投递下一指令；新派发走 startContinuable（continuable 会话，客户端
  // composer 可写）。maxDepth 是子代理自身深度的绝对上限：顶层派发的子代理深度为 1，
  // 设 1 恰好放行本次派发；executor（深度 1）再派发时深度 2 > 1 被拒，
  // 即「executor 子代理禁止再派发 workloom_execute」。
  let childId: string
  let reused = false
  if (params.continue_executor !== undefined) {
    // 定位失败返回明确提示（不报错）：旧记录缺 childId / 无同 kind 记录 / 跨 kind /
    // 记录不存在，均不派发（fail loud 的「提示面」变体，避免静默续用错会话）。
    const [locateErr, located] = locateContinueChildId(
      root,
      taskRelPath,
      params.kind,
      params.continue_executor,
    )
    if (locateErr !== null) {
      return {
        kind: 'foreground',
        runId: NO_CHILD_RUN_ID,
        output: [{ type: 'text', text: locateErr }],
      }
    }
    childId = located
    reused = true
    // followup 向同一 durable 会话投递下一指令（FIFO 由子代理 inbox 保证）；reject
    // 透传（fail loud）：父权限/UNAUTHORIZED/接入拒绝等由 DSH 错误信息表达；仅
    // fork 分身的 parent 严格校验拒绝（belongs to another parent session）转译为
    // 引导文案（见 translateForkContinueError，保留 isError 语义）。
    try {
      await ctx.subagents.followup(parent, childId, [{ type: 'text', text: built.text }], {
        source: { kind: 'user' },
        signal: exec.signal,
      })
    } catch (error) {
      throw translateForkContinueError(error)
    }
  } else {
    try {
      const started = await ctx.subagents.startContinuable({
        provider: SPAWN_PROVIDER,
        label: buildChildLabel(root, taskRelPath, params.kind, params.title),
        request: {
          prompt: [{ type: 'text', text: built.text }],
          parent,
          agentOptions,
          maxDepth: 1,
          toolFilter: { deny: denyList },
        },
        signal: exec.signal,
      })
      childId = started.childId
    } catch (error) {
      // startContinuable reject 的 capability 错误兜底（如 provider 未注册/缺能力）
      // 转清晰英文错误。
      throw toCapabilityError(error)
    }
  }
  try {
    return await collectExecutorTurn(ctx, childId, {
      root,
      taskRelPath,
      kind: params.kind,
      title: params.title,
      forced,
      reused,
    }, effective)
  } finally {
    // 先释放子代理 Activation（失败仅告警）：成功失败均释放（覆盖 followup 续用轮）。
    await drainContinuableChild(ctx, parent, childId)
  }
}

/**
 * 读取主会话当前模型（"provider/model" 字符串）：取自会话日志最新
 * request/header 快照（反映运行中切模型）；provider/model 任一缺失或为空串时
 * 返回 undefined（视为取不到：subagent_profiles 的全部 whenMain 条目跳过，走
 * 兜底/旧 subagents，不 fail loud）。
 * @param parent 发起 agent（session.requestHeader 可选，旧宿主缺失时 undefined）
 * @returns 主模型标识或 undefined
 */
function readMainModel(parent: MinimalAgent): string | undefined {
  const header = parent.session.requestHeader?.()
  const provider = header?.config?.provider
  const model = header?.config?.model
  // provider/model 缺失或为空串均按「无值」处理：空串拼出的 "/" 会在 core 的
  // whenMain 匹配（splitProviderModel）时抛错，必须排除（设计口径：取不到
  // 主模型时 whenMain 全部跳过，不 fail loud）。
  if (provider === undefined || provider === '' || model === undefined || model === '') {
    return undefined
  }
  return `${provider}/${model}`
}

/**
 * 组装子会话标题：`[<KindLabel>] <title>`（title 为语义部分、不含前缀；缺省回退
 * task title，仍缺失/空白时整体回退 `workloom-<kind>`；标题仅供展示，不因任务
 * 元数据异常阻塞派发）。
 * @param root 项目根
 * @param taskRelPath 任务目录相对 .workloom 的路径
 * @param kind executor 类型（research/implement/check/frontend）
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
 * 转译 continue 接续失败：followup reject 的 message 含 "belongs to another parent
 * session"（DSH parent 严格校验：child.parentSession ≠ 当前会话，fork 分身接续源
 * 会话派发的 executor 必然命中）时，转为引导文案（保持 isError 语义：仍抛错，
 * 只是文案带下一步动作指引）；其余错误原样透传。
 * 依赖注意：匹配的是上游 DSH 的错误文案（FORK_PARENT_ERROR_FRAGMENT），该文案
 * 变更会让转译退化为原样透传（fail loud 仍在，只是少了引导）。
 * @param error followup reject 的原始错误
 * @returns 转译或原样的错误
 */
function translateForkContinueError(error: unknown): unknown {
  if (error instanceof Error && error.message.includes(FORK_PARENT_ERROR_FRAGMENT)) {
    return new Error(FORK_CONTINUE_GUIDANCE, { cause: error })
  }
  return error
}

