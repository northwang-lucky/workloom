/**
 * doctor 五类检查集单测（状态机重建后）：临时目录探针输出五类检查结果；
 * 非法状态任务样本触发 lifecycle-consistency；确认与 CASE 样本各自触发
 * confirm-completeness / case-consistency；轨道值非法样本经兼容读转为可判定
 * issue；worktree 与 config 两类判定行为抽样。
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
import { createTask } from '../src/task/storage/index.ts'
import { archiveTask, checkTask, startTask } from '../src/task/task-ops.ts'

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

/** 最小合法 task.json 记录（字段可覆写；直接落盘构造样本）。 */
function baseRecord(overrides = {}) {
  return {
    id: 'doctor-sample',
    name: 'sample',
    title: 'Doctor sample',
    description: '',
    status: 'planning',
    priority: 'P2',
    creator: '',
    assignee: '',
    package: null,
    branch: '',
    base_branch: '',
    createdAt: '2026-11-01T00:00:00.000Z',
    completedAt: null,
    parent: null,
    children: [],
    scope: '',
    commit: '',
    pr_url: '',
    worktree_path: '',
    relatedFiles: [],
    notes: '',
    meta: {},
    ...overrides,
  }
}

/** 在项目内落一个任务样本（task.json 直写），返回任务相对路径。 */
function writeSampleTask(root: string, name: string, record: object): string {
  const rel = join('tasks', name)
  mkdirSync(join(root, WORKLOOM_DIR, rel), { recursive: true })
  writeFileSync(join(root, WORKLOOM_DIR, rel, 'task.json'), `${JSON.stringify(record, null, 2)}\n`)
  return rel
}

/** 取报告中某一类检查。 */
function checkOf(report, code) {
  const check = report.checks.find((item) => item.code === code)
  assert.ok(check, `check must exist: ${code}`)
  return check
}

test('探针：临时目录 doctor 输出五类检查结果，空槽提示行已退役', () => {
  const root = makeRoot()
  initWorkloom(root)
  try {
    const [err, report] = runDoctor(root)
    assert.equal(err, null)
    assert.ok(report)
    // 五类检查集就位（顺序即输出顺序）。
    assert.deepEqual(
      report.checks.map((check) => check.code),
      ['lifecycle-consistency', 'confirm-completeness', 'case-consistency', 'worktree', 'config'],
    )
    // 空槽提示行退役：报告不再携带 slotsNote 字段。
    assert.equal('slotsNote' in report, false)
    // relay 文本不再携带「检查集重建中」说明行。
    const relay = buildDoctorRelayText(report)
    assert.ok(!relay.includes('check set is being rebuilt'))
    // 正常骨架项目（无任务）五类检查零 issue。
    assert.equal(report.summary.total, 0)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('端到端探针：light 任务走完 create→start→check→archive 后五类检查零 issue', async () => {
  const root = makeRoot()
  initWorkloom(root)
  // 声明 package 并关闭 worktree（探针聚焦状态机生命周期，不涉 git worktree）。
  writeFileSync(
    join(root, WORKLOOM_DIR, 'config.json'),
    JSON.stringify({ packages: { repo: { path: '.' } }, worktree: { enabled: false } }),
  )
  try {
    const [, created] = await createTask(root, { title: 'Doctor Light Probe', package: 'repo', mode: 'light' })
    writeFileSync(
      join(root, WORKLOOM_DIR, created.taskRelPath, 'prd.md'),
      '# Doctor Light Probe\n\n## Goal\n\nRepair the shell file.\n',
    )
    const [startErr] = await startTask(root, { taskRelPath: created.taskRelPath })
    assert.equal(startErr, null)
    const [checkErr] = checkTask(root, {
      taskRelPath: created.taskRelPath,
      summary: 'self-check: lint/typecheck/tests green',
    })
    assert.equal(checkErr, null)
    const [archErr] = await archiveTask(root, { taskRelPath: created.taskRelPath, autoCommit: false })
    assert.equal(archErr, null)
    const [err, report] = runDoctor(root)
    assert.equal(err, null)
    assert.ok(report)
    for (const check of report.checks) {
      assert.deepEqual(
        check.issues.map((issue) => `${check.code}: ${issue.message}`),
        [],
        `check ${check.code} must be clean after a legal light lifecycle`,
      )
    }
    assert.equal(report.summary.total, 0)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('无 .workloom 目录：config 报 no .workloom issue，其余检查为空', () => {
  const root = makeRoot()
  try {
    const [err, report] = runDoctor(root)
    assert.equal(err, null)
    assert.ok(report)
    const config = checkOf(report, 'config')
    assert.equal(config.issues.length, 1)
    assert.match(config.issues[0].message, /no \.workloom directory found/)
    for (const code of ['lifecycle-consistency', 'confirm-completeness', 'case-consistency', 'worktree']) {
      assert.equal(checkOf(report, code).issues.length, 0)
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('生命周期一致性：非法状态样本（stage 与 mode 组合非法）报 issue', () => {
  const root = makeRoot()
  initWorkloom(root)
  try {
    // standard 模式携带 parent 专属阶段 orchestrating：迁移表合法集外。
    const rel = writeSampleTask(
      root,
      '11-01-bad-combo',
      baseRecord({ name: '11-01-bad-combo', status: 'in_progress', mode: 'standard', stage: 'orchestrating' }),
    )
    const [, report] = runDoctor(root)
    const lifecycle = checkOf(report, 'lifecycle-consistency')
    const issue = lifecycle.issues.find((item) => item.task === rel)
    assert.ok(issue, 'invalid stage/mode combination must be reported')
    assert.equal(issue.title, 'Invalid stage for mode')
    assert.match(issue.message, /stage "orchestrating" is not a valid mainline stage for mode "standard"/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('生命周期一致性：非法状态样本（未映射 stage/status 值、双字段不一致）报 issue', () => {
  const root = makeRoot()
  initWorkloom(root)
  try {
    // 未映射 stage 值：兼容读的可判定错误转为 issue。
    const badStage = writeSampleTask(
      root,
      '11-01-bad-stage',
      baseRecord({ name: '11-01-bad-stage', status: 'in_progress', stage: 'weird' }),
    )
    // 未映射 status 值。
    const badStatus = writeSampleTask(
      root,
      '11-01-bad-status',
      baseRecord({ name: '11-01-bad-status', status: 'banana' }),
    )
    // status 与 stage 双字段不一致（手改痕迹）。
    const mismatch = writeSampleTask(
      root,
      '11-01-mismatch',
      baseRecord({ name: '11-01-mismatch', status: 'planning', stage: 'implementing' }),
    )
    const [, report] = runDoctor(root)
    const lifecycle = checkOf(report, 'lifecycle-consistency')
    const unreadable = lifecycle.issues.filter((item) => item.title === 'Unreadable or invalid task record')
    assert.ok(unreadable.some((item) => item.task === badStage && /unmapped stage value/.test(item.message)))
    assert.ok(unreadable.some((item) => item.task === badStatus && /unmapped status value/.test(item.message)))
    const mismatchIssue = lifecycle.issues.find((item) => item.task === mismatch)
    assert.ok(mismatchIssue)
    assert.equal(mismatchIssue.title, 'Status/stage mismatch')
    assert.match(mismatchIssue.message, /status "planning" does not match stage "implementing"/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('生命周期一致性：轨道值非法样本（casePhase/planReview 未映射值）报 issue', () => {
  const root = makeRoot()
  initWorkloom(root)
  try {
    // casePhase 轨道值非法。
    const badCase = writeSampleTask(
      root,
      '11-01-bad-case-phase',
      baseRecord({
        name: '11-01-bad-case-phase',
        status: 'in_progress',
        stage: 'implementing',
        case: { required: true, designSession: null, phase: 'weird' },
      }),
    )
    // planReview 轨道值非法（字符串形态不在存储契约内）。
    const badReview = writeSampleTask(
      root,
      '11-01-bad-plan-review',
      baseRecord({ name: '11-01-bad-plan-review', planReview: 'clean' }),
    )
    const [, report] = runDoctor(root)
    const lifecycle = checkOf(report, 'lifecycle-consistency')
    const unreadable = lifecycle.issues.filter((item) => item.title === 'Unreadable or invalid task record')
    assert.ok(
      unreadable.some((item) => item.task === badCase && /unmapped case phase value/.test(item.message)),
      'illegal casePhase track value must be reported',
    )
    assert.ok(
      unreadable.some((item) => item.task === badReview && /unmapped planReview value/.test(item.message)),
      'illegal planReview track value must be reported',
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('生命周期一致性：revising 轮数只记录不判定（info 行输出，非 issue）', () => {
  const root = makeRoot()
  initWorkloom(root)
  try {
    const rel = writeSampleTask(
      root,
      '11-01-revising',
      baseRecord({
        name: '11-01-revising',
        planReview: { phase: 'revising', revisions: 3 },
      }),
    )
    const [, report] = runDoctor(root)
    const lifecycle = checkOf(report, 'lifecycle-consistency')
    assert.equal(lifecycle.issues.filter((item) => item.task === rel).length, 0)
    assert.ok(
      lifecycle.info.some((line) => line.includes(rel) && line.includes('revising rounds recorded: 3')),
      'revising rounds must be recorded as info, not judged',
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('确认完整性：manual 缺确认却过 planning 报 issue；确认齐备零 issue', () => {
  const root = makeRoot()
  initWorkloom(root)
  try {
    // 手动自治度、已过对齐期（implementing）但无 PRD 确认记录（force 放行痕迹）。
    const rel = writeSampleTask(
      root,
      '11-01-no-confirm',
      baseRecord({ name: '11-01-no-confirm', status: 'in_progress', stage: 'implementing', mode: 'standard' }),
    )
    // 对照样本：确认齐备的 standard 实现期任务。
    const okRel = writeSampleTask(
      root,
      '11-01-confirmed',
      baseRecord({
        name: '11-01-confirmed',
        status: 'in_progress',
        stage: 'implementing',
        mode: 'standard',
        alignment: { passedAt: '2026-11-01T00:00:00Z', summary: 's', source: 'user', autonomy: 'manual' },
        planConfirmation: { passedAt: '2026-11-01T00:00:00Z', summary: 'p', source: 'user', autonomy: 'manual' },
      }),
    )
    const [, report] = runDoctor(root)
    const confirm = checkOf(report, 'confirm-completeness')
    const prdIssue = confirm.issues.find((item) => item.task === rel && item.title === 'Missing PRD confirmation')
    assert.ok(prdIssue, 'manual task past aligning without PRD confirmation must be reported')
    assert.match(prdIssue.message, /autonomy: manual/)
    assert.ok(
      confirm.issues.some((item) => item.task === rel && item.title === 'Missing PLAN confirmation'),
      'standard task in implementing without PLAN confirmation must be reported',
    )
    assert.equal(confirm.issues.filter((item) => item.task === okRel).length, 0)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('确认完整性：自动记录缺 autonomy 快照、PLAN 已确认但评审轨道未 clean 均报 issue', () => {
  const root = makeRoot()
  initWorkloom(root)
  try {
    const rel = writeSampleTask(
      root,
      '11-01-auto-audit',
      baseRecord({
        name: '11-01-auto-audit',
        status: 'in_progress',
        stage: 'implementing',
        mode: 'standard',
        autonomy: 'auto',
        alignment: { passedAt: '2026-11-01T00:00:00Z', summary: 'auto', source: 'auto' },
        planConfirmation: { passedAt: '2026-11-01T00:00:00Z', summary: 'auto', source: 'auto', autonomy: 'auto' },
        planReview: { phase: 'reviewing', revisions: 0 },
      }),
    )
    const [, report] = runDoctor(root)
    const confirm = checkOf(report, 'confirm-completeness')
    assert.ok(
      confirm.issues.some(
        (item) => item.task === rel && item.title === 'Auto confirmation missing autonomy snapshot',
      ),
    )
    assert.ok(
      confirm.issues.some(
        (item) => item.task === rel && item.title === 'PLAN confirmed while review track not clean',
      ),
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('CASE 一致性：light 携带轨道值、designSession 无派发、done 无 RESULT 分别报 issue', () => {
  const root = makeRoot()
  initWorkloom(root)
  try {
    // light 任务携带 CASE 轨道值（light 无 CASE 轨道）。
    const lightRel = writeSampleTask(
      root,
      '11-01-light-case',
      baseRecord({
        name: '11-01-light-case',
        status: 'in_progress',
        stage: 'implementing',
        mode: 'light',
        case: { required: false, designSession: null, phase: 'designing' },
      }),
    )
    // designSession 无对应 case-design 派发记录。
    const sessionRel = writeSampleTask(
      root,
      '11-01-orphan-session',
      baseRecord({
        name: '11-01-orphan-session',
        status: 'in_progress',
        stage: 'implementing',
        mode: 'standard',
        alignment: { passedAt: 'x', summary: 's' },
        planConfirmation: { passedAt: 'y', summary: 'p' },
        case: { required: true, designSession: 'child-orphan' },
      }),
    )
    // casePhase done 但 case-result.md 缺失（有执行派发记录）。
    const doneRel = writeSampleTask(
      root,
      '11-01-done-no-result',
      baseRecord({
        name: '11-01-done-no-result',
        status: 'in_progress',
        stage: 'checking',
        mode: 'standard',
        alignment: { passedAt: 'x', summary: 's' },
        planConfirmation: { passedAt: 'y', summary: 'p' },
        case: { required: true, designSession: null, phase: 'done' },
        dispatches: [
          { kind: 'checker', at: '2026-11-01T00:00:00Z', title: 'exec', purpose: 'execution', status: 'completed' },
        ],
      }),
    )
    const [, report] = runDoctor(root)
    const caseCheck = checkOf(report, 'case-consistency')
    assert.ok(
      caseCheck.issues.some(
        (item) => item.task === lightRel && item.title === 'Light task carries a CASE track value',
      ),
    )
    assert.ok(
      caseCheck.issues.some(
        (item) => item.task === sessionRel && item.title === 'Design session without dispatch record',
      ),
    )
    assert.ok(
      caseCheck.issues.some(
        (item) => item.task === doneRel && item.title === 'CASE done without result document',
      ),
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('CASE 一致性：轨道值 approved 及之后须有执行派发记录（轨道值与派发对照）', () => {
  const root = makeRoot()
  initWorkloom(root)
  try {
    const rel = writeSampleTask(
      root,
      '11-01-track-no-exec',
      baseRecord({
        name: '11-01-track-no-exec',
        status: 'in_progress',
        stage: 'implementing',
        mode: 'standard',
        alignment: { passedAt: 'x', summary: 's' },
        planConfirmation: { passedAt: 'y', summary: 'p' },
        case: { required: true, designSession: null, phase: 'approved' },
      }),
    )
    const [, report] = runDoctor(root)
    const caseCheck = checkOf(report, 'case-consistency')
    const issue = caseCheck.issues.find((item) => item.task === rel)
    assert.ok(issue)
    assert.equal(issue.title, 'CASE track ahead of dispatch records')
    assert.match(issue.message, /casePhase is "approved" but no execution dispatch is recorded/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('生命周期一致性：归档区样本纳入扫描（归档路径读作 archived，不追溯确认）', () => {
  const root = makeRoot()
  initWorkloom(root)
  try {
    const rel = join('tasks', 'archive', '2026-10', 'old-task')
    mkdirSync(join(root, WORKLOOM_DIR, rel), { recursive: true })
    writeFileSync(
      join(root, WORKLOOM_DIR, rel, 'task.json'),
      `${JSON.stringify(baseRecord({ name: 'old-task', status: 'completed', stage: 'implement' }), null, 2)}\n`,
    )
    const [, report] = runDoctor(root)
    const lifecycle = checkOf(report, 'lifecycle-consistency')
    assert.equal(lifecycle.issues.length, 0, 'legacy archived records must stay readable')
    const confirm = checkOf(report, 'confirm-completeness')
    assert.equal(confirm.issues.length, 0, 'archived tasks are not retroactively checked')
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
    const config = checkOf(report, 'config')
    assert.ok(config.issues.some((issue) => issue.severity === 'error' && /config is invalid/.test(issue.message)))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
  const root2 = makeRoot()
  initWorkloom(root2)
  writeFileSync(join(root2, WORKLOOM_DIR, 'config.json'), '{}\n')
  try {
    const [, report2] = runDoctor(root2)
    const config = checkOf(report2, 'config')
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
    const worktree = checkOf(report, 'worktree')
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
    const worktree = checkOf(report, 'worktree')
    assert.ok(
      worktree.issues.some((issue) => issue.title === 'Unregistered worktree directory'),
      'stray directory must be reported',
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
