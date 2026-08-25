/**
 * constants.ts 静态边界单测：Pi 特有常量与 contextKey 组装。
 * 契约面常量（命令/工具名、错误前缀）已下沉 core surface，不再在此断言。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  CONTEXT_KEY_FALLBACK,
  CONTEXT_KEY_PREFIX,
  contextKeyOf,
  NODE_ID_PREFIX,
  OWNER_RUN_ID_FALLBACK,
  SESSION_CONTEXT_CUSTOM_TYPE,
} from '../src/constants.ts'

test('static boundary: retained pi-specific constants', () => {
  assert.equal(CONTEXT_KEY_PREFIX, 'pi')
  assert.equal(CONTEXT_KEY_FALLBACK, 'unknown')
  assert.equal(OWNER_RUN_ID_FALLBACK, 'unknown')
  assert.equal(NODE_ID_PREFIX, 'workloom-execute-')
  assert.equal(SESSION_CONTEXT_CUSTOM_TYPE, 'workloom-session-context')
})

test('contextKeyOf: prefixes session id with pi_', () => {
  assert.equal(contextKeyOf('sess-1'), 'pi_sess-1')
})

test('contextKeyOf: empty session id falls back to pi_unknown', () => {
  assert.equal(contextKeyOf(''), 'pi_unknown')
})
