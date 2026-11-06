/**
 * dsh-workloom executor 的 receipt 组装与 fork 接续失败转译：fork 接续失败转译、
 * 续派轮绑定落盘字段。
 *
 * 设计意图：
 * - 与 executor.ts（工具注册与执行编排）分离：canonical 值→模型可见文本的投影
 *   （renderOutput/renderBackground）统一在 core surface，本模块只保留
 *   translateForkContinueError 转译 fork 接续失败、buildSpawnEntryBinding 装配
 *   续派轮绑定落盘字段；
 * - 均为纯函数，便于单测。
 */
import type { DispatchModelSource } from '@workloom-ai/core'

/**
 * 上游 DSH 接续拒绝的错误片段（parent 严格校验：child.parentSession ≠ 当前会话，
 * fork 分身接续源会话派发的 executor 必然命中）。依赖注意：匹配的是上游错误文案，
 * 该文案变更会让转译退化为原样透传（fail loud 仍在，只是少了引导）。
 */
const FORK_PARENT_ERROR_FRAGMENT = 'belongs to another parent session'

/** fork 接续失败转译的引导文案（design §4.2：提示全新派发并携带所需上下文）。 */
const FORK_CONTINUE_GUIDANCE =
  'Cannot continue the recorded executor: it belongs to the session that dispatched it, not this one ' +
  '(typically because the current session is a fork). Dispatch a fresh executor instead, carrying the ' +
  'needed context in the prompt.'

/**
 * 转译 continue 接续失败：sendMessage reject 的 message 含 "belongs to another parent
 * session"（DSH parent 严格校验：child.parentSession ≠ 当前会话，fork 分身接续源
 * 会话派发的 executor 必然命中）时，转为引导文案（保持 isError 语义：仍抛错，
 * 只是文案带下一步动作指引）；其余错误原样透传。
 * 依赖注意：匹配的是上游 DSH 的错误文案（FORK_PARENT_ERROR_FRAGMENT），该文案
 * 变更会让转译退化为原样透传（fail loud 仍在，只是少了引导）。
 * @param error sendMessage reject 的原始错误
 * @returns 转译或原样的错误
 */
export function translateForkContinueError(error: unknown): unknown {
  if (error instanceof Error && error.message.includes(FORK_PARENT_ERROR_FRAGMENT)) {
    return new Error(FORK_CONTINUE_GUIDANCE, { cause: error })
  }
  return error
}

/**
 * 续派轮记录落盘绑定（内部）：沿用 childId 首次派发记录的绑定值，来源记 spawn。
 * 首次记录无绑定字段时只记来源（model/effort 缺省，审计仍可辨续派轮）。
 * @param binding 首次派发记录读取的绑定（可能 null）
 * @returns dispatch entry 的绑定字段（modelSource 恒为 spawn）
 */
export function buildSpawnEntryBinding(
  binding: { model?: string; effort?: string } | null,
): { model?: string; effort?: string; modelSource: DispatchModelSource } {
  return {
    ...(binding?.model !== undefined ? { model: binding.model } : {}),
    ...(binding?.effort !== undefined ? { effort: binding.effort } : {}),
    modelSource: 'spawn',
  }
}
