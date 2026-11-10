/**
 * commands 模块单测：slash 命令的宿主投影——失败统一转述给模型
 * （success 回执 + followup 注入含命令名与原始错误），init 成功同样注入。
 * 测试依赖 dist（test 脚本先 build 再跑 node --test）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { COMMAND_FAILURE_ACK, COMMAND_NAMES } from '@workloom-ai/core'
import { registerCommands } from '../src/tooling/commands.ts'

// 测试隔离：core 三层配置的全局层读 $HOME/.workloom/config（调用链无 homeDir
// 注入缝）；本机真实全局配置会泄漏进单测（历史遗留字段即抛解析错误）。重定向
// HOME 与 TMPDIR 到隔离目录使全局层恒为空（与 case-executor.test.ts / core
// command-ops.test.ts 同口径）。doctor 用例天然耐受（配置错误按 issue 报告），
// 隔离后输出形态不变。
const isolatedHome = mkdtempSync(join(tmpdir(), 'workloom-dsh-commands-home-'))
process.env.HOME = isolatedHome
process.env.TMPDIR = isolatedHome

/** 捕获 register 注册的命令 handler（name → handler）。 */
function makeCtx() {
  const handlers = new Map()
  const ctx = { commands: { register: (cmd) => handlers.set(cmd.name, cmd.handler) } }
  return { ctx, handlers }
}

/** 构造命令调用（cwd 可控；followup 记录注入消息）。 */
function makeInvocation(cwd) {
  const followups = []
  const invocation = {
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

/** 初始化最小 .workloom（tasks 目录 + 合法 config.json）。 */
function makeWorkloomRoot() {
  const root = makeRoot()
  mkdirSync(join(root, '.workloom', 'tasks'), { recursive: true })
  writeFileSync(join(root, '.workloom', 'config.json'), '{"session_auto_commit": false}')
  return root
}

/** 写一条任务记录（completed + check，供 doctor 检测「未归档」）。 */
function writeCompletedTask(root, name) {
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

test('cwd 为空：内部错误与业务校验同一转述出口', async () => {
  const { ctx, handlers } = makeCtx()
  registerCommands(ctx)
  const { invocation, followups } = makeInvocation('')
  const result = await handlers.get(COMMAND_NAMES.init)(invocation)
  assert.equal(result.kind, 'success')
  assert.equal(result.text, COMMAND_FAILURE_ACK)
  assert.equal(followups.length, 1)
  const text = followupText(followups[0])
  assert.ok(text.includes(COMMAND_NAMES.init), 'relay text must name the command')
  assert.ok(text.includes('cannot determine the working directory'), 'relay text keeps raw error')
})

test('continue/finish 不再注册为命令（改造为同名 skill）', () => {
  const { ctx, handlers } = makeCtx()
  registerCommands(ctx)
  assert.equal(handlers.has('workloom-continue'), false)
  assert.equal(handlers.has('workloom-finish'), false)
  assert.ok(handlers.has(COMMAND_NAMES.init))
  assert.ok(handlers.has(COMMAND_NAMES.doctor))
})

test('init 二次执行：relay already complete（幂等，命令成功）', async () => {
  const { ctx, handlers } = makeCtx()
  registerCommands(ctx)
  const root = makeRoot()
  try {
    const first = makeInvocation(root)
    await handlers.get(COMMAND_NAMES.init)(first.invocation)
    const { invocation, followups } = makeInvocation(root)
    const result = await handlers.get(COMMAND_NAMES.init)(invocation)
    assert.equal(result.kind, 'success')
    assert.ok(result.text.includes('The skeleton is already complete'), 'second init stays idempotent')
    assert.equal(followups.length, 1)
    const text = followupText(followups[0])
    assert.ok(text.includes(COMMAND_NAMES.init), 'relay text must name the command')
    assert.ok(text.includes('already complete'), 'relay text keeps the idempotent result')
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

test('doctor 成功：followup 注入 JSON 报告 + 引导语，返回 success 回执', async () => {
  const { ctx, handlers } = makeCtx()
  registerCommands(ctx)
  const root = makeWorkloomRoot()
  try {
    writeCompletedTask(root, 'done-task')
    const { invocation, followups } = makeInvocation(root)
    const result = await handlers.get(COMMAND_NAMES.doctor)(invocation)
    assert.equal(result.kind, 'success')
    assert.ok(result.text.includes('issue(s) found'), 'success text keeps the issue count')
    assert.equal(followups.length, 1)
    const text = followupText(followups[0])
    assert.ok(text.includes('"summary"'), 'relay text must carry the JSON report summary')
    assert.ok(text.includes('"checks"'), 'relay text must carry the JSON report checks')
    assert.ok(text.includes("user's language"), 'relay text must instruct model to report in user language')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('doctor 无 .workloom：作为 config issue 报告，命令成功', async () => {
  const { ctx, handlers } = makeCtx()
  registerCommands(ctx)
  const root = makeRoot()
  try {
    const { invocation, followups } = makeInvocation(root)
    const result = await handlers.get(COMMAND_NAMES.doctor)(invocation)
    assert.equal(result.kind, 'success')
    assert.ok(result.text.includes('issue(s) found'), 'success text keeps the issue count')
    assert.equal(followups.length, 1)
    const text = followupText(followups[0])
    assert.ok(text.includes('no .workloom directory'), 'relay text surfaces the config issue')
    assert.ok(text.includes('"config"'), 'relay text carries the config check JSON')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
