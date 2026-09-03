/**
 * protocol 模块单测：期望协议版本常量、fail-loud 校验、
 * 与 assets workflow.md front-matter version 的一致性。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import {
  assertWorkflowProtocolVersion,
  WORKFLOW_PROTOCOL_VERSION,
} from '../src/legacy/protocol.js'
import { parseContract } from '../src/legacy/workflow-contract.js'

const assetPath = fileURLToPath(new URL('../../assets/workflow/workflow.md', import.meta.url))

test('WORKFLOW_PROTOCOL_VERSION 为正整数', () => {
  assert.ok(Number.isInteger(WORKFLOW_PROTOCOL_VERSION) && WORKFLOW_PROTOCOL_VERSION > 0)
})

test('assertWorkflowProtocolVersion：匹配不抛错', () => {
  assert.doesNotThrow(() => assertWorkflowProtocolVersion(WORKFLOW_PROTOCOL_VERSION))
})

test('assertWorkflowProtocolVersion：不匹配 fail loud（消息含期望值与实际值）', () => {
  assert.throws(() => assertWorkflowProtocolVersion(WORKFLOW_PROTOCOL_VERSION - 1), (err) => {
    assert.match(err.message, /workflow contract version mismatch/)
    assert.ok(err.message.includes(String(WORKFLOW_PROTOCOL_VERSION)))
    assert.ok(err.message.includes(String(WORKFLOW_PROTOCOL_VERSION - 1)))
    return true
  })
})

test('assets workflow.md front-matter version 与 core 协议版本一致（协议握手事实源）', () => {
  const [err, contract] = parseContract(readFileSync(assetPath, 'utf8'))
  assert.equal(err, null)
  assert.equal(contract.version, WORKFLOW_PROTOCOL_VERSION)
})
