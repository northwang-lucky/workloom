/**
 * failover 模块单测：模型不可访问错误码白名单、code 提取口径、failover 说明与
 * 通知文案（英文运行时文案）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  MODEL_INACCESSIBLE_CODES,
  buildFailoverNote,
  buildFailoverNotice,
  extractFailureCode,
  isModelInaccessibleCode,
} from '../src/domain/failover.js'

test('isModelInaccessibleCode：白名单内全部命中，白名单外/空/undefined 一律 false', () => {
  // 白名单集合本身也须被钉住：只循环常量会放过「漏掉某个必需 code」的回归。
  const expectedCodes = [
    'TRANSPORT',
    'TIMEOUT',
    'UNKNOWN_MODEL',
    'AUTH',
    'INVALID_CREDENTIAL',
    'MISSING_CREDENTIAL',
    'ACCOUNT_QUOTA',
    'ACCOUNT_SIGN_IN_REQUIRED',
    'ACCOUNT_TOKEN_INVALID',
    'RATE_LIMIT',
    'QUOTA',
    'UNSUPPORTED_REASONING_EFFORT',
  ]
  assert.deepEqual([...MODEL_INACCESSIBLE_CODES].sort(), [...expectedCodes].sort())
  for (const code of MODEL_INACCESSIBLE_CODES) {
    assert.equal(isModelInaccessibleCode(code), true, `${code} must trigger failover`)
  }
  // 业务性失败与非法输入不触发（保守口径：只认结构化 code 白名单）。
  for (const code of ['INVARIANT', '', 'transport', 'UNKNOWN', undefined, null, 5, {}]) {
    assert.equal(isModelInaccessibleCode(code), false, `${String(code)} must not trigger failover`)
  }
})

test('extractFailureCode：对象 code 为 string 时提取，其余形状返回 null', () => {
  assert.equal(extractFailureCode({ code: 'TRANSPORT', message: 'connection error' }), 'TRANSPORT')
  assert.equal(extractFailureCode({ code: '  TRANSPORT  ' }), 'TRANSPORT')
  assert.equal(extractFailureCode({ message: 'no code here' }), null)
  assert.equal(extractFailureCode({ code: '   ' }), null)
  assert.equal(extractFailureCode({ code: 5 }), null)
  assert.equal(extractFailureCode(new Error('plain error')), null)
  assert.equal(extractFailureCode('TRANSPORT'), null)
  assert.equal(extractFailureCode(null), null)
  assert.equal(extractFailureCode(undefined), null)
})

test('buildFailoverNote：注明死掉的模型、错误码与半成品风险；续用轮追加增量丢失说明', () => {
  const note = buildFailoverNote({
    deadModel: 'provider-a/glm',
    code: 'TRANSPORT',
    wasContinuation: false,
  })
  assert.match(note, /provider-a\/glm/)
  assert.match(note, /TRANSPORT/)
  // 半成品提示：工作区可能留有上一轮未完成的工作。
  assert.match(note, /workspace/i)
  assert.match(note, /partially/i)
  // 单行注入（追加进首条 prompt，不破坏段落结构）。
  assert.doesNotMatch(note, /\n/)
  // 非续用轮不出现增量丢失说明。
  assert.doesNotMatch(note, /incremental/i)

  const continued = buildFailoverNote({
    deadModel: 'provider-a/glm',
    code: 'TIMEOUT',
    wasContinuation: true,
  })
  assert.match(continued, /provider-a\/glm/)
  assert.match(continued, /TIMEOUT/)
  assert.match(continued, /incremental/i)
  assert.match(continued, /lost/i)
})

test('buildFailoverNotice：一行通知含失败模型/错误码/下一模型/第几跳；穷尽与容量阻断各有分支', () => {
  const retry = buildFailoverNotice({
    kind: 'implement',
    title: 'fallback chain test',
    deadModel: 'provider-a/glm',
    code: 'TRANSPORT',
    nextModel: 'provider-b/qwen',
    attempt: 2,
    total: 3,
  })
  assert.match(retry, /provider-a\/glm/)
  assert.match(retry, /TRANSPORT/)
  assert.match(retry, /provider-b\/qwen/)
  assert.match(retry, /attempt 2 of 3/)
  assert.match(retry, /implement/)
  assert.doesNotMatch(retry, /\n/)

  const exhausted = buildFailoverNotice({
    kind: 'implement',
    title: 'fallback chain test',
    deadModel: 'provider-b/qwen',
    code: 'TIMEOUT',
    attempt: 3,
    total: 3,
  })
  assert.match(exhausted, /exhausted/i)
  assert.match(exhausted, /3/)
  assert.doesNotMatch(exhausted, /\n/)

  // 容量闸拒绝：不启动下一跳，文案说明放弃原因并可人工重派。
  const blocked = buildFailoverNotice({
    kind: 'research',
    title: 'blocked transfer',
    deadModel: 'provider-a/glm',
    code: 'RATE_LIMIT',
    attempt: 2,
    total: 2,
    blockedReason: 'the executor capacity gate rejected the retry',
  })
  assert.match(blocked, /capacity gate/i)
  assert.match(blocked, /manually/i)
  assert.doesNotMatch(blocked, /\n/)
})
