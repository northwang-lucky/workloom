/**
 * C2 探针：函数级调用 dist 的 evaluateCaseOutcomeGate（不写凭据），五个场景核对阈值、缺席硬拒、
 * 复算不一致与 unsupported 回退。夹具为临时项目，结束后删除。
 * 用法：node c2-gate-threshold-probe.mjs <WT>
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const [WT] = process.argv.slice(2)
if (WT === undefined) throw new Error('usage: node c2-gate-threshold-probe.mjs <WT>')
const { evaluateCaseOutcomeGate } = await import(pathToFileURL(join(WT, 'packages/core/dist/task/case-gates.js')).href)

const REL = 'tasks/threshold-probe'
const FP = 'a'.repeat(64)
const results = []
function check(name, ok, detail) {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` — ${detail}`}`)
}

const PRD = `# PRD\n\n## Requirements\n\n- R1: code\n\n## Acceptance Criteria\n\n- AC1: verify code\n\n## Notes\n\n- none\n`
const CASE_DOC = `---
version: 1
task: ${REL}
---

# CASE: Threshold Probe

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
  - \`none\`
- Raw outputs:
  - \`coverage/lcov.info\`

## Traceability

| AC | Static review | Runtime cases |
| --- | --- | --- |
| AC1 | SR1 | C1 |
`

/** 生成 RESULT：status/overall/row/reason 可变，其余字段固定且合法。 */
function resultDoc({ status = 'generated', overall, row, reason = '', below = '' }) {
  const notApplicable = status === 'not_applicable'
  return `---
version: 1
task: ${REL}
codeBaseline: main@abc; codeFingerprint=${FP}
checkSession: child-design
status: passed
startedAt: '2026-01-01T00:00:00.000Z'
completedAt: '2026-01-01T00:01:00.000Z'
---

# CASE Result: Threshold Probe

## Summary

- Static review: \`1/1\`
- Runtime cases: \`1/1; blocked: 0\`
- Coverage: \`${status}\`
- Standard verification: \`passed\`

## Static Review Results

### SR1 code

- Status: \`passed\`
- Evidence: \`src/a.ts inspected\`
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
- Overall lines: \`${overall}\`${notApplicable ? `\n${reason}` : ''}
- Raw reports:
  - \`coverage/lcov.info\`

### Changed Files

| File | Covered/Total | Line coverage | Uncovered lines | Details |
| --- | --- | --- | --- | --- |
${row}
${below}
### Exclusions

| Path | Reason |
| --- | --- |

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

const root = mkdtempSync(join(tmpdir(), 'c2-gate-'))
try {
  const taskDir = join(root, '.workloom', REL)
  mkdirSync(join(root, 'src'), { recursive: true })
  mkdirSync(join(taskDir, 'case-evidence'), { recursive: true })
  mkdirSync(join(taskDir, 'coverage'), { recursive: true })
  writeFileSync(join(root, 'src/a.ts'), Array.from({ length: 10 }, (_, index) => `export const a${index + 1} = ${index + 1}\n`).join(''))
  writeFileSync(join(taskDir, 'case-evidence/c1.txt'), 'ok\n')
  writeFileSync(join(taskDir, 'prd.md'), PRD)
  writeFileSync(join(taskDir, 'case.md'), CASE_DOC)

  const task = {
    title: 'Threshold Probe',
    status: 'in_progress',
    mode: 'full',
    case: { required: true, designSession: 'child-design' },
    children: [],
    dispatches: [{ kind: 'checker', childId: 'child-design', purpose: 'case-design' }],
    worktree_path: '',
    overrides: [],
    hooks: { after_create: [], after_start: [], after_finish: [], after_archive: [] },
  }
  const options = { changedFiles: ['src/a.ts'], changedLines: new Map([['src/a.ts', [{ start: 1, end: 10 }]]]) }
  const file = join(root, 'src/a.ts')
  const lcov = ({ hits }) => `TN:\nSF:${file}\n${Array.from({ length: 10 }, (_, index) => `DA:${index + 1},${hits(index + 1)}`).join('\n')}\nend_of_record\n`
  const writeLcov = (text) => writeFileSync(join(taskDir, 'coverage/lcov.info'), text)
  const writeResult = (spec) => writeFileSync(join(taskDir, 'case-result.md'), resultDoc(spec))
  const codes = (issues) => issues.map((item) => item.code)
  const rowA = '| `src/a.ts` | `9/10` | `90%` | `10` | `coverage/lcov.info` |'
  const rowB = '| `src/a.ts` | `10/10` | `100%` | `-` | `coverage/lcov.info` |'

  // 场景 A：9/10 恰好 90%，无豁免。
  writeLcov(lcov({ hits: (line) => (line === 10 ? 0 : 1) }))
  writeResult({ status: 'generated', overall: '9/10 (90.0%)', row: rowA })
  const scenarioA = codes(evaluateCaseOutcomeGate(root, REL, task, options))
  console.log(`scenario A: ${scenarioA.join(', ') || '<none>'}`)
  check('A 恰好 90% 无豁免 → coverage_threshold', scenarioA.includes('coverage_threshold'), scenarioA.join(','))
  check('A 无其他问题码', scenarioA.every((code) => code === 'coverage_threshold'), scenarioA.join(','))

  // 场景 B：10/10 全覆盖。
  writeLcov(lcov({ hits: () => 1 }))
  writeResult({ status: 'generated', overall: '10/10 (100.0%)', row: rowB })
  const scenarioB = codes(evaluateCaseOutcomeGate(root, REL, task, options))
  console.log(`scenario B: ${scenarioB.join(', ') || '<none>'}`)
  check('B 大于 90% → 问题列表为空', scenarioB.length === 0, scenarioB.join(','))

  // 场景 C：可执行变更文件缺席报告（lcov 仍可识别）。
  writeLcov('TN:\nSF:src/other.ts\nDA:1,1\nend_of_record\n')
  writeResult({ status: 'generated', overall: '9/10 (90.0%)', row: rowA })
  const scenarioC1 = codes(evaluateCaseOutcomeGate(root, REL, task, options))
  console.log(`scenario C1 (generated): ${scenarioC1.join(', ') || '<none>'}`)
  check('C1 缺席可执行文件 → coverage_missing_file', scenarioC1.includes('coverage_missing_file'), scenarioC1.join(','))
  writeResult({
    status: 'not_applicable',
    overall: 'N/A',
    row: '',
    reason: '- Reason: no executable changed lines',
  })
  const scenarioC2 = codes(evaluateCaseOutcomeGate(root, REL, task, options))
  console.log(`scenario C2 (not_applicable): ${scenarioC2.join(', ') || '<none>'}`)
  check('C2 not_applicable 仍 → coverage_missing_file（三态统一）', scenarioC2.includes('coverage_missing_file'), scenarioC2.join(','))
  check('C2 不报 coverage_not_applicable', !scenarioC2.includes('coverage_not_applicable'), scenarioC2.join(','))

  // 场景 D：自报 10/10，报告只有 9/10。
  writeLcov(lcov({ hits: (line) => (line === 10 ? 0 : 1) }))
  writeResult({ status: 'generated', overall: '10/10 (100.0%)', row: rowB })
  const scenarioD = codes(evaluateCaseOutcomeGate(root, REL, task, options))
  console.log(`scenario D: ${scenarioD.join(', ') || '<none>'}`)
  check('D 自报虚高 → coverage_recompute', scenarioD.includes('coverage_recompute'), scenarioD.join(','))

  // 场景 E：unsupported 报告。
  writeFileSync(join(taskDir, 'coverage/lcov.info'), 'plain text without any known format\n')
  writeResult({ status: 'generated', overall: '9/10 (90.0%)', row: rowA })
  const scenarioE1 = codes(evaluateCaseOutcomeGate(root, REL, task, options))
  console.log(`scenario E1: ${scenarioE1.join(', ') || '<none>'}`)
  check('E1 unsupported 自报 90% → coverage_threshold 且无 coverage_missing_file', scenarioE1.includes('coverage_threshold') && !scenarioE1.includes('coverage_missing_file'), scenarioE1.join(','))
  writeResult({ status: 'generated', overall: '10/10 (100.0%)', row: rowB })
  const scenarioE2 = codes(evaluateCaseOutcomeGate(root, REL, task, options))
  console.log(`scenario E2: ${scenarioE2.join(', ') || '<none>'}`)
  check('E2 unsupported 自报 100% 且 Changed Files 回退变更文件集 → 问题列表为空', scenarioE2.length === 0, scenarioE2.join(','))
} finally {
  rmSync(root, { recursive: true, force: true })
}

const failed = results.filter((item) => !item.ok)
console.log(`--- summary: ${results.length - failed.length}/${results.length} checks passed; temp project removed ---`)
process.exit(failed.length === 0 ? 0 : 1)
