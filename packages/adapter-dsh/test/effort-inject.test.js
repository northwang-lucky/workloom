/**
 * effort 注入模块单测：agent/created 监听命中、installModelSelection 注入面与
 * 瀑布行为（接缝 A-D）。测试依赖 dist（test 脚本先 build 再跑 node --test）。
 *
 * 接缝映射：
 * - A 挂载面：registerEffortInjection 注册 agent/created；无 effort 的 agent 不安装、零副作用；
 * - B 传输介质面：带 reasoningEffort 的 agent（模拟 resolveChildAgentOptions 展开后的
 *   agent.options）命中并安装选择器；
 * - C 注入面：瀑布把 effort 写入请求配置、覆盖 provider/model、无 effort 时清除 inherited；
 * - D 集成面：executor 派发带 effort → 子代理 agent/created 命中 → 安装器被调用。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { installModelSelection } from '@deepseek-ai/dsh-agent'
import { registerEffortInjection } from '../dist/effort-inject.js'
import { registerExecutor } from '../dist/executor.js'

/** 构造可捕获事件监听器的 ctx（on 记录回调，供 emit 触发）。 */
function makeEventCtx() {
  const listeners = new Map()
  return {
    listeners,
    on(name, cb) {
      const list = listeners.get(name) ?? []
      list.push(cb)
      listeners.set(name, list)
      return () => {}
    },
  }
}

/** 构造模拟子代理 agent：options 承载附加字段，ctx 为 agent-scoped mock。 */
function makeAgent(options, agentCtx = makeEventCtx()) {
  return { id: 'child-effort-1', options, ctx: agentCtx }
}

/** 触发 ctx 上注册的 agent/created 监听器（模拟 DSH announce 同步 dispatch）。 */
function emitCreated(ctx, agent) {
  const callbacks = ctx.listeners.get('agent/created') ?? []
  for (const cb of callbacks) cb({ agent })
}

/** 构造最小可工作的 workloom 项目根（含 config.yaml 与任务目录，供 executor 集成用）。 */
function makeProject(configYaml) {
  const root = mkdtempSync(join(tmpdir(), 'workloom-dsh-effort-'))
  const workloomDir = join(root, '.workloom')
  mkdirSync(workloomDir)
  writeFileSync(join(workloomDir, 'config.yaml'), configYaml)
  const taskDir = join(workloomDir, 'tasks/test-task')
  mkdirSync(taskDir, { recursive: true })
  writeFileSync(
    join(taskDir, 'task.json'),
    JSON.stringify({ status: 'planning', title: 'Test', slug: 'test-task', priority: 'P2' }),
  )
  writeFileSync(join(taskDir, 'prd.md'), '# PRD\n')
  writeFileSync(join(taskDir, 'design.md'), '# Design\n')
  writeFileSync(join(taskDir, 'implement.md'), '# Implement\n')
  return root
}

test('A. 无 reasoningEffort 的 agent：不安装选择器（零副作用）', () => {
  const ctx = makeEventCtx()
  const childCtx = makeEventCtx()
  registerEffortInjection(ctx)
  assert.ok(ctx.listeners.has('agent/created'), 'agent/created listener must be registered')
  emitCreated(ctx, makeAgent({ provider: 'p', model: 'm' }, childCtx))
  assert.equal(childCtx.listeners.size, 0, 'no waterfall listener installed for effort-less agent')
})

test('B. 带 reasoningEffort 的 agent：安装选择器（两个瀑布监听）', () => {
  const ctx = makeEventCtx()
  const childCtx = makeEventCtx()
  registerEffortInjection(ctx)
  emitCreated(ctx, makeAgent({ provider: 'p', model: 'm', reasoningEffort: 'max' }, childCtx))
  assert.ok(
    childCtx.listeners.has('system-prompt/assemble'),
    'assemble waterfall listener must be installed',
  )
  assert.ok(
    childCtx.listeners.has('agent/request'),
    'request waterfall listener must be installed',
  )
})

test('C. 瀑布把 effort 写入请求配置并覆盖 provider/model（先 assemble 快照再 request）', async () => {
  const ctx = makeEventCtx()
  const childCtx = makeEventCtx()
  registerEffortInjection(ctx)
  emitCreated(ctx, makeAgent({ provider: 'alpha', model: 'a1', reasoningEffort: 'max' }, childCtx))
  const assemble = childCtx.listeners.get('system-prompt/assemble')?.[0]
  const request = childCtx.listeners.get('agent/request')?.[0]
  assert.ok(assemble && request, 'both waterfalls must be installed')
  // installModelSelection 语义：assemble 快照 selection.current → assembled，request 再消费。
  const assembled = await assemble({ variables: {} }, {}, () => Promise.resolve({ variables: {} }))
  assert.deepEqual(assembled.variables, { provider: 'alpha', model: 'a1' })
  const resolved = await request(
    { turn: 1, step: 0 },
    () => Promise.resolve({ provider: 'seed', model: 'seed' }),
  )
  assert.equal(resolved.provider, 'alpha')
  assert.equal(resolved.model, 'a1')
  assert.equal(resolved.reasoningEffort, 'max')
})

test('C. installModelSelection 依赖语义：无 effort 时清除 inherited reasoningEffort', async () => {
  const childCtx = makeEventCtx()
  // 手动构造 selection（模拟 DSH 其他安装者）：只携带 provider/model、无 effort。
  const selection = {
    current: { provider: 'beta', model: 'b1' },
    assembled: undefined,
  }
  installModelSelection(childCtx, selection)
  const assemble = childCtx.listeners.get('system-prompt/assemble')?.[0]
  const request = childCtx.listeners.get('agent/request')?.[0]
  assert.ok(assemble && request)
  await assemble({ variables: {} }, {}, () => Promise.resolve({ variables: {} }))
  const resolved = await request(
    { turn: 1, step: 0 },
    () =>
      Promise.resolve({
        provider: 'alpha',
        model: 'a1',
        reasoningEffort: 'max',
        temperature: 0.2,
      }),
  )
  assert.deepEqual(resolved, { provider: 'beta', model: 'b1', temperature: 0.2 })
})

test('D. 集成：executor 派发带 effort → 子代理 agent/created 命中 → 安装选择器', async () => {
  const root = makeProject(`
subagents:
  implement:
    effort: max
`)
  try {
    const ctx = makeEventCtx()
    const registered = []
    const startCalls = []
    let installedChildCtx = null
    ctx.tools = {
      register(def) {
        registered.push(def)
        return () => {}
      },
    }
    ctx.subagents = {
      async start(name, request) {
        startCalls.push({ name, request })
        // 模拟 DSH startInProcessRun：resolveChildAgentOptions 的 ...requested 展开
        // agentOptions → 子代理 options，发布路径同步触发 agent/created。
        const childCtx = makeEventCtx()
        installedChildCtx = childCtx
        emitCreated(ctx, makeAgent({ ...(request.agentOptions ?? {}), subagentDepth: 1 }, childCtx))
        return {
          id: 'child-d-1',
          result: Promise.resolve({
            output: [{ type: 'text', text: 'done' }],
            stopReason: 'completed',
          }),
          async dispose() {},
        }
      },
    }
    registerExecutor(ctx)
    registerEffortInjection(ctx)
    const def = registered[0]
    assert.ok(def, 'executor tool must be registered')
    const parent = { id: 'parent-1', session: { header: { cwd: root } } }
    await def.execute(
      { kind: 'implement', prompt: 'test', taskPath: 'tasks/test-task', title: 'integration test' },
      { agent: parent, signal: new AbortController().signal },
    )
    // 防回归：executor 派发参数携带 reasoningEffort（上任务实现）。
    assert.equal(startCalls.length, 1)
    assert.equal(startCalls[0].request.agentOptions.reasoningEffort, 'max')
    // 串起 A/B：子代理 agent/created 命中后，安装器已在其 ctx 上注册瀑布监听。
    assert.ok(
      installedChildCtx.listeners.has('system-prompt/assemble'),
      'child effort selection must be installed through agent/created',
    )
    assert.ok(installedChildCtx.listeners.has('agent/request'))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
