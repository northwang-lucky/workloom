/**
 * pi-args.ts 纯函数单测：RPC 固定参数序列、effort→--thinking 同名、model 稀疏、
 * kind 无定义抛错、title 语义化。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { ERR_PREFIX } from '@workloom-ai/core'

import { EXECUTOR_AGENT_DEFINITIONS } from '../src/agent-definitions.ts'
import { buildChildPiArgs } from '../src/pi-args.ts'

/** 五个 effort 档位（与 core 的 EFFORT_LEVELS 对齐）。 */
const EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'] as const

/** 测试用项目根。 */
const TEST_ROOT = '/tmp/workloom-test'

test('buildChildPiArgs: RPC fixed sequence with session-dir and name title', () => {
  const args = buildChildPiArgs({ kind: 'research', root: TEST_ROOT, title: 'investigate' })
  // 固定序列：--mode rpc --session-dir <root>/.workloom/sessions/pi --no-extensions --name "[<KindLabel>] <title>"。
  assert.deepEqual(args.slice(0, 5), [
    '--mode',
    'rpc',
    '--session-dir',
    `${TEST_ROOT}/.workloom/sessions/pi`,
    '--no-extensions',
  ])
  assert.equal(args[5], '--name')
  assert.equal(args[6], '[Research] investigate')
  // --append-system-prompt 紧跟标题，值为该 kind 的角色说明（精确相等）。
  assert.equal(args[7], '--append-system-prompt')
  assert.equal(args[8], EXECUTOR_AGENT_DEFINITIONS.research?.systemPrompt)
  // 无 effort/model 时不再追加参数。
  assert.equal(args.length, 9)
})

test('buildChildPiArgs: frontend 角色注入 frontend 系统提示词', () => {
  const args = buildChildPiArgs({ kind: 'frontend', root: TEST_ROOT, title: 'ui impl' })
  assert.equal(args[8], EXECUTOR_AGENT_DEFINITIONS.frontend?.systemPrompt)
})

test('buildChildPiArgs: title 语义化（四种 kind 标签）', () => {
  for (const [kind, label] of [
    ['research', 'Research'],
    ['implement', 'Implement'],
    ['check', 'Check'],
    ['frontend', 'Frontend'],
  ] as const) {
    const args = buildChildPiArgs({ kind, root: TEST_ROOT, title: 'my task' })
    assert.equal(args[6], `[${label}] my task`)
  }
})

test('buildChildPiArgs: effort levels map to --thinking by name', () => {
  for (const level of EFFORT_LEVELS) {
    const args = buildChildPiArgs({ kind: 'implement', root: TEST_ROOT, title: 't', effort: level })
    assert.deepEqual(args.slice(-2), ['--thinking', level])
  }
})

test('buildChildPiArgs: model is optional and sparse', () => {
  const withModel = buildChildPiArgs({ kind: 'check', root: TEST_ROOT, title: 't', model: 'gpt-4o' })
  assert.deepEqual(withModel.slice(-2), ['--model', 'gpt-4o'])
  const withoutModel = buildChildPiArgs({ kind: 'check', root: TEST_ROOT, title: 't' })
  assert.equal(withoutModel.includes('--model'), false)
  // effort+model 并存时顺序：--thinking 在前，--model 在后。
  const both = buildChildPiArgs({
    kind: 'check',
    root: TEST_ROOT,
    title: 't',
    effort: 'high',
    model: 'gpt-4o',
  })
  assert.deepEqual(both.slice(-4), ['--thinking', 'high', '--model', 'gpt-4o'])
})

test('buildChildPiArgs: loadExtensions 命中时 -e 在 --name 后且保留 --no-extensions（TC1）', () => {
  const args = buildChildPiArgs({
    kind: 'research',
    root: TEST_ROOT,
    title: 't',
    loadExtensions: ['npm:@narumitw/pi-lsp'],
  })
  // 固定序列 7 个（args[0-6]），args[4] = --no-extensions，args[7] = -e，args[8] = <src>。
  assert.equal(args[4], '--no-extensions')
  assert.deepEqual(args.slice(7, 9), ['-e', 'npm:@narumitw/pi-lsp'])
  assert.equal(args.includes('--no-extensions'), true)
  assert.equal(args.includes('npm:@narumitw/pi-lsp'), true)
})

test('buildChildPiArgs: 未传 loadExtensions 时不出现 -e（TC1）', () => {
  const plain = buildChildPiArgs({ kind: 'research', root: TEST_ROOT, title: 't' })
  assert.equal(plain.includes('-e'), false)
  assert.equal(plain.includes('npm:@narumitw/pi-lsp'), false)
})

test('buildChildPiArgs: 空数组同未传（缺省行为与旧版逐字一致）', () => {
  const empty = buildChildPiArgs({
    kind: 'research',
    root: TEST_ROOT,
    title: 't',
    loadExtensions: [],
  })
  assert.deepEqual(empty, buildChildPiArgs({ kind: 'research', root: TEST_ROOT, title: 't' }))
})

test('buildChildPiArgs: unknown kind throws with executor error prefix', () => {
  assert.throws(
    () => buildChildPiArgs({ kind: 'bogus', root: TEST_ROOT, title: 't' }),
    (error: unknown) => {
      assert.ok(error instanceof Error)
      assert.ok(error.message.includes(ERR_PREFIX.executor))
      return true
    },
  )
})

test('buildChildPiArgs: tools 非空时 -t 逗号连接（--name 后）', () => {
  const args = buildChildPiArgs({
    kind: 'research',
    root: TEST_ROOT,
    title: 't',
    tools: ['read', 'bash', 'edit', 'write'],
  })
  // 固定序列 7 个（args[0-6]），args[7] = -t，args[8] = <tools>。
  assert.deepEqual(args.slice(7, 9), ['-t', 'read,bash,edit,write'])
  // -t 在 --name 之后、--append-system-prompt 之前。
  assert.equal(args[9], '--append-system-prompt')
})

test('buildChildPiArgs: tools 与 loadExtensions 并存时 -t 在 -e 之后', () => {
  const args = buildChildPiArgs({
    kind: 'research',
    root: TEST_ROOT,
    title: 't',
    tools: ['read', 'bash', 'edit', 'write', 'lsp_diagnostics'],
    loadExtensions: ['npm:@narumitw/pi-lsp'],
  })
  // args[7] = -e, args[8] = <src>, args[9] = -t, args[10] = <tools>。
  assert.deepEqual(args.slice(7, 11), [
    '-e',
    'npm:@narumitw/pi-lsp',
    '-t',
    'read,bash,edit,write,lsp_diagnostics',
  ])
})

test('buildChildPiArgs: 空 tools 集 → fail loud（ERR_PREFIX.executor，指明 kind）', () => {
  assert.throws(
    () => buildChildPiArgs({ kind: 'check', root: TEST_ROOT, title: 't', tools: [] }),
    (error: unknown) => {
      assert.ok(error instanceof Error)
      assert.ok(error.message.includes(ERR_PREFIX.executor))
      assert.match(error.message, /check/)
      return true
    },
  )
})

test('buildChildPiArgs: 未传 tools 时不出现 -t（缺省向后兼容）', () => {
  const plain = buildChildPiArgs({ kind: 'research', root: TEST_ROOT, title: 't' })
  assert.equal(plain.includes('-t'), false)
  const empty = buildChildPiArgs({ kind: 'research', root: TEST_ROOT, title: 't', tools: undefined })
  assert.equal(empty.includes('-t'), false)
})
