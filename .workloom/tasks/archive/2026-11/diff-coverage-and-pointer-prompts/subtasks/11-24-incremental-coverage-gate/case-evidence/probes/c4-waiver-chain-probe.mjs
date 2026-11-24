/**
 * C4 探针：真实 checkTask 调用（light 模式走凭据直写路径）核对豁免链路六个场景：
 * 首查带参写入 task.json、复查继承、指纹失效拒（含 force）、空原因拒、缺 Below Threshold 拒、缺指纹拒。
 * 用法：node c4-waiver-chain-probe.mjs <WT>
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const [WT] = process.argv.slice(2)
if (WT === undefined) throw new Error('usage: node c4-waiver-chain-probe.mjs <WT>')
const { checkTask } = await import(pathToFileURL(join(WT, 'packages/core/dist/task/task-ops.js')).href)

const REL = 'tasks/waiver-chain-probe'
const HEX_A = 'c'.repeat(64)
const HEX_B = 'd'.repeat(64)
const REASON = 'reviewed by main session: defensive branch'
const results = []
function check(name, ok, detail) {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` — ${detail}`}`)
}

const root = mkdtempSync(join(tmpdir(), 'c4-waiver-'))
try {
  // 临时 git 仓库：基线提交后改写 src/a.ts 全部 10 行，保持未提交（工作区口径）。
  let run = spawnSync('git', ['init', '-q'], { cwd: root, encoding: 'utf8' })
  if (run.status !== 0) throw new Error(run.stderr)
  spawnSync('git', ['config', 'user.email', 'probe@example.com'], { cwd: root })
  spawnSync('git', ['config', 'user.name', 'probe'], { cwd: root })
  mkdirSync(join(root, 'src'), { recursive: true })
  const lines = (value) => Array.from({ length: 10 }, (_, index) => `export const a${index + 1} = ${value}${index + 1}\n`).join('')
  writeFileSync(join(root, 'src/a.ts'), lines('x'))
  spawnSync('git', ['add', '-A'], { cwd: root })
  run = spawnSync('git', ['commit', '-q', '-m', 'base'], { cwd: root, encoding: 'utf8' })
  if (run.status !== 0) throw new Error(run.stderr)
  const base = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim()
  writeFileSync(join(root, 'src/a.ts'), lines('y'))

  const taskDir = join(root, '.workloom', REL)
  mkdirSync(join(taskDir, 'coverage'), { recursive: true })
  writeFileSync(join(taskDir, 'prd.md'), '# PRD\n\n## Requirements\n\n- R1: code\n\n## Acceptance Criteria\n\n- AC1: verify code\n\n## Notes\n\n- none\n')
  writeFileSync(
    join(taskDir, 'case.md'),
    `---
version: 1
task: ${REL}
---

# CASE: Waiver Chain Probe

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
  - \`coverage/lcov.info\`
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
`,
  )
  writeFileSync(
    join(taskDir, 'coverage/lcov.info'),
    `TN:\nSF:${join(root, 'src/a.ts')}\n${Array.from({ length: 10 }, (_, index) => `DA:${index + 1},${index === 9 ? 0 : 1}`).join('\n')}\nend_of_record\n`,
  )
  writeFileSync(
    join(taskDir, 'task.json'),
    JSON.stringify({
      title: 'Waiver Chain Probe',
      status: 'in_progress',
      mode: 'light',
      branch: '',
      base_branch: '',
      case: { required: true, designSession: 'design-1', phase: 'done' },
      children: [],
      dispatches: [
        { kind: 'checker', childId: 'design-1', purpose: 'case-design' },
        { kind: 'checker', childId: 'design-1', purpose: 'execution' },
      ],
      worktree_path: '',
      check: null,
      overrides: [],
      hooks: { after_create: [], after_start: [], after_finish: [], after_archive: [] },
    }),
  )
  const resultDoc = ({ fingerprint, below = true }) => `---
version: 1
task: ${REL}
codeBaseline: main@${base}${fingerprint === '' ? '' : `; codeFingerprint=${fingerprint}`}
checkSession: design-1
status: passed
startedAt: '2026-01-01T00:00:00.000Z'
completedAt: '2026-01-01T00:01:00.000Z'
---

# CASE Result: Waiver Chain Probe

## Summary

- Static review: \`1/1\`
- Runtime cases: \`1/1; blocked: 0\`
- Coverage: \`below_threshold\`
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
  - \`coverage/lcov.info\`
- Findings: \`none\`

## Coverage

- Status: \`below_threshold\`
- Tool: \`node:test\`
- Command: \`node --test\`
- Overall lines: \`9/10 (90.0%)\`
- Raw reports:
  - \`coverage/lcov.info\`

### Changed Files

| File | Covered/Total | Line coverage | Uncovered lines | Details |
| --- | --- | --- | --- | --- |
| \`src/a.ts\` | \`9/10\` | \`90%\` | \`10\` | \`coverage/lcov.info\` |
${below ? `
### Below Threshold

- \`src/a.ts\`: line 10 is a defensive branch unreachable in tests
` : ''}
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
  const writeResult = (spec) => writeFileSync(join(taskDir, 'case-result.md'), resultDoc(spec))
  const taskJson = () => readFileSync(join(taskDir, 'task.json'), 'utf8')
  const record = () => JSON.parse(taskJson())
  const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

  // 场景 A：首查带 coverageWaiver。
  writeResult({ fingerprint: HEX_A })
  const [errA, viewA] = checkTask(root, { taskRelPath: REL, summary: 'probe ok', coverageWaiver: { reason: REASON } })
  const recA = record()
  console.log(`scenario A: err=${errA?.message ?? 'null'} check=${JSON.stringify(recA.check)}`)
  check('A err 为 null', errA === null && viewA !== null, errA?.message ?? '')
  check('A check.summary 为 probe ok 且 passedAt 为 ISO-8601', recA.check?.summary === 'probe ok' && ISO.test(recA.check?.passedAt ?? ''), JSON.stringify(recA.check))
  const waiverA = recA.check?.coverageWaiver
  check('A coverageWaiver 四字段齐全（reason/fingerprint=hex-A/at ISO/source main）', waiverA?.reason === REASON && waiverA?.fingerprint === HEX_A && ISO.test(waiverA?.at ?? '') && waiverA?.source === 'main', JSON.stringify(waiverA))

  // 场景 B：复查不传豁免 → 继承。
  const [errB] = checkTask(root, { taskRelPath: REL, summary: 'recheck' })
  const waiverB = record().check?.coverageWaiver
  console.log(`scenario B: err=${errB?.message ?? 'null'} waiver=${JSON.stringify(waiverB)}`)
  check('B 复查通过且继承既有豁免（四字段完全相同）', errB === null && JSON.stringify(waiverB) === JSON.stringify(waiverA), JSON.stringify(waiverB))

  // 场景 C：指纹失效——既有豁免（绑定 hex-A）在 RESULT 指纹改为 hex-B 后不得沿用；
  // 只有主会话对新代码显式传入新的 coverageWaiver 才放行，且新记录绑定 hex-B。
  const beforeC = taskJson()
  writeResult({ fingerprint: HEX_B })
  const [errC1] = checkTask(root, { taskRelPath: REL, summary: 'stale' })
  check('C1 不传豁免沿用既有记录但指纹不匹配 → 错误含 cannot be bypassed with force 与 waiver', errC1 !== null && /cannot be bypassed with force/.test(errC1.message) && /waiver/.test(errC1.message), errC1?.message ?? 'null')
  const [errC2] = checkTask(root, { taskRelPath: REL, summary: 'stale', force: true, reason: 'try' })
  check('C2 force 同样拒绝', errC2 !== null && /cannot be bypassed with force/.test(errC2.message), errC2?.message ?? 'null')
  check('C 两次拒绝后 task.json 字节不变且 overrides 为 []', taskJson() === beforeC && JSON.stringify(record().overrides) === '[]', 'task.json changed')
  console.log(`scenario C: err1=${errC1?.message ?? 'null'}; err2=${errC2?.message ?? 'null'}`)
  const [errC3] = checkTask(root, { taskRelPath: REL, summary: 'fresh review', coverageWaiver: { reason: 'reviewed again after code change' } })
  const waiverC3 = record().check?.coverageWaiver
  check('C3 显式传入新豁免才放行，且新记录绑定当前指纹 hex-B', errC3 === null && waiverC3?.fingerprint === HEX_B && waiverC3?.reason === 'reviewed again after code change', `${errC3?.message ?? 'null'} ${JSON.stringify(waiverC3)}`)
  console.log(`scenario C3: err=${errC3?.message ?? 'null'} waiver=${JSON.stringify(waiverC3)}`)

  // 场景 D：空原因。
  writeResult({ fingerprint: HEX_A })
  const beforeD = taskJson()
  const [errD] = checkTask(root, { taskRelPath: REL, summary: 'blank', coverageWaiver: { reason: '   ' } })
  check('D 空原因 → 错误含 coverageWaiver 与 reason，task.json 字节不变', errD !== null && /coverageWaiver/.test(errD.message) && /reason/.test(errD.message) && taskJson() === beforeD, errD?.message ?? 'null')
  console.log(`scenario D: err=${errD?.message ?? 'null'}`)

  // 场景 E：缺 Below Threshold 子节。
  writeResult({ fingerprint: HEX_A, below: false })
  const [errE] = checkTask(root, { taskRelPath: REL, summary: 'no reasons', coverageWaiver: { reason: REASON } })
  // 门禁把 issue 的 message（非 code）拼进拒绝文案；coverage_below_reasons 码由单测
  // 「below_threshold 豁免：…缺逐文件原因拒绝」在 issue 层核对，探针核对文案。
  check('E 缺 Below Threshold → 错误文案为 coverage_below_reasons 的 message（Below Threshold requires per-file reason lines）', errE !== null && /Below Threshold requires per-file reason lines/.test(errE.message), errE?.message ?? 'null')
  console.log(`scenario E: err=${errE?.message ?? 'null'}`)

  // 场景 F：codeBaseline 缺指纹。
  writeResult({ fingerprint: '' })
  const beforeF = taskJson()
  const [errF] = checkTask(root, { taskRelPath: REL, summary: 'no fp', coverageWaiver: { reason: REASON } })
  check('F 缺指纹 → 错误含 task-fingerprint，task.json 字节不变', errF !== null && /task-fingerprint/.test(errF.message) && taskJson() === beforeF, errF?.message ?? 'null')
  console.log(`scenario F: err=${errF?.message ?? 'null'}`)
} finally {
  rmSync(root, { recursive: true, force: true })
}

const failed = results.filter((item) => !item.ok)
console.log(`--- summary: ${results.length - failed.length}/${results.length} checks passed; temp project removed ---`)
process.exit(failed.length === 0 ? 0 : 1)
