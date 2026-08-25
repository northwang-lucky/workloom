/**
 * pi-args.ts 纯函数单测：固定参数序列、effort→--thinking 同名、model 稀疏、
 * kind 无定义抛错。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { ERR_PREFIX } from '@workloom/core'

import { EXECUTOR_AGENT_DEFINITIONS } from '../src/agent-definitions.ts'
import { buildChildPiArgs } from '../src/pi-args.ts'

/** 五个 effort 档位（与 core 的 EFFORT_LEVELS 对齐）。 */
const EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'] as const

test('buildChildPiArgs: fixed sequence with prompt and role system prompt', () => {
  const args = buildChildPiArgs({ prompt: 'do the thing', kind: 'research' })
  // 固定序列前 5 个元素 + --no-extensions 在第 6 位。
  assert.deepEqual(args.slice(0, 5), ['--mode', 'json', '-p', 'do the thing', '--no-session'])
  assert.equal(args[5], '--no-extensions')
  // --append-system-prompt 紧跟固定序列，值为该 kind 的角色说明（精确相等）。
  assert.equal(args[6], '--append-system-prompt')
  assert.equal(args[7], EXECUTOR_AGENT_DEFINITIONS.research?.systemPrompt)
  // 无 effort/model 时不再追加参数。
  assert.equal(args.length, 8)
})

test('buildChildPiArgs: effort levels map to --thinking by name', () => {
  for (const level of EFFORT_LEVELS) {
    const args = buildChildPiArgs({ prompt: 'p', kind: 'implement', effort: level })
    assert.deepEqual(args.slice(-2), ['--thinking', level])
  }
})

test('buildChildPiArgs: model is optional and sparse', () => {
  const withModel = buildChildPiArgs({ prompt: 'p', kind: 'check', model: 'gpt-4o' })
  assert.deepEqual(withModel.slice(-2), ['--model', 'gpt-4o'])
  const withoutModel = buildChildPiArgs({ prompt: 'p', kind: 'check' })
  assert.equal(withoutModel.includes('--model'), false)
  // effort+model 并存时顺序：--thinking 在前，--model 在后。
  const both = buildChildPiArgs({ prompt: 'p', kind: 'check', effort: 'high', model: 'gpt-4o' })
  assert.deepEqual(both.slice(-4), ['--thinking', 'high', '--model', 'gpt-4o'])
})

test('buildChildPiArgs: unknown kind throws with executor error prefix', () => {
  assert.throws(
    () => buildChildPiArgs({ prompt: 'p', kind: 'bogus' }),
    (error: unknown) => {
      assert.ok(error instanceof Error)
      assert.ok(error.message.includes(ERR_PREFIX.executor))
      return true
    },
  )
})
