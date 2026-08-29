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
  checkTask,
  finishTask,
  archiveTask,
  listTasks,
  readTask,
  recordExecutorDispatch,
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
    assert.equal(task.check, null)
    assert.deepEqual(task.overrides, [])
    assert.deepEqual(task.hooks, {
      after_create: [],
      after_start: [],
      after_finish: [],
      after_archive: [],
    })
    // prd.md 骨架：首行 H1 为任务标题，后接四小节
    const prd = readFileSync(join(root, '.workloom', result.taskRelPath, 'prd.md'), 'utf8')
    assert.match(prd, /^# Hello World!\n\n/)
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
    satisfyStartGate(root, created.taskRelPath)
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
    const [err, task] = await archiveTask(root, {
      taskRelPath: created.taskRelPath,
      force: true,
      reason: 'test archives without check gate',
    })
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
    const [err] = await archiveTask(root, {
      taskRelPath: created.taskRelPath,
      force: true,
      reason: 'test archives without check gate',
    })
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
    const [err, task] = await archiveTask(root, {
      taskRelPath: created.taskRelPath,
      force: true,
      reason: 'test archives without check gate',
    })
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
    const [err] = await archiveTask(root, {
      taskRelPath: created.taskRelPath,
      autoCommit: false,
      force: true,
      reason: 'test archives without check gate',
    })
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
    const [err] = await archiveTask(root, {
      taskRelPath: created.taskRelPath,
      autoCommit: false,
      force: true,
      reason: 'test archives without check gate',
    })
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
    const [err] = await archiveTask(root, {
      taskRelPath: created.taskRelPath,
      autoCommit: false,
      force: true,
      reason: 'test archives without check gate',
    })
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
    satisfyStartGate(root, created.taskRelPath)
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
    const [err] = await archiveTask(root, {
      taskRelPath: created.taskRelPath,
      autoCommit: false,
      force: true,
      reason: 'test archives without check gate',
    })
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
    satisfyStartGate(root, t2.taskRelPath)
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
    await archiveTask(root, {
      taskRelPath: t1.taskRelPath,
      autoCommit: false,
      force: true,
      reason: 'test archives without check gate',
    })
    const [, after] = listTasks(root)
    assert.equal(after.length, 1)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('旧格式 task.json（缺 hooks 字段）读取归一化，归档不再抛错', async () => {
  const root = makeRoot()
  try {
    // 模拟 hooks 机制引入前的旧任务：无 hooks 字段
    const legacyRel = join('tasks', '08-26-legacy-no-hooks')
    mkdirSync(join(root, '.workloom', legacyRel), { recursive: true })
    writeFileSync(
      join(root, '.workloom', legacyRel, 'task.json'),
      JSON.stringify({
        id: 'legacy-1',
        name: 'legacy-no-hooks',
        status: TaskStatus.IN_PROGRESS,
        createdAt: '2026-08-26',
      }),
    )
    // 读取即归一化：hooks 补齐空数组；check/overrides 补 null/空数组
    const [readErr, task] = readTask(root, legacyRel)
    assert.equal(readErr, null)
    assert.deepEqual(task.hooks, {
      after_create: [],
      after_start: [],
      after_finish: [],
      after_archive: [],
    })
    assert.equal(task.check, null)
    assert.deepEqual(task.overrides, [])
    // 存量任务无 check 凭据：archive 门禁硬阻断
    const [gateErr] = await archiveTask(root, { taskRelPath: legacyRel, autoCommit: false })
    assert.ok(gateErr)
    assert.match(gateErr.message, /archive gate failed/)
    // force 豁免放行并留痕（归档旧任务也不再触发 undefined.after_archive）
    const [archiveErr, archived] = await archiveTask(root, {
      taskRelPath: legacyRel,
      autoCommit: false,
      force: true,
      reason: 'legacy task predates the check gate',
    })
    assert.equal(archiveErr, null)
    assert.equal(archived.status, TaskStatus.COMPLETED)
    assert.equal(archived.overrides.length, 1)
    assert.equal(archived.overrides[0].gate, 'archive')
    // 落盘的归档 task.json 也带完整 hooks
    assert.deepEqual(readTaskJson(root, archived.taskRelPath).hooks, {
      after_create: [],
      after_start: [],
      after_finish: [],
      after_archive: [],
    })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('hooks 仅含部分事件时补齐其余空数组', async () => {
  const root = makeRoot()
  try {
    const rel = join('tasks', '08-26-partial-hooks')
    mkdirSync(join(root, '.workloom', rel), { recursive: true })
    writeFileSync(
      join(root, '.workloom', rel, 'task.json'),
      JSON.stringify({
        id: 'partial-1',
        name: 'partial-hooks',
        status: TaskStatus.IN_PROGRESS,
        hooks: { after_archive: ['echo done'] },
      }),
    )
    const [err, task] = readTask(root, rel)
    assert.equal(err, null)
    assert.deepEqual(task.hooks, {
      after_create: [],
      after_start: [],
      after_finish: [],
      after_archive: ['echo done'],
    })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

/** 填满 prd 四小节（脱离 placeholder，首行带 H1）。 */
function writeFilledPrd(root, taskRelPath) {
  writeFileSync(
    join(root, '.workloom', taskRelPath, 'prd.md'),
    '# Filled\n\n## Goal\n\nDo the thing.\n\n## Requirements\n\n- req\n\n## Acceptance Criteria\n\n- ac\n\n## Notes\n\n- note\n',
  )
}

/** 写入一条有效 jsonl 记录（覆盖 seed）。 */
function writeEffectiveJsonl(root, taskRelPath, name) {
  writeFileSync(
    join(root, '.workloom', taskRelPath, name),
    '{"file": "AGENTS.md", "reason": "spec"}\n',
  )
}

/** 满足 start 门禁：填 prd + 两个 jsonl 各一条有效记录。 */
function satisfyStartGate(root, taskRelPath) {
  writeFilledPrd(root, taskRelPath)
  writeEffectiveJsonl(root, taskRelPath, 'implement.jsonl')
  writeEffectiveJsonl(root, taskRelPath, 'check.jsonl')
}

test('start 门禁：骨架 prd 与 seed jsonl 被拒绝，状态保持 planning', async () => {
  const root = makeRoot()
  try {
    const [, created] = await createTask(root, { title: 'Gated Start' })
    const [err, task] = await startTask(root, { taskRelPath: created.taskRelPath })
    assert.ok(err)
    assert.equal(task, null)
    assert.match(err.message, /start gate failed/)
    assert.match(err.message, /Goal/)
    assert.match(err.message, /implement\.jsonl has no effective records/)
    assert.match(err.message, /check\.jsonl has no effective records/)
    assert.equal(readTaskJson(root, created.taskRelPath).status, TaskStatus.PLANNING)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('start 门禁：prd 填满后仍要求两个 jsonl 各有有效记录', async () => {
  const root = makeRoot()
  try {
    const [, created] = await createTask(root, { title: 'Gated Jsonl' })
    writeFilledPrd(root, created.taskRelPath)
    const [err1] = await startTask(root, { taskRelPath: created.taskRelPath })
    assert.ok(err1)
    assert.match(err1.message, /implement\.jsonl has no effective records/)
    writeEffectiveJsonl(root, created.taskRelPath, 'implement.jsonl')
    const [err2] = await startTask(root, { taskRelPath: created.taskRelPath })
    assert.ok(err2)
    assert.match(err2.message, /check\.jsonl has no effective records/)
    assert.doesNotMatch(err2.message, /implement\.jsonl/)
    // 全部满足后放行
    writeEffectiveJsonl(root, created.taskRelPath, 'check.jsonl')
    const [err3, started] = await startTask(root, { taskRelPath: created.taskRelPath })
    assert.equal(err3, null)
    assert.equal(started.status, TaskStatus.IN_PROGRESS)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('start 门禁：force 放行并记录 overrides（含 reason）', async () => {
  const root = makeRoot()
  try {
    const [, created] = await createTask(root, { title: 'Force Start' })
    const [err, started] = await startTask(root, {
      taskRelPath: created.taskRelPath,
      force: true,
      reason: 'hotfix, no spec to reference',
    })
    assert.equal(err, null)
    assert.equal(started.status, TaskStatus.IN_PROGRESS)
    const overrides = readTaskJson(root, created.taskRelPath).overrides
    assert.equal(overrides.length, 1)
    assert.equal(overrides[0].gate, 'start')
    assert.equal(overrides[0].tool, 'workloom_task_start')
    assert.equal(overrides[0].reason, 'hotfix, no spec to reference')
    assert.ok(!Number.isNaN(Date.parse(overrides[0].at)))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('start 门禁：prd 无一级标题（H1）被拒绝，补上后放行', async () => {
  const root = makeRoot()
  try {
    const [, created] = await createTask(root, { title: 'Gated H1' })
    // 填满小节但首行不是 H1：门禁必须拒绝
    writeFileSync(
      join(root, '.workloom', created.taskRelPath, 'prd.md'),
      '## Goal\n\nDo the thing.\n\n## Requirements\n\n- req\n\n## Acceptance Criteria\n\n- ac\n\n## Notes\n\n- note\n',
    )
    writeEffectiveJsonl(root, created.taskRelPath, 'implement.jsonl')
    writeEffectiveJsonl(root, created.taskRelPath, 'check.jsonl')
    const [err1] = await startTask(root, { taskRelPath: created.taskRelPath })
    assert.ok(err1)
    assert.match(err1.message, /prd\.md missing H1 title/)
    assert.equal(readTaskJson(root, created.taskRelPath).status, TaskStatus.PLANNING)
    // 首行补上 H1 后放行
    writeFilledPrd(root, created.taskRelPath)
    const [err2, started] = await startTask(root, { taskRelPath: created.taskRelPath })
    assert.equal(err2, null)
    assert.equal(started.status, TaskStatus.IN_PROGRESS)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('checkTask 写入 check 字段，重复调用覆盖并刷新 passedAt', async () => {
  const root = makeRoot()
  try {
    const [, created] = await createTask(root, { title: 'Check Me' })
    satisfyStartGate(root, created.taskRelPath)
    await startTask(root, { taskRelPath: created.taskRelPath })
    const [err, task] = await checkTask(root, {
      taskRelPath: created.taskRelPath,
      summary: 'reviewed against spec, lint green',
    })
    assert.equal(err, null)
    assert.ok(task.check)
    assert.equal(task.check.summary, 'reviewed against spec, lint green')
    assert.ok(!Number.isNaN(Date.parse(task.check.passedAt)))
    const first = readTaskJson(root, created.taskRelPath).check
    assert.equal(first.summary, 'reviewed against spec, lint green')
    // 重复调用覆盖（passedAt 刷新为合法 ISO 即可，断言传参差异在 summary）
    const [err2, task2] = await checkTask(root, {
      taskRelPath: created.taskRelPath,
      summary: 're-check after fix',
    })
    assert.equal(err2, null)
    assert.equal(readTaskJson(root, created.taskRelPath).check.summary, 're-check after fix')
    assert.ok(!Number.isNaN(Date.parse(task2.check.passedAt)))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('checkTask 要求 in_progress 与非空 summary', async () => {
  const root = makeRoot()
  try {
    const [, created] = await createTask(root, { title: 'Check States' })
    writeEffectiveJsonl(root, created.taskRelPath, 'check.jsonl')
    const [err1] = await checkTask(root, {
      taskRelPath: created.taskRelPath,
      summary: 'too early',
    })
    assert.ok(err1)
    assert.match(err1.message, /in_progress/)
    satisfyStartGate(root, created.taskRelPath)
    await startTask(root, { taskRelPath: created.taskRelPath })
    const [err2] = await checkTask(root, { taskRelPath: created.taskRelPath, summary: '  ' })
    assert.ok(err2)
    assert.match(err2.message, /summary/)
    // 校验失败不留 check 字段
    assert.equal(readTaskJson(root, created.taskRelPath).check, null)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('checkTask 门禁：check.jsonl 无有效记录被拒绝，force 放行并留痕', async () => {
  const root = makeRoot()
  try {
    const [, created] = await createTask(root, { title: 'Check Gate' })
    satisfyStartGate(root, created.taskRelPath)
    await startTask(root, { taskRelPath: created.taskRelPath })
    // 清掉 check.jsonl 有效记录，模拟 check 上下文缺失（start 之后再清，绕过 start 门禁）
    writeFileSync(
      join(root, '.workloom', created.taskRelPath, 'check.jsonl'),
      '{"_example": "seed"}\n',
    )
    const [err1] = await checkTask(root, {
      taskRelPath: created.taskRelPath,
      summary: 'no context',
    })
    assert.ok(err1)
    assert.match(err1.message, /check gate failed/)
    assert.match(err1.message, /check\.jsonl has no effective records/)
    assert.equal(readTaskJson(root, created.taskRelPath).check, null)
    const [err2, task2] = await checkTask(root, {
      taskRelPath: created.taskRelPath,
      summary: 'hotfix check',
      force: true,
      reason: 'urgent hotfix',
    })
    assert.equal(err2, null)
    assert.equal(task2.check.summary, 'hotfix check')
    const saved = readTaskJson(root, created.taskRelPath)
    assert.equal(saved.overrides.length, 1)
    assert.equal(saved.overrides[0].gate, 'check')
    assert.equal(saved.overrides[0].tool, 'workloom_task_check')
    assert.equal(saved.overrides[0].reason, 'urgent hotfix')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('archive 门禁：无 check 字段拒绝归档且不移动目录（不区分新旧任务）', async () => {
  const root = makeRoot()
  try {
    const [, created] = await createTask(root, { title: 'Archive Gate' })
    const [err, task] = await archiveTask(root, {
      taskRelPath: created.taskRelPath,
      autoCommit: false,
    })
    assert.ok(err)
    assert.equal(task, null)
    assert.match(err.message, /archive gate failed/)
    assert.match(err.message, /no recorded check/)
    // 原目录未动，状态不变
    assert.equal(existsSync(join(root, '.workloom', created.taskRelPath)), true)
    assert.equal(readTaskJson(root, created.taskRelPath).status, TaskStatus.PLANNING)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('archive 门禁：checkTask 留痕后归档成功（完整链路）', async () => {
  const root = makeRoot()
  try {
    const [, created] = await createTask(root, { title: 'Archive Checked' })
    satisfyStartGate(root, created.taskRelPath)
    await startTask(root, { taskRelPath: created.taskRelPath })
    await checkTask(root, {
      taskRelPath: created.taskRelPath,
      summary: 'full review passed',
    })
    const [err, task] = await archiveTask(root, {
      taskRelPath: created.taskRelPath,
      autoCommit: false,
    })
    assert.equal(err, null)
    assert.equal(task.status, TaskStatus.COMPLETED)
    // 归档位置的 task.json 保留 check 凭据
    assert.equal(readTaskJson(root, task.taskRelPath).check.summary, 'full review passed')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('archive 门禁：force 放行，overrides 写入归档后的 task.json', async () => {
  const root = makeRoot()
  try {
    const [, created] = await createTask(root, { title: 'Archive Force' })
    const [err, task] = await archiveTask(root, {
      taskRelPath: created.taskRelPath,
      autoCommit: false,
      force: true,
      reason: 'legacy task, check not applicable',
    })
    assert.equal(err, null)
    const archived = readTaskJson(root, task.taskRelPath)
    assert.equal(archived.status, TaskStatus.COMPLETED)
    assert.equal(archived.overrides.length, 1)
    assert.equal(archived.overrides[0].gate, 'archive')
    assert.equal(archived.overrides[0].tool, 'workloom_task_archive')
    assert.equal(archived.overrides[0].reason, 'legacy task, check not applicable')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

/** 写含「UI Design」小节的填满 prd（H1 + 四小节填满 + UI Design 额外节）。 */
function writeUiPrd(root, taskRelPath) {
  writeFileSync(
    join(root, '.workloom', taskRelPath, 'prd.md'),
    '# UI Task\n\n## Goal\n\nDo the UI.\n\n## Requirements\n\n- req\n\n## Acceptance Criteria\n\n- ac\n\n## Notes\n\n- note\n\n## UI Design\n\n- pages and IA\n',
  )
}

test('readTask 归一化：缺 dispatches 字段的旧 task.json 补默认空数组', async () => {
  const root = makeRoot()
  try {
    const rel = join('tasks', '08-26-no-dispatches')
    mkdirSync(join(root, '.workloom', rel), { recursive: true })
    writeFileSync(
      join(root, '.workloom', rel, 'task.json'),
      JSON.stringify({ id: 'x', name: 'no-dispatches', status: TaskStatus.PLANNING }),
    )
    const [err, task] = readTask(root, rel)
    assert.equal(err, null)
    assert.deepEqual(task.dispatches, [])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('recordExecutorDispatch 追加派发记录（kind/at/title），保留已有条目', async () => {
  const root = makeRoot()
  try {
    const [, created] = await createTask(root, { title: 'Dispatch Record' })
    const [err1] = recordExecutorDispatch(root, created.taskRelPath, {
      kind: 'research',
      title: 'r1',
    })
    assert.equal(err1, null)
    const [err2] = recordExecutorDispatch(root, created.taskRelPath, {
      kind: 'frontend',
      title: 'ui impl',
    })
    assert.equal(err2, null)
    const task = readTaskJson(root, created.taskRelPath)
    assert.equal(task.dispatches.length, 2)
    assert.equal(task.dispatches[0].kind, 'research')
    assert.equal(task.dispatches[0].title, 'r1')
    assert.equal(task.dispatches[1].kind, 'frontend')
    assert.equal(task.dispatches[1].title, 'ui impl')
    for (const entry of task.dispatches) {
      assert.ok(!Number.isNaN(Date.parse(entry.at)))
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('recordExecutorDispatch 校验 kind/title，非法值返回 err（fail loud）', async () => {
  const root = makeRoot()
  try {
    const [, created] = await createTask(root, { title: 'Dispatch Bad' })
    const [err1] = recordExecutorDispatch(root, created.taskRelPath, {
      kind: 'bogus',
      title: 'x',
    })
    assert.ok(err1)
    assert.match(err1.message, /invalid dispatch kind/)
    const [err2] = recordExecutorDispatch(root, created.taskRelPath, {
      kind: 'frontend',
      title: '   ',
    })
    assert.ok(err2)
    assert.match(err2.message, /non-empty string/)
    assert.equal(readTaskJson(root, created.taskRelPath).dispatches.length, 0)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('checkTask 前端派发门禁：prd 含 UI Design 且无 frontend 派发被拒绝，补派发后放行', async () => {
  const root = makeRoot()
  try {
    const [, created] = await createTask(root, { title: 'UI Gate' })
    writeUiPrd(root, created.taskRelPath)
    writeEffectiveJsonl(root, created.taskRelPath, 'implement.jsonl')
    writeEffectiveJsonl(root, created.taskRelPath, 'check.jsonl')
    await startTask(root, { taskRelPath: created.taskRelPath })
    const [err1] = await checkTask(root, {
      taskRelPath: created.taskRelPath,
      summary: 'no ui dispatch',
    })
    assert.ok(err1)
    assert.match(err1.message, /no frontend dispatch recorded for a task with UI requirements/)
    assert.equal(readTaskJson(root, created.taskRelPath).check, null)
    // 补 frontend 派发后放行
    const [recErr] = recordExecutorDispatch(root, created.taskRelPath, {
      kind: 'frontend',
      title: 'ui impl',
    })
    assert.equal(recErr, null)
    const [err2, task2] = await checkTask(root, {
      taskRelPath: created.taskRelPath,
      summary: 'with ui dispatch',
    })
    assert.equal(err2, null)
    assert.equal(task2.check.summary, 'with ui dispatch')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('checkTask 前端派发门禁：force 放行并留痕 overrides', async () => {
  const root = makeRoot()
  try {
    const [, created] = await createTask(root, { title: 'UI Gate Force' })
    writeUiPrd(root, created.taskRelPath)
    writeEffectiveJsonl(root, created.taskRelPath, 'implement.jsonl')
    writeEffectiveJsonl(root, created.taskRelPath, 'check.jsonl')
    await startTask(root, { taskRelPath: created.taskRelPath })
    const [err, task] = await checkTask(root, {
      taskRelPath: created.taskRelPath,
      summary: 'force ui',
      force: true,
      reason: 'ui not applicable',
    })
    assert.equal(err, null)
    assert.equal(task.check.summary, 'force ui')
    const saved = readTaskJson(root, created.taskRelPath)
    assert.equal(saved.overrides.length, 1)
    assert.equal(saved.overrides[0].gate, 'check')
    assert.equal(saved.overrides[0].tool, 'workloom_task_check')
    assert.equal(saved.overrides[0].reason, 'ui not applicable')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
