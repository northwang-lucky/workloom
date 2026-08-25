/**
 * adapter-pi 的 executor 工具（workloom_execute）：把 workloom 任务上下文
 * 组装成子代理首条 prompt 并经 pi-subagents 事件总线前台派发。
 *
 * 设计意图：
 * - 暴露一个模型可见工具：按 kind（research/implement/check）用 core 的
 *   buildExecutorPrompt 组装上下文，经 SUBAGENT_DELEGATION_REQUEST_EVENT
 *   派发、按 requestId+ownerRunId+nodeId 三元组等终态响应；
 * - 严格依赖 pi-subagents：先订阅响应再 emit 请求（EventBus 同步派发，
 *   避免竞态丢响应）；ctx.signal aborted 时 emit CANCEL（同一三元组）并立即
 *   以 AbortError 结束工具（订阅先退订，无泄漏），不等待后续终态；
 * - 不设 timeoutMs/turnBudget/toolBudget（pi-subagents 默认）；协议恒前台，
 *   不暴露 background 参数；effort 同名映射为 thinking。
 */

import { randomUUID } from 'node:crypto'

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import { Type, type Static } from 'typebox'

import {
  SUBAGENT_DELEGATION_CANCEL_EVENT,
  SUBAGENT_DELEGATION_REQUEST_EVENT,
  SUBAGENT_DELEGATION_RESPONSE_EVENT,
  type SubagentDelegationRequest,
  type SubagentDelegationResponse,
} from 'pi-subagents/delegation'

import {
  assertEffort,
  assertKind,
  buildExecutorPrompt,
  ERR_PREFIX,
  findWorkloomRoot,
  PARAM_DESCRIPTIONS,
  resolveTaskRelPath,
  TOOL_DESCRIPTIONS,
  TOOL_NAMES,
} from '@workloom/core'

import { contextKeyOf, NODE_ID_PREFIX, OWNER_RUN_ID_FALLBACK } from './constants.ts'
import { buildDelegationRequest, delegationFailureMessage, responseToText } from './delegation.ts'

/** 工具参数 TypeBox schema（与 DSH 的参数语义一致）。 */
const EXECUTOR_PARAMS = Type.Object({
  kind: Type.String({ description: PARAM_DESCRIPTIONS.kind }),
  taskPath: Type.Optional(Type.String({ description: PARAM_DESCRIPTIONS.taskPathExecutor })),
  model: Type.Optional(Type.String({ description: PARAM_DESCRIPTIONS.model })),
  effort: Type.Optional(Type.String({ description: PARAM_DESCRIPTIONS.effort })),
  prompt: Type.String({ description: PARAM_DESCRIPTIONS.prompt }),
})

/**
 * 注册 workloom_execute 工具。
 * @param pi Extension API
 */
export function registerExecutorTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: TOOL_NAMES.executor,
    label: 'Workloom Execute',
    description: TOOL_DESCRIPTIONS.executor,
    parameters: EXECUTOR_PARAMS,
    // 工具级 signal 与 ctx.signal 同源（工具执行期间 agent 处于 streaming），
    // 按 spec 统一走 ctx.signal 的 abort 通道。
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      return executeTool(pi, params, ctx)
    },
  })
}

/**
 * 前台派发 executor 子代理并返回其输出文本。
 * @param pi Extension API
 * @param params 工具参数（TypeBox 已校验）
 * @param ctx 工具执行上下文（cwd/会话 id/取消信号）
 * @returns AgentToolResult（content 文本 + details 运行信息）
 */
async function executeTool(
  pi: ExtensionAPI,
  params: Static<typeof EXECUTOR_PARAMS>,
  ctx: { cwd: string; sessionManager: { getSessionId(): string }; signal?: AbortSignal },
): Promise<{ content: [{ type: 'text'; text: string }]; details: Record<string, unknown> }> {
  const cwd = ctx.cwd
  if (cwd === '') {
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
  // effort/kind 非法值 fail loud（core 校验），与 DSH 语义一致。
  assertEffort(params.effort)
  assertKind(params.kind)
  const sessionId = ctx.sessionManager.getSessionId()
  const taskRelPath = resolveTaskRelPath(
    root,
    contextKeyOf(sessionId),
    params.taskPath,
    ERR_PREFIX.executor,
  )
  const [promptErr, built] = buildExecutorPrompt({
    root,
    taskRelPath,
    kind: params.kind,
    userPrompt: params.prompt,
  })
  if (promptErr || built === null) {
    throw promptErr ?? new Error(`${ERR_PREFIX.executor}: prompt assembly returned no result`)
  }
  const request = buildDelegationRequest({
    requestId: randomUUID(),
    ownerRunId: sessionId === '' ? OWNER_RUN_ID_FALLBACK : sessionId,
    nodeId: `${NODE_ID_PREFIX}${randomUUID().slice(0, 8)}`,
    agent: params.kind,
    task: built.text,
    cwd,
    ...(params.model !== undefined ? { model: params.model } : {}),
    ...(params.effort !== undefined ? { effort: params.effort } : {}),
  })
  const response = await dispatchAndWait(pi, request, ctx.signal)
  const text = responseToText(response)
  if (text === null) {
    throw new Error(delegationFailureMessage(response))
  }
  return {
    content: [{ type: 'text', text }],
    details: { kind: 'foreground', runId: request.requestId, status: response.status },
  }
}

/**
 * 派发请求并等待终态响应：先订阅 RESPONSE（按三元组匹配，命中即退订并
 * resolve），再 emit REQUEST；signal 已 aborted 时不发请求直接抛 AbortError。
 * @param pi Extension API
 * @param request 派发请求
 * @param signal 取消信号（可选）
 * @returns 终态响应
 */
async function dispatchAndWait(
  pi: ExtensionAPI,
  request: SubagentDelegationRequest,
  signal: AbortSignal | undefined,
): Promise<SubagentDelegationResponse> {
  if (signal?.aborted === true) {
    throw new Error(`${ERR_PREFIX.executor}: executor dispatch aborted before start`)
  }
  // 先建订阅再 emit：EventBus 同步派发，避免「响应先于订阅」的竞态丢响应。
  const responsePromise = awaitDelegationResponse(pi, request, signal)
  pi.events.emit(SUBAGENT_DELEGATION_REQUEST_EVENT, request)
  return await responsePromise
}

/**
 * 订阅响应事件并按 requestId+ownerRunId+nodeId 三元组匹配，命中即退订并 resolve。
 * signal aborted 时：emit CANCEL（同一三元组）→ 退订 → reject AbortError，
 * 不等待后续终态（订阅先退订，无泄漏）。
 * @param pi Extension API
 * @param request 派发请求（三元组来源）
 * @param signal 取消信号（可选）
 * @returns 终态响应 promise
 */
function awaitDelegationResponse(
  pi: ExtensionAPI,
  request: SubagentDelegationRequest,
  signal: AbortSignal | undefined,
): Promise<SubagentDelegationResponse> {
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      pi.events.emit(SUBAGENT_DELEGATION_CANCEL_EVENT, cancelPayload(request))
      unsubscribe()
      signal?.removeEventListener('abort', onAbort)
      reject(new Error(`${ERR_PREFIX.executor}: executor dispatch aborted`))
    }
    const unsubscribe = pi.events.on(SUBAGENT_DELEGATION_RESPONSE_EVENT, (payload) => {
      const response = payload as SubagentDelegationResponse
      if (response.requestId !== request.requestId) return
      if (response.ownerRunId !== request.ownerRunId) return
      if (response.nodeId !== request.nodeId) return
      unsubscribe()
      signal?.removeEventListener('abort', onAbort)
      resolve(response)
    })
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/**
 * 组装 CANCEL 事件载荷（三元组与派发请求一致）。
 * @param request 派发请求
 * @returns cancel 载荷
 */
function cancelPayload(request: SubagentDelegationRequest): {
  requestId: string
  ownerRunId: string
  nodeId: string
} {
  return {
    requestId: request.requestId,
    ownerRunId: request.ownerRunId,
    nodeId: request.nodeId,
  }
}
