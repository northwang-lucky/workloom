/**
 * commands 模块单测：slash 命令的宿主投影——失败统一转述给模型
 * （success 回执 + followup 注入含命令名与原始错误），init 成功同样注入。
 * 测试依赖 dist（test 脚本先 build 再跑 node --test）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { COMMAND_FAILURE_ACK, COMMAND_NAMES } from '@workloom-ai/core'
import { registerCommands } from '../dist/commands.js'

/** 捕获 register 注册的命令 handler（name → handler）。 */
function makeCtx() {
  const handlers = new Map()
  const ctx = { commands: { register: (cmd) => handlers.set(cmd.name, cmd.handler) } }
  return { ctx, handlers }
}

/** 构造命令调用（cwd/rawInput 可控；followup 记录注入消息）。 */
function makeInvocation(cwd, rawInput = '') {
  const followups = []
  const invocation = {
    rawInput,
    agent: {
      id: 'agent-1',
      session: { header: { cwd } },
      followup: (message) => followups.push(message),
    },
  }
  return { invocation, followups }
}

/** 提取 followup 注入消息的首个文本块。 */
function followupText(message) {
  return message.content[0].text
}

/** 创建临时项目根（无 .workloom）。 */
function makeRoot() {
  return mkdtempSync(join(tmpdir(), 'workloom-dsh-cmd-'))
}

test('continue 失败：不再返回 error kind，followup 注入错误转述触发模型回合', async () => {
  const { ctx, handlers } = makeCtx()
  registerCommands(ctx)
  const root = makeRoot()
  try {
    const { invocation, followups } = makeInvocation(root)
    const result = await handlers.get(COMMAND_NAMES.continue)(invocation)
    assert.equal(result.kind, 'success')
    assert.equal(result.text, COMMAND_FAILURE_ACK)
    assert.equal(followups.length, 1)
    const text = followupText(followups[0])
    assert.ok(text.includes(COMMAND_NAMES.continue), 'relay text must name the command')
    assert.ok(text.includes('no .workloom directory found'), 'relay text must keep the raw error')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('cwd 为空：内部错误与业务校验同一转述出口', async () => {
  const { ctx, handlers } = makeCtx()
  registerCommands(ctx)
  const { invocation, followups } = makeInvocation('')
  const result = await handlers.get(COMMAND_NAMES.finish)(invocation)
  assert.equal(result.kind, 'success')
  assert.equal(result.text, COMMAND_FAILURE_ACK)
  assert.equal(followups.length, 1)
  const text = followupText(followups[0])
  assert.ok(text.includes(COMMAND_NAMES.finish), 'relay text must name the command')
  assert.ok(text.includes('cannot determine the working directory'), 'relay text keeps raw error')
})

test('init 失败：followup 注入错误转述且返回 success 回执', async () => {
  const { ctx, handlers } = makeCtx()
  registerCommands(ctx)
  const root = makeRoot()
  try {
    const { invocation, followups } = makeInvocation(root, '--purge')
    const result = await handlers.get(COMMAND_NAMES.init)(invocation)
    assert.equal(result.kind, 'success')
    assert.equal(result.text, COMMAND_FAILURE_ACK)
    assert.equal(followups.length, 1)
    const text = followupText(followups[0])
    assert.ok(text.includes(COMMAND_NAMES.init), 'relay text must name the command')
    assert.ok(text.includes('nothing to purge'), 'relay text must keep the raw error')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('init 成功：followup 注入成功转述（含 init 结果原文），返回 success', async () => {
  const { ctx, handlers } = makeCtx()
  registerCommands(ctx)
  const root = makeRoot()
  try {
    const { invocation, followups } = makeInvocation(root)
    const result = await handlers.get(COMMAND_NAMES.init)(invocation)
    assert.equal(result.kind, 'success')
    assert.ok(result.text.includes('Workloom initialized'), 'success text keeps init result')
    assert.equal(followups.length, 1)
    const text = followupText(followups[0])
    assert.ok(text.includes(COMMAND_NAMES.init), 'relay text must name the command')
    assert.ok(text.includes('Workloom initialized'), 'relay text must keep the init result')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
