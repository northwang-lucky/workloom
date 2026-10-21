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

import { assembleBreadcrumb, assembleWorkflowProjection } from '../dist/service/workflow-service.js'
import { createTask } from '../dist/domain/task-store.js'
import { setActiveTask } from '../dist/domain/active-task.js'

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
      join(root, '.workloom', 'config.json'),
      JSON.stringify({ prompt_injection: { skip_keyword: 'stop-workloom' } }),
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

test('delegationDepth>0 时完全不注入 breadcrumb（返回 null）', async () => {
  const root = makeProject()
  try {
    // 深度>0（executor 等叶子子代理）：跳过全部编排，直接返回 null，不读契约与任务。
    addTask(root, 'dsh_wf_8', 'in_progress')
    const [err, text] = await assembleBreadcrumb({
      root,
      contextKey: 'dsh_wf_8',
      contractText: CONTRACT_TEXT,
      delegationDepth: 1,
    })
    assert.equal(err, null)
    assert.equal(text, null)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('delegationDepth 缺省为 0：行为与现状一致（规划任务返回规划指引）', async () => {
  const root = makeProject()
  try {
    addTask(root, 'dsh_wf_9', 'planning')
    const [err, text] = await assembleBreadcrumb({
      root,
      contextKey: 'dsh_wf_9',
      contractText: CONTRACT_TEXT,
    })
    assert.equal(err, null)
    assert.equal(text, 'Align requirements before writing code.')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

/** 轻量契约内联样本：三状态块 + 精简步骤集，不含 norms 块。 */
const LIGHT_CONTRACT_TEXT = [
  '---',
  'version: 1',
  'states:',
  '  - planning',
  '  - in_progress',
  '  - completed',
  '---',
  '',
  '#### 1.0 Start task',
  'Fill the light prd, then start.',
  '',
  '#### 2.1 Implement',
  'The main session implements directly.',
  '',
  '#### 2.2 Self-check and record',
  'The main session self-checks and records.',
  '',
  '#### 2.3 Commit',
  'Commit the change.',
  '',
  '#### 3.1 Archive and record',
  'Archive and record the session.',
  '',
  '[workflow-state:planning]',
  'Light planning: fill the light prd and start.',
  '[/workflow-state:planning]',
  '',
  '[workflow-state:in_progress]',
  'Light in progress: implement directly, self-check, then record.',
  '[/workflow-state:in_progress]',
  '',
  '[workflow-state:completed]',
  'Light task archived.',
  '[/workflow-state:completed]',
  '',
].join('\n')

/** 在项目内落一个带 mode 的任务（task.json + 会话指针）。 */
function addTaskWithMode(root, contextKey, status, mode) {
  const taskDir = join(root, '.workloom', 'tasks', '08-25-light-demo')
  mkdirSync(taskDir, { recursive: true })
  writeFileSync(
    join(taskDir, 'task.json'),
    `${JSON.stringify({ title: 'Light demo', status, mode })}\n`,
  )
  setActiveTask(root, contextKey, 'tasks/08-25-light-demo')
}

test('light 任务 breadcrumb 取自轻量契约', async () => {
  const root = makeProject()
  try {
    addTaskWithMode(root, 'dsh_light_1', 'planning', 'light')
    const [err, text] = await assembleBreadcrumb({
      root,
      contextKey: 'dsh_light_1',
      contractText: CONTRACT_TEXT,
      lightContractText: LIGHT_CONTRACT_TEXT,
    })
    assert.equal(err, null)
    assert.equal(text, 'Light planning: fill the light prd and start.')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('full 任务 breadcrumb 不受 lightContractText 影响（逐字不变护栏）', async () => {
  const root = makeProject()
  try {
    addTaskWithMode(root, 'dsh_light_2', 'planning', 'full')
    const [err, text] = await assembleBreadcrumb({
      root,
      contextKey: 'dsh_light_2',
      contractText: CONTRACT_TEXT,
      lightContractText: LIGHT_CONTRACT_TEXT,
    })
    assert.equal(err, null)
    assert.equal(text, 'Align requirements before writing code.')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('light 轨不叠加项目 overlay（overlay 仅作用于 full 轨）', async () => {
  const root = makeProject()
  try {
    addTaskWithMode(root, 'dsh_light_3', 'planning', 'light')
    writeFileSync(
      join(root, '.workloom', 'workflow.override.md'),
      '[workflow-state:planning]\nOverlay full-track text.\n[/workflow-state:planning]\n',
    )
    const [err, text] = await assembleBreadcrumb({
      root,
      contextKey: 'dsh_light_3',
      contractText: CONTRACT_TEXT,
      lightContractText: LIGHT_CONTRACT_TEXT,
    })
    assert.equal(err, null)
    assert.equal(text, 'Light planning: fill the light prd and start.')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('light 任务缺轻量契约文本时 breadcrumb 返回 err（fail loud）', async () => {
  const root = makeProject()
  try {
    addTaskWithMode(root, 'dsh_light_4', 'in_progress', 'light')
    const [err, text] = await assembleBreadcrumb({
      root,
      contextKey: 'dsh_light_4',
      contractText: CONTRACT_TEXT,
    })
    assert.ok(err)
    assert.match(err.message, /light workflow contract/)
    assert.equal(text, null)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

/** 主契约投影样本：完整步骤集 + norms（states 不声明块，投影只消费 steps/norms）。 */
const MAIN_STEPS_CONTRACT = [
  '---',
  'version: 2',
  'states: []',
  '---',
  '',
  '#### 1.0 Create task',
  'Create the task.',
  '',
  '#### 1.1 Align requirements',
  'Align the requirements.',
  '',
  '#### 2.1 Implement',
  'Dispatch the implement executor.',
  '',
  '#### 2.2 Check',
  'Dispatch the check executor.',
  '',
  '#### 2.3 Commit',
  'Commit the change.',
  '',
  '#### 3.1 Archive and record',
  'Archive and record the session.',
  '',
  '[workflow-norms]',
  'Main-only norms.',
  '[/workflow-norms]',
  '',
].join('\n')

test('assembleWorkflowProjection：无任务/ full 任务取主契约 steps 与 norms', async () => {
  const root = makeProject()
  try {
    const [noTaskErr, noTask] = await assembleWorkflowProjection(
      root,
      'dsh_proj_1',
      MAIN_STEPS_CONTRACT,
      LIGHT_CONTRACT_TEXT,
    )
    assert.equal(noTaskErr, null)
    assert.deepEqual(
      noTask.steps.map((step) => step.id),
      ['1.0', '1.1', '2.1', '2.2', '2.3', '3.1'],
    )
    assert.equal(noTask.norms, 'Main-only norms.')
    addTaskWithMode(root, 'dsh_proj_2', 'in_progress', 'full')
    const [fullErr, full] = await assembleWorkflowProjection(
      root,
      'dsh_proj_2',
      MAIN_STEPS_CONTRACT,
      LIGHT_CONTRACT_TEXT,
    )
    assert.equal(fullErr, null)
    assert.deepEqual(
      full.steps.map((step) => step.id),
      ['1.0', '1.1', '2.1', '2.2', '2.3', '3.1'],
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('assembleWorkflowProjection：light 任务 steps 取轻量契约，norms 仍出自主契约', async () => {
  const root = makeProject()
  try {
    addTaskWithMode(root, 'dsh_proj_3', 'in_progress', 'light')
    const [err, projection] = await assembleWorkflowProjection(
      root,
      'dsh_proj_3',
      MAIN_STEPS_CONTRACT,
      LIGHT_CONTRACT_TEXT,
    )
    assert.equal(err, null)
    assert.deepEqual(
      projection.steps.map((step) => step.id),
      ['1.0', '2.1', '2.2', '2.3', '3.1'],
    )
    assert.equal(projection.steps.find((step) => step.id === '2.1').title, 'Implement')
    assert.equal(projection.norms, 'Main-only norms.')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
