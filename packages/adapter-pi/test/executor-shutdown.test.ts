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

/** 创建 mock RPC 连接。 */
function mockConnection(): RpcConnection {
  return {
    sendCommand: async () => ({ type: 'response', command: 'get_state', success: true }),
    onEvent: () => {},
    close: () => {},
  }
}

/** 创建 mock child 进程。 */
function mockChild(pid: number): ChildProcess {
  const stdout = new PassThrough()
  const stdin = new Writable({ write(_chunk, _enc, cb) { cb() } })
  return { stdout, stdin, pid, kill: () => {} } as unknown as ChildProcess
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
