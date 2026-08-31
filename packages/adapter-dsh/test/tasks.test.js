/**
 * adapter-dsh 任务工具单测：create 工具 schema 含 parent 且 createTaskTool 透传到 core，
 * 子任务落盘 parent 字段并联动父 children（真实 core 集成）。
 * 测试依赖 dist（test 脚本先 build 再跑 node --test）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createTask, PARAM_DESCRIPTIONS } from '@workloom-ai/core'
import { registerTaskTools } from '../dist/tasks.js'

/** 构造模拟 tools 注册环境，捕获所有注册的工具定义。 */
function makeCtx() {
  const registered = []
  const tools = {
    register(def) {
      registered.push(def)
      return () => {}
    },
  }
  return { ctx: { tools }, registered }
}

/** 构造模拟 agent（仅 id 与 cwd 被 createTaskTool 读取）。 */
function makeAgent(root) {
  return {
    id: 'parent-1',
    session: { header: { cwd: root } },
  }
}

/** 读取任务目录下的 task.json（目录相对 .workloom）。 */
function readTaskJson(root, taskRelPath) {
  return JSON.parse(readFileSync(join(root, '.workloom', taskRelPath, 'task.json'), 'utf8'))
}

/** 注册任务工具并返回 create 工具定义（六个工具中第一个注册的）。 */
function setupCreateTool() {
  const { ctx, registered } = makeCtx()
  registerTaskTools(ctx)
  const def = registered[0]
  assert.ok(def, 'create tool must be registered')
  assert.equal(def.name, 'workloom_task_create')
  return def
}

test('create 工具 schema 含 parent（type string，描述引用 PARAM_DESCRIPTIONS.parent，且非必填）', () => {
  const def = setupCreateTool()
  const props = def.parameters.properties
  assert.equal(props.parent.type, 'string')
  assert.equal(props.parent.description, PARAM_DESCRIPTIONS.parent)
  assert.ok(!def.parameters.required.includes('parent'), 'parent must be optional')
})

test('check 工具 schema 含 phase（枚举 grilling/check、缺省 check、描述引用 PARAM_DESCRIPTIONS.phase）与 required', () => {
  const { ctx, registered } = makeCtx()
  registerTaskTools(ctx)
  const def = registered.find((entry) => entry.name === 'workloom_task_check')
  assert.ok(def, 'check tool must be registered')
  const props = def.parameters.properties
  assert.equal(props.phase.type, 'string')
  assert.deepEqual(props.phase.enum, ['check', 'grilling'])
  assert.equal(props.phase.default, 'check')
  // 描述引用 core surface 常量（phase 短描述 + phaseGrilling 完整语义）
  assert.ok(props.phase.description.includes(PARAM_DESCRIPTIONS.phase))
  assert.ok(props.phase.description.includes(PARAM_DESCRIPTIONS.phaseGrilling))
  assert.equal(props.required.type, 'boolean')
  assert.equal(props.required.description, PARAM_DESCRIPTIONS.grillingRequired)
  // summary 不再必填（phase=grilling 判定调用无 summary）
  assert.ok(!def.parameters.required.includes('summary'), 'summary must be optional')
})

test('createTaskTool 透传 parent：子任务落盘 parent 字段且父 children 联动', async () => {
  const root = mkdtempSync(join(tmpdir(), 'workloom-dsh-tasks-'))
  mkdirSync(join(root, '.workloom'))
  try {
    const [, parent] = await createTask(root, { title: 'Parent' })
    assert.ok(parent)
    const def = setupCreateTool()
    const exec = { agent: makeAgent(root), signal: new AbortController().signal }
    // 缺省不传 parent：透传 undefined，任务无父。
    const plain = await def.execute({ title: 'Plain' }, exec)
    assert.equal(readTaskJson(root, plain.taskRelPath).parent, null)
    // 带 parent 创建子任务：透传 core，子任务 parent 落盘、父 children 追加。
    const child = await def.execute({ title: 'Child', parent: parent.taskRelPath }, exec)
    assert.equal(readTaskJson(root, child.taskRelPath).parent, parent.taskRelPath)
    const parentTask = readTaskJson(root, parent.taskRelPath)
    assert.ok(parentTask.children.includes(child.taskRelPath))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
