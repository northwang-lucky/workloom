/**
 * 并发竞态回归测试：验证容量闸判定→provisional 登记全程同步无 await。
 *
 * 真机缺陷：三连派发（间隔 20-30ms）全部放行。
 * 根因：registerProvisionalEntry 放在 await waitForChildSpawn 之后，await 让出事件循环，
 * 后续派发在 registry 空窗期全部通过闸判定。
 *
 * 修复后顺序：spawn() → registerProvisionalEntry()（同步）→ await waitForChildSpawn()。
 * 本测试用 deferred spawn（无 pid，waitForChildSpawn 等待 'spawn' 事件）模拟时序，
 * 验证第一个派发在 await 点挂起时，第二个派发被容量闸拒绝。
 */

import { mock } from 'bun:test'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { Writable } from 'node:stream'
import { EventEmitter } from 'node:events'
import type { ChildProcess } from 'node:child_process'
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'

import { dispatchChildPi } from '../src/executor-dispatch.ts'
import type { RpcConnection } from '../src/pi-rpc.ts'
import { getAllChildren, unregisterChild } from '../src/pi-child-registry.ts'

// 清理注册表（测试间隔离：promoted 条目在 child 退出前保留）
function clearRegistry(): void {
  for (const [id] of getAllChildren()) unregisterChild(id)
  deferredQueue.length = 0
}

// ---- deferred spawn 模拟 ----

interface DeferredController {
  child: ChildProcess
  resolveSpawn: () => void
}

const deferredQueue: DeferredController[] = []

function createDeferredChild(): DeferredController {
  const emitter = new EventEmitter()
  const stdout = new PassThrough()
  const stdin = new Writable({ write(_chunk, _enc, cb) { cb() } })
  const stderr = new PassThrough()
  let resolved = false
  const controller: DeferredController = {
    child: Object.assign(emitter, {
      stdout,
      stdin,
      stderr,
      pid: undefined, // 无 pid → waitForChildSpawn 等待 'spawn' 事件
      kill: () => {},
    }) as unknown as ChildProcess,
    resolveSpawn: () => {
      if (resolved) return
      resolved = true
      emitter.emit('spawn')
    },
  }
  deferredQueue.push(controller)
  return controller
}

// mock spawn：返回 deferred child（无 pid，不立即 resolve）
mock.module('node:child_process', () => ({
  spawn: () => createDeferredChild().child,
}))

function mockConnection(): RpcConnection {
  return {
    sendCommand: async () => ({ type: 'response', command: 'get_state', success: true, data: { sessionId: 'real-session-id' } }),
    onEvent: () => {},
    close: () => {},
  }
}
mock.module('../src/pi-rpc.ts', () => ({
  createRpcConnection: () => mockConnection(),
}))

function mockPi(): ExtensionAPI {
  return { sendMessage: () => {}, on: () => {} } as unknown as ExtensionAPI
}

function makeTaskRoot(): { root: string; taskRelPath: string } {
  const root = mkdtempSync(join(tmpdir(), 'workloom-pi-race-'))
  const taskRelPath = 'tasks/09-01-demo'
  const taskDir = join(root, '.workloom', taskRelPath)
  mkdirSync(taskDir, { recursive: true })
  writeFileSync(
    join(taskDir, 'task.json'),
    JSON.stringify({ id: 't-1', name: 'demo', title: 'Demo', overrides: [], dispatches: [] }),
  )
  return { root, taskRelPath }
}

function makeDispatchParams(root: string, taskRelPath: string, kind: string) {
  return {
    pi: mockPi(),
    cwd: root,
    prompt: 'test prompt',
    kind,
    title: `${kind} task`,
    root,
    taskRelPath,
    loadExtensions: [],
    parentSessionId: 'main-session',
    effective: { sources: {}, configSources: {} },
    gate: { forced: false },
    allowInfo: { allow: [], childHasLsp: false },
    piBuilt: { hasLsp: false, result: { text: 'test', stats: { filesInlined: 0, truncated: 0, filesPointed: 0 } } },
    signal: undefined,
    globalLimit: 1,
    kindLimit: undefined,
  }
}

// ---- 测试 ----

test('竞态核心：第一个派发 await 点挂起时，第二个派发被容量闸拒绝', async () => {
  clearRegistry()
  const { root, taskRelPath } = makeTaskRoot()
  try {
    // 启动第一个派发（不 await）：通过闸 → 预留 provisional →  await waitForChildSpawn（挂起）
    const firstPromise = dispatchChildPi(makeDispatchParams(root, taskRelPath, 'implement'))

    // 第一个派发已同步执行到 await 点：provisional 应已登记
    const { readRunningFromRegistry } = await import('../src/executor-capacity-gate.ts')
    const runningAfterFirst = readRunningFromRegistry()
    assert.equal(runningAfterFirst.length, 1, '第一个派发应已同步登记 provisional')

    // 第二个派发：registry 有 provisional → 应被容量闸拒绝（不 spawn、不写 dispatches）
    await assert.rejects(
      dispatchChildPi(makeDispatchParams(root, taskRelPath, 'research')),
      /at capacity \(1\/1\)/,
      '第二个派发应被拒绝',
    )

    // 释放第一个派发的 spawn 锁：让它继续执行（get_state → promote → prompt）
    const controller = deferredQueue[0]
    assert.ok(controller !== undefined, '应有 deferred spawn 控制器')
    controller.resolveSpawn()

    // 第一个派发应完成（get_state 返回 sessionId，promote 成功）
    await firstPromise

    // 验证第一个派发写了一条 dispatch 记录
    const task = JSON.parse(
      readFileSync(join(root, '.workloom', taskRelPath, 'task.json'), 'utf8'),
    ) as { dispatches: Array<{ kind: string; status?: string }> }
    const running = task.dispatches.filter((d) => d.status === 'running')
    assert.equal(running.length, 1, '应有一条 running dispatch（第一个派发）')
    assert.equal(running[0]!.kind, 'implement')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('时序证明：闸判定→登记之间无 await（同步）', async () => {
  clearRegistry()
  const { root, taskRelPath } = makeTaskRoot()
  try {
    // 启动第一个派发
    const firstPromise = dispatchChildPi(makeDispatchParams(root, taskRelPath, 'implement'))

    // 同步检查：在第一个派发 await 期间，provisional 已登记
    // 这证明了 registerProvisionalEntry 在 await 之前执行
    const { readRunningFromRegistry } = await import('../src/executor-capacity-gate.ts')
    assert.equal(readRunningFromRegistry().length, 1)

    // 释放 spawn 锁并等待第一个派发完成
    deferredQueue[0]!.resolveSpawn()
    await firstPromise

    // 第一个派发完成后，registry 应仍有 promoted 条目（running 状态）
    // （settle 监听异步运行，条目保留至 child 退出）
    assert.equal(readRunningFromRegistry().length, 1)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
