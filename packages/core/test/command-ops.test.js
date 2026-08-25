/**
 * command-ops 模块单测：init 参数解析、迁移摘要、init/continue/finish 编排。
 * 测试依赖 dist（test 脚本先 build 再跑 node --test），临时目录 setup 照
 * init.test.js 先例（mkdtemp + finally rmSync）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  buildContinueGuidance,
  buildFinishGuidance,
  executeInitCommand,
  executeJournalEntry,
  migrationSummaryLines,
  parseInitArgs,
} from '../dist/index.js'
import { createTask } from '../dist/legacy/task-store.js'
import { initWorkloom } from '../dist/legacy/init.js'

/** 创建临时项目根。 */
function makeRoot() {
  return mkdtempSync(join(tmpdir(), 'workloom-command-'))
}

/** 在 root 下构造一个含旧 .trellis 的 legacy 项目（tasks + config）。 */
function seedLegacy(root) {
  mkdirSync(join(root, '.trellis', 'tasks', '09-01-demo'), { recursive: true })
  writeFileSync(join(root, '.trellis', 'tasks', '09-01-demo', 'task.json'), '{}\n')
}

/** 在临时根内执行 git 命令。 */
function runGit(root, args) {
  return execFileSync('git', args, { cwd: root, stdio: 'pipe' })
}

test('parseInitArgs 精确 --purge 进入 purge 模式（含 trim）', () => {
  assert.deepEqual(parseInitArgs('--purge'), { purge: true, developer: '' })
  assert.deepEqual(parseInitArgs('  --purge  '), { purge: true, developer: '' })
})

test('parseInitArgs --purge 后带空格也进入 purge 模式', () => {
  assert.deepEqual(parseInitArgs('--purge now'), { purge: true, developer: '' })
})

test('parseInitArgs 类似前缀不误判为 purge', () => {
  assert.deepEqual(parseInitArgs('--purge-x'), { purge: false, developer: '--purge-x' })
  assert.deepEqual(parseInitArgs('--purgex'), { purge: false, developer: '--purgex' })
})

test('parseInitArgs 非 purge 输入视为 developer identity', () => {
  assert.deepEqual(parseInitArgs('alice'), { purge: false, developer: 'alice' })
  assert.deepEqual(parseInitArgs(''), { purge: false, developer: '' })
})

/** 构造最小迁移结果（未覆盖字段取默认）。 */
function summaryResult(overrides) {
  return {
    migrated: [],
    skipped: [],
    unsupported: [],
    droppedConfigFields: [],
    archivedWorkflow: null,
    legacyRemoved: false,
    legacyRoot: '/tmp/x',
    ...overrides,
  }
}

test('migrationSummaryLines 无新增时给已迁移措辞', () => {
  const lines = migrationSummaryLines(summaryResult({ migrated: [] }))
  assert.ok(lines[0].includes('Already migrated'))
})

test('migrationSummaryLines 完整摘要覆盖各字段', () => {
  const lines = migrationSummaryLines(
    summaryResult({
      migrated: ['tasks', 'workspace'],
      skipped: ['tasks/08-01-demo'],
      unsupported: ['.trellis/workflow.md'],
      droppedConfigFields: ['channel'],
      archivedWorkflow: '.workloom/migrated/trellis-workflow.md',
      legacyRemoved: false,
    }),
  )
  const joined = lines.join('\n')
  assert.match(joined, /Migrated: tasks, workspace/)
  assert.match(joined, /Skipped existing entries: 1/)
  assert.match(joined, /Unsupported entries/)
  assert.match(joined, /Dropped legacy config fields: channel/)
  assert.match(joined, /archived to .workloom\/migrated\/trellis-workflow.md/)
  assert.match(joined, /--purge to delete it once you confirm the migration/)
})

test('migrationSummaryLines 已删除旧目录时给 removed 措辞', () => {
  const lines = migrationSummaryLines(summaryResult({ legacyRemoved: true }))
  assert.ok(lines.some((line) => line.includes('Legacy .trellis directory was removed.')))
})

test('executeInitCommand 干净目录 init 生成骨架文本', () => {
  const root = makeRoot()
  try {
    const [err, text] = executeInitCommand(root, 'alice')
    assert.equal(err, null)
    assert.ok(text.includes(`Workloom initialized at ${root}.`))
    assert.ok(text.includes('Created: .workloom'))
    assert.ok(text.includes('.developer'))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('executeInitCommand 二次 init（force 补建）报 nothing was created', () => {
  const root = makeRoot()
  try {
    seedLegacy(root)
    // 首次 init 已建好骨架；带旧 .trellis 再跑 --purge：force 补建且无新增。
    const [, firstText] = executeInitCommand(root, '')
    assert.ok(firstText.includes('Workloom initialized'))
    const [err, text] = executeInitCommand(root, '--purge')
    assert.equal(err, null)
    assert.ok(text.includes('The skeleton is already complete; nothing was created.'))
    assert.ok(text.includes('Legacy .trellis directory was removed.'))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('executeInitCommand purge 且无旧项目先报错', () => {
  const root = makeRoot()
  try {
    const [err, text] = executeInitCommand(root, '--purge')
    assert.ok(err)
    assert.match(err.message, /nothing to purge \(no legacy \.trellis project found\)/)
    assert.equal(text, null)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('executeInitCommand 带旧 .trellis 时附迁移摘要', () => {
  const root = makeRoot()
  try {
    seedLegacy(root)
    const [err, text] = executeInitCommand(root, '')
    assert.equal(err, null)
    assert.ok(text.includes('Migrated: .workloom/tasks'))
    assert.ok(text.includes('Legacy .trellis directory is kept'))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('executeInitCommand 迁移失败附 WARNING 不阻塞结果', () => {
  const root = makeRoot()
  try {
    mkdirSync(join(root, '.trellis'))
    writeFileSync(join(root, '.trellis', 'config.yaml'), 'channel: [unclosed\n')
    const [err, text] = executeInitCommand(root, '')
    assert.equal(err, null)
    assert.ok(text.includes('WARNING: legacy migration failed'))
    assert.ok(text.includes('rerun /workloom-init'))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('buildContinueGuidance 无 .workloom 报错', () => {
  const root = makeRoot()
  try {
    const [err, text] = buildContinueGuidance(root, 'dsh_t1', 'body')
    assert.ok(err)
    assert.match(err.message, /no \.workloom directory found \(searched up from/)
    assert.equal(text, null)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('buildContinueGuidance 无活跃任务报错', () => {
  const root = makeRoot()
  try {
    initWorkloom(root)
    const [err, text] = buildContinueGuidance(root, 'dsh_t1', 'body')
    assert.ok(err)
    assert.match(err.message, /no active task for this session \(start or create a task first\)/)
    assert.equal(text, null)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('buildContinueGuidance 正常拼文本（含 Next step 与 body）', () => {
  const root = makeRoot()
  try {
    initWorkloom(root)
    createTask(root, { title: 'Demo Task', contextKey: 'dsh_t1' })
    const [err, text] = buildContinueGuidance(root, 'dsh_t1', 'asset body line')
    assert.equal(err, null)
    assert.ok(text.includes('Active task: tasks/'))
    assert.ok(text.includes('Title: Demo Task'))
    assert.ok(text.includes('Status: planning'))
    // createTask 已建 prd.md 骨架：planning 路由到 1.4（轻量任务待评审）。
    assert.ok(
      text.includes('Next step: Step 1.4: await review (lightweight task, PRD artifacts ready).'),
    )
    assert.ok(text.endsWith('\n\nasset body line'))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('buildFinishGuidance 脏文件报错', async () => {
  const root = makeRoot()
  try {
    runGit(root, ['init'])
    writeFileSync(join(root, 'dirty.txt'), 'x\n')
    const [err, text] = await buildFinishGuidance(root, 'dsh_t1', 'body')
    assert.ok(err)
    assert.match(
      err.message,
      /1 dirty file\(s\) remain; complete step 2\.3 \(commit\) before wrapping up/,
    )
    assert.equal(text, null)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('buildFinishGuidance 干净树拼文本', async () => {
  const root = makeRoot()
  try {
    runGit(root, ['init'])
    runGit(root, ['config', 'user.email', 'test@example.com'])
    runGit(root, ['config', 'user.name', 'test'])
    initWorkloom(root)
    createTask(root, { title: 'Demo Task', contextKey: 'dsh_t1' })
    runGit(root, ['add', '--all'])
    runGit(root, ['commit', '-m', 'init'])
    const [err, text] = await buildFinishGuidance(root, 'dsh_t1', 'asset body line')
    assert.equal(err, null)
    assert.ok(text.includes('Active task: tasks/'))
    assert.ok(text.includes('Title: Demo Task'))
    assert.ok(text.includes('Status: planning'))
    assert.ok(text.endsWith('\n\nasset body line'))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('executeJournalEntry 成功写 journal 文件（含身份与标题）', async () => {
  const root = makeRoot()
  try {
    initWorkloom(root, { developer: 'alice' })
    const [err, result] = await executeJournalEntry(root, {
      title: 'Session One',
      commit: 'abc123',
      summary: 'Wrapped up the demo',
    })
    assert.equal(err, null)
    assert.match(result.journalFile, /^journal-\d+\.md$/)
    assert.ok(result.journalPath.startsWith('workspace/alice/'))
    const content = readFileSync(join(root, '.workloom', result.journalPath), 'utf8')
    assert.ok(content.includes('Session One'))
    assert.ok(content.includes('abc123'))
    assert.ok(content.includes('Wrapped up the demo'))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('executeJournalEntry 无 developer 身份报错', async () => {
  const root = makeRoot()
  try {
    // init 不带 developer：.developer 为空文件，readExistingDeveloper 返回空串，同视为无身份。
    initWorkloom(root)
    const [err, result] = await executeJournalEntry(root, { title: 'No Identity' })
    assert.ok(err)
    assert.match(err.message, /no developer identity found/)
    assert.equal(result, null)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('executeJournalEntry 项目不存在（无 .workloom）同样报无身份', async () => {
  const root = makeRoot()
  try {
    // 不 init：readExistingDeveloper 返回 undefined，与空串分支同文案。
    const [err, result] = await executeJournalEntry(root, { title: 'Nowhere' })
    assert.ok(err)
    assert.match(err.message, /no developer identity found/)
    assert.equal(result, null)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('executeJournalEntry 空 title 报错（addSession 校验转发）', async () => {
  const root = makeRoot()
  try {
    initWorkloom(root, { developer: 'alice' })
    const [err, result] = await executeJournalEntry(root, { title: '' })
    assert.ok(err)
    assert.match(err.message, /title must not be empty/)
    assert.equal(result, null)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('executeJournalEntry 空 commit/summary 视为未提供且记录成功', async () => {
  // 过滤无观测副作用（addSession 对 commit/summary 用 ?? '' 兜底，空串与省略
  // 落盘相同）：本用例验证空串输入走成功路径、不触发换行校验之外的错误。
  const root = makeRoot()
  try {
    initWorkloom(root, { developer: 'alice' })
    const [err, result] = await executeJournalEntry(root, {
      title: 'Session Two',
      commit: '',
      summary: '',
    })
    assert.equal(err, null)
    assert.ok(result.journalPath.startsWith('workspace/alice/'))
    const content = readFileSync(join(root, '.workloom', result.journalPath), 'utf8')
    assert.ok(content.includes('Session Two'))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
