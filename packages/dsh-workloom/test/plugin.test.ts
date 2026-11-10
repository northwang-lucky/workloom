/**
 * plugin 公共注册接缝测试：apply(ctx) 激活过程不得注册 Workloom 文件写入预执行监听
 * （tools/pre-execute）。测试依赖 dist（test 脚本先 build 再跑 node --test）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { apply } from '../src/plugin.ts'

// 测试隔离：core 三层配置的全局层读 $HOME/.workloom/config（调用链无 homeDir
// 注入缝）；本机真实全局配置会泄漏进单测（历史遗留字段即抛解析错误）。重定向
// HOME 与 TMPDIR 到隔离目录使全局层恒为空（与 case-executor.test.ts / core
// command-ops.test.ts 同口径）。
const isolatedHome = mkdtempSync(join(tmpdir(), 'workloom-dsh-plugin-home-'))
process.env.HOME = isolatedHome
process.env.TMPDIR = isolatedHome

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
        guard: () => () => {},
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

test('激活过程注册 executor 派发终态回填通道（subagent/end）', () => {
  const { ctx, listeners } = makeMockCtx()
  apply(ctx)
  const events = listeners.map((entry) => entry.event)
  assert.ok(
    events.includes('subagent/end'),
    'apply must register the dispatch settlement channel (subagent/end)',
  )
})