import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  CASE_FILES,
  createCaseRecord,
  inspectCaseStructure,
} from '../src/task/case-structure.ts'
import {
  evaluateCaseExecutionGate,
  evaluateCaseOutcomeGate,
} from '../src/task/case-gates.ts'
import { listCaseChangedLines } from '../src/task/case-scope.ts'
import { inspectPlanDoc } from '../src/task/prd-structure.ts'
import { archiveTask, checkTask } from '../src/task/task-ops.ts'
import { evaluateGuard, readTaskView, toTaskView } from '../src/task/state/index.ts'
import { executeTaskCase } from '../src/task/doc-review.ts'

const REL = 'tasks/demo'
/** 夹具代码指纹（64 hex），豁免比对源。 */
const TEST_FP = 'b'.repeat(64)
const PRD = `# Demo

## Goal

Verify.

## Requirements

- R1: code
- R2: docs

## Acceptance Criteria

- AC1: verify code
- AC2: verify docs

## Notes

- none
`

function validCase(rel = REL) {
  return `---
version: 1
task: ${rel}
---

# CASE: Demo

## References

- PRD: \`prd.md\`
- Implementation: \`plan.md\`
- Code target: \`main\`
- Source task: \`none\`

## Scope

- Requirements: \`R1, R2\`
- Acceptance criteria: \`AC1, AC2\`
- Out of scope:
  - \`none\`

## Static Review

### SR1 code

- Covers: \`AC1\`
- Target: \`src/a.js#main\`
- Checks:
  1. behavior
- Expected: correct

### SR2 docs

- Covers: \`AC2\`
- Target: \`docs/guide.md#whole-file\`
- Checks:
  1. content
- Expected: current

## Runtime Cases

### C1 code runs

- Covers: \`AC1\`
- Preconditions:
  1. dependencies ready
- Steps:
  1. run code
- Expected:
  1. exits zero
- Evidence:
  - output
- Cleanup: \`none\`

### C2 docs render

- Covers: \`AC2\`
- Preconditions:
  1. renderer ready
- Steps:
  1. render docs
- Expected:
  1. content matches
- Evidence:
  - output
- Cleanup: \`none\`

## Coverage

- Tool: \`node:test coverage\`
- Instrumentation: \`node --experimental-test-coverage\`
- Aggregate command:
  \`\`\`bash
  node --test
  \`\`\`
- Scope: \`src and docs\`
- Exclusions:
  - docs/guide.md: documentation
- Raw outputs:
  - \`coverage/lcov.info\`

## Traceability

| AC | Static review | Runtime cases |
| --- | --- | --- |
| AC1 | SR1 | C1 |
| AC2 | SR2 | C2 |
`
}

function validResult(caseContent, rel = REL) {
  return `---
version: 1
task: ${rel}
codeBaseline: main@abc; codeFingerprint=${TEST_FP}
checkSession: child-design
status: passed
startedAt: '2026-01-01T00:00:00.000Z'
completedAt: '2026-01-01T00:01:00.000Z'
---

# CASE Result: Demo

## Summary

- Static review: \`2/2\`
- Runtime cases: \`2/2; blocked: 0\`
- Coverage: \`generated\`
- Standard verification: \`passed\`

## Static Review Results

### SR1 code

- Status: \`passed\`
- Evidence: \`src/a.js inspected\`
- Findings: \`none\`

### SR2 docs

- Status: \`passed\`
- Evidence: \`docs/guide.md inspected\`
- Findings: \`none\`

## Runtime Results

### C1 code runs

- Status: \`passed\`
- Executed at: \`2026-01-01T00:00:00.000Z\`
- Actions:
  1. run code
- Observed: \`exit zero\`
- Evidence:
  - \`case-evidence/c1.txt\`
- Findings: \`none\`

### C2 docs render

- Status: \`passed\`
- Executed at: \`2026-01-01T00:00:01.000Z\`
- Actions:
  1. render docs
- Observed: \`matched\`
- Evidence:
  - output
- Findings: \`none\`

## Coverage

- Status: \`generated\`
- Tool: \`node:test\`
- Command: \`node --test\`
- Overall lines: \`19/20 (95%)\`
- Raw reports:
  - \`coverage/lcov.info\`

### Changed Files

| File | Covered/Total | Line coverage | Uncovered lines | Details |
| --- | --- | --- | --- | --- |
| \`src/a.js\` | \`19/20\` | \`95%\` | \`10\` | \`coverage/lcov.info\` |

### Exclusions

| Path | Reason |
| --- | --- |
| \`docs/guide.md\` | \`documentation\` |

### Collection Failure

\`none\`

## Standard Verification

| Command | Exit code | Evidence |
| --- | --- | --- |
| \`node --test\` | \`0\` | \`output\` |

## Resolved Findings

- none

## Open issues

- none
`
}

function makeRoot() {
  const root = mkdtempSync(join(tmpdir(), 'workloom-core-case-'))
  const taskDir = join(root, '.workloom', REL)
  mkdirSync(taskDir, { recursive: true })
  mkdirSync(join(root, 'src'), { recursive: true })
  mkdirSync(join(root, 'docs'), { recursive: true })
  writeFileSync(join(root, 'src/a.js'), 'export const a = 1\n')
  writeFileSync(join(root, 'docs/guide.md'), '# guide\n')
  mkdirSync(join(taskDir, 'case-evidence'), { recursive: true })
  mkdirSync(join(taskDir, 'coverage'), { recursive: true })
  writeFileSync(join(taskDir, 'case-evidence/c1.txt'), 'ok\n')
  writeLcovReport(root, taskDir)
  writeFileSync(join(taskDir, 'prd.md'), PRD)
  return { root, taskDir }
}

/** 写基准 lcov 报告：src/a.js 20 行变更行，19 行覆盖（95%）。 */
function writeLcovReport(root, taskDir, total = 20, covered = 19, file = 'src/a.js') {
  const das = Array.from({ length: total }, (_, index) => `DA:${index + 1},${index < covered ? 1 : 0}`)
  writeFileSync(
    join(taskDir, 'coverage/lcov.info'),
    [`SF:${join(root, file)}`, ...das, 'end_of_record', ''].join('\n'),
  )
}

/** 门禁选项：显式变更行（避免测试夹具依赖真实 git 历史）。 */
function coverageOptions(total = 20) {
  return {
    changedFiles: ['src/a.js', 'docs/guide.md'],
    changedLines: new Map([['src/a.js', [{ start: 1, end: total }]]]),
  }
}

function makeTask() {
  const caseRecord = createCaseRecord(true)
  caseRecord.designSession = 'child-design'
  return {
    title: 'Demo',
    status: 'in_progress',
    mode: 'full',
    case: caseRecord,
    children: [],
    dispatches: [{ kind: 'checker', childId: 'child-design', purpose: 'case-design' }],
    worktree_path: '',
    overrides: [],
    hooks: { after_create: [], after_start: [], after_finish: [], after_archive: [] },
  }
}

function writeArtifacts(taskDir, caseContent, resultContent) {
  writeFileSync(join(taskDir, CASE_FILES.document), caseContent)
  writeFileSync(join(taskDir, CASE_FILES.result), resultContent)
}

test('createCaseRecord 保留历史字段，新记录不写确认字段', () => {
  const previous = {
    required: false,
    designSession: 'legacy-design',
    confirmedAt: '2026-08-01T00:00:00Z',
    caseHash: 'legacy-hash',
    summary: 'legacy confirmation',
    result: { caseHash: 'old', resultHash: 'old', passedAt: '2026-08-01T00:00:00Z' },
  }
  assert.deepEqual(createCaseRecord(true, previous), { ...previous, required: true })
  assert.deepEqual(Object.keys(createCaseRecord(true)), ['required', 'designSession'])
})

test('listCaseChangedLines 三点口径、无分支回退与无效 ref（.workloom 过滤）', async () => {
  const root = mkdtempSync(join(tmpdir(), 'workloom-case-scope-'))
  const commit = (message) => {
    execFileSync('git', ['add', '-A'], { cwd: root })
    execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-q', '-m', message], { cwd: root })
  }
  try {
    execFileSync('git', ['init', '-q'], { cwd: root })
    writeFileSync(join(root, 'a.ts'), 'a\nb\n')
    commit('init')
    execFileSync('git', ['branch', 'base'], { cwd: root })

    writeFileSync(join(root, 'a.ts'), 'a\nB2\n')
    mkdirSync(join(root, '.workloom'), { recursive: true })
    writeFileSync(join(root, '.workloom/notes.md'), 'metadata\n')
    commit('change')

    const [err, changed] = await listCaseChangedLines(root, {
      branch: 'master',
      base_branch: 'base',
      worktree_path: '',
    })
    assert.equal(err, null)
    assert.deepEqual(changed.get('a.ts'), [{ start: 2, end: 2 }])
    assert.equal(changed.has('.workloom/notes.md'), false)

    writeFileSync(join(root, 'untracked.ts'), 'u1\nu2\n')
    const [lightErr, lightChanged] = await listCaseChangedLines(root, {
      branch: '',
      base_branch: '',
      worktree_path: '',
    })
    assert.equal(lightErr, null)
    assert.deepEqual(lightChanged.get('untracked.ts'), [{ start: 1, end: 2 }])

    const [refErr, refChanged] = await listCaseChangedLines(root, {
      branch: 'master',
      base_branch: 'no-such-branch',
      worktree_path: '',
    })
    assert.ok(refErr)
    assert.equal(refChanged, null)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('CASE/PLAN 深度结构校验接受有效材料并聚合缺漏', () => {
  const caseContent = validCase()
  assert.deepEqual(
    inspectCaseStructure(caseContent, PRD, {
      taskRelPath: REL,
      children: [],
      changedFiles: ['src/a.js', 'docs/guide.md'],
    }),
    [],
  )
  const broken = caseContent.replace('### C1 code runs', '### C9 code runs').replace('| AC1 | SR1 | C1 |', '| AC1 | SR9 | C9 |')
  const codes = inspectCaseStructure(broken, PRD, { taskRelPath: REL }).map((item) => item.code)
  assert.ok(codes.includes('item_order_invalid'))
  assert.ok(codes.includes('traceability_unknown'))
  assert.ok(
    inspectCaseStructure(caseContent, PRD, { taskRelPath: REL, changedFiles: ['src/missing.js'] })
      .some((item) => item.code === 'changed_file_unreviewed'),
  )
  const parentCase = caseContent.replace(
    '- Implementation: `plan.md`',
    '- Implementation:\n  - tasks/a/plan.md\n  - tasks/b/plan.md',
  )
  assert.deepEqual(
    inspectCaseStructure(parentCase, PRD, { taskRelPath: REL, children: ['tasks/a', 'tasks/b'] }),
    [],
  )
  const plan = `# Plan\n\n## Steps\n\n#### 步骤 1.1 test\n\n- Covers: AC1, AC2\n- Target: src/a.js\n- Edit:\n  Input: adjust src/a.js behavior.\n  Output: function returns updated result.\n  Preconditions: none\n  Procedure: edit the guarded branch per anchors.\n  Failure: none\n- Verify: node --test\n`
  assert.deepEqual(inspectPlanDoc(plan, PRD), [])
  assert.equal(inspectPlanDoc(null, PRD)[0].code, 'plan_missing')
  assert.ok(inspectPlanDoc(plan.replace('AC2', ''), PRD).some((item) => item.code === 'plan_ac_missing'))
})

test('start 门要求完整实施任务 PLAN，父任务豁免', () => {
  const { root, taskDir } = makeRoot()
  try {
    const prd = `${PRD}\n## Alignment Decisions\n\n- design tree converged\n`
    writeFileSync(join(taskDir, 'prd.md'), prd)
    writeFileSync(join(taskDir, 'implement.jsonl'), '{"file":"src/a.js"}\n')
    writeFileSync(join(taskDir, 'check.jsonl'), '{"file":"src/a.js"}\n')
    const task = {
      status: 'planning',
      mode: 'full',
      children: [],
      alignment: { passedAt: '2026-01-01T00:00:00.000Z', summary: 'prd confirmed' },
    }
    // start-ready 守卫（收编旧 start 门禁的结构与 jsonl 段）：完整实施任务
    // 必须有 PLAN；容器任务（children 非空）豁免 PLAN 结构检查。
    const ctx = { root, taskRelPath: REL }
    const [, reason] = evaluateGuard('start-ready', toTaskView(task, REL), ctx)
    assert.ok(reason !== null && reason.includes('plan.md is missing'))
    const [, containerReason] = evaluateGuard(
      'start-ready',
      toTaskView({ ...task, children: ['tasks/child'] }, REL),
      ctx,
    )
    assert.ok(containerReason === null || !containerReason.includes('plan.md is missing'))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('CASE 执行前置只要求 case.md 与 designSession', () => {
  const { root, taskDir } = makeRoot()
  try {
    const caseContent = validCase()
    writeFileSync(join(taskDir, CASE_FILES.document), caseContent)
    const task = makeTask()
    // 无确认记录、无哈希：文档存在 + 设计会话非空即放行
    assert.deepEqual(evaluateCaseExecutionGate(root, REL, task), [])
    // CASE 文档在复核后被修改：不再判定「确认失效」，仍然放行
    writeFileSync(join(taskDir, CASE_FILES.document), `${caseContent}\n`)
    assert.deepEqual(evaluateCaseExecutionGate(root, REL, task), [])
    // designSession 缺失仍拒绝
    const noSession = { ...task, case: createCaseRecord(true) }
    assert.deepEqual(evaluateCaseExecutionGate(root, REL, noSession), ['case.designSession is missing'])
    // case.md 缺失仍拒绝
    rmSync(join(taskDir, CASE_FILES.document))
    assert.deepEqual(evaluateCaseExecutionGate(root, REL, task), ['case.md is missing'])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('RESULT generated 通过、失败覆盖率与 blocked 均按硬门禁处理', () => {
  const { root, taskDir } = makeRoot()
  try {
    const caseContent = validCase()
    const resultContent = validResult(caseContent)
    writeArtifacts(taskDir, caseContent, resultContent)
    const task = makeTask()
    const options = coverageOptions()
    assert.deepEqual(evaluateCaseOutcomeGate(root, REL, task, options), [])
    writeFileSync(join(taskDir, CASE_FILES.result), resultContent.replaceAll('`generated`', '`failed`'))
    assert.ok(evaluateCaseOutcomeGate(root, REL, task, options).some((item) => item.code === 'coverage_status'))
    const blocked = resultContent.replace('status: passed', 'status: failed').replace('### C2 docs render\n\n- Status: `passed`', '### C2 docs render\n\n- Status: `blocked`')
    writeFileSync(join(taskDir, CASE_FILES.result), blocked)
    const issues = evaluateCaseOutcomeGate(root, REL, task, options)
    assert.ok(issues.some((item) => item.code === 'result_status'))
    assert.ok(issues.some((item) => item.message.includes('C2 status must be passed')))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('RESULT 会话链校验保留，结果哈希关联与结果状态记录删除', () => {
  const { root, taskDir } = makeRoot()
  try {
    const caseContent = validCase()
    const resultContent = validResult(caseContent).replace('checkSession: child-design', 'checkSession: child-exec')
    writeArtifacts(taskDir, caseContent, resultContent)
    const task = makeTask()
    const options = coverageOptions()
    // 会话链校验保留：checkSession 必须等于 designSession 或经 fallbackOf 可达
    assert.ok(evaluateCaseOutcomeGate(root, REL, task, options).some((item) => item.code === 'result_session'))
    task.dispatches.push({ kind: 'checker', childId: 'child-exec', fallbackOf: 'child-design', purpose: 'execution' })
    assert.deepEqual(evaluateCaseOutcomeGate(root, REL, task, options), [])
    // RESULT 与 CASE 文档在执行后被修改：不再有哈希关联校验，仍按结构校验判定
    writeFileSync(join(taskDir, CASE_FILES.result), `${resultContent}\n`)
    assert.deepEqual(evaluateCaseOutcomeGate(root, REL, task, options), [])
    writeFileSync(join(taskDir, CASE_FILES.document), `${caseContent}\n`)
    assert.deepEqual(evaluateCaseOutcomeGate(root, REL, task, options), [])
    // task.case.result 状态记录删除：旧任务遗留字段不参与任何校验
    const legacy = { ...task, case: { ...task.case, result: { caseHash: 'a', resultHash: 'b', passedAt: 'now' } } }
    assert.deepEqual(evaluateCaseOutcomeGate(root, REL, legacy, options), [])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('纯文档范围允许 not_applicable，文件缺失或漏审仍拒绝', () => {
  const { root, taskDir } = makeRoot()
  try {
    const caseContent = validCase().replaceAll('src/a.js', 'docs/guide.md')
    let resultContent = validResult(caseContent)
      .replaceAll('`generated`', '`not_applicable`')
      .replace('`19/20 (95%)`', '`N/A`')
      .replaceAll('`coverage/lcov.info`', '`none`')
    resultContent = resultContent.replace('| `src/a.js` | `19/20` | `95%` | `10` | `none` |\n', '')
      .replace('### Exclusions', '- Reason: docs only, no executable changes\n\n### Exclusions')
    writeArtifacts(taskDir, caseContent, resultContent)
    const task = makeTask()
    const issues = evaluateCaseOutcomeGate(root, REL, task, {
      changedFiles: ['docs/guide.md'],
      changedLines: new Map(),
    })
    assert.deepEqual(issues, [])
    // 缺 - Reason: 行时拒绝（零分母原因载体，不再依赖非空 Exclusions）
    writeFileSync(join(taskDir, CASE_FILES.result), resultContent.replace('- Reason: docs only, no executable changes\n\n', ''))
    assert.ok(
      evaluateCaseOutcomeGate(root, REL, task, { changedFiles: ['docs/guide.md'], changedLines: new Map() })
        .some((item) => item.code === 'coverage_na_reason'),
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('force 不能绕过核心 CASE 问题且不新增 override', () => {
  const { root, taskDir } = makeRoot()
  try {
    const caseContent = validCase()
    writeArtifacts(taskDir, caseContent, validResult(caseContent).replaceAll('`generated`', '`failed`'))
    const task = makeTask()
    writeFileSync(join(taskDir, 'task.json'), JSON.stringify(task))
    const [err] = checkTask(root, { taskRelPath: REL, summary: 'forced', force: true, reason: 'test' })
    assert.ok(err)
    assert.match(err.message, /cannot be bypassed with force/)
    assert.deepEqual(JSON.parse(readFileSync(join(taskDir, 'task.json'), 'utf8')).overrides, [])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('archive 同样拒绝核心 CASE 问题且不移动任务目录', async () => {
  const { root, taskDir } = makeRoot()
  try {
    const caseContent = validCase()
    writeArtifacts(taskDir, caseContent, validResult(caseContent).replaceAll('`generated`', '`failed`'))
    const task = makeTask()
    writeFileSync(join(taskDir, 'task.json'), JSON.stringify(task))
    const before = readFileSync(join(taskDir, 'task.json'), 'utf8')
    const [err] = await archiveTask(root, {
      taskRelPath: REL,
      autoCommit: false,
      force: true,
      reason: 'test',
    })
    assert.ok(err)
    assert.match(err.message, /transition rejected/)
    assert.equal(readFileSync(join(taskDir, 'task.json'), 'utf8'), before)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('service 只支持 review：返回内容、结构诊断、会话链与就绪标志，无哈希无确认写入', () => {
  const { root, taskDir } = makeRoot()
  try {
    execFileSync('git', ['init'], { cwd: root, stdio: 'ignore' })
    execFileSync('git', ['add', 'src', 'docs'], { cwd: root })
    execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'init'], { cwd: root, stdio: 'ignore' })
    const caseContent = validCase()
    writeFileSync(join(taskDir, CASE_FILES.document), caseContent)
    writeFileSync(join(taskDir, 'task.json'), JSON.stringify(makeTask()))
    const [reviewErr, review] = executeTaskCase(root, 'unused', { action: 'review', taskPath: REL })
    assert.equal(reviewErr, null)
    assert.equal(review.action, 'review')
    assert.equal(review.case, caseContent)
    assert.equal(review.designSession, 'child-design')
    assert.deepEqual(review.structureIssues, [])
    assert.deepEqual(review.blockers, [])
    assert.equal(review.readyForExecution, true)
    // 无哈希字段、无确认动作：confirm 一律拒绝（协议只保留 review）
    assert.equal('caseHash' in review, false)
    const [confirmErr] = executeTaskCase(root, 'unused', {
      action: 'confirm', taskPath: REL, expectedCaseHash: 'x', summary: 'approved',
    })
    assert.ok(confirmErr)
    assert.match(confirmErr.message, /only action=review is supported/)
    // CASE 文档复核后被修改：review 照常返回诊断，执行前置不受影响
    writeFileSync(join(taskDir, CASE_FILES.document), `${caseContent}\n`)
    const [, changed] = executeTaskCase(root, 'unused', { action: 'review', taskPath: REL })
    assert.equal(changed.readyForExecution, true)
    const [, saved] = readTaskView(root, REL)
    assert.deepEqual(evaluateCaseExecutionGate(root, REL, saved), [])
    // task.json 未写入任何确认凭证
    assert.equal('confirmedAt' in saved.case, false)
    assert.equal('caseHash' in saved.case, false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})


test('子任务归档后父任务 CASE review 从归档目录解析 PLAN', () => {
  const { root, taskDir } = makeRoot()
  try {
    execFileSync('git', ['init'], { cwd: root, stdio: 'ignore' })
    execFileSync('git', ['add', 'src', 'docs'], { cwd: root })
    execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'init'], { cwd: root, stdio: 'ignore' })
    const CHILD_A = 'tasks/child-a'
    const CHILD_B = 'tasks/11-03-child-b'
    const caseContent = validCase().replace(
      '- Implementation: `plan.md`',
      '- Implementation:\n  - tasks/child-a/plan.md\n  - tasks/11-03-child-b/plan.md',
    )
    writeFileSync(join(taskDir, CASE_FILES.document), caseContent)
    // 归档形态：子任务目录已移入 tasks/archive/<YYYY-MM>/，children 仍指向归档前路径；
    // child-b 模拟真实布局：活动目录名带 MM-DD- 前缀，归档目录名只保留 slug。
    const archiveMonthDir = join(root, '.workloom', 'tasks', 'archive', '2026-11')
    mkdirSync(join(archiveMonthDir, 'child-a'), { recursive: true })
    mkdirSync(join(archiveMonthDir, 'child-b'), { recursive: true })
    writeFileSync(join(archiveMonthDir, 'child-a', 'plan.md'), '# Plan\n\n## Steps\n\n#### 步骤 1.1 test\n')
    writeFileSync(join(archiveMonthDir, 'child-b', 'plan.md'), '# Plan\n\n## Steps\n\n#### 步骤 1.1 test\n')
    const task = { ...makeTask(), children: [CHILD_A, CHILD_B] }
    writeFileSync(join(taskDir, 'task.json'), JSON.stringify(task))
    const [reviewErr, review] = executeTaskCase(root, 'unused', { action: 'review', taskPath: REL })
    assert.equal(reviewErr, null)
    assert.deepEqual(review.structureIssues, [])
    assert.equal(review.readyForExecution, true)
    // 当前路径与归档路径都不存在时，保留 parent_plan_missing 明确错误
    rmSync(join(root, '.workloom', 'tasks', 'archive'), { recursive: true, force: true })
    const [, missing] = executeTaskCase(root, 'unused', { action: 'review', taskPath: REL })
    assert.ok(missing.structureIssues.every((item) => item.code === 'parent_plan_missing'))
    assert.ok(missing.structureIssues.some((item) => item.message === `${CHILD_A}/plan.md is missing`))
    assert.ok(missing.structureIssues.some((item) => item.message === `${CHILD_B}/plan.md is missing`))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('Traceability 按列解析引用：SR-only 与 C-only 均放行，两列皆空才判 empty', () => {
  // SR-only 行合法（R4：每个 AC 至少一个 SR 或 C；`-`/none 是空列占位）
  const srOnly = validCase().replace('| AC2 | SR2 | C2 |', '| AC2 | SR2 | - |')
  assert.deepEqual(inspectCaseStructure(srOnly, PRD, { taskRelPath: REL }), [])
  // C-only 行合法（如 AC13 只有运行用例；复用既有 C1 条目）
  const cOnly = validCase().replace('| AC2 | SR2 | C2 |', '| AC2 | - | C1 |')
  assert.deepEqual(inspectCaseStructure(cOnly, PRD, { taskRelPath: REL }), [])
  // 两列皆空（含 `-` 占位与错列引用）→ traceability_empty；AC 编号本身不得被行级
  // 正则当成 C 引用救回空列
  const bothEmpty = validCase().replace('| AC2 | SR2 | C2 |', '| AC2 | - | - |')
  assert.ok(
    inspectCaseStructure(bothEmpty, PRD, { taskRelPath: REL })
      .some((item) => item.code === 'traceability_empty'),
  )
  const swapped = validCase().replace('| AC2 | SR2 | C2 |', '| AC2 | C2 | SR2 |')
  assert.ok(
    inspectCaseStructure(swapped, PRD, { taskRelPath: REL })
      .some((item) => item.code === 'traceability_empty'),
  )
})

test('Coverage Exclusions 规则支持目录前缀与单层/任意层级通配', () => {
  const caseContent = validCase().replace(
    '- Exclusions:\n  - docs/guide.md: documentation',
    '- Exclusions:\n  - `docs/**`: generated docs\n  - `*.txt`: scratch files',
  )
  // 目录前缀 + `**`：docs 下两级路径均被排除
  assert.deepEqual(
    inspectCaseStructure(caseContent, PRD, {
      taskRelPath: REL,
      changedFiles: ['src/a.js', 'docs/guide.md', 'docs/deep/x.md'],
    }),
    [],
  )
  // `*` 只匹配单层路径段：子目录内的同类文件不被排除
  const nested = inspectCaseStructure(caseContent, PRD, {
    taskRelPath: REL,
    changedFiles: ['src/a.js', 'notes/todo.txt'],
  })
  assert.ok(nested.some((item) => item.code === 'changed_file_unreviewed'))
  // 根层单段文件被 `*.txt` 排除
  assert.deepEqual(
    inspectCaseStructure(caseContent, PRD, { taskRelPath: REL, changedFiles: ['src/a.js', 'todo.txt'] }),
    [],
  )
})

/** 构造可变的增量 RESULT 文本（默认 generated 19/20）。 */
function variedResult({
  status = 'generated',
  overall = '19/20 (95%)',
  row = '| `src/a.js` | `19/20` | `95%` | `20` | `coverage/lcov.info` |',
  fingerprint = TEST_FP,
  below = '',
} = {}) {
  let result = validResult()
    .replace(`codeFingerprint=${TEST_FP}`, `codeFingerprint=${fingerprint}`)
    .replace('`19/20 (95%)`', `\`${overall}\``)
    .replace('| `src/a.js` | `19/20` | `95%` | `10` | `coverage/lcov.info` |', row)
    .replaceAll('`generated`', `\`${status}\``)
  if (below !== '') result = result.replace('### Exclusions', `${below}\n\n### Exclusions`)
  return result
}

/** 只关心覆盖率相关问题的断言（排除既有的通用结构检查噪声）。 */
function coverageIssues(issues) {
  return issues.filter((item) => item.code.startsWith('coverage_'))
}

test('增量阈值严格大于 90%：90.0 拒、90.1 过', () => {
  const { root, taskDir } = makeRoot()
  try {
    const task = makeTask()
    const options = coverageOptions(1000)
    writeLcovReport(root, taskDir, 1000, 900)
    writeArtifacts(taskDir, validCase(), variedResult({ overall: '900/1000 (90%)', row: '| `src/a.js` | `900/1000` | `90%` | `1000` | `coverage/lcov.info` |' }))
    assert.ok(coverageIssues(evaluateCaseOutcomeGate(root, REL, task, options)).some((item) => item.code === 'coverage_threshold'))

    writeLcovReport(root, taskDir, 1000, 901)
    writeArtifacts(taskDir, validCase(), variedResult({ overall: '901/1000 (90.1%)', row: '| `src/a.js` | `901/1000` | `90.1%` | `1000` | `coverage/lcov.info` |' }))
    assert.deepEqual(coverageIssues(evaluateCaseOutcomeGate(root, REL, task, options)), [])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('缺席可执行文件硬拒，非可执行后缀缺席不触发', () => {
  const { root, taskDir } = makeRoot()
  try {
    const task = makeTask()
    const options = {
      changedFiles: ['src/a.js', 'src/missing.go', 'README.md'],
      changedLines: new Map([
        ['src/a.js', [{ start: 1, end: 20 }]],
        ['src/missing.go', [{ start: 1, end: 2 }]],
        ['README.md', [{ start: 1, end: 1 }]],
      ]),
    }
    writeArtifacts(taskDir, validCase(), variedResult())
    const issues = coverageIssues(evaluateCaseOutcomeGate(root, REL, task, options))
    assert.ok(issues.some((item) => item.code === 'coverage_missing_file' && item.message.includes('src/missing.go')))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('not_applicable 零分母时，缺席可执行文件仍硬拒', () => {
  const { root, taskDir } = makeRoot()
  try {
    const caseContent = validCase()
    const result = validResult()
      .replaceAll('`generated`', '`not_applicable`')
      .replace('`19/20 (95%)`', '`N/A`')
      .replace('| `src/a.js` | `19/20` | `95%` | `10` | `coverage/lcov.info` |\n', '')
      .replace('### Exclusions', '- Reason: no executable changed lines\n\n### Exclusions')
    writeArtifacts(taskDir, caseContent, result)
    const task = makeTask()
    const issues = coverageIssues(evaluateCaseOutcomeGate(root, REL, task, {
      changedFiles: [],
      changedLines: new Map([['src/missing.go', [{ start: 1, end: 1 }]]]),
    }))
    assert.ok(issues.some((item) => item.code === 'coverage_missing_file' && item.message.includes('src/missing.go')))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('below_threshold 豁免：指纹匹配通过，指纹失效拒绝，缺逐文件原因拒绝', () => {
  const { root, taskDir } = makeRoot()
  try {
    const task = makeTask()
    const options = coverageOptions(10)
    const below = '### Below Threshold\n\n- `src/a.js`: uncovered line 10 is a defensive branch'
    writeLcovReport(root, taskDir, 10, 9)
    const result = variedResult({ status: 'below_threshold', overall: '9/10 (90%)', row: '| `src/a.js` | `9/10` | `90%` | `10` | `coverage/lcov.info` |', below })
    writeArtifacts(taskDir, validCase(), result)
    const waiver = { reason: 'reviewed by main session', fingerprint: TEST_FP }
    assert.deepEqual(coverageIssues(evaluateCaseOutcomeGate(root, REL, task, { ...options, coverageWaiver: waiver })), [])

    const stale = coverageIssues(evaluateCaseOutcomeGate(root, REL, task, {
      ...options,
      coverageWaiver: { ...waiver, fingerprint: 'stale' },
    }))
    assert.ok(stale.some((item) => item.code === 'coverage_waiver'))

    writeArtifacts(taskDir, validCase(), variedResult({ status: 'below_threshold', overall: '9/10 (90%)', row: '| `src/a.js` | `9/10` | `90%` | `10` | `coverage/lcov.info` |' }))
    assert.ok(
      coverageIssues(evaluateCaseOutcomeGate(root, REL, task, { ...options, coverageWaiver: waiver }))
        .some((item) => item.code === 'coverage_below_reasons'),
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('复算不一致：RESULT 自报数字与报告交集不符时拒绝', () => {
  const { root, taskDir } = makeRoot()
  try {
    const task = makeTask()
    writeLcovReport(root, taskDir, 20, 19)
    writeArtifacts(taskDir, validCase(), variedResult({ overall: '20/20 (100%)', row: '| `src/a.js` | `20/20` | `100%` | `-` | `coverage/lcov.info` |' }))
    const issues = coverageIssues(evaluateCaseOutcomeGate(root, REL, task, coverageOptions()))
    assert.ok(issues.some((item) => item.code === 'coverage_recompute'))

    // 文件集合不一致：Changed Files 行路径不在复算文件集内 → coverage_files（数字一致也不放行）。
    writeArtifacts(
      taskDir,
      validCase(),
      variedResult({ row: '| `src/other.js` | `19/20` | `95%` | `20` | `coverage/lcov.info` |' }),
    )
    assert.ok(
      coverageIssues(evaluateCaseOutcomeGate(root, REL, task, coverageOptions())).some((item) => item.code === 'coverage_files'),
    )

    // Raw reports 同时列出交集产物（changed-lines.json / diff-coverage.json）时仍按原生报告机械复算：
    // 产物不得把格式推成 unsupported 而静默关闭复算。
    writeFileSync(join(taskDir, 'coverage/changed-lines.json'), '{}\n')
    writeFileSync(join(taskDir, 'coverage/diff-coverage.json'), '{}\n')
    writeArtifacts(
      taskDir,
      validCase(),
      variedResult({ overall: '20/20 (100%)', row: '| `src/a.js` | `20/20` | `100%` | `-` | `coverage/lcov.info` |' }).replace(
        '  - `coverage/lcov.info`\n',
        '  - `coverage/lcov.info`\n  - `coverage/changed-lines.json`\n  - `coverage/diff-coverage.json`\n',
      ),
    )
    assert.ok(
      coverageIssues(evaluateCaseOutcomeGate(root, REL, task, coverageOptions())).some((item) => item.code === 'coverage_recompute'),
      '交集产物列入 Raw reports 时机械复算仍须生效',
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('unsupported 格式跳过机械复算，但阈值仍校验 RESULT 自报 Overall', () => {
  const { root, taskDir } = makeRoot()
  try {
    const task = makeTask()
    writeFileSync(join(taskDir, 'coverage/lcov.info'), 'checker reported 8/10\n')
    writeArtifacts(taskDir, validCase(), variedResult({ overall: '8/10 (80%)', row: '| `src/a.js` | `8/10` | `80%` | `-` | `coverage/lcov.info` |' }))
    const options = {
      changedFiles: ['src/a.js', 'docs/guide.md'],
      changedLines: new Map([['src/a.js', [{ start: 1, end: 10 }]]]),
    }
    const issues = coverageIssues(evaluateCaseOutcomeGate(root, REL, task, options))
    assert.ok(issues.some((item) => item.code === 'coverage_threshold'))
    assert.equal(issues.some((item) => item.code === 'coverage_recompute'), false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

/** check 豁免夹具：真实 git 三点 diff + 轻量任务 + below_threshold RESULT。 */
function makeCheckWaiverFixture() {
  const root = mkdtempSync(join(tmpdir(), 'workloom-check-waiver-'))
  const commit = () => {
    execFileSync('git', ['add', '-A'], { cwd: root })
    execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-q', '-m', 'change'], { cwd: root })
  }
  execFileSync('git', ['init', '-q'], { cwd: root })
  writeFileSync(join(root, 'seed.txt'), 'seed\n')
  commit()
  execFileSync('git', ['branch', 'base'], { cwd: root })
  mkdirSync(join(root, 'src'), { recursive: true })
  writeFileSync(join(root, 'src/a.js'), Array.from({ length: 10 }, (_, index) => `line ${index + 1}`).join('\n') + '\n')
  commit()
  const branch = execFileSync('git', ['branch', '--show-current'], { cwd: root, encoding: 'utf8' }).trim()

  const taskDir = join(root, '.workloom', REL)
  mkdirSync(join(taskDir, 'coverage'), { recursive: true })
  mkdirSync(join(taskDir, 'case-evidence'), { recursive: true })
  writeFileSync(join(taskDir, 'case-evidence/c1.txt'), 'ok\n')
  writeFileSync(join(taskDir, 'prd.md'), PRD)
  writeLcovReport(root, taskDir, 10, 9)
  const caseContent = validCase()
  writeFileSync(join(taskDir, CASE_FILES.document), caseContent)
  const result = variedResult({
    status: 'below_threshold',
    overall: '9/10 (90%)',
    row: '| `src/a.js` | `9/10` | `90%` | `10` | `coverage/lcov.info` |',
    below: '### Below Threshold\n\n- `src/a.js`: uncovered line 10 is a defensive branch',
  })
  writeFileSync(join(taskDir, CASE_FILES.result), result)
  const task = {
    ...makeTask(),
    id: 'demo',
    name: 'demo',
    title: 'Demo',
    description: '',
    status: 'in_progress',
    priority: 'P2',
    mode: 'light',
    creator: 'test',
    assignee: 'test',
    package: null,
    base_branch: 'base',
    branch,
    createdAt: '2026-01-01T00:00:00.000Z',
    completedAt: null,
    parent: null,
    scope: '',
    commit: '',
    pr_url: '',
    relatedFiles: [],
    notes: '',
    meta: {},
    check: null,
  }
  writeFileSync(join(taskDir, 'task.json'), JSON.stringify(task))
  return { root, taskDir }
}

test('check 带 coverageWaiver 首次通过并记录原因/时间/来源；复查继承既有豁免', () => {
  const { root } = makeCheckWaiverFixture()
  try {
    const [err, task] = checkTask(root, {
      taskRelPath: REL,
      summary: 'reviewed below-threshold coverage',
      coverageWaiver: { reason: 'reviewed by main session' },
    })
    assert.equal(err, null, err?.message)
    assert.equal(task.check.coverageWaiver.reason, 'reviewed by main session')
    assert.equal(task.check.coverageWaiver.fingerprint, TEST_FP)
    assert.equal(task.check.coverageWaiver.source, 'main')
    assert.match(task.check.coverageWaiver.at, /^\d{4}-\d{2}-\d{2}T/)

    const [recheckErr, rechecked] = checkTask(root, { taskRelPath: REL, summary: 'recheck after review' })
    assert.equal(recheckErr, null, recheckErr?.message)
    assert.deepEqual(rechecked.check.coverageWaiver, task.check.coverageWaiver)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('force 不能绕过增量阈值门禁（core CASE failure）', () => {
  const { root } = makeCheckWaiverFixture()
  try {
    const [err] = checkTask(root, {
      taskRelPath: REL,
      summary: 'forced below-threshold check',
      force: true,
      reason: 'audit reason',
    })
    assert.ok(err)
    assert.match(err.message, /core CASE failures cannot be bypassed with force/)
    assert.match(err.message, /below_threshold requires a waiver/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('check 覆盖率豁免：reason 空与 RESULT 指纹缺失都拒绝', () => {
  const { root, taskDir } = makeCheckWaiverFixture()
  try {
    const [emptyErr] = checkTask(root, {
      taskRelPath: REL,
      summary: 'reviewed',
      coverageWaiver: { reason: '   ' },
    })
    assert.ok(emptyErr)
    assert.match(emptyErr.message, /coverageWaiver requires a non-empty reason/)

    const result = readFileSync(join(taskDir, CASE_FILES.result), 'utf8')
    writeFileSync(join(taskDir, CASE_FILES.result), result.replace(`; codeFingerprint=${TEST_FP}`, ''))
    const [fpErr] = checkTask(root, {
      taskRelPath: REL,
      summary: 'reviewed',
      coverageWaiver: { reason: 'reviewed by main session' },
    })
    assert.ok(fpErr)
    assert.match(fpErr.message, /codeBaseline must contain codeFingerprint/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('IMPLEMENTING 首次 check：below_threshold 须带有效豁免才迁移通过并持久化', () => {
  const { root, taskDir } = makeCheckWaiverFixture()
  try {
    const taskPath = join(taskDir, 'task.json')
    const record = JSON.parse(readFileSync(taskPath, 'utf8'))
    record.mode = 'standard'
    record.stage = 'implementing'
    record.case = { ...record.case, required: true, designSession: 'child-design', phase: 'approved' }
    writeFileSync(taskPath, JSON.stringify(record))
    writeFileSync(join(taskDir, 'check.jsonl'), '{"file": "AGENTS.md", "reason": "spec"}\n')

    const [missingErr] = checkTask(root, { taskRelPath: REL, summary: 'first check' })
    assert.ok(missingErr)
    assert.match(missingErr.message, /coverage_waiver|below_threshold requires a waiver/)

    const [err, migrated] = checkTask(root, {
      taskRelPath: REL,
      summary: 'first check with review',
      coverageWaiver: { reason: 'reviewed by main session' },
    })
    assert.equal(err, null, err?.message)
    assert.equal(migrated.stage, 'checking')
    const stored = JSON.parse(readFileSync(taskPath, 'utf8'))
    assert.equal(stored.stage, 'checking')
    assert.equal(stored.check.coverageWaiver.fingerprint, TEST_FP)
    assert.equal(stored.check.coverageWaiver.reason, 'reviewed by main session')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('RESULT 排除表与规则化 CASE 排除一致时通过且不计入覆盖范围', () => {
  const { root, taskDir } = makeRoot()
  try {
    const caseContent = validCase().replace(
      '- Exclusions:\n  - docs/guide.md: documentation',
      '- Exclusions:\n  - `docs/**`: generated docs',
    )
    const resultContent = validResult(caseContent).replace(
      '| `docs/guide.md` | `documentation` |',
      '| `docs/**` | `generated docs` |',
    )
    writeArtifacts(taskDir, caseContent, resultContent)
    const task = makeTask()
    const issues = evaluateCaseOutcomeGate(root, REL, task, coverageOptions())
    assert.deepEqual(issues, [])
    // RESULT 排除表与 CASE 规则不一致仍拒绝
    const stale = validResult(caseContent)
    writeFileSync(join(taskDir, CASE_FILES.result), stale)
    assert.ok(
      evaluateCaseOutcomeGate(root, REL, task, coverageOptions())
        .some((item) => item.code === 'coverage_exclusions'),
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
