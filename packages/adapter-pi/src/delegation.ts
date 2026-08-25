/**
 * adapter-pi 的派发协议纯组装（delegation.ts）。
 *
 * 设计意图：
 * - 把 executor 工具的入参投影为 pi-subagents 的 SubagentDelegationRequest，
 *   与响应到文本/错误的转换都收敛为纯函数，便于 node:test 单测；
 * - effort 档位（low/medium/high/xhigh/max）与 Pi thinking 档位同名直传，
 *   无 effort 不设 thinking（core 的 assertEffort 已在调用方保证合法值）；
 * - responseToText 返回 null 表示「非可消费结果」，错误文案组装由
 *   delegationFailureMessage 负责，executor 拿它抛英文 Error。
 */

import type {
  SubagentDelegationRequest,
  SubagentDelegationResponse,
  SubagentDelegationThinking,
} from 'pi-subagents/delegation'

import { EMPTY_OUTPUT_TEXT, EXECUTOR_ERR_PREFIX } from './constants.ts'

/** effort 档位与 Pi thinking 档位的同名映射（档位定义对齐 core 的 EFFORT_LEVELS）。 */
const EFFORT_TO_THINKING: Readonly<Record<string, SubagentDelegationThinking>> = {
  low: 'low',
  medium: 'medium',
  high: 'high',
  xhigh: 'xhigh',
  max: 'max',
}

/** buildDelegationRequest 入参（executor 工具参数中与派发相关的投影）。 */
export interface BuildDelegationRequestParams {
  /** 一次派发的唯一请求 id（randomUUID）。 */
  requestId: string
  /** 发起会话 id（响应按 requestId+ownerRunId+nodeId 三元组匹配）。 */
  ownerRunId: string
  /** 逻辑节点 id（形如 workloom-execute-xxxxxxxx）。 */
  nodeId: string
  /** 目标 agent 名（research/implement/check）。 */
  agent: string
  /** 任务全文（buildExecutorPrompt 的产物）。 */
  task: string
  /** 子代理工作目录。 */
  cwd: string
  /** 显式模型 id（可选）。 */
  model?: string
  /** effort 档位（可选，映射为 thinking）。 */
  effort?: string
}

/**
 * effort 档位 → Pi thinking 档位的同名映射；无 effort 返回 undefined（不设 thinking）。
 * @param effort core 的 effort 档位（low..max），调用方已 assertEffort
 * @returns thinking 档位或 undefined
 */
export function effortToThinking(
  effort: string | undefined,
): SubagentDelegationThinking | undefined {
  if (effort === undefined) return undefined
  return EFFORT_TO_THINKING[effort]
}

/**
 * 组装 SubagentDelegationRequest（恒前台文本结果；model/thinking 按可选字段稀疏展开）。
 * @param params 入参
 * @returns 派发请求
 */
export function buildDelegationRequest(
  params: BuildDelegationRequestParams,
): SubagentDelegationRequest {
  const thinking = effortToThinking(params.effort)
  return {
    requestId: params.requestId,
    ownerRunId: params.ownerRunId,
    nodeId: params.nodeId,
    agent: params.agent,
    task: params.task,
    context: 'fresh',
    cwd: params.cwd,
    ...(params.model !== undefined ? { model: params.model } : {}),
    ...(thinking !== undefined ? { thinking } : {}),
    result: { kind: 'text' },
  }
}

/**
 * 响应 → 可消费文本：completed 且结果为文本时返回文本（空文本替换为
 * EMPTY_OUTPUT_TEXT）；其余情况返回 null（由 executor 抛错）。
 * @param response 派发终态响应
 * @returns 文本或 null
 */
export function responseToText(response: SubagentDelegationResponse): string | null {
  if (response.status !== 'completed') return null
  const result = response.result
  if (result === undefined || result.kind !== 'text') return null
  return result.text === '' ? EMPTY_OUTPUT_TEXT : result.text
}

/**
 * 组装「响应不可消费」的错误文案（英文）：非 completed 状态附 error 字段；
 * completed 但缺文本结果单独措辞。
 * @param response 派发终态响应
 * @returns 错误文案（供 executor throw）
 */
export function delegationFailureMessage(response: SubagentDelegationResponse): string {
  if (response.status === 'completed') {
    return `${EXECUTOR_ERR_PREFIX}: completed without a text result`
  }
  const detail = response.error
  return `${EXECUTOR_ERR_PREFIX}: subagent delegation ended with status ${response.status}${
    detail !== undefined ? `: ${detail}` : ''
  }`
}
