import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  CASE_FILES,
  CASE_PURPOSES,
  createCaseRecord,
  evaluateCaseExecutionGate,
  evaluateCaseOutcomeGate,
  inspectCaseStructure,
} from '../dist/domain/case.js'
import { evaluateStartGate, inspectPlanStructure } from '../dist/domain/task-gates.js'
import { archiveTask, checkTask, computeTaskStage, readTask } from '../dist/domain/task-store.js'
import { executeTaskCase } from '../dist/service/case-service.js'

const REL = 'tasks/demo'
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
codeBaseline: main@abc
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
- Overall lines: \`8/10 (80%)\`
- Raw reports:
  - \`coverage/lcov.info\`

### Changed Files

| File | Covered/Total | Line coverage | Uncovered lines | Details |
| --- | --- | --- | --- | --- |
| \`src/a.js\` | \`8/10\` | \`80%\` | \`12-13\` | \`coverage/lcov.info\` |

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
  writeFileSync(join(taskDir, 'coverage/lcov.info'), 'TN:\n')
  writeFileSync(join(taskDir, 'prd.md'), PRD)
  return { root, taskDir }
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
    dispatches: [{ kind: 'check', childId: 'child-design', purpose: 'case-design' }],
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
  const plan = `# Plan\n\n## Steps\n\n#### 步骤 1.1 test\n\n- Covers: AC1, AC2\n- Target: src/a.js\n- Edit: exact\n- Verify: node --test\n`
  assert.deepEqual(inspectPlanStructure(plan, PRD), [])
  assert.equal(inspectPlanStructure(null, PRD)[0].code, 'plan_missing')
  assert.ok(inspectPlanStructure(plan.replace('AC2', ''), PRD).some((item) => item.code === 'plan_ac_missing'))
})

test('start 门要求完整实施任务 PLAN，父任务豁免', () => {
  const { root, taskDir } = makeRoot()
  try {
    const prd = `${PRD}\n## Alignment Decisions\n\n<!-- workloom:open-nodes=none -->\n`
    writeFileSync(join(taskDir, 'prd.md'), prd)
    writeFileSync(join(taskDir, 'implement.jsonl'), '{"file":"src/a.js"}\n')
    writeFileSync(join(taskDir, 'check.jsonl'), '{"file":"src/a.js"}\n')
    const task = {
      status: 'planning',
      mode: 'full',
      children: [],
      alignment: { passedAt: '2026-01-01T00:00:00.000Z', summary: 'prd confirmed' },
    }
    assert.ok(evaluateStartGate(root, REL, task).includes('plan.md is missing'))
    assert.ok(!evaluateStartGate(root, REL, { ...task, children: ['tasks/child'] }).includes('plan.md is missing'))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('CASE 执行前置只要求 case.md 与 designSession，purpose stage 保持', () => {
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
    assert.equal(computeTaskStage('implement', 'check', CASE_PURPOSES.DESIGN), 'implement')
    assert.equal(computeTaskStage('implement', 'check', CASE_PURPOSES.EXECUTION), 'check')
    assert.equal(computeTaskStage('implement', 'check'), 'check')
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
    const options = { changedFiles: ['src/a.js', 'docs/guide.md'] }
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
    const options = { changedFiles: ['src/a.js', 'docs/guide.md'] }
    // 会话链校验保留：checkSession 必须等于 designSession 或经 fallbackOf 可达
    assert.ok(evaluateCaseOutcomeGate(root, REL, task, options).some((item) => item.code === 'result_session'))
    task.dispatches.push({ kind: 'check', childId: 'child-exec', fallbackOf: 'child-design', purpose: 'execution' })
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
      .replace('`8/10 (80%)`', '`N/A`')
      .replaceAll('`coverage/lcov.info`', '`none`')
    resultContent = resultContent.replace('| `src/a.js` | `8/10` | `80%` | `12-13` | `none` |\n', '')
    writeArtifacts(taskDir, caseContent, resultContent)
    const task = makeTask()
    const issues = evaluateCaseOutcomeGate(root, REL, task, { changedFiles: ['docs/guide.md'] })
    assert.deepEqual(issues, [])
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
    assert.match(err.message, /CASE archive gate failed/)
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
    const [, saved] = readTask(root, REL)
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
    const issues = evaluateCaseOutcomeGate(root, REL, task, { changedFiles: ['src/a.js', 'docs/guide.md'] })
    assert.deepEqual(issues, [])
    // RESULT 排除表与 CASE 规则不一致仍拒绝
    const stale = validResult(caseContent)
    writeFileSync(join(taskDir, CASE_FILES.result), stale)
    assert.ok(
      evaluateCaseOutcomeGate(root, REL, task, { changedFiles: ['src/a.js', 'docs/guide.md'] })
        .some((item) => item.code === 'coverage_exclusions'),
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
