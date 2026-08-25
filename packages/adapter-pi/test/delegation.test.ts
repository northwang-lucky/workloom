/**
 * delegation.ts 纯函数单测：请求组装、effort→thinking 映射、响应→文本/错误。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import type { SubagentDelegationResponse } from 'pi-subagents/delegation'

import { EMPTY_OUTPUT_TEXT } from '@workloom/core'

import { NODE_ID_PREFIX } from '../src/constants.ts'
import {
  buildDelegationRequest,
  delegationFailureMessage,
  effortToThinking,
  responseToText,
} from '../src/delegation.ts'

test('buildDelegationRequest: core fields and text result', () => {
  const request = buildDelegationRequest({
    requestId: 'req-1',
    ownerRunId: 'sess-1',
    nodeId: `${NODE_ID_PREFIX}abc12345`,
    agent: 'research',
    task: 'task text',
    cwd: '/tmp/project',
  })
  assert.equal(request.requestId, 'req-1')
  assert.equal(request.ownerRunId, 'sess-1')
  assert.equal(request.nodeId, `${NODE_ID_PREFIX}abc12345`)
  assert.equal(request.agent, 'research')
  assert.equal(request.context, 'fresh')
  assert.equal(request.cwd, '/tmp/project')
  assert.deepEqual(request.result, { kind: 'text' })
  assert.equal(request.model, undefined)
  assert.equal(request.thinking, undefined)
})

test('effortToThinking: five levels map by name, undefined passes through', () => {
  for (const level of ['low', 'medium', 'high', 'xhigh', 'max']) {
    assert.equal(effortToThinking(level), level)
  }
  assert.equal(effortToThinking(undefined), undefined)
})

test('buildDelegationRequest: model and effort project onto request', () => {
  const request = buildDelegationRequest({
    requestId: 'req-2',
    ownerRunId: 'sess-2',
    nodeId: 'n2',
    agent: 'implement',
    task: 't',
    cwd: '/tmp/p',
    model: 'gpt-4o',
    effort: 'high',
  })
  assert.equal(request.model, 'gpt-4o')
  assert.equal(request.thinking, 'high')
})

test('responseToText: completed with text returns the text', () => {
  const response: SubagentDelegationResponse = {
    requestId: 'req',
    ownerRunId: 's',
    nodeId: 'n',
    status: 'completed',
    result: { kind: 'text', text: 'hello' },
  }
  assert.equal(responseToText(response), 'hello')
})

test('responseToText: completed with empty text falls back to EMPTY_OUTPUT_TEXT', () => {
  const response: SubagentDelegationResponse = {
    requestId: 'req',
    ownerRunId: 's',
    nodeId: 'n',
    status: 'completed',
    result: { kind: 'text', text: '' },
  }
  assert.equal(responseToText(response), EMPTY_OUTPUT_TEXT)
})

test('responseToText: non-completed returns null and failure message carries status/error', () => {
  const response: SubagentDelegationResponse = {
    requestId: 'req',
    ownerRunId: 's',
    nodeId: 'n',
    status: 'failed',
    error: 'boom',
  }
  assert.equal(responseToText(response), null)
  const message = delegationFailureMessage(response)
  assert.ok(message.includes('failed'))
  assert.ok(message.includes('boom'))
})

test('delegationFailureMessage: completed without a text result', () => {
  const response: SubagentDelegationResponse = {
    requestId: 'req',
    ownerRunId: 's',
    nodeId: 'n',
    status: 'completed',
  }
  assert.ok(delegationFailureMessage(response).includes('without a text result'))
})
