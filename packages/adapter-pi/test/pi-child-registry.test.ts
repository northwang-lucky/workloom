/**
 * pi-child-registry.ts 单测：进程内表 + 落盘进程表、孤儿清理。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { Writable } from 'node:stream'
import type { ChildProcess } from 'node:child_process'

import {
  registerChild,
  unregisterChild,
  getChild,
  getAllChildren,
  cleanupOrphans,
  sessionsDir,
  registryPath,
  type ChildRegistryEntry,
} from '../src/pi-child-registry.ts'
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

/** 创建 registry 条目。 */
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

test('registerChild: 登记后可通过 getChild 获取', () => {
  const root = mkdtempSync(join(tmpdir(), 'workloom-pi-registry-'))
  try {
    const entry = makeEntry('s1', root, 12345)
    registerChild('s1', entry)
    const got = getChild('s1')
    assert.ok(got !== undefined)
    assert.equal(got?.kind, 'implement')
    assert.equal(got?.root, root)
    assert.equal(got?.parentSessionId, 'main-session')
  } finally {
    unregisterChild('s1')
    rmSync(root, { recursive: true, force: true })
  }
})

test('unregisterChild: 移除后 getChild 返回 undefined', () => {
  const root = mkdtempSync(join(tmpdir(), 'workloom-pi-registry-'))
  try {
    const entry = makeEntry('s2', root, 12346)
    registerChild('s2', entry)
    assert.ok(getChild('s2') !== undefined)
    unregisterChild('s2')
    assert.equal(getChild('s2'), undefined)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('getAllChildren: 返回全部存活 child', () => {
  const root = mkdtempSync(join(tmpdir(), 'workloom-pi-registry-'))
  try {
    registerChild('s3', makeEntry('s3', root, 12347))
    registerChild('s4', makeEntry('s4', root, 12348))
    const all = getAllChildren()
    assert.equal(all.size, 2)
    assert.ok(all.has('s3'))
    assert.ok(all.has('s4'))
  } finally {
    unregisterChild('s3')
    unregisterChild('s4')
    rmSync(root, { recursive: true, force: true })
  }
})

test('落盘进程表: registerChild 后 registry.json 写入条目', () => {
  const root = mkdtempSync(join(tmpdir(), 'workloom-pi-registry-'))
  try {
    registerChild('s5', makeEntry('s5', root, 12349))
    const path = registryPath(root)
    const parsed = JSON.parse(readFileSync(path, 'utf8'))
    assert.ok(Array.isArray(parsed.entries))
    assert.equal(parsed.entries.length, 1)
    assert.equal(parsed.entries[0].sessionId, 's5')
    assert.equal(parsed.entries[0].pid, 12349)
  } finally {
    unregisterChild('s5')
    rmSync(root, { recursive: true, force: true })
  }
})

test('落盘进程表: unregisterChild 后 registry.json 移除条目', () => {
  const root = mkdtempSync(join(tmpdir(), 'workloom-pi-registry-'))
  try {
    registerChild('s6', makeEntry('s6', root, 12350))
    unregisterChild('s6')
    const path = registryPath(root)
    const parsed = JSON.parse(readFileSync(path, 'utf8'))
    assert.equal(parsed.entries.length, 0)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('cleanupOrphans: 清理残留落盘进程表（pid 不存在时不报错）', () => {
  const root = mkdtempSync(join(tmpdir(), 'workloom-pi-registry-'))
  try {
    // 手动写入残留条目（pid 99999 不存在）。
    const dir = sessionsDir(root)
    mkdirSync(dir, { recursive: true })
    writeFileSync(
      registryPath(root),
      JSON.stringify({ entries: [{ pid: 99999, sessionId: 'ghost', startedAt: '2024-01-01T00:00:00Z' }] }),
    )
    // 清理不应抛错（pid 不存在时 process.kill 抛 ESRCH，被忽略）。
    assert.doesNotThrow(() => cleanupOrphans(root))
    // 清理后 registry.json 应为空表。
    const parsed = JSON.parse(readFileSync(registryPath(root), 'utf8'))
    assert.equal(parsed.entries.length, 0)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
