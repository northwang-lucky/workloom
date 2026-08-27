/**
 * commands 模块单测：slash 命令的宿主投影——失败统一由 sendUserMessage
 * 转述给模型（notify 降级为 info 回执），init 成功同样注入模型回合。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { ExtensionAPI, ExtensionCommandContext } from '@earendil-works/pi-coding-agent'
import { COMMAND_FAILURE_ACK, COMMAND_NAMES } from '@workloom-ai/core'

import { registerCommands } from '../src/commands.ts'

type CommandHandler = (args: string, ctx: ExtensionCommandContext) => Promise<void>

/** 捕获 registerCommand 注册的 handler 与 sendUserMessage 注入文本。 */
function makePi() {
  const handlers = new Map<string, CommandHandler>()
  const sent: string[] = []
  const pi = {
    registerCommand: (name: string, def: { handler: CommandHandler }) =>
      handlers.set(name, def.handler),
    sendUserMessage: (text: string) => sent.push(text),
  } as unknown as ExtensionAPI
  return { pi, handlers, sent }
}

/** 构造命令上下文（cwd 可控；notify 记录文案与级别）。 */
function makeCtx(cwd: string) {
  const notices: { text: string; level: string }[] = []
  const ctx = {
    cwd,
    ui: { notify: (text: string, level: string) => notices.push({ text, level }) },
    sessionManager: { getSessionId: () => 'sess-1' },
  } as unknown as ExtensionCommandContext
  return { ctx, notices }
}

/** 创建临时项目根（无 .workloom）。 */
function makeRoot() {
  return mkdtempSync(join(tmpdir(), 'workloom-pi-cmd-'))
}

test('continue 失败：不再 notify error，sendUserMessage 注入错误转述触发回合', async () => {
  const { pi, handlers, sent } = makePi()
  registerCommands(pi)
  const root = makeRoot()
  try {
    const { ctx, notices } = makeCtx(root)
    const handler = handlers.get(COMMAND_NAMES.continue)
    assert.ok(handler)
    await handler('', ctx)
    assert.equal(sent.length, 1)
    const text = sent[0]
    assert.ok(text !== undefined)
    assert.ok(text.includes(COMMAND_NAMES.continue), 'relay text must name the command')
    assert.ok(text.includes('no .workloom directory found'), 'relay text keeps the raw error')
    assert.deepEqual(notices, [{ text: COMMAND_FAILURE_ACK, level: 'info' }])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('init 失败：sendUserMessage 注入错误转述，notify 仅 info 回执', async () => {
  const { pi, handlers, sent } = makePi()
  registerCommands(pi)
  const root = makeRoot()
  try {
    const { ctx, notices } = makeCtx(root)
    const handler = handlers.get(COMMAND_NAMES.init)
    assert.ok(handler)
    await handler('--purge', ctx)
    assert.equal(sent.length, 1)
    const text = sent[0]
    assert.ok(text !== undefined)
    assert.ok(text.includes(COMMAND_NAMES.init), 'relay text must name the command')
    assert.ok(text.includes('nothing to purge'), 'relay text must keep the raw error')
    assert.deepEqual(notices, [{ text: COMMAND_FAILURE_ACK, level: 'info' }])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('init 成功：sendUserMessage 注入成功转述（含 init 结果原文）', async () => {
  const { pi, handlers, sent } = makePi()
  registerCommands(pi)
  const root = makeRoot()
  try {
    const { ctx, notices } = makeCtx(root)
    const handler = handlers.get(COMMAND_NAMES.init)
    assert.ok(handler)
    await handler('', ctx)
    assert.equal(sent.length, 1)
    const text = sent[0]
    assert.ok(text !== undefined)
    assert.ok(text.includes(COMMAND_NAMES.init), 'relay text must name the command')
    assert.ok(text.includes('Workloom initialized'), 'relay text must keep the init result')
    assert.ok(
      notices.some((n) => n.level === 'info' && n.text.includes('Workloom initialized')),
      'success notify keeps the init result text',
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
