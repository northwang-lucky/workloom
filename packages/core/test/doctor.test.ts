/**
 * doctor 瘦身后单测：临时目录探针只含 config 与 worktree 两检查 + 空槽提示行；
 * 两检查各自的判定行为抽样。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { execFileSync } from 'node:child_process'

import { buildDoctorRelayText, runDoctor } from '../src/index.ts'
import { initWorkloom } from '../src/workspace/init.ts'
import { WORKLOOM_DIR } from '../src/workspace/locate.js'

/** 初始化 git 仓并落首个提交（worktree 一致性比对需要注册集）。 */
function gitInitWithCommit(root: string): void {
  const run = (args: string[]): void => {
    execFileSync('git', args, { cwd: root, stdio: 'pipe' })
  }
  run(['init', '-b', 'main'])
  run(['config', 'user.email', 'test@example.com'])
  run(['config', 'user.name', 'test'])
  run(['add', '--', '.'])
  run(['commit', '-m', 'chore: init'])
}

// 测试隔离：core 三层配置的全局层读 $HOME/.workloom/config（调用链无 homeDir 注入
// 缝时吃 os.homedir 实时值）；本机真实全局配置会泄漏进单测。重定向 HOME 到临时目录
// 使全局层恒为空（与 config.test.ts 的 homeDir 注入、executor.test.ts 的重定向同口径）。
const isolatedHome = mkdtempSync(join(tmpdir(), 'workloom-core-home-'))
// TMPDIR 一并指向隔离目录：夹具临时目录随之落在 HOME 之内，findWorkloomRoot 的
// 上溯在 HOME 边界停下（与真实环境“家目录为上溯边界”的语义一致）。
process.env.HOME = isolatedHome
process.env.TMPDIR = isolatedHome

/** 创建临时项目根。 */
function makeRoot() {
  return mkdtempSync(join(tmpdir(), 'workloom-doctor-'))
}

test('探针：临时目录 doctor 输出只含 config 与 worktree 两检查加空槽提示行', () => {
  const root = makeRoot()
  initWorkloom(root)
  try {
    const [err, report] = runDoctor(root)
    assert.equal(err, null)
    assert.ok(report)
    // 检查集只剩两类（对齐决策 4：旧工作流语义检查随状态机重建退役）
    assert.deepEqual(
      report.checks.map((check) => check.code),
      ['config', 'worktree'],
    )
    // 空槽提示行显式携带（不静默返回空）
    assert.equal(report.slotsNote, '检查集待状态机重建')
    // relay 文本携带空槽说明行
    const relay = buildDoctorRelayText(report)
    assert.match(relay, /check set is being rebuilt by the state machine/)
    // 正常骨架项目两检查零 issue
    assert.equal(report.summary.total, 0)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('无 .workloom 目录：config 报 no .workloom issue，worktree 检查为空', () => {
  const root = makeRoot()
  try {
    const [err, report] = runDoctor(root)
    assert.equal(err, null)
    assert.ok(report)
    const config = report.checks.find((check) => check.code === 'config')
    assert.equal(config.issues.length, 1)
    assert.match(config.issues[0].message, /no \.workloom directory found/)
    const worktree = report.checks.find((check) => check.code === 'worktree')
    assert.equal(worktree.issues.length, 0)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('config 检查：配置非法报 error；packages 空配置报 warn', () => {
  const root = makeRoot()
  initWorkloom(root)
  writeFileSync(join(root, WORKLOOM_DIR, 'config.json'), '{ broken')
  try {
    const [err, report] = runDoctor(root)
    assert.equal(err, null)
    const config = report.checks.find((check) => check.code === 'config')
    assert.ok(config.issues.some((issue) => issue.severity === 'error' && /config is invalid/.test(issue.message)))
  } finally {
    rmSync(root, { recursive: true, force: true })
    // 空配置项目
  }
  const root2 = makeRoot()
  initWorkloom(root2)
  writeFileSync(join(root2, WORKLOOM_DIR, 'config.json'), '{}\n')
  try {
    const [, report2] = runDoctor(root2)
    const config = report2.checks.find((check) => check.code === 'config')
    assert.ok(config.issues.some((issue) => /packages is empty/.test(issue.message)))
  } finally {
    rmSync(root2, { recursive: true, force: true })
  }
})

test('worktree 检查：.gitignore 缺 .runtime/ 条目报 warn（带迁移 hint）', () => {
  const root = makeRoot()
  initWorkloom(root)
  const gitignorePath = join(root, WORKLOOM_DIR, '.gitignore')
  // 覆写 .gitignore 抽掉 .runtime/ 条目（模拟存量项目）
  writeFileSync(gitignorePath, 'legacy-entry\n')
  try {
    const [err, report] = runDoctor(root)
    assert.equal(err, null)
    const worktree = report.checks.find((check) => check.code === 'worktree')
    const issue = worktree.issues.find((item) => item.title === 'Missing runtime gitignore entry')
    assert.ok(issue, 'missing .runtime/ entry must produce an issue')
    assert.equal(issue.severity, 'warn')
    assert.match(issue.hint, /\.runtime\//)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('worktree 检查：残留未注册目录报 issue（不自动删除）', () => {
  const root = makeRoot()
  initWorkloom(root)
  gitInitWithCommit(root)
  const stray = join(root, WORKLOOM_DIR, '.runtime', 'worktrees', '10-01-stray')
  mkdirSync(stray, { recursive: true })
  try {
    const [err, report] = runDoctor(root)
    assert.equal(err, null)
    const worktree = report.checks.find((check) => check.code === 'worktree')
    assert.ok(
      worktree.issues.some((issue) => issue.title === 'Unregistered worktree directory'),
      'stray directory must be reported',
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
