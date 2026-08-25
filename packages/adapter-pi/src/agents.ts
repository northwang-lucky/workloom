/**
 * adapter-pi 的 pi-subagents 运行时 agent 注册（registerAgent）。
 *
 * 设计意图：
 * - 三个 executor agent（research/implement/check）注册为 pi-subagents 的
 *   运行时 agent，name 与 core 的 EXECUTOR_KINDS 值一致，与内置
 *   scout/researcher/worker/reviewer/oracle/delegate 不冲突；
 * - 定义数据（EXECUTOR_AGENT_DEFINITIONS）在 agent-definitions.ts，
 *   本文件只负责注册；
 * - registerAgent 抛错（重名/非法定义）fail loud，直接向上抛。
 */

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import { registerAgent } from 'pi-subagents/agents'

import { EXECUTOR_KINDS } from '@workloom/core'

import { EXECUTOR_AGENT_DEFINITIONS } from './agent-definitions.ts'
import { AGENT_ERR_PREFIX } from './constants.ts'

/**
 * 注册三个 executor agent（registerAgent 抛错直接向上抛，严格依赖 pi-subagents）。
 * @param pi Extension API
 */
export function registerExecutorAgents(pi: ExtensionAPI): void {
  for (const kind of Object.values(EXECUTOR_KINDS)) {
    const definition = EXECUTOR_AGENT_DEFINITIONS[kind]
    if (definition === undefined) {
      throw new Error(`${AGENT_ERR_PREFIX}: no agent definition for kind ${kind}`)
    }
    registerAgent({ pi, name: kind, definition })
  }
}
