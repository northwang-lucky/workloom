/**
 * executor 模块单测：agentOptions provider 拆分、one-shot 派发契约、stopReason
 * 异常终止、dispose 释放与 receipt 行。
 * 测试依赖 dist（test 脚本先 build 再跑 node --test）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { PARAM_DESCRIPTIONS } from '@workloom-ai/core'
import { registerExecutor } from '../dist/executor.js'
import { decideWriteGate } from '../dist/gate.js'

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

/** 构造模拟 agent（parent，仅 id 与 cwd 被 executor 读取）。 */
function makeAgent(root) {
  return {
    id: 'parent-1',
    session: {
      header: { cwd: root },
    },
  }
}

/** 构造模拟子代理 agent（depth >= 1，供门禁判定观察：id 对应派发 run.id）。 */
function makeChildAgent(root, id) {
  return {
    id,
    options: { subagentDepth: 1 },
    session: {
      header: { cwd: root, delegationDepth: 1 },
    },
  }
}

/** 构造模拟 ctx（捕获注册的工具、one-shot 派发参数与 dispose 调用）。 */
function makeCtx(overrides = {}) {
  const registered = []
  const startCalls = []
  const disposeCalls = []

  const tools = {
    register(def) {
      registered.push(def)
      return () => {}
    },
  }

  const subagents = {
    async start(name, request) {
      startCalls.push({ name, request })
      // 默认 completed + 文本输出；subagentResult 覆盖最终结果（可用函数按调用次数）。
      const result = overrides.subagentResult
        ? (typeof overrides.subagentResult === 'function'
          ? overrides.subagentResult(startCalls.length)
          : overrides.subagentResult)
        : { output: [{ type: 'text', text: 'Mock executor output.' }], stopReason: 'completed' }
      return {
        id: `child-${startCalls.length}`,
        result: Promise.resolve(result),
        async dispose() {
          disposeCalls.push(`child-${startCalls.length}`)
          if (overrides.dispose !== undefined) await overrides.dispose()
        },
      }
    },
  }

  const ctx = { tools, subagents }
  return { ctx, registered, startCalls, disposeCalls }
}

/** 注册 executor 并返回 { execute, registered, startCalls, disposeCalls }。 */
function setupExecutor(overrides = {}) {
  const { ctx, registered, startCalls, disposeCalls } = makeCtx(overrides)
  registerExecutor(ctx)
  const def = registered[0]
  assert.ok(def, 'executor tool must be registered')
  return { execute: def.execute.bind(def), registered, startCalls, disposeCalls }
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
      {
        kind: 'implement',
        prompt: 'test',
        taskPath: 'tasks/test-task',
        title: 'provider prefix test',
      },
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
      {
        kind: 'research',
        prompt: 'test',
        taskPath: 'tasks/test-task',
        title: 'bare model test',
      },
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
      {
        kind: 'check',
        prompt: 'test',
        taskPath: 'tasks/test-task',
        title: 'no config test',
      },
      { agent: parent, signal: new AbortController().signal },
    )
    assert.equal(startCalls.length, 1)
    assert.equal(startCalls[0].request.agentOptions, undefined)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('one-shot 派发：spawn provider、label、maxDepth 1、agentOptions、signal 与 parent', async () => {
  const root = makeProject(`
subagents:
  implement:
    model: deepseek-official/deepseek-v4-flash
`)
  try {
    const { execute, startCalls } = setupExecutor()
    const parent = makeAgent(root)
    const signal = new AbortController().signal
    const result = await execute(
      {
        kind: 'implement',
        prompt: 'test prompt',
        taskPath: 'tasks/test-task',
        title: 'one-shot dispatch test',
      },
      { agent: parent, signal },
    )
    assert.equal(startCalls.length, 1)
    const call = startCalls[0]
    assert.equal(call.name, 'spawn')
    assert.equal(call.request.label, '[Implement] one-shot dispatch test')
    assert.equal(call.request.maxDepth, 1)
    assert.equal(call.request.signal, signal)
    assert.equal(call.request.parent, parent)
    assert.equal(call.request.prompt.length, 1)
    assert.equal(call.request.prompt[0].type, 'text')
    assert.ok(call.request.prompt[0].text.includes('Active task:'), 'prompt must inline the task')
    assert.deepEqual(call.request.agentOptions, {
      provider: 'deepseek-official',
      model: 'deepseek-v4-flash',
    })
    // runId 沿用 run.id（桩按调用次数生成 child-N）
    assert.equal(result.runId, 'child-1')
    assert.ok(result.output[0].text.includes('Mock executor output.'))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('派发成功：task.json dispatches 记录 { kind, at, title }', async () => {
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
    assert.ok(!Number.isNaN(Date.parse(task.dispatches[0].at)))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('stopReason 非 completed：抛错且文本用 diagnostic（不附输出）', async () => {
  const root = makeProject('')
  try {
    const { execute, startCalls } = setupExecutor({
      subagentResult: {
        output: [{ type: 'text', text: 'partial output' }],
        stopReason: 'refusal',
        diagnostic: 'the model declined the task',
      },
    })
    const parent = makeAgent(root)
    await assert.rejects(
      execute(
        { kind: 'check', prompt: 'test', taskPath: 'tasks/test-task', title: 'refusal test' },
        { agent: parent, signal: new AbortController().signal },
      ),
      /the model declined the task/,
    )
    assert.equal(startCalls.length, 1)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('stopReason 非 completed 且缺 diagnostic：用 stopReason 兜底文案', async () => {
  const root = makeProject('')
  try {
    const { execute, startCalls } = setupExecutor({
      subagentResult: { output: [], stopReason: 'aborted' },
    })
    const parent = makeAgent(root)
    await assert.rejects(
      execute(
        { kind: 'check', prompt: 'test', taskPath: 'tasks/test-task', title: 'aborted test' },
        { agent: parent, signal: new AbortController().signal },
      ),
      /the executor subagent ended with aborted/,
    )
    assert.equal(startCalls.length, 1)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('dispose 失败仅 WARNING：结果仍正常返回', async (t) => {
  const root = makeProject('')
  try {
    const warn = t.mock.method(console, 'warn', () => {})
    const { execute, disposeCalls } = setupExecutor({
      dispose: () => {
        throw new Error('dispose boom')
      },
    })
    const parent = makeAgent(root)
    const result = await execute(
      { kind: 'check', prompt: 'test', taskPath: 'tasks/test-task', title: 'dispose warn test' },
      { agent: parent, signal: new AbortController().signal },
    )
    assert.equal(disposeCalls.length, 1)
    assert.equal(warn.mock.callCount(), 1)
    assert.match(String(warn.mock.calls[0].arguments[0]), /failed to dispose executor run/)
    assert.ok(result.output[0].text.includes('Mock executor output.'))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('run.dispose 在结果被读取后调用（含异常终止路径）', async () => {
  const root = makeProject('')
  try {
    const { execute, disposeCalls } = setupExecutor({
      subagentResult: { output: [], stopReason: 'max-tokens' },
    })
    const parent = makeAgent(root)
    await assert.rejects(
      execute(
        { kind: 'check', prompt: 'test', taskPath: 'tasks/test-task', title: 'dispose error test' },
        { agent: parent, signal: new AbortController().signal },
      ),
    )
    assert.equal(disposeCalls.length, 1)
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
    const result = await execute(
      {
        kind: 'implement',
        prompt: 'test',
        taskPath: 'tasks/test-task',
        title: 'receipt config test',
      },
      { agent: parent, signal: new AbortController().signal },
    )
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
      { kind: 'implement', prompt: 'test', model: 'param-provider/param-model', taskPath: 'tasks/test-task', title: 'receipt param test' },
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

test('receipt 行：空输出时仍追加（EMPTY_OUTPUT_TEXT 之后）', async () => {
  const root = makeProject(`
subagents:
  check:
    model: deepseek-official/deepseek-v4-flash
`)
  try {
    // subagentResult 空输出 → 子代理无文本产出，receipt 仍保留
    const { execute } = setupExecutor({ subagentResult: { output: [], stopReason: 'completed' } })
    const parent = makeAgent(root)
    const result = await execute(
      {
        kind: 'check',
        prompt: 'test',
        taskPath: 'tasks/test-task',
        title: 'empty output test',
      },
      { agent: parent, signal: new AbortController().signal },
    )
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
    const result = await execute(
      {
        kind: 'check',
        prompt: 'test',
        taskPath: 'tasks/test-task',
        title: 'default source test',
      },
      { agent: parent, signal: new AbortController().signal },
    )
    const text = result.output[0].text
    assert.ok(text.includes('<parent session>'))
    assert.ok(text.includes('(default)'))
    assert.ok(!text.includes('effort:'), 'no effort config must omit the effort segment')
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
      await execute(
        { kind, prompt: 'test', taskPath: 'tasks/test-task' },
        { agent: parent, signal: new AbortController().signal },
      )
      assert.equal(startCalls[startCalls.length - 1].request.label, `[${kindLabel}] Test`)
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
    await execute(
      { kind: 'implement', prompt: 'test', taskPath: 'tasks/test-task' },
      { agent: parent, signal: new AbortController().signal },
    )
    assert.equal(startCalls[0].request.label, 'workloom-implement')
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
    await execute(
      { kind: 'research', prompt: 'test', taskPath: 'tasks/test-task' },
      { agent: parent, signal: new AbortController().signal },
    )
    assert.equal(startCalls[0].request.label, 'workloom-research')
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
      await execute(
        {
          kind,
          prompt: 'test',
          taskPath: 'tasks/test-task',
          title: 'fix executor label prefix',
        },
        { agent: parent, signal: new AbortController().signal },
      )
      assert.equal(
        startCalls[startCalls.length - 1].request.label,
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
    await execute(
      { kind: 'implement', prompt: 'test', taskPath: 'tasks/test-task', title: '   ' },
      { agent: parent, signal: new AbortController().signal },
    )
    assert.equal(startCalls[0].request.label, '[Implement] Test')
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
    await execute(
      {
        kind: 'implement',
        prompt: 'test',
        taskPath: 'tasks/test-task',
        title: 'semantic title wins',
      },
      { agent: parent, signal: new AbortController().signal },
    )
    assert.equal(startCalls[0].request.label, '[Implement] semantic title wins')
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
    const result = await execute(
      { kind: 'implement', prompt: 'test', taskPath: 'tasks/test-task', title: 'effort config test' },
      { agent: parent, signal: new AbortController().signal },
    )
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
    await execute(
      { kind: 'implement', prompt: 'test', taskPath: 'tasks/test-task', title: 'effort only test' },
      { agent: parent, signal: new AbortController().signal },
    )
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
      {
        kind: 'implement',
        prompt: 'test',
        taskPath: 'tasks/test-task',
        title: 'effort param test',
        effort: 'high',
      },
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
      {
        kind: 'implement',
        prompt: 'test',
        taskPath: 'tasks/test-task',
        title: 'effort conflict test',
        effort: 'max',
      },
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
      {
        kind: 'implement',
        prompt: 'test',
        taskPath: 'tasks/test-task',
        title: 'effort forced test',
        effort: 'max',
        force: true,
        reason: 'user wants max effort for this dispatch',
      },
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
      execute(
        {
          kind: 'implement',
          prompt: 'test',
          taskPath: 'tasks/test-task',
          title: 'invalid effort test',
          effort: 'ultra',
        },
        { agent: parent, signal: new AbortController().signal },
      ),
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
      {
        kind: 'implement',
        prompt: 'test',
        taskPath: 'tasks/test-task',
        title: 'conflict no force test',
        model: 'deepseek-official/deepseek-v4-pro',
      },
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
        {
          kind: 'implement',
          prompt: 'test',
          taskPath: 'tasks/test-task',
          title: 'conflict force test',
          model: 'deepseek-official/deepseek-v4-pro',
          force: true,
        },
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
      {
        kind: 'implement',
        prompt: 'test',
        taskPath: 'tasks/test-task',
        title: 'conflict forced test',
        model: 'deepseek-official/deepseek-v4-pro',
        force: true,
        reason: 'user asked to use the pro model',
      },
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
    // 派发审计同样落盘：force 放行后仍记录一次成功派发。
    assert.equal(task.dispatches.length, 1)
    assert.equal(task.dispatches[0].kind, 'implement')
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
      {
        kind: 'implement',
        prompt: 'test',
        taskPath: 'tasks/test-task',
        title: 'no conflict test',
        model: 'deepseek-official/deepseek-v4-flash',
      },
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

test('派发期间登记写门禁豁免、结算后注销（门禁对子代理生效）', async () => {
  const root = makeProject('executor:\n  gate: true\n')
  // 任务标记为 in_progress，使非豁免子代理在业务路径上会被门禁 deny。
  writeFileSync(
    join(root, '.workloom/tasks/test-task/task.json'),
    JSON.stringify({ status: 'in_progress', title: 'Test', slug: 'test-task', priority: 'P2' }),
  )
  try {
    // 手动结算的 run.result：观测「派发期间（已注册）」与「结算后（已注销）」两个时点。
    let resolveResult
    const registered = []
    const disposeCalls = []
    const ctx = {
      tools: {
        register(def) {
          registered.push(def)
          return () => {}
        },
      },
      subagents: {
        async start() {
          return {
            id: 'child-gate-1',
            result: new Promise((resolve) => {
              resolveResult = resolve
            }),
            async dispose() {
              disposeCalls.push('child-gate-1')
            },
          }
        },
      },
    }
    registerExecutor(ctx)
    const def = registered[0]
    assert.ok(def, 'executor tool must be registered')
    const parent = makeAgent(root)
    // 不 await：execute 在 start resolve 后登记豁免，并在 run.result 结算前挂起。
    const pending = def.execute(
      {
        kind: 'implement',
        prompt: 'test',
        taskPath: 'tasks/test-task',
        title: 'gate exemption test',
      },
      { agent: parent, signal: new AbortController().signal },
    )
    // 存活 microtask 已完成登记（register 在 start resolve 后同步执行），派发期间应豁免放行。
    await new Promise((r) => setImmediate(r))
    const child = makeChildAgent(root, 'child-gate-1')
    assert.deepEqual(
      decideWriteGate({ name: 'write', agent: child, filePath: 'src/main.ts' }),
      { kind: 'allow' },
      'during dispatch the executor child must be exempt',
    )
    // 结算后 finally 先注销再 dispose：非豁免的 fork 子代理被门禁 deny。
    resolveResult({ output: [{ type: 'text', text: 'done' }], stopReason: 'completed' })
    const result = await pending
    assert.equal(disposeCalls.length, 1)
    assert.equal(result.runId, 'child-gate-1')
    assert.equal(
      decideWriteGate({ name: 'write', agent: child, filePath: 'src/main.ts' }).kind,
      'deny',
      'after settlement the child must no longer be exempt',
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
