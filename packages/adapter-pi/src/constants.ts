/**
 * adapter-pi 共享常量与 contextKey 组装（index/commands/tasks/executor/inject 共用，
 * 消除同义字符串重复）。
 *
 * 说明：命令名/工具名/错误前缀/EMPTY_OUTPUT_TEXT 等契约面常量已下沉
 * core 的 surface，本文件只保留 Pi runtime 特有常量。
 */

/** 会话指针 contextKey 前缀（对齐 core 的会话指针约定）。 */
export const CONTEXT_KEY_PREFIX = 'pi'

/** sessionId 为空串时的 contextKey 回退段（最终形如 pi_unknown）。 */
export const CONTEXT_KEY_FALLBACK = 'unknown'

/**
 * 组装会话 contextKey（与 DSH 的 `${CONTEXT_KEY_PREFIX}_${sessionId}` 同语义，
 * 空 sessionId 回退 pi_unknown）。
 * @param sessionId 会话 id（Pi 的 sessionManager.getSessionId()）
 * @returns contextKey
 */
export function contextKeyOf(sessionId: string): string {
  const id = sessionId === '' ? CONTEXT_KEY_FALLBACK : sessionId
  return `${CONTEXT_KEY_PREFIX}_${id}`
}

/** session-context 注入消息的 customType（CustomMessage 参与 LLM 上下文）。 */
export const SESSION_CONTEXT_CUSTOM_TYPE = 'workloom-session-context'
