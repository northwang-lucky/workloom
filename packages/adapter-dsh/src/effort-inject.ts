/**
 * workloom effort 通道注入：监听全局 agent/created，对携带 reasoningEffort 的
 * in-process 子代理安装 installModelSelection，由 DSH 瀑布把 effort 写入请求配置。
 *
 * 设计意图：
 * - DSH 子代理路径（agent-loop.buildRequest）只消费 agent.options 的
 *   provider/model/maxTokens 与会话自身 request/header，附加字段 reasoningEffort
 *   经 resolveChildAgentOptions 的 ...requested 展开保留在 agent.options 却从不被消费；
 * - 本模块用 DSH 公开 API 补上这段链路：全局 agent/created（每个 agent 发布时同步
 *   emit，早于第一次 prompt 组装）监听子代理，有 reasoningEffort 则安装
 *   installModelSelection（agent-scoped 瀑布，随 agent 释放自动清理），由
 *   system-prompt/assemble 快照 + agent/request 覆盖把 effort 注入请求配置；
 * - 无该字段的 agent（Web 主会话、其他派发方）直接跳过，零副作用；
 * - 监听器是同步边界（DSH announce 同步 dispatch），内部 try/catch 只告警不冒泡。
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Agent, AgentOptions } from '@deepseek-ai/dsh-agent'
import type { ReasoningEffortId } from '@deepseek-ai/dsh-llm'

/** AgentOptions 的 workloom 扩展：reasoningEffort 经 resolveChildAgentOptions 的 ...requested 原样保留（DSH 既定行为）。 */
type WorkloomAgentOptions = AgentOptions & { reasoningEffort?: ReasoningEffortId }

/** 注入失败告警前缀（运行时文案英文，对齐 plugin.ts 的 WARN_PREFIX 风格）。 */
const WARN_PREFIX = 'workloom: effort injection skipped:'

/**
 * 注册全局 agent/created 监听：对携带 reasoningEffort 的子代理安装模型选择器。
 * @param ctx 插件作用域上下文（agent/created 为全局事件，此处监听可见所有 agent）
 */
export function registerEffortInjection(ctx: Context): void {
  ctx.on('agent/created', (payload: { agent: Agent }) => {
    try {
      const options = payload.agent.options as WorkloomAgentOptions
      if (options.reasoningEffort === undefined) return
      // 红阶段占位：绿阶段在此调用 installModelSelection 完成注入。
    } catch (error) {
      console.warn(`${WARN_PREFIX} ${String(error)}`)
    }
  })
}
