/**
 * C3 探针：not_applicable 零分母原因与排除项反规避，六个场景函数级调用 dist 的
 * evaluateCaseOutcomeGate。夹具为临时项目，结束后删除。
 * 用法：node c3-not-applicable-probe.mjs <WT>
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const [WT] = process.argv.slice(2)
if (WT === undefined) throw new Error('usage: node c3-not-applicable-probe.mjs <WT>')
const { evaluateCaseOutcomeGate } = await import(pathToFileURL(join(WT, 'packages/core/dist/task/case-gates.js')).href)

const REL = 'tasks/not-applicable-probe'
const FP = 'b'.repeat(64)
const REASON = 'documentation-only change, no executable lines'
const EXCLUSION_REASON = 'legacy adapter shim, tracked by follow-up task'
const results = []
function check(name, ok, detail) {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` — ${detail}`}`)
}

/** CASE 文档：exclusions 为空或含 src/a.ts 一条带原因的排除。 */
function caseDoc(withExclusion) {
  return `---
version: 1
task: ${REL}
---

# CASE: Not Applicable Probe

## References

- PRD: \`prd.md\`
- Implementation: \`plan.md\`
- Code target: \`main\`
- Source task: \`none\`

## Scope

- Requirements: \`R1\`
- Acceptance criteria: \`AC1\`
- Out of scope:
  - \`none\`

## Static Review

### SR1 code

- Covers: \`AC1\`
- Target: \`src/a.ts#whole-file\`
- Checks:
  1. behavior
- Expected: correct

### SR2 docs

- Covers: \`AC1\`
- Target: \`docs/readme.md#whole-file\`
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
  - \`case-evidence/c1.txt\`
- Cleanup: \`none\`

## Coverage

- Tool: \`node:test coverage\`
- Instrumentation: \`node --experimental-test-coverage\`
- Aggregate command:
  \`\`\`bash
  node --test
  \`\`\`
- Scope: \`src/a.ts\`
- Exclusions:
${withExclusion ? `  - \`src/a.ts\`: ${EXCLUSION_REASON}` : '  - `none`'}
- Raw outputs:
  - \`coverage/lcov.info\`

## Traceability

| AC | Static review | Runtime cases |
| --- | --- | --- |
| AC1 | SR1、SR2 | C1 |
`
}

/** RESULT 文档：status、overall、row、reason、exclusionRow 可变。 */
function resultDoc({ status, overall, row = '', reason = '', exclusionRow = '' }) {
  return `---
version: 1
task: ${REL}
codeBaseline: main@abc; codeFingerprint=${FP}
checkSession: child-design
status: passed
startedAt: '2026-01-01T00:00:00.000Z'
completedAt: '2026-01-01T00:01:00.000Z'
---

# CASE Result: Not Applicable Probe

## Summary

- Static review: \`2/2\`
- Runtime cases: \`1/1; blocked: 0\`
- Coverage: \`${status}\`
- Standard verification: \`passed\`

## Static Review Results

### SR1 code

- Status: \`passed\`
- Evidence: \`src/a.ts inspected\`
- Findings: \`none\`

### SR2 docs

- Status: \`passed\`
- Evidence: \`docs/readme.md inspected\`
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

## Coverage

- Status: \`${status}\`
- Tool: \`node:test\`
- Command: \`node --test\`
- Overall lines: \`${overall}\`${reason === '' ? '' : `\n${reason}`}
- Raw reports:
  - \`coverage/lcov.info\`

### Changed Files

| File | Covered/Total | Line coverage | Uncovered lines | Details |
| --- | --- | --- | --- | --- |
${row}
### Exclusions

| Path | Reason |
| --- | --- |
${exclusionRow}
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

const root = mkdtempSync(join(tmpdir(), 'c3-na-'))
try {
  const taskDir = join(root, '.workloom', REL)
  mkdirSync(join(root, 'src'), { recursive: true })
  mkdirSync(join(root, 'docs'), { recursive: true })
  mkdirSync(join(taskDir, 'case-evidence'), { recursive: true })
  mkdirSync(join(taskDir, 'coverage'), { recursive: true })
  writeFileSync(join(root, 'src/a.ts'), Array.from({ length: 10 }, (_, index) => `export const a${index + 1} = ${index + 1}\n`).join(''))
  writeFileSync(join(root, 'docs/readme.md'), 'a\nb\nc\n')
  writeFileSync(join(taskDir, 'case-evidence/c1.txt'), 'ok\n')
  writeFileSync(join(taskDir, 'prd.md'), '# PRD\n\n## Requirements\n\n- R1: code\n\n## Acceptance Criteria\n\n- AC1: verify code\n\n## Notes\n\n- none\n')

  const task = {
    title: 'Not Applicable Probe',
    status: 'in_progress',
    mode: 'full',
    case: { required: true, designSession: 'child-design' },
    children: [],
    dispatches: [{ kind: 'checker', childId: 'child-design', purpose: 'case-design' }],
    worktree_path: '',
    overrides: [],
    hooks: { after_create: [], after_start: [], after_finish: [], after_archive: [] },
  }
  const file = join(root, 'src/a.ts')
  const writeLcov = (covered) =>
    writeFileSync(
      join(taskDir, 'coverage/lcov.info'),
      `TN:\nSF:${file}\n${Array.from({ length: 10 }, (_, index) => `DA:${index + 1},${index < covered ? 1 : 0}`).join('\n')}\nend_of_record\n`,
    )
  const evaluate = ({ withExclusion, changedFiles, changedLines, ...spec }) => {
    writeFileSync(join(taskDir, 'case.md'), caseDoc(withExclusion))
    writeFileSync(join(taskDir, 'case-result.md'), resultDoc(spec))
    const issues = evaluateCaseOutcomeGate(root, REL, task, { changedFiles, changedLines })
    const codes = issues.map((item) => item.code)
    console.log(`issues: ${codes.join(', ') || '<none>'}`)
    return codes
  }
  const docsOnly = { changedFiles: ['docs/readme.md'], changedLines: new Map([['docs/readme.md', [{ start: 1, end: 1 }]]]) }
  const withCode = { changedFiles: ['docs/readme.md', 'src/a.ts'], changedLines: new Map([['docs/readme.md', [{ start: 1, end: 1 }]], ['src/a.ts', [{ start: 1, end: 10 }]]]) }
  const notApplicable = { status: 'not_applicable', overall: 'N/A', reason: `- Reason: ${REASON}` }
  const exclusionRow = `| \`src/a.ts\` | \`${EXCLUSION_REASON}\` |`

  console.log('--- 场景 A：纯文档变更 + Reason ---')
  writeLcov(10)
  const scenarioA = evaluate({ withExclusion: false, ...docsOnly, ...notApplicable })
  check('A 纯文档 + Reason → 问题列表为空（Exclusions 为空也通过）', scenarioA.length === 0, scenarioA.join(','))

  console.log('--- 场景 B：缺 - Reason: ---')
  const scenarioB = evaluate({ withExclusion: false, ...docsOnly, status: 'not_applicable', overall: 'N/A' })
  check('B 缺原因 → coverage_na_reason', scenarioB.includes('coverage_na_reason'), scenarioB.join(','))

  console.log('--- 场景 C：有可测变更行却声明 not_applicable ---')
  const scenarioC = evaluate({ withExclusion: false, ...withCode, ...notApplicable })
  check('C → coverage_not_applicable', scenarioC.includes('coverage_not_applicable'), scenarioC.join(','))

  console.log('--- 场景 D：全部可执行变更文件被带原因排除 ---')
  writeLcov(5)
  const scenarioD = evaluate({ withExclusion: true, ...withCode, ...notApplicable, exclusionRow })
  check('D 排除带原因 + Reason → 问题列表为空', scenarioD.length === 0, scenarioD.join(','))

  console.log('--- 场景 E：RESULT Exclusions 表缺该行 ---')
  const scenarioE = evaluate({ withExclusion: true, ...withCode, ...notApplicable, exclusionRow: '' })
  check('E → coverage_exclusions', scenarioE.includes('coverage_exclusions'), scenarioE.join(','))

  console.log('--- 场景 F：50% 自报 100% 且无排除 ---')
  const scenarioF = evaluate({
    withExclusion: false,
    ...withCode,
    status: 'generated',
    overall: '10/10 (100.0%)',
    row: '| `src/a.ts` | `10/10` | `100%` | `-` | `coverage/lcov.info` |',
  })
  check('F → coverage_recompute 与 coverage_threshold 同时出现', scenarioF.includes('coverage_recompute') && scenarioF.includes('coverage_threshold'), scenarioF.join(','))
} finally {
  rmSync(root, { recursive: true, force: true })
}

const failed = results.filter((item) => !item.ok)
console.log(`--- summary: ${results.length - failed.length}/${results.length} checks passed; temp project removed ---`)
process.exit(failed.length === 0 ? 0 : 1)
