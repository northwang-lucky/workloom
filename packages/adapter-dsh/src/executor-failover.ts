/**
 * adapter-dsh executor 的失败转移编排：转移上下文注册表 + 派发时同步走链 +
 * 结算后重派 + 父会话一行通知（走链循环本身在 executor-failover-chain.ts）。
 *
 * 设计意图：
 * - 两条触发路径共用同一走链函数 runFallbackChain：派发时 startActivation 同步
 *   抛白名单错误（executor.ts 调用）与结算后 fire-and-forget 重派（executor-settle
 *   钩子调用）；分类与文案全部来自 core（isModelInaccessibleCode /
 *   extractFailureCode / buildFailoverNote / buildFailoverNotice），adapter 只编排；
 * - 转移上下文在派发时刻登记（结算监听是同步边界，拿不到原派发参数）：root/
 *   taskRelPath/kind/title/首次 prompt/链/当前跳/父 agent/白名单/LSP 面；结算即
 *   消费删除，防无界增长。插件重启后注册表丢失，退化为现状回报（只 WARNING）；
 * - 重派是全量重注入（composeLocalDirectivesText + buildFullInjection），prompt 用
 *   首次派发 prompt + 一行 failover 说明（工作区可能有半成品；续用轮的增量指令
 *   随旧会话丢失）。信号用新 AbortController：原工具调用 signal 已随调用结束失效；
 * - 父会话通知走宿主现成通道：sessionController.resolveAgent → createUserMessage
 *   （source kind workloom）→ agent.followup → sessions.flush；通道不可用/投递失败
 *   只 WARNING，不阻断转移；
 * - 所有异步工作经 trackFailoverWork 登记（flushFailoverWork 供测试等待）。
 */
import type { Context } from '@deepseek-ai/cordis'
import type { Agent, AgentOptions } from '@deepseek-ai/dsh-agent'
import { SessionId } from '@deepseek-ai/dsh-session'

import { randomUUID } from 'node:crypto'

import {
  appendDispatchErrorSuffix,
  buildFailoverNote,
  buildFailoverNotice,
  composeLocalDirectivesText,
  DISPATCH_MODEL_SOURCES,
  ERR_PREFIX,
  extractFailureCode,
  isModelInaccessibleCode,
  loadConfig,
  readTask,
  recordExecutorDispatch,
  resolveSubagentDefaults,
} from '@workloom-ai/core'
import type { DispatchModelSource } from '@workloom-ai/core'

import { DISPATCH_WARN_PREFIX } from './constants.js'
import {
  collectRunningExecutors,
  consumeChildModelBinding,
  evaluateCapacityGate,
  registerChildModelBinding,
} from './executor-capacity.js'
import { SPAWN_PROVIDER } from './executor-dispatch.js'
import {
  assertFallbackChainEfforts,
  buildFallbackAgentOptions,
  CHAIN_EXHAUSTED_PREFIX,
  CHAIN_SEPARATOR,
  FallbackChainExhaustedError,
  recordFailedDispatchAttempt,
  runFallbackChain,
} from './executor-failover-chain.js'
import type {
  FallbackChainOutcome,
  FallbackModelEntry,
} from './executor-failover-chain.js'
import { notifyFailoverParent } from './executor-failover-notify.js'
import { registerWriteGuardChildId, WRITE_GUARDED_KINDS } from './executor-guard.js'
import { buildChildLabel, buildFullInjection } from './executor-injection.js'
import { readMainModel } from './main-model.js'
import type { SettledDispatch } from './executor-settle.js'
import { trackDispatchSettle } from './executor-settle.js'
import {
  registerExecutorToolfaceChild,
  releaseExecutorToolfaceChild,
} from './executor-toolface.js'

// 走链机制由 executor-failover-chain.ts 承载；executor.ts 经本模块单一入口消费。
export { PARENT_MODEL_LABEL } from './executor-failover-chain.js'
export type { FallbackModelEntry } from './executor-failover-chain.js'

/** 转移编排内部异常告警前缀（只告警，不冒泡事件流/工具调用）。 */
const FAILOVER_WARN_PREFIX = `${ERR_PREFIX.executor}: WARNING: executor fallback transfer failed:`

/** 新派轮主模型绑定（buildNewDispatchBinding 产物的结构子集，首跳失败留痕用）。 */
export interface PrimaryDispatchBinding {
  model?: string
  effort?: string
  modelSource: Exclude<DispatchModelSource, 'spawn'>
}

/** 同步派发走链的入参（executor.ts 新派发路径；对象封装多参数）。 */
export interface StartDispatchWithFailoverParams {
  ctx: Context
  parent: Agent
  signal: AbortSignal
  root: string
  taskRelPath: string
  kind: string
  title: string
  /** 子会话展示标题（`[<KindLabel>] <title>`，各跳一致）。 */
  label: string
  /** 全量注入后的首条 prompt 文本（各跳一致）。 */
  sendText: string
  allowNames: readonly string[]
  /** 主模型的 agentOptions（首跳；链跳按条目另组）。 */
  agentOptions: AgentOptions | undefined
  /** 失败转移链（显式 model / 未配置时为空，走零行为变化路径）。 */
  chain: readonly FallbackModelEntry[]
  primaryBinding: PrimaryDispatchBinding
  /** 派发起点模型 label（穷尽消息链起点；轮换起点时为选中的链条目模型）。 */
  primaryModel: string
}

/** 同步派发走链结果：成功的启动结果 + 走链成功时的实际生效模型与跳序号。 */
export interface StartDispatchWithFailoverResult {
  started: { childId: string }
  failover?: { attempt: number; model: string; effort?: string; fallbackOf: string }
}

/** 失败转移上下文（派发时刻登记，结算 / 转移时消费）。 */
export interface FailoverContext {
  root: string
  taskRelPath: string
  kind: string
  title: string
  /** 首次派发用户 prompt（重派时重新全量注入的正文）。 */
  firstPrompt: string
  /** 失败轮是否为续用轮（续用增量指令随旧会话丢失，说明里要注明）。 */
  continued: boolean
  /**
   * 派发时刻登记的转移链：非轮换派发为配置解析链；同类并发轮换派发为环形物化
   * 后的线性链（起点之后按环形顺序，回绕段含主模型位条目）。
   */
  chain: readonly FallbackModelEntry[]
  /** 当前跳序号（起点 = 1，链首条 = 2）。 */
  attempt: number
  /** 当前子会话实际生效的模型（通知/说明里的失败模型）。 */
  currentModel: string
  /** 派发起点模型（轮换起点或主模型位；穷尽时完整尝试链的起点）。 */
  primaryModel: string
  /** 父会话 agent（重派与通知的发起方）。 */
  parent: Agent
  /** 首次派发施加的工具白名单（重派沿用）。 */
  allowNames: readonly string[]
  /** 首次派发是否具备 LSP 工具面（重派注入沿用）。 */
  hasLsp: boolean
}

/**
 * 同步派发走链（executor.ts 新派发路径）：主模型 startActivation 抛白名单错误时
 * 按链逐跳重试；每跳预分配 childId 并在创建前登记工具白名单（agent/created 早于
 * startActivation 返回），失败撤销登记并留一条 failed dispatches 记录。链穷尽抛
 * FallbackChainExhaustedError（消息附完整尝试链）；非白名单错误原样抛出（不留痕）。
 * @param params 走链入参（agentOptions/链/白名单/主模型绑定等）
 * @returns 成功跳的启动结果与转移标注（主模型直接成功时不带 failover）
 */
export async function startDispatchWithFailover(
  params: StartDispatchWithFailoverParams,
): Promise<StartDispatchWithFailoverResult> {
  const {
    ctx,
    parent,
    signal,
    root,
    taskRelPath,
    kind,
    title,
    label,
    sendText,
    allowNames,
    agentOptions,
    chain,
    primaryBinding,
    primaryModel,
  } = params
  // 条目 effort 在首次尝试前整体校验（fail loud 于派发前，不在转到一半才发现配置坏）。
  assertFallbackChainEfforts(chain)
  let reservedChildId = SessionId(randomUUID())
  const startAttempt = async (
    options: AgentOptions | undefined,
  ): Promise<{ childId: string }> => {
    registerExecutorToolfaceChild(reservedChildId, allowNames)
    try {
      return await ctx.subagents.startActivation({
        provider: SPAWN_PROVIDER,
        label,
        childId: reservedChildId,
        request: {
          prompt: [{ type: 'text', text: sendText }],
          parent,
          agentOptions: options,
          maxDepth: 1,
        },
        signal,
        delivery: 'parent',
      })
    } catch (error) {
      // 启动失败：撤销白名单登记，避免 id 泄漏进索引。
      releaseExecutorToolfaceChild(reservedChildId)
      throw error
    }
  }
  try {
    const started = await startAttempt(agentOptions)
    // 直接成功：登记起点绑定模型（轮换占用取数的第一优先级来源）。
    registerChildModelBinding(started.childId, kind, primaryModel)
    return { started }
  } catch (error) {
    // 未配置链 / 显式 model（调用方已置空链）/ 白名单外错误：维持现状（原样抛出、不留痕）。
    if (chain.length === 0 || !isModelInaccessibleCode(extractFailureCode(error))) throw error
    // 首跳（主模型）失败留痕：failed + 真实错误（无链式关联字段）。
    recordFailedDispatchAttempt({
      root,
      taskRelPath,
      kind,
      title,
      childId: reservedChildId,
      error,
      ...primaryBinding,
      toolsAllow: [...allowNames],
    })
    let previousChildId = reservedChildId
    const outcome = await runFallbackChain({
      chain,
      startIndex: 0,
      attemptedModels: [primaryModel],
      start: async (step) => {
        reservedChildId = SessionId(randomUUID())
        return startAttempt(buildFallbackAgentOptions(step))
      },
      onAttemptFailed: (step, attemptError) => {
        recordFailedDispatchAttempt({
          root,
          taskRelPath,
          kind,
          title,
          childId: reservedChildId,
          error: attemptError,
          model: step.model,
          ...(step.effort !== undefined ? { effort: step.effort } : {}),
          modelSource: DISPATCH_MODEL_SOURCES.FALLBACK,
          fallbackOf: previousChildId,
          fallbackAttempt: step.attempt,
          toolsAllow: [...allowNames],
        })
        previousChildId = reservedChildId
      },
    })
    // 转移成功：childId 换新，按实际生效跳登记绑定（轮换占用取数的第一优先级
    // 来源；同步走链的失败跳从未成功启动，不落登记）。
    registerChildModelBinding(outcome.result.childId, kind, outcome.model)
    return {
      started: outcome.result,
      failover: {
        attempt: outcome.attempt,
        model: outcome.model,
        ...(outcome.effort !== undefined ? { effort: outcome.effort } : {}),
        fallbackOf: previousChildId,
      },
    }
  }
}

/** childId → 转移上下文（进程内注册表，派发登记、结算消费）。 */
const failoverContexts = new Map<string, FailoverContext>()

/** 在途转移工作（测试经 flushFailoverWork 等待；生产侧只是防未处理拒绝）。 */
const failoverWork = new Set<Promise<void>>()

/**
 * 登记一次新派发的转移上下文（链为空 / 显式 model 时不登记，转移天然不发生）。
 * @param childId 子代理 durable session id
 * @param context 转移上下文
 */
export function registerFailoverContext(childId: string, context: FailoverContext): void {
  failoverContexts.set(childId, context)
}

/**
 * 标记该 childId 的最近一轮为续用轮（sendMessage 投递成功后调用）：只置 continued，
 * 首次 prompt 与链保持首次派发值。
 * @param childId 子代理 durable session id
 */
export function markFailoverContinued(childId: string): void {
  const context = failoverContexts.get(childId)
  if (context !== undefined) context.continued = true
}

/** 清空转移上下文注册表（仅测试用，恢复干净状态）。 */
export function clearFailoverContexts(): void {
  failoverContexts.clear()
}

/**
 * 等待全部在途转移工作完成（仅测试用，让 fire-and-forget 断言可确定）。
 */
export async function flushFailoverWork(): Promise<void> {
  while (failoverWork.size > 0) {
    await Promise.all([...failoverWork])
  }
}

/**
 * 把异步转移工作登记进在途集合（未处理拒绝在此收敛为 WARNING）。
 * @param work 转移工作 promise
 */
function trackFailoverWork(work: Promise<void>): void {
  const tracked = work.catch((error) => {
    console.warn(`${FAILOVER_WARN_PREFIX} ${String(error)}`)
  })
  failoverWork.add(tracked)
  void tracked.finally(() => {
    failoverWork.delete(tracked)
  })
}

/**
 * 结算钩子（executor-settle 在 dispatch settle 后调用，同步边界内发起）：
 * 先消费上下文条目（成功 / 非白名单 / 穷尽均不再保留），仅当失败码命中白名单时
 * 启动 fire-and-forget 转移。
 * @param ctx 插件上下文
 * @param settled 结算信息（childId/任务/stopReason/结构化错误）
 */
export function handleSettledDispatch(ctx: Context, settled: SettledDispatch): void {
  // 结算消费进程内绑定登记（成功/失败终态均消费：child 已不在 running 视野，
  // 登记随之失效；占用统计回退 dispatches 记录 → 主模型位归一）。
  consumeChildModelBinding(settled.id)
  const context = failoverContexts.get(settled.id)
  if (context === undefined) return
  failoverContexts.delete(settled.id)
  if (settled.stopReason !== 'error') return
  const code = settled.error?.code
  if (code === undefined || !isModelInaccessibleCode(code)) return
  trackFailoverWork(runAsyncFailover(ctx, context, settled))
}

/**
 * 结算后按链重派（fire-and-forget）：容量闸重估 → 全量重注入新会话 → 派生新
 * 转移上下文；链穷尽时把尝试链接进 failed 记录并向父会话发穷尽通知。
 * @param ctx 插件上下文
 * @param context 被消费的转移上下文
 * @param settled 触发转移的结算信息
 */
async function runAsyncFailover(
  ctx: Context,
  context: FailoverContext,
  settled: SettledDispatch,
): Promise<void> {
  const code = settled.error?.code ?? ''
  // 链已无剩余：不重派，把完整尝试链接进 failed 记录并通知穷尽。
  if (context.attempt > context.chain.length) {
    await reportExhausted(
      ctx,
      context,
      settled.id,
      context.currentModel,
      code,
      attemptedModelsUpTo(context, context.attempt),
    )
    return
  }
  // 任务不可读 / 已归档：放弃转移（WARNING，不冒泡事件流）。
  const [taskErr, task] = readTask(context.root, context.taskRelPath)
  if (taskErr !== null || task === null) {
    console.warn(
      `${FAILOVER_WARN_PREFIX} cannot read the task record for ${settled.id}; ` +
        `fallback transfer skipped (${taskErr?.message ?? 'task not found'})`,
    )
    return
  }
  // 原工具调用 signal 已随调用结束失效：转移用新的 AbortController。
  const signal = new AbortController().signal
  // 容量闸重估：失败子会话已释放槽位，正常过闸；仍撞限则放弃转移并通知人工重派。
  const running = await collectRunningExecutors(
    ctx.subagents,
    context.parent,
    signal,
    context.root,
    context.taskRelPath,
  )
  const config = loadConfig(context.root)
  const effective = resolveSubagentDefaults(
    config,
    context.kind,
    {},
    'dsh',
    readMainModel(context.parent),
  )
  const capacityText = evaluateCapacityGate(
    running,
    context.kind,
    config.executor.maxConcurrent,
    effective.maxConcurrent,
  )
  if (capacityText !== null) {
    await notifyFailoverParent(
      ctx,
      context.parent.id,
      buildFailoverNotice({
        kind: context.kind,
        title: context.title,
        deadModel: context.currentModel,
        code,
        attempt: context.attempt + 1,
        total: context.chain.length + 1,
        blockedReason: `the executor capacity gate rejected the retry (${capacityText})`,
      }),
    )
    return
  }
  const total = context.chain.length + 1
  const startIndex = context.attempt - 1
  // 上一跳失败信息：每次转移先通知（nextModel = 本跳模型），再按新模型重派。
  let deadModel = context.currentModel
  let lastCode = code
  let lastFailedChildId = settled.id
  let previousChildId = settled.id
  let pendingChildId: SessionId | undefined
  let outcome: FallbackChainOutcome<{ childId: string }>
  try {
    outcome = await runFallbackChain({
      chain: context.chain,
      startIndex,
      attemptedModels: attemptedModelsUpTo(context, context.attempt),
      start: async (step) => {
        // 每跳先清空上一跳预留的 childId：本跳在注入/通知阶段失败时，失败回调不得
        // 把上一跳的 childId 误记为本跳尝试（dispatches 审计须如实）。
        pendingChildId = undefined
        await notifyFailoverParent(
          ctx,
          context.parent.id,
          buildFailoverNotice({
            kind: context.kind,
            title: context.title,
            deadModel,
            code: lastCode,
            nextModel: step.model,
            attempt: step.attempt,
            total,
          }),
        )
        const note = buildFailoverNote({
          deadModel,
          code: lastCode,
          wasContinuation: context.continued,
        })
        const [localErr, localDirectives] = composeLocalDirectivesText(context.root, context.kind)
        if (localErr !== null) throw localErr
        const built = buildFullInjection(
          context.root,
          context.taskRelPath,
          context.kind,
          `${context.firstPrompt}\n\n${note}`,
          localDirectives,
          context.hasLsp,
        )
        pendingChildId = SessionId(randomUUID())
        registerExecutorToolfaceChild(pendingChildId, context.allowNames)
        try {
          const started = await ctx.subagents.startActivation({
            provider: SPAWN_PROVIDER,
            label: buildChildLabel(
              context.root,
              context.taskRelPath,
              context.kind,
              context.title,
            ),
            childId: pendingChildId,
            request: {
              prompt: [{ type: 'text', text: built.text }],
              parent: context.parent,
              agentOptions: buildFallbackAgentOptions(step),
              maxDepth: 1,
            },
            signal,
            delivery: 'parent',
          })
          return { childId: started.childId }
        } catch (error) {
          releaseExecutorToolfaceChild(pendingChildId)
          throw error
        }
      },
      onAttemptFailed: (step, error) => {
        if (pendingChildId === undefined) return
        const failedChildId = pendingChildId
        recordFailedDispatchAttempt({
          root: context.root,
          taskRelPath: context.taskRelPath,
          kind: context.kind,
          title: context.title,
          childId: failedChildId,
          error,
          model: step.model,
          ...(step.effort !== undefined ? { effort: step.effort } : {}),
          modelSource: DISPATCH_MODEL_SOURCES.FALLBACK,
          fallbackOf: previousChildId,
          fallbackAttempt: step.attempt,
          toolsAllow: [...context.allowNames],
        })
        lastFailedChildId = failedChildId
        previousChildId = failedChildId
        deadModel = step.model
        lastCode = extractFailureCode(error) ?? lastCode
      },
    })
  } catch (error) {
    if (error instanceof FallbackChainExhaustedError) {
      await reportExhausted(ctx, context, lastFailedChildId, deadModel, lastCode, error.models)
    } else {
      // 非白名单的同步失败：保留 failed 记录，不重派（等待人工处置）。
      console.warn(`${FAILOVER_WARN_PREFIX} ${String(error)}`)
    }
    return
  }
  // 留痕与登记：新 child 一条 running 记录（链式关联上一跳）、结算定位、research 守卫、
  // 进程内绑定登记（重派 childId 换新，按实际生效模型登记）、以及派生新的转移上下文
  // （跳序号 +1，续用标记重置）。
  registerChildModelBinding(outcome.result.childId, context.kind, outcome.model)
  const [recordErr] = recordExecutorDispatch(context.root, context.taskRelPath, {
    kind: context.kind,
    title: context.title,
    childId: outcome.result.childId,
    toolsAllow: [...context.allowNames],
    model: outcome.model,
    ...(outcome.effort !== undefined ? { effort: outcome.effort } : {}),
    modelSource: DISPATCH_MODEL_SOURCES.FALLBACK,
    fallbackOf: previousChildId,
    fallbackAttempt: outcome.attempt,
  })
  if (recordErr !== null) {
    console.warn(`${DISPATCH_WARN_PREFIX} ${recordErr}`)
  }
  trackDispatchSettle(outcome.result.childId, context.root, context.taskRelPath)
  if (WRITE_GUARDED_KINDS.includes(context.kind)) {
    registerWriteGuardChildId(context.root, outcome.result.childId)
  }
  registerFailoverContext(outcome.result.childId, {
    ...context,
    continued: false,
    attempt: outcome.attempt,
    currentModel: outcome.model,
  })
}

/**
 * 穷尽收尾：把完整尝试链接进最近一条 failed 记录的 error 行，并投递穷尽通知。
 * @param ctx 插件上下文
 * @param context 转移上下文
 * @param failedChildId 最近一跳失败尝试的 childId
 * @param deadModel 最后一跳的失败模型
 * @param code 最后一跳的错误码
 * @param attemptedModels 已尝试的完整模型链
 */
async function reportExhausted(
  ctx: Context,
  context: FailoverContext,
  failedChildId: string,
  deadModel: string,
  code: string,
  attemptedModels: readonly string[],
): Promise<void> {
  const suffix = `${CHAIN_EXHAUSTED_PREFIX}${attemptedModels.join(CHAIN_SEPARATOR)})`
  const [suffixErr] = appendDispatchErrorSuffix(
    context.root,
    context.taskRelPath,
    failedChildId,
    suffix,
  )
  if (suffixErr !== null) {
    console.warn(`${FAILOVER_WARN_PREFIX} ${suffixErr}`)
  }
  await notifyFailoverParent(
    ctx,
    context.parent.id,
    buildFailoverNotice({
      kind: context.kind,
      title: context.title,
      deadModel,
      code,
      attempt: attemptedModels.length,
      total: attemptedModels.length,
    }),
  )
}

/**
 * 截至某一跳的已尝试模型链（穷尽后缀与穷尽通知的完整链）：主模型 + 已消费的链条目。
 * @param context 转移上下文
 * @param attempt 当前跳序号（主模型 = 1）
 * @returns 模型字符串列表
 */
function attemptedModelsUpTo(
  context: FailoverContext,
  attempt: number,
): string[] {
  return [
    context.primaryModel,
    ...context.chain.slice(0, Math.max(0, attempt - 1)).map((entry) => entry.model),
  ]
}
