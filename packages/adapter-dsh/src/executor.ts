/**
 * adapter-dsh 的 executor 工具：把 workloom 任务上下文组装成子代理首条 prompt 并派发。
 *
 * 设计意图：
 * - 暴露一个模型可见工具 workloom_execute：按 kind（research/implement/check/frontend）用
 *   core 的 buildExecutorPrompt 组装上下文，经 ctx.subagents.startContinuable（spawn，
 *   in-process）派发 continuable 子代理；
 * - 默认后台派发：startContinuable 接受初始 prompt 后立即返回
 *   { kind: 'background', childId, receipt }——receipt（生效 model/effort + 注入四元组）
 *   在派发启动前已就绪，不等待 turn 结算、不阻塞主会话；显式传 foreground: true 才走
 *   前台阻塞链路（startContinuable resolve 拿到 durable childId 后 agents.get 解析会话，
 *   记录事件边界，whenIdle 等回合结束，finalAssistantOutput 取本轮输出，最后
 *   drainContinuableChildren 释放 Activation）；四类 kind 统一；
 * - 子代理会话为 continuable：客户端 composer 可写、会话记录 mode=continuable、服务端
 *   接受 follow-up；主会话可经 continue_executor 参数显式续用同一会话跑多阶段——
 *   续用默认只发主会话增量指令（不重注入全量上下文），reinject: true 恢复全量注入；
 *   续用走 followup(parent, childId, content) 投递下一指令（投递前按 dispatches 记录做
 *   同 kind 校验，跨 kind 返回提示不投递；投递被上游 parent 严格校验拒绝时——fork 分身
 *   接续源会话派发的 executor 必然命中——转译为全新派发引导文案），等待与输出语义同
 *   新派发；
 * - 完成报告不二次发 receipt：DSH 结算时向父会话投递 subagent-settled notice（含收尾
 *   消息），主会话从通知直接获得报告；续接（continue_executor/send_message）只用于
 *   追加新工作，不为取报告而续接，不新增结果收集工具；
 * - 派发留痕：派发时刻即写 task.json dispatches（status: running），终态由
 *   executor-settle 的 subagent/end 全局监听按 childId 自动回填 completed/failed
 *   + 一行错误摘要，主会话不参与；失败派发（初写后未结算）也留痕可见；
 * - 工具依赖的 tools/subagents/agents 服务按注册面做局部结构化声明（参考 plugin.ts 的
 *   SystemPromptService 做法），运行时由宿主注入；
 * - 子代理释放失败（drain）只 WARNING 不阻塞结果返回；其余故障 fail loud（抛错由
 *   DSH 工具管线转失败结果）；
 * - model 未显式传入时回退到 .workloom/config.json|js 的 subagents 配置（按 executor
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
 * - 工具面白名单（allow 清单组装与 toolFilter capability 校验）下沉到
 *   executor-dispatch.ts，与工具注册/执行编排分离；派发请求携带 toolFilter allow
 *   （原生候选 ± tools 配置，与运行时可见工具名集合求交，未知名在 core 静默
 *   忽略），使 executor 子代理的可见工具集与执行面只含白名单内工具——编排/
 *   交互/任务工具与 lsp_* 默认不入，经 subagent_profiles 的 tools.includes 补回；
 *   派发前校验 provider 的 toolFilter capability，缺失时 fail loud（不静默丢弃），
 *   startContinuable reject 的 UNSUPPORTED_CAPABILITY 同样转为清晰英文错误兜底；
 *   回执注入统计同行追加 `, K tools allowed`（K = 实际下发 allow 集大小）；
 * - research 写守卫（executor-guard.ts）：插件激活时注册一次，research 子代理的
 *   write/edit 只允许落在其 cwd 的 .workloom/ 内（越界拒绝），派发成功时登记
 *   子会话身份，重启后守卫按任务记录懒重建；
 * - 异常终止（continuable 无 run.result）：以会话事件面的 turn/end 终止原因为准——
 *   最后一个 turn/end 缺失或 reason.kind 非 completed（aborted/blocked/error/
 *   max-tokens/interrupted 等）即转工具错误（文本取 error 事件的结构化 message，
 *   缺失用终止原因兜底），不附输出文本（避免把中止当成功消费）；仅前台链路判定；
 * - 返回文本尾部追加 receipt 行，标注生效 model 及来源与复用标记：前台输出追加
 *   (reused) 于续用轮；后台 receipt 与前台同一渲染，使配置来源/复用一眼可辨。
 */
import type { Context } from '@deepseek-ai/cordis'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { ReasoningEffortId } from '@deepseek-ai/dsh-llm'

import type { ExecutorInjectionStats, ExecutorPromptResult } from '@workloom-ai/core'
import type { DispatchModelSource } from '@workloom-ai/core'

import {
  assertEffort,
  assertForceReason,
  buildConflictNotice,
  buildExecutorPrompt,
  buildNewDispatchBinding,
  composeLocalDirectivesText,
  detectExecutorConflicts,
  ERR_PREFIX,
  EXECUTOR_KINDS,
  findWorkloomRoot,
  loadConfig,
  PARAM_DESCRIPTIONS,
  readTask,
  recordExecutorDispatch,
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
  buildAllowFilter,
  hasLspTooling,
  SPAWN_PROVIDER,
  toCapabilityError,
} from './executor-dispatch.js'
import type { SpawnProviderLike } from './executor-dispatch.js'
import { registerResearchChildId, registerResearchGuard } from './executor-guard.js'
import type { ResearchExecutionLike } from './executor-guard.js'
import {
  buildTurnReceiptText,
  collectExecutorTurn,
  drainContinuableChild,
  locateContinueChildId,
  readSpawnBinding,
} from './executor-continuation.js'
import type { TurnMeta } from './executor-continuation.js'
import { registerDispatchSettlement, trackDispatchSettle } from './executor-settle.js'
import { readMainModel } from './main-model.js'

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

/** 派发审计记录失败告警前缀（记录失败不阻塞派发）。 */
const DISPATCH_WARN_PREFIX = `${ERR_PREFIX.executor}: WARNING: failed to record executor dispatch:`

/**
 * 续派重绑定拒绝文案（design §8.1，运行时文案英文）：continue_executor 与
 * model/effort 同传一律 fail loud——子会话 model/effort 在派发时刻已绑定，
 * DSH followup 无模型重绑接缝，静默丢弃会让回执谎报生效；换模型必须新开派发。
 */
const CONTINUE_REBIND_REJECT_TEXT =
  'continue_executor cannot be combined with model/effort: the child session keeps the ' +
  'model/effort bound at its original dispatch and followup has no rebinding seam. ' +
  'To change the model or effort, dispatch a new executor without continue_executor.'

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
  /** 前台阻塞开关（默认 false = 后台派发，返回即带 receipt；true = 阻塞等结算）。 */
  foreground?: boolean
  /** 续接全量重注入开关（默认关：续接只发增量指令；true = 恢复全量上下文注入）。 */
  reinject?: boolean
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

/** tools 服务的最小接口（register + 作用域工具视图 + guard 守卫注册）。 */
interface ToolsService {
  register(definition: MinimalToolDefinition): () => void
  schemas(scope?: object): readonly { name: string }[]
  guard(guard: (execution: Readonly<ResearchExecutionLike>) => string | undefined): () => void
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
      toolFilter?: { allow: string[] }
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

/** 工具成功返回的 canonical 值形状（前台：runId + 输出；后台：childId + receipt）。 */
type ExecutorValue =
  | { kind: 'foreground'; runId: string; output: TextBlockLike[] }
  | { kind: 'background'; childId: string; receipt: string }

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
        foreground: {
          type: 'boolean',
          description: PARAM_DESCRIPTIONS.foregroundExecutor,
        },
        reinject: {
          type: 'boolean',
          description: PARAM_DESCRIPTIONS.reinjectExecutor,
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
  // research 写守卫：插件激活时注册一次（机制强制面：research 只能写 <cwd>/.workloom/）。
  registerResearchGuard(ctx)
  // 派发终态回填通道：全局 subagent/end 监听按 childId 自动回填 dispatches 终态
  // （register 自绑定 fiber 生命周期，插件卸载自动清理）。
  registerDispatchSettlement(ctx)
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
  // 续派治理（design §8.1）：continue_executor 与 model/effort 同传一律 fail loud
  // （含传相同值）——子会话绑定在派发时刻烤死，续派轮传 model/effort 只会被静默
  // 丢弃、回执谎报生效；拒绝发生在任何登记/结算副作用（recordExecutorDispatch/
  // trackDispatchSettle/followup/startContinuable）之前。
  if (
    params.continue_executor !== undefined &&
    (params.model !== undefined || params.effort !== undefined)
  ) {
    throw new Error(`${ERR_PREFIX.executor}: ${CONTINUE_REBIND_REJECT_TEXT}`)
  }
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
  // 工具面白名单：派发前校验 provider 的 toolFilter capability（缺失 fail loud，
  // 不静默丢弃）；allow 清单 = 原生候选 ± tools 配置，与运行时可见工具名集合
  // 求交（未知名在 core 静默忽略，不得硬编码；编排/交互/任务工具与 lsp_* 默认
  // 不入，经 subagent_profiles 的 tools.includes 补回）。
  const provider = ctx.subagents.getProvider(SPAWN_PROVIDER)
  assertToolFilterCapability(provider)
  // 可见集必须取父代理作用域视图：原生工具挂在 agent-plane（preset 层），
  // 无参全局视图枚举不到，会把基集整个丢出 allow（冒烟实证）；父代理视图
  // 即子代理的继承面，与 toolFilter allow 的过滤目标一致。
  const visibleNames = ctx.tools.schemas(parent).map((schema) => schema.name)
  const allowFilter = buildAllowFilter(visibleNames, effective.tools)
  // LSP 工具面探测：交付时过滤纪律段 LSP 句——allow 清单含 lsp_ 工具才注入。
  const hasLsp = hasLspTooling(allowFilter.allow)
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
  // 续派轮的 spawn 绑定（design §8.3）：从 childId 首次派发记录读取的 model/effort，
  // 续派记录沿用该值、回执如实展示；新派轮为 null（绑定在派发后由本函数落盘）。
  let spawnBinding: { model?: string; effort?: string } | null = null
  // 本轮实际发送内容与其注入统计：新派发/续接 reinject 走全量 buildExecutorPrompt
  // 产物；续接默认只发主会话增量指令（不重注入全量上下文），注入统计如实反映
  // 实际发送内容（增量时内联/截断/索引为 0、KB 为增量体积）。
  let sendText: string
  let injection: ExecutorInjectionStats
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
    // 读取首次派发记录落盘的绑定（读不到/旧记录缺字段返回 null → 回执 unrecorded）。
    spawnBinding = readSpawnBinding(root, taskRelPath, childId)
    if (params.reinject === true) {
      // 显式 reinject：恢复全量上下文注入（压缩丢失的兜底），与现状行为一致。
      const [localErr, localDirectives] = composeLocalDirectivesText(
        root,
        params.kind,
      )
      if (localErr !== null) throw localErr
      const built = buildFullInjection(
        root,
        taskRelPath,
        params.kind,
        params.prompt,
        localDirectives,
        hasLsp,
      )
      sendText = built.text
      injection = injectionStats(built, allowFilter.allow.length)
    } else {
      // 增量续接：只发主会话增量指令（params.prompt），不复述子会话已持有上下文。
      sendText = params.prompt
      injection = {
        bytes: Buffer.byteLength(params.prompt, 'utf8'),
        inlined: 0,
        truncated: 0,
        indexed: 0,
        toolsAllowed: allowFilter.allow.length,
      }
    }
    // followup 向同一 durable 会话投递下一指令（FIFO 由子代理 inbox 保证）；reject
    // 透传（fail loud）：父权限/UNAUTHORIZED/接入拒绝等由 DSH 错误信息表达；仅
    // fork 分身的 parent 严格校验拒绝（belongs to another parent session）转译为
    // 引导文案（见 translateForkContinueError，保留 isError 语义）。
    try {
      await ctx.subagents.followup(parent, childId, [{ type: 'text', text: sendText }], {
        source: { kind: 'user' },
        signal: exec.signal,
      })
    } catch (error) {
      throw translateForkContinueError(error)
    }
  } else {
    const [localErr, localDirectives] = composeLocalDirectivesText(
      root,
      params.kind,
    )
    if (localErr !== null) throw localErr
    const built = buildFullInjection(
      root,
      taskRelPath,
      params.kind,
      params.prompt,
      localDirectives,
      hasLsp,
    )
    sendText = built.text
    injection = injectionStats(built, allowFilter.allow.length)
    try {
      const started = await ctx.subagents.startContinuable({
        provider: SPAWN_PROVIDER,
        label: buildChildLabel(root, taskRelPath, params.kind, params.title),
        request: {
          prompt: [{ type: 'text', text: sendText }],
          parent,
          agentOptions,
          maxDepth: 1,
          toolFilter: { allow: allowFilter.allow },
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
  // 派发时刻初写 dispatches（status: running）：失败派发也留痕（缺口 A）；记录
  // 失败仅告警不阻塞派发。终态由 executor-settle 的 subagent/end 监听回填。
  // 续派治理（design §8.2）：记录同时落实际生效的绑定——新派轮写本次解析后的
  // model/effort 与来源层（param/whenMain/fallback/legacy/inherit），续派轮沿用
  // childId 首次派发记录的绑定、modelSource 记 spawn（审计可查，回执据此展示）。
  const [dispatchErr] = recordExecutorDispatch(root, taskRelPath, {
    kind: params.kind,
    title: params.title,
    childId,
    // 续派轮沿用 spawn 绑定（可能无绑定字段 → 不落）；新派轮落本次生效绑定。
    ...(reused ? buildSpawnEntryBinding(spawnBinding) : buildNewDispatchBinding(params, effective, mainModel)),
  })
  if (dispatchErr !== null) {
    console.warn(`${DISPATCH_WARN_PREFIX} ${dispatchErr}`)
  }
  // 登记终态回填定位（subagent/end 按 childId 关联 dispatches 记录）。
  trackDispatchSettle(childId, root, taskRelPath)
  // research 派发登记守卫身份（按项目；不移除；重启后由守卫按任务记录懒重建）。
  if (params.kind === EXECUTOR_KINDS.research) {
    registerResearchChildId(root, childId)
  }
  // 前台显式开关：阻塞等结算（现状行为，含 (reused) 续用轮语义）；否则默认后台
  // 派发——返回子代理标识 + 完整 receipt（注入统计派发前已就绪），不等待结算。
  const turnMeta: TurnMeta = {
    forced,
    reused,
    injection,
    // 续派轮传 spawn 绑定（可能为 undefined = 记录无绑定，回执渲染 unrecorded）；
    // 新派轮不传（走现状 receipt，未绑定字段时仍显示 (param)/(config…) 现状）。
    ...(reused ? { spawnBinding: spawnBinding ?? undefined } : {}),
  }
  if (params.foreground === true) {
    try {
      return await collectExecutorTurn(ctx, childId, turnMeta, effective)
    } finally {
      // 先释放子代理 Activation（失败仅告警）：成功失败均释放（覆盖 followup 续用轮）。
      await drainContinuableChild(ctx, parent, childId)
    }
  }
  return {
    kind: 'background',
    childId,
    receipt: buildTurnReceiptText(turnMeta, effective),
  }
}

/**
 * 续派轮记录落盘绑定（内部）：沿用 childId 首次派发记录的绑定值，来源记 spawn。
 * 首次记录无绑定字段时只记来源（model/effort 缺省，审计仍可辨续派轮）。
 * @param binding 首次派发记录读取的绑定（可能 null）
 * @returns dispatch entry 的绑定字段（modelSource 恒为 spawn）
 */
function buildSpawnEntryBinding(
  binding: { model?: string; effort?: string } | null,
): { model?: string; effort?: string; modelSource: DispatchModelSource } {
  return {
    ...(binding?.model !== undefined ? { model: binding.model } : {}),
    ...(binding?.effort !== undefined ? { effort: binding.effort } : {}),
    modelSource: 'spawn',
  }
}

/**
 * 组装全量注入 prompt（新派发/reinject 续接共用）：本机片段已由调用方探测，此处
 * 调用 core buildExecutorPrompt；组装失败 fail loud。hasLsp 由调用方按可见工具集
 * 探测（交付时过滤纪律段 LSP 句，切片 ④）。
 * @param root 项目根
 * @param taskRelPath 任务目录相对 .workloom 的路径
 * @param kind executor 类型
 * @param userPrompt 用户任务正文
 * @param localDirectives 本机片段合成文本（已探测可用工具集）
 * @param hasLsp 目标环境是否具备 LSP 工具面
 * @returns 组装结果（text + stats）
 */
function buildFullInjection(
  root: string,
  taskRelPath: string,
  kind: string,
  userPrompt: string,
  localDirectives: string,
  hasLsp: boolean,
): ExecutorPromptResult {
  const [promptErr, built] = buildExecutorPrompt({
    root,
    taskRelPath,
    kind,
    userPrompt,
    localDirectives,
    hasLsp,
  })
  if (promptErr !== null || built === null) {
    throw promptErr ?? new Error(`${ERR_PREFIX.executor}: prompt assembly returned no result`)
  }
  return built
}

/**
 * 从 buildExecutorPrompt 结果投影注入统计（receipt 渲染用）：总字节取注入文本长度
 * （KB 一位小数由 core 渲染），计数来自 stats——可见喂给子代理的上下文规模。
 * 指针模式无预算索引降级（indexed 恒 0）；jsonl/research 指针行计入 pointed；
 * toolsAllowed 为实际下发 allow 工具数（K，receipt 同行追加渲染）。
 * @param built buildExecutorPrompt 结果
 * @param toolsAllowed 实际下发 allow 工具数（可选）
 * @returns 注入统计五元组 + toolsAllowed
 */
function injectionStats(built: ExecutorPromptResult, toolsAllowed?: number): ExecutorInjectionStats {
  return {
    bytes: Buffer.byteLength(built.text, 'utf8'),
    inlined: built.stats.filesInlined,
    truncated: built.stats.truncated,
    indexed: 0,
    pointed: built.stats.filesPointed,
    ...(toolsAllowed !== undefined ? { toolsAllowed } : {}),
  }
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
 * 从 canonical 值投影模型可见文本（纯函数）：前台取 output 首块文本；后台拼
 * childId + receipt 为可读文本（子代理标识 + 完整 receipt，指引等待完成通知）。
 * @param value canonical 结果
 * @returns 文本块
 */
function renderOutput(value: unknown): TextBlockLike {
  const result = value as {
    kind?: string
    output?: readonly { text?: string }[]
    childId?: string
    receipt?: string
  }
  if (result.kind === 'background') {
    return { type: 'text', text: renderBackground(result.childId ?? '', result.receipt ?? '') }
  }
  const text = result.output?.[0]?.text ?? ''
  return { type: 'text', text }
}

/**
 * 拼装后台派发的模型可见文本：子代理标识 + 后台语义指引 + receipt（主会话据此
 * 继续其他工作，完成报告由 subagent-settled 通知送达）。
 * @param childId 子代理 durable session id
 * @param receipt 完整 receipt 文本（model/effort + 注入四元组）
 * @returns 后台派发文本
 */
function renderBackground(childId: string, receipt: string): string {
  return (
    `Dispatched in background; child session: ${childId}. Continue with other work; ` +
    `the completion report arrives via the subagent notice.\n\n${receipt}`
  )
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
