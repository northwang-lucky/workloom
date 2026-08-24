/**
 * task-store 模块单测：布局、slug、状态迁移、指针清理、归档与 hooks。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  TaskStatus,
  slugify,
  createTask,
  startTask,
  finishTask,
  archiveTask,
  listTasks,
  runTaskHooks,
} from '../src/legacy/task-store.js'
import { resolveActiveTask, setActiveTask } from '../src/legacy/active-task.js'

/** 创建临时项目根（含 .workloom，可选 config 与 .developer）。 */
function makeRoot(options = {}) {
  const root = mkdtempSync(join(tmpdir(), 'workloom-task-'))
  mkdirSync(join(root, '.workloom'))
  if (options.config !== undefined) {
    writeFileSync(join(root, '.workloom', 'config.yaml'), options.config)
  }
  if (options.developer !== undefined) {
    writeFileSync(join(root, '.workloom', '.developer'), options.developer)
  }
  return root
}

/** 读取任务目录下的 task.json（目录相对 .workloom）。 */
function readTaskJson(root, taskRelPath) {
  return JSON.parse(readFileSync(join(root, '.workloom', taskRelPath, 'task.json'), 'utf8'))
}

/** 在临时根内执行 git 命令。 */
function runGit(root, args) {
  return execFileSync('git', args, { cwd: root, stdio: 'pipe' })
}

test('createTask 创建完整布局与默认字段', async () => {
  const root = makeRoot({ developer: 'alice' })
  try {
    const [err, result] = await createTask(root, { title: 'Hello World!' })
    assert.equal(err, null)
    assert.ok(result)
    const dirName = result.taskRelPath.split('/').pop()
    assert.match(dirName, /^\d{2}-\d{2}-hello-world$/)
    const task = readTaskJson(root, result.taskRelPath)
    assert.ok(task.id)
    assert.equal(task.name, 'hello-world')
    assert.equal(task.title, 'Hello World!')
    assert.equal(task.description, '')
    assert.equal(task.status, TaskStatus.PLANNING)
    assert.equal(task.priority, 'P2')
    assert.equal(task.creator, 'alice')
    assert.equal(task.assignee, '')
    assert.equal(task.package, null)
    assert.equal(task.branch, '')
    assert.equal(task.base_branch, '')
    assert.ok(!Number.isNaN(Date.parse(task.createdAt)))
    assert.equal(task.completedAt, null)
    assert.equal(task.parent, null)
    assert.deepEqual(task.children, [])
    assert.deepEqual(task.subtasks, [])
    assert.equal(task.scope, '')
    assert.equal(task.commit, '')
    assert.equal(task.pr_url, '')
    assert.equal(task.worktree_path, '')
    assert.deepEqual(task.relatedFiles, [])
    assert.equal(task.notes, '')
    assert.deepEqual(task.meta, {})
    assert.deepEqual(task.hooks, {
      after_create: [],
      after_start: [],
      after_finish: [],
      after_archive: [],
    })
    // prd.md 骨架
    const prd = readFileSync(join(root, '.workloom', result.taskRelPath, 'prd.md'), 'utf8')
    for (const heading of ['## Goal', '## Requirements', '## Acceptance Criteria', '## Notes']) {
      assert.ok(prd.includes(heading))
    }
    // jsonl seed 自述行（无 file 字段）
    const seed = readFileSync(
      join(root, '.workloom', result.taskRelPath, 'implement.jsonl'),
      'utf8',
    ).trim()
    const parsed = JSON.parse(seed)
    assert.ok(parsed._example)
    assert.equal('file' in parsed, false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('slug 生成规则与目录冲突返回 err', async () => {
  const root = makeRoot()
  try {
    assert.equal(slugify('Hello, World!!!'), 'hello-world')
    assert.equal(slugify('  A--B  '), 'a-b')
    assert.equal(slugify('x'.repeat(50)), 'x'.repeat(40))
    const [err1, r1] = await createTask(root, { title: 'Same Title' })
    assert.equal(err1, null)
    assert.ok(r1)
    const [err2, r2] = await createTask(root, { title: 'Same Title' })
    assert.ok(err2)
    assert.equal(r2, null)
    // 显式 slug 覆盖标题生成
    const [err3, r3] = await createTask(root, { title: 'Other', slug: 'custom-name' })
    assert.equal(err3, null)
    assert.ok(r3)
    assert.equal(r3.taskRelPath.endsWith('custom-name'), true)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('createTask 自定义参数（priority/description/parent）与非法优先级', async () => {
  const root = makeRoot() // 无 .developer，creator 应为空串
  try {
    const [err, result] = await createTask(root, {
      title: 'Custom',
      priority: 'P0',
      description: 'desc',
      parent: 'tasks/01-01-x',
    })
    assert.equal(err, null)
    assert.ok(result)
    const task = readTaskJson(root, result.taskRelPath)
    assert.equal(task.creator, '')
    assert.equal(task.priority, 'P0')
    assert.equal(task.description, 'desc')
    assert.equal(task.parent, 'tasks/01-01-x')
    const [err2] = await createTask(root, { title: 'Bad Priority', priority: 'P9' })
    assert.ok(err2)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('startTask 状态迁移与非法迁移', async () => {
  const root = makeRoot()
  try {
    const [, created] = await createTask(root, { title: 'Start Me' })
    const [err1, started] = await startTask(root, { taskRelPath: created.taskRelPath })
    assert.equal(err1, null)
    assert.ok(started)
    assert.equal(started.status, TaskStatus.IN_PROGRESS)
    assert.equal(readTaskJson(root, created.taskRelPath).status, TaskStatus.IN_PROGRESS)
    const [err2] = await startTask(root, { taskRelPath: created.taskRelPath })
    assert.ok(err2) // 非 planning 不可再启动
    assert.match(err2.message, /can be started/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('finishTask 清理指向本任务的会话指针', async () => {
  const root = makeRoot()
  try {
    const [, created] = await createTask(root, { title: 'Finish Me', contextKey: 'dsh_test-1' })
    const [resErr, current] = resolveActiveTask(root, 'dsh_test-1')
    assert.equal(resErr, null)
    assert.equal(current, created.taskRelPath)
    const [err] = await finishTask(root, {
      taskRelPath: created.taskRelPath,
      contextKey: 'dsh_test-1',
    })
    assert.equal(err, null)
    assert.equal(resolveActiveTask(root, 'dsh_test-1')[1], null)
    // 其他 contextKey 的指针不受影响
    const [, other] = await createTask(root, { title: 'Other Finish', contextKey: 'dsh_test-2' })
    await finishTask(root, { taskRelPath: other.taskRelPath, contextKey: 'dsh_test-9' })
    assert.equal(resolveActiveTask(root, 'dsh_test-2')[1], other.taskRelPath)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('archiveTask 移动目录、置 completed 并 git 自动提交', async () => {
  const root = makeRoot({ config: 'session_auto_commit: true\n' })
  runGit(root, ['init'])
  runGit(root, ['config', 'user.email', 'test@example.com'])
  runGit(root, ['config', 'user.name', 'test'])
  try {
    const [, created] = await createTask(root, { title: 'Archive Me' })
    setActiveTask(root, 'dsh_a1', created.taskRelPath)
    setActiveTask(root, 'dsh_a2', created.taskRelPath)
    const [err, task] = await archiveTask(root, { taskRelPath: created.taskRelPath })
    assert.equal(err, null)
    assert.ok(task)
    assert.equal(task.status, TaskStatus.COMPLETED)
    assert.ok(task.completedAt)
    // 目录已移动到 archive/{YYYY-MM}/{slug}
    const now = new Date()
    const yyyyMm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const archiveRel = join('tasks', 'archive', yyyyMm, 'archive-me')
    assert.equal(existsSync(join(root, '.workloom', created.taskRelPath)), false)
    assert.equal(existsSync(join(root, '.workloom', archiveRel)), true)
    assert.equal(readTaskJson(root, archiveRel).status, TaskStatus.COMPLETED)
    // 指向该任务的所有会话指针已清理
    assert.equal(resolveActiveTask(root, 'dsh_a1')[1], null)
    assert.equal(resolveActiveTask(root, 'dsh_a2')[1], null)
    // git 自动提交存在
    const log = execFileSync('git', ['log', '--oneline'], { cwd: root, encoding: 'utf8' })
    assert.match(log, /chore\(task\): archive archive-me/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('archiveTask 关闭自动提交时不产生 git 提交', async () => {
  const root = makeRoot({ config: 'session_auto_commit: false\n' })
  runGit(root, ['init'])
  runGit(root, ['config', 'user.email', 'test@example.com'])
  runGit(root, ['config', 'user.name', 'test'])
  try {
    const [, created] = await createTask(root, { title: 'No Commit' })
    const [err] = await archiveTask(root, { taskRelPath: created.taskRelPath })
    assert.equal(err, null)
    let hasCommit = true
    try {
      execFileSync('git', ['rev-parse', '--verify', 'HEAD'], { cwd: root, stdio: 'pipe' })
    } catch {
      hasCommit = false
    }
    assert.equal(hasCommit, false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('archiveTask 在非 git 目录中 git 失败不阻塞归档', async () => {
  const root = makeRoot({ config: 'session_auto_commit: true\n' })
  try {
    const [, created] = await createTask(root, { title: 'No Git' })
    const [err, task] = await archiveTask(root, { taskRelPath: created.taskRelPath })
    assert.equal(err, null)
    assert.equal(task.status, TaskStatus.COMPLETED)
    const now = new Date()
    const yyyyMm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    assert.equal(existsSync(join(root, '.workloom', 'tasks', 'archive', yyyyMm, 'no-git')), true)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('archiveTask 归档目标已存在返回 err', async () => {
  const root = makeRoot()
  try {
    const [, created] = await createTask(root, { title: 'Dup', slug: 'dup' })
    const now = new Date()
    const yyyyMm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    // 预创建归档目标目录造成冲突
    mkdirSync(join(root, '.workloom', 'tasks', 'archive', yyyyMm, 'dup'), { recursive: true })
    const [err] = await archiveTask(root, { taskRelPath: created.taskRelPath, autoCommit: false })
    assert.ok(err)
    assert.match(err.message, /archive target already exists/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('after_create hooks 执行并注入 TASK_JSON_PATH，失败不阻塞', async () => {
  const root = makeRoot({
    config: `
hooks:
  after_create:
    - "echo created > created.txt"
    - "echo $TASK_JSON_PATH > taskjson.txt"
    - "exit 1"
`,
  })
  try {
    const [err, result] = await createTask(root, { title: 'Hooked' })
    assert.equal(err, null)
    assert.ok(result)
    assert.equal(readFileSync(join(root, 'created.txt'), 'utf8').trim(), 'created')
    const expectedJson = join(root, '.workloom', result.taskRelPath, 'task.json')
    assert.equal(readFileSync(join(root, 'taskjson.txt'), 'utf8').trim(), expectedJson)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('runTaskHooks 返回失败 WARNING 列表', async () => {
  const root = makeRoot()
  try {
    const warnings = await runTaskHooks(root, join(root, 'x.json'), ['true', 'exit 3'])
    assert.equal(warnings.length, 1)
    assert.match(warnings[0], /exit 3/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('archiveTask 冲突失败不破坏原任务状态与位置', async () => {
  const root = makeRoot()
  try {
    const [, created] = await createTask(root, { title: 'Dup Keep', slug: 'dup-keep' })
    const now = new Date()
    const yyyyMm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    mkdirSync(join(root, '.workloom', 'tasks', 'archive', yyyyMm, 'dup-keep'), { recursive: true })
    const [err] = await archiveTask(root, { taskRelPath: created.taskRelPath, autoCommit: false })
    assert.ok(err)
    // 原目录未被移动，task.json.status 仍是 planning（不能留下半完成态）
    assert.equal(existsSync(join(root, '.workloom', created.taskRelPath)), true)
    assert.equal(readTaskJson(root, created.taskRelPath).status, TaskStatus.PLANNING)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('after_archive hooks 执行并注入 TASK_JSON_PATH，失败不阻塞', async () => {
  const root = makeRoot({
    config: `
hooks:
  after_archive:
    - "echo archived > archived.txt"
    - "echo $TASK_JSON_PATH > archived-path.txt"
    - "exit 1"
`,
  })
  try {
    const [, created] = await createTask(root, { title: 'Archive Hook' })
    const [err] = await archiveTask(root, { taskRelPath: created.taskRelPath, autoCommit: false })
    assert.equal(err, null)
    assert.equal(readFileSync(join(root, 'archived.txt'), 'utf8').trim(), 'archived')
    const now = new Date()
    const yyyyMm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const expectedJson = join(
      root,
      '.workloom',
      'tasks',
      'archive',
      yyyyMm,
      'archive-hook',
      'task.json',
    )
    assert.equal(readFileSync(join(root, 'archived-path.txt'), 'utf8').trim(), expectedJson)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('startTask 传入 contextKey 时写入会话指针', async () => {
  const root = makeRoot()
  try {
    const [, created] = await createTask(root, { title: 'Start Pointer' })
    const [err] = await startTask(root, { taskRelPath: created.taskRelPath, contextKey: 'dsh_sp1' })
    assert.equal(err, null)
    assert.equal(resolveActiveTask(root, 'dsh_sp1')[1], created.taskRelPath)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('archiveTask 显式 autoCommit: false 覆盖 config 默认开启', async () => {
  const root = makeRoot({ config: 'session_auto_commit: true\n' })
  runGit(root, ['init'])
  runGit(root, ['config', 'user.email', 'test@example.com'])
  runGit(root, ['config', 'user.name', 'test'])
  try {
    const [, created] = await createTask(root, { title: 'Force Off' })
    const [err] = await archiveTask(root, { taskRelPath: created.taskRelPath, autoCommit: false })
    assert.equal(err, null)
    let hasCommit = true
    try {
      execFileSync('git', ['rev-parse', '--verify', 'HEAD'], { cwd: root, stdio: 'pipe' })
    } catch {
      hasCommit = false
    }
    assert.equal(hasCommit, false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('listTasks 跳过损坏的任务目录', async () => {
  const root = makeRoot()
  try {
    await createTask(root, { title: 'Good One' })
    // 伪造一个无 task.json 的目录
    mkdirSync(join(root, '.workloom', 'tasks', '09-01-broken'), { recursive: true })
    const [err, list] = listTasks(root)
    assert.equal(err, null)
    assert.equal(list.length, 1)
    assert.equal(list[0].name, 'good-one')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('listTasks 摘要与状态过滤，归档后不再出现', async () => {
  const root = makeRoot()
  try {
    const [, t1] = await createTask(root, { title: 'List One' })
    const [, t2] = await createTask(root, { title: 'List Two' })
    await startTask(root, { taskRelPath: t2.taskRelPath })
    const [err, list] = listTasks(root)
    assert.equal(err, null)
    assert.equal(list.length, 2)
    assert.deepEqual(Object.keys(list[0]).sort(), [
      'createdAt',
      'name',
      'priority',
      'status',
      'title',
    ])
    const [err2, filtered] = listTasks(root, { status: TaskStatus.IN_PROGRESS })
    assert.equal(err2, null)
    assert.equal(filtered.length, 1)
    assert.equal(filtered[0].name, 'list-two')
    await archiveTask(root, { taskRelPath: t1.taskRelPath, autoCommit: false })
    const [, after] = listTasks(root)
    assert.equal(after.length, 1)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
