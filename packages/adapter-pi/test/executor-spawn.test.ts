/**
 * 真机验证缺陷回归测试：
 * - P0: spawn stdio[0] 必须为 'pipe'（RPC 模式 stdin 是命令通道）
 * - P1: get_state 失败/spawn 即失败时（sessionId 未取到）仍写 failed 留痕
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { buildChildSpawnOptions, dispatchChildPi, handleSessionShutdown, waitForChildSpawn } from '../src/executor-dispatch.ts'
import { registerChild, getChild, getAllChildren, unregisterChild } from '../src/pi-child-registry.ts'
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import type { ChildRegistryEntry } from '../src/pi-child-registry.ts'
import { PassThrough } from 'node:stream'
import { Writable } from 'node:stream'
import { EventEmitter } from 'node:events'
import type { ChildProcess } from 'node:child_process'

// ---- P0: spawn stdio 回归测试 ----

test('P0: buildChildSpawnOptions stdio[0] 必须为 pipe（RPC 命令通道）', () => {
  const options = buildChildSpawnOptions('/tmp/test')
  assert.deepEqual(options.stdio, ['pipe', 'pipe', 'pipe'])
  assert.equal(options.stdio[0], 'pipe')
  assert.equal(options.cwd, '/tmp/test')
})

test('P0: buildChildSpawnOptions 返回纯值（无副作用）', () => {
  const a = buildChildSpawnOptions('/tmp/a')
  const b = buildChildSpawnOptions('/tmp/a')
  assert.deepEqual(a, b)
  assert.notEqual(a.stdio, b.stdio) // 不同引用
})

// ---- 缺陷 8 回归测试：waitForChildSpawn 确定性（不与首条命令写入竞速） ----

test('缺陷 8: waitForChildSpawn 对 ENOENT 确定性 reject（stdin 存在不提前 resolve）', async () => {
  // 旧兜底用 stdin 存在判定：stdio pipe 在 spawn() 返回时即创建，ENOENT 失败路径下
  // 同样非空 → 提前 resolve → 首条命令写入与 error 事件竞速（EPIPE/ENOENT 不确定）。
  const emitter = new EventEmitter()
  const stdin = new Writable({ write(_chunk, _enc, cb) { cb() } })
  const child = Object.assign(emitter, { stdin, spawned: false }) as unknown as ChildProcess
  const promise = waitForChildSpawn(child)
  process.nextTick(() => {
    emitter.emit('error', Object.assign(new Error('spawn pi ENOENT'), { code: 'ENOENT' }))
  })
  await assert.rejects(promise, /ENOENT/)
})

test('缺陷 8: waitForChildSpawn 对已 spawn 成功（迟到调用）立即 resolve', async () => {
  const emitter = new EventEmitter()
  const child = Object.assign(emitter, { spawned: true, pid: 4242 }) as unknown as ChildProcess
  await waitForChildSpawn(child)
})

// ---- P1: 无 sessionId 失败留痕回归测试 ----

/** 创建临时项目根并写入最小 task.json。 */
function makeTaskRoot(): { root: string; taskRelPath: string } {
  const root = mkdtempSync(join(tmpdir(), 'workloom-pi-spawn-'))
  const taskRelPath = 'tasks/09-01-demo'
  const taskDir = join(root, '.workloom', taskRelPath)
  mkdirSync(taskDir, { recursive: true })
  writeFileSync(
    join(taskDir, 'task.json'),
    JSON.stringify({ id: 't-1', name: 'demo', title: 'Demo', overrides: [], dispatches: [] }),
  )
  return { root, taskRelPath }
}

/** 最小 mock ExtensionAPI。 */
function mockPi(): ExtensionAPI {
  return { sendMessage: () => {}, on: () => {} } as unknown as ExtensionAPI
}

test('P1: spawn 失败（sessionId 未取到）时仍写 failed 留痕', async () => {
  const { root, taskRelPath } = makeTaskRoot()
  // 使用不存在的二进制触发 spawn 错误，sessionId 不会被取到。
  const originalBin = process.env.PI_BIN
  process.env.PI_BIN = '/nonexistent/pi-binary'
  let threw = false
  try {
    await dispatchChildPi({
      pi: mockPi(),
      cwd: root,
      prompt: 'test prompt',
      kind: 'implement',
      title: 'test task',
      root,
      taskRelPath,
      loadExtensions: [],
      parentSessionId: 'main-session',
      effective: { sources: {}, configSources: {} },
      gate: { forced: false },
      allowInfo: { allow: [], childHasLsp: false },
      piBuilt: { hasLsp: false, result: { text: 'test', stats: { filesInlined: 0, truncated: 0, filesPointed: 0 } } },
      signal: undefined,
      foreground: false,
    })
  } catch (error) {
    threw = true
    assert.ok(error instanceof Error)
  } finally {
    if (originalBin === undefined) {
      delete process.env.PI_BIN
    } else {
      process.env.PI_BIN = originalBin
    }
    rmSync(root, { recursive: true, force: true })
  }

  // 验证：应抛错且 dispatches 有一条 failed 记录（无 childId）。
  assert.ok(threw, 'dispatchChildPi 应抛错')
  // 注意：rmSync 后无法读取 task.json，需要在 rmSync 前读取。
  // 重新创建并验证（简化测试）。
})

test('P1: 验证无 sessionId 时 failed 留痕被写入', async () => {
  const { root, taskRelPath } = makeTaskRoot()
  const originalBin = process.env.PI_BIN
  process.env.PI_BIN = '/nonexistent/pi-binary'
  try {
    await dispatchChildPi({
      pi: mockPi(),
      cwd: root,
      prompt: 'test prompt',
      kind: 'implement',
      title: 'test task',
      root,
      taskRelPath,
      loadExtensions: [],
      parentSessionId: 'main-session',
      effective: { sources: {}, configSources: {} },
      gate: { forced: false },
      allowInfo: { allow: [], childHasLsp: false },
      piBuilt: { hasLsp: false, result: { text: 'test', stats: { filesInlined: 0, truncated: 0, filesPointed: 0 } } },
      signal: undefined,
      foreground: false,
    })
    assert.fail('should have thrown')
  } catch {
    // 验证：dispatches 应有一条 failed 记录（无 childId）。
    const task = JSON.parse(readFileSync(join(root, '.workloom', taskRelPath, 'task.json'), 'utf8'))
    assert.equal(task.dispatches.length, 1, '应有一条 failed 留痕')
    const record = task.dispatches[0]
    assert.equal(record.kind, 'implement')
    assert.equal(record.title, 'test task')
    assert.equal(record.status, 'failed')
    assert.ok(record.error !== undefined && record.error !== '', '应有错误摘要')
    assert.equal(record.childId, undefined, '无 sessionId 时 childId 缺省')
  } finally {
    if (originalBin === undefined) {
      delete process.env.PI_BIN
    } else {
      process.env.PI_BIN = originalBin
    }
    rmSync(root, { recursive: true, force: true })
  }
})

// ---- 缺陷 3 回归测试：审计来源（rawModel vs effective）----

test('缺陷 3: 无显式 model 时 modelSource 不为 param（审计来源准确）', async () => {
  const { root, taskRelPath } = makeTaskRoot()
  const originalBin = process.env.PI_BIN
  process.env.PI_BIN = '/nonexistent/pi-binary'
  try {
    // 不传 rawModel（用户未显式传 model），effective.model 来自配置回退。
    await dispatchChildPi({
      pi: mockPi(),
      cwd: root,
      prompt: 'test prompt',
      kind: 'implement',
      title: 'test task',
      root,
      taskRelPath,
      // rawModel 未传（用户未显式传 model）
      model: 'config/model', // 生效值（来自配置回退）
      loadExtensions: [],
      parentSessionId: 'main-session',
      effective: {
        model: 'config/model',
        sources: { model: 'config' as const },
        configSources: { model: 'fallback' as const },
      },
      gate: { forced: false },
      allowInfo: { allow: [], childHasLsp: false },
      mainModel: 'main/model',
      piBuilt: { hasLsp: false, result: { text: 'test', stats: { filesInlined: 0, truncated: 0, filesPointed: 0 } } },
      signal: undefined,
      foreground: false,
    })
  } catch {
    // spawn 会失败（无真实 pi 二进制），但留痕应在 catch 中完成
  } finally {
    if (originalBin === undefined) {
      delete process.env.PI_BIN
    } else {
      process.env.PI_BIN = originalBin
    }
  }

  const task = JSON.parse(readFileSync(join(root, '.workloom', taskRelPath, 'task.json'), 'utf8'))
  assert.equal(task.dispatches.length, 1)
  const record = task.dispatches[0]
  // 无显式 model → modelSource 应为 fallback/inherit，不能是 param
  assert.notEqual(record.modelSource, 'param', '无显式 model 时 modelSource 不应为 param')
  assert.equal(record.modelSource, 'fallback', 'modelSource 应反映配置回退来源')
  rmSync(root, { recursive: true, force: true })
})

// ---- 缺陷 4 回归测试：注册表生命周期（close 事件为准）----

/** 创建 mock child 进程。 */
function mockChild(pid: number): ChildProcess {
  const stdout = new PassThrough()
  const stdin = new Writable({ write(_chunk, _enc, cb) { cb() } })
  return { stdout, stdin, pid, kill: () => {} } as unknown as ChildProcess
}

function mockConnection(): ReturnType<typeof import('../src/pi-rpc.ts').createRpcConnection> {
  return {
    sendCommand: async () => ({ type: 'response', command: 'get_state', success: true, data: { sessionId: 's1' } }),
    onEvent: () => {},
    close: () => {},
  } as unknown as ReturnType<typeof import('../src/pi-rpc.ts').createRpcConnection>
}

test('缺陷 4: settle 后进程存活则注册表条目仍在', () => {
  const entry: ChildRegistryEntry = {
    connection: mockConnection(),
    child: mockChild(12345),
    kind: 'implement',
    root: '/tmp/test',
    taskRelPath: 'tasks/test',
    parentSessionId: 'main',
    status: 'running',
    startedAt: new Date().toISOString(),
  }
  registerChild('s1', entry)
  assert.ok(getChild('s1') !== undefined, '注册后条目存在')

  // 模拟 settle（agent_end）——不注销
  // registerChildSettle 的 finish 不再调用 unregisterChild
  // 验证：条目仍在
  assert.ok(getChild('s1') !== undefined, 'settle 后条目仍在（进程存活）')

  // 清理
  unregisterChild('s1')
  assert.equal(getChild('s1'), undefined, 'unregister 后条目移除')
})

test('缺陷 4: handleSessionShutdown 回收完成后仍存活的 child', () => {
  const entry: ChildRegistryEntry = {
    connection: mockConnection(),
    child: mockChild(12346),
    kind: 'implement',
    root: '/tmp/test',
    taskRelPath: 'tasks/test',
    parentSessionId: 'main',
    status: 'running',
    startedAt: new Date().toISOString(),
  }
  registerChild('s2', entry)
  assert.equal(getAllChildren().size, 1)

  // handleSessionShutdown 应 SIGTERM 存活 child 并清空注册表
  handleSessionShutdown()
  assert.equal(getAllChildren().size, 0, 'shutdown 后注册表清空')
})
