/**
 * pi-args.ts 纯函数单测：固定参数序列、effort→--thinking 同名、model 稀疏、
 * kind 无定义抛错。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { ERR_PREFIX } from '@workloom-ai/core'

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

test('buildChildPiArgs: frontend 角色注入 frontend 系统提示词', () => {
  const args = buildChildPiArgs({ prompt: 'do ui', kind: 'frontend' })
  assert.equal(args[7], EXECUTOR_AGENT_DEFINITIONS.frontend?.systemPrompt)
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

test('buildChildPiArgs: loadExtensions 命中时 -e 在 --no-extensions 后且保留 --no-extensions（TC1）', () => {
  const args = buildChildPiArgs({
    prompt: 'do the thing',
    kind: 'research',
    loadExtensions: ['npm:@narumitw/pi-lsp'],
  })
  assert.equal(args[5], '--no-extensions')
  assert.deepEqual(args.slice(6, 8), ['-e', 'npm:@narumitw/pi-lsp'])
  assert.equal(args.includes('--no-extensions'), true)
  assert.equal(args.includes('npm:@narumitw/pi-lsp'), true)
})

test('buildChildPiArgs: 未传 loadExtensions 时不出现 -e（TC1）', () => {
  const plain = buildChildPiArgs({ prompt: 'p', kind: 'research' })
  assert.equal(plain.includes('-e'), false)
  assert.equal(plain.includes('npm:@narumitw/pi-lsp'), false)
})

test('buildChildPiArgs: 空数组同未传（缺省行为与旧版逐字一致）', () => {
  const empty = buildChildPiArgs({ prompt: 'p', kind: 'research', loadExtensions: [] })
  assert.deepEqual(empty, buildChildPiArgs({ prompt: 'p', kind: 'research' }))
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

test('buildChildPiArgs: tools 非空时 -t 逗号连接（扩展源后、append-system-prompt 前）', () => {
  const args = buildChildPiArgs({
    prompt: 'p',
    kind: 'research',
    tools: ['read', 'bash', 'edit', 'write'],
  })
  assert.deepEqual(args.slice(6, 8), ['-t', 'read,bash,edit,write'])
  // -t 在 --no-extensions 之后、--append-system-prompt 之前。
  assert.equal(args[5], '--no-extensions')
  assert.equal(args[8], '--append-system-prompt')
})

test('buildChildPiArgs: tools 与 loadExtensions 并存时 -t 在 -e 之后', () => {
  const args = buildChildPiArgs({
    prompt: 'p',
    kind: 'research',
    tools: ['read', 'bash', 'edit', 'write', 'lsp_diagnostics'],
    loadExtensions: ['npm:@narumitw/pi-lsp'],
  })
  assert.deepEqual(args.slice(6, 10), ['-e', 'npm:@narumitw/pi-lsp', '-t', 'read,bash,edit,write,lsp_diagnostics'])
})

test('buildChildPiArgs: 空 tools 集 → fail loud（ERR_PREFIX.executor，指明 kind）', () => {
  assert.throws(
    () => buildChildPiArgs({ prompt: 'p', kind: 'check', tools: [] }),
    (error: unknown) => {
      assert.ok(error instanceof Error)
      assert.ok(error.message.includes(ERR_PREFIX.executor))
      assert.match(error.message, /check/)
      return true
    },
  )
})

test('buildChildPiArgs: 未传 tools 时不出现 -t（缺省向后兼容）', () => {
  const plain = buildChildPiArgs({ prompt: 'p', kind: 'research' })
  assert.equal(plain.includes('-t'), false)
  const empty = buildChildPiArgs({ prompt: 'p', kind: 'research', tools: undefined })
  assert.equal(empty.includes('-t'), false)
})
