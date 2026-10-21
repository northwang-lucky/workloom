/**
 * adapter-dsh 失败转移的父会话通知通道：把一行通知投进父会话。
 *
 * 设计意图：
 * - 走宿主现成通道（与 schedule 包同款路径）：sessionController.resolveAgent →
 *   createUserMessage（source kind workloom）→ agent.followup → sessions.flush；
 * - 通知是增强而非门禁：通道缺失 / 解析失败 / flush 未确认都只 WARNING，绝不
 *   阻断转移（dispatches 链式留痕仍是权威审计面）。
 */
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'

import { ERR_PREFIX } from '@workloom-ai/core'

import { SOURCE_PLUGIN } from './constants.js'

/** 通知投递失败告警前缀。 */
const NOTIFY_WARN_PREFIX = `${ERR_PREFIX.executor}: WARNING: failed to notify the parent session about the fallback transfer:`

/** 父会话通知通道的最小宿主面（老宿主可缺失，缺失即 WARNING 降级）。 */
interface FailoverNotificationChannel {
  sessionController?: {
    resolveAgent(sessionId: SessionId): Promise<{ agent: Agent } | { error: unknown }>
  }
  sessions?: { flush(session: Agent['session']): Promise<boolean> }
}

/**
 * 向父会话投递一行通知（fire-and-forget 语义内的安全投递）：通道缺失/解析失败/
 * flush 未确认都只 WARNING，不阻断转移。
 * @param ctx 插件上下文
 * @param parentSessionId 父会话 id
 * @param text 一行通知文本
 */
export async function notifyFailoverParent(ctx: Context, parentSessionId: string, text: string): Promise<void> {
  try {
    const channel = ctx as unknown as FailoverNotificationChannel
    const controller = channel.sessionController
    const sessions = channel.sessions
    if (controller === undefined || sessions === undefined) {
      throw new Error('the host notification channel (sessionController/sessions) is unavailable')
    }
    const resolved = await controller.resolveAgent(SessionId(parentSessionId))
    if ('error' in resolved) throw resolved.error
    const message = createUserMessage({
      content: [{ type: 'text', text }],
      // workloom 来源 kind 由 commands.ts 的 MessageSourceMap 增补声明（单一定义）。
      source: { kind: 'workloom', plugin: SOURCE_PLUGIN },
    })
    // followup 同步追加 inbox 片段，flush 才能观察到该会话变更（与 schedule 同款路径）。
    resolved.agent.followup(message)
    const flushed = await sessions.flush(resolved.agent.session)
    if (!flushed) throw new Error('session persistence did not acknowledge the failover notice')
  } catch (error) {
    console.warn(`${NOTIFY_WARN_PREFIX} ${String(error)}`)
  }
}
