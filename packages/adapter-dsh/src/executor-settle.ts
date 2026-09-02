/**
 * adapter-dsh executor 派发终态自动回填：subagent/end 全局监听 + childId→任务定位
 * 注册表。
 *
 * 设计意图：
 * - 派发时刻（executor.ts）调用 trackDispatchSettle 把 childId → {root, taskRelPath}
 *   记入进程内注册表：subagent/end 载荷不含父会话/cwd（事件 args 只有 info），
 *   无法回推任务，必须派发时显式登记；同一子代理会话始终属于同一任务，同
 *   childId 多轮派发覆盖为最新任务（等价幂等）；
 * - apply(ctx) 经 registerExecutor 注册全局 subagent/end 监听（先例
 *   effort-inject.ts:33）：按载荷 info.id（=childId；runId 每 epoch 随机不可用）
 *   关联 dispatches 记录，把 running 回填为 completed/failed + 一行错误摘要，
 *   主会话不参与；
 * - 终态映射：stopReason completed → completed（不写 error）；aborted/error/
 *   max-tokens/refusal 等 → failed + stopReason 一行映射（不截取子代理输出）；
 *   业务结论（如 check 报 FAIL）不在本映射——生命周期 stopReason 只看运行异常；
 * - 每条回填后消费注册表条目（每 epoch 结算一次；后续续用轮派发时重新登记），
 *   避免注册表无界增长；
 * - 监听器同步边界，内部 try/catch 只告警不冒泡（与 effort-inject 同策）。
 */
import type { Context } from '@deepseek-ai/cordis'

import { ERR_PREFIX, settleExecutorDispatch } from '@workloom-ai/core'
import type { DispatchStatus } from '@workloom-ai/core'

/** 回填失败告警前缀（记录失败只告警，不阻塞事件流）。 */
const SETTLE_WARN_PREFIX = `${ERR_PREFIX.executor}: WARNING: failed to settle executor dispatch:`

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

/**
 * 登记一次派发的回填定位（executor.ts 派发时刻调用）：childId 建立后记录所在
 * 任务，供 subagent/end 监听回填终态。
 * @param childId continuable 子代理 durable session id
 * @param root 项目根
 * @param taskRelPath 任务目录相对 .workloom 的路径
 */
export function trackDispatchSettle(childId: string, root: string, taskRelPath: string): void {
  pendingByChildId.set(childId, { root, taskRelPath })
}

/**
 * 注册 subagent/end 全局监听（apply 激活时经 registerExecutor 调用）：按载荷
 * info.id 关联 dispatches 记录回填终态（completed/failed + 一行错误摘要）。
 * @param ctx 插件作用域上下文（subagent/end 为全局事件，此处监听可见所有子代理）
 * @returns 注销函数（fiber 生命周期自动清理）
 */
export function registerDispatchSettlement(ctx: Context): () => void {
  return ctx.on('subagent/end', (info: SubagentEndInfoLike) => {
    try {
      const pending = pendingByChildId.get(info.id)
      if (pending === undefined) return
      // 先消费条目（每 epoch 结算一次；后续续用轮派发时重新登记）。
      pendingByChildId.delete(info.id)
      const [err] = settleExecutorDispatch(pending.root, pending.taskRelPath, {
        childId: info.id,
        ...settleTerminal(info.stopReason),
      })
      if (err !== null) {
        console.warn(`${SETTLE_WARN_PREFIX} ${err}`)
      }
    } catch (error) {
      console.warn(`${SETTLE_WARN_PREFIX} ${String(error)}`)
    }
  })
}

/**
 * 终态映射（纯函数）：completed → completed（不写 error）；其余 stopReason →
 * failed + 一行摘要（不截取子代理输出）。未知 reason 兜底 abnormal 文案。
 * @param stopReason subagent/end 载荷的 stopReason（可能缺省）
 * @returns 回填的 status 与可选 error
 */
function settleTerminal(stopReason: string | undefined): {
  status: Exclude<DispatchStatus, 'running'>
  error?: string
} {
  if (stopReason === 'completed') return { status: 'completed' }
  return { status: 'failed', error: stopReasonSummary(stopReason) }
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
