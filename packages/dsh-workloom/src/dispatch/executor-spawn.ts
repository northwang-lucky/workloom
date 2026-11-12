/**
 * dsh-workloom executor 新子会话启动（共享模块）：预分配 childId + 工具面白名单
 * 登记 + startActivation + 失败撤销。
 *
 * 设计意图：
 * - executor.ts（新派发分支）与 executor-settle.ts（结算重试钩子）单向引入本
 *   模块，避免 executor ↔ settle 直接互引成环（R2-4）；
 * - model/effort 覆盖在入参表达（重试钩子传 fallback 链下一跳的模型与档位；
 *   缺省不覆盖父会话选择），组装语义与原 executor.ts 新派发分支逐字一致：
 *   model 支持 "provider/model" 前缀拆分（跨 provider 派发才不报 UNKNOWN_MODEL），
 *   effort 原样 brand 进 reasoningEffort（同名直通）；
 * - 白名单登记先于 startActivation（agent/created 事件早于启动返回），启动失败
 *   撤销登记避免 id 泄漏进索引；错误原样上抛（调用方决定回执/告警形态）。
 */
import { randomUUID } from 'node:crypto'

import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import { splitProviderModel } from '@workloom-ai/core'

import { SPAWN_PROVIDER } from './executor-dispatch.ts'
import { registerExecutorToolfaceChild, releaseExecutorToolfaceChild } from './executor-toolface.ts'

/** spawnExecutorChild 入参（对象封装）。 */
export interface SpawnExecutorChildParams {
  /** 插件上下文（subagents 服务由宿主注入）。 */
  ctx: Context
  /** 发起派发的父代理。 */
  parent: Agent
  /** 子会话标题（[<RoleLabel>] <title>，调用方经 buildChildLabel 组装）。 */
  label: string
  /** 首条 prompt 全文（重试路径 = 原 prompt + 尾部 failover note 段）。 */
  promptText: string
  /** 模型覆盖（provider/model 或裸 id；缺省不覆盖父会话模型选择）。 */
  model?: string
  /** effort 覆盖（原样直通 reasoningEffort；缺省不传）。 */
  effort?: string
  /** 工具白名单（agent/created 前登记，冷恢复重建的依据）。 */
  toolsAllow: readonly string[]
  /** 取消信号（结算重试钩子传独立 AbortController——原回合 signal 已结束不可复用）。 */
  signal: AbortSignal
}

/**
 * 启动一个新的 executor 子会话，返回 childId：预分配 childId 并登记工具面白名单
 * → startActivation（maxDepth 1 = executor 禁止再派发，delivery parent）→ 失败
 * 撤销白名单登记并原样抛出。
 * @param params 启动入参
 * @returns 子代理 durable session id
 */
export async function spawnExecutorChild(params: SpawnExecutorChildParams): Promise<string> {
  // model/effort 独立组装（与 executor.ts 原新派发分支同语义）：model 拆 provider
  // 前缀一并传入；effort 原样 brand；两者均未生效时 agentOptions 为 undefined
  // （不覆盖父会话的模型选择）。
  const splitModel = params.model === undefined ? undefined : splitProviderModel(params.model)
  const agentOptions =
    splitModel === undefined && params.effort === undefined
      ? undefined
      : {
          ...(splitModel ?? {}),
          ...(params.effort !== undefined
            ? { reasoningEffort: ReasoningEffortId(params.effort) }
            : {}),
        }
  // 预分配 childId 并在创建前登记工具白名单（agent/created 早于 startActivation
  // 返回）；启动失败撤销登记，避免 id 泄漏进索引。
  const reservedChildId = SessionId(randomUUID())
  registerExecutorToolfaceChild(reservedChildId, params.toolsAllow)
  try {
    const started = await params.ctx.subagents.startActivation({
      provider: SPAWN_PROVIDER,
      label: params.label,
      childId: reservedChildId,
      // rc.2 起 SubagentActivationSpec 直接继承 SubagentStartRequest，
      // 子代理启动参数展开到顶层，不再嵌在 request 里
      prompt: [{ type: 'text', text: params.promptText }],
      parent: params.parent,
      agentOptions,
      maxDepth: 1,
      signal: params.signal,
      delivery: 'parent',
    })
    return started.childId
  } catch (error) {
    releaseExecutorToolfaceChild(reservedChildId)
    throw error
  }
}
