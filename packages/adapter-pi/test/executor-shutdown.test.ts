/**
 * handleSessionShutdown 单测：主会话结束联动（回填 failed + 清理注册表）。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { Writable } from 'node:stream'
import { EventEmitter } from 'node:events'
import type { ChildProcess } from 'node:child_process'

import { recordExecutorDispatch } from '@workloom-ai/core'

import {
  registerChild,
  getChild,
  getAllChildren,
  type ChildRegistryEntry,
} from '../src/pi-child-registry.ts'
import { handleSessionShutdown } from '../src/executor-dispatch.ts'
import type { RpcConnection } from '../src/pi-rpc.ts'

/** 创建 mock RPC 连接（支持触发事件回调）。 */
function mockConnection(): RpcConnection & { _triggerEvent: (event: Record<string, unknown>) => void } {
  let eventCb: ((event: Record<string, unknown>) => void) | undefined
  const conn = {
    sendCommand: async () => ({ type: 'response', command: 'get_state', success: true }),
    onEvent: (cb: (event: Record<string, unknown>) => void) => {
      eventCb = cb
    },
    close: () => {},
    _triggerEvent: (event: Record<string, unknown>) => {
      if (eventCb) eventCb(event)
    },
  }
  return conn as unknown as RpcConnection & { _triggerEvent: (event: Record<string, unknown>) => void }
}

/** 创建 mock child 进程（EventEmitter 子类，支持 emit/on）。 */
function mockChild(pid: number): ChildProcess {
  const emitter = new EventEmitter()
  const stdout = new PassThrough()
  const stdin = new Writable({ write(_chunk, _enc, cb) { cb() } })
  const stderr = new PassThrough()
  return Object.assign(emitter, { stdout, stdin, stderr, pid, kill: () => {} }) as unknown as ChildProcess
}

function makeEntry(sessionId: string, root: string, pid: number): ChildRegistryEntry {
  return {
    connection: mockConnection(),
    child: mockChild(pid),
    kind: 'implement',
    root,
    taskRelPath: 'tasks/09-01-demo',
    parentSessionId: 'main-session',
    status: 'running',
    startedAt: new Date().toISOString(),
  }
}

/** 创建临时项目根并写入最小 task.json。 */
function makeTaskRoot(): { root: string; taskRelPath: string } {
  const root = mkdtempSync(join(tmpdir(), 'workloom-pi-shutdown-'))
  const taskRelPath = 'tasks/09-01-demo'
  const taskDir = join(root, '.workloom', taskRelPath)
  mkdirSync(taskDir, { recursive: true })
  writeFileSync(
    join(taskDir, 'task.json'),
    JSON.stringify({ id: 't-1', name: 'demo', title: 'Demo', overrides: [], dispatches: [] }),
  )
  return { root, taskRelPath }
}

test('handleSessionShutdown: 回填全部 running child 为 failed + 清理注册表', () => {
  const { root, taskRelPath } = makeTaskRoot()
  try {
    // 登记两个 child。
    registerChild('s1', makeEntry('s1', root, 11111))
    registerChild('s2', makeEntry('s2', root, 22222))
    assert.equal(getAllChildren().size, 2)

    // 先写 running 记录（模拟派发时刻）。
    recordExecutorDispatch(root, taskRelPath, { kind: 'implement', title: 't1', childId: 's1' })
    recordExecutorDispatch(root, taskRelPath, { kind: 'implement', title: 't2', childId: 's2' })

    // 触发主会话结束联动。
    handleSessionShutdown()

    // 注册表应被清空。
    assert.equal(getAllChildren().size, 0)
    assert.equal(getChild('s1'), undefined)
    assert.equal(getChild('s2'), undefined)

    // dispatches 应回填 failed（摘要 host session ended）。
    const task = JSON.parse(readFileSync(join(root, '.workloom', taskRelPath, 'task.json'), 'utf8'))
    assert.equal(task.dispatches.length, 2)
    for (const d of task.dispatches) {
      assert.equal(d.status, 'failed')
      assert.equal(d.error, 'host session ended')
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('handleSessionShutdown: 空注册表时不报错', () => {
  assert.doesNotThrow(() => handleSessionShutdown())
  assert.equal(getAllChildren().size, 0)
})

// ---- 缺陷 6 回归测试：同 childId 多条 running 全部 settle ----

import { registerChildSettle } from '../src/executor-settle.ts'

test('缺陷 6: 同 childId 两条 running 经一次 settle 全部变 completed', () => {
  const { root, taskRelPath } = makeTaskRoot()
  try {
    // 写两条同 childId 的 running 条目（模拟首派 + steering 续用）。
    recordExecutorDispatch(root, taskRelPath, { kind: 'implement', title: 'first', childId: 's1' })
    recordExecutorDispatch(root, taskRelPath, { kind: 'implement', title: 'steer', childId: 's1' })

    // 注册 settle（模拟 agent_end）。
    const entry = makeEntry('s1', root, 11111)
    registerChild('s1', entry)
    const conn = entry.connection as unknown as { _triggerEvent: (event: Record<string, unknown>) => void }
    registerChildSettle(
      { sendMessage: () => {}, on: () => {} } as unknown as import('@earendil-works/pi-coding-agent').ExtensionAPI,
      entry.connection,
      entry,
      's1',
      false,
    )

    // 触发 settle（agent_end 事件）。
    conn._triggerEvent({ type: 'agent_end' })

    // 验证：两条 running 全部变为 completed。
    const task = JSON.parse(readFileSync(join(root, '.workloom', taskRelPath, 'task.json'), 'utf8'))
    assert.equal(task.dispatches.length, 2)
    for (const d of task.dispatches) {
      assert.equal(d.status, 'completed', '同 childId 所有 running 条目应全部结算为 completed')
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('缺陷 6: failed 路径同 childId 多条 running 全部变 failed', () => {
  const { root, taskRelPath } = makeTaskRoot()
  try {
    // 写两条同 childId 的 running 条目。
    recordExecutorDispatch(root, taskRelPath, { kind: 'implement', title: 'first', childId: 's2' })
    recordExecutorDispatch(root, taskRelPath, { kind: 'implement', title: 'steer', childId: 's2' })

    // 注册 settle + 触发 close（failed 路径）。
    const entry = makeEntry('s2', root, 22222)
    registerChild('s2', entry)
    registerChildSettle(
      { sendMessage: () => {}, on: () => {} } as unknown as import('@earendil-works/pi-coding-agent').ExtensionAPI,
      entry.connection,
      entry,
      's2',
      false,
    )

    // 触发 close（failed 路径）。
    entry.child.emit('close', 1, null)

    // 验证：两条 running 全部变为 failed。
    const task = JSON.parse(readFileSync(join(root, '.workloom', taskRelPath, 'task.json'), 'utf8'))
    assert.equal(task.dispatches.length, 2)
    for (const d of task.dispatches) {
      assert.equal(d.status, 'failed', '同 childId 所有 running 条目应全部结算为 failed')
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
