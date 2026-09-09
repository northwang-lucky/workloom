/**
 * executor-continuation.ts 单测：同 kind 校验、跨 kind 拒绝、rebind 拒绝、
 * latest 定位、重启续接参数组装。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ChildProcess } from 'node:child_process'
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'

import { CONTINUE_REBIND_REJECT_TEXT } from '@workloom-ai/core'

import {
  continueExecutor,
  locateContinueChildId,
  readSpawnBinding,
} from '../src/executor-continuation.ts'
import { buildChildPiArgs } from '../src/pi-args.ts'
import { registerChild, unregisterChild } from '../src/pi-child-registry.ts'
import type { RpcConnection } from '../src/pi-rpc.ts'

/** 创建临时项目根并写入含 dispatches 的 task.json。 */
function makeTaskRoot(
  dispatches: Array<{
    kind: string
    title: string
    childId?: string
    model?: string
    effort?: string
    modelSource?: string
  }>,
): { root: string; taskRelPath: string } {
  const root = mkdtempSync(join(tmpdir(), 'workloom-pi-continuation-'))
  const taskRelPath = 'tasks/09-01-demo'
  const taskDir = join(root, '.workloom', taskRelPath)
  mkdirSync(taskDir, { recursive: true })
  writeFileSync(
    join(taskDir, 'task.json'),
    JSON.stringify({ id: 't-1', name: 'demo', title: 'Demo', overrides: [], dispatches }),
  )
  return { root, taskRelPath }
}

// ---- locateContinueChildId ----

test('locateContinueChildId: latest 取同 kind 最近一条 childId', () => {
  const { root, taskRelPath } = makeTaskRoot([
    { kind: 'implement', title: 'first', childId: 's1' },
    { kind: 'research', title: 'r1', childId: 's2' },
    { kind: 'implement', title: 'second', childId: 's3' },
  ])
  try {
    const [err, childId] = locateContinueChildId(root, taskRelPath, 'implement', 'latest')
    assert.equal(err, null)
    assert.equal(childId, 's3')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('locateContinueChildId: 显式 childId 按记录校验（同 kind 通过）', () => {
  const { root, taskRelPath } = makeTaskRoot([
    { kind: 'implement', title: 'first', childId: 's1' },
  ])
  try {
    const [err, childId] = locateContinueChildId(root, taskRelPath, 'implement', 's1')
    assert.equal(err, null)
    assert.equal(childId, 's1')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('locateContinueChildId: 跨 kind 拒绝', () => {
  const { root, taskRelPath } = makeTaskRoot([
    { kind: 'research', title: 'r1', childId: 's1' },
  ])
  try {
    const [err, childId] = locateContinueChildId(root, taskRelPath, 'implement', 's1')
    assert.ok(err !== null)
    assert.match(err, /cross-kind reuse rejected/)
    assert.match(err, /belongs to a research dispatch/)
    assert.match(err, /this call is kind implement/)
    assert.equal(childId, '')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('locateContinueChildId: 无记录返回提示', () => {
  const { root, taskRelPath } = makeTaskRoot([])
  try {
    const [err, childId] = locateContinueChildId(root, taskRelPath, 'implement', 'nonexistent')
    assert.ok(err !== null)
    assert.match(err, /no dispatch record with childId "nonexistent"/)
    assert.equal(childId, '')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('locateContinueChildId: latest 无同 kind 记录返回提示', () => {
  const { root, taskRelPath } = makeTaskRoot([
    { kind: 'research', title: 'r1', childId: 's1' },
  ])
  try {
    const [err, childId] = locateContinueChildId(root, taskRelPath, 'implement', 'latest')
    assert.ok(err !== null)
    assert.match(err, /no previous implement executor dispatch/)
    assert.equal(childId, '')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

// ---- readSpawnBinding ----

test('readSpawnBinding: 读取首次派发记录的绑定值', () => {
  const { root, taskRelPath } = makeTaskRoot([
    { kind: 'implement', title: 'first', childId: 's1', model: 'p/m', effort: 'high' },
  ])
  try {
    const binding = readSpawnBinding(root, taskRelPath, 's1')
    assert.ok(binding !== null)
    assert.equal(binding?.model, 'p/m')
    assert.equal(binding?.effort, 'high')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('readSpawnBinding: 旧记录无绑定字段返回 null', () => {
  const { root, taskRelPath } = makeTaskRoot([
    { kind: 'implement', title: 'first', childId: 's1' },
  ])
  try {
    const binding = readSpawnBinding(root, taskRelPath, 's1')
    assert.equal(binding, null)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('readSpawnBinding: 无匹配 childId 返回 null', () => {
  const { root, taskRelPath } = makeTaskRoot([
    { kind: 'implement', title: 'first', childId: 's1' },
  ])
  try {
    const binding = readSpawnBinding(root, taskRelPath, 'nonexistent')
    assert.equal(binding, null)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

// ---- CONTINUE_REBIND_REJECT_TEXT ----

test('CONTINUE_REBIND_REJECT_TEXT: 共享拒绝文案关键片段', () => {
  assert.match(CONTINUE_REBIND_REJECT_TEXT, /continue_executor cannot be combined with model\/effort/)
  assert.match(CONTINUE_REBIND_REJECT_TEXT, /sendMessage has no rebinding seam/)
  assert.match(CONTINUE_REBIND_REJECT_TEXT, /dispatch a new executor without continue_executor/)
})

// ---- 重启续接参数组装（--session id + --name 保持） ----

test('buildChildPiArgs: sessionParam 插入 --session <id>（续用重启）', () => {
  const args = buildChildPiArgs({
    kind: 'implement',
    root: '/tmp/test',
    title: 'fix bug',
    sessionParam: 'abc123',
  })
  // --mode rpc 后紧跟 --session <id>。
  assert.deepEqual(args.slice(0, 4), ['--mode', 'rpc', '--session', 'abc123'])
  // --name 保持原标题。
  assert.ok(args.includes('--name'))
  const nameIdx = args.indexOf('--name')
  assert.equal(args[nameIdx + 1], '[Implement] fix bug')
})

test('buildChildPiArgs: 无 sessionParam 时不出现 --session（新派）', () => {
  const args = buildChildPiArgs({
    kind: 'implement',
    root: '/tmp/test',
    title: 'new task',
  })
  assert.equal(args.includes('--session'), false)
  assert.deepEqual(args.slice(0, 2), ['--mode', 'rpc'])
})

// ---- continueExecutor 分支 3：重启续接失败留痕（R4 纪律，与首派同口径） ----

test('continueExecutor: 重启续接 spawn 失败 → dispatches 留痕 failed + fail loud', async () => {
  const { root, taskRelPath } = makeTaskRoot([
    { kind: 'research', title: 'first', childId: 's-old' },
  ])
  const originalBin = process.env.PI_BIN
  process.env.PI_BIN = '/nonexistent/pi-for-continuation-test'
  try {
    await assert.rejects(
      continueExecutor({
        pi: { sendMessage: () => {}, on: () => {} } as unknown as ExtensionAPI,
        kind: 'research',
        title: 'again',
        root,
        taskRelPath,
        loadExtensions: [],
        parentSessionId: 'main',
        effective: { sources: {} },
        gate: { forced: false },
        allowInfo: { allow: ['read'], childHasLsp: false },
        piBuilt: {
          hasLsp: false,
          result: { text: 'full', stats: { filesInlined: 0, truncated: 0, filesPointed: 0 } },
        },
        childId: 's-old',
        incrementalPrompt: 'more work',
        reinject: false,
        globalLimit: 0,
        kindLimit: undefined,
      }),
      /ENOENT/,
    )
    const task = JSON.parse(
      readFileSync(join(root, '.workloom', taskRelPath, 'task.json'), 'utf8'),
    ) as { dispatches: Array<{ status?: string; childId?: string; kind?: string; error?: string }> }
    const failed = task.dispatches.find((d) => d.status === 'failed')
    assert.ok(failed !== undefined, 'failed 条目已留痕')
    assert.equal(failed.childId, 's-old')
    assert.equal(failed.kind, 'research')
    assert.match(String(failed.error), /ENOENT/)
  } finally {
    process.env.PI_BIN = originalBin
    rmSync(root, { recursive: true, force: true })
  }
})

// ---- get_state 探测失败 → 重启路径（P1-2 缺陷回归） ----

test('continueExecutor: get_state 探测失败 → fall through 到分支 3 重启（不向死连接发 prompt）', async () => {
  const { root, taskRelPath } = makeTaskRoot([
    { kind: 'implement', title: 'first', childId: 's-dead' },
  ])
  // 注册一个 running 条目（有 connection），但 get_state 会失败（模拟进程已死且 close 未及触发）。
  const promptCalls: Array<{ type: string; message?: string }> = []
  const deadConnection: RpcConnection = {
    sendCommand: async (cmd: { type: string; message?: string }) => {
      if (cmd.type === 'get_state') {
        throw new Error('socket hang up: connection lost')
      }
      // 记录 prompt/steer 调用（若缺陷存在，会被调用）。
      promptCalls.push(cmd)
      return { type: 'response', command: cmd.type, success: true, data: {} }
    },
    onEvent: () => {},
    close: () => {},
  }
  registerChild('s-dead', {
    child: { pid: 99999, kill: () => {} } as unknown as ChildProcess,
    kind: 'implement',
    root,
    taskRelPath,
    parentSessionId: 'main',
    status: 'running',
    startedAt: new Date().toISOString(),
    connection: deadConnection,
  })
  const originalBin = process.env.PI_BIN
  process.env.PI_BIN = '/nonexistent/pi-for-get-state-fail-test'
  try {
    // 缺陷存在时：get_state 失败 → isStreaming 恒 false → 走分支 1 向死连接发 prompt → 正常返回（不抛错）。
    // 修复后：get_state 失败 → getStateFailed = true → fall through 到分支 3 重启 → spawn ENOENT 抛错。
    await assert.rejects(
      continueExecutor({
        pi: { sendMessage: () => {}, on: () => {} } as unknown as ExtensionAPI,
        kind: 'implement',
        title: 'again',
        root,
        taskRelPath,
        loadExtensions: [],
        parentSessionId: 'main',
        effective: { sources: {} },
        gate: { forced: false },
        allowInfo: { allow: ['read'], childHasLsp: false },
        piBuilt: {
          hasLsp: false,
          result: { text: 'full', stats: { filesInlined: 0, truncated: 0, filesPointed: 0 } },
        },
        childId: 's-dead',
        incrementalPrompt: 'more work',
        reinject: false,
        globalLimit: 0,
        kindLimit: undefined,
      }),
      /ENOENT/,
    )
    // 验证未向死连接发 prompt/steer（走了分支 3 重启而非分支 1）。
    assert.equal(promptCalls.length, 0, 'get_state 失败不应向死连接发 prompt/steer')
  } finally {
    process.env.PI_BIN = originalBin
    unregisterChild('s-dead')
    rmSync(root, { recursive: true, force: true })
  }
})
