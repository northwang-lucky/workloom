/**
 * executor 模块单测：agentOptions provider 拆分、writeEffortHeader 兜底链、receipt 行。
 * 测试依赖 dist（test 脚本先 build 再跑 node --test）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { registerExecutor } from '../dist/executor.js'

/** 构造最小可工作的 workloom 项目根（含 config.yaml）。 */
function makeProject(configYaml) {
  const root = mkdtempSync(join(tmpdir(), 'workloom-dsh-exe-'))
  const workloomDir = join(root, '.workloom')
  mkdirSync(workloomDir)
  writeFileSync(join(workloomDir, 'config.yaml'), configYaml)
  // 创建最小任务目录使 buildExecutorPrompt 不报错
  const tasksDir = join(workloomDir, 'tasks')
  mkdirSync(tasksDir)
  const taskDir = join(tasksDir, 'test-task')
  mkdirSync(taskDir)
  writeFileSync(
    join(taskDir, 'task.json'),
    JSON.stringify({ status: 'planning', title: 'Test', slug: 'test-task', priority: 'P2' }),
  )
  writeFileSync(join(taskDir, 'prd.md'), '# PRD\n')
  writeFileSync(join(taskDir, 'design.md'), '# Design\n')
  writeFileSync(join(taskDir, 'implement.md'), '# Implement\n')
  return root
}

/** 构造模拟 agent（parent）。 */
function makeAgent(root, overrides = {}) {
  return {
    id: 'parent-1',
    options: { provider: 'parent-provider', model: 'parent-model', ...overrides.options },
    session: {
      header: { cwd: root },
      events: [],
      requestHeader() {
        return overrides.requestHeader
      },
      append: overrides.append ?? (() => {}),
    },
    whenIdle: overrides.whenIdle ?? (() => Promise.resolve()),
    ...overrides.rest,
  }
}

/** 构造模拟 ctx（捕获注册的工具与派发参数）。 */
function makeCtx(overrides = {}) {
  const registered = []
  const startCalls = []
  const agents = new Map()

  const tools = {
    register(def) {
      registered.push(def)
      return () => {}
    },
  }

  const subagents = {
    async startContinuable(spec) {
      startCalls.push(spec)
      const childId = `child-${startCalls.length}`
      // 子代理事件数组：whenIdle 前只有初始事件（boundary 以此为基准）
      const events = overrides.childEvents ? [...overrides.childEvents] : []
      agents.set(childId, {
        id: childId,
        options: {},
        session: {
          header: { cwd: spec.request.parent.session.header.cwd },
          events,
          requestHeader() {
            return undefined
          },
          append: overrides.childAppend ?? (() => {}),
        },
        // whenIdle 模拟子代理运行完成：追加 assistant 文本输出事件
        whenIdle: overrides.childWhenIdle ?? (() => {
          events.push({
            type: 'assistant/message',
            data: { message: { content: [{ type: 'text', text: 'Mock executor output.' }] } },
          })
          return Promise.resolve()
        }),
      })
      return { childId }
    },
    async drainContinuableChildren() {},
  }

  const ctx = { tools, subagents, agents: { get: (id) => agents.get(id) } }
  return { ctx, registered, startCalls }
}

/** 注册 executor 并返回 { execute, registered, startCalls }。 */
function setupExecutor(overrides = {}) {
  const { ctx, registered, startCalls } = makeCtx(overrides)
  registerExecutor(ctx)
  const def = registered[0]
  assert.ok(def, 'executor tool must be registered')
  return { execute: def.execute.bind(def), registered, startCalls }
}

test('agentOptions 携带 provider+model（带前缀时）', async () => {
  const root = makeProject(`
subagents:
  implement:
    model: deepseek-official/deepseek-v4-flash
`)
  try {
    const { execute, startCalls } = setupExecutor()
    const parent = makeAgent(root)
    await execute(
      { kind: 'implement', prompt: 'test', taskPath: 'tasks/test-task' },
      { agent: parent, signal: new AbortController().signal },
    )
    assert.equal(startCalls.length, 1)
    const opts = startCalls[0].request.agentOptions
    assert.equal(opts.provider, 'deepseek-official')
    assert.equal(opts.model, 'deepseek-v4-flash')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('agentOptions 仅 model（裸 id，无 provider）', async () => {
  const root = makeProject(`
subagents:
  research:
    model: deepseek-v4-flash
`)
  try {
    const { execute, startCalls } = setupExecutor()
    const parent = makeAgent(root)
    await execute(
      { kind: 'research', prompt: 'test', taskPath: 'tasks/test-task' },
      { agent: parent, signal: new AbortController().signal },
    )
    assert.equal(startCalls.length, 1)
    const opts = startCalls[0].request.agentOptions
    assert.equal(opts.provider, undefined)
    assert.equal(opts.model, 'deepseek-v4-flash')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('agentOptions 为 undefined（无 model 配置）', async () => {
  const root = makeProject('')
  try {
    const { execute, startCalls } = setupExecutor()
    const parent = makeAgent(root)
    await execute(
      { kind: 'check', prompt: 'test', taskPath: 'tasks/test-task' },
      { agent: parent, signal: new AbortController().signal },
    )
    assert.equal(startCalls.length, 1)
    assert.equal(startCalls[0].request.agentOptions, undefined)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('writeEffortHeader 兜底链：既有 header 优先', async () => {
  const root = makeProject(`
subagents:
  implement:
    model: cross-provider/model-a
    effort: high
`)
  try {
    const appends = []
    const { execute } = setupExecutor({
      childAppend: (type, data) => appends.push({ type, data }),
    })
    // 子代理已有 header（provider/model 已固定）
    const parent = makeAgent(root)
    await execute(
      { kind: 'implement', prompt: 'test', taskPath: 'tasks/test-task' },
      { agent: parent, signal: new AbortController().signal },
    )
    assert.equal(appends.length, 1)
    const cfg = appends[0].data.header.config
    // 子代理无现有 header，应使用派发生效值（拆分后的 provider/model）
    assert.equal(cfg.provider, 'cross-provider')
    assert.equal(cfg.model, 'model-a')
    assert.equal(cfg.reasoningEffort, 'high')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('writeEffortHeader 兜底链：其次派发生效值，最后父 options', async () => {
  const root = makeProject(`
subagents:
  implement:
    effort: medium
`)
  try {
    const appends = []
    const { execute } = setupExecutor({
      childAppend: (type, data) => appends.push({ type, data }),
    })
    const parent = makeAgent(root, {
      options: { provider: 'parent-p', model: 'parent-m' },
    })
    await execute(
      { kind: 'implement', prompt: 'test', taskPath: 'tasks/test-task' },
      { agent: parent, signal: new AbortController().signal },
    )
    assert.equal(appends.length, 1)
    const cfg = appends[0].data.header.config
    // 无派发生效 model，应回退到父 options
    assert.equal(cfg.provider, 'parent-p')
    assert.equal(cfg.model, 'parent-m')
    assert.equal(cfg.reasoningEffort, 'medium')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('writeEffortHeader 跨 provider：不写父 provider/model', async () => {
  const root = makeProject(`
subagents:
  implement:
    model: other-provider/other-model
    effort: max
`)
  try {
    const appends = []
    const { execute } = setupExecutor({
      childAppend: (type, data) => appends.push({ type, data }),
    })
    // 父是另一个 provider
    const parent = makeAgent(root, {
      options: { provider: 'parent-p', model: 'parent-m' },
    })
    await execute(
      { kind: 'implement', prompt: 'test', taskPath: 'tasks/test-task' },
      { agent: parent, signal: new AbortController().signal },
    )
    assert.equal(appends.length, 1)
    const cfg = appends[0].data.header.config
    // 应使用派发配置的 provider/model，而非父的
    assert.equal(cfg.provider, 'other-provider')
    assert.equal(cfg.model, 'other-model')
    assert.equal(cfg.reasoningEffort, 'max')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('receipt 行出现在返回文本尾部（来源标注正确）', async () => {
  const root = makeProject(`
subagents:
  implement:
    model: deepseek-official/deepseek-v4-flash
    effort: high
`)
  try {
    const { execute } = setupExecutor()
    const parent = makeAgent(root)
    const result = await execute(
      { kind: 'implement', prompt: 'test', taskPath: 'tasks/test-task' },
      { agent: parent, signal: new AbortController().signal },
    )
    const text = result.output[0].text
    assert.ok(text.includes('[workloom executor]'))
    assert.ok(text.includes('deepseek-official/deepseek-v4-flash'))
    assert.ok(text.includes('(config)'))
    assert.ok(text.includes('high'))
    // receipt 应在子代理输出之后（空行分隔）
    const lines = text.split('\n')
    const receiptIdx = lines.findIndex((l) => l.includes('[workloom executor]'))
    assert.ok(receiptIdx > 0, 'receipt must appear after some content')
    assert.equal(lines[receiptIdx - 1], '', 'receipt preceded by blank line')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('receipt 行：param 来源标注正确', async () => {
  const root = makeProject(`
subagents:
  implement:
    model: deepseek-official/deepseek-v4-flash
    effort: high
`)
  try {
    const { execute } = setupExecutor()
    const parent = makeAgent(root)
    const result = await execute(
      { kind: 'implement', prompt: 'test', model: 'param-provider/param-model', effort: 'max', taskPath: 'tasks/test-task' },
      { agent: parent, signal: new AbortController().signal },
    )
    const text = result.output[0].text
    assert.ok(text.includes('param-provider/param-model'))
    assert.ok(text.includes('(param)'))
    assert.ok(text.includes('max'))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('receipt 行：空输出时仍追加（EMPTY_OUTPUT_TEXT 之后）', async () => {
  const root = makeProject(`
subagents:
  check:
    model: deepseek-official/deepseek-v4-flash
`)
  try {
    // childWhenIdle 不追加任何事件 → 子代理无文本输出
    const { execute } = setupExecutor({ childWhenIdle: () => Promise.resolve() })
    const parent = makeAgent(root)
    const result = await execute(
      { kind: 'check', prompt: 'test', taskPath: 'tasks/test-task' },
      { agent: parent, signal: new AbortController().signal },
    )
    const text = result.output[0].text
    assert.ok(text.includes('produced no text output'))
    assert.ok(text.includes('[workloom executor]'))
    assert.ok(text.includes('deepseek-official/deepseek-v4-flash'))
    assert.ok(text.includes('(config)'))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('receipt 行：无配置时显示 default 来源', async () => {
  const root = makeProject('')
  try {
    const { execute } = setupExecutor()
    const parent = makeAgent(root)
    const result = await execute(
      { kind: 'check', prompt: 'test', taskPath: 'tasks/test-task' },
      { agent: parent, signal: new AbortController().signal },
    )
    const text = result.output[0].text
    assert.ok(text.includes('<parent session>'))
    assert.ok(text.includes('(default)'))
    assert.ok(text.includes('<unset>'))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
