/**
 * plugin 公共注册接缝测试：apply(ctx) 激活过程不得注册 Workloom 文件写入预执行监听
 * （tools/pre-execute）。测试依赖 dist（test 脚本先 build 再跑 node --test）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { apply } from '../dist/plugin.js'

/**
 * 构造满足 apply 全部服务面的 mock ctx，并记录 ctx.on 注册的事件名。
 * 断言观察点在公共注册接缝：activations 只应注册 effort 通道（agent/created）。
 */
function makeMockCtx() {
  const listeners = []
  return {
    listeners,
    ctx: {
      systemPrompt: {
        section: () => () => {},
        context: () => () => {},
      },
      commands: { register: () => {} },
      tools: {
        register: () => {},
        schemas: () => [],
      },
      skills: { register: () => {} },
      agents: {},
      subagents: {},
      on: (event, listener) => {
        listeners.push({ event, listener })
      },
    },
  }
}

test('激活过程不注册文件写预执行监听（tools/pre-execute）', () => {
  const { ctx, listeners } = makeMockCtx()
  apply(ctx)
  const events = listeners.map((entry) => entry.event)
  assert.ok(
    !events.includes('tools/pre-execute'),
    'apply must not register a file-write pre-execute listener',
  )
})

test('正向对照：激活过程注册 effort 注入通道（agent/created），负断言非空转', () => {
  const { ctx, listeners } = makeMockCtx()
  apply(ctx)
  const events = listeners.map((entry) => entry.event)
  assert.ok(
    events.includes('agent/created'),
    'apply must register the effort injection channel (agent/created)',
  )
})

test('激活过程注册 executor 派发终态回填通道（subagent/end）', () => {
  const { ctx, listeners } = makeMockCtx()
  apply(ctx)
  const events = listeners.map((entry) => entry.event)
  assert.ok(
    events.includes('subagent/end'),
    'apply must register the dispatch settlement channel (subagent/end)',
  )
})