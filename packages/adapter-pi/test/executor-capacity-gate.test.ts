/**
 * executor-capacity-gate.ts 单测：注册表取数 + 并发容量闸判定矩阵。
 *
 * 覆盖 R4 判定矩阵：
 * - 达限拒绝（回执断言）
 * - 续用不误占/不误拒（excludeChildId）
 * - 显式 0 放行
 * - kind 取严
 * - 终态释放槽位
 * - dispatchChildPi / continueExecutor 入口达限拒绝（不 spawn、不写 dispatches）
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { Writable } from 'node:stream'
import type { ChildProcess } from 'node:child_process'
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'

import { checkExecutorCapacity, readRunningFromRegistry } from '../src/executor-capacity-gate.ts'
import {
  registerChild,
  unregisterChild,
  registerProvisionalEntry,
  promoteProvisionalEntry,
  releaseProvisionalEntry,
  generateProvisionalId,
  getAllChildren,
  type ChildRegistryEntry,
} from '../src/pi-child-registry.ts'
import type { RpcConnection } from '../src/pi-rpc.ts'
import { dispatchChildPi } from '../src/executor-dispatch.ts'
import { continueExecutor } from '../src/executor-continuation.ts'

/** 创建 mock RPC 连接。 */
function mockConnection(): RpcConnection {
  return {
    sendCommand: async () => ({ type: 'response', command: 'get_state', success: true }),
    onEvent: () => {},
    close: () => {},
  }
}

/** 创建 mock child 进程（含 settle 注册所需的 on/stderr）。 */
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
  } as unknown as ChildProcess
}

/** 创建 registry 条目。 */
function makeEntry(root: string, pid: number, kind: string): ChildRegistryEntry {
  return {
    connection: mockConnection(),
    child: mockChild(pid),
    kind,
    root,
    taskRelPath: 'tasks/09-01-demo',
    parentSessionId: 'main-session',
    status: 'running',
    startedAt: new Date().toISOString(),
  }
}

/** 创建临时项目根并写入最小 task.json。 */
function makeTaskRoot(): { root: string; taskRelPath: string } {
  const root = mkdtempSync(join(tmpdir(), 'workloom-pi-capacity-'))
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

// ---- 注册表取数 ----

test('readRunningFromRegistry: 仅计 running（占槽）条目', () => {
  const root = mkdtempSync(join(tmpdir(), 'workloom-pi-capacity-'))
  try {
    registerChild('s1', makeEntry(root, 10001, 'implement'))
    registerChild('s2', makeEntry(root, 10002, 'research'))
    const running = readRunningFromRegistry()
    assert.equal(running.length, 2)
    const ids = running.map((r) => r.childId).sort()
    assert.deepEqual(ids, ['s1', 's2'])
    const kinds = running.map((r) => r.kind).sort()
    assert.deepEqual(kinds, ['implement', 'research'])
  } finally {
    unregisterChild('s1')
    unregisterChild('s2')
    rmSync(root, { recursive: true, force: true })
  }
})

test('readRunningFromRegistry: 空注册表返回空数组', () => {
  // 确保无其他测试残留（注册表是模块级单例）。
  for (const [id] of getAllChildren()) unregisterChild(id)
  assert.equal(readRunningFromRegistry().length, 0)
})

// ---- 判定矩阵 ----

test('checkExecutorCapacity: 达限拒绝（全局闸 2/2）', () => {
  const root = mkdtempSync(join(tmpdir(), 'workloom-pi-capacity-'))
  try {
    registerChild('s1', makeEntry(root, 10011, 'implement'))
    registerChild('s2', makeEntry(root, 10012, 'research'))
    const result = checkExecutorCapacity('implement', 2, undefined)
    assert.equal(result.allow, false)
    assert.equal(result.layer, 'global')
    assert.equal(result.globalCount, 2)
    assert.equal(result.globalLimit, 2)
  } finally {
    unregisterChild('s1')
    unregisterChild('s2')
    rmSync(root, { recursive: true, force: true })
  }
})

test('checkExecutorCapacity: 显式 0 放行（全局不限）', () => {
  const root = mkdtempSync(join(tmpdir(), 'workloom-pi-capacity-'))
  try {
    registerChild('s1', makeEntry(root, 10021, 'implement'))
    registerChild('s2', makeEntry(root, 10022, 'research'))
    registerChild('s3', makeEntry(root, 10023, 'check'))
    const result = checkExecutorCapacity('implement', 0, undefined)
    assert.equal(result.allow, true)
    assert.equal(result.globalLimit, 0)
  } finally {
    unregisterChild('s1')
    unregisterChild('s2')
    unregisterChild('s3')
    rmSync(root, { recursive: true, force: true })
  }
})

test('checkExecutorCapacity: kind 取严（kind 闸 1/1 先于全局闸）', () => {
  const root = mkdtempSync(join(tmpdir(), 'workloom-pi-capacity-'))
  try {
    registerChild('s1', makeEntry(root, 10031, 'implement'))
    // kindLimit=1, globalLimit=4：同 kind 第二条应撞 kind 闸。
    const result = checkExecutorCapacity('implement', 4, 1)
    assert.equal(result.allow, false)
    assert.equal(result.layer, 'kind')
    assert.equal(result.kindCount, 1)
    assert.equal(result.kindLimit, 1)
  } finally {
    unregisterChild('s1')
    rmSync(root, { recursive: true, force: true })
  }
})

test('checkExecutorCapacity: 双层均未达限 → 放行', () => {
  const root = mkdtempSync(join(tmpdir(), 'workloom-pi-capacity-'))
  try {
    registerChild('s1', makeEntry(root, 10041, 'implement'))
    const result = checkExecutorCapacity('research', 2, 1)
    assert.equal(result.allow, true)
    assert.equal(result.globalCount, 1)
    assert.equal(result.kindCount, 0)
  } finally {
    unregisterChild('s1')
    rmSync(root, { recursive: true, force: true })
  }
})

test('checkExecutorCapacity: 续用排除目标 childId → 不误占槽', () => {
  const root = mkdtempSync(join(tmpdir(), 'workloom-pi-capacity-'))
  try {
    registerChild('s1', makeEntry(root, 10051, 'implement'))
    registerChild('s2', makeEntry(root, 10052, 'research'))
    // 续用 s1（implement），排除后全局在途 = 1（s2），未达限 2。
    const result = checkExecutorCapacity('implement', 2, undefined, 's1')
    assert.equal(result.allow, true)
    assert.equal(result.globalCount, 1)
  } finally {
    unregisterChild('s1')
    unregisterChild('s2')
    rmSync(root, { recursive: true, force: true })
  }
})

test('checkExecutorCapacity: 续用不排除 → 自占槽误拒（对照）', () => {
  const root = mkdtempSync(join(tmpdir(), 'workloom-pi-capacity-'))
  try {
    registerChild('s1', makeEntry(root, 10061, 'implement'))
    registerChild('s2', makeEntry(root, 10062, 'research'))
    // 不排除 s1：全局在途 = 2，达限 2 → 拒绝。
    const result = checkExecutorCapacity('implement', 2, undefined)
    assert.equal(result.allow, false)
    assert.equal(result.layer, 'global')
  } finally {
    unregisterChild('s1')
    unregisterChild('s2')
    rmSync(root, { recursive: true, force: true })
  }
})

test('checkExecutorCapacity: 终态释放槽位（unregister 后恢复可派发）', () => {
  const root = mkdtempSync(join(tmpdir(), 'workloom-pi-capacity-'))
  try {
    registerChild('s1', makeEntry(root, 10071, 'implement'))
    registerChild('s2', makeEntry(root, 10072, 'research'))
    // 达限 2 → 拒绝。
    assert.equal(checkExecutorCapacity('check', 2, undefined).allow, false)
    // 模拟终态释放 s1（unregister）。
    unregisterChild('s1')
    // 在途 = 1 → 放行。
    const result = checkExecutorCapacity('check', 2, undefined)
    assert.equal(result.allow, true)
    assert.equal(result.globalCount, 1)
  } finally {
    unregisterChild('s2')
    rmSync(root, { recursive: true, force: true })
  }
})

test('checkExecutorCapacity: 同 childId 多条记录合并占 1 槽', () => {
  const root = mkdtempSync(join(tmpdir(), 'workloom-pi-capacity-'))
  try {
    // 同一 childId 只占 1 槽（注册表 Map 保证 key 唯一，但验证语义）。
    registerChild('s1', makeEntry(root, 10081, 'implement'))
    const result = checkExecutorCapacity('implement', 1, undefined)
    assert.equal(result.globalCount, 1)
    assert.equal(result.allow, false)
    assert.equal(result.layer, 'global')
  } finally {
    unregisterChild('s1')
    rmSync(root, { recursive: true, force: true })
  }
})

// ---- dispatchChildPi 入口达限拒绝 ----

test('dispatchChildPi: 达限拒绝 → 抛 at capacity 错误、不 spawn、不写 dispatches', async () => {
  const { root, taskRelPath } = makeTaskRoot()
  const originalBin = process.env.PI_BIN
  process.env.PI_BIN = '/nonexistent/pi-binary'
  try {
    // 填满全局上限 2。
    registerChild('s1', makeEntry(root, 10091, 'implement'))
    registerChild('s2', makeEntry(root, 10092, 'research'))
    await assert.rejects(
      dispatchChildPi({
        pi: mockPi(),
        cwd: root,
        prompt: 'test prompt',
        kind: 'check',
        title: 'check task',
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
        globalLimit: 2,
        kindLimit: undefined,
      }),
      /at capacity \(2\/2\)/,
    )
    // 达限拒绝不应写 dispatches（task.json 仍为空）。
    const task = JSON.parse(
      readFileSync(join(root, '.workloom', taskRelPath, 'task.json'), 'utf8'),
    ) as { dispatches: unknown[] }
    assert.equal(task.dispatches.length, 0, '达限拒绝不应写 dispatches')
  } finally {
    if (originalBin === undefined) delete process.env.PI_BIN
    else process.env.PI_BIN = originalBin
    unregisterChild('s1')
    unregisterChild('s2')
    rmSync(root, { recursive: true, force: true })
  }
})

test('dispatchChildPi: 显式 0 放行 → spawn 失败但不抛 at capacity', async () => {
  const { root, taskRelPath } = makeTaskRoot()
  const originalBin = process.env.PI_BIN
  process.env.PI_BIN = '/nonexistent/pi-binary'
  try {
    registerChild('s1', makeEntry(root, 10101, 'implement'))
    registerChild('s2', makeEntry(root, 10102, 'research'))
    registerChild('s3', makeEntry(root, 10103, 'check'))
    // globalLimit=0 → 不限，应放行（随后因 spawn 失败抛 ENOENT，非 at capacity）。
    await assert.rejects(
      dispatchChildPi({
        pi: mockPi(),
        cwd: root,
        prompt: 'test prompt',
        kind: 'frontend',
        title: 'ui task',
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
        globalLimit: 0,
        kindLimit: undefined,
      }),
      /ENOENT/,
    )
  } finally {
    if (originalBin === undefined) delete process.env.PI_BIN
    else process.env.PI_BIN = originalBin
    unregisterChild('s1')
    unregisterChild('s2')
    unregisterChild('s3')
    rmSync(root, { recursive: true, force: true })
  }
})

// ---- continueExecutor 入口达限拒绝 ----

test('continueExecutor: 续用排除目标 childId → 不误拒（不抛 at capacity）', async () => {
  const { root, taskRelPath } = makeTaskRoot()
  try {
    // 填满全局上限 2（s1=implement 待续用, s2=research）。
    registerChild('s1', makeEntry(root, 10111, 'implement'))
    registerChild('s2', makeEntry(root, 10112, 'research'))
    // 续用 s1：排除后在途 = 1（s2），未达限 2 → 不应被 capacity 误拒。
    // child 存活（s1 在注册表）→ 走分支 1/2（不发 spawn），函数应正常返回。
    let errorMessage: string | undefined
    try {
      await continueExecutor({
        pi: mockPi(),
        kind: 'implement',
        title: 'again',
        root,
        taskRelPath,
        loadExtensions: [],
        parentSessionId: 'main-session',
        effective: { sources: {} },
        gate: { forced: false },
        allowInfo: { allow: ['read'], childHasLsp: false },
        piBuilt: {
          hasLsp: false,
          result: { text: 'full', stats: { filesInlined: 0, truncated: 0, filesPointed: 0 } },
        },
        childId: 's1',
        incrementalPrompt: 'more work',
        reinject: false,
        globalLimit: 2,
        kindLimit: undefined,
      })
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error)
    }
    assert.equal(errorMessage, undefined, `续用排除后不应被拒，但抛错: ${errorMessage ?? ''}`)
  } finally {
    unregisterChild('s1')
    unregisterChild('s2')
    rmSync(root, { recursive: true, force: true })
  }
})

// ---- 竞态修复：provisional 槽位 ----

test('provisional 占槽：starting 条目计入 readRunningFromRegistry', () => {
  const root = mkdtempSync(join(tmpdir(), 'workloom-pi-capacity-'))
  let id: string | undefined
  try {
    id = generateProvisionalId()
    const entry = makeEntry(root, 20001, 'implement')
    registerProvisionalEntry(id, entry)
    const running = readRunningFromRegistry()
    assert.equal(running.length, 1)
    assert.equal(running[0]!.kind, 'implement')
  } catch (error) {
    throw error instanceof Error ? error : new Error(String(error))
  } finally {
    if (id !== undefined) releaseProvisionalEntry(id)
    rmSync(root, { recursive: true, force: true })
  }
})

test('竞态核心：第一个派发停在 get_state（仅 provisional）→ 第二个派发被判 at capacity', () => {
  const root = mkdtempSync(join(tmpdir(), 'workloom-pi-capacity-'))
  let provId: string | undefined
  try {
    // 模拟第一个派发已通过容量闸、spawn 成功、正在等待 get_state：
    // registry 中只有 provisional 条目（starting）。
    provId = generateProvisionalId()
    registerProvisionalEntry(provId, makeEntry(root, 20011, 'implement'))
    // 全局上限 1：第二个派发应被拒绝（provisional 已占槽）。
    const result = checkExecutorCapacity('research', 1, undefined)
    assert.equal(result.allow, false)
    assert.equal(result.layer, 'global')
    assert.equal(result.globalCount, 1)
  } finally {
    if (provId !== undefined) releaseProvisionalEntry(provId)
    rmSync(root, { recursive: true, force: true })
  }
})

test('promote：provisional 提升为真实 sessionId（键替换 + status 转 running）', () => {
  const root = mkdtempSync(join(tmpdir(), 'workloom-pi-capacity-'))
  try {
    const provId = generateProvisionalId()
    registerProvisionalEntry(provId, makeEntry(root, 20021, 'implement'))
    // 提升前：provisional key 存在，sessionId key 不存在。
    assert.equal(getAllChildren().has(provId), true)
    assert.equal(getAllChildren().has('real-session-id'), false)
    // 提升。
    promoteProvisionalEntry(provId, 'real-session-id', mockConnection())
    // 提升后：provisional key 消失，sessionId key 存在且 status = running。
    assert.equal(getAllChildren().has(provId), false)
    const promoted = getAllChildren().get('real-session-id')
    assert.ok(promoted !== undefined)
    assert.equal(promoted!.status, 'running')
    assert.equal(promoted!.connection !== undefined, true)
  } finally {
    unregisterChild('real-session-id')
    rmSync(root, { recursive: true, force: true })
  }
})

test('release：失败路径释放 provisional → 槽位恢复可派发', () => {
  const root = mkdtempSync(join(tmpdir(), 'workloom-pi-capacity-'))
  try {
    const provId = generateProvisionalId()
    registerProvisionalEntry(provId, makeEntry(root, 20031, 'implement'))
    // 上限 1，已占 → 拒绝。
    assert.equal(checkExecutorCapacity('research', 1, undefined).allow, false)
    // 释放 provisional（模拟 spawn 失败）。
    releaseProvisionalEntry(provId)
    // 槽位恢复 → 放行。
    const result = checkExecutorCapacity('research', 1, undefined)
    assert.equal(result.allow, true)
    assert.equal(result.globalCount, 0)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('dispatchChildPi 失败路径释放 provisional（spawn ENOENT 后槽位恢复）', async () => {
  const { root, taskRelPath } = makeTaskRoot()
  const originalBin = process.env.PI_BIN
  process.env.PI_BIN = '/nonexistent/pi-binary'
  try {
    // 上限 1：派发应通过容量闸（registry 空），但 spawn 失败。
    await assert.rejects(
      dispatchChildPi({
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
        globalLimit: 1,
        kindLimit: undefined,
      }),
      /ENOENT/,
    )
    // provisional 已释放 → registry 空 → 再次派发应通过容量闸（仍败于 spawn ENOENT）。
    await assert.rejects(
      dispatchChildPi({
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
        globalLimit: 1,
        kindLimit: undefined,
      }),
      /ENOENT/,
    )
  } finally {
    if (originalBin === undefined) delete process.env.PI_BIN
    else process.env.PI_BIN = originalBin
    rmSync(root, { recursive: true, force: true })
  }
})

test('continueExecutor: 续用达限（不排除场景对照）→ 抛 at capacity', async () => {
  const { root, taskRelPath } = makeTaskRoot()
  const originalBin = process.env.PI_BIN
  process.env.PI_BIN = '/nonexistent/pi-binary'
  try {
    // 填满全局上限 2。
    registerChild('s1', makeEntry(root, 10121, 'implement'))
    registerChild('s2', makeEntry(root, 10122, 'research'))
    // 续用 s1 但 kindLimit=0（不限 kind），全局 2/2 达限。
    // 排除 s1 后在途 = 1 → 放行；此处验证 kind 闸达限场景。
    // 注册第三条同 kind 使 kind 达限（但注册表 key 唯一，改用 kindLimit=0 + globalLimit=1）。
    // 排除 s1 后在途 = 1（s2），globalLimit=1 → 达限。
    await assert.rejects(
      continueExecutor({
        pi: mockPi(),
        kind: 'implement',
        title: 'again',
        root,
        taskRelPath,
        loadExtensions: [],
        parentSessionId: 'main-session',
        effective: { sources: {} },
        gate: { forced: false },
        allowInfo: { allow: ['read'], childHasLsp: false },
        piBuilt: {
          hasLsp: false,
          result: { text: 'full', stats: { filesInlined: 0, truncated: 0, filesPointed: 0 } },
        },
        childId: 's1',
        incrementalPrompt: 'more work',
        reinject: false,
        globalLimit: 1,
        kindLimit: undefined,
      }),
      /at capacity \(1\/1\)/,
    )
  } finally {
    if (originalBin === undefined) delete process.env.PI_BIN
    else process.env.PI_BIN = originalBin
    unregisterChild('s1')
    unregisterChild('s2')
    rmSync(root, { recursive: true, force: true })
  }
})

test('continueExecutor: idle 续用 get_state 失败 → 翻转回滚为 idle 不留陈旧占槽 + fall through 到重启分支', async () => {
  const root = mkdtempSync(join(tmpdir(), 'workloom-pi-capacity-'))
  // 连接已死（sendCommand 全部拒绝）的 idle 条目。
  const deadConnection: RpcConnection = {
    sendCommand: async () => {
      throw new Error('connection dead')
    },
    onEvent: () => {},
    close: () => {},
  }
  const entry: ChildRegistryEntry = {
    ...makeEntry(root, 10201, 'implement'),
    connection: deadConnection,
    status: 'idle',
  }
  registerChild('s-idle', entry)
  const originalBin = process.env.PI_BIN
  process.env.PI_BIN = '/nonexistent/pi-for-get-state-fail-capacity-test'
  try {
    // 修复后：get_state 失败 → fall through 到分支 3 重启 → spawn ENOENT 抛错
    //（不再走分支 1 向死连接发 prompt，避免连接异常被吞）。
    await assert.rejects(
      continueExecutor({
        pi: mockPi(),
        kind: 'implement',
        title: 'again',
        root,
        taskRelPath: 'tasks/09-01-demo',
        loadExtensions: [],
        parentSessionId: 'main-session',
        effective: { sources: {} },
        gate: { forced: false },
        allowInfo: { allow: ['read'], childHasLsp: false },
        piBuilt: {
          hasLsp: false,
          result: { text: 'full', stats: { filesInlined: 0, truncated: 0, filesPointed: 0 } },
        },
        childId: 's-idle',
        incrementalPrompt: 'more work',
        reinject: false,
        globalLimit: 2,
        kindLimit: undefined,
      }),
      /ENOENT/,
    )
    // get_state 探测失败即回滚 idle→running：条目不占槽（未落成陈旧 running）。
    const after = getAllChildren().get('s-idle')
    assert.ok(after !== undefined)
    assert.equal(after!.status, 'idle')
    assert.equal(readRunningFromRegistry().length, 0)
  } finally {
    process.env.PI_BIN = originalBin
    unregisterChild('s-idle')
    rmSync(root, { recursive: true, force: true })
  }
})
