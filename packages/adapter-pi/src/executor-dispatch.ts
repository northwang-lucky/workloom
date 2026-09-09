/**
 * adapter-pi 的 executor 派发时序（从 executor.ts 拆出，单一职责：spawn RPC
 * child → get_state → recordDispatch → prompt → 后台返回 / 前台等待 settle）。
 *
 * 设计意图：
 * - 把派发时序（dispatchChildPi / dispatchForeground / buildBackgroundText）从
 *   executor.ts 的工具注册与上下文组装中分离，使两模块各自高内聚；
 * - 主会话结束联动（handleSessionShutdown）：先回填全部 running child 为 failed
 *   （摘要 host session ended），再 SIGTERM 清空注册表。
 */

import { spawn, type ChildProcess } from 'node:child_process'

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import type { Static } from 'typebox'

import {
  buildNewDispatchBinding,
  ERR_PREFIX,
  recordExecutorDispatch,
  settleExecutorDispatch,
} from '@workloom-ai/core'
import type { DispatchRecordInput, ExecutorInjectionStats } from '@workloom-ai/core'

import {
  EXECUTOR_PARAMS,
  appendExecutorReceipt,
  type ConflictGateResult,
  type PiExecutorPromptResult,
} from './executor.ts'
import { buildChildPiArgs } from './pi-args.ts'
import { createRpcConnection } from './pi-rpc.ts'
import {
  getChild,
  getAllChildren,
  registerChild,
  sigtermAllAlive,
  unregisterChild,
  type ChildRegistryEntry,
} from './pi-child-registry.ts'
import { registerChildSettle, settleHostSessionEnded } from './executor-settle.ts'

/** 取消时向 child pi 发送的终止信号。 */
const KILL_SIGNAL = 'SIGTERM'

/** 派发审计记录失败告警前缀（记录失败只 WARNING，不阻塞派发）。 */
const DISPATCH_WARN_PREFIX = `${ERR_PREFIX.executor}: WARNING: failed to record executor dispatch:`

/** 派发结果（后台：childId + receipt 文本；前台：终文）。 */
export type DispatchResult =
  | { kind: 'background'; childId: string; text: string }
  | { kind: 'foreground'; text: string }

/** dispatchChildPi 入参（派发所需全部上下文）。 */
interface DispatchChildPiParams {
  pi: ExtensionAPI
  cwd: string
  prompt: string
  kind: string
  title: string
  root: string
  taskRelPath: string
  model?: string
  effort?: string
  tools?: string[]
  loadExtensions: string[]
  parentSessionId: string
  effective: {
    model?: string
    effort?: string
    sources: { model?: 'param' | 'config'; effort?: 'param' | 'config' }
    configSources?: {
      model?: 'whenMain' | 'fallback' | 'legacy'
      effort?: 'whenMain' | 'fallback' | 'legacy'
    }
    whenMainValue?: string
  }
  gate: ConflictGateResult
  allowInfo: { allow: string[]; childHasLsp: boolean }
  mainModel?: string
  piBuilt: PiExecutorPromptResult
  signal: AbortSignal | undefined
  foreground: boolean
}

/**
 * spawn RPC child pi 并派发：get_state 取 sessionId → 登记 → recordDispatch →
 * prompt 命令 → 默认后台立即返回 { childId, receipt }；foreground 等 settle 终文。
 */
export async function dispatchChildPi(params: DispatchChildPiParams): Promise<DispatchResult> {
  if (params.signal?.aborted === true) {
    throw new Error(`${ERR_PREFIX.executor}: executor dispatch aborted before start`)
  }
  const {
    pi,
    cwd,
    prompt,
    kind,
    title,
    root,
    taskRelPath,
    model,
    effort,
    tools,
    loadExtensions,
    parentSessionId,
    effective,
    gate,
    allowInfo,
    mainModel,
    piBuilt,
    signal,
    foreground,
  } = params
  // 组装 RPC 参数（--mode rpc，无 -p）。
  const args = buildChildPiArgs({
    kind,
    root,
    title,
    model,
    effort,
    loadExtensions,
    tools,
  })
  // spawn RPC child。
  const child = spawn(process.env.PI_BIN ?? 'pi', args, {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  // 创建 RPC 连接（严格 \n 分帧）。
  const connection = createRpcConnection(child)
  let sessionId: string | undefined
  try {
    // get_state 取 sessionId（= childId）。
    const stateResponse = await connection.sendCommand({ type: 'get_state' })
    sessionId = typeof stateResponse.data?.sessionId === 'string'
      ? stateResponse.data.sessionId
      : undefined
    if (sessionId === undefined || sessionId === '') {
      throw new Error(`${ERR_PREFIX.executor}: failed to get session id from child pi`)
    }
    // 登记 child 注册表。
    const entry: ChildRegistryEntry = {
      connection,
      child,
      kind,
      root,
      taskRelPath,
      parentSessionId,
      status: 'running',
      startedAt: new Date().toISOString(),
    }
    registerChild(sessionId, entry)
    // 派发时刻初写 dispatches（status: running + childId + 绑定）。
    recordDispatch(root, taskRelPath, {
      kind,
      title,
      childId: sessionId,
      ...buildNewDispatchBinding(
        { model, effort } as Static<typeof EXECUTOR_PARAMS>,
        effective,
        mainModel,
      ),
    })
    // 发送 prompt 命令。
    await connection.sendCommand({ type: 'prompt', message: prompt })
  } catch (error) {
    // spawn/get_state/prompt 失败：留痕 failed + fail loud。
    const message = error instanceof Error ? error.message : String(error)
    if (sessionId !== undefined && sessionId !== '') {
      recordDispatch(root, taskRelPath, {
        kind,
        title,
        childId: sessionId,
        ...buildNewDispatchBinding({ model, effort } as Static<typeof EXECUTOR_PARAMS>, effective, mainModel),
      })
      const [settleErr] = settleExecutorDispatch(root, taskRelPath, {
        childId: sessionId,
        status: 'failed',
        error: message,
      })
      if (settleErr !== null) {
        console.warn(`${DISPATCH_WARN_PREFIX} ${settleErr}`)
      }
      unregisterChild(sessionId)
    }
    connection.close()
    child.kill(KILL_SIGNAL)
    throw error instanceof Error
      ? error
      : new Error(`${ERR_PREFIX.executor}: ${String(error)}`)
  }
  // 注册 settle 监听（agent_end → completed，close/error → failed）。
  if (foreground) {
    // 前台：阻塞等 settle 终文。
    return await dispatchForeground({
      pi,
      connection,
      child,
      sessionId: sessionId!,
      effective,
      gate,
      allowInfo,
      piBuilt,
      signal,
    })
  }
  // 后台：立即返回 { childId, receipt }，settle 异步回填 + 回投。
  const entry = getChild(sessionId!)
  if (entry !== undefined) {
    registerChildSettle(pi, connection, entry, sessionId!, false)
  }
  const text = buildBackgroundText({
    childId: sessionId!,
    effective,
    gate,
    allowInfo,
    piBuilt,
  })
  return { kind: 'background', childId: sessionId!, text }
}

/** dispatchForeground 入参。 */
interface DispatchForegroundParams {
  pi: ExtensionAPI
  connection: ReturnType<typeof createRpcConnection>
  child: ChildProcess
  sessionId: string
  effective: {
    model?: string
    effort?: string
    sources: { model?: 'param' | 'config'; effort?: 'param' | 'config' }
    configSources?: {
      model?: 'whenMain' | 'fallback' | 'legacy'
      effort?: 'whenMain' | 'fallback' | 'legacy'
    }
    whenMainValue?: string
  }
  gate: ConflictGateResult
  allowInfo: { allow: string[]; childHasLsp: boolean }
  piBuilt: PiExecutorPromptResult
  signal: AbortSignal | undefined
}

/**
 * 前台派发：阻塞等 settle 终文（不回投，工具返回值即报告）。
 */
async function dispatchForeground(params: DispatchForegroundParams): Promise<DispatchResult> {
  const { pi, connection, child, sessionId, effective, gate, allowInfo, piBuilt, signal } = params
  const entry = getChild(sessionId)
  if (entry === undefined) {
    throw new Error(`${ERR_PREFIX.executor}: child ${sessionId} not found in registry`)
  }
  // abort 处理：发 abort 命令 + SIGTERM。
  let onAbort: (() => void) | undefined
  const abortPromise = new Promise<never>((_, reject) => {
    onAbort = () => {
      connection.sendCommand({ type: 'abort' }).catch(() => {})
      child.kill(KILL_SIGNAL)
      reject(abortError())
    }
  })
  signal?.addEventListener('abort', onAbort!, { once: true })
  try {
    const settleResult = await Promise.race([
      registerChildSettle(pi, connection, entry, sessionId, true),
      abortPromise,
    ])
    if (settleResult.status === 'failed') {
      throw new Error(`${ERR_PREFIX.executor}: ${settleResult.error ?? 'executor failed'}`)
    }
    // 终文 + receipt 尾行。
    const text = appendExecutorReceipt(settleResult.text ?? '', effective, {
      forced: gate.forced,
      injection: buildInjectionStats(piBuilt, allowInfo.allow.length),
    })
    return { kind: 'foreground', text }
  } finally {
    if (onAbort !== undefined) {
      signal?.removeEventListener('abort', onAbort)
    }
  }
}

/** buildBackgroundText 入参。 */
interface BuildBackgroundTextParams {
  childId: string
  effective: {
    model?: string
    effort?: string
    sources: { model?: 'param' | 'config'; effort?: 'param' | 'config' }
    configSources?: {
      model?: 'whenMain' | 'fallback' | 'legacy'
      effort?: 'whenMain' | 'fallback' | 'legacy'
    }
    whenMainValue?: string
  }
  gate: ConflictGateResult
  allowInfo: { allow: string[]; childHasLsp: boolean }
  piBuilt: PiExecutorPromptResult
}

/**
 * 组装后台派发的模型可见文本：childId + 后台语义指引 + receipt。
 */
function buildBackgroundText(params: BuildBackgroundTextParams): string {
  const { childId, effective, gate, allowInfo, piBuilt } = params
  const receipt = appendExecutorReceipt('', effective, {
    forced: gate.forced,
    injection: buildInjectionStats(piBuilt, allowInfo.allow.length),
  })
  return (
    `Dispatched in background; child session: ${childId}. Continue with other work; ` +
    `the completion report arrives via the executor report.\n\n${receipt}`
  )
}

/**
 * 构建注入统计（receipt 渲染用）。
 */
function buildInjectionStats(built: PiExecutorPromptResult, toolsAllowed: number): ExecutorInjectionStats {
  return {
    bytes: Buffer.byteLength(built.result.text, 'utf8'),
    inlined: built.result.stats.filesInlined,
    truncated: built.result.stats.truncated,
    indexed: 0,
    pointed: built.result.stats.filesPointed,
    toolsAllowed,
  }
}

/**
 * 组装取消错误（AbortError 命名，工具管线按 name 识别取消）。
 */
function abortError(): Error {
  const error = new Error(`${ERR_PREFIX.executor}: executor dispatch aborted`)
  error.name = 'AbortError'
  return error
}

/**
 * 记录一次派发（内部）：写入 task.json dispatches；失败只 WARNING 不阻塞派发。
 */
function recordDispatch(root: string, taskRelPath: string, entry: DispatchRecordInput): void {
  const [recordErr] = recordExecutorDispatch(root, taskRelPath, entry)
  if (recordErr !== null) {
    console.warn(`${DISPATCH_WARN_PREFIX} ${recordErr}`)
  }
}

/** 主会话结束联动（R6）：导出供 index.ts 的 session_shutdown 监听调用。
 * 先回填全部 running child 为 failed（摘要 host session ended），再 SIGTERM。 */
export function handleSessionShutdown(): void {
  for (const [sessionId, entry] of getAllChildren()) {
    settleHostSessionEnded(entry, sessionId)
  }
  sigtermAllAlive()
}
