/**
 * adapter-pi 的会话注入（session_start / before_agent_start）。
 *
 * 设计意图：
 * - session_start：仅 reason ∈ {startup, new} 注入 session-context 快照
 *   （reload/resume/fork 跳过：消息已持久化/继承，避免重复），注入方式为
 *   pi.sendMessage({customType, content, display:true})，CustomMessage 参与
 *   LLM 上下文；
 * - before_agent_start：每轮一次，返回 {systemPrompt: event.systemPrompt +
 *   '\n\n' + breadcrumb}（多扩展链式拼接，官方惯例追加式）；
 * - 自激活：cwd 不在 .workloom 项目内静默不注入；组装失败只 console.warn，
 *   绝不阻塞会话（注入是增强，不是门禁）。
 */

import type {
  BeforeAgentStartEvent,
  ExtensionAPI,
  ExtensionContext,
  SessionStartEvent,
} from '@earendil-works/pi-coding-agent'

import {
  assembleBreadcrumbSync,
  assembleSessionContext,
  findWorkloomRoot,
  parseContract,
} from '@workloom/core'
import { loadWorkflowContractText } from '@workloom/assets'

import { contextKeyOf, SESSION_CONTEXT_CUSTOM_TYPE } from './constants.ts'

/** session-context 注入跳过告警前缀（运行时文案英文）。 */
const CONTEXT_WARN_PREFIX = 'workloom: session context injection skipped:'

/** breadcrumb 注入跳过告警前缀（运行时文案英文）。 */
const BREADCRUMB_WARN_PREFIX = 'workloom: breadcrumb injection skipped:'

/** session_start 中触发一次性注入的 reason（消息尚未持久化的场景）。 */
const INJECT_REASONS: ReadonlySet<string> = new Set(['startup', 'new'])

/**
 * 注册注入：session_start 注入会话上下文快照，before_agent_start 追加 breadcrumb。
 * @param pi Extension API
 */
export function registerInjections(pi: ExtensionAPI): void {
  pi.on('session_start', (event, ctx) => {
    injectSessionContext(pi, event, ctx)
  })
  pi.on('before_agent_start', (event, ctx) => injectBreadcrumb(event, ctx))
}

/**
 * session_start：reason 命中 {startup, new} 且项目在 .workloom 内时，
 * 组装 session-context 快照并 sendMessage 注入；任一步失败只告警跳过。
 * 全链路同步（assembleSessionContext/parseContract/sendMessage 均为同步），
 * 不引入多余 Promise，避免同步抛错被吞成 unhandled rejection。
 * @param pi Extension API
 * @param event 会话启动事件
 * @param ctx 扩展上下文
 */
function injectSessionContext(
  pi: ExtensionAPI,
  event: SessionStartEvent,
  ctx: ExtensionContext,
): void {
  if (!INJECT_REASONS.has(event.reason)) return
  const root = resolveProjectRoot(ctx)
  if (root === null) return
  const contextKey = contextKeyOf(ctx.sessionManager.getSessionId())
  const contractText = loadWorkflowContractText()
  if (contractText === null) {
    console.warn(`${CONTEXT_WARN_PREFIX} workflow contract asset is missing`)
    return
  }
  const [parseErr, contract] = parseContract(contractText)
  if (parseErr || contract === null) {
    console.warn(
      `${CONTEXT_WARN_PREFIX} ${parseErr?.message ?? 'contract parse returned no contract'}`,
    )
    return
  }
  // 契约 steps（core WorkflowStep[]）结构上含 id/title，可直接投影给 assembleSessionContext。
  const [err, text] = assembleSessionContext({
    root,
    contextKey,
    workflowSteps: contract.steps,
  })
  if (err || text === null) {
    console.warn(
      `${CONTEXT_WARN_PREFIX} ${err?.message ?? 'session context assembly returned no text'}`,
    )
    return
  }
  pi.sendMessage({ customType: SESSION_CONTEXT_CUSTOM_TYPE, content: text, display: true })
}

/**
 * before_agent_start：项目在 .workloom 内时追加 breadcrumb 到本轮 system prompt。
 * @param event 代理启动前事件（含已组装的 systemPrompt 与用户 prompt）
 * @param ctx 扩展上下文
 * @returns 追加后的 systemPrompt；自激活失败/组装失败返回 undefined（不注入）
 */
function injectBreadcrumb(
  event: BeforeAgentStartEvent,
  ctx: ExtensionContext,
): { systemPrompt: string } | undefined {
  const root = resolveProjectRoot(ctx)
  if (root === null) return undefined
  const contextKey = contextKeyOf(ctx.sessionManager.getSessionId())
  const contractText = loadWorkflowContractText()
  if (contractText === null) {
    console.warn(`${BREADCRUMB_WARN_PREFIX} workflow contract asset is missing`)
    return undefined
  }
  const [err, text] = assembleBreadcrumbSync({
    root,
    contextKey,
    contractText,
    userPrompt: event.prompt,
  })
  if (err || text === null) {
    console.warn(
      `${BREADCRUMB_WARN_PREFIX} ${err?.message ?? 'breadcrumb assembly returned no text'}`,
    )
    return undefined
  }
  return { systemPrompt: `${event.systemPrompt}\n\n${text}` }
}

/**
 * 自激活判定：cwd 在 .workloom 项目内时返回项目根，否则返回 null（静默跳过）。
 * @param ctx 扩展上下文
 * @returns 项目根或 null
 */
function resolveProjectRoot(ctx: ExtensionContext): string | null {
  if (ctx.cwd === '') return null
  const found = findWorkloomRoot(ctx.cwd)
  return found === null ? null : found.root
}
