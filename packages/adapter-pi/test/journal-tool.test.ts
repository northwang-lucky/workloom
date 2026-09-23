/**
 * adapter-pi journal 工具：schema 投影（taskPath 必填）与缺参透传 core 权威校验。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'

import { PARAM_DESCRIPTIONS } from '@workloom-ai/core'

import { registerJournalTool } from '../src/journal-tool.ts'

/** 捕获的工具定义最小形状（仅消费 registerTool 写入的 name/parameters/execute）。 */
interface CapturedTool {
  name: string
  parameters: {
    properties: Record<string, unknown>
    required?: string[]
  }
  execute: (
    toolCallId: string,
    params: unknown,
    signal: unknown,
    onUpdate: unknown,
    ctx: unknown,
  ) => Promise<unknown>
}

/** 构造模拟 pi，捕获注册的工具定义（注入面仅消费 registerTool）。 */
function makePi(): { pi: ExtensionAPI; registered: CapturedTool[] } {
  const registered: CapturedTool[] = []
  const pi = {
    registerTool(def: CapturedTool) {
      registered.push(def)
      return () => {}
    },
  } as unknown as ExtensionAPI
  return { pi, registered }
}

/** TypeBox v1 的返回类型不含 schema options（description 仅运行时保留），显式收窄读取。 */
function readDescription(schema: unknown): string | undefined {
  return (schema as { description?: string }).description
}

test('journal 工具 schema：taskPath 必填，描述引用 taskPathRequired', () => {
  const { pi, registered } = makePi()
  registerJournalTool(pi)
  const def = registered[0]
  assert.ok(def, 'journal tool must be registered')
  assert.equal(def.name, 'workloom_journal')
  assert.ok(def.parameters.required?.includes('taskPath'), 'taskPath must be required')
  assert.ok(def.parameters.required?.includes('title'), 'title must be required')
  assert.equal(readDescription(def.parameters.properties.taskPath), PARAM_DESCRIPTIONS.taskPathRequired)
})

test('journal 工具缺 taskPath：透传 core 权威校验拒绝（schema required 只是投影）', async () => {
  const { pi, registered } = makePi()
  registerJournalTool(pi)
  const def = registered[0]
  assert.ok(def, 'journal tool must be registered')
  // 非空 cwd 走到 core 的必填校验；任务存在性校验在其后，本用例不触盘。
  const ctx = { cwd: '/tmp/workloom-journal-no-project' }
  await assert.rejects(
    () => def.execute('call-1', { title: 'No TaskPath' }, undefined, undefined, ctx),
    /taskPath is required/,
  )
})
