/**
 * workflow-service 单测：assembleBreadcrumb 编排（契约内联，临时项目目录）。
 *
 * 覆盖：无任务 → no_task 块；任务 planning → planning 块；overlay 覆盖生效；
 * skip 关键词命中 → null；根目录无 .workloom → err。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { assembleBreadcrumb } from '../dist/service/workflow-service.js'
import { createTask } from '../dist/legacy/task-store.js'
import { setActiveTask } from '../dist/legacy/active-task.js'

/** 内联小契约（front-matter 与四个状态块，与 assets 的 states 对齐）。 */
const CONTRACT_TEXT = [
  '---',
  'version: 1',
  'states:',
  '  - no_task',
  '  - planning',
  '  - in_progress',
  '  - completed',
  '---',
  '',
  '[workflow-state:no_task]',
  'No active task: propose the next step.',
  '[/workflow-state:no_task]',
  '',
  '[workflow-state:planning]',
  'Align requirements before writing code.',
  '[/workflow-state:planning]',
  '',
  '[workflow-state:in_progress]',
  'Implement per the plan and verify.',
  '[/workflow-state:in_progress]',
  '',
  '[workflow-state:completed]',
  'Task finished; commit and archive.',
  '[/workflow-state:completed]',
  '',
].join('\n')

/** 创建临时项目根（含 .workloom）；测试结束清理。 */
function makeProject() {
  const root = mkdtempSync(join(tmpdir(), 'workloom-wf-'))
  mkdirSync(join(root, '.workloom'), { recursive: true })
  return root
}

/** 在项目内落一个任务（task.json + 会话指针）。 */
function addTask(root, contextKey, status) {
  const taskDir = join(root, '.workloom', 'tasks', '08-24-demo')
  mkdirSync(taskDir, { recursive: true })
  writeFileSync(join(taskDir, 'task.json'), `${JSON.stringify({ status })}\n`)
  const sessionsDir = join(root, '.workloom', '.runtime', 'sessions')
  mkdirSync(sessionsDir, { recursive: true })
  writeFileSync(
    join(sessionsDir, `${contextKey}.json`),
    `${JSON.stringify({ current_task: 'tasks/08-24-demo' })}\n`,
  )
}

test('无任务时返回 no_task 指引块', async () => {
  const root = makeProject()
  try {
    const [err, text] = await assembleBreadcrumb({
      root,
      contextKey: 'dsh_wf_1',
      contractText: CONTRACT_TEXT,
    })
    assert.equal(err, null)
    assert.equal(text, 'No active task: propose the next step.')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('任务 planning 时返回 planning 指引块', async () => {
  const root = makeProject()
  try {
    addTask(root, 'dsh_wf_2', 'planning')
    const [err, text] = await assembleBreadcrumb({
      root,
      contextKey: 'dsh_wf_2',
      contractText: CONTRACT_TEXT,
    })
    assert.equal(err, null)
    assert.equal(text, 'Align requirements before writing code.')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('overlay 覆盖 planning 块正文后生效', async () => {
  const root = makeProject()
  try {
    addTask(root, 'dsh_wf_3', 'planning')
    writeFileSync(
      join(root, '.workloom', 'workflow.override.md'),
      [
        '[workflow-state:planning]',
        'Overlay: align first, then plan.',
        '[/workflow-state:planning]',
        '',
      ].join('\n'),
    )
    const [err, text] = await assembleBreadcrumb({
      root,
      contextKey: 'dsh_wf_3',
      contractText: CONTRACT_TEXT,
    })
    assert.equal(err, null)
    assert.equal(text, 'Overlay: align first, then plan.')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('用户消息命中 skip 关键词时返回 null', async () => {
  const root = makeProject()
  try {
    writeFileSync(
      join(root, '.workloom', 'config.yaml'),
      'prompt_injection:\n  skip_keyword: stop-workloom\n',
    )
    const [err, text] = await assembleBreadcrumb({
      root,
      contextKey: 'dsh_wf_4',
      contractText: CONTRACT_TEXT,
      userPrompt: 'please stop-workloom this round',
    })
    assert.equal(err, null)
    assert.equal(text, null)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('根目录无 .workloom 时返回 err', async () => {
  const root = mkdtempSync(join(tmpdir(), 'workloom-wf-'))
  try {
    const [err, text] = await assembleBreadcrumb({
      root,
      contextKey: 'dsh_wf_5',
      contractText: CONTRACT_TEXT,
    })
    assert.notEqual(err, null)
    assert.match(err.message, /no \.workloom/)
    assert.equal(text, null)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('overlay 引入未声明状态时返回 err', async () => {
  const root = makeProject()
  try {
    const overlayText = '[workflow-state:archived]\noval\n[/workflow-state:archived]\n'
    writeFileSync(join(root, '.workloom', 'workflow.override.md'), overlayText)
    const [err, text] = await assembleBreadcrumb({
      root,
      contextKey: 'dsh_wf_6',
      contractText: CONTRACT_TEXT,
    })
    assert.notEqual(err, null)
    assert.match(err.message, /not declared/)
    assert.equal(text, null)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('task.json 状态损坏时返回 err', async () => {
  const root = makeProject()
  try {
    const [, created] = await createTask(root, { title: 'Broken Status' })
    const json = JSON.parse(
      readFileSync(join(root, '.workloom', created.taskRelPath, 'task.json'), 'utf8'),
    )
    json.status = 'banana'
    writeFileSync(join(root, '.workloom', created.taskRelPath, 'task.json'), JSON.stringify(json))
    setActiveTask(root, 'dsh_wf_7', created.taskRelPath)
    const [err, text] = await assembleBreadcrumb({
      root,
      contextKey: 'dsh_wf_7',
      contractText: CONTRACT_TEXT,
    })
    assert.notEqual(err, null)
    assert.match(err.message, /unknown task status/)
    assert.equal(text, null)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
