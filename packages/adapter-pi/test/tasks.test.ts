/**
 * adapter-pi 任务工具单测：create 参数 schema 含 parent（可选字符串）且 executeCreate 转发到
 * core，子任务落盘 parent 字段并联动父 children（真实 core 集成，同 executor.test.ts 集成风格）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'

import { createTask, PARAM_DESCRIPTIONS } from '@workloom-ai/core'

import { registerTaskTools } from '../src/tasks.ts'

/** TypeBox v1 的返回类型不含 schema options（description 仅运行时保留），显式收窄读取。 */
function readDescription(schema: unknown): string | undefined {
  return (schema as { description?: string }).description
}

/** 捕获的工具定义最小形状（仅消费 registerTaskTools 写入的 name/parameters/execute）。 */
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

/** 注册任务工具并返回 create 工具定义（六个工具中第一个注册的）。 */
function setupCreateTool(): CapturedTool {
  const { pi, registered } = makePi()
  registerTaskTools(pi)
  const def = registered[0]
  assert.ok(def, 'create tool must be registered')
  assert.equal(def.name, 'workloom_task_create')
  return def
}

/** 构造模拟工具执行上下文（cwd + 会话 id）。 */
function makeCtx(root: string): unknown {
  return { cwd: root, sessionManager: { getSessionId: () => 'pi-tasks-1' } }
}

/** 读取任务目录下的 task.json（目录相对 .workloom）。 */
function readTaskJson(root: string, taskRelPath: string): Record<string, unknown> {
  return JSON.parse(
    readFileSync(join(root, '.workloom', taskRelPath, 'task.json'), 'utf8'),
  ) as Record<string, unknown>
}

test('TASK_CREATE_PARAMS schema 含 parent 可选字符串（描述引用 PARAM_DESCRIPTIONS.parent）', () => {
  const def = setupCreateTool()
  const props = def.parameters.properties
  const parent = props.parent as { type?: string; description?: string } | undefined
  assert.ok(parent, 'parent param must be present')
  assert.equal(parent.type, 'string')
  assert.equal(readDescription(props.parent), PARAM_DESCRIPTIONS.parent)
  assert.ok(!def.parameters.required?.includes('parent'), 'parent must be optional')
})

test('executeCreate 转发 parent：子任务落盘 parent 字段且父 children 联动', async () => {
  const root = mkdtempSync(join(tmpdir(), 'workloom-pi-tasks-'))
  mkdirSync(join(root, '.workloom'))
  try {
    const [, parent] = await createTask(root, { title: 'Parent' })
    assert.ok(parent)
    const def = setupCreateTool()
    const ctx = makeCtx(root)
    const child = await def.execute(
      'call-1',
      { title: 'Child', parent: parent.taskRelPath },
      undefined,
      undefined,
      ctx,
    )
    const childRel = (child as { details: { taskRelPath: string } }).details.taskRelPath
    assert.equal(readTaskJson(root, childRel).parent, parent.taskRelPath)
    const parentTask = readTaskJson(root, parent.taskRelPath)
    assert.ok((parentTask.children as string[]).includes(childRel))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
