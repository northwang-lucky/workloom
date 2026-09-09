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
  persistEmptyRegistry,
  type ChildRegistryEntry,
} from './pi-child-registry.ts'
import { registerChildSettle, HOST_SESSION_ENDED_TEXT } from './executor-settle.ts'

/** 取消时向 child pi 发送的终止信号。 */
const KILL_SIGNAL = 'SIGTERM'

/** 派发审计记录失败告警前缀（记录失败只 WARNING，不阻塞派发）。 */
const DISPATCH_WARN_PREFIX = `${ERR_PREFIX.executor}: WARNING: failed to record executor dispatch:`

/**
 * 组装 child pi 的 spawn options（纯函数，可单测）。
 * RPC 模式 stdin 是命令通道（sendCommand 写 JSON 命令），必须为 'pipe'；
 * stdout/stderr 分别为事件流与错误摘要。child 存活期间 stdin 保持打开，
 * SIGTERM/close 路径上由 child.kill/connection.close 销毁。
 * @param cwd 工作目录
 * @returns spawn options
 */
export function buildChildSpawnOptions(cwd: string): { cwd: string; stdio: ['pipe', 'pipe', 'pipe'] } {
  return { cwd, stdio: ['pipe', 'pipe', 'pipe'] }
}

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
  /**
   * 原始工具参数（用户显式传入，仅用于审计绑定来源判定）。
   * buildNewDispatchBinding 靠它区分 param vs config/default 来源；
   * 未显式传时 undefined → 来源记 config/fallback/inherit。
   */
  rawModel?: string
  rawEffort?: string
  /** 生效 model（用于 spawn --model 参数）。 */
  model?: string
  /** 生效 effort（用于 spawn --thinking 参数）。 */
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
    rawModel,
    rawEffort,
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
  // spawn RPC child + 创建连接均放入 try 块——spawn 同步抛错（如 ENOENT）必须被
  // catch 捕获以留痕 failed + fail loud（design R4：spawn/get_state/prompt 失败也留痕）。
  let sessionId: string | undefined
  let child: ReturnType<typeof spawn> | undefined
  let connection: ReturnType<typeof createRpcConnection> | undefined
  try {
    // spawn RPC child。spawn 失败（如 ENOENT）在 bun/Node 上通过 'error' 事件
    // 异步抛出——包装为 Promise 以被 try/catch 捕获（design R4：spawn 失败也留痕）。
    child = spawn(process.env.PI_BIN ?? 'pi', args, buildChildSpawnOptions(cwd))
    await new Promise<void>((resolve, reject) => {
      child!.once('error', (err) => reject(err))
      child!.once('spawn', () => resolve())
      // 已 spawn 成功（同步）时 'spawn' 事件可能已错过，用 stdin 存在判定。
      if (child!.stdin !== null && !child!.stdin.destroyed) {
        resolve()
      }
    })
    // 创建 RPC 连接（严格 \n 分帧）。
    connection = createRpcConnection(child)
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
    // 绑定字段使用原始工具参数（rawModel/rawEffort）以正确判定 param vs config 来源。
    recordDispatch(root, taskRelPath, {
      kind,
      title,
      childId: sessionId,
      ...buildNewDispatchBinding(
        { model: rawModel, effort: rawEffort } as Static<typeof EXECUTOR_PARAMS>,
        effective,
        mainModel,
      ),
    })
    // 发送 prompt 命令。
    await connection.sendCommand({ type: 'prompt', message: prompt })
  } catch (error) {
    // spawn/get_state/prompt 失败：留痕 failed（无 sessionId 时 childId 缺省）+ fail loud。
    // design R4：失败派发也留痕——即使 get_state 失败/spawn 即失败（sessionId 未取到），
    // 仍写一条 status=failed 记录（kind/title/绑定齐全，childId 缺省）。
    const message = error instanceof Error ? error.message : String(error)
    recordDispatch(root, taskRelPath, {
      kind,
      title,
      ...(sessionId !== undefined && sessionId !== '' ? { childId: sessionId } : {}),
      ...buildNewDispatchBinding({ model: rawModel, effort: rawEffort } as Static<typeof EXECUTOR_PARAMS>, effective, mainModel),
      status: 'failed',
      error: message,
    })
    if (sessionId !== undefined && sessionId !== '') {
      unregisterChild(sessionId)
    }
    if (connection !== undefined) {
      connection.close()
    }
    if (child !== undefined) {
      child.kill(KILL_SIGNAL)
    }
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
    registerChildSettle(pi, connection, entry, sessionId!, false, signal)
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
      registerChildSettle(pi, connection, entry, sessionId, true, signal),
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
 * 先回填全部 running child 为 failed（摘要 host session ended），再 SIGTERM 仍存活的
 * 进程并清空注册表，最后把落盘进程表持久化为空表（R3 双层防线：shutdown 即时清空
 * 落盘，与重启 cleanupOrphans 互补）。不变式：注册表条目移除以 child 进程 close 事件
 * 为准，shutdown 路径上先 settle（不注销）→ SIGTERM 存活进程 → 清空注册表 → 落盘空表。 */
export function handleSessionShutdown(): void {
  // 收集所有 root（sigtermAllAlive 清空进程内表后需按 root 持久化空表）。
  const roots: string[] = []
  // 1. 回填全部 running child 为 failed（不注销——注册表仍持有进程引用供 SIGTERM）。
  for (const [sessionId, entry] of getAllChildren()) {
    if (!roots.includes(entry.root)) roots.push(entry.root)
    const [settleErr] = settleExecutorDispatch(entry.root, entry.taskRelPath, {
      childId: sessionId,
      status: 'failed',
      error: HOST_SESSION_ENDED_TEXT,
    })
    if (settleErr !== null) {
      console.warn(`${DISPATCH_WARN_PREFIX} ${settleErr}`)
    }
  }
  // 2. SIGTERM 全部存活 child 并清空注册表（sigtermAllAlive 内部 clear）。
  sigtermAllAlive()
  // 3. 落盘进程表持久化为空表（R3：shutdown 即时清空落盘，消除残留）。
  for (const root of roots) {
    persistEmptyRegistry(root)
  }
}
