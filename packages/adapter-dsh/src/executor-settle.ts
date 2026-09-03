/**
 * adapter-dsh executor 派发终态自动回填：session/event 真实错误捕获 + subagent/end
 * 全局监听 + childId→任务定位注册表。
 *
 * 设计意图：
 * - 派发时刻（executor.ts）调用 trackDispatchSettle 把 childId → {root, taskRelPath}
 *   记入进程内注册表：subagent/end 载荷不含父会话/cwd（事件 args 只有 info），
 *   无法回推任务，必须派发时显式登记；同一子代理会话始终属于同一任务，同
 *   childId 多轮派发覆盖为最新任务（等价幂等）；
 * - apply(ctx) 经 registerExecutor 注册两条全局监听（先例 effort-inject.ts:33）：
 *   - session/event：对登记表内 childId 捕获最近一次 turn/end 的 error（真实 DSH
 *     reason.error 为结构化 { message, code }），压成一行 `<message> (<code>)`
 *     覆盖式写入 lastTurnErrorByChildId——结算时才有真实错误可写，主会话不再靠
 *     猜（UNKNOWN_MODEL 三连误诊的根因即此处只有 stopReason 泛化摘要）；
 *   - subagent/end：按载荷 info.id（=childId；runId 每 epoch 随机不可用）关联
 *     dispatches 记录，把 running 回填为 completed/failed + 一行错误摘要；
 * - 终态映射：stopReason completed → completed（不写 error）；error → 有登记真实
 *   错误则整体替换（单行，上限 200 字符，截断加 …），无登记回退泛化摘要并记
 *   一条 WARNING（登记缺失/提取失败都不阻塞结算）；aborted/max-tokens/refusal 等
 *   维持 stopReason 一行映射（不截取子代理输出）；业务结论（如 check 报 FAIL）
 *   不在本映射——生命周期 stopReason 只看运行异常；
 * - 两条注册表与结算同生命周期：trackDispatchSettle 派发时清除上轮残留错误
 *   （错误登记覆盖式取最近、仅 error 终态消费），每条结算后消费条目（每 epoch
 *   结算一次；后续续用轮派发时重新登记），避免注册表无界增长；
 * - 监听器同步边界，内部 try/catch 只告警不冒泡（与 effort-inject 同策）。
 */
import type { Context } from '@deepseek-ai/cordis'

import { ERR_PREFIX, settleExecutorDispatch } from '@workloom-ai/core'
import type { DispatchStatus } from '@workloom-ai/core'

/** 回填失败告警前缀（记录失败只告警，不阻塞事件流）。 */
const SETTLE_WARN_PREFIX = `${ERR_PREFIX.executor}: WARNING: failed to settle executor dispatch:`

/** 结算回退告警前缀（error 登记缺失/提取失败：回退泛化文案，只告警不阻塞）。 */
const SETTLE_FALLBACK_WARN_PREFIX = `${ERR_PREFIX.executor}: WARNING: no captured turn/end error for child`

/** 事件捕获异常告警前缀（监听异常只告警，不冒泡事件流）。 */
const CAPTURE_WARN_PREFIX = `${ERR_PREFIX.executor}: WARNING: failed to capture turn/end error:`

/** 真实错误写入 dispatches 的单行上限（超长截断并追加 …，行展示可读）。 */
const ERROR_LINE_MAX = 200

/** 截断后缀（单行错误超长时追加，标识截断发生）。 */
const ERROR_TRUNCATION_SUFFIX = '…'

/** subagent/end 载荷的最小形状（id=childId；stopReason 终态，可能缺省）。 */
interface SubagentEndInfoLike {
  id: string
  stopReason?: string
}

/** 回填定位：childId → 派发所在任务（subagent/end 按 id 关联）。 */
interface PendingSettle {
  root: string
  taskRelPath: string
}

/** childId → 派发所在任务（进程内注册表，派发时刻登记、结算时消费）。 */
const pendingByChildId = new Map<string, PendingSettle>()

/** childId → 最近一次 turn/end error 的单行文本（进程内登记表，派发时预置、结算时消费）。 */
const lastTurnErrorByChildId = new Map<string, string>()

/**
 * 登记一次派发的回填定位（executor.ts 派发时刻调用）：childId 建立后记录所在
 * 任务，供 subagent/end 监听回填终态；同点预置错误登记表——清除上轮未结算残留
 * （上一 epoch 未结算时 trackDispatchSettle 会覆盖 pending，须同步清错误，
 * 否则本轮无新 error 也会消费到上轮错误）。
 * @param childId continuable 子代理 durable session id
 * @param root 项目根
 * @param taskRelPath 任务目录相对 .workloom 的路径
 */
export function trackDispatchSettle(childId: string, root: string, taskRelPath: string): void {
  pendingByChildId.set(childId, { root, taskRelPath })
  lastTurnErrorByChildId.delete(childId)
}

/**
 * 注册终态回填两条全局监听（apply 激活时经 registerExecutor 调用）：
 * session/event 捕获登记表内 childId 的真实错误，subagent/end 按载荷 info.id
 * 关联 dispatches 记录回填终态（completed/failed + 一行错误摘要）。
 * @param ctx 插件作用域上下文（两事件均为全局事件，此处监听可见所有会话/子代理）
 * @returns 统一注销函数（fiber 生命周期自动清理）
 */
export function registerDispatchSettlement(ctx: Context): () => void {
  const disposeCapture = ctx.on('session/event', captureTurnEndError)
  const disposeSettle = ctx.on('subagent/end', (info: SubagentEndInfoLike) => {
    try {
      const pending = pendingByChildId.get(info.id)
      if (pending === undefined) return
      // 先消费条目（每 epoch 结算一次；后续续用轮派发时重新登记）。
      pendingByChildId.delete(info.id)
      const capturedError = lastTurnErrorByChildId.get(info.id)
      lastTurnErrorByChildId.delete(info.id)
      if (info.stopReason === 'error' && capturedError === undefined) {
        // 登记缺失/提取失败：回退泛化文案并记一条 WARNING，不阻塞结算。
        console.warn(`${SETTLE_FALLBACK_WARN_PREFIX} ${info.id}; settled with the generic summary`)
      }
      const [err] = settleExecutorDispatch(pending.root, pending.taskRelPath, {
        childId: info.id,
        ...settleTerminal(info.stopReason, capturedError),
      })
      if (err !== null) {
        console.warn(`${SETTLE_WARN_PREFIX} ${err}`)
      }
    } catch (error) {
      console.warn(`${SETTLE_WARN_PREFIX} ${String(error)}`)
    }
  })
  return () => {
    disposeCapture()
    disposeSettle()
  }
}

/**
 * session/event 全局监听（登记表内 childId 的真实错误捕获）：仅消费 turn/end 且
 * 仅限登记表内 childId；reason.kind=error 且载荷可解码时，把 `<message> (<code>)`
 * 覆盖式写入登记表（取最近一次）。解码失败/非 error 终态静默跳过——结算时按
 * 登记缺失回退泛化文案（此处不告警，避免正常流噪声）。监听器同步边界：内部
 * 异常只告警，不向事件流冒泡。
 * 参数用 unknown 做运行时防御（session/event 为强类型联合事件，mock/异常载荷
 * 均不可信）；登记表内 childId 判定兼容 unknown 形状的 session。
 * @param session 事件所属 durable 会话（id=childId）
 * @param event 会话事件（turn/end 的 data.reason 携带结构化失败）
 */
function captureTurnEndError(session: unknown, event: unknown): void {
  try {
    if (session === null || typeof session !== 'object') return
    const childId = (session as { id?: unknown }).id
    if (typeof childId !== 'string' || !pendingByChildId.has(childId)) return
    if (event === null || typeof event !== 'object') return
    if ((event as { type?: unknown }).type !== 'turn/end') return
    const data = (event as { data?: unknown }).data
    const reason =
      data === null || typeof data !== 'object' ? undefined : (data as { reason?: unknown }).reason
    const errorText = extractTurnErrorText(reason)
    if (errorText === null) return
    lastTurnErrorByChildId.set(childId, errorText)
  } catch (error) {
    console.warn(`${CAPTURE_WARN_PREFIX} ${String(error)}`)
  }
}

/**
 * 提取 turn/end 错误载荷为单行真实错误（纯函数，独立可测）：仅 reason.kind =
 * 'error' 且 error 为 { message, code }（均为非空 string）时返回
 * `<message> (<code>)`，内部换行/空白折叠为单个空格；形状不符/字段缺失返回
 * null（解码失败，调用方按登记缺失回退泛化文案）。与 DSH 事件契约对齐：
 * turn/end 的 error 恒为结构化 LlmFailure（message+code，code 缺失时 DSH 已
 * 扁平化为 'UNKNOWN'），故 message/code 任一非空 string 缺失都视为不可解码。
 * @param reason turn/end 的终止原因（可能缺失/形状未知）
 * @returns 单行真实错误，或 null（非 error 终态/解码失败）
 */
export function extractTurnErrorText(reason: unknown): string | null {
  if (reason === null || typeof reason !== 'object') return null
  const kind = (reason as { kind?: unknown }).kind
  if (kind !== 'error') return null
  const error = (reason as { error?: unknown }).error
  if (error === null || typeof error !== 'object') return null
  const message = (error as { message?: unknown }).message
  const code = (error as { code?: unknown }).code
  if (typeof message !== 'string' || message.trim() === '') return null
  if (typeof code !== 'string' || code.trim() === '') return null
  // 折叠内部空白为单行（dispatches.error 按行展示，注入/审计可读）。
  return `${message.replace(/\s+/g, ' ').trim()} (${code.trim()})`
}

/**
 * 终态映射（纯函数）：completed → completed（不写 error）；error → 有登记真实
 * 错误则整体替换（压行 + 200 字符截断），无登记回退泛化摘要；其余 stopReason →
 * failed + 一行摘要（不截取子代理输出）。未知 reason 兜底 abnormal 文案。
 * @param stopReason subagent/end 载荷的 stopReason（可能缺省）
 * @param capturedError 登记表内最近一次 turn/end error（可能缺失）
 * @returns 回填的 status 与可选 error
 */
function settleTerminal(
  stopReason: string | undefined,
  capturedError: string | undefined,
): {
  status: Exclude<DispatchStatus, 'running'>
  error?: string
} {
  if (stopReason === 'completed') return { status: 'completed' }
  const error =
    stopReason === 'error' && capturedError !== undefined
      ? limitErrorLine(capturedError)
      : stopReasonSummary(stopReason)
  return { status: 'failed', error }
}

/**
 * stopReason → 一行错误摘要（与 DSH settlementSummary 措辞同风格；仅取终止原因，
 * 不截取子代理输出文本）。
 * @param reason 终止原因（可能缺省）
 * @returns 一行摘要
 */
function stopReasonSummary(reason: string | undefined): string {
  switch (reason) {
    case 'aborted':
      return 'the executor was stopped before it finished'
    case 'error':
      return 'the executor failed before it finished'
    case 'max-tokens':
      return 'the executor ran out of tokens before it finished'
    case 'refusal':
      return 'the executor declined the task'
    default:
      return `the executor ended abnormally (${reason ?? 'unknown'})`
  }
}

/**
 * 真实错误压行并截断（结算写入前）：空白/换行折叠为单个空格并 trim；超过 200
 * 字符截断并追加 …（单行上限 200 的语义：截断处不计后缀长度，后缀标识截断）。
 * @param errorText 登记表内真实错误（extractTurnErrorText 产物，非空）
 * @returns 单行、上限 200 字符的错误文本
 */
function limitErrorLine(errorText: string): string {
  const oneLine = errorText.replace(/\s+/g, ' ').trim()
  if (oneLine.length <= ERROR_LINE_MAX) return oneLine
  return `${oneLine.slice(0, ERROR_LINE_MAX)}${ERROR_TRUNCATION_SUFFIX}`
}
