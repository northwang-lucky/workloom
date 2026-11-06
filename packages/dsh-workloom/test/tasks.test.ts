/**
 * dsh-workloom 任务工具单测：create 工具 schema 含 parent 且 createTaskTool 透传到 core，
 * 子任务落盘 parent 字段并联动父 children（真实 core 集成）。
 * 测试依赖 dist（test 脚本先 build 再跑 node --test）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createTask, PARAM_DESCRIPTIONS } from '@workloom-ai/core'
import { registerTaskTools } from '../src/tooling/tasks.ts'

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

test('create 工具 schema：package 必填（type string，描述引用 PARAM_DESCRIPTIONS.package）', () => {
  const def = setupCreateTool()
  const props = def.parameters.properties
  assert.equal(props.package.type, 'string')
  assert.equal(props.package.description, PARAM_DESCRIPTIONS.package)
  assert.ok(def.parameters.required.includes('package'), 'package must be required')
  assert.ok(def.parameters.required.includes('title'), 'title must be required')
})

test('check 工具 schema 不再含 phase/required（2.2 check 单一凭据）', () => {
  const { ctx, registered } = makeCtx()
  registerTaskTools(ctx)
  const def = registered.find((entry) => entry.name === 'workloom_task_check')
  assert.ok(def, 'check tool must be registered')
  const props = def.parameters.properties
  assert.ok(!('phase' in props), 'check tool must not declare phase')
  assert.ok(!('required' in props), 'check tool must not declare required')
  assert.equal(props.summary.description, PARAM_DESCRIPTIONS.summary)
})

test('align 工具 schema：action 必填枚举 review/confirm；target 可选枚举 prd/plan；无哈希参数', () => {
  const { ctx, registered } = makeCtx()
  registerTaskTools(ctx)
  const def = registered.find((entry) => entry.name === 'workloom_task_align')
  assert.ok(def, 'align tool must be registered')
  const props = def.parameters.properties
  assert.deepEqual(props.action.enum, ['review', 'confirm'])
  assert.ok(def.parameters.required.includes('action'), 'action must be required')
  assert.equal(props.action.description, PARAM_DESCRIPTIONS.action)
  // review 诊断契约：调用方须知道 review 返回结构问题与 ready 状态，confirm 记录内容确认
  assert.match(props.action.description, /structural issues/)
  assert.match(props.action.description, /readyToConfirm/)
  assert.match(props.action.description, /confirm records the content confirmation/)
  // target 参数：可选枚举 prd/plan，描述引用 core 常量
  assert.deepEqual(props.target.enum, ['prd', 'plan'])
  assert.ok(!def.parameters.required.includes('target'), 'target must be optional')
  assert.equal(props.target.description, PARAM_DESCRIPTIONS.target)
  assert.equal(props.summary.description, PARAM_DESCRIPTIONS.alignmentSummary)
  // 完整结构缺席断言：哈希参数不再存在
  assert.equal('expectedPrdHash' in props, false, 'expectedPrdHash must be removed from the align schema')
  assert.equal('expectedCaseHash' in props, false)
  for (const key of Object.keys(props)) {
    assert.ok(!/hash/i.test(key), `align schema 参数不得含 hash：${key}`)
    assert.ok(!props[key].description.includes('SHA-256'), `align schema 描述不得提 SHA-256：${key}`)
  }
})

test('align 工具主会话限制：子代理（delegationDepth>0）调用被拒绝', async () => {
  const { ctx, registered } = makeCtx()
  registerTaskTools(ctx)
  const def = registered.find((entry) => entry.name === 'workloom_task_align')
  assert.ok(def, 'align tool must be registered')
  const exec = {
    agent: {
      id: 'child-1',
      options: { subagentDepth: 1 },
      session: { header: { cwd: '/tmp', delegationDepth: 1 } },
    },
    signal: new AbortController().signal,
  }
  await assert.rejects(
    () => def.execute({ action: 'review' }, exec),
    /only be called from the main session/,
  )
})

test('archive 工具 schema：taskPath 必填且描述引用 PARAM_DESCRIPTIONS.taskPathRequired', () => {
  const { ctx, registered } = makeCtx()
  registerTaskTools(ctx)
  const def = registered.find((entry) => entry.name === 'workloom_task_archive')
  assert.ok(def, 'archive tool must be registered')
  assert.ok(def.parameters.required.includes('taskPath'), 'taskPath must be required')
  assert.equal(
    def.parameters.properties.taskPath.description,
    PARAM_DESCRIPTIONS.taskPathRequired,
  )
})

test('createTaskTool 透传 parent：子任务落盘 parent 字段且父 children 联动', async () => {
  const root = mkdtempSync(join(tmpdir(), 'workloom-dsh-tasks-'))
  mkdirSync(join(root, '.workloom'))
  // 种子 packages（package 归属校验需要声明的键）。
  writeFileSync(join(root, '.workloom', 'config.json'), JSON.stringify({ packages: { repo: { path: '.' } } }))
  try {
    const [, parent] = await createTask(root, { title: 'Parent', package: 'repo' })
    assert.ok(parent)
    const def = setupCreateTool()
    const exec = { agent: makeAgent(root), signal: new AbortController().signal }
    // 缺省不传 parent：透传 undefined，任务无父。
    const plain = await def.execute({ title: 'Plain', package: 'repo' }, exec)
    assert.equal(readTaskJson(root, plain.taskRelPath).parent, null)
    // 带 parent 创建子任务：透传 core，子任务 parent 落盘、父 children 追加。
    const child = await def.execute({ title: 'Child', package: 'repo', parent: parent.taskRelPath }, exec)
    assert.equal(readTaskJson(root, child.taskRelPath).parent, parent.taskRelPath)
    const parentTask = readTaskJson(root, parent.taskRelPath)
    assert.ok(parentTask.children.includes(child.taskRelPath))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('create 工具 schema 含 mode（可选，枚举 light，描述引用 PARAM_DESCRIPTIONS.mode）', () => {
  const def = setupCreateTool()
  const props = def.parameters.properties
  assert.equal(props.mode.type, 'string')
  assert.deepEqual(props.mode.enum, ['light'])
  assert.equal(props.mode.description, PARAM_DESCRIPTIONS.mode)
  assert.ok(!def.parameters.required.includes('mode'), 'mode must be optional')
})

test('createTaskTool 透传 mode：light 任务落 task.json，缺省 full', async () => {
  const root = mkdtempSync(join(tmpdir(), 'workloom-dsh-tasks-'))
  mkdirSync(join(root, '.workloom'))
  writeFileSync(
    join(root, '.workloom', 'config.json'),
    JSON.stringify({ packages: { repo: { path: '.' } } }),
  )
  try {
    const def = setupCreateTool()
    const exec = { agent: makeAgent(root), signal: new AbortController().signal }
    const light = await def.execute({ title: 'Light', package: 'repo', mode: 'light' }, exec)
    assert.equal(readTaskJson(root, light.taskRelPath).mode, 'light')
    const full = await def.execute({ title: 'Full', package: 'repo' }, exec)
    assert.equal(readTaskJson(root, full.taskRelPath).mode, 'full')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
