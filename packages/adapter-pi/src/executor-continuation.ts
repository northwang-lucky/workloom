/**
 * adapter-pi 的 executor 续用（continue_executor + reinject + mid-run steering）。
 *
 * 设计意图（M2，与 DSH executor-continuation.ts 同名）：
 * - continue_executor 定位：latest = task.json dispatches 同 kind 最近一条的
 *   childId；显式 childId 按记录校验；跨 kind 拒绝（文案与 DSH 逐字一致）；
 *   无记录 fail loud（返回提示文本，不抛错——续用是主会话显式请求，提示面返回
 *   更利于模型修正）；
 * - rebind 拒绝：continue_executor 与 model/effort 同传 → 返回拒绝文案（本地常量，
 *   M3 迁 core 共享常量，旁注标注迁移计划）；
 * - 三分支投递（R3）：
 *   1. child 存活且 idle → RPC `prompt` 命令（增量指令；reinject:true 时重发全量）；
 *   2. child 存活且 streaming → RPC `steer` 命令（当前回合工具执行完、下次 LLM
 *      调用前送达）；
 *   3. child 不存活 → `pi --session <id> --mode rpc …` 重启续接（参数面同新派，
 *      --name 保持原标题）后发 `prompt`；
 * - 续用轮留痕：dispatches 追加一条（kind/title/childId 同前，绑定字段按 DSH
 *   spawnBinding 语义标首派值 modelSource=spawn）；settle/回投链路复用。
 */

import {
  ERR_PREFIX,
  readTask,
  recordExecutorDispatch,
} from '@workloom-ai/core'
import type { DispatchRecord, DispatchModelSource, ExecutorInjectionStats } from '@workloom-ai/core'
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'

import { getChild, registerChild, type ChildRegistryEntry } from './pi-child-registry.ts'
import { createRpcConnection } from './pi-rpc.ts'
import { buildChildPiArgs } from './pi-args.ts'
import { spawn } from 'node:child_process'
import { registerChildSettle } from './executor-settle.ts'
import { buildChildSpawnOptions } from './executor-dispatch.ts'
import type { ConflictGateResult, PiExecutorPromptResult } from './executor.ts'
import { appendExecutorReceipt } from './executor.ts'

/** 续用定位入参 continue_executor 的 'latest' 魔法值（复用 dispatches 同 kind 最近一次）。 */
const REUSE_LATEST = 'latest'

/** 取消时向 child pi 发送的终止信号。 */
const KILL_SIGNAL = 'SIGTERM'

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
 * 读取子会话首次派发记录的绑定（design §8.3，纯读取，无副作用）：dispatches 中
 * 最早出现该 childId 的记录即 spawn 记录，取其落盘的 model/effort 供续派轮沿用；
 * 旧记录无绑定字段时返回 null。读取失败返回 null，不抛错。
 * @param root 项目根
 * @param taskRelPath 任务目录相对 .workloom 的路径
 * @param childId 续用子代理的会话 id
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

/** 续用结果（终文 + childId）。 */
export interface ContinuationResult {
  text: string
  childId: string
}

/** continueExecutor 入参。 */
export interface ContinueExecutorParams {
  pi: ExtensionAPI
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
  piBuilt: PiExecutorPromptResult
  childId: string
  incrementalPrompt: string
  reinject: boolean
  /** 取消信号（abort 时优先以 failed 结算） */
  signal?: AbortSignal
}

/**
 * 续用 executor：三分支投递（存活 idle→prompt；存活 streaming→steer；
 * 不存活→`--session <id>` 重启续接后 prompt）。
 * @param params 续用入参
 * @returns 续用结果
 */
export async function continueExecutor(params: ContinueExecutorParams): Promise<ContinuationResult> {
  const {
    pi,
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
    piBuilt,
    childId,
    incrementalPrompt,
    reinject,
    signal,
  } = params

  const existingEntry = getChild(childId)

  // 分支 1 & 2：child 存活 → 直接向同一进程发 prompt/steer
  if (existingEntry !== undefined) {
    const connection = existingEntry.connection
    // 查询当前 streaming 状态
    let isStreaming = false
    try {
      const stateResponse = await connection.sendCommand({ type: 'get_state' })
      isStreaming = typeof stateResponse.data?.isStreaming === 'boolean' && stateResponse.data.isStreaming
    } catch {
      // get_state 失败视为不存活，走重启分支
    }

    if (isStreaming) {
      // 分支 2：streaming → steer（R3，当前回合工具执行完、下次 LLM 调用前送达）
      await connection.sendCommand({ type: 'steer', message: incrementalPrompt })
    } else {
      // 分支 1：idle → prompt（增量；reinject:true 时重发全量）
      const message = reinject ? piBuilt.result.text : incrementalPrompt
      await connection.sendCommand({ type: 'prompt', message })
    }

    // 续用轮留痕：dispatches 追加条目（spawn 绑定）
    const spawnBinding = readSpawnBinding(root, taskRelPath, childId)
    recordContinuationDispatch(root, taskRelPath, {
      kind,
      title,
      childId,
      spawnBinding,
    })

    // 注册 settle 监听（复用）
    registerChildSettle(pi, connection, existingEntry, childId, false, signal)

    const text = buildBackgroundText({ childId, effective, gate, allowInfo, piBuilt })
    return { text, childId }
  }

  // 分支 3：child 不存活 → `--session <id>` 重启续接
  const args = buildChildPiArgs({
    kind,
    root,
    title,
    model,
    effort,
    loadExtensions,
    tools,
    sessionParam: childId,
  })
  const child = spawn(process.env.PI_BIN ?? 'pi', args, buildChildSpawnOptions(root))
  const connection = createRpcConnection(child)

  // 重启后 get_state 确认 sessionId 一致
  const stateResponse = await connection.sendCommand({ type: 'get_state' })
  const resumedSessionId = typeof stateResponse.data?.sessionId === 'string'
    ? stateResponse.data.sessionId
    : childId

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
  registerChild(resumedSessionId, entry)

  // 续用轮留痕
  const spawnBinding = readSpawnBinding(root, taskRelPath, childId)
  recordContinuationDispatch(root, taskRelPath, {
    kind,
    title,
    childId: resumedSessionId,
    spawnBinding,
  })

  // 发送 prompt（增量或全量）
  const message = reinject ? piBuilt.result.text : incrementalPrompt
  await connection.sendCommand({ type: 'prompt', message })

  // 注册 settle 监听
  registerChildSettle(pi, connection, entry, resumedSessionId, false, signal)

  const text = buildBackgroundText({ childId: resumedSessionId, effective, gate, allowInfo, piBuilt })
  return { text, childId: resumedSessionId }
}

/** 续用轮留痕入参。 */
interface RecordContinuationParams {
  kind: string
  title: string
  childId: string
  spawnBinding: { model?: string; effort?: string } | null
}

/**
 * 记录续用轮派发（内部）：dispatches 追加条目，绑定字段按 DSH spawnBinding 语义
 * 标注首派值（modelSource=spawn）。
 */
function recordContinuationDispatch(
  root: string,
  taskRelPath: string,
  params: RecordContinuationParams,
): void {
  const { kind, title, childId, spawnBinding } = params
  const [recordErr] = recordExecutorDispatch(root, taskRelPath, {
    kind,
    title,
    childId,
    ...(spawnBinding?.model !== undefined ? { model: spawnBinding.model } : {}),
    ...(spawnBinding?.effort !== undefined ? { effort: spawnBinding.effort } : {}),
    modelSource: 'spawn' as DispatchModelSource,
  })
  if (recordErr !== null) {
    console.warn(`${ERR_PREFIX.executor}: WARNING: failed to record continuation dispatch: ${recordErr}`)
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
 * 组装续用轮后台派发的模型可见文本：childId + 后台语义指引 + receipt。
 */
function buildBackgroundText(params: BuildBackgroundTextParams): string {
  const { childId, effective, gate, allowInfo, piBuilt } = params
  const receipt = appendExecutorReceipt('', effective, {
    forced: gate.forced,
    injection: buildInjectionStats(piBuilt, allowInfo.allow.length),
  })
  return (
    `Continued executor; child session: ${childId}. Continue with other work; ` +
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

/** 导出拒绝文案供 executor.ts 复用（rebind 拒绝）。 */
export { KILL_SIGNAL }
