/**
 * executeTool → dispatchChildPi 的 purpose 参数转发（公开面）。
 *
 * 真机缺陷：dispatchChildPi 已支持 purpose 并透传派发记录，但 executor.ts 的
 * dispatchChildPi({...}) 调用对象漏传 purpose，记录恒落 execution。本文件经
 * registerExecutorTool 注册的 workloom_execute 工具（executeTool 公开入口）驱动
 * 全链，断言派发记录的 purpose 来自工具参数。
 *
 * mock 纪律（与 executor-capacity-race.test.ts 同款）：spawn 与 RPC 的 mock.module
 * 必须置于文件顶部（模块图加载期注册、随文件隔离）；执行期动态 mock 会跨文件泄漏，
 * 破坏 pi-rpc/pi-child-registry 等真实行为测试。
 */

import { mock } from 'bun:test'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough, Writable } from 'node:stream'
import { EventEmitter } from 'node:events'
import * as realChildProcess from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'

import { computeCaseHash, readTask } from '@workloom-ai/core'
import { registerExecutorTool } from '../src/executor.ts'
import { unregisterChild } from '../src/pi-child-registry.ts'

const REL = 'tasks/demo'
const CASE_TEXT = '# CASE custom marker\n'

// ---- spawn / RPC stub（文件顶部注册：模块图加载期生效、文件间隔离） ----

function stubbedChild(): ChildProcess {
  const emitter = new EventEmitter()
  const child = Object.assign(emitter, {
    stdout: new PassThrough(),
    stdin: new Writable({ write(_chunk, _enc, cb) { cb() } }),
    stderr: new PassThrough(),
    pid: 4242,
    kill: () => true,
  }) as unknown as ChildProcess
  queueMicrotask(() => emitter.emit('spawn'))
  return child
}

mock.module('node:child_process', () => ({
  // 展开真模块：同图消费方（core git 的 execFile 等）不受影响。
  ...realChildProcess,
  spawn: () => stubbedChild(),
}))
mock.module('../src/pi-rpc.ts', () => ({
  createRpcConnection: () => ({
    // get_state → 固定 sessionId；prompt 投递沿用同一通用成功响应。
    sendCommand: async () => ({
      type: 'response',
      command: 'get_state',
      success: true,
      data: { sessionId: 'forwarded-session-id' },
    }),
    onEvent: () => {},
    close: () => {},
  }),
}))

// ---- 夹具 ----

function makeForwardRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'workloom-pi-forward-'))
  const dir = join(root, '.workloom', REL)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(root, '.workloom', 'config.json'), '{}')
  writeFileSync(join(dir, 'prd.md'), '# Demo\n\n## Requirements\n\n- R1: test\n\n## Acceptance Criteria\n\n- AC1: test\n')
  writeFileSync(join(dir, 'case.md'), CASE_TEXT)
  // 转发测试关注 purpose 透传：designSession 置空，避免「换设计会话需 fallbackOf
  // 链」保护拦截记录（该规则由 recordEntry 用例与 core 测试覆盖）。
  writeFileSync(join(dir, 'task.json'), JSON.stringify({
    title: 'Demo',
    status: 'in_progress',
    mode: 'full',
    case: {
      required: true,
      designSession: null,
      confirmedAt: null,
      caseHash: computeCaseHash(CASE_TEXT),
      summary: null,
      result: null,
    },
    children: [],
    dispatches: [],
    overrides: [],
    hooks: { after_create: [], after_start: [], after_finish: [], after_archive: [] },
  }))
  return root
}

function capturedExecuteTool(): { execute: (...args: unknown[]) => Promise<unknown> } {
  const registered: Record<string, { execute: (...args: unknown[]) => Promise<unknown> }> = {}
  const pi = {
    registerTool: (tool: { name: string; execute: (...args: unknown[]) => Promise<unknown> }) => {
      registered[tool.name] = tool
    },
    getActiveTools: () => [],
    sendMessage: () => {},
    on: () => {},
  } as unknown as ExtensionAPI
  registerExecutorTool(pi)
  const tool = registered['workloom_execute']
  assert.ok(tool, 'workloom_execute must be registered')
  return tool
}

// ---- 测试 ----

test('executeTool → dispatchChildPi 转发 purpose：case-design 记录留痕、缺省落 execution', async () => {
  const tool = capturedExecuteTool()
  const root = makeForwardRoot()
  try {
    const ctx = {
      cwd: root,
      sessionManager: { getSessionId: () => 'pi-forward' },
      signal: undefined,
    }
    // 显式 purpose=case-design：工具执行 → 派发记录透传该值（此前缺转发字段恒落 execution）
    const first = (await tool.execute(
      'c1',
      { kind: 'check', title: 'design', taskPath: REL, purpose: 'case-design', prompt: 'design' },
      undefined,
      undefined,
      ctx,
    )) as { details: { kind: string; status: string; childId: string } }
    assert.equal(first.details.kind, 'background')
    assert.equal(first.details.childId, 'forwarded-session-id')
    const [, taskAfterDesign] = readTask(root, REL)
    assert.ok(taskAfterDesign)
    const designRecord = taskAfterDesign.dispatches[0]
    assert.equal(designRecord?.purpose, 'case-design')
    assert.equal(designRecord?.kind, 'check')
    assert.equal(designRecord?.childId, 'forwarded-session-id')

    // 缺省（不传 purpose）→ 记录落 execution（向后兼容默认值）
    await tool.execute(
      'c2',
      { kind: 'check', title: 'execute', taskPath: REL, prompt: 'execute' },
      undefined,
      undefined,
      ctx,
    )
    const [, taskAfterDefault] = readTask(root, REL)
    assert.ok(taskAfterDefault)
    assert.equal(taskAfterDefault.dispatches[1]?.purpose, 'execution')
  } finally {
    // 注销本测试注册的 child（stub 进程永不退出）：注册表是进程级单例，
    // 残留 running 条目会污染后续容量闸测试的初始态。
    unregisterChild('forwarded-session-id')
    rmSync(root, { recursive: true, force: true })
  }
})
