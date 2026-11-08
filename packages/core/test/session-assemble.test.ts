/**
 * session-assemble 单测：resolveTurnTask 三态行为直测（R12 补齐）——
 * 无指针返回 null（正常态）、命中返回 TaskView（兼容读产物）、指针错误与
 * 任务记录不可读抛错（结构性故障）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { resolveTurnTask } from '../src/injection/session-assemble.ts'
import { setActiveTask } from '../src/task/state/index.ts'

// 测试隔离：core 三层配置的全局层读 $HOME/.workloom/config；重定向 HOME 与
// TMPDIR 到隔离目录（与 task-store.test.ts 同口径），findWorkloomRoot 的上溯
// 在 HOME 边界停下，不误发现本机真实家目录的 .workloom。
const isolatedHome = mkdtempSync(join(tmpdir(), 'workloom-core-assemble-home-'))
process.env.HOME = isolatedHome
process.env.TMPDIR = isolatedHome

/** 构造仅含 .workloom 的项目根。 */
function makeRoot() {
  const root = mkdtempSync(join(tmpdir(), 'workloom-assemble-'))
  mkdirSync(join(root, '.workloom'), { recursive: true })
  return root
}

/** 写任务 task.json（tasks/<name>/task.json）。 */
function writeTask(root, name, doc) {
  const dir = join(root, '.workloom', 'tasks', name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'task.json'), typeof doc === 'string' ? doc : `${JSON.stringify(doc)}\n`)
}

/** 指针文件路径（.workloom/.runtime/sessions/<contextKey>.json）。 */
function pointerFile(root, contextKey) {
  return join(root, '.workloom', '.runtime', 'sessions', `${contextKey}.json`)
}

test('resolveTurnTask：无指针返回 null（无活跃任务，正常态不抛错）', () => {
  const root = makeRoot()
  try {
    assert.equal(resolveTurnTask(root, 'dsh_sess_none'), null)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('resolveTurnTask：命中返回 TaskView（兼容读产物形状）', () => {
  const root = makeRoot()
  try {
    writeTask(root, '08-24-demo', { title: 'Demo', status: 'in_progress', stage: 'implementing' })
    setActiveTask(root, 'dsh_sess_hit', 'tasks/08-24-demo')
    const view = resolveTurnTask(root, 'dsh_sess_hit')
    assert.ok(view !== null)
    assert.equal(view.title, 'Demo')
    assert.equal(view.taskRelPath, 'tasks/08-24-demo')
    // 兼容读映射：mode 缺省按 children 推断 standard；轨道与自治度缺省值。
    assert.equal(view.mode, 'standard')
    assert.equal(view.stage, 'implementing')
    assert.equal(view.status, 'in_progress')
    assert.equal(view.casePhase, 'none')
    assert.equal(view.planReview, 'none')
    assert.equal(view.planReviewRevisions, 0)
    assert.equal(view.autonomy, 'manual')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('resolveTurnTask：指针文件损坏抛错（结构性故障，不静默按无任务）', () => {
  const root = makeRoot()
  try {
    mkdirSync(join(root, '.workloom', '.runtime', 'sessions'), { recursive: true })
    writeFileSync(pointerFile(root, 'dsh_sess_bad_ptr'), '{ not json\n')
    assert.throws(
      () => resolveTurnTask(root, 'dsh_sess_bad_ptr'),
      /failed to parse pointer file/,
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('resolveTurnTask：指针命中但任务记录不可读抛错（task.json 损坏）', () => {
  const root = makeRoot()
  try {
    // 任务目录存在（指针非悬挂），task.json 损坏：读取失败为结构性故障。
    writeTask(root, '08-24-broken', '{ not json')
    setActiveTask(root, 'dsh_sess_bad_task', 'tasks/08-24-broken')
    assert.throws(
      () => resolveTurnTask(root, 'dsh_sess_bad_task'),
      /failed to parse task\.json/,
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('resolveTurnTask：指针悬挂（任务目录已删）返回 null 并清理指针', () => {
  const root = makeRoot()
  try {
    writeTask(root, '08-24-gone', { title: 'Gone', status: 'planning' })
    setActiveTask(root, 'dsh_sess_dangling', 'tasks/08-24-gone')
    rmSync(join(root, '.workloom', 'tasks', '08-24-gone'), { recursive: true, force: true })
    assert.equal(resolveTurnTask(root, 'dsh_sess_dangling'), null)
    // 悬挂指针被清理（resolveActiveTask 语义）。
    assert.equal(existsSync(pointerFile(root, 'dsh_sess_dangling')), false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
