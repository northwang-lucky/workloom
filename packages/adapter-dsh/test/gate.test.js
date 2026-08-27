/**
 * 硬门禁模块单测：decideWriteGate 判定链各分支 + registerGate 故障兜底。
 * 测试依赖 dist（test 脚本先 build 再跑 node --test）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { decideWriteGate, registerGate } from '../dist/gate.js'

/**
 * 构造 workloom 项目根：config.yaml + 会话指针 + 任务目录（task.json）。
 * 指针文件名为 dsh_agent-1.json（contextKey 约定 dsh_<agent-id>）。
 */
function makeProject({
  configYaml = '',
  taskStatus = 'in_progress',
  withPointer = true,
} = {}) {
  const root = mkdtempSync(join(tmpdir(), 'workloom-dsh-gate-'))
  const workloomDir = join(root, '.workloom')
  mkdirSync(join(workloomDir, 'tasks', 't1'), { recursive: true })
  writeFileSync(join(workloomDir, 'config.yaml'), configYaml)
  writeFileSync(
    join(workloomDir, 'tasks', 't1', 'task.json'),
    JSON.stringify({ status: taskStatus, title: 'Test', priority: 'P2' }),
  )
  if (withPointer) {
    const sessionsDir = join(workloomDir, '.runtime', 'sessions')
    mkdirSync(sessionsDir, { recursive: true })
    writeFileSync(
      join(sessionsDir, 'dsh_agent-1.json'),
      JSON.stringify({ current_task: 'tasks/t1' }),
    )
  }
  return root
}

/**
 * 构造模拟 agent（覆盖 delegationDepthOf 读取的最小形状：
 * options.subagentDepth 与 session.header.delegationDepth）。
 */
function makeAgent(root, overrides = {}) {
  return {
    id: overrides.id ?? 'agent-1',
    options: { subagentDepth: overrides.subagentDepth, ...(overrides.options ?? {}) },
    session: {
      header: {
        cwd: overrides.cwd ?? root,
        delegationDepth: overrides.delegationDepth,
        ...(overrides.header ?? {}),
      },
    },
  }
}

/** 经 registerGate 捕获订阅回调（mock ctx，仅记录 listener）。 */
function captureHandler() {
  let handler
  const ctx = {
    on(event, listener) {
      assert.equal(event, 'tools/pre-execute')
      handler = listener
    },
  }
  registerGate(ctx)
  assert.equal(typeof handler, 'function', 'pre-execute listener must be registered')
  return handler
}

test('非写工具放行', () => {
  const root = makeProject()
  try {
    const decision = decideWriteGate({
      name: 'read',
      agent: makeAgent(root),
      filePath: 'src/main.ts',
    })
    assert.deepEqual(decision, { kind: 'allow' })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('子代理（depth >= 1）放行', () => {
  const root = makeProject()
  try {
    const decision = decideWriteGate({
      name: 'write',
      agent: makeAgent(root, { subagentDepth: 1 }),
      filePath: 'src/main.ts',
    })
    assert.deepEqual(decision, { kind: 'allow' })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('无项目根（cwd 不在 .workloom 项目内）放行', () => {
  const root = mkdtempSync(join(tmpdir(), 'workloom-dsh-gate-tree-'))
  try {
    const decision = decideWriteGate({
      name: 'write',
      agent: makeAgent(root),
      filePath: 'src/main.ts',
    })
    assert.deepEqual(decision, { kind: 'allow' })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('executor.gate: false 放行', () => {
  const root = makeProject({ configYaml: 'executor:\n  gate: false\n' })
  try {
    const decision = decideWriteGate({
      name: 'write',
      agent: makeAgent(root),
      filePath: 'src/main.ts',
    })
    assert.deepEqual(decision, { kind: 'allow' })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('无活动任务（会话指针缺失）放行', () => {
  const root = makeProject({ withPointer: false })
  try {
    const decision = decideWriteGate({
      name: 'write',
      agent: makeAgent(root),
      filePath: 'src/main.ts',
    })
    assert.deepEqual(decision, { kind: 'allow' })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('任务非 in_progress 放行', () => {
  const root = makeProject({ taskStatus: 'planning' })
  try {
    const decision = decideWriteGate({
      name: 'write',
      agent: makeAgent(root),
      filePath: 'src/main.ts',
    })
    assert.deepEqual(decision, { kind: 'allow' })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('.workloom/ 路径豁免（相对与绝对）', () => {
  const root = makeProject()
  try {
    const relative = decideWriteGate({
      name: 'write',
      agent: makeAgent(root),
      filePath: '.workloom/config.local.yaml',
    })
    assert.deepEqual(relative, { kind: 'allow' })
    const absolute = decideWriteGate({
      name: 'edit',
      agent: makeAgent(root),
      filePath: join(root, '.workloom', 'config.yaml'),
    })
    assert.deepEqual(absolute, { kind: 'allow' })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('命中 deny：主会话 + in_progress + 业务路径（文案含引导）', () => {
  const root = makeProject()
  try {
    const decision = decideWriteGate({
      name: 'write',
      agent: makeAgent(root),
      filePath: 'src/main.ts',
    })
    assert.equal(decision.kind, 'deny')
    const reason = /** @type {{ kind: 'deny', reason: string } } */ (decision).reason
    assert.ok(reason.includes('in_progress'), 'reason must mention task state')
    assert.ok(reason.includes('workloom_execute'), 'reason must guide to workloom_execute')
    assert.ok(
      reason.includes('executor.gate: false'),
      'reason must mention the config escape hatch',
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('防御放行：agent 缺失 / filePath 非 string / 空串', () => {
  const root = makeProject()
  try {
    const noAgent = decideWriteGate({ name: 'write', filePath: 'src/main.ts' })
    assert.deepEqual(noAgent, { kind: 'allow' })
    const noPath = decideWriteGate({ name: 'write', agent: makeAgent(root) })
    assert.deepEqual(noPath, { kind: 'allow' })
    const badPath = decideWriteGate({ name: 'write', agent: makeAgent(root), filePath: 42 })
    assert.deepEqual(badPath, { kind: 'allow' })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('绝对业务路径同样被 deny', () => {
  const root = makeProject()
  try {
    const decision = decideWriteGate({
      name: 'edit',
      agent: makeAgent(root),
      filePath: join(root, 'src', 'main.ts'),
    })
    assert.equal(decision.kind, 'deny')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('判定故障（config.yaml 非法）：registerGate 兜底 warn + 放行', async () => {
  const root = makeProject({ configYaml: 'executor:\n  gate: not-a-boolean\n' })
  const warns = []
  const originalWarn = console.warn
  console.warn = (...args) => warns.push(args.join(' '))
  try {
    const handler = captureHandler()
    const decision = await handler(
      { name: 'write', agent: makeAgent(root), arguments: { file_path: 'src/main.ts' } },
      () => Promise.resolve({ kind: 'allow' }),
    )
    assert.deepEqual(decision, { kind: 'allow' })
    assert.equal(warns.length, 1, 'failure must be warned exactly once')
    assert.ok(warns[0].includes('workloom: write gate skipped:'), 'warn must carry gate prefix')
  } finally {
    console.warn = originalWarn
    rmSync(root, { recursive: true, force: true })
  }
})

test('task.json 损坏：readTask 返回 err 时静默放行（不 warn）', () => {
  const root = makeProject()
  mkdirSync(join(root, '.workloom', 'tasks', 't1'), { recursive: true })
  writeFileSync(join(root, '.workloom', 'tasks', 't1', 'task.json'), '{broken json')
  try {
    const decision = decideWriteGate({
      name: 'write',
      agent: makeAgent(root),
      filePath: 'src/main.ts',
    })
    assert.deepEqual(decision, { kind: 'allow' })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
