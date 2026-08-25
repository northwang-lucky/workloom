/**
 * adapter-pi 的 child pi JSONL 事件流解析（纯函数，可喂样例 JSONL 单测）。
 *
 * 设计意图：
 * - child pi 以 --mode json 逐行输出 JSONL 事件（session/agent_start/
 *   turn_start / message_start / message_update / message_end /
 *   tool_execution_start / turn_end / agent_end）；本模块只消费两类：
 *   message_end（assistant 的 text 块，即子代理输出）与 agent_end（终止判定）；
 * - JSON.parse 失败或非对象行静默跳过：流可能混入非事件输出，不因坏行中断；
 * - 工具循环里 assistant 每轮一个 message_end：只保留「最后一个非空
 *   assistant 消息」的 text 块（与 DSH finalAssistantOutput 语义一致，
 *   中间轮次的叙述不混入最终输出），thinking/toolCall 块忽略。
 */

import { EMPTY_OUTPUT_TEXT } from '@workloom-ai/core'

/** 事件解析累计状态（每次派发一个实例，逐行喂入）。 */
export interface PiEventState {
  /** 最后一个非空 assistant 消息的 text 块（新消息整体替换）。 */
  textParts: string[]
  /** 是否已见 agent_end（终止事件）。 */
  done: boolean
}

/**
 * 解析单行 JSONL 事件并更新状态；坏行/非对象行静默跳过。
 * @param line 单行原始文本
 * @param state 累计状态（原地更新）
 */
export function parsePiEventLine(line: string, state: PiEventState): void {
  const event = parseEventLine(line)
  if (event === null) return
  if (event.type === 'message_end') {
    collectAssistantText(event, state)
  } else if (event.type === 'agent_end') {
    state.done = true
  }
}

/**
 * 提取 executor 最终文本：textParts 用换行连接（对齐 DSH 的多块连接
 * 语义），trim 后为空回退 EMPTY_OUTPUT_TEXT（core surface）。
 * @param parts 最后一个非空 assistant 消息的文本块
 * @returns 最终文本
 */
export function extractExecutorText(parts: string[]): string {
  const text = parts.join('\n')
  return text.trim() === '' ? EMPTY_OUTPUT_TEXT : text
}

/**
 * JSON.parse 单行并归一为对象事件；解析失败或非对象行返回 null（静默跳过）。
 * @param line 单行原始文本
 * @returns 对象事件或 null
 */
function parseEventLine(line: string): Record<string, unknown> | null {
  if (line.trim() === '') return null
  let parsed: unknown
  try {
    parsed = JSON.parse(line)
  } catch {
    return null
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  return parsed as Record<string, unknown>
}

/**
 * 收集 message_end 中 assistant 消息的 text 块（thinking/toolCall 块忽略）；
 * 本消息含 text 时整体替换 state.textParts（只保留最后一个非空 assistant
 * 消息，与 DSH finalAssistantOutput 语义一致）。
 * @param event message_end 事件
 * @param state 累计状态（原地更新）
 */
function collectAssistantText(event: Record<string, unknown>, state: PiEventState): void {
  const message = event.message
  if (message === null || typeof message !== 'object' || Array.isArray(message)) return
  const record = message as Record<string, unknown>
  if (record.role !== 'assistant') return
  const content = record.content
  if (!Array.isArray(content)) return
  const textBlocks: string[] = []
  for (const block of content) {
    if (block === null || typeof block !== 'object' || Array.isArray(block)) continue
    const entry = block as Record<string, unknown>
    if (entry.type !== 'text' || typeof entry.text !== 'string') continue
    textBlocks.push(entry.text)
  }
  if (textBlocks.length > 0) state.textParts = textBlocks
}
