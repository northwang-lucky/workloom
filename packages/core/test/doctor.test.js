/**
 * doctor 模块单测：8 类检查 + 3 类机械修复 + 幂等 + 不可修拒绝 + schema。
 *
 * 设计意图：
 * - 全部用临时项目根构造「病态」任务目录，断言 runDoctor 输出 issue 及 schema 字段；
 * - 测试依赖 dist（test 脚本先 build 再跑 node --test）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { buildDoctorRelayText, runDoctor } from '../dist/index.js'

/** 创建临时项目根（空目录，不含 .workloom）。 */
function makeRoot() {
  return mkdtempSync(join(tmpdir(), 'workloom-doctor-'))
}

/** 初始化最小 .workloom：tasks 目录 + 合法 config.yaml + 会话目录。 */
function initWorkloom(root) {
  mkdirSync(join(root, '.workloom', 'tasks'), { recursive: true })
  mkdirSync(join(root, '.workloom', '.runtime', 'sessions'), { recursive: true })
  writeFileSync(join(root, '.workloom', 'config.yaml'), 'session_auto_commit: false\n')
}

/** 构造一条 task.json 记录（默认 planning、无 hook/派发）。 */
function rec(name, overrides = {}) {
  return {
    id: `id-${name}`,
    name,
    title: `Title ${name}`,
    description: '',
    status: 'planning',
    priority: 'P2',
    creator: 'tester',
    assignee: '',
    package: null,
    branch: '',
    base_branch: '',
    createdAt: new Date().toISOString(),
    completedAt: null,
    parent: null,
    children: [],
    subtasks: [],
    scope: '',
    commit: '',
    pr_url: '',
    worktree_path: '',
    relatedFiles: [],
    notes: '',
    meta: {},
    check: null,
    overrides: [],
    dispatches: [],
    hooks: { after_create: [], after_start: [], after_finish: [], after_archive: [] },
    ...overrides,
  }
}

/** 写任务目录（默认 active；传归档月份写 archive/<YYYY-MM>/）。 */
function writeTask(root, name, record, archivedMonth = null) {
  const base = archivedMonth ? `tasks/archive/${archivedMonth}` : 'tasks'
  const dir = join(root, '.workloom', base, name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'task.json'), `${JSON.stringify(record, null, 2)}\n`)
}

/** 写会话指针文件。 */
function writePointer(root, contextKey, currentTask) {
  const dir = join(root, '.workloom', '.runtime', 'sessions')
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    join(dir, `${contextKey}.json`),
    `${JSON.stringify({ current_task: currentTask, last_seen_at: new Date().toISOString() }, null, 2)}\n`,
  )
}

/** 读取任务 task.json（修复后断言用）。 */
function readTaskJson(root, relPath) {
  return JSON.parse(readFileSync(join(root, '.workloom', relPath, 'task.json'), 'utf8'))
}

/** 当前归档月目录名（与实现 formatYearMonth 一致：本地时区 YYYY-MM）。 */
function currentArchiveMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

/** 断言一条 issue 的 schema 字段齐全。 */
function assertIssueSchema(issue, code) {
  for (const field of ['code', 'title', 'severity', 'task', 'message', 'path', 'fixable', 'hint']) {
    assert.ok(field in issue, `issue missing ${field}`)
  }
  assert.equal(issue.code, code)
}

test('check task-lifecycle：planning 超期 / in_progress 无 check / completed 未归档', () => {
  const root = makeRoot()
  initWorkloom(root)
  try {
    writeTask(
      root,
      'stale-plan',
      rec('stale-plan', { createdAt: new Date(Date.now() - 26 * 3600 * 1000).toISOString() }),
    )
    writeTask(root, 'no-check', rec('no-check', { status: 'in_progress' }))
    writeTask(root, 'done-active', rec('done-active', {
      status: 'completed',
      check: { passedAt: new Date().toISOString(), summary: 'ok' },
      completedAt: new Date().toISOString(),
    }))
    const [err, report] = runDoctor(root, { fix: false })
    assert.equal(err, null)
    assert.ok(report)
    const lifecycle = report.checks.find((c) => c.code === 'task-lifecycle')
    assert.ok(lifecycle, 'task-lifecycle check must exist')
    assert.ok(lifecycle.issues.some((i) => i.task === 'tasks/stale-plan'), 'stale planning reported')
    assert.ok(lifecycle.issues.some((i) => i.task === 'tasks/no-check'), 'in_progress no check reported')
    assert.ok(
      lifecycle.issues.some((i) => i.task === 'tasks/done-active'),
      'completed not archived reported',
    )
    for (const issue of lifecycle.issues) assertIssueSchema(issue, 'task-lifecycle')
    const done = lifecycle.issues.find((i) => i.task === 'tasks/done-active')
    assert.equal(done.fixable, true, 'completed-with-check is fixable (movable to archive)')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('check parent-child：子有 parent 而父 children 缺 / 父 children 含而子 parent 空', () => {
  const root = makeRoot()
  initWorkloom(root)
  try {
    writeTask(root, 'parent-a', rec('parent-a', { status: 'in_progress' }))
    writeTask(root, 'child-a', rec('child-a', { parent: 'tasks/parent-a', status: 'in_progress' }))
    writeTask(root, 'parent-b', rec('parent-b', {
      status: 'in_progress',
      children: ['tasks/child-b'],
    }))
    writeTask(root, 'child-b', rec('child-b', { status: 'in_progress' }))
    const [err, report] = runDoctor(root, { fix: false })
    assert.equal(err, null)
    const pc = report.checks.find((c) => c.code === 'parent-child')
    assert.ok(pc)
    assert.ok(
      pc.issues.some((i) => i.task === 'tasks/child-a' && i.fixable === true),
      'child-a missing from parent children reported as fixable',
    )
    assert.ok(
      pc.issues.some((i) => i.task === 'tasks/child-b' && i.fixable === true),
      'child-b has no parent back-ref reported as fixable',
    )
    for (const issue of pc.issues) assertIssueSchema(issue, 'parent-child')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('check archive：父归档而子未归档（反之）报告且不可修', () => {
  const root = makeRoot()
  initWorkloom(root)
  try {
    writeTask(root, 'parent-arch', rec('parent-arch', {
      status: 'completed',
      check: { passedAt: new Date().toISOString(), summary: 'ok' },
      children: ['tasks/child-arch'],
    }), '2026-08')
    writeTask(root, 'child-arch', rec('child-arch', { status: 'in_progress' }))
    const [err, report] = runDoctor(root, { fix: false })
    assert.equal(err, null)
    const arch = report.checks.find((c) => c.code === 'archive')
    assert.ok(arch && arch.issues.length >= 1, 'archive mismatch reported')
    for (const issue of arch.issues) assertIssueSchema(issue, 'archive')
    assert.equal(arch.issues[0].fixable, false, 'archive mismatch is not auto-fixable')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('check dispatch-audit：in_progress/archived 任务 dispatches 为空', () => {
  const root = makeRoot()
  initWorkloom(root)
  try {
    writeTask(root, 'worked-nodispatch', rec('worked-nodispatch', { status: 'in_progress' }))
    writeTask(root, 'arch-no-dispatch', rec('arch-no-dispatch', {
      status: 'completed',
      check: { passedAt: new Date().toISOString(), summary: 'ok' },
    }), '2026-08')
    const [err, report] = runDoctor(root, { fix: false })
    assert.equal(err, null)
    const da = report.checks.find((c) => c.code === 'dispatch-audit')
    assert.ok(da)
    const tasks = da.issues.map((i) => i.task)
    assert.ok(tasks.includes('tasks/worked-nodispatch'))
    assert.ok(tasks.includes('tasks/archive/2026-08/arch-no-dispatch'))
    for (const issue of da.issues) assertIssueSchema(issue, 'dispatch-audit')
    assert.equal(da.issues[0].fixable, false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('check active-pointer：指针指向不存在/已归档任务', () => {
  const root = makeRoot()
  initWorkloom(root)
  try {
    writeTask(root, 'real-task', rec('real-task', { status: 'in_progress' }))
    writeTask(root, 'old-parent', rec('old-parent', {
      status: 'completed',
      check: { passedAt: new Date().toISOString(), summary: 'ok' },
    }), '2026-08')
    writePointer(root, 'sess-dangling', 'tasks/ghost')
    writePointer(root, 'sess-archived', 'tasks/old-parent')
    const [err, report] = runDoctor(root, { fix: false })
    assert.equal(err, null)
    const ap = report.checks.find((c) => c.code === 'active-pointer')
    assert.ok(ap)
    assert.ok(ap.issues.some((i) => i.task === 'tasks/ghost' && i.fixable === true))
    assert.ok(ap.issues.some((i) => i.task === 'tasks/old-parent' && i.fixable === true))
    for (const issue of ap.issues) assertIssueSchema(issue, 'active-pointer')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('check doc-completeness：prd 缺 H1/占位符、jsonl 无有效记录', () => {
  const root = makeRoot()
  initWorkloom(root)
  try {
    writeTask(root, 'doc-task', rec('doc-task', { status: 'in_progress' }))
    writeFileSync(
      join(root, '.workloom', 'tasks', 'doc-task', 'prd.md'),
      'no H1 here\n\n## Goal\n\n(placeholder: describe the goal this task aims to achieve)\n',
    )
    writeFileSync(
      join(root, '.workloom', 'tasks', 'doc-task', 'implement.jsonl'),
      '{"_example": "seed"}\n',
    )
    writeFileSync(join(root, '.workloom', 'tasks', 'doc-task', 'check.jsonl'), '{"_example": "seed"}\n')
    const [err, report] = runDoctor(root, { fix: false })
    assert.equal(err, null)
    const dc = report.checks.find((c) => c.code === 'doc-completeness')
    assert.ok(dc)
    assert.ok(dc.issues.some((i) => i.message.includes('H1')), 'missing H1 reported')
    assert.ok(dc.issues.some((i) => i.message.includes('placeholder')), 'placeholder sections reported')
    assert.ok(dc.issues.some((i) => i.message.includes('no effective records')), 'empty jsonl reported')
    for (const issue of dc.issues) assertIssueSchema(issue, 'doc-completeness')
    assert.equal(dc.issues[0].fixable, false, 'doc issues are manual')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('check spec-ref：jsonl 引用的文件不存在', () => {
  const root = makeRoot()
  initWorkloom(root)
  try {
    writeTask(root, 'spec-task', rec('spec-task', { status: 'in_progress' }))
    mkdirSync(join(root, '.workloom', 'spec', 'repo'), { recursive: true })
    writeFileSync(join(root, '.workloom', 'spec', 'repo', 'real.md'), 'content\n')
    writeFileSync(
      join(root, '.workloom', 'tasks', 'spec-task', 'implement.jsonl'),
      '{"file": ".workloom/spec/repo/real.md", "reason": "spec"}\n{"file": ".workloom/spec/repo/missing.md", "reason": "spec"}\n',
    )
    const [err, report] = runDoctor(root, { fix: false })
    assert.equal(err, null)
    const sr = report.checks.find((c) => c.code === 'spec-ref')
    assert.ok(sr)
    assert.ok(sr.issues.some((i) => i.message.includes('missing.md')), 'missing reference reported')
    assert.ok(!sr.issues.some((i) => i.message.includes('real.md')), 'existing reference not reported')
    for (const issue of sr.issues) assertIssueSchema(issue, 'spec-ref')
    assert.equal(sr.issues[0].fixable, false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('check config：无 .workloom / config.yaml 非法 / gate 关闭', () => {
  // 无 .workloom
  const root = makeRoot()
  try {
    const [err, report] = runDoctor(root, { fix: false })
    assert.equal(err, null)
    const cfg = report.checks.find((c) => c.code === 'config')
    assert.ok(cfg.issues.some((i) => i.message.includes('no .workloom directory')))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }

  // config.yaml 非法
  const root2 = makeRoot()
  initWorkloom(root2)
  try {
    writeFileSync(join(root2, '.workloom', 'config.yaml'), 'executor: [invalid\n')
    const [, report2] = runDoctor(root2, { fix: false })
    const cfg = report2.checks.find((c) => c.code === 'config')
    assert.ok(cfg.issues.some((i) => i.message.includes('invalid')), 'invalid config reported')
  } finally {
    rmSync(root2, { recursive: true, force: true })
  }

  // executor.gate = false
  const root3 = makeRoot()
  initWorkloom(root3)
  try {
    writeFileSync(join(root3, '.workloom', 'config.yaml'), 'executor:\n  gate: false\n')
    const [, report3] = runDoctor(root3, { fix: false })
    const cfg = report3.checks.find((c) => c.code === 'config')
    assert.ok(cfg.issues.some((i) => i.message.includes('gate is disabled')), 'gate disabled reported')
  } finally {
    rmSync(root3, { recursive: true, force: true })
  }
})

test('fix：parent-child 双向补全 + 幂等', () => {
  const root = makeRoot()
  initWorkloom(root)
  try {
    writeTask(root, 'parent-a', rec('parent-a', { status: 'in_progress' }))
    writeTask(root, 'child-a', rec('child-a', { parent: 'tasks/parent-a', status: 'in_progress' }))
    writeTask(root, 'parent-b', rec('parent-b', {
      status: 'in_progress',
      children: ['tasks/child-b'],
    }))
    writeTask(root, 'child-b', rec('child-b', { status: 'in_progress' }))
    const [err, report] = runDoctor(root, { fix: true })
    assert.equal(err, null)
    const pa = readTaskJson(root, 'tasks/parent-a')
    assert.ok(pa.children.includes('tasks/child-a'), 'parent-a children replenished')
    const cb = readTaskJson(root, 'tasks/child-b')
    assert.equal(cb.parent, 'tasks/parent-b', 'child-b parent back-ref set')
    assert.ok(report.fixed.length >= 2, 'fixed records the repaired issues')
    // 幂等：再 fix 一次无重复 parent-child issue
    const [, report2] = runDoctor(root, { fix: true })
    const pc = report2.checks.find((c) => c.code === 'parent-child')
    assert.equal(pc.issues.length, 0, 'no duplicate parent-child issue after fix')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('fix：active-pointer 清理（删除悬空/指向归档的指针）+ 幂等', () => {
  const root = makeRoot()
  initWorkloom(root)
  try {
    writeTask(root, 'real-task', rec('real-task', { status: 'in_progress' }))
    writeTask(root, 'old-parent', rec('old-parent', {
      status: 'completed',
      check: { passedAt: new Date().toISOString(), summary: 'ok' },
    }), '2026-08')
    writePointer(root, 'sess-dangling', 'tasks/ghost')
    writePointer(root, 'sess-archived', 'tasks/old-parent')
    const [err] = runDoctor(root, { fix: true })
    assert.equal(err, null)
    assert.equal(
      existsSync(join(root, '.workloom', '.runtime', 'sessions', 'sess-dangling.json')),
      false,
      'dangling pointer removed',
    )
    assert.equal(
      existsSync(join(root, '.workloom', '.runtime', 'sessions', 'sess-archived.json')),
      false,
      'archived pointer removed',
    )
    const [, report2] = runDoctor(root, { fix: true })
    const ap = report2.checks.find((c) => c.code === 'active-pointer')
    assert.equal(ap.issues.length, 0, 'no active-pointer issue after fix')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('fix：completed 无 check 不迁移（拒绝且入 manual）', () => {
  const root = makeRoot()
  initWorkloom(root)
  try {
    // 有 check：可迁移
    writeTask(root, 'done-with-check', rec('done-with-check', {
      status: 'completed',
      check: { passedAt: new Date().toISOString(), summary: 'ok' },
      completedAt: new Date().toISOString(),
    }))
    // 无 check：拒绝迁移
    writeTask(root, 'done-no-check', rec('done-no-check', {
      status: 'completed',
      completedAt: new Date().toISOString(),
    }))
    const [err, report] = runDoctor(root, { fix: true })
    assert.equal(err, null)
    const month = currentArchiveMonth()
    assert.ok(
      existsSync(join(root, '.workloom', 'tasks', 'archive', month, 'done-with-check')),
      'with-check completed task moved to archive',
    )
    assert.equal(
      existsSync(join(root, '.workloom', 'tasks', 'done-with-check')),
      false,
      'with-check original dir removed',
    )
    assert.ok(
      existsSync(join(root, '.workloom', 'tasks', 'done-no-check')),
      'no-check task must not move',
    )
    assert.ok(
      report.manual.some((i) => i.code === 'task-lifecycle' && i.task === 'tasks/done-no-check'),
      'no-check refusal stays in manual',
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('报告 schema：checks/summary/fixed/manual 字段齐全且每类检查必出现', () => {
  const root = makeRoot()
  initWorkloom(root)
  try {
    writeTask(root, 'a', rec('a', { status: 'in_progress' }))
    const [err, report] = runDoctor(root, { fix: false })
    assert.equal(err, null)
    assert.ok(report)
    assert.ok(Array.isArray(report.checks))
    assert.equal(report.checks.length, 8, 'all 8 checks always present')
    for (const check of report.checks) {
      for (const field of ['code', 'title', 'severity', 'issues']) {
        assert.ok(field in check, `check missing ${field}`)
      }
      assert.ok(Array.isArray(check.issues))
    }
    for (const field of ['total', 'fixable', 'manual']) {
      assert.ok(field in report.summary, `summary missing ${field}`)
    }
    assert.ok(Array.isArray(report.fixed))
    assert.ok(Array.isArray(report.manual))
    const sum = report.checks.reduce((acc, c) => acc + c.issues.length, 0)
    assert.equal(report.summary.total, sum)
    assert.equal(report.summary.total, report.summary.fixable + report.summary.manual)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('buildDoctorRelayText 含 JSON 报告与引导语', () => {
  const root = makeRoot()
  initWorkloom(root)
  try {
    writeTask(root, 'x', rec('x'))
    const [, report] = runDoctor(root, { fix: false })
    const text = buildDoctorRelayText(report)
    assert.ok(text.includes('"checks"'), 'must include checks JSON')
    assert.ok(text.includes('"summary"'), 'must include summary JSON')
    assert.ok(text.includes("user's language"), 'must instruct model to report in user language')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
