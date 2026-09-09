/**
 * adapter-pi 的 executor 派发终态回填（与 DSH 同名同职责）。
 *
 * 设计意图：
 * - 每个 child 注册终态监听：agent_end 事件（成功，提取最后非空 assistant
 *   text——复用 pi-events 的 extractExecutorText 语义）与 close/error（异常，
 *   stderr 尾部摘要沿用 4KB 上限）；
 * - 回填：调 core settleExecutorDispatch 把 dispatches 的 running 改
 *   completed/failed + 一行错误摘要（200 字符截断口径与 DSH 一致）；
 * - 回投（R1）：settle 成功路径把「终文 + receipt 尾行」经
 *   pi.sendMessage({ customType: 'workloom-executor-report', content, display: true })
 *   投递给登记的 parentSessionId 主会话；回投失败仅 WARNING（前缀沿用
 *   ERR_PREFIX.executor）。前台派发不回投（工具返回值即报告，避免双份）。
 */

import { ERR_PREFIX, readTask, settleExecutorDispatch } from '@workloom-ai/core'
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'

import { applyEvent, extractExecutorText, type PiEventState } from './pi-events.ts'
import type { RpcConnection } from './pi-rpc.ts'
import { unregisterChild, type ChildRegistryEntry } from './pi-child-registry.ts'

/** 回投失败告警前缀（回投失败只 WARNING，不阻塞结算）。 */
const REPORT_WARN_PREFIX = `${ERR_PREFIX.executor}: WARNING: failed to report executor completion:`

/** 回填失败告警前缀（记录失败只告警，不阻塞事件流）。 */
const SETTLE_WARN_PREFIX = `${ERR_PREFIX.executor}: WARNING: failed to settle executor dispatch:`

/** stderr 尾部摘要上限（错误报告用，超限截断）。 */
const STDERR_TAIL_LIMIT = 4096

/** 错误摘要单行上限（与 DSH 一致：超长截断并追加 …）。 */
const ERROR_LINE_MAX = 200

/** 截断后缀（单行错误超长时追加）。 */
const ERROR_TRUNCATION_SUFFIX = '…'

/** 完成报告的 customType（主会话经此类型识别 executor 完成通知）。 */
export const EXECUTOR_REPORT_CUSTOM_TYPE = 'workloom-executor-report'

/** 主会话结束时的失败摘要（R6 孤儿回收联动）。 */
export const HOST_SESSION_ENDED_TEXT = 'host session ended'

/**
 * 活跃 settle 登记表（按 sessionId → supersede 句柄）：同会话再注册（续用轮）时
 * 把旧 settle 置为已结算并移除其 abort 监听——旧 settle 的事件回调已被单槽
 * onEvent 覆盖、永不再 finish，残留监听会造成第二次回投（容器 check P1）。
 */
const activeSettles = new Map<string, () => void>()

/** settle 结果（成功终文或失败摘要）。 */
export interface SettleResult {
  /** 终态 */
  status: 'completed' | 'failed'
  /** 成功时的终文（assistant 输出） */
  text?: string
  /** 失败时的错误摘要 */
  error?: string
}

/**
 * 注册一个 child 的终态监听（executor.ts 派发后调用）：agent_end → 成功，
 * close/error → 异常。settle 完成后回填 dispatches + 回投报告（后台）。
 * 返回 Promise 在前台派发时用于阻塞等待终文。
 * @param pi Extension API（回投报告用）
 * @param connection RPC 连接
 * @param entry child 注册表条目
 * @param sessionId child 会话 id（= childId，用于 dispatches 回填关联）
 * @param foreground 是否前台派发（true = 不回投报告）
 * @param signal 取消信号（abort 时优先以 failed 结算，覆盖 agent_end 的 completed）
 * @returns settle 结果 Promise（前台用于 await，后台 fire-and-forget）
 */
export function registerChildSettle(
  pi: ExtensionAPI,
  connection: RpcConnection,
  entry: ChildRegistryEntry,
  sessionId: string,
  foreground: boolean,
  signal?: AbortSignal,
): Promise<SettleResult> {
  return new Promise<SettleResult>((resolve) => {
    const child = entry.child
    const state: PiEventState = { textParts: [], done: false }
    const stderrParts: string[] = []
    let settled = false
    let onAbort: (() => void) | undefined

    /** 完成结算（内部）：循环回填 + 回投（幂等，只执行一次）。
     * 注意：不在此处 unregisterChild——RPC child 是常驻进程，注册表条目移除以
     * child 进程 close 事件为准（design R2：存活续用直接向同一进程发 prompt）。
     *
     * 循环 settle：同 childId 可能有多条 running 条目（steering 续用追加第二条），
     * core settleExecutorDispatch 每次只回填最近一条 running；需循环直到该 childId
     * 无 running 条目为止（agent_end 语义 = 该 run 全部注入工作完成，所有轮次同获终态）。
     * 防御：循环上限 16 次 + 每轮 error 时 WARNING 并停止，杜绝死循环。 */
    const finish = (result: SettleResult): void => {
      if (settled) return
      settled = true
      // 本 settle 已终态：撤销 active 登记（仅当登记仍指向自己，避免误删后继轮）。
      if (activeSettles.get(sessionId) === disposeActive) {
        activeSettles.delete(sessionId)
      }
      const SETTLE_MAX_ROUNDS = 16
      for (let round = 0; round < SETTLE_MAX_ROUNDS; round++) {
        // 回填 dispatches（失败只 WARNING，不阻塞结算）。
        const [settleErr] = settleExecutorDispatch(entry.root, entry.taskRelPath, {
          childId: sessionId,
          status: result.status,
          error: result.error,
        })
        if (settleErr !== null) {
          console.warn(`${SETTLE_WARN_PREFIX} ${settleErr}`)
          break // 出错停止，避免死循环
        }
        // 检查该 childId 是否仍有 running 条目，无则全部已结算。
        if (!hasRunningDispatch(entry.root, entry.taskRelPath, sessionId)) {
          break
        }
      }
      // 回投报告（仅后台派发；前台由工具返回值直接交付，避免双份）。
      if (!foreground) {
        reportCompletion(pi, entry, result)
      }
      resolve(result)
    }

    // supersede 同 sessionId 的旧 settle（续用轮再注册）：置旧侧 settled 并摘除其
    // abort 监听，杜绝「一次 run 两条报告」（容器 check P1）。
    activeSettles.get(sessionId)?.()
    const disposeActive = (): void => {
      settled = true
      if (onAbort !== undefined && signal !== undefined) {
        signal.removeEventListener('abort', onAbort)
      }
    }
    activeSettles.set(sessionId, disposeActive)

    // 取消路径抢占（缺陷 7）：signal.aborted 时立即以 failed 结算，覆盖 agent_end 的 completed。
    // Pi 对被 abort 的 run 同样发 agent_end，原逻辑一律当 completed → 终态失真。
    // 取消结算后 settled 标志阻止随后到达的 agent_end 改写终态。
    if (signal !== undefined) {
      onAbort = (): void => {
        finish({
          status: 'failed',
          error: 'dispatch aborted by main session',
        })
      }
      if (signal.aborted) {
        onAbort()
      } else {
        signal.addEventListener('abort', onAbort, { once: true })
      }
    }

    // 注册事件回调：逐事件 apply（复用 pi-events 的 applyEvent 语义）。
    connection.onEvent((event) => {
      applyEvent(event, state)
      if (event.type === 'agent_end') {
        finish({
          status: 'completed',
          text: extractExecutorText(state.textParts),
        })
      }
    })

    // stderr 收集（只留尾部，上限 4KB）。
    child.stderr?.on('data', (chunk: Buffer | string) => {
      stderrParts.push(typeof chunk === 'string' ? chunk : chunk.toString('utf8'))
    })

    // child 异常退出（error）→ failed。
    child.on('error', (error) => {
      finish({
        status: 'failed',
        error: limitErrorLine(error.message),
      })
    })
    // child 进程 close → 清理注册表（内存 + registry.json 同步）。
    // 不变式：注册表条目移除以 child 进程 close 事件为准——RPC child 是常驻进程，
    // agent_end 后进程仍存活（等待续用），只有 close 时才真正退出。
    // 传 entry 做身份校验：续用重启以同 sessionId 覆盖登记后，旧进程迟到的 close
    // 不得误删新条目。
    child.on('close', (code, signalCode) => {
      // agent_end 已结算时跳过（正常退出路径）。
      if (!settled) {
        const stderrTail = stderrParts.join('').slice(-STDERR_TAIL_LIMIT)
        const status = code !== null ? `code ${code}` : `signal ${signalCode ?? 'unknown'}`
        const head = `child pi exited with ${status}`
        finish({
          status: 'failed',
          error: limitErrorLine(stderrTail === '' ? head : `${head}: ${stderrTail}`),
        })
      }
      // 无论是否已结算，close 时均清理注册表（仅限本 settle 对应的登记条目）。
      unregisterChild(sessionId, entry)
    })
  })
}


/** 回投完成报告给主会话（内部）：终文 + receipt 尾行（简化版，仅标注完成）。 */
function reportCompletion(pi: ExtensionAPI, entry: ChildRegistryEntry, result: SettleResult): void {
  const summary =
    result.status === 'completed'
      ? `executor completed (${entry.kind})`
      : `executor failed (${entry.kind}): ${result.error ?? 'unknown error'}`
  const content = result.text !== undefined && result.text !== ''
    ? `${result.text}\n\n[workloom executor report] ${summary}`
    : `[workloom executor report] ${summary}`
  try {
    pi.sendMessage({
      customType: EXECUTOR_REPORT_CUSTOM_TYPE,
      content,
      display: true,
    })
  } catch (error) {
    console.warn(`${REPORT_WARN_PREFIX} ${String(error)}`)
  }
}

/**
 * 错误摘要压行并截断（结算写入前）：空白/换行折叠为单个空格并 trim；超过 200
 * 字符截断并追加 …（与 DSH limitErrorLine 同口径）。
 * @param errorText 错误文本（非空）
 * @returns 单行、上限 200 字符的错误文本
 */
function limitErrorLine(errorText: string): string {
  const oneLine = errorText.replace(/\s+/g, ' ').trim()
  if (oneLine.length <= ERROR_LINE_MAX) return oneLine
  return `${oneLine.slice(0, ERROR_LINE_MAX)}${ERROR_TRUNCATION_SUFFIX}`
}

/**
 * 检查指定 childId 是否仍有 running 的 dispatch 条目（内部）。
 * 用于循环 settle：同 childId 可能有多条 running（steering 续用追加），
 * 需全部结算。读取失败返回 false（视为无 running，停止循环）。
 * @param root 项目根
 * @param taskRelPath 任务目录相对 .workloom 的路径
 * @param childId 子代理会话 id
 * @returns 仍有 running 条目时 true
 */
function hasRunningDispatch(root: string, taskRelPath: string, childId: string): boolean {
  const [taskErr, task] = readTask(root, taskRelPath)
  if (taskErr !== null || task === null) return false
  const dispatches = task.dispatches
  if (!Array.isArray(dispatches)) return false
  for (let i = dispatches.length - 1; i >= 0; i--) {
    const record = dispatches[i]
    if (record === undefined || record === null || typeof record !== 'object') continue
    if (record.childId !== childId) continue
    if (record.status === 'running') return true
  }
  return false
}
