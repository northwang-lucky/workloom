/**
 * task-ops 模块单测：五个任务工具编排（create/start/finish/archive/list）。
 * 测试依赖 dist（test 脚本先 build 再跑 node --test），临时目录 setup 照
 * init.test.js 先例（mkdtemp + finally rmSync）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  executeArchiveTask,
  executeCreateTask,
  executeFinishTask,
  executeListTasks,
  executeStartTask,
  requireWorkloomCwd,
  resolveTaskRelPath,
} from '../dist/index.js'
import { initWorkloom } from '../dist/legacy/init.js'

/** 创建临时项目根（含 .workloom 骨架）。 */
function makeRoot() {
  const root = mkdtempSync(join(tmpdir(), 'workloom-taskops-'))
  initWorkloom(root)
  return root
}

test('requireWorkloomCwd 空串抛错（消息含前缀）', () => {
  assert.throws(
    () => requireWorkloomCwd(''),
    /workloom task tool: cannot determine the working directory/,
  )
})

test('executeCreateTask 空串 slug/priority/description 不传（默认值兜底）', async () => {
  const root = makeRoot()
  try {
    const [err, result] = await executeCreateTask(root, 'dsh_t1', {
      title: 'Filter Empty',
      slug: '',
      priority: '',
      description: '',
    })
    assert.equal(err, null)
    // slug 不入记录字段：任务 name 由标题 slugify 兜底（空串 slug 未覆盖）。
    assert.equal(result.task.name, 'filter-empty')
    assert.equal(result.task.priority, 'P2')
    assert.equal(result.task.description, '')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('无活跃任务且无 taskPath 时报错', async () => {
  const root = makeRoot()
  try {
    const [err, task] = await executeStartTask(root, 'dsh_none', undefined)
    assert.ok(err)
    assert.match(err.message, /no active task and no taskPath given/)
    assert.equal(task, null)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('resolveTaskRelPath 无活跃任务错误携带调用方传入的前缀', () => {
  const root = makeRoot()
  try {
    assert.throws(
      () => resolveTaskRelPath(root, 'dsh_prefix', undefined, 'workloom task tool'),
      /workloom task tool: no active task and no taskPath given/,
    )
    assert.throws(
      () => resolveTaskRelPath(root, 'dsh_prefix', undefined, 'workloom executor'),
      /workloom executor: no active task and no taskPath given/,
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('create→start→finish→list→archive 全链（活跃任务 fallback）', async () => {
  const root = makeRoot()
  try {
    const contextKey = 'dsh_chain'
    // create：任务创建并设为活跃。
    const [, created] = await executeCreateTask(root, contextKey, { title: 'Chain Task' })
    assert.ok(created.taskRelPath.startsWith('tasks/'))
    assert.equal(created.task.status, 'planning')
    // start：无 taskPath，fallback 到活跃任务。
    const [, started] = await executeStartTask(root, contextKey, undefined)
    assert.equal(started.taskRelPath, created.taskRelPath)
    assert.equal(started.status, 'in_progress')
    // finish：无 taskPath，fallback 到活跃任务（清指针）。
    const [, finished] = await executeFinishTask(root, contextKey, undefined)
    assert.equal(finished.taskRelPath, created.taskRelPath)
    assert.equal(finished.finished, true)
    // list：列出全部任务。
    const [, list] = await executeListTasks(root, undefined)
    assert.ok(list.tasks.some((task) => task.title === 'Chain Task'))
    // archive：显式 taskPath（finish 已清指针），note 含 /workloom-finish。
    const [, archived] = await executeArchiveTask(root, contextKey, created.taskRelPath, undefined)
    assert.equal(archived.task.status, 'completed')
    assert.match(archived.note, /run \/workloom-finish to record the session journal/)
    assert.notEqual(archived.taskRelPath, created.taskRelPath)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('executeListTasks 按 status 过滤', async () => {
  const root = makeRoot()
  try {
    await executeCreateTask(root, 'dsh_l1', { title: 'Planning Only' })
    const [, planning] = await executeListTasks(root, 'planning')
    assert.equal(planning.tasks.length, 1)
    const [, completed] = await executeListTasks(root, 'completed')
    assert.equal(completed.tasks.length, 0)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
