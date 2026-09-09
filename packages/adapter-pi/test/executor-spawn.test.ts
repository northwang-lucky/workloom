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

import { buildChildSpawnOptions, dispatchChildPi } from '../src/executor-dispatch.ts'
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'

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
