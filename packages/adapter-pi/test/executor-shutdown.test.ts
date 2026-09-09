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
  unregisterChild,
  registryPath,
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

function makeEntry(root: string, pid: number): ChildRegistryEntry {
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
    registerChild('s1', makeEntry(root, 11111))
    registerChild('s2', makeEntry(root, 22222))
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
    const entry = makeEntry(root, 11111)
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
    const entry = makeEntry(root, 22222)
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

// ---- 缺陷 7 回归测试：取消终态 ----

test('缺陷 7: signal abort 后条目 failed + 摘要，随后 agent_end 不改写', () => {
  const { root, taskRelPath } = makeTaskRoot()
  try {
    recordExecutorDispatch(root, taskRelPath, { kind: 'implement', title: 't1', childId: 's7' })

    const entry = makeEntry(root, 77777)
    registerChild('s7', entry)
    const controller = new AbortController()
    const conn = entry.connection as unknown as { _triggerEvent: (event: Record<string, unknown>) => void }
    registerChildSettle(
      { sendMessage: () => {}, on: () => {} } as unknown as import('@earendil-works/pi-coding-agent').ExtensionAPI,
      entry.connection,
      entry,
      's7',
      false,
      controller.signal,
    )

    // 触发 abort（取消路径）。
    controller.abort()

    // 验证：条目 failed + 摘要。
    let task = JSON.parse(readFileSync(join(root, '.workloom', taskRelPath, 'task.json'), 'utf8'))
    assert.equal(task.dispatches[0].status, 'failed')
    assert.equal(task.dispatches[0].error, 'dispatch aborted by main session')

    // 随后到达的 agent_end 不应改写终态。
    conn._triggerEvent({ type: 'agent_end' })
    task = JSON.parse(readFileSync(join(root, '.workloom', taskRelPath, 'task.json'), 'utf8'))
    assert.equal(task.dispatches[0].status, 'failed', 'agent_end 不应改写取消终态')
    assert.equal(task.dispatches[0].error, 'dispatch aborted by main session')
  } finally {
    unregisterChild('s7')
    rmSync(root, { recursive: true, force: true })
  }
})

test('缺陷 7: 未取消时 agent_end 正常 completed 不被误标', () => {
  const { root, taskRelPath } = makeTaskRoot()
  try {
    recordExecutorDispatch(root, taskRelPath, { kind: 'implement', title: 't1', childId: 's8' })

    const entry = makeEntry(root, 88888)
    registerChild('s8', entry)
    const controller = new AbortController()
    const conn = entry.connection as unknown as { _triggerEvent: (event: Record<string, unknown>) => void }
    registerChildSettle(
      { sendMessage: () => {}, on: () => {} } as unknown as import('@earendil-works/pi-coding-agent').ExtensionAPI,
      entry.connection,
      entry,
      's8',
      false,
      controller.signal,
    )

    // 不取消，直接 agent_end。
    conn._triggerEvent({ type: 'agent_end' })

    // 验证：正常 completed。
    const task = JSON.parse(readFileSync(join(root, '.workloom', taskRelPath, 'task.json'), 'utf8'))
    assert.equal(task.dispatches[0].status, 'completed', '未取消时 agent_end 应正常 completed')
  } finally {
    unregisterChild('s8')
    rmSync(root, { recursive: true, force: true })
  }
})

// ---- R3: shutdown 后落盘注册表为空表 ----

test('handleSessionShutdown: sigtermAllAlive 后 registry.json 持久化为空表', () => {
  const { root } = makeTaskRoot()
  try {
    // 清理可能残留的全局 child（测试隔离：先 shutdown 清空历史残留）。
    handleSessionShutdown()
    // 登记两个 child（写入非空注册表）。
    registerChild('r1', makeEntry(root, 33333))
    registerChild('r2', makeEntry(root, 44444))
    // 确认注册表包含 r1、r2。
    const before = JSON.parse(readFileSync(registryPath(root), 'utf8'))
    const beforeIds = before.entries.map((e: { sessionId: string }) => e.sessionId).sort()
    assert.deepEqual(beforeIds, ['r1', 'r2'], 'shutdown 前注册表应含 r1、r2')

    // 触发主会话结束联动。
    handleSessionShutdown()

    // 进程内表应被清空。
    assert.equal(getAllChildren().size, 0)
    // 落盘注册表应为空表（R3 双层防线：shutdown 即时清空落盘）。
    const after = JSON.parse(readFileSync(registryPath(root), 'utf8'))
    assert.equal(after.entries.length, 0, 'shutdown 后落盘注册表应为空表')
  } finally {
    unregisterChild('r1')
    unregisterChild('r2')
    rmSync(root, { recursive: true, force: true })
  }
})

// ---- 容器 check P1 回归：续用二次注册 supersede 旧 settle（一次 run 一条报告） ----

test('supersede: 同 sessionId 二次注册后旧 settle 不再产生第二条报告', () => {
  const { root, taskRelPath } = makeTaskRoot()
  try {
    recordExecutorDispatch(root, taskRelPath, { kind: 'implement', title: 'first', childId: 'sup1' })
    const entry = makeEntry(root, 91111)
    registerChild('sup1', entry)
    let reports = 0
    const pi = {
      sendMessage: () => {
        reports++
      },
      on: () => {},
    } as unknown as import('@earendil-works/pi-coding-agent').ExtensionAPI
    const conn = entry.connection as unknown as { _triggerEvent: (event: Record<string, unknown>) => void }
    // 首派后台注册（旧 settle）。
    registerChildSettle(pi, entry.connection, entry, 'sup1', false)
    // steering 续用：同 connection/sessionId 二次注册（新 settle 应 supersede 旧的）。
    recordExecutorDispatch(root, taskRelPath, { kind: 'implement', title: 'steer', childId: 'sup1' })
    registerChildSettle(pi, entry.connection, entry, 'sup1', false)
    // run 结束：agent_end 只触发新 settle（单槽 onEvent 已被覆盖）。
    conn._triggerEvent({ type: 'agent_end' })
    assert.equal(reports, 1, 'agent_end 应只回投一条报告')
    // 旧 settle 的 close 监听不再产生第二条报告（superseded 后 settled 已置位）。
    entry.child.emit('close', 0, null)
    assert.equal(reports, 1, 'child close 后旧 settle 不得再回投（一次 run 一条报告）')
    // 两条 running 均经新 settle 循环回填。
    const task = JSON.parse(readFileSync(join(root, '.workloom', taskRelPath, 'task.json'), 'utf8'))
    assert.equal(task.dispatches.length, 2)
    for (const d of task.dispatches) {
      assert.equal(d.status, 'completed')
    }
  } finally {
    unregisterChild('sup1')
    rmSync(root, { recursive: true, force: true })
  }
})
