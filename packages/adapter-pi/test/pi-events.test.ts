/**
 * pi-events.ts 纯函数单测：样例 JSONL 事件流（含坏行、text/thinking/toolCall
 * 块、多轮 message_end、agent_end）→ 文本提取与终止判定。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { EMPTY_OUTPUT_TEXT } from '@workloom/core'

import { extractExecutorText, parsePiEventLine, type PiEventState } from '../src/pi-events.ts'

/** 新状态实例（每次用例独立）。 */
function freshState(): PiEventState {
  return { textParts: [], done: false }
}

test('parsePiEventLine: sample stream extracts assistant text across rounds', () => {
  const lines = [
    '{"type":"session","version":3,"id":"s1","cwd":"/tmp/demo"}',
    '{"type":"agent_start"}',
    '{"type":"turn_start"}',
    'not-json-at-all',
    '{"type":"message_end","message":{"role":"assistant","content":[{"type":"thinking","thinking":"plan..."},{"type":"toolCall","id":"t1","name":"bash","arguments":{}},{"type":"text","text":"First round text"}]}}',
    '{"type":"message_end","message":{"role":"assistant","content":[{"type":"text","text":"Second round text"}]}}',
    '{"type":"tool_execution_start","toolCallId":"t1","toolName":"bash","args":{}}',
    '{"type":"turn_end"}',
    '{"type":"agent_end"}',
  ]
  const state = freshState()
  for (const line of lines) parsePiEventLine(line, state)
  assert.equal(state.done, true)
  // thinking/toolCall 块忽略；只保留最后一个非空 assistant 消息
  // （与 DSH finalAssistantOutput 语义一致，中间轮次叙述不混入）。
  assert.equal(extractExecutorText(state.textParts), 'Second round text')
})

test('parsePiEventLine: message_end without text keeps the previous text round', () => {
  const state = freshState()
  // 第一轮带 text，第二轮只有 toolCall（无 text）→ 保留第一轮。
  parsePiEventLine(
    '{"type":"message_end","message":{"role":"assistant","content":[{"type":"text","text":"kept round"}]}}',
    state,
  )
  parsePiEventLine(
    '{"type":"message_end","message":{"role":"assistant","content":[{"type":"toolCall","id":"t1","name":"bash","arguments":{}}]}}',
    state,
  )
  parsePiEventLine('{"type":"agent_end"}', state)
  assert.equal(extractExecutorText(state.textParts), 'kept round')
})

test('parsePiEventLine: defensive shapes (non-array content, mixed blocks) are skipped', () => {
  const state = freshState()
  parsePiEventLine('{"type":"message_end","message":{"role":"assistant","content":"plain"}}', state)
  parsePiEventLine(
    '{"type":"message_end","message":{"role":"assistant","content":[{"type":"text","text":"good"},"oops",42,null]}}',
    state,
  )
  assert.equal(extractExecutorText(state.textParts), 'good')
})

test('parsePiEventLine: bad and non-object lines are skipped without throwing', () => {
  const state = freshState()
  const lines = [
    '',
    'not json',
    '"a string"',
    '42',
    'null',
    '[1, 2]',
    '{"type":"turn_start"}',
    '{"type":"message_end","message":{"role":"assistant","content":[{"type":"text","text":"ok"}]}}',
    '{"type":"message_end","message":"oops"}',
    '{"type":"message_end"}',
    '{"type":"agent_end"}',
  ]
  for (const line of lines) parsePiEventLine(line, state)
  assert.equal(state.done, true)
  assert.equal(extractExecutorText(state.textParts), 'ok')
})

test('extractExecutorText: empty parts fall back to EMPTY_OUTPUT_TEXT', () => {
  assert.equal(extractExecutorText([]), EMPTY_OUTPUT_TEXT)
  assert.equal(extractExecutorText(['', '  ']), EMPTY_OUTPUT_TEXT)
})

test('parsePiEventLine: agent_end not seen keeps done false', () => {
  const state = freshState()
  parsePiEventLine(
    '{"type":"message_end","message":{"role":"assistant","content":[{"type":"text","text":"partial"}]}}',
    state,
  )
  assert.equal(state.done, false)
  assert.equal(extractExecutorText(state.textParts), 'partial')
})

test('parsePiEventLine: non-assistant message_end is ignored', () => {
  const state = freshState()
  parsePiEventLine(
    '{"type":"message_end","message":{"role":"user","content":[{"type":"text","text":"user says"}]}}',
    state,
  )
  assert.equal(state.textParts.length, 0)
})
