/**
 * task-store 模块单测：布局、slug、状态迁移、指针清理、归档与 hooks。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  TaskStatus,
  TaskStage,
  slugify,
  createTask,
  startTask,
  checkTask,
  finishTask,
  archiveTask,
  listTasks,
  readTask,
  recordAlignmentCredential,
  recordExecutorDispatch,
  recordGateOverride,
  settleExecutorDispatch,
  runTaskHooks,
  computeTaskStage,
} from '../src/legacy/task-store.js'
import { computePrdHash } from '../src/legacy/alignment.js'
import { EXECUTOR_KINDS } from '../src/legacy/executor-context.js'
import { resolveActiveTask, setActiveTask } from '../src/legacy/active-task.js'

/** 创建临时项目根（含 .workloom，可选 config 与 .developer）。 */
function makeRoot(options = {}) {
  const root = mkdtempSync(join(tmpdir(), 'workloom-task-'))
  mkdirSync(join(root, '.workloom'))
  if (options.config !== undefined) {
    writeFileSync(join(root, '.workloom', 'config.json'), JSON.stringify(options.config))
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

test('createTask 自定义参数（priority/description）与非法优先级', async () => {
  const root = makeRoot() // 无 .developer，creator 应为空串
  try {
    const [err, result] = await createTask(root, {
      title: 'Custom',
      priority: 'P0',
      description: 'desc',
    })
    assert.equal(err, null)
    assert.ok(result)
    const task = readTaskJson(root, result.taskRelPath)
    assert.equal(task.creator, '')
    assert.equal(task.priority, 'P0')
    assert.equal(task.description, 'desc')
    assert.equal(task.parent, null)
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
  const root = makeRoot({ config: { session_auto_commit: true } })
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
  const root = makeRoot({ config: { session_auto_commit: false } })
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
  const root = makeRoot({ config: { session_auto_commit: true } })
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
    config: {
      hooks: {
        after_create: [
          'echo created > created.txt',
          'echo $TASK_JSON_PATH > taskjson.txt',
          'exit 1',
        ],
      },
    },
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
    config: {
      hooks: {
        after_archive: [
          'echo archived > archived.txt',
          'echo $TASK_JSON_PATH > archived-path.txt',
          'exit 1',
        ],
      },
    },
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
  const root = makeRoot({ config: { session_auto_commit: true } })
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
      'parent',
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

/** 记录 alignment 凭据（hash 取当前 prd.md；模拟 workloom_task_align confirm 成功）。 */
function recordAlignment(root, taskRelPath) {
  const prd = readFileSync(join(root, '.workloom', taskRelPath, 'prd.md'), 'utf8')
  const [err] = recordAlignmentCredential(root, taskRelPath, {
    summary: 'frontier empty, all decisions settled',
    prdHash: computePrdHash(prd),
  })
  assert.equal(err, null)
}

/**
 * 满足 start 门禁：填 prd + 两个 jsonl 各一条有效记录 + 记录 alignment 凭据
 * （startTask 成功前置的快捷组合；旧 grilling 判定不再参与门禁）。
 */
function satisfyStartGate(root, taskRelPath) {
  writeFilledPrd(root, taskRelPath)
  writeEffectiveJsonl(root, taskRelPath, 'implement.jsonl')
  writeEffectiveJsonl(root, taskRelPath, 'check.jsonl')
  recordAlignment(root, taskRelPath)
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
    recordAlignment(root, created.taskRelPath)
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
    recordAlignment(root, created.taskRelPath)
    const [err2, started] = await startTask(root, { taskRelPath: created.taskRelPath })
    assert.equal(err2, null)
    assert.equal(started.status, TaskStatus.IN_PROGRESS)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('start 门禁：planning 无 alignment 凭据被拦截，confirm 后放行', async () => {
  const root = makeRoot()
  try {
    const [, created] = await createTask(root, { title: 'Gated Align' })
    satisfyStartGate(root, created.taskRelPath)
    // 清掉 alignment 凭据（模拟旧 planning 任务 / confirm 前状态）
    const raw = readTaskJson(root, created.taskRelPath)
    delete raw.alignment
    writeFileSync(join(root, '.workloom', created.taskRelPath, 'task.json'), JSON.stringify(raw))
    const [err1] = await startTask(root, { taskRelPath: created.taskRelPath })
    assert.ok(err1)
    assert.match(err1.message, /no alignment credential recorded/)
    assert.match(err1.message, /workloom_task_align/)
    assert.equal(readTaskJson(root, created.taskRelPath).status, TaskStatus.PLANNING)
    // 重新 confirm（recordAlignment）后放行
    recordAlignment(root, created.taskRelPath)
    const [err2, started] = await startTask(root, { taskRelPath: created.taskRelPath })
    assert.equal(err2, null)
    assert.equal(started.status, TaskStatus.IN_PROGRESS)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('start 门禁：凭据 stale（prd 变化）被拦截，重新 confirm 后恢复', async () => {
  const root = makeRoot()
  try {
    const [, created] = await createTask(root, { title: 'Gated Stale' })
    satisfyStartGate(root, created.taskRelPath)
    // prd 在 confirm 后被用户修改 → 凭据 hash 失配（stale）
    writeFileSync(
      join(root, '.workloom', created.taskRelPath, 'prd.md'),
      '# Filled\n\n## Goal\n\nChanged requirement.\n\n## Requirements\n\n- req2\n\n## Acceptance Criteria\n\n- ac\n\n## Notes\n\n- note\n',
    )
    const [err1] = await startTask(root, { taskRelPath: created.taskRelPath })
    assert.ok(err1)
    assert.match(err1.message, /alignment credential is stale/)
    // 重新 confirm（新 hash）后恢复
    recordAlignment(root, created.taskRelPath)
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

test('readTask 归一化：缺 stage 字段的旧 task.json 补默认 implement', async () => {
  const root = makeRoot()
  try {
    const rel = join('tasks', '08-26-no-stage')
    mkdirSync(join(root, '.workloom', rel), { recursive: true })
    writeFileSync(
      join(root, '.workloom', rel, 'task.json'),
      JSON.stringify({ id: 'x', name: 'no-stage', status: TaskStatus.PLANNING }),
    )
    const [err, task] = readTask(root, rel)
    assert.equal(err, null)
    assert.equal(task.stage, TaskStage.IMPLEMENT)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('recordExecutorDispatch 同点更新 stage（implement/frontend→implement，check→check，research 保持）', async () => {
  const root = makeRoot()
  try {
    const [, created] = await createTask(root, { title: 'Dispatch Stage' })
    // 新任务默认 implement 阶段（显式字段落盘）
    assert.equal(readTaskJson(root, created.taskRelPath).stage, TaskStage.IMPLEMENT)
    // implement 派发 → implement
    recordExecutorDispatch(root, created.taskRelPath, {
      kind: EXECUTOR_KINDS.implement,
      title: 'i1',
    })
    assert.equal(readTaskJson(root, created.taskRelPath).stage, TaskStage.IMPLEMENT)
    // check 派发 → check
    recordExecutorDispatch(root, created.taskRelPath, { kind: EXECUTOR_KINDS.check, title: 'c1' })
    assert.equal(readTaskJson(root, created.taskRelPath).stage, TaskStage.CHECK)
    // frontend 派发 → implement（check 阶段派 frontend 视为回到实现期）
    recordExecutorDispatch(root, created.taskRelPath, {
      kind: EXECUTOR_KINDS.frontend,
      title: 'f1',
    })
    assert.equal(readTaskJson(root, created.taskRelPath).stage, TaskStage.IMPLEMENT)
    // research 保持当前值（先置 check 再派 research，仍为 check）
    recordExecutorDispatch(root, created.taskRelPath, { kind: EXECUTOR_KINDS.check, title: 'c2' })
    recordExecutorDispatch(root, created.taskRelPath, {
      kind: EXECUTOR_KINDS.research,
      title: 'r2',
    })
    assert.equal(readTaskJson(root, created.taskRelPath).stage, TaskStage.CHECK)
    // dispatches 与 stage 同点落盘：两者一致（5 条派发记录）
    const saved = readTaskJson(root, created.taskRelPath)
    assert.equal(saved.dispatches.length, 5)
    assert.equal(saved.stage, TaskStage.CHECK)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('computeTaskStage 纯函数：四 kind 映射、research 保持 current、非法 kind 抛错', () => {
  // implement/frontend → implement（无论 current）
  assert.equal(computeTaskStage(TaskStage.IMPLEMENT, EXECUTOR_KINDS.implement), TaskStage.IMPLEMENT)
  assert.equal(computeTaskStage(TaskStage.CHECK, EXECUTOR_KINDS.implement), TaskStage.IMPLEMENT)
  assert.equal(computeTaskStage(TaskStage.IMPLEMENT, EXECUTOR_KINDS.frontend), TaskStage.IMPLEMENT)
  assert.equal(computeTaskStage(TaskStage.CHECK, EXECUTOR_KINDS.frontend), TaskStage.IMPLEMENT)
  // check → check（无论 current）
  assert.equal(computeTaskStage(TaskStage.IMPLEMENT, EXECUTOR_KINDS.check), TaskStage.CHECK)
  assert.equal(computeTaskStage(TaskStage.CHECK, EXECUTOR_KINDS.check), TaskStage.CHECK)
  // research 保持 current
  assert.equal(computeTaskStage(TaskStage.IMPLEMENT, EXECUTOR_KINDS.research), TaskStage.IMPLEMENT)
  assert.equal(computeTaskStage(TaskStage.CHECK, EXECUTOR_KINDS.research), TaskStage.CHECK)
  // 非法 kind（含 undefined）抛错（fail loud）
  assert.throws(() => computeTaskStage(TaskStage.IMPLEMENT, 'bogus'), /invalid kind/)
  assert.throws(() => computeTaskStage(TaskStage.IMPLEMENT, undefined), /invalid kind/)
})

test('checkTask 前端派发门禁：prd 含 UI Design 且无 frontend 派发被拒绝，补派发后放行', async () => {
  const root = makeRoot()
  try {
    const [, created] = await createTask(root, { title: 'UI Gate' })
    writeUiPrd(root, created.taskRelPath)
    writeEffectiveJsonl(root, created.taskRelPath, 'implement.jsonl')
    writeEffectiveJsonl(root, created.taskRelPath, 'check.jsonl')
    recordAlignment(root, created.taskRelPath)
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
    recordAlignment(root, created.taskRelPath)
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

/** 计算今天生成的 child taskRelPath（用于断言未产生写入/预测去重路径）。 */
function childRelFor(slug) {
  const now = new Date()
  const mmdd = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  return join('tasks', `${mmdd}-${slug}`)
}

test('createTask 校验：parent 两种形式归一（tasks/ 前缀补全）且存储一致', async () => {
  const root = makeRoot()
  try {
    const [, parent] = await createTask(root, { title: 'Parent Norm' })
    const bareId = parent.taskRelPath.slice('tasks/'.length)
    // 原样（tasks/ 前缀）
    const [err1, c1] = await createTask(root, { title: 'Child Norm A', parent: parent.taskRelPath })
    assert.equal(err1, null)
    assert.equal(c1.task.parent, parent.taskRelPath)
    // 补 tasks/ 前缀（bare id）
    const [err2, c2] = await createTask(root, { title: 'Child Norm B', parent: bareId })
    assert.equal(err2, null)
    assert.equal(c2.task.parent, parent.taskRelPath)
    // 父 children 稳定追加两个子任务路径
    const saved = readTaskJson(root, parent.taskRelPath)
    assert.deepEqual(saved.children, [c1.taskRelPath, c2.taskRelPath])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('createTask 校验：parent 不存在拒绝且不产生写入', async () => {
  const root = makeRoot()
  try {
    const [err, result] = await createTask(root, { title: 'Ghost Child', parent: 'tasks/99-99-ghost' })
    assert.ok(err)
    assert.equal(result, null)
    assert.match(err.message, /parent task not found/)
    // 子任务目录未被创建（不产生写入）
    assert.equal(existsSync(join(root, '.workloom', childRelFor('ghost-child'))), false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('createTask 校验：parent 自引用拒绝', async () => {
  const root = makeRoot()
  try {
    const [, parent] = await createTask(root, { title: 'Self' })
    // 用相同 slug 使新任务路径与 parent 相同 → 触发自引用（校验先于目录冲突检查）
    const [err] = await createTask(root, { title: 'Self', parent: parent.taskRelPath })
    assert.ok(err)
    assert.match(err.message, /cannot be its own parent/)
    // 仍只有原父任务一个
    const [, list] = listTasks(root)
    assert.equal(list.length, 1)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('createTask 校验：parent 状态 planning/in_progress 放行，completed 拒绝', async () => {
  const root = makeRoot()
  try {
    // planning 放行
    const [, p1] = await createTask(root, { title: 'Parent Planning' })
    const [err1, c1] = await createTask(root, { title: 'Child Planning', parent: p1.taskRelPath })
    assert.equal(err1, null)
    assert.ok(c1)
    // in_progress 放行（force 越过 start 门禁）
    const [, p2] = await createTask(root, { title: 'Parent InProgress' })
    await startTask(root, { taskRelPath: p2.taskRelPath, force: true, reason: 'test' })
    const [err2, c2] = await createTask(root, { title: 'Child InProgress', parent: p2.taskRelPath })
    assert.equal(err2, null)
    assert.ok(c2)
    // completed 拒绝（归档后 status=completed）
    const [, p3] = await createTask(root, { title: 'Parent Archived' })
    const [archErr, archived] = await archiveTask(root, {
      taskRelPath: p3.taskRelPath,
      autoCommit: false,
      force: true,
      reason: 'test',
    })
    assert.equal(archErr, null)
    const [err3] = await createTask(root, { title: 'Child Archived', parent: archived.taskRelPath })
    assert.ok(err3)
    assert.match(err3.message, /planning or in_progress/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('createTask 校验：parent 路径逃逸拒绝', async () => {
  const root = makeRoot()
  try {
    // 归一补 tasks/ 后仍解析出 .workloom 之外，insideWorkloom 抛错
    const [err] = await createTask(root, { title: 'Escape Child', parent: '../../outside' })
    assert.ok(err)
    assert.match(err.message, /escapes .workloom directory/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('createTask 校验：children 追加子任务路径', async () => {
  const root = makeRoot()
  try {
    const [, parent] = await createTask(root, { title: 'Parent Link' })
    const [err, child] = await createTask(root, { title: 'Child Link', parent: parent.taskRelPath })
    assert.equal(err, null)
    const saved = readTaskJson(root, parent.taskRelPath)
    assert.ok(saved.children.includes(child.taskRelPath))
    assert.equal(saved.children.length, 1)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('createTask 校验：children 去重追加（同路径不重复记录）', async () => {
  const root = makeRoot()
  try {
    const [, parent] = await createTask(root, { title: 'Parent Dedup' })
    const childRel = childRelFor('dup-child')
    // 预置父任务 children 已包含该子任务路径（模拟历史记录），创建同路径子任务时应去重
    const parentRecord = readTaskJson(root, parent.taskRelPath)
    parentRecord.children = [childRel]
    writeFileSync(join(root, '.workloom', parent.taskRelPath, 'task.json'), JSON.stringify(parentRecord))
    const [err, result] = await createTask(root, { title: 'Dup Child', parent: parent.taskRelPath })
    assert.equal(err, null)
    assert.equal(result.taskRelPath, childRel)
    const saved = readTaskJson(root, parent.taskRelPath)
    assert.deepEqual(saved.children, [childRel])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('createTask 校验：父 children 写回失败抛错（子任务已创建、父 children 未更新）', async () => {
  const root = makeRoot()
  try {
    const [, parent] = await createTask(root, { title: 'Parent RO' })
    const parentTaskJson = join(root, '.workloom', parent.taskRelPath, 'task.json')
    chmodSync(parentTaskJson, 0o444) // 父 task.json 只读 → 联动写回失败
    const [err, result] = await createTask(root, { title: 'Child RO', parent: parent.taskRelPath })
    assert.ok(err)
    assert.equal(result, null)
    assert.match(err.message, /child task created but parent children not updated/)
    // 子任务已创建（目录与 task.json 存在）
    assert.equal(existsSync(join(root, '.workloom', childRelFor('child-ro'))), true)
    // 父 children 未更新（仍为空；恢复权限便于读取断言）
    chmodSync(parentTaskJson, 0o644)
    assert.deepEqual(readTaskJson(root, parent.taskRelPath).children, [])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('readTask 归一化：缺 alignment 的旧 task.json 补 null，旧 grilling 原样透传（惰性数据不迁移）', async () => {
  const root = makeRoot()
  try {
    const rel = join('tasks', '08-26-no-alignment')
    mkdirSync(join(root, '.workloom', rel), { recursive: true })
    writeFileSync(
      join(root, '.workloom', rel, 'task.json'),
      JSON.stringify({
        id: 'x',
        name: 'no-alignment',
        status: TaskStatus.PLANNING,
        grilling: { required: true, passedAt: '2026-08-01T00:00:00Z', summary: 'old era' },
      }),
    )
    const [err, task] = readTask(root, rel)
    assert.equal(err, null)
    assert.equal(task.alignment, null)
    // 旧 grilling 字段原样保留（不重解释、不参与新语义）
    assert.deepEqual(task.grilling, {
      required: true,
      passedAt: '2026-08-01T00:00:00Z',
      summary: 'old era',
    })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('createTask 新建任务：alignment 默认 null 且不写 grilling 字段（旧语义不进新数据）', async () => {
  const root = makeRoot()
  try {
    const [, created] = await createTask(root, { title: 'New Model' })
    const saved = readTaskJson(root, created.taskRelPath)
    assert.equal(saved.alignment, null)
    assert.equal('grilling' in saved, false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('recordAlignmentCredential：planning 写入凭据（原子替换，无临时残留）', async () => {
  const root = makeRoot()
  try {
    const [, created] = await createTask(root, { title: 'Align Record' })
    const prd = '# Filled\n\n## Goal\n\nG.\n\n## Requirements\n\n- r\n\n## Acceptance Criteria\n\n- a\n\n## Notes\n\n- n\n'
    writeFileSync(join(root, '.workloom', created.taskRelPath, 'prd.md'), prd)
    const prdHash = computePrdHash(prd)
    const [err, task] = recordAlignmentCredential(root, created.taskRelPath, {
      summary: 'frontier empty',
      prdHash,
    })
    assert.equal(err, null)
    assert.equal(task.alignment.summary, 'frontier empty')
    assert.equal(task.alignment.prdHash, prdHash)
    assert.ok(!Number.isNaN(Date.parse(task.alignment.passedAt)))
    const saved = readTaskJson(root, created.taskRelPath)
    assert.equal(saved.alignment.prdHash, prdHash)
    // 原子替换无临时文件残留
    const dir = join(root, '.workloom', created.taskRelPath)
    const residue = readdirSync(dir).filter((name) => name.endsWith('.tmp'))
    assert.deepEqual(residue, [])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('recordAlignmentCredential：completed 拒绝；入参校验失败零写入', async () => {
  const root = makeRoot()
  try {
    const [, created] = await createTask(root, { title: 'Align Bad' })
    const prd = '# Filled\n\n## Goal\n\nG.\n\n## Requirements\n\n- r\n\n## Acceptance Criteria\n\n- a\n\n## Notes\n\n- n\n'
    writeFileSync(join(root, '.workloom', created.taskRelPath, 'prd.md'), prd)
    const prdHash = computePrdHash(prd)
    // summary 缺失 → 报错且不写
    const [err1] = recordAlignmentCredential(root, created.taskRelPath, { summary: '', prdHash })
    assert.ok(err1)
    assert.match(err1.message, /non-empty summary/)
    assert.equal(readTaskJson(root, created.taskRelPath).alignment, null)
    // prdHash 缺失 → 报错且不写
    const [err2] = recordAlignmentCredential(root, created.taskRelPath, { summary: 's', prdHash: '' })
    assert.ok(err2)
    assert.match(err2.message, /non-empty prdHash/)
    // completed 拒绝
    const [, archived] = await archiveTask(root, {
      taskRelPath: created.taskRelPath,
      force: true,
      reason: 'test archive for completed rejection',
    })
    assert.ok(archived)
    const [err3] = recordAlignmentCredential(root, archived.taskRelPath, {
      summary: 's',
      prdHash: 'deadbeef',
    })
    assert.ok(err3)
    assert.match(err3.message, /only planning\/in_progress/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('recordAlignmentCredential：相同 hash 幂等早退（不刷新 passedAt、不覆盖 summary）', async () => {
  const root = makeRoot()
  try {
    const [, created] = await createTask(root, { title: 'Align Idem' })
    const prd = '# Filled\n\n## Goal\n\nG.\n\n## Requirements\n\n- r\n\n## Acceptance Criteria\n\n- a\n\n## Notes\n\n- n\n'
    writeFileSync(join(root, '.workloom', created.taskRelPath, 'prd.md'), prd)
    const prdHash = computePrdHash(prd)
    const [err1, first] = recordAlignmentCredential(root, created.taskRelPath, {
      summary: 'first confirm',
      prdHash,
    })
    assert.equal(err1, null)
    const passedAt = first.alignment.passedAt
    // 同 hash 重复 confirm：幂等成功且不刷新 passedAt / summary（R11）
    const [err2, second] = recordAlignmentCredential(root, created.taskRelPath, {
      summary: 'second attempt',
      prdHash,
    })
    assert.equal(err2, null)
    assert.equal(second.alignment.passedAt, passedAt)
    assert.equal(second.alignment.summary, 'first confirm')
    assert.equal(readTaskJson(root, created.taskRelPath).alignment.summary, 'first confirm')
    // 不同 hash 视为新一轮确认：刷新 passedAt 与 summary
    const otherHash = computePrdHash(prd + '\n- changed')
    const [err3, third] = recordAlignmentCredential(root, created.taskRelPath, {
      summary: 're-confirmed after change',
      prdHash: otherHash,
    })
    assert.equal(err3, null)
    assert.equal(third.alignment.prdHash, otherHash)
    assert.equal(third.alignment.summary, 're-confirmed after change')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('recordAlignmentCredential：旧 grilling 字段往返不丢（窄写口写回保留惰性数据）', async () => {
  const root = makeRoot()
  try {
    const [, created] = await createTask(root, { title: 'Align Legacy' })
    // 预置旧 grilling 字段（模拟存量任务；写入绕过新 build 语义）
    const rel = created.taskRelPath
    const raw = readTaskJson(root, rel)
    raw.grilling = { required: true, passedAt: '2026-08-01T00:00:00Z', summary: 'old' }
    writeFileSync(join(root, '.workloom', rel, 'task.json'), JSON.stringify(raw))
    const prd = '# Filled\n\n## Goal\n\nG.\n\n## Requirements\n\n- r\n\n## Acceptance Criteria\n\n- a\n\n## Notes\n\n- n\n'
    writeFileSync(join(root, '.workloom', rel, 'prd.md'), prd)
    const [err] = recordAlignmentCredential(root, rel, {
      summary: 'new confirm',
      prdHash: computePrdHash(prd),
    })
    assert.equal(err, null)
    const saved = readTaskJson(root, rel)
    // grilling 不被迁移/改写/删除；alignment 并行写入
    assert.deepEqual(saved.grilling, {
      required: true,
      passedAt: '2026-08-01T00:00:00Z',
      summary: 'old',
    })
    assert.equal(saved.alignment.summary, 'new confirm')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

/** 写入与 satisfyStartGate 的 prd 不同的内容（confirm 后修改 → 凭据 stale）。 */
function writeChangedPrd(root, taskRelPath) {
  writeFileSync(
    join(root, '.workloom', taskRelPath, 'prd.md'),
    '# Filled\n\n## Goal\n\nChanged after confirm.\n\n## Requirements\n\n- req\n\n## Acceptance Criteria\n\n- ac\n\n## Notes\n\n- note\n',
  )
}

test('checkTask stale 门禁：in_progress 凭据 stale 拒绝写 check，重新确认后恢复', async () => {
  const root = makeRoot()
  try {
    const [, created] = await createTask(root, { title: 'Check Stale' })
    satisfyStartGate(root, created.taskRelPath)
    await startTask(root, { taskRelPath: created.taskRelPath })
    // prd 在 confirm 后变化 → 凭据 stale
    writeChangedPrd(root, created.taskRelPath)
    const [err1] = await checkTask(root, {
      taskRelPath: created.taskRelPath,
      summary: 'stale check',
    })
    assert.ok(err1)
    assert.match(err1.message, /alignment credential is stale/)
    assert.equal(readTaskJson(root, created.taskRelPath).check, null)
    // 重新确认（新 hash）后 check 恢复
    recordAlignment(root, created.taskRelPath)
    const [err2, task] = await checkTask(root, {
      taskRelPath: created.taskRelPath,
      summary: 'fresh check',
    })
    assert.equal(err2, null)
    assert.equal(task.check.summary, 'fresh check')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('checkTask stale 门禁：force 放行按实际绕过 gate 逐项留痕（check.jsonl 缺失 + stale 双记录）', async () => {
  const root = makeRoot()
  try {
    const [, created] = await createTask(root, { title: 'Check Stale Force' })
    satisfyStartGate(root, created.taskRelPath)
    await startTask(root, { taskRelPath: created.taskRelPath })
    writeChangedPrd(root, created.taskRelPath)
    // 清掉 check.jsonl 有效记录：check 门禁与 stale 门禁同时缺失
    writeFileSync(
      join(root, '.workloom', created.taskRelPath, 'check.jsonl'),
      '{"_example": "seed"}\n',
    )
    const [err, task] = await checkTask(root, {
      taskRelPath: created.taskRelPath,
      summary: 'dual bypass',
      force: true,
      reason: 'dual gates bypassed',
    })
    assert.equal(err, null)
    assert.equal(task.check.summary, 'dual bypass')
    const gates = readTaskJson(root, created.taskRelPath).overrides.map((o) => o.gate)
    // 每个实际绕过的 gate 独立留痕：check（jsonl 缺失）+ stale_alignment
    assert.deepEqual(gates, ['check', 'stale_alignment'])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('archiveTask stale 门禁：已有 check 后 prd 变化 → stale 拒绝；force 放行留 stale_alignment', async () => {
  const root = makeRoot()
  try {
    const [, created] = await createTask(root, { title: 'Archive Stale' })
    satisfyStartGate(root, created.taskRelPath)
    await startTask(root, { taskRelPath: created.taskRelPath })
    const [checkErr] = await checkTask(root, {
      taskRelPath: created.taskRelPath,
      summary: 'full review passed',
    })
    assert.equal(checkErr, null)
    writeChangedPrd(root, created.taskRelPath)
    const [err1] = await archiveTask(root, {
      taskRelPath: created.taskRelPath,
      autoCommit: false,
    })
    assert.ok(err1)
    assert.match(err1.message, /archive gate failed/)
    assert.match(err1.message, /alignment credential is stale/)
    // force：仅 stale 实际被绕过（check 已在档）→ 只留 stale_alignment 一条
    const [err2, archived] = await archiveTask(root, {
      taskRelPath: created.taskRelPath,
      autoCommit: false,
      force: true,
      reason: 'stale archive bypass',
    })
    assert.equal(err2, null)
    const gates = readTaskJson(root, archived.taskRelPath).overrides.map((o) => o.gate)
    assert.deepEqual(gates, ['stale_alignment'])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('archiveTask force：check 缺失 + stale 同时绕过 → archive 与 stale_alignment 双记录', async () => {
  const root = makeRoot()
  try {
    const [, created] = await createTask(root, { title: 'Archive Stale Dual' })
    satisfyStartGate(root, created.taskRelPath)
    await startTask(root, { taskRelPath: created.taskRelPath })
    writeChangedPrd(root, created.taskRelPath)
    const [err, archived] = await archiveTask(root, {
      taskRelPath: created.taskRelPath,
      autoCommit: false,
      force: true,
      reason: 'stale archive bypass',
    })
    assert.equal(err, null)
    const gates = readTaskJson(root, archived.taskRelPath).overrides.map((o) => o.gate)
    assert.deepEqual(gates, ['archive', 'stale_alignment'])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('recordGateOverride：按指定 gate 留痕（stale_alignment 审计），非法 gate 拒绝', async () => {
  const root = makeRoot()
  try {
    const [, created] = await createTask(root, { title: 'Gate Override' })
    const [err] = recordGateOverride(root, created.taskRelPath, 'stale_alignment', 'manual note')
    assert.equal(err, null)
    const record = readTaskJson(root, created.taskRelPath).overrides[0]
    assert.equal(record.gate, 'stale_alignment')
    assert.equal(record.tool, 'workloom_execute')
    assert.equal(record.reason, 'manual note')
    const [badErr] = recordGateOverride(root, created.taskRelPath, 'bogus', 'r')
    assert.ok(badErr)
    assert.match(badErr.message, /invalid gate override/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('listTasks 摘要包含 parent 字段', async () => {
  const root = makeRoot()
  try {
    const [, parent] = await createTask(root, { title: 'Summary Parent' })
    await createTask(root, { title: 'Summary Child', parent: parent.taskRelPath })
    const [, list] = listTasks(root)
    const childSummary = list.find((t) => t.title === 'Summary Child')
    assert.equal(childSummary.parent, parent.taskRelPath)
    const parentSummary = list.find((t) => t.title === 'Summary Parent')
    assert.equal(parentSummary.parent, null)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('recordExecutorDispatch 初写：派发记录含 status running，stage 更新语义保留', async () => {
  const root = makeRoot()
  try {
    const [, created] = await createTask(root, { title: 'Dispatch Running' })
    const [err] = recordExecutorDispatch(root, created.taskRelPath, {
      kind: 'frontend',
      title: 'ui impl',
      childId: 'child-1',
    })
    assert.equal(err, null)
    const saved = readTaskJson(root, created.taskRelPath)
    assert.equal(saved.dispatches.length, 1)
    assert.equal(saved.dispatches[0].status, 'running', 'initial write must record status running')
    assert.equal(saved.dispatches[0].childId, 'child-1')
    // stage 更新语义保留（frontend → implement）
    assert.equal(saved.stage, TaskStage.IMPLEMENT)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('settleExecutorDispatch 回填 completed/failed：只改 status/error，不动 stage、不重复计数', async () => {
  const root = makeRoot()
  try {
    const [, created] = await createTask(root, { title: 'Settle Record' })
    recordExecutorDispatch(root, created.taskRelPath, {
      kind: 'check',
      title: 'c1',
      childId: 'child-1',
    })
    // 回填 completed（无 error）
    const [err1] = settleExecutorDispatch(root, created.taskRelPath, {
      childId: 'child-1',
      status: 'completed',
    })
    assert.equal(err1, null)
    let saved = readTaskJson(root, created.taskRelPath)
    assert.equal(saved.dispatches.length, 1, 'backfill must not append a new record')
    assert.equal(saved.dispatches[0].status, 'completed')
    assert.equal(saved.dispatches[0].error, undefined)
    assert.equal(saved.stage, TaskStage.CHECK, 'backfill must not change stage')
    // 再初写一条 running 后回填 failed + 一行错误摘要
    recordExecutorDispatch(root, created.taskRelPath, {
      kind: 'check',
      title: 'c2',
      childId: 'child-2',
    })
    const [err2] = settleExecutorDispatch(root, created.taskRelPath, {
      childId: 'child-2',
      status: 'failed',
      error: 'the executor failed before it finished',
    })
    assert.equal(err2, null)
    saved = readTaskJson(root, created.taskRelPath)
    assert.equal(saved.dispatches.length, 2, 'backfill must not re-count')
    assert.equal(saved.dispatches[1].status, 'failed')
    assert.equal(saved.dispatches[1].error, 'the executor failed before it finished')
    assert.equal(saved.stage, TaskStage.CHECK, 'backfill must not change stage')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('settleExecutorDispatch 按 childId 关联最近一条 running；无匹配/已结算 no-op', async () => {
  const root = makeRoot()
  try {
    const [, created] = await createTask(root, { title: 'Settle Match' })
    recordExecutorDispatch(root, created.taskRelPath, {
      kind: 'implement',
      title: 'i1',
      childId: 'child-1',
    })
    recordExecutorDispatch(root, created.taskRelPath, {
      kind: 'implement',
      title: 'i2',
      childId: 'child-1',
    })
    // 最后一条同 childId 仍是 running：只回填它（前一条保持 running）
    const [err] = settleExecutorDispatch(root, created.taskRelPath, {
      childId: 'child-1',
      status: 'failed',
      error: 'declined',
    })
    assert.equal(err, null)
    const saved = readTaskJson(root, created.taskRelPath)
    assert.equal(saved.dispatches[0].status, 'running')
    assert.equal(saved.dispatches[1].status, 'failed')
    // 未知 childId：no-op（不报错、不新增记录）
    const [err2] = settleExecutorDispatch(root, created.taskRelPath, {
      childId: 'ghost',
      status: 'failed',
      error: 'x',
    })
    assert.equal(err2, null)
    assert.equal(readTaskJson(root, created.taskRelPath).dispatches.length, 2)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('readTask 归一化：存量无 status 的派发记录读取视为 completed（不迁移落盘）', async () => {
  const root = makeRoot()
  try {
    const rel = join('tasks', '09-02-legacy-dispatch')
    mkdirSync(join(root, '.workloom', rel), { recursive: true })
    writeFileSync(
      join(root, '.workloom', rel, 'task.json'),
      JSON.stringify({
        id: 'x',
        name: 'legacy-dispatch',
        status: TaskStatus.PLANNING,
        dispatches: [
          { kind: 'implement', at: new Date().toISOString(), title: 'legacy', childId: 'child-9' },
        ],
      }),
    )
    const [err, task] = readTask(root, rel)
    assert.equal(err, null)
    assert.equal(task.dispatches[0].status, 'completed', 'legacy record must read as completed')
    // 不迁移：落盘文件仍无 status 字段
    const raw = JSON.parse(readFileSync(join(root, '.workloom', rel, 'task.json'), 'utf8'))
    assert.equal('status' in raw.dispatches[0], false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('失败派发（初写后未结算）留痕可见：running 记录在 task.json 可读', async () => {
  const root = makeRoot()
  try {
    const [, created] = await createTask(root, { title: 'Dispatch Trace' })
    // 初写后不结算（派发后未回填）：记录仍留在 task.json，缺口 A 场景可见。
    const [err] = recordExecutorDispatch(root, created.taskRelPath, {
      kind: 'check',
      title: 'c1',
      childId: 'child-7',
    })
    assert.equal(err, null)
    const saved = readTaskJson(root, created.taskRelPath)
    assert.equal(saved.dispatches.length, 1)
    assert.equal(saved.dispatches[0].status, 'running')
    assert.equal(saved.dispatches[0].childId, 'child-7')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

// ---------- 续派模型治理：派发记录绑定字段（design §8.2，阶段三） ----------

test('recordExecutorDispatch 新派落绑定：model/effort/modelSource 写入 dispatches', async () => {
  const root = makeRoot()
  try {
    const [, created] = await createTask(root, { title: 'Dispatch Binding' })
    // 新派轮：写入解析后实际生效的 model/effort 与来源（legacy 配置命中）。
    const [err] = recordExecutorDispatch(root, created.taskRelPath, {
      kind: 'implement',
      title: 'binding new',
      childId: 'child-1',
      model: 'deepseek-official/deepseek-v4-flash',
      effort: 'high',
      modelSource: 'legacy',
    })
    assert.equal(err, null)
    const saved = readTaskJson(root, created.taskRelPath)
    assert.equal(saved.dispatches[0].model, 'deepseek-official/deepseek-v4-flash')
    assert.equal(saved.dispatches[0].effort, 'high')
    assert.equal(saved.dispatches[0].modelSource, 'legacy')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('recordExecutorDispatch 续派轮：modelSource 记 spawn、绑定沿用首次派发值', async () => {
  const root = makeRoot()
  try {
    const [, created] = await createTask(root, { title: 'Dispatch Spawn Copy' })
    // 首次派发：绑定值来自配置（modelSource: legacy）。
    recordExecutorDispatch(root, created.taskRelPath, {
      kind: 'implement',
      title: 'spawn',
      childId: 'child-1',
      model: 'deepseek-official/deepseek-v4-flash',
      effort: 'high',
      modelSource: 'legacy',
    })
    // 续派轮：复制首次派发记录的 model/effort，modelSource 记 spawn。
    const [err] = recordExecutorDispatch(root, created.taskRelPath, {
      kind: 'implement',
      title: 'followup',
      childId: 'child-1',
      model: 'deepseek-official/deepseek-v4-flash',
      effort: 'high',
      modelSource: 'spawn',
    })
    assert.equal(err, null)
    const saved = readTaskJson(root, created.taskRelPath)
    assert.equal(saved.dispatches.length, 2)
    assert.equal(saved.dispatches[1].model, saved.dispatches[0].model)
    assert.equal(saved.dispatches[1].effort, saved.dispatches[0].effort)
    assert.equal(saved.dispatches[1].modelSource, 'spawn')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('recordExecutorDispatch 绑定字段非法值 fail loud（不落盘）', async () => {
  const root = makeRoot()
  try {
    const [, created] = await createTask(root, { title: 'Dispatch Bad Binding' })
    // modelSource 越出枚举值域：记录被拒，不产生 dispatches 条目。
    const [err] = recordExecutorDispatch(root, created.taskRelPath, {
      kind: 'implement',
      title: 'bad source',
      childId: 'child-1',
      model: 'deepseek-official/deepseek-v4-flash',
      modelSource: 'env',
    })
    assert.ok(err instanceof Error)
    assert.match(err.message, /invalid dispatch modelSource/)
    assert.equal(readTaskJson(root, created.taskRelPath).dispatches.length, 0)
    // model 缺省读取为 undefined（旧记录不炸）。
    const [legacyErr, legacyTask] = readTask(root, created.taskRelPath)
    assert.equal(legacyErr, null)
    assert.equal(legacyTask.dispatches.length, 0)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('readTask 归一化：旧派发记录缺绑定字段读取为 undefined（不炸）', async () => {
  const root = makeRoot()
  try {
    const rel = join('tasks', '09-03-legacy-binding-dispatch')
    mkdirSync(join(root, '.workloom', rel), { recursive: true })
    writeFileSync(
      join(root, '.workloom', rel, 'task.json'),
      JSON.stringify({
        id: 'x',
        name: 'legacy-binding-dispatch',
        status: TaskStatus.PLANNING,
        dispatches: [
          { kind: 'implement', at: new Date().toISOString(), title: 'legacy', childId: 'child-9' },
        ],
      }),
    )
    const [err, task] = readTask(root, rel)
    assert.equal(err, null)
    assert.equal(task.dispatches[0].model, undefined)
    assert.equal(task.dispatches[0].effort, undefined)
    assert.equal(task.dispatches[0].modelSource, undefined)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('startTask force 缺 reason 拒绝（R14：force 空 reason 全拒，不写 override、不改状态）', async () => {
  const root = makeRoot()
  try {
    const [, created] = await createTask(root, { title: 'Force No Reason Start' })
    const [err] = await startTask(root, { taskRelPath: created.taskRelPath, force: true })
    assert.ok(err)
    assert.match(err.message, /non-empty reason/)
    assert.equal(readTaskJson(root, created.taskRelPath).overrides.length, 0)
    assert.equal(readTaskJson(root, created.taskRelPath).status, TaskStatus.PLANNING)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('checkTask force 缺 reason 拒绝（R14：不留痕、不写 check）', async () => {
  const root = makeRoot()
  try {
    const [, created] = await createTask(root, { title: 'Force No Reason Check' })
    satisfyStartGate(root, created.taskRelPath)
    await startTask(root, { taskRelPath: created.taskRelPath })
    const [err] = await checkTask(root, {
      taskRelPath: created.taskRelPath,
      summary: 'forced',
      force: true,
    })
    assert.ok(err)
    assert.match(err.message, /non-empty reason/)
    assert.equal(readTaskJson(root, created.taskRelPath).check, null)
    assert.equal(readTaskJson(root, created.taskRelPath).overrides.length, 0)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('archiveTask force 缺 reason 拒绝（R14：不移动目录、不留痕）', async () => {
  const root = makeRoot()
  try {
    const [, created] = await createTask(root, { title: 'Force No Reason Archive' })
    const rel = created.taskRelPath
    const [err] = await archiveTask(root, { taskRelPath: rel, force: true, autoCommit: false })
    assert.ok(err)
    assert.match(err.message, /non-empty reason/)
    assert.equal(existsSync(join(root, '.workloom', rel)), true)
    assert.equal(readTaskJson(root, rel).overrides.length, 0)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
