/**
 * adapter-dsh executor 的 continuable 会话操作：续用定位（dispatches 同 kind 校验）、
 * turn 事件面终止判定与一轮 turn 的结算。
 *
 * 设计意图：
 * - 与 executor.ts（工具注册与执行编排）分离，聚焦 continuable 生命周期：
 *   startContinuable/followup 之后的「定位 → 等待 → 判定 → 输出 → drain」全部在此；
 * - 终止判定依赖会话事件面（continuable 无 run.result）：最后一个 turn/end 缺失或
 *   reason.kind 非 completed 即异常终止（fail loud，不附输出），避免把中止当成功消费；
 * - drain 释放 Activation 后会话持久化保留，后续 followup 可 cold-resume 再续用
 *   （@deepseek-ai/dsh-subagent followup 契约：absent Activation cold-resume）。
 */
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { finalAssistantOutput } from '@deepseek-ai/dsh-subagent'

import {
  buildExecutorReceipt,
  buildSpawnBindingReceipt,
  EMPTY_OUTPUT_TEXT,
  ERR_PREFIX,
  readTask,
} from '@workloom-ai/core'
import type {
  DispatchRecord,
  ExecutorInjectionStats,
  ResolveSubagentDefaultsResult,
} from '@workloom-ai/core'

import type { MinimalAgent } from './executor.js'

/** 续用定位入参 `continue_executor` 的 'latest' 魔法值（复用 dispatches 同 kind 最近一次）。 */
const REUSE_LATEST = 'latest'

/** 释放子代理 Activation 失败告警前缀（运行时文案英文；释放失败不阻塞结果返回）。 */
const DRAIN_WARN_PREFIX = `${ERR_PREFIX.executor}: WARNING: failed to release continuable child:`

/** turn/end 终止原因的最小形状（continuable 事件面；error 携带结构化失败）。 */
interface TurnEndReasonLike {
  kind: string
  error?: { message?: string }
}

/** 输出边界之后的 child 会话事件切片（读 events 的最小投影）。 */
type EventSlice = readonly SessionEvent[]

/** 一轮 executor turn 的结算元数据（前台结算/后台 receipt 共用）。 */
export interface TurnMeta {
  forced: boolean
  reused: boolean
  /** 注入统计（receipt 渲染用；总字节取实际发送内容，计数来自 buildExecutorPrompt stats）。 */
  injection: ExecutorInjectionStats
  /**
   * 续派轮的 spawn 绑定（design §8.3）：子会话首次派发记录落盘的 model/effort。
   * reused=true 时由 executor.ts 读首次派发记录填入；值为空/旧记录无绑定字段时
   * 回执渲染 (unrecorded spawn binding)。新派轮不设（undefined），走现状渲染。
   */
  spawnBinding?: { model?: string; effort?: string }
}

/** collectExecutorTurn 消费的生效默认值形状（core ResolveSubagentDefaultsResult）。 */
export type ResolvedDefaultsLike = ResolveSubagentDefaultsResult

/**
 * 结算一轮 executor turn（前台阻塞语义）：等待子代理 idle，按事件面判定终止，
 * 取本轮输出并返回。
 * @param ctx 插件上下文（agents 服务）
 * @param childId 子代理 durable session id
 * @param meta 本轮元数据（forced/reused/injection）
 * @param effective 生效的 model/effort（receipt 渲染）
 * @returns canonical 结果
 */
export async function collectExecutorTurn(
  ctx: { agents: { get(id: string): MinimalAgent | undefined } },
  childId: string,
  meta: TurnMeta,
  effective: ResolvedDefaultsLike,
): Promise<{ kind: 'foreground'; runId: string; output: { type: 'text'; text: string }[] }> {
  const child = ctx.agents.get(childId)
  if (child === undefined) {
    throw new Error(`${ERR_PREFIX.executor}: child agent ${childId} is not resolvable`)
  }
  // 输出边界：只取本轮自身产出的事件（排除 seed/父历史种子与上一轮事件前缀）。
  const boundary = child.session.events.length
  await child.whenIdle()
  const events: EventSlice = child.session.events.slice(boundary)
  // 异常终止：最后一个 turn/end 缺失或 reason.kind 非 completed（aborted/blocked/
  // error/max-tokens/interrupted 等）即转工具错误，不附输出文本（避免把中止/失败
  // 当成功消费）；错误文本取 error 事件的结构化 message，缺失用终止原因兜底文案。
  const endReason = lastTurnEnd(events)
  if (endReason === undefined || endReason.kind !== 'completed') {
    throw new Error(`${ERR_PREFIX.executor}: ${buildAbnormalEndText(endReason)}`)
  }
  const blocks = finalAssistantOutput(events) ?? []
  const text = blocks
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
  // 返回文本尾部追加 receipt 行，标注生效 model/effort 及来源（可观测性）；
  // 配置来源细分（whenMain=<值>/fallback/legacy）随 configSources 渲染；
  // force 放行追加 (forced)、续用轮追加 (reused)，使覆盖/复用一眼可辨；
  // 注入统计（KB 一位小数 + 内联/截断/索引计数）同行追加，可见喂给子代理的规模。
  const receipt = buildTurnReceiptText(meta, effective)
  // 空输出时 receipt 同样保留：可观测性不依赖子代理是否有文本产出（与 adapter-pi 对齐）。
  const baseText = text === '' ? EMPTY_OUTPUT_TEXT : text
  return {
    kind: 'foreground',
    runId: childId,
    output: [{ type: 'text', text: `${baseText}\n\n${receipt}` }],
  }
}

/**
 * 拼装一轮 turn 的 receipt 文本（前台输出尾部与后台返回值共用同一渲染，格式与
 * 任务 A 交付一致）：生效 model/effort 及来源 + 注入统计 + (forced)/(reused) 标注。
 * 续派轮（meta.reused）改用 spawn 绑定渲染（design §8.3）：子会话模型/effort
 * 在派发时已绑定，回执须如实展示 spawn 绑定值，不再回显续派时刻重新解析的
 * 当前配置来源（否则主会话换模型后续派会谎报生效）；spawn 记录无绑定值时显示
 * (unrecorded spawn binding)。
 * @param meta 本轮元数据（forced/reused/injection/spawnBinding）
 * @param effective 生效的 model/effort（仅新派轮 receipt 渲染；续派轮不消费）
 * @returns receipt 文本行
 */
export function buildTurnReceiptText(
  meta: TurnMeta,
  effective: ResolvedDefaultsLike,
): string {
  // 续派轮：绑定值有记录时展示 (spawn binding)，无绑定记录时展示 unrecorded；
  // 新派轮维持 buildExecutorReceipt（(param)/(config: …)/(default)）现状。
  const receiptBase = meta.reused
    ? buildSpawnBindingReceipt({
        binding: meta.spawnBinding ?? null,
        injection: meta.injection,
      })
    : buildExecutorReceipt({
        model: effective.model,
        modelSource: effective.sources.model,
        modelConfigSource: effective.configSources.model,
        modelWhenMainValue: effective.whenMainValue,
        effort: effective.effort,
        effortSource: effective.sources.effort,
        effortConfigSource: effective.configSources.effort,
        effortWhenMainValue: effective.whenMainValue,
        injection: meta.injection,
      })
  return `${meta.forced ? `${receiptBase} (forced)` : receiptBase}${meta.reused ? ' (reused)' : ''}`
}

/**
 * 读取子会话首次派发记录的绑定（design §8.3，纯读取，无副作用）：dispatches 中
 * 最早出现该 childId 的记录即 spawn 记录（dispatches append-only，同 childId 的
 * 续派记录在后续位置），取其落盘的 model/effort 供续派轮沿用；旧记录无绑定字段
 * 时返回 null（回执渲染 (unrecorded spawn binding)）。读取失败（任务不可读）
 * 返回 null，不抛错——续派轮有 spawnBinding 与否只影响回执标注，不阻塞派发。
 * @param root 项目根
 * @param taskRelPath 任务目录相对 .workloom 的路径
 * @param childId 续用子代理的 durable session id
 * @returns 首次派发记录的绑定 {model?, effort?}，无记录/无绑定字段返回 null
 */
export function readSpawnBinding(
  root: string,
  taskRelPath: string,
  childId: string,
): { model?: string; effort?: string } | null {
  const [taskErr, task] = readTask(root, taskRelPath)
  if (taskErr !== null || task === null) return null
  const dispatches: readonly DispatchRecord[] = task.dispatches ?? []
  for (const entry of dispatches) {
    if (entry === undefined) continue
    if (entry.childId !== childId) continue
    const model = entry.model
    const effort = entry.effort
    if (model === undefined && effort === undefined) return null
    return { model, effort }
  }
  return null
}

/**
 * 定位续用 childId（dispatches 记录，同 kind 边界）：'latest' 取同 kind 最近一条的
 * childId；显式 id 必须在 dispatches 中存在且 kind 一致，否则拒绝（跨 kind / 无记录
 * 均返回提示）。定位失败不抛错——续用是主会话显式请求，提示面返回更利于模型修正。
 * @param root 项目根
 * @param taskRelPath 任务目录相对 .workloom 的路径
 * @param kind 本次调用的 executor kind（同 kind 校验基准）
 * @param input continue_executor 参数值（'latest' 或记录的 childId）
 * @returns [失败提示, childId]（失败时 childId 为空串）
 */
export function locateContinueChildId(
  root: string,
  taskRelPath: string,
  kind: string,
  input: string,
): [string | null, string] {
  const [taskErr, task] = readTask(root, taskRelPath)
  if (taskErr !== null || task === null) {
    return [
      `${ERR_PREFIX.executor}: cannot read the task record to locate the previous executor session ` +
        `(${taskErr?.message ?? 'task not found'}); dispatch a new executor instead`,
      '',
    ]
  }
  const dispatches: readonly DispatchRecord[] = task.dispatches ?? []
  if (input === REUSE_LATEST) {
    for (let i = dispatches.length - 1; i >= 0; i--) {
      const entry = dispatches[i]
      if (entry === undefined) continue
      if (entry.kind !== kind) continue
      if (entry.childId !== undefined && entry.childId !== '') return [null, entry.childId]
    }
    return [
      `${ERR_PREFIX.executor}: no previous ${kind} executor dispatch with a recorded child id ` +
        `was found for this task; dispatch a new executor or pass the exact childId of a previous ` +
        `${kind} dispatch`,
      '',
    ]
  }
  const match = dispatches.find((entry) => entry.childId === input)
  if (match === undefined) {
    return [
      `${ERR_PREFIX.executor}: no dispatch record with childId "${input}" was found for this task; ` +
        `pass "${REUSE_LATEST}" or the childId of a previous ${kind} dispatch`,
      '',
    ]
  }
  if (match.kind !== kind) {
    return [
      `${ERR_PREFIX.executor}: cross-kind reuse rejected: session "${input}" belongs to a ` +
        `${match.kind} dispatch, but this call is kind ${kind}; reuse is limited to the same kind`,
      '',
    ]
  }
  return [null, input]
}

/**
 * 提取事件切片中最后一个 turn/end 的终止原因（continuable 无 run.result，事件面是
 * 唯一终止信号；正常一轮 = 最后一个 turn 以 completed 结束）。
 * @param events 本轮事件切片（boundary 之后）
 * @returns 终止原因（kind + error 结构化失败），无 turn/end 时 undefined
 */
function lastTurnEnd(events: EventSlice): TurnEndReasonLike | undefined {
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i]
    if (event === undefined) continue
    if (event.type === 'turn/end') {
      return event.data.reason as TurnEndReasonLike
    }
  }
  return undefined
}

/**
 * 组装异常终止错误文本（不附输出）：error 终止取结构化 message；其余终止原因用
 * 兜底文案（与 one-shot 的 stopReason 兜底风格一致）；无 turn/end 无法确认完成。
 * @param reason 终止原因（可能缺失）
 * @returns 错误文本
 */
function buildAbnormalEndText(reason: TurnEndReasonLike | undefined): string {
  if (reason !== undefined) {
    const message = reason.error?.message
    if (reason.kind === 'error' && message !== undefined && message !== '') {
      return message
    }
    return `the executor subagent ended with ${reason.kind}`
  }
  return 'the executor subagent ended without a completed turn'
}

/**
 * 释放子代理 Activation（drain；失败仅告警，不阻塞结果返回：子代理已 idle）。
 * 会话持久化保留，后续 followup 可 cold-resume 再续用。
 * @param ctx 插件上下文（subagents 服务）
 * @param parent 发起 agent（drain 授权方）
 * @param childId 子代理 durable session id
 */
export async function drainContinuableChild(
  ctx: {
    subagents: {
      drainContinuableChildren(parent: MinimalAgent, childIds: readonly string[]): Promise<void>
    }
  },
  parent: MinimalAgent,
  childId: string,
): Promise<void> {
  try {
    await ctx.subagents.drainContinuableChildren(parent, [childId])
  } catch (error) {
    console.warn(`${DRAIN_WARN_PREFIX} ${String(error)}`)
  }
}
