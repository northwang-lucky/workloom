/**
 * model-failover 模块单测（自 core failover.test.ts 迁移）：模型不可访问错误码
 * 白名单、code 提取口径、failover 说明与通知文案（英文运行时文案，role 词汇）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  MODEL_INACCESSIBLE_CODES,
  buildFailoverNote,
  buildFailoverNotice,
  extractFailureCode,
  isModelInaccessibleCode,
} from '../src/dispatch/model-failover.ts'

// 测试隔离：纯函数模块虽不读配置，仍沿 HOME 加 TMPDIR 隔离惯例（防全局配置
// 残留污染，与 executor.test.ts 同口径）。
const isolatedHome = mkdtempSync(join(tmpdir(), 'workloom-dsh-failover-home-'))
process.env.HOME = isolatedHome
process.env.TMPDIR = isolatedHome

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
  // 单行注入（追加进重派 prompt 尾部，不破坏段落结构）。
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

test('buildFailoverNotice：一行通知含失败模型/错误码/下一模型/第几跳；穷尽与阻断各有分支（role 词汇）', () => {
  const retry = buildFailoverNotice({
    role: 'developer',
    title: 'fallback chain test',
    deadModel: 'provider-a/glm',
    code: 'TRANSPORT',
    nextModel: 'provider-b/qwen',
    attempt: 2,
    total: 2,
  })
  assert.match(retry, /provider-a\/glm/)
  assert.match(retry, /TRANSPORT/)
  assert.match(retry, /provider-b\/qwen/)
  assert.match(retry, /attempt 2 of 2/)
  assert.match(retry, /developer/)
  assert.match(retry, /^workloom executor failover \(/)
  assert.doesNotMatch(retry, /\n/)

  const exhausted = buildFailoverNotice({
    role: 'developer',
    title: 'fallback chain test',
    deadModel: 'provider-b/qwen',
    code: 'TIMEOUT',
    attempt: 1,
    total: 1,
  })
  assert.match(exhausted, /exhausted/i)
  assert.match(exhausted, /1 attempt\(s\)/)
  assert.doesNotMatch(exhausted, /\n/)

  // 阻断分支：不启动下一跳，文案说明放弃原因并可人工重派（一跳上限/启动失败）。
  const blocked = buildFailoverNotice({
    role: 'researcher',
    title: 'blocked transfer',
    deadModel: 'provider-a/glm',
    code: 'RATE_LIMIT',
    attempt: 2,
    total: 2,
    blockedReason: 'the one-hop failover limit is reached',
  })
  assert.match(blocked, /one-hop failover limit/i)
  assert.match(blocked, /manually/i)
  assert.doesNotMatch(blocked, /\n/)
})
