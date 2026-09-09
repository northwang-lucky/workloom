/**
 * pi-child-registry.ts 单测：进程内表 + 落盘进程表、孤儿清理。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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
  cleanupSessionFiles,
  persistEmptyRegistry,
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

test('registerChild: 登记后可通过 getChild 获取', () => {
  const root = mkdtempSync(join(tmpdir(), 'workloom-pi-registry-'))
  try {
    const entry = makeEntry(root, 12345)
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
    const entry = makeEntry(root, 12346)
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
    registerChild('s3', makeEntry(root, 12347))
    registerChild('s4', makeEntry(root, 12348))
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
    registerChild('s5', makeEntry(root, 12349))
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
    registerChild('s6', makeEntry(root, 12350))
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

// ---- ownerPid 守卫回归测试 ----

test('cleanupOrphans: ownerPid 存活时条目保留（不误杀）', () => {
  const root = mkdtempSync(join(tmpdir(), 'workloom-pi-registry-'))
  try {
    // 写入 ownerPid = 当前进程 pid（存活）的条目。
    const dir = sessionsDir(root)
    mkdirSync(dir, { recursive: true })
    writeFileSync(
      registryPath(root),
      JSON.stringify({ entries: [{ ownerPid: process.pid, pid: 99999, sessionId: 'alive', startedAt: '2024-01-01T00:00:00Z' }] }),
    )
    cleanupOrphans(root)
    // ownerPid 存活 → 条目保留。
    const parsed = JSON.parse(readFileSync(registryPath(root), 'utf8'))
    assert.equal(parsed.entries.length, 1, 'ownerPid 存活时条目应保留')
    assert.equal(parsed.entries[0].sessionId, 'alive')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('cleanupOrphans: ownerPid 已死时条目被回收', () => {
  const root = mkdtempSync(join(tmpdir(), 'workloom-pi-registry-'))
  try {
    // 写入 ownerPid = 99999（不存在）的条目。
    const dir = sessionsDir(root)
    mkdirSync(dir, { recursive: true })
    writeFileSync(
      registryPath(root),
      JSON.stringify({ entries: [{ ownerPid: 99999, pid: 88888, sessionId: 'dead-owner', startedAt: '2024-01-01T00:00:00Z' }] }),
    )
    cleanupOrphans(root)
    // ownerPid 已死 → 条目被回收。
    const parsed = JSON.parse(readFileSync(registryPath(root), 'utf8'))
    assert.equal(parsed.entries.length, 0, 'ownerPid 已死时条目应被回收')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('cleanupOrphans: 无 ownerPid 旧格式条目被回收（向后兼容）', () => {
  const root = mkdtempSync(join(tmpdir(), 'workloom-pi-registry-'))
  try {
    // 写入无 ownerPid 的旧格式条目。
    const dir = sessionsDir(root)
    mkdirSync(dir, { recursive: true })
    writeFileSync(
      registryPath(root),
      JSON.stringify({ entries: [{ pid: 77777, sessionId: 'old-format', startedAt: '2024-01-01T00:00:00Z' }] }),
    )
    cleanupOrphans(root)
    // 无 ownerPid → 视为孤儿，条目被回收。
    const parsed = JSON.parse(readFileSync(registryPath(root), 'utf8'))
    assert.equal(parsed.entries.length, 0, '无 ownerPid 旧格式条目应被回收')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

// ---- cleanupSessionFiles（R1 归档清理对账） ----

test('cleanupSessionFiles: 命中 childId 前缀的文件被删除', () => {
  const root = mkdtempSync(join(tmpdir(), 'workloom-pi-registry-'))
  try {
    const dir = sessionsDir(root)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'abc123.json'), '{"sessionId":"abc123"}')
    writeFileSync(join(dir, 'abc123.jsonl'), 'line1\n')
    writeFileSync(join(dir, 'other.json'), '{"sessionId":"other"}')
    cleanupSessionFiles(root, ['abc123'])
    assert.ok(!existsSync(join(dir, 'abc123.json')), 'abc123.json 应被删除')
    assert.ok(!existsSync(join(dir, 'abc123.jsonl')), 'abc123.jsonl 应被删除')
    assert.ok(existsSync(join(dir, 'other.json')), '未命中的 other.json 应保留')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('cleanupSessionFiles: 精确匹配 childId（无扩展名）的文件被删除', () => {
  const root = mkdtempSync(join(tmpdir(), 'workloom-pi-registry-'))
  try {
    const dir = sessionsDir(root)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'exact-id'), 'data')
    cleanupSessionFiles(root, ['exact-id'])
    assert.ok(!existsSync(join(dir, 'exact-id')), '精确匹配的 exact-id 应被删除')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('cleanupSessionFiles: 未命中的文件保留（不误删）', () => {
  const root = mkdtempSync(join(tmpdir(), 'workloom-pi-registry-'))
  try {
    const dir = sessionsDir(root)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'keep.json'), 'keep')
    cleanupSessionFiles(root, ['nonexistent'])
    assert.ok(existsSync(join(dir, 'keep.json')), '未命中的 keep.json 应保留')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('cleanupSessionFiles: 空 childId 列表不操作', () => {
  const root = mkdtempSync(join(tmpdir(), 'workloom-pi-registry-'))
  try {
    const dir = sessionsDir(root)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'file.json'), 'data')
    cleanupSessionFiles(root, [])
    assert.ok(existsSync(join(dir, 'file.json')), '空列表时文件应保留')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('cleanupSessionFiles: 目录不存在时不报错', () => {
  const root = mkdtempSync(join(tmpdir(), 'workloom-pi-registry-'))
  try {
    assert.doesNotThrow(() => cleanupSessionFiles(root, ['abc']))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('cleanupSessionFiles: 删除失败仅 WARNING 不抛错（不阻塞归档）', () => {
  const root = mkdtempSync(join(tmpdir(), 'workloom-pi-registry-'))
  // 捕获 console.warn，验证失败走 WARNING 且不向归档路径抛错（R4 要求的失败分支）。
  const warnings: string[] = []
  const originalWarn = console.warn
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map(String).join(' '))
  }
  try {
    const dir = sessionsDir(root)
    // 用与 childId 同名的目录制造 rmSync 失败（ERR_FS_EISDIR，权限无关、运行器无关）。
    mkdirSync(join(dir, 'stub-id'), { recursive: true })
    assert.doesNotThrow(() => cleanupSessionFiles(root, ['stub-id']))
    assert.ok(
      warnings.some((w) => w.includes('failed to remove session file')),
      '删除失败应输出 WARNING',
    )
  } finally {
    console.warn = originalWarn
    rmSync(root, { recursive: true, force: true })
  }
})

// ---- persistEmptyRegistry（R3 shutdown 清表） ----

test('persistEmptyRegistry: 写入空表覆盖既有条目', () => {
  const root = mkdtempSync(join(tmpdir(), 'workloom-pi-registry-'))
  try {
    // 先写入非空注册表。
    const dir = sessionsDir(root)
    mkdirSync(dir, { recursive: true })
    writeFileSync(
      registryPath(root),
      JSON.stringify({ entries: [{ ownerPid: 1, pid: 2, sessionId: 'x', startedAt: '2024-01-01T00:00:00Z' }] }),
    )
    persistEmptyRegistry(root)
    const parsed = JSON.parse(readFileSync(registryPath(root), 'utf8'))
    assert.equal(parsed.entries.length, 0, 'persistEmptyRegistry 后应为空表')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('persistEmptyRegistry: 首次落盘同写自守护 .gitignore（存量项目兜底）', () => {
  const root = mkdtempSync(join(tmpdir(), 'workloom-pi-registry-'))
  try {
    // 目录尚不存在时直接调用：应建目录 + 落自守护 .gitignore（R2 兜底分支）。
    persistEmptyRegistry(root)
    const guard = join(sessionsDir(root), '.gitignore')
    assert.ok(existsSync(guard), '应落自守护 .gitignore')
    assert.equal(readFileSync(guard, 'utf8'), '*\n', '自守护 .gitignore 应忽略本目录全部产物')
    // 幂等：已存在时不重复写、不报错。
    assert.doesNotThrow(() => persistEmptyRegistry(root))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
