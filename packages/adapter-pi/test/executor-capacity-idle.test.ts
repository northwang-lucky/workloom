/**
 * idle 状态机单测：验证"完工常驻不占槽"语义。
 *
 * 真机缺陷：两个 SLOW child 的 task.json 留痕已 completed，但 registry 条目保留到
 * child 进程退出才 unregister，期间 status 仍 'running' → 容量闸把"干完活但常驻待续用"
 * 的 child 继续计槽，实测完成数分钟后新派发仍 at capacity (2/2)。
 *
 * 修复：settle 成功后置 idle（不计槽），续用 idle child 时置回 running（重新占槽）。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { Writable } from 'node:stream'
import type { ChildProcess } from 'node:child_process'

import {
  registerChild,
  unregisterChild,
  getAllChildren,
  updateChildStatus,
  type ChildRegistryEntry,
} from '../src/pi-child-registry.ts'
import type { RpcConnection } from '../src/pi-rpc.ts'
import { readRunningFromRegistry, checkExecutorCapacity } from '../src/executor-capacity-gate.ts'

function mockConnection(): RpcConnection {
  return {
    sendCommand: async () => ({ type: 'response', command: 'get_state', success: true }),
    onEvent: () => {},
    close: () => {},
  }
}

function mockChild(pid: number): ChildProcess {
  const stdout = new PassThrough()
  const stdin = new Writable({ write(_chunk, _enc, cb) { cb() } })
  const stderr = new PassThrough()
  return {
    stdout,
    stdin,
    stderr,
    pid,
    kill: () => {},
    on: () => {},
    once: () => {},
    emit: () => {},
  } as unknown as ChildProcess
}

function makeEntry(root: string, pid: number, kind: string, status: ChildRegistryEntry['status'] = 'running'): ChildRegistryEntry {
  return {
    connection: mockConnection(),
    child: mockChild(pid),
    kind,
    root,
    taskRelPath: 'tasks/09-01-demo',
    parentSessionId: 'main-session',
    status,
    startedAt: new Date().toISOString(),
  }
}

function makeTaskRoot(): { root: string; taskRelPath: string } {
  const root = mkdtempSync(join(tmpdir(), 'workloom-pi-idle-'))
  const taskRelPath = 'tasks/09-01-demo'
  const taskDir = join(root, '.workloom', taskRelPath)
  mkdirSync(taskDir, { recursive: true })
  writeFileSync(
    join(taskDir, 'task.json'),
    JSON.stringify({ id: 't-1', name: 'demo', title: 'Demo', overrides: [], dispatches: [] }),
  )
  return { root, taskRelPath }
}

// ---- idle 不计槽 ----

test('readRunningFromRegistry：idle 条目不计槽', () => {
  const root = mkdtempSync(join(tmpdir(), 'workloom-pi-idle-'))
  try {
    registerChild('s1', makeEntry(root, 30001, 'implement', 'running'))
    registerChild('s2', makeEntry(root, 30002, 'research', 'idle'))
    registerChild('s3', makeEntry(root, 30003, 'check', 'starting'))
    const running = readRunningFromRegistry()
    // running + starting 计槽，idle 不计
    assert.equal(running.length, 2)
    const ids = running.map((r) => r.childId).sort()
    assert.deepEqual(ids, ['s1', 's3'])
  } finally {
    unregisterChild('s1')
    unregisterChild('s2')
    unregisterChild('s3')
    rmSync(root, { recursive: true, force: true })
  }
})

test('容量闸：idle 不占槽 → 完工后新派发放行', () => {
  const root = mkdtempSync(join(tmpdir(), 'workloom-pi-idle-'))
  try {
    // 两个 idle 条目（已完工常驻）
    registerChild('s1', makeEntry(root, 30011, 'implement', 'idle'))
    registerChild('s2', makeEntry(root, 30012, 'research', 'idle'))
    // 全局上限 2：idle 不计槽 → 应放行
    const result = checkExecutorCapacity('check', 2, undefined)
    assert.equal(result.allow, true)
    assert.equal(result.globalCount, 0, 'idle 条目不计 globalCount')
  } finally {
    unregisterChild('s1')
    unregisterChild('s2')
    rmSync(root, { recursive: true, force: true })
  }
})

// ---- settle 成功 → idle ----

test('settle 成功：entry status 由 running 转 idle', () => {
  const root = mkdtempSync(join(tmpdir(), 'workloom-pi-idle-'))
  try {
    const entry = makeEntry(root, 30021, 'implement', 'running')
    registerChild('s2', entry)
    assert.equal(entry.status, 'running')

    // 模拟 settle 成功：agent_end → finish → updateChildStatus idle
    updateChildStatus('s2', 'idle')
    assert.equal(entry.status, 'idle')

    // idle 不计槽
    assert.equal(readRunningFromRegistry().length, 0)
  } finally {
    unregisterChild('s2')
    rmSync(root, { recursive: true, force: true })
  }
})

// ---- idle 续用 → 重新占槽 ----

test('idle 续用：updateChildStatus 置回 running → 重新占槽', () => {
  const root = mkdtempSync(join(tmpdir(), 'workloom-pi-idle-'))
  try {
    registerChild('s1', makeEntry(root, 30031, 'implement', 'idle'))
    // idle → 不占槽
    assert.equal(readRunningFromRegistry().length, 0)
    // 续用：置回 running
    updateChildStatus('s1', 'running')
    assert.equal(readRunningFromRegistry().length, 1, '续用后应重新占槽')
  } finally {
    unregisterChild('s1')
    rmSync(root, { recursive: true, force: true })
  }
})

// ---- idle child close 不误写 failed ----

test('idle 条目不占槽：两个完工 child 不影响新派发', () => {
  const { root } = makeTaskRoot()
  try {
    // 两个已完工常驻的 child（idle）
    registerChild('s1', makeEntry(root, 30041, 'implement', 'idle'))
    registerChild('s2', makeEntry(root, 30042, 'research', 'idle'))

    // 全局上限 2：idle 不计槽 → 新派发应放行
    const result = checkExecutorCapacity('check', 2, undefined)
    assert.equal(result.allow, true, 'idle 不占槽，新派发应放行')
    assert.equal(result.globalCount, 0, 'idle 条目不计入 globalCount')

    // 验证 idle 条目仍在注册表（常驻待续用）
    assert.equal(getAllChildren().size, 2)
  } finally {
    unregisterChild('s1')
    unregisterChild('s2')
    rmSync(root, { recursive: true, force: true })
  }
})

// ---- 状态机完整迁移 ----

test('状态机：starting → running → idle → running（续用）', () => {
  const root = mkdtempSync(join(tmpdir(), 'workloom-pi-idle-'))
  try {
    const entry = makeEntry(root, 30051, 'implement', 'starting')
    registerChild('s5', entry)

    // starting → running（promote）
    updateChildStatus('s5', 'running')
    assert.equal(readRunningFromRegistry().length, 1)

    // running → idle（settle 成功）
    updateChildStatus('s5', 'idle')
    assert.equal(readRunningFromRegistry().length, 0)

    // idle → running（续用）
    updateChildStatus('s5', 'running')
    assert.equal(readRunningFromRegistry().length, 1)
  } finally {
    unregisterChild('s5')
    rmSync(root, { recursive: true, force: true })
  }
})
