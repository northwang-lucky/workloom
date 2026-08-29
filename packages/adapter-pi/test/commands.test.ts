/**
 * commands 模块单测：slash 命令的宿主投影——失败统一由 sendUserMessage
 * 转述给模型（notify 降级为 info 回执），init 成功同样注入模型回合。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
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

/** 初始化最小 .workloom（tasks 目录 + 合法 config.yaml）。 */
function makeWorkloomRoot() {
  const root = makeRoot()
  mkdirSync(join(root, '.workloom', 'tasks'), { recursive: true })
  writeFileSync(join(root, '.workloom', 'config.yaml'), 'session_auto_commit: false\n')
  return root
}

/** 写一条 completed + check 任务记录（供 doctor 检测「未归档」）。 */
function writeCompletedTask(root: string, name: string) {
  const dir = join(root, '.workloom', 'tasks', name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    join(dir, 'task.json'),
    `${JSON.stringify(
      {
        id: 'id-' + name,
        name,
        title: 'Title ' + name,
        status: 'completed',
        priority: 'P2',
        creator: 'tester',
        assignee: '',
        package: null,
        branch: '',
        base_branch: '',
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        parent: null,
        children: [],
        subtasks: [],
        scope: '',
        commit: '',
        pr_url: '',
        worktree_path: '',
        relatedFiles: [],
        notes: '',
        meta: {},
        check: { passedAt: new Date().toISOString(), summary: 'ok' },
        overrides: [],
        dispatches: [],
        hooks: { after_create: [], after_start: [], after_finish: [], after_archive: [] },
      },
      null,
      2,
    )}\n`,
  )
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

test('doctor 成功：sendUserMessage 注入 JSON 报告 + 引导语，notify info 回执', async () => {
  const { pi, handlers, sent } = makePi()
  registerCommands(pi)
  const root = makeWorkloomRoot()
  try {
    writeCompletedTask(root, 'done-task')
    const { ctx, notices } = makeCtx(root)
    const handler = handlers.get(COMMAND_NAMES.doctor)
    assert.ok(handler)
    await handler('', ctx)
    assert.equal(sent.length, 1)
    const text = sent[0]
    assert.ok(text !== undefined)
    assert.ok(text.includes('"summary"'), 'relay text must carry the JSON report summary')
    assert.ok(text.includes('"checks"'), 'relay text must carry the JSON report checks')
    assert.ok(text.includes("user's language"), 'relay text must instruct the model language')
    assert.ok(
      notices.some((n) => n.level === 'info' && n.text.includes('issue(s) found')),
      'success notify keeps the issue count',
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('doctor --fix：把可修 completed 任务归档并注入 fixed[]', async () => {
  const { pi, handlers, sent } = makePi()
  registerCommands(pi)
  const root = makeWorkloomRoot()
  try {
    writeCompletedTask(root, 'done-task')
    const { ctx } = makeCtx(root)
    const handler = handlers.get(COMMAND_NAMES.doctor)
    assert.ok(handler)
    await handler('--fix', ctx)
    assert.equal(sent.length, 1)
    const text = sent[0]
    assert.ok(text !== undefined)
    assert.ok(text.includes('"fixed"'), 'relay text must include fixed[] after --fix')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('doctor 无 .workloom：作为 config issue 报告，sendUserMessage 注入，notify info 回执', async () => {
  const { pi, handlers, sent } = makePi()
  registerCommands(pi)
  const root = makeRoot()
  try {
    const { ctx, notices } = makeCtx(root)
    const handler = handlers.get(COMMAND_NAMES.doctor)
    assert.ok(handler)
    await handler('', ctx)
    assert.equal(sent.length, 1)
    const text = sent[0]
    assert.ok(text !== undefined)
    assert.ok(text.includes('no .workloom directory'), 'relay text surfaces the config issue')
    assert.ok(text.includes('"config"'), 'relay text carries the config check JSON')
    assert.ok(
      notices.some((n) => n.level === 'info' && n.text.includes('issue(s) found')),
      'success notify keeps the issue count',
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
