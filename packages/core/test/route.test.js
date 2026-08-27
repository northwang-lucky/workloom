/**
 * route-service 单测：按任务状态与规划产物存在性路由下一步。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { routeNextStep } from '../dist/service/route-service.js'
import { createTask, startTask } from '../dist/legacy/task-store.js'

function makeProject() {
  const root = mkdtempSync(join(tmpdir(), 'workloom-route-'))
  mkdirSync(join(root, '.workloom'), { recursive: true })
  return root
}

/** 创建任务并返回 taskRelPath；createTask 自带 prd.md 骨架。 */
async function makeTask(root, slug) {
  const [err, result] = await createTask(root, { title: `task ${slug}`, slug })
  assert.equal(err, null)
  assert.ok(result)
  return result.taskRelPath
}

/** 删除任务目录下的规划产物（如 prd.md）。 */
function removeArtifact(root, taskRelPath, name) {
  rmSync(join(root, '.workloom', taskRelPath, name), { force: true })
}

/** 直接改写 task.json 的 status（completed 分支用，绕开归档副作用）。 */
function setTaskStatus(root, taskRelPath, status) {
  const file = join(root, '.workloom', taskRelPath, 'task.json')
  const task = JSON.parse(readFileSync(file, 'utf8'))
  task.status = status
  writeFileSync(file, `${JSON.stringify(task, null, 2)}\n`)
}

test('planning 且无 prd → 1.1', async () => {
  const root = makeProject()
  try {
    const taskRelPath = await makeTask(root, 'no-prd')
    removeArtifact(root, taskRelPath, 'prd.md')
    const [err, route] = routeNextStep(root, { taskRelPath })
    assert.equal(err, null)
    assert.equal(route.stepId, '1.1')
    assert.match(route.guidance, /align requirements/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('planning 有 prd 无 design → 1.4 轻量等评审', async () => {
  const root = makeProject()
  try {
    const taskRelPath = await makeTask(root, 'lightweight')
    const [err, route] = routeNextStep(root, { taskRelPath })
    assert.equal(err, null)
    assert.equal(route.stepId, '1.4')
    assert.match(route.guidance, /lightweight task/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('planning 有 prd 与 design → 1.4 复杂等评审', async () => {
  const root = makeProject()
  try {
    const taskRelPath = await makeTask(root, 'complex')
    writeFileSync(join(root, '.workloom', taskRelPath, 'design.md'), '# Design\n')
    const [err, route] = routeNextStep(root, { taskRelPath })
    assert.equal(err, null)
    assert.equal(route.stepId, '1.4')
    assert.match(route.guidance, /complex task/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('in_progress → 2.1（指引含 2.2/2.3 递进提示）', async () => {
  const root = makeProject()
  try {
    const taskRelPath = await makeTask(root, 'running')
    // 路由语义与门禁无关：force 豁免 start 门禁
    const [startErr] = await startTask(root, { taskRelPath, force: true })
    assert.equal(startErr, null)
    const [err, route] = routeNextStep(root, { taskRelPath })
    assert.equal(err, null)
    assert.equal(route.stepId, '2.1')
    assert.match(route.guidance, /move to 2\.2/)
    assert.match(route.guidance, /move to 2\.3/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('completed → 3.1', async () => {
  const root = makeProject()
  try {
    const taskRelPath = await makeTask(root, 'done')
    setTaskStatus(root, taskRelPath, 'completed')
    const [err, route] = routeNextStep(root, { taskRelPath })
    assert.equal(err, null)
    assert.equal(route.stepId, '3.1')
    assert.match(route.guidance, /wrap up/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('task.json 缺失 → err', async () => {
  const root = makeProject()
  try {
    const [err, route] = routeNextStep(root, { taskRelPath: 'tasks/ghost' })
    assert.ok(err)
    assert.equal(route, null)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
