/**
 * executor 模块单测：continuable 派发（startContinuable）、续用（followup 同一会话）、
 * turn/end 事件面异常终止、drain 释放与 receipt 行。
 * 测试依赖 dist（test 脚本先 build 再跑 node --test）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { PARAM_DESCRIPTIONS, TOOL_NAMES } from '@workloom-ai/core'
import { registerExecutor } from '../dist/executor.js'
import {
  assertToolFilterCapability,
  availableToolNames,
  buildDenyList,
  SPAWN_PROVIDER,
  toCapabilityError,
} from '../dist/executor-dispatch.js'

/** DSH 原生委派类工具候选名（与实现的 deny 清单候选集一致；测试自给自足）。 */
const NATIVE_DELEGATION_CANDIDATES = [
  'subagent',
  'subagent_with_model',
  'subagent_fork',
  'list_agents',
  'send_message',
  'interrupt_agent',
  'ralph',
  'workflow',
  'ralph-loop',
]

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

/** 构造模拟 agent（parent，仅 id 与 cwd 被 executor 读取；requestHeader 可选注入模拟主模型快照）。 */
function makeAgent(root, requestHeader) {
  return {
    id: 'parent-1',
    session: {
      header: { cwd: root },
      ...(requestHeader !== undefined ? { requestHeader } : {}),
    },
  }
}

/** 构造会话事件（模拟 DSH SessionEvent 最小形状：type/seq/time/data）。 */
function makeEvent(type, data) {
  return { type, seq: 0, time: Date.now(), data }
}

/** turn/start 事件。 */
function makeTurnStart(turn = 1) {
  return makeEvent('turn/start', { turn })
}

/** turn/end 事件（reason.kind 可扩展 error/aborted 等，extra 携带 error 结构化失败）。 */
function makeTurnEnd(kind, turn = 1, extra = {}) {
  return makeEvent('turn/end', { turn, reason: { kind, ...extra } })
}

/** assistant/message 事件（携带子代理文本输出）。 */
function makeAssistantMessage(text) {
  return makeEvent('assistant/message', { message: { content: [{ type: 'text', text }] } })
}

/**
 * 模拟一轮 turn 结算：向 child 事件数组追加 turn/start + assistant/message + turn/end。
 * turnEndKind 非 completed 时只追加终止事件（异常终止无正常输出）。
 */
function pushTurnEvents(child, overrides) {
  const events = child.session.events
  events.push(makeTurnStart(1))
  if (overrides.turnEndKind !== undefined && overrides.turnEndKind !== 'completed') {
    const extra =
      overrides.turnEndKind === 'error' && overrides.turnEndError !== undefined
        ? { error: overrides.turnEndError }
        : {}
    events.push(makeTurnEnd(overrides.turnEndKind, 1, extra))
    return
  }
  events.push(makeAssistantMessage(overrides.outputText ?? 'Mock executor output.'))
  events.push(makeTurnEnd('completed', 1))
}

/**
 * 构造 child 的 whenIdle：默认立即结算（pushTurnEvents 落盘事件）；用例可
 * 经 overrides.childWhenIdle 覆盖结算行为。
 */
function makeChildWhenIdle(child, overrides) {
  if (overrides.childWhenIdle !== undefined) {
    return () => overrides.childWhenIdle(child)
  }
  return () => {
    pushTurnEvents(child, overrides)
    return Promise.resolve()
  }
}

/** 构造模拟 ctx（捕获注册的工具、continuable 派发/续用/释放调用与 child agent 表）。 */
function makeCtx(overrides = {}) {
  const registered = []
  const startCalls = []
  const followupCalls = []
  const drainCalls = []
  const childAgents = new Map()

  /** 建/取 child agent（续用轮 followup 时复用同一 id 的会话，仅重绑 whenIdle）。 */
  function ensureChild(childId, cwd) {
    let child = childAgents.get(childId)
    if (child === undefined) {
      const events = overrides.childSeedEvents ? [...overrides.childSeedEvents] : []
      child = {
        id: childId,
        session: { header: { cwd }, events },
      }
      childAgents.set(childId, child)
    }
    child.whenIdle = makeChildWhenIdle(child, overrides)
    return child
  }

  const tools = {
    register(def) {
      registered.push(def)
      return () => {}
    },
    // 运行时可见工具名：默认 9 个 workloom 工具 + 全部委派候选 + 常规工具
    // （模拟真实宿主注册面）；用例可经 overrides.visibleTools 自定义。
    schemas() {
      const names =
        overrides.visibleTools === undefined
          ? [...Object.values(TOOL_NAMES), ...NATIVE_DELEGATION_CANDIDATES, 'write', 'edit']
          : overrides.visibleTools
      return names.map((name) => ({ name }))
    },
  }

  const subagents = {
    // spawn provider 查询：默认全 capability（toolFilter: true，现状用例零影响）；
    // 用例可经 overrides.subagentProvider / overrides.getProvider 覆盖。
    getProvider(name) {
      if (overrides.getProvider !== undefined) return overrides.getProvider(name)
      if (overrides.subagentProvider !== undefined) return overrides.subagentProvider
      return {
        name,
        capabilities: {
          outputSchema: true,
          depthLimit: true,
          toolFilter: true,
          persona: true,
        },
        inheritsParentContext: true,
      }
    },
    // continuable 派发：resolve 即返回 durable childId，child 会话注册进 agents 表。
    async startContinuable(spec) {
      if (overrides.startReject !== undefined) throw overrides.startReject
      startCalls.push(spec)
      const childId = `child-${startCalls.length}`
      ensureChild(childId, spec.request.parent.session.header.cwd)
      return { childId }
    },
    // 续用：向同一 childId 会话投递下一指令（mock 断言同一 session id 收消息；
    // 用例可经 overrides.followupReject 注入上游 reject，如 fork 的 parent 严格校验拒绝）。
    async followup(parent, childId, content, options) {
      followupCalls.push({ parent, childId, content, options })
      if (overrides.followupReject !== undefined) throw overrides.followupReject
      ensureChild(childId, parent.session.header.cwd)
      return `msg-${followupCalls.length}`
    },
    // 释放 resident Activation（会话保留可 cold-resume；失败由用例注入）。
    async drainContinuableChildren(parent, childIds) {
      drainCalls.push({ parent, childIds })
      if (overrides.drain !== undefined) await overrides.drain()
    },
  }

  const ctx = { tools, subagents, agents: { get: (id) => childAgents.get(id) } }
  return { ctx, registered, startCalls, followupCalls, drainCalls, childAgents }
}

/** 注册 executor 并返回 { execute, 各调用记录 }。 */
function setupExecutor(overrides = {}) {
  const made = makeCtx(overrides)
  registerExecutor(made.ctx)
  const def = made.registered[0]
  assert.ok(def, 'executor tool must be registered')
  return {
    execute: def.execute.bind(def),
    registered: made.registered,
    startCalls: made.startCalls,
    followupCalls: made.followupCalls,
    drainCalls: made.drainCalls,
    childAgents: made.childAgents,
  }
}

/** 常用执行参数（taskPath/title 固定，减少样板）。 */
function execArgs(extra = {}) {
  return { kind: 'implement', prompt: 'test', taskPath: 'tasks/test-task', title: 'executor test', ...extra }
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
    await execute(execArgs(), { agent: parent, signal: new AbortController().signal })
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
    await execute(execArgs({ kind: 'research' }), { agent: parent, signal: new AbortController().signal })
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
    await execute(execArgs({ kind: 'check' }), { agent: parent, signal: new AbortController().signal })
    assert.equal(startCalls.length, 1)
    assert.equal(startCalls[0].request.agentOptions, undefined)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('s1: 派发走 startContinuable（非 one-shot start），返回 durable childId 且 drain 释放', async () => {
  const root = makeProject(`
subagents:
  implement:
    model: deepseek-official/deepseek-v4-flash
`)
  try {
    const { execute, startCalls, drainCalls } = setupExecutor()
    const parent = makeAgent(root)
    const signal = new AbortController().signal
    const result = await execute(execArgs({ title: 'continuable dispatch test' }), {
      agent: parent,
      signal,
    })
    // seam：调用的是 startContinuable（mock 未实现 one-shot start，误调用会 TypeError）
    assert.equal(startCalls.length, 1)
    const spec = startCalls[0]
    assert.equal(spec.provider, 'spawn')
    assert.equal(spec.label, '[Implement] continuable dispatch test')
    assert.equal(spec.request.maxDepth, 1)
    assert.equal(spec.signal, signal)
    assert.equal(spec.request.parent, parent)
    assert.equal(spec.request.prompt.length, 1)
    assert.equal(spec.request.prompt[0].type, 'text')
    assert.ok(spec.request.prompt[0].text.includes('Active task:'), 'prompt must inline the task')
    assert.deepEqual(spec.request.agentOptions, {
      provider: 'deepseek-official',
      model: 'deepseek-v4-flash',
    })
    // durable childId：runId 沿用会话 id，可在后续续用中复用
    assert.equal(result.runId, 'child-1')
    assert.ok(result.output[0].text.includes('Mock executor output.'))
    // 释放走 drainContinuableChildren（会话持久化保留，可 cold-resume 再续用）
    assert.equal(drainCalls.length, 1)
    assert.equal(drainCalls[0].parent, parent)
    assert.deepEqual(drainCalls[0].childIds, ['child-1'])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('s2: 续用走 followup 进入同一会话（session id 不变；边界只取本轮事件）', async () => {
  const root = makeProject('')
  try {
    const { execute, followupCalls, drainCalls } = setupExecutor()
    const parent = makeAgent(root)
    // 第一轮：新派发
    const first = await execute(execArgs({ prompt: 'round 1', title: 'reuse test' }), {
      agent: parent,
      signal: new AbortController().signal,
    })
    const childId = first.runId
    // 第二轮：续用（'latest' → dispatches 中同 kind 最近一次的 childId）
    const second = await execute(
      execArgs({ prompt: 'round 2', title: 'reuse test', continue_executor: 'latest' }),
      { agent: parent, signal: new AbortController().signal },
    )
    assert.equal(followupCalls.length, 1)
    // mock followup 断言同一 session id 收到下一指令（消息 FIFO 由 DSH inbox 保证）
    assert.equal(followupCalls[0].childId, childId, 'followup must target the same session id')
    assert.equal(followupCalls[0].parent, parent)
    assert.equal(followupCalls[0].content.length, 1)
    assert.equal(followupCalls[0].content[0].type, 'text')
    assert.ok(followupCalls[0].content[0].text.includes('round 2'))
    // 续用轮结果：同一 runId（会话未变）+ 输出 + drain
    assert.equal(second.runId, childId, 'reused run must keep the same session id')
    assert.ok(second.output[0].text.includes('Mock executor output.'))
    assert.equal(drainCalls.length, 2, 'each turn drains once')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('输出边界：seed 事件不计入（boundary 排除父历史种子）', async () => {
  const root = makeProject('')
  try {
    const seed = [makeEvent('user/message', { message: { content: [] }, source: { kind: 'user' } }), makeAssistantMessage('seed text')]
    const { execute } = setupExecutor({ childSeedEvents: seed })
    const parent = makeAgent(root)
    const result = await execute(execArgs(), { agent: parent, signal: new AbortController().signal })
    assert.ok(result.output[0].text.includes('Mock executor output.'))
    assert.ok(!result.output[0].text.includes('seed text'), 'seed events must not leak into output')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('派发成功：task.json dispatches 记录 { kind, at, title, childId }', async () => {
  const root = makeProject('')
  try {
    const { execute } = setupExecutor()
    const parent = makeAgent(root)
    await execute(
      { kind: 'frontend', prompt: 'test', taskPath: 'tasks/test-task', title: 'ui impl' },
      { agent: parent, signal: new AbortController().signal },
    )
    const task = JSON.parse(
      readFileSync(join(root, '.workloom/tasks/test-task/task.json'), 'utf8'),
    )
    assert.equal(task.dispatches.length, 1)
    assert.equal(task.dispatches[0].kind, 'frontend')
    assert.equal(task.dispatches[0].title, 'ui impl')
    assert.equal(task.dispatches[0].childId, 'child-1')
    assert.ok(!Number.isNaN(Date.parse(task.dispatches[0].at)))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('s5: turn/end 非 completed（error 带结构化 message）：抛工具错误且不附输出', async () => {
  const root = makeProject('')
  try {
    const { execute, drainCalls } = setupExecutor({
      turnEndKind: 'error',
      turnEndError: { message: 'the model declined the task', code: 'UNKNOWN' },
    })
    const parent = makeAgent(root)
    await assert.rejects(
      execute(execArgs(), { agent: parent, signal: new AbortController().signal }),
      /the model declined the task/,
    )
    // 异常终止同样 drain 释放（finally 语义）
    assert.equal(drainCalls.length, 1)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('s5b: turn/end 非 completed（aborted 无 message）：用终止原因兜底文案', async () => {
  const root = makeProject('')
  try {
    const { execute } = setupExecutor({ turnEndKind: 'aborted', turnEndError: undefined })
    const parent = makeAgent(root)
    await assert.rejects(
      execute(execArgs(), { agent: parent, signal: new AbortController().signal }),
      /the executor subagent ended with aborted/,
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('s5c: 无 turn/end 事件：视为异常终止（无法确认正常完成）', async () => {
  const root = makeProject('')
  try {
    const { execute } = setupExecutor({
      childWhenIdle: (child) => {
        child.session.events.push(makeAssistantMessage('partial output'))
        return Promise.resolve()
      },
    })
    const parent = makeAgent(root)
    await assert.rejects(
      execute(execArgs(), { agent: parent, signal: new AbortController().signal }),
      /ended without a completed turn/,
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('drain 失败仅 WARNING：结果仍正常返回', async (t) => {
  const root = makeProject('')
  try {
    const warn = t.mock.method(console, 'warn', () => {})
    const { execute, drainCalls } = setupExecutor({
      drain: () => {
        throw new Error('drain boom')
      },
    })
    const parent = makeAgent(root)
    const result = await execute(execArgs(), { agent: parent, signal: new AbortController().signal })
    assert.equal(drainCalls.length, 1)
    assert.equal(warn.mock.callCount(), 1)
    assert.match(String(warn.mock.calls[0].arguments[0]), /failed to release continuable child/)
    assert.ok(result.output[0].text.includes('Mock executor output.'))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('receipt 行出现在返回文本尾部（来源标注正确，无 effort 段）', async () => {
  const root = makeProject(`
subagents:
  implement:
    model: deepseek-official/deepseek-v4-flash
`)
  try {
    const { execute } = setupExecutor()
    const parent = makeAgent(root)
    const result = await execute(execArgs({ title: 'receipt config test' }), {
      agent: parent,
      signal: new AbortController().signal,
    })
    const text = result.output[0].text
    assert.ok(text.includes('[workloom executor]'))
    assert.ok(text.includes('deepseek-official/deepseek-v4-flash'))
    assert.ok(text.includes('(config: legacy)'))
    assert.ok(!text.includes('effort:'), 'DSH receipt must not render the effort segment')
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
    model: param-provider/param-model
`)
  try {
    const { execute } = setupExecutor()
    const parent = makeAgent(root)
    const result = await execute(
      execArgs({ model: 'param-provider/param-model', title: 'receipt param test' }),
      { agent: parent, signal: new AbortController().signal },
    )
    const text = result.output[0].text
    assert.ok(text.includes('param-provider/param-model'))
    assert.ok(text.includes('(param)'))
    assert.ok(!text.includes('effort:'), 'DSH receipt must not render the effort segment')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('s6: 续用轮 receipt 追加 (reused)，新派发轮不标注', async () => {
  const root = makeProject('')
  try {
    const { execute } = setupExecutor()
    const parent = makeAgent(root)
    const first = await execute(execArgs({ title: 'reuse receipt test' }), {
      agent: parent,
      signal: new AbortController().signal,
    })
    assert.ok(!first.output[0].text.includes('(reused)'), 'fresh dispatch must not mark reuse')
    const second = await execute(
      execArgs({ title: 'reuse receipt test', continue_executor: 'latest' }),
      { agent: parent, signal: new AbortController().signal },
    )
    assert.ok(second.output[0].text.includes('(reused)'), 'reused turn must mark (reused)')
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
    // childWhenIdle 只落盘 turn/end（无 assistant/message）→ 子代理无文本产出，receipt 仍保留
    const { execute } = setupExecutor({
      childWhenIdle: (child) => {
        child.session.events.push(makeTurnEnd('completed', 1))
        return Promise.resolve()
      },
    })
    const parent = makeAgent(root)
    const result = await execute(execArgs({ kind: 'check', title: 'empty output test' }), {
      agent: parent,
      signal: new AbortController().signal,
    })
    const text = result.output[0].text
    assert.ok(text.includes('produced no text output'))
    assert.ok(text.includes('[workloom executor]'))
    assert.ok(text.includes('deepseek-official/deepseek-v4-flash'))
    assert.ok(text.includes('(config: legacy)'))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('receipt 行：无配置时显示 default 来源（无 effort 段）', async () => {
  const root = makeProject('')
  try {
    const { execute } = setupExecutor()
    const parent = makeAgent(root)
    const result = await execute(execArgs({ kind: 'check' }), {
      agent: parent,
      signal: new AbortController().signal,
    })
    const text = result.output[0].text
    assert.ok(text.includes('<parent session>'))
    assert.ok(text.includes('(default)'))
    assert.ok(!text.includes('effort:'), 'no effort config must omit the effort segment')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('主模型 provider/model 为空串：whenMain 按取不到跳过，回退旧 subagents', async () => {
  const root = makeProject(`
subagent_profiles:
  - whenMain: deepseek-official/deepseek-v4-flash
    subagents:
      implement:
        model: profile-provider/profile-model
subagents:
  implement:
    model: legacy-provider/legacy-model
`)
  try {
    const { execute, startCalls } = setupExecutor()
    // requestHeader 快照的 provider/model 均为空串：readMainModel 返回 undefined
    // （空串拼出的 "/" 会在 core 匹配时抛错，按无值处理），whenMain 条目跳过
    // 不 fail loud，生效值回退旧 subagents（receipt 标 legacy）。
    const parent = makeAgent(root, () => ({ config: { provider: '', model: '' } }))
    const result = await execute(execArgs({ title: 'empty main model test' }), {
      agent: parent,
      signal: new AbortController().signal,
    })
    assert.equal(startCalls.length, 1)
    const opts = startCalls[0].request.agentOptions
    assert.equal(opts.provider, 'legacy-provider')
    assert.equal(opts.model, 'legacy-model')
    const text = result.output[0].text
    assert.ok(text.includes('legacy-provider/legacy-model'))
    assert.ok(text.includes('(config: legacy)'))
    assert.ok(!text.includes('profile-provider'), 'whenMain entry must not take effect')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('label 组装：四种 kind 均为 [<KindLabel>] <task title>（title 缺省回退）', async () => {
  const root = makeProject('')
  try {
    const { execute, startCalls } = setupExecutor()
    const parent = makeAgent(root)
    const cases = [
      ['research', 'Research'],
      ['implement', 'Implement'],
      ['check', 'Check'],
      ['frontend', 'Frontend'],
    ]
    for (const [kind, kindLabel] of cases) {
      // title 缺省（undefined）：回退 task title「Test」
      await execute(execArgs({ kind, title: undefined }), {
        agent: parent,
        signal: new AbortController().signal,
      })
      assert.equal(startCalls[startCalls.length - 1].label, `[${kindLabel}] Test`)
    }
    assert.equal(startCalls.length, 4)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('label 回退：task title 空白时回退 workloom-<kind>（连字符）', async () => {
  const root = makeProject('')
  try {
    writeFileSync(
      join(root, '.workloom/tasks/test-task/task.json'),
      JSON.stringify({ status: 'planning', title: '   ', slug: 'test-task', priority: 'P2' }),
    )
    const { execute, startCalls } = setupExecutor()
    const parent = makeAgent(root)
    await execute(execArgs({ title: undefined }), {
      agent: parent,
      signal: new AbortController().signal,
    })
    assert.equal(startCalls[0].label, 'workloom-implement')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('label 回退：readTask 失败时回退 workloom-<kind>（连字符）', async () => {
  const root = makeProject('')
  try {
    // task.json 损坏：readTask 报错，但 buildExecutorPrompt 只读 md/jsonl，不受影响。
    writeFileSync(join(root, '.workloom/tasks/test-task/task.json'), '{ not json')
    const { execute, startCalls } = setupExecutor()
    const parent = makeAgent(root)
    await execute(execArgs({ kind: 'research', title: undefined }), {
      agent: parent,
      signal: new AbortController().signal,
    })
    assert.equal(startCalls[0].label, 'workloom-research')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('label 组装：title 传入时四种 kind 均为 [<KindLabel>] <title>', async () => {
  const root = makeProject('')
  try {
    const { execute, startCalls } = setupExecutor()
    const parent = makeAgent(root)
    const cases = [
      ['research', 'Research'],
      ['implement', 'Implement'],
      ['check', 'Check'],
      ['frontend', 'Frontend'],
    ]
    for (const [kind, kindLabel] of cases) {
      await execute(execArgs({ kind, title: 'fix executor label prefix' }), {
        agent: parent,
        signal: new AbortController().signal,
      })
      assert.equal(
        startCalls[startCalls.length - 1].label,
        `[${kindLabel}] fix executor label prefix`,
      )
    }
    assert.equal(startCalls.length, 4)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('label 回退：title 为空白字符串时走缺省 task title 路径', async () => {
  const root = makeProject('')
  try {
    const { execute, startCalls } = setupExecutor()
    const parent = makeAgent(root)
    await execute(execArgs({ title: '   ' }), { agent: parent, signal: new AbortController().signal })
    assert.equal(startCalls[0].label, '[Implement] Test')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('label 组装：title 传入时不依赖 readTask（task.json 损坏仍可用）', async () => {
  const root = makeProject('')
  try {
    writeFileSync(join(root, '.workloom/tasks/test-task/task.json'), '{ not json')
    const { execute, startCalls } = setupExecutor()
    const parent = makeAgent(root)
    await execute(execArgs({ title: 'semantic title wins' }), {
      agent: parent,
      signal: new AbortController().signal,
    })
    assert.equal(startCalls[0].label, '[Implement] semantic title wins')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('参数面：title schema 必填（required + minLength 1）且描述引用 titleExecutor', () => {
  const { registered } = setupExecutor()
  const params = registered[0].parameters
  const props = params.properties
  assert.ok(params.required.includes('title'), 'title must be in required')
  assert.equal(props.title.type, 'string')
  assert.equal(props.title.minLength, 1)
  assert.equal(props.title.description, PARAM_DESCRIPTIONS.titleExecutor)
})

test('参数面：force/reason schema 描述引用 PARAM_DESCRIPTIONS', () => {
  const { registered } = setupExecutor()
  const props = registered[0].parameters.properties
  assert.equal(props.force.type, 'boolean')
  assert.equal(props.force.description, PARAM_DESCRIPTIONS.forceExecutor)
  assert.equal(props.reason.type, 'string')
  assert.equal(props.reason.description, PARAM_DESCRIPTIONS.reasonExecutor)
})

test('参数面：schema 恢复可选 effort 参数（描述引用 PARAM_DESCRIPTIONS.effort）', () => {
  const { registered } = setupExecutor()
  const params = registered[0].parameters
  const props = params.properties
  assert.equal(props.effort.type, 'string')
  assert.equal(props.effort.description, PARAM_DESCRIPTIONS.effort)
  assert.ok(!params.required.includes('effort'), 'effort must be optional')
})

test('参数面：continue_executor schema 可选，描述引用 PARAM_DESCRIPTIONS.continueExecutor', () => {
  const { registered } = setupExecutor()
  const params = registered[0].parameters
  const props = params.properties
  assert.equal(props.continue_executor.type, 'string')
  assert.equal(props.continue_executor.description, PARAM_DESCRIPTIONS.continueExecutor)
  assert.ok(!params.required.includes('continue_executor'), 'continue_executor must be optional')
})

test('effort 配置生效：subagents.<kind>.effort 进入 reasoningEffort，receipt 标 (config)', async () => {
  const root = makeProject(`
subagents:
  implement:
    model: deepseek-official/deepseek-v4-flash
    effort: max
`)
  try {
    const { execute, startCalls } = setupExecutor()
    const parent = makeAgent(root)
    const result = await execute(execArgs({ title: 'effort config test' }), {
      agent: parent,
      signal: new AbortController().signal,
    })
    assert.equal(startCalls.length, 1)
    const opts = startCalls[0].request.agentOptions
    assert.equal(opts.provider, 'deepseek-official')
    assert.equal(opts.model, 'deepseek-v4-flash')
    assert.equal(opts.reasoningEffort, 'max')
    const text = result.output[0].text
    assert.ok(text.includes('effort: max (config: legacy)'))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('effort 单独生效：无 model 配置时 agentOptions 仅含 reasoningEffort', async () => {
  const root = makeProject(`
subagents:
  implement:
    effort: max
`)
  try {
    const { execute, startCalls } = setupExecutor()
    const parent = makeAgent(root)
    await execute(execArgs({ title: 'effort only test' }), {
      agent: parent,
      signal: new AbortController().signal,
    })
    assert.equal(startCalls.length, 1)
    const opts = startCalls[0].request.agentOptions
    assert.equal(opts.provider, undefined)
    assert.equal(opts.model, undefined)
    assert.equal(opts.reasoningEffort, 'max')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('effort 参数优先：显式 effort 生效并标 (param)（与配置一致时无冲突）', async () => {
  const root = makeProject(`
subagents:
  implement:
    model: deepseek-official/deepseek-v4-flash
    effort: high
`)
  try {
    const { execute, startCalls } = setupExecutor()
    const parent = makeAgent(root)
    const result = await execute(
      execArgs({ title: 'effort param test', effort: 'high' }),
      { agent: parent, signal: new AbortController().signal },
    )
    assert.equal(startCalls.length, 1)
    const opts = startCalls[0].request.agentOptions
    assert.equal(opts.provider, 'deepseek-official')
    assert.equal(opts.model, 'deepseek-v4-flash')
    assert.equal(opts.reasoningEffort, 'high')
    const text = result.output[0].text
    assert.ok(text.includes('effort: high (param)'))
    assert.ok(!text.includes('effort: high (config)'))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('effort 冲突无 force：返回提示（含 effort 维度）且不派发', async () => {
  const root = makeProject(`
subagents:
  implement:
    effort: high
`)
  try {
    const { execute, startCalls } = setupExecutor()
    const parent = makeAgent(root)
    const result = await execute(
      execArgs({ title: 'effort conflict test', effort: 'max' }),
      { agent: parent, signal: new AbortController().signal },
    )
    const text = result.output[0].text
    assert.equal(startCalls.length, 0)
    assert.ok(
      text.includes('workloom executor: explicit parameters conflict with subagents.implement config:'),
    )
    assert.ok(text.includes('effort: config "high" (config: legacy), passed "max"'))
    assert.ok(text.includes('force: true with a non-empty reason'))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('effort 冲突 + force + reason：放行派发、overrides 记录 executor_model_effort', async () => {
  const root = makeProject(`
subagents:
  implement:
    effort: high
`)
  try {
    const { execute, startCalls } = setupExecutor()
    const parent = makeAgent(root)
    const result = await execute(
      execArgs({
        title: 'effort forced test',
        effort: 'max',
        force: true,
        reason: 'user wants max effort for this dispatch',
      }),
      { agent: parent, signal: new AbortController().signal },
    )
    assert.equal(startCalls.length, 1)
    const task = JSON.parse(
      readFileSync(join(root, '.workloom/tasks/test-task/task.json'), 'utf8'),
    )
    assert.equal(task.overrides.length, 1)
    assert.equal(task.overrides[0].gate, 'executor_model_effort')
    assert.equal(task.overrides[0].tool, 'workloom_execute')
    assert.equal(task.overrides[0].reason, 'user wants max effort for this dispatch')
    const text = result.output[0].text
    assert.ok(text.endsWith('(forced)'))
    assert.ok(text.includes('effort: max (param'))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('非法 effort 档位：派发时 fail loud（assertEffort 文案）', async () => {
  const root = makeProject(`
subagents:
  implement:
    effort: high
`)
  try {
    const { execute, startCalls } = setupExecutor()
    const parent = makeAgent(root)
    await assert.rejects(
      execute(execArgs({ title: 'invalid effort test', effort: 'ultra' }), {
        agent: parent,
        signal: new AbortController().signal,
      }),
      /invalid effort: ultra/,
    )
    assert.equal(startCalls.length, 0)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('冲突无 force：model 冲突返回提示且不派发（未传 effort 参数，无 effort 冲突）', async () => {
  const root = makeProject(`
subagents:
  implement:
    model: deepseek-official/deepseek-v4-flash
    effort: high
`)
  try {
    const { execute, startCalls } = setupExecutor()
    const parent = makeAgent(root)
    const result = await execute(
      execArgs({ title: 'conflict no force test', model: 'deepseek-official/deepseek-v4-pro' }),
      { agent: parent, signal: new AbortController().signal },
    )
    const text = result.output[0].text
    assert.equal(startCalls.length, 0)
    assert.ok(text.includes('workloom executor: explicit parameters conflict with subagents.implement config:'))
    assert.ok(
      text.includes(
        'model: config "deepseek-official/deepseek-v4-flash" (config: legacy), passed "deepseek-official/deepseek-v4-pro"',
      ),
    )
    assert.ok(
      !text.includes('effort: config'),
      'no effort param passed: the notice carries only the model conflict',
    )
    assert.ok(text.includes('force: true with a non-empty reason'))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('冲突 + force 缺 reason：抛错', async () => {
  const root = makeProject(`
subagents:
  implement:
    model: deepseek-official/deepseek-v4-flash
`)
  try {
    const { execute, startCalls } = setupExecutor()
    const parent = makeAgent(root)
    await assert.rejects(
      execute(
        execArgs({ title: 'conflict force test', model: 'deepseek-official/deepseek-v4-pro', force: true }),
        { agent: parent, signal: new AbortController().signal },
      ),
      /force: true requires a non-empty reason/,
    )
    assert.equal(startCalls.length, 0)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('冲突 + force + reason：放行派发、overrides 写入、receipt 带 (forced)', async () => {
  const root = makeProject(`
subagents:
  implement:
    model: deepseek-official/deepseek-v4-flash
    effort: high
`)
  try {
    // 配置含 effort 但工具只传 model（未传 effort 参数）：effort 不参与冲突，force 仅因 model 冲突。
    const { execute, startCalls } = setupExecutor()
    const parent = makeAgent(root)
    const result = await execute(
      execArgs({
        title: 'conflict forced test',
        model: 'deepseek-official/deepseek-v4-pro',
        force: true,
        reason: 'user asked to use the pro model',
      }),
      { agent: parent, signal: new AbortController().signal },
    )
    assert.equal(startCalls.length, 1)
    const task = JSON.parse(
      readFileSync(join(root, '.workloom/tasks/test-task/task.json'), 'utf8'),
    )
    assert.equal(task.overrides.length, 1)
    assert.equal(task.overrides[0].gate, 'executor_model_effort')
    assert.equal(task.overrides[0].tool, 'workloom_execute')
    assert.equal(task.overrides[0].reason, 'user asked to use the pro model')
    // 派发审计同样落盘：force 放行后仍记录一次成功派发（含 childId）。
    assert.equal(task.dispatches.length, 1)
    assert.equal(task.dispatches[0].kind, 'implement')
    assert.equal(task.dispatches[0].childId, 'child-1')
    const text = result.output[0].text
    assert.ok(text.endsWith('(forced)'))
    assert.ok(text.includes('deepseek-official/deepseek-v4-pro'))
    assert.ok(text.includes('(param)'))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('无冲突（归一化等价）：正常派发且无 (forced) 标注', async () => {
  const root = makeProject(`
subagents:
  implement:
    model: deepseek-official/deepseek-v4-flash
    effort: high
`)
  try {
    // 工具只传等价 model（不传 effort）：无 model/effort 冲突，正常派发（无 (forced) 标注）。
    const { execute, startCalls } = setupExecutor()
    const parent = makeAgent(root)
    const result = await execute(
      execArgs({ title: 'no conflict test', model: 'deepseek-official/deepseek-v4-flash' }),
      { agent: parent, signal: new AbortController().signal },
    )
    assert.equal(startCalls.length, 1)
    const text = result.output[0].text
    assert.ok(!text.includes('(forced)'))
    assert.ok(text.includes('(param)'))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('continuable 请求携带 toolFilter deny：9 workloom 名 + 可见委派候选交集，不可见候选不入 deny', async () => {
  const root = makeProject('')
  try {
    // 运行时可见工具集：9 个 workloom 工具全可见 + 部分委派候选可见 + 常规工具。
    const visible = [
      ...Object.values(TOOL_NAMES),
      'subagent',
      'subagent_with_model',
      'ralph',
      'write',
      'edit',
    ]
    const { execute, startCalls } = setupExecutor({ visibleTools: visible })
    const parent = makeAgent(root)
    await execute(execArgs({ title: 'toolfilter test' }), {
      agent: parent,
      signal: new AbortController().signal,
    })
    assert.equal(startCalls.length, 1)
    // deny = workloom 9 名全量 + 可见候选（subagent/subagent_with_model/ralph）；
    // 不可见候选（subagent_fork 等）不得硬编码进 deny（未知名字会使 restrict fail）。
    const expectedDeny = [...Object.values(TOOL_NAMES), 'subagent', 'subagent_with_model', 'ralph']
    assert.deepEqual(startCalls[0].request.toolFilter, { deny: expectedDeny })
    for (const name of NATIVE_DELEGATION_CANDIDATES) {
      const visibleCandidate = visible.includes(name)
      const denied = startCalls[0].request.toolFilter.deny.includes(name)
      assert.equal(denied, visibleCandidate, `candidate ${name} must be denied only when visible`)
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('provider 缺 toolFilter capability：派发前 fail loud（清晰英文错误，不静默丢弃）', async () => {
  const root = makeProject('')
  try {
    const { execute, startCalls } = setupExecutor({
      subagentProvider: {
        name: 'spawn',
        capabilities: {
          outputSchema: true,
          depthLimit: true,
          toolFilter: false,
          persona: true,
        },
        inheritsParentContext: true,
      },
    })
    const parent = makeAgent(root)
    await assert.rejects(
      execute(execArgs(), { agent: parent, signal: new AbortController().signal }),
      /toolFilter/,
    )
    assert.equal(startCalls.length, 0, 'start must not be called when the capability is missing')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('provider 未注册（getProvider 返回 undefined）：派发前 fail loud', async () => {
  const root = makeProject('')
  try {
    const { execute, startCalls } = setupExecutor({ getProvider: () => undefined })
    const parent = makeAgent(root)
    await assert.rejects(
      execute(execArgs(), { agent: parent, signal: new AbortController().signal }),
      /toolFilter/,
    )
    assert.equal(startCalls.length, 0)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('provider 畸形（capabilities 缺失）：派发前 fail loud（清晰英文错误，非 TypeError）', async () => {
  const root = makeProject('')
  try {
    const { execute, startCalls } = setupExecutor({
      subagentProvider: { name: 'spawn', inheritsParentContext: true },
    })
    const parent = makeAgent(root)
    await assert.rejects(
      execute(execArgs(), { agent: parent, signal: new AbortController().signal }),
      /"toolFilter" capability/,
    )
    assert.equal(startCalls.length, 0)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('startContinuable reject（UNSUPPORTED_CAPABILITY）：转清晰英文错误兜底', async () => {
  const root = makeProject('')
  try {
    const capabilityError = new Error('capability missing')
    capabilityError.code = 'UNSUPPORTED_CAPABILITY'
    const { execute, startCalls } = setupExecutor({ startReject: capabilityError })
    const parent = makeAgent(root)
    await assert.rejects(
      execute(execArgs(), { agent: parent, signal: new AbortController().signal }),
      /"toolFilter" capability/,
    )
    assert.equal(startCalls.length, 0)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('executor-dispatch 拆分面：deny 清单/capability 校验/错误兜底可直接导入且与工具路径一致', () => {
  // 模块拆分 seam：工具路径经由本模块组装 deny 与校验 capability，直接断言导出面
  // 与行为，防止拆分后 executor.ts 静默内联回退。
  const visible = new Set([
    ...Object.values(TOOL_NAMES),
    'subagent',
    'subagent_with_model',
    'ralph',
    'write',
    'edit',
  ])
  // deny = workloom 9 名全量 + 可见委派候选交集（不可见候选不入 deny）。
  const deny = buildDenyList(visible)
  assert.deepEqual(deny, [...Object.values(TOOL_NAMES), 'subagent', 'subagent_with_model', 'ralph'])
  // 真实可见集 = 可见集 − deny（保持声明顺序）。
  assert.deepEqual(availableToolNames(visible, deny), ['write', 'edit'])
  // capability 缺失 / provider 未注册 / 畸形 provider 均 fail loud 且指名 spawn provider。
  assert.throws(
    () => assertToolFilterCapability(undefined),
    new RegExp(`"${SPAWN_PROVIDER}" is not registered`),
  )
  assert.throws(
    () => assertToolFilterCapability({ capabilities: { toolFilter: false } }),
    /does not support the "toolFilter" capability/,
  )
  // 畸形 provider（capabilities 整体缺失）与 toolFilter: false 同等 fail loud。
  assert.throws(
    () => assertToolFilterCapability({}),
    /does not support the "toolFilter" capability/,
  )
  // UNSUPPORTED_CAPABILITY 兜底转清晰英文错误；其余错误原样透传。
  const capabilityError = new Error('capability missing')
  capabilityError.code = 'UNSUPPORTED_CAPABILITY'
  const translated = toCapabilityError(capabilityError)
  assert.ok(translated instanceof Error)
  assert.match(String(translated.message), /"toolFilter" capability/)
  const other = new Error('plain failure')
  assert.equal(toCapabilityError(other), other)
})

test('s4: 跨 kind 续用被拒（返回提示，不派发不 followup）', async () => {
  const root = makeProject('')
  try {
    const { execute, startCalls, followupCalls } = setupExecutor()
    const parent = makeAgent(root)
    // 两个 kind 的派发记录（child-1: implement、child-2: check）。
    await execute(execArgs({ title: 'impl round' }), {
      agent: parent,
      signal: new AbortController().signal,
    })
    await execute(execArgs({ kind: 'check', title: 'check round' }), {
      agent: parent,
      signal: new AbortController().signal,
    })
    // implement 续用 check 会话（显式 childId）：同 kind 校验拒绝。
    const result = await execute(
      execArgs({ title: 'cross kind reuse', continue_executor: 'child-2' }),
      { agent: parent, signal: new AbortController().signal },
    )
    const text = result.output[0].text
    assert.ok(text.includes('cross-kind reuse rejected'), 'must return a clear reuse rejection')
    assert.ok(text.includes('check'), 'notice must name the recorded kind')
    assert.equal(startCalls.length, 2, 'no new dispatch for a rejected reuse')
    assert.equal(followupCalls.length, 0, 'followup must not fire for a rejected reuse')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('续用定位：无同 kind 记录（latest）返回明确提示不派发', async () => {
  const root = makeProject('')
  try {
    const { execute, startCalls, followupCalls } = setupExecutor()
    const parent = makeAgent(root)
    const result = await execute(
      execArgs({ kind: 'research', continue_executor: 'latest' }),
      { agent: parent, signal: new AbortController().signal },
    )
    const text = result.output[0].text
    assert.ok(text.includes('no previous research executor dispatch'), 'must explain the miss')
    assert.equal(startCalls.length, 0)
    assert.equal(followupCalls.length, 0)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('续用定位：旧记录缺 childId（latest）返回明确提示不报错', async () => {
  const root = makeProject('')
  try {
    // 预置一条旧格式派发记录（无 childId 字段）：latest 定位失败返回提示。
    const task = JSON.parse(
      readFileSync(join(root, '.workloom/tasks/test-task/task.json'), 'utf8'),
    )
    task.dispatches = [
      { kind: 'implement', at: new Date().toISOString(), title: 'legacy dispatch' },
    ]
    writeFileSync(
      join(root, '.workloom/tasks/test-task/task.json'),
      JSON.stringify(task),
    )
    const { execute, startCalls, followupCalls } = setupExecutor()
    const parent = makeAgent(root)
    const result = await execute(
      execArgs({ continue_executor: 'latest' }),
      { agent: parent, signal: new AbortController().signal },
    )
    const text = result.output[0].text
    assert.ok(text.includes('no previous implement executor dispatch'), 'must explain the miss')
    assert.equal(startCalls.length, 0)
    assert.equal(followupCalls.length, 0)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('续用定位：显式 childId 不在 dispatches 中返回明确提示不派发', async () => {
  const root = makeProject('')
  try {
    const { execute, startCalls, followupCalls } = setupExecutor()
    const parent = makeAgent(root)
    const result = await execute(
      execArgs({ continue_executor: 'session-unknown' }),
      { agent: parent, signal: new AbortController().signal },
    )
    const text = result.output[0].text
    assert.ok(text.includes('session-unknown'), 'notice must echo the requested id')
    assert.equal(startCalls.length, 0)
    assert.equal(followupCalls.length, 0)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('续用被上游拒绝（belongs to another parent session，fork 场景）：返回引导文案且 isError', async () => {
  const root = makeProject('')
  try {
    // 模拟 fork 分身接续源会话派发的 executor：followup 被 DSH parent 严格校验拒绝
    // （research/current-state.md 的 session-35cb4f6a 实证）。
    const { execute, followupCalls, drainCalls } = setupExecutor({
      followupReject: new Error('executor child session belongs to another parent session'),
    })
    const parent = makeAgent(root)
    // 第一轮：新派发（dispatches 记录 child-1，供续用定位）。
    await execute(execArgs({ prompt: 'round 1', title: 'fork continue test' }), {
      agent: parent,
      signal: new AbortController().signal,
    })
    // 第二轮：continue_executor='latest' 定位到 child-1 后，followup 被上游拒绝——
    // 工具结果是 design §4.2 的引导文案且保持 isError 语义（抛错，由 DSH 转失败）。
    await assert.rejects(
      execute(
        execArgs({ prompt: 'round 2', title: 'fork continue test', continue_executor: 'latest' }),
        { agent: parent, signal: new AbortController().signal },
      ),
      /Cannot continue the recorded executor: it belongs to the session that dispatched it, not this one \(typically because the current session is a fork\)\. Dispatch a fresh executor instead, carrying the needed context in the prompt\./,
    )
    // 上游拒绝只发生一次（不重试）；拒绝轮未产生子代理运行，drain 仅第一轮一次。
    assert.equal(followupCalls.length, 1, 'followup must be attempted exactly once')
    assert.equal(drainCalls.length, 1, 'rejected followup must not drain an extra turn')
    // 拒绝轮不落 dispatches 记录：源会话的记录保持可续用，不被失败续用污染。
    const task = JSON.parse(readFileSync(join(root, '.workloom/tasks/test-task/task.json'), 'utf8'))
    assert.equal(task.dispatches.length, 1, 'rejected followup must not record a dispatch')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('续用被上游以其他原因拒绝：原样透传上游错误（不套 fork 引导文案）', async () => {
  const root = makeProject('')
  try {
    // 转译只认 parent 校验拒绝片段，其余接续失败必须原样抛出（fail loud 不加工）。
    const upstream = new Error('executor child session is busy')
    const { execute } = setupExecutor({ followupReject: upstream })
    const parent = makeAgent(root)
    await execute(execArgs({ prompt: 'round 1', title: 'continue passthrough test' }), {
      agent: parent,
      signal: new AbortController().signal,
    })
    await assert.rejects(
      execute(
        execArgs({
          prompt: 'round 2',
          title: 'continue passthrough test',
          continue_executor: 'latest',
        }),
        { agent: parent, signal: new AbortController().signal },
      ),
      (error) => error === upstream,
      'non-fork followup rejection must propagate unchanged',
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

/** 写入本机片段文件（目录自动创建）。 */
function writeLocalFragment(root, name, body) {
  const dir = join(root, '.workloom', 'prompts.local')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, name), body)
}

test('本机片段：可见集−deny 满足 requiresTools 时首条 prompt 注入 Local directives 段', async () => {
  const root = makeProject('')
  writeLocalFragment(root, 'all.md', 'ALL RULES')
  writeLocalFragment(
    root,
    'implement.md',
    '---\nrequiresTools: [lsp_diagnostics]\n---\nRun lsp_diagnostics in the final pass.',
  )
  try {
    const { execute, startCalls } = setupExecutor({
      visibleTools: [...Object.values(TOOL_NAMES), 'write', 'edit', 'lsp_diagnostics'],
    })
    const parent = makeAgent(root)
    await execute(execArgs({ title: 'local prompts test' }), {
      agent: parent,
      signal: new AbortController().signal,
    })
    assert.equal(startCalls.length, 1)
    const text = startCalls[0].request.prompt[0].text
    const taskPromptAt = text.indexOf('## Task prompt')
    const localAt = text.indexOf('## Local directives')
    const contractAt = text.indexOf('## Executor contract')
    assert.ok(localAt !== -1, 'local directives section must be injected')
    assert.ok(
      taskPromptAt !== -1 && taskPromptAt < localAt && localAt < contractAt,
      'local directives must sit between the task prompt and the authoritative contract',
    )
    // 合成顺序：all.md 在前、kind 专属在后（条件满足）。
    const section = text.slice(localAt, contractAt)
    assert.ok(section.includes('ALL RULES'), 'all.md rules must be injected')
    assert.ok(
      section.indexOf('ALL RULES') < section.indexOf('Run lsp_diagnostics'),
      'all.md rules must precede the kind-specific rules',
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('本机片段：可见集−deny 缺声明工具时不注入 Local directives 段', async () => {
  const root = makeProject('')
  writeLocalFragment(
    root,
    'implement.md',
    '---\nrequiresTools: [lsp_diagnostics]\n---\nRun lsp_diagnostics.',
  )
  try {
    // 默认可见集（workloom 9 + 委派候选 + write/edit）不含 lsp_diagnostics → 条件不满足。
    const { execute, startCalls } = setupExecutor()
    const parent = makeAgent(root)
    await execute(execArgs({ title: 'no local test' }), {
      agent: parent,
      signal: new AbortController().signal,
    })
    const text = startCalls[0].request.prompt[0].text
    assert.ok(!text.includes('## Local directives'))
    assert.ok(!text.includes('Run lsp_diagnostics.'))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('本机片段：被 deny 的可见工具不算可用（探测集 = 可见集 − denyList）', async () => {
  const root = makeProject('')
  writeLocalFragment(root, 'implement.md', '---\nrequiresTools: [subagent]\n---\nSubagent rule.')
  try {
    // 默认可见集含 subagent（委派候选），但它被 buildDenyList deny → 子代理不可见 → 不注入。
    const { execute, startCalls } = setupExecutor()
    const parent = makeAgent(root)
    await execute(execArgs({ title: 'denied tool test' }), {
      agent: parent,
      signal: new AbortController().signal,
    })
    const text = startCalls[0].request.prompt[0].text
    assert.ok(!text.includes('## Local directives'))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
