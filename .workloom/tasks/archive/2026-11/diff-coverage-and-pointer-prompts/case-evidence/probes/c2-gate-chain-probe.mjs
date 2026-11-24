// C2 探针：S1+S4 增量门禁链路（真 git 三点口径 + 配置阈值 + 四格式复算 +
// 缺席硬拒 + 豁免指纹 + unsupported 回退 + checkTask 持久化）。
// 场景与期望见 case.md C2；全部在 mktemp 隔离仓库与隔离 HOME 下运行，finally 自清理。
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const MAIN = '/data00/home/wangyubo.1219/workbench/code-src/github/workloom'
const FIXTURE_OUT = join(MAIN, '.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/case-evidence/fixtures/c2')

// HOME 隔离先于一切 gate 调用（本机 ~/.workloom/config.json 存在）。
const homeTmp = mkdtempSync(join(tmpdir(), 'c2-home-'))
process.env.HOME = homeTmp

const { evaluateCaseOutcomeGate } = await import(MAIN + '/packages/core/dist/task/case-gates.js')
const { listCaseChangedLines } = await import(MAIN + '/packages/core/dist/task/case-scope.js')
const { checkTask } = await import(MAIN + '/packages/core/dist/task/task-ops.js')

const hexA = 'a'.repeat(64)
const hexB = 'b'.repeat(64)
const repo = mkdtempSync(join(tmpdir(), 'c2-repo-'))
// 夹具目录先建（writeFileSync 不自动建父目录）。
mkdirSync(join(repo, 'src'), { recursive: true })
mkdirSync(join(repo, 'docs'), { recursive: true })
const taskRel = 'tasks/probe-t1'
const taskDir = join(repo, '.workloom', taskRel)
const scenarioLog = []

function git(args) {
  execFileSync('git', args, { cwd: repo, stdio: ['ignore', 'pipe', 'pipe'] })
}

function writeLines(path, count, offset = 0) {
  const base = path.includes('Mapper') || path.endsWith('.java') || path.endsWith('.kt') || path.endsWith('.go')
    ? '// line'
    : '// line'
  const content = Array.from({ length: count }, (_, i) => `${base} ${i + 1 + offset}\n`).join('')
  writeFileSync(join(repo, path), content)
}

// ---------------- 夹具仓库 ----------------
git(['init', '-b', 'main'])
git(['config', 'user.email', 'probe@example.com'])
git(['config', 'user.name', 'probe'])
writeFileSync(join(repo, 'go.mod'), 'module example.com/probe\n')
writeLines('src/a.ts', 10)
writeLines('src/b.go', 6)
writeLines('src/C.java', 5)
writeLines('docs/readme.md', 2)
git(['add', '-A'])
git(['commit', '-m', 'base'])
const baseSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim()

git(['checkout', '-b', 'workloom/c2-probe'])
// 改写 a.ts 全部 10 行（内容与基线不同），b.go 第 5 行，C.java 第 4 行，新增 d.kt，改 readme 第 1 行。
writeFileSync(join(repo, 'src/a.ts'), Array.from({ length: 10 }, (_, i) => `// changed ${i + 1}\n`).join(''))
writeLines('src/b.go', 6)
writeFileSync(join(repo, 'src/b.go'), Array.from({ length: 6 }, (_, i) => (i === 4 ? '// changed 5\n' : `// line ${i + 1}\n`)).join(''))
writeFileSync(join(repo, 'src/C.java'), Array.from({ length: 5 }, (_, i) => (i === 3 ? '// changed 4\n' : `// line ${i + 1}\n`)).join(''))
writeLines('src/d.kt', 3)
writeFileSync(join(repo, 'docs/readme.md'), '// changed 1\n// line 2\n')
git(['add', '-A'])
git(['commit', '-m', 'changes'])
const headSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim()

// ---------------- 任务夹具 ----------------
mkdirSync(join(taskDir, 'coverage'), { recursive: true })
mkdirSync(join(taskDir, 'case-evidence'), { recursive: true })
writeFileSync(join(taskDir, 'case-evidence/probe.log'), 'probe evidence placeholder\n')
writeFileSync(join(taskDir, 'prd.md'), [
  '# probe prd', '', '## Requirements', '', '- R1 probe', '',
  '## Acceptance Criteria', '', '- AC1: probe gate chain', '',
].join('\n'))

const caseDoc = [
  '---', 'version: 1', `task: ${taskRel}`, '---', '',
  '# CASE: probe', '',
  '## References', '', '- PRD: `prd.md`', '- Implementation: `plan.md`', '- Code target: `probe worktree`', '- Source task: `none`', '',
  '## Scope', '', '- Requirements: `R1`', '- Acceptance criteria: `AC1`', '- Out of scope:', '  - none', '',
  '## Static Review', '',
  '### SR1 probe', '', '- Covers: `AC1`', '- Target: `src/a.ts#whole-file`',
  '- Checks:', '  1. `structure check`', '- Expected: `decidable property`', '',
  '## Runtime Cases', '',
  '### C1 probe', '', '- Covers: `AC1`', '- Preconditions:', '  1. `build done`', '- Steps:',
  '  1. `action`', '- Expected:', '  1. `observable`', '- Evidence:', '  - `case-evidence/probe.log`', '- Cleanup: `none`', '',
  '## Coverage', '',
  '- Tool: `probe tool`', '- Instrumentation: `probe instrumentation`',
  '- Aggregate command:', '  ```bash', '  probe', '  ```',
  '- Scope: `src/**`', '- Exclusions:', '  - none',
  '- Raw outputs:', '  - `coverage/go.out`', '  - `coverage/lcov.info`', '  - `coverage/jacoco.xml`', '  - `coverage/cobertura.xml`', '',
  '## Traceability', '', '| AC | Static review | Runtime cases |', '| --- | --- | --- |', '| AC1 | SR1 | C1 |', '',
].join('\n')
writeFileSync(join(taskDir, 'case.md'), caseDoc)

function taskRecord(overrides = {}) {
  return {
    id: 'probe-t1', name: 'probe-t1', title: 'probe', description: '',
    status: 'in_progress', priority: 'P2', mode: 'light', package: 'repo',
    branch: 'workloom/c2-probe', base_branch: 'main', worktree_path: '',
    createdAt: '2026-11-24T12:00:00.000Z', completedAt: null, parent: null, children: [],
    scope: '', commit: '', pr_url: '', relatedFiles: [], notes: '', meta: {},
    check: null, overrides: [],
    dispatches: [
      { kind: 'checker', title: 'design', at: '2026-11-24T12:00:00.000Z', status: 'completed', childId: 'probe-design-1', purpose: 'case-design', model: '', effort: '', modelSource: '', toolsAllow: [] },
      { kind: 'checker', title: 'execution', at: '2026-11-24T12:05:00.000Z', status: 'running', childId: 'probe-design-1', purpose: 'execution', model: '', effort: '', modelSource: '', toolsAllow: [] },
    ],
    case: { required: true, designSession: 'probe-design-1', phase: 'done' },
    ...overrides,
  }
}
writeFileSync(join(taskDir, 'task.json'), JSON.stringify(taskRecord(), null, 2))

// ---------------- 报告夹具 ----------------
function goReport() {
  return 'mode: set\nexample.com/probe/src/b.go:5.5,5.10 1 1\n'
}
function lcovReport(aTsCovered) {
  const lines = ['SF:src/a.ts']
  for (let i = 1; i <= 10; i += 1) lines.push(`DA:${i},${i <= aTsCovered ? 1 : 0}`)
  return `${lines.join('\n')}\nend_of_record\n`
}
function jacocoReport() {
  return '<report name="probe"><package name="src"><sourcefile name="C.java"><line nr="4" mi="0" ci="5" mb="0" cb="0"/></sourcefile></package></report>\n'
}
function coberturaReport() {
  const lines = [1, 2, 3].map((n) => `<line number="${n}" hits="1"/>`).join('')
  return `<coverage><packages><package name="src"><classes><class filename="src/d.kt"><lines>${lines}</lines></class></classes></package></packages></coverage>\n`
}
function plainReport() {
  return 'plain report body without any known format markers\n'
}

function writeReports(reportMap) {
  for (const name of ['go.out', 'lcov.info', 'jacoco.xml', 'cobertura.xml', 'plain.txt']) {
    rmSync(join(taskDir, 'coverage', name), { force: true })
  }
  for (const [name, content] of Object.entries(reportMap)) {
    writeFileSync(join(taskDir, 'coverage', name), content)
  }
  return Object.keys(reportMap)
}

// 基线四报告（供 fixtures 目录留档）。
mkdirSync(FIXTURE_OUT, { recursive: true })
const baselineReports = {
  'go.out': goReport(), 'lcov.info': lcovReport(10), 'jacoco.xml': jacocoReport(), 'cobertura.xml': coberturaReport(),
}
for (const [name, content] of Object.entries(baselineReports)) writeFileSync(join(FIXTURE_OUT, name), content)

// ---------------- RESULT 构造 ----------------
function buildResult({ status = 'generated', overall, files, reports, below = [], fingerprint = hexA }) {
  const reportLines = reports.map((name) => `  - \`coverage/${name}\``).join('\n')
  const detailRef = reports.length > 0 ? `\`coverage/${reports[0]}\`` : '-'
  const fileRows = files.map(([p, c, t]) => `| \`${p}\` | \`${c}/${t}\` | ${(t === 0 ? 0 : (100 * c) / t).toFixed(1)}% | - | ${detailRef} |`)
  const belowSection = below.length === 0 ? '' : ['### Below Threshold', '', ...below.map(([p, r]) => `- \`${p}\`: ${r}`), ''].join('\n')
  return [
    '---', 'version: 1', `task: ${taskRel}`,
    `codeBaseline: main@${headSha}; codeFingerprint=${fingerprint}`,
    'checkSession: probe-design-1', 'status: passed',
    'startedAt: 2026-11-24T12:00:00.000Z', 'completedAt: 2026-11-24T12:30:00.000Z', '---', '',
    '# CASE Result: probe', '',
    '## Summary', '',
    '- Static review: `1/1`', '- Runtime cases: `1/1; blocked: 0`',
    `- Coverage: \`${status}\``, '- Standard verification: `passed`', '',
    '## Static Review Results', '', '### SR1 probe', '', '- Status: `passed`', '- Findings: `none`', '',
    '## Runtime Results', '', '### C1 probe', '', '- Status: `passed`', '- Findings: `none`', '',
    '## Coverage', '',
    `- Status: \`${status}\``, '- Tool: `probe tool`', '- Command: `probe`',
    `- Overall lines: \`${overall}\``,
    '- Raw reports:', reportLines, '',
    '### Changed Files', '',
    '| File | Covered/Total | Line coverage | Uncovered lines | Details |',
    '| --- | --- | --- | --- | --- |',
    ...fileRows, '',
    '### Exclusions', '', '| Path | Reason |', '| --- | --- |', '',
    belowSection,
    '## Standard Verification', '',
    '| Command | Exit code | Evidence |', '| --- | --- | --- |', '| `pnpm -r build` | 0 | `case-evidence/probe.log` |', '',
    '## Resolved Findings', '', '- none', '',
    '## Open issues', '', '- none', '',
  ].filter((s) => s !== undefined).join('\n')
}

function runGate(name, expectedCodes, resultDoc, options = {}) {
  writeFileSync(join(taskDir, 'case-result.md'), resultDoc)
  const issues = evaluateCaseOutcomeGate(repo, taskRel, taskRecord(), options)
  const actual = [...new Set(issues.map((i) => i.code))].sort()
  const expected = [...expectedCodes].sort()
  const pass = actual.length === expected.length && actual.every((c, i) => c === expected[i])
  scenarioLog.push(`${pass ? 'PASS' : 'FAIL'} | ${name} | expected=[${expected.join(',')}] | actual=[${actual.join(',')}]`)
  if (!pass) {
    for (const i of issues) scenarioLog.push(`      issue: ${i.code}: ${i.message}`)
  }
  return pass
}

let allPass = true

// ---------------- 步骤 4：三点口径核对 ----------------
const [linesErr, changed] = listCaseChangedLines(repo, taskRecord())
const got = Object.fromEntries([...(changed ?? new Map())].map(([f, rs]) => [f, rs.map((r) => `${r.start}-${r.end}`)]))
const expectLines = { 'src/a.ts': ['1-10'], 'src/b.go': ['5-5'], 'src/C.java': ['4-4'], 'src/d.kt': ['1-3'], 'docs/readme.md': ['1-1'] }
const sortedGot = Object.fromEntries(Object.keys(got).sort().map((k) => [k, got[k]]))
const sortedExpect = Object.fromEntries(Object.keys(expectLines).sort().map((k) => [k, expectLines[k]]))
const linesOk = linesErr === null && JSON.stringify(sortedGot) === JSON.stringify(sortedExpect)
scenarioLog.push(`${linesOk ? 'PASS' : 'FAIL'} | three-dot changed lines | expected=${JSON.stringify(expectLines)} | actual=${JSON.stringify(got)}${linesErr !== null ? ` err=${linesErr.message}` : ''}`)
allPass = allPass && linesOk

// ---------------- 步骤 5：基线场景（夹具合法性） ----------------
writeReports(baselineReports)
const baseFiles = [['src/C.java', 1, 1], ['src/a.ts', 10, 10], ['src/b.go', 1, 1], ['src/d.kt', 3, 3]]
allPass = runGate('S5 baseline 15/15', [], buildResult({ overall: '15/15 (100.0%)', files: baseFiles, reports: Object.keys(baselineReports) })) && allPass

// ---------------- 步骤 6：默认阈值 ----------------
writeReports({ ...baselineReports, 'lcov.info': lcovReport(8) })
allPass = runGate('S6a default 90 reject 13/15', ['coverage_threshold'], buildResult({ overall: '13/15 (86.7%)', files: [['src/C.java', 1, 1], ['src/a.ts', 8, 10], ['src/b.go', 1, 1], ['src/d.kt', 3, 3]], reports: Object.keys(baselineReports) })) && allPass
writeReports({ ...baselineReports, 'lcov.info': lcovReport(9) })
allPass = runGate('S6b default 90 pass 14/15', [], buildResult({ overall: '14/15 (93.3%)', files: [['src/C.java', 1, 1], ['src/a.ts', 9, 10], ['src/b.go', 1, 1], ['src/d.kt', 3, 3]], reports: Object.keys(baselineReports) })) && allPass

// ---------------- 步骤 7：配置阈值 80 ----------------
writeFileSync(join(repo, '.workloom/config.json'), '{"coverage":{"threshold":80}}')
writeReports({ ...baselineReports, 'lcov.info': lcovReport(7) })
const cfgFiles = [['src/C.java', 1, 1], ['src/a.ts', 7, 10], ['src/b.go', 1, 1], ['src/d.kt', 3, 3]]
allPass = runGate('S7a threshold 80 exact-reject 12/15', ['coverage_threshold'], buildResult({ overall: '12/15 (80.0%)', files: cfgFiles, reports: Object.keys(baselineReports) })) && allPass
writeReports({ ...baselineReports, 'lcov.info': lcovReport(8) })
allPass = runGate('S7b threshold 80 pass 13/15', [], buildResult({ overall: '13/15 (86.7%)', files: [['src/C.java', 1, 1], ['src/a.ts', 8, 10], ['src/b.go', 1, 1], ['src/d.kt', 3, 3]], reports: Object.keys(baselineReports) })) && allPass
rmSync(join(repo, '.workloom/config.json'))
writeReports({ ...baselineReports, 'lcov.info': lcovReport(8) })
allPass = runGate('S7c config removed fallback 90', ['coverage_threshold'], buildResult({ overall: '13/15 (86.7%)', files: [['src/C.java', 1, 1], ['src/a.ts', 8, 10], ['src/b.go', 1, 1], ['src/d.kt', 3, 3]], reports: Object.keys(baselineReports) })) && allPass

// ---------------- 步骤 8：豁免指纹（config 80，12/15） ----------------
writeFileSync(join(repo, '.workloom/config.json'), '{"coverage":{"threshold":80}}')
writeReports({ ...baselineReports, 'lcov.info': lcovReport(7) })
const belowResult = (fingerprint, overall = '12/15 (80.0%)', aCovered = 7) =>
  buildResult({
    status: 'below_threshold', overall,
    files: [['src/C.java', 1, 1], ['src/a.ts', aCovered, 10], ['src/b.go', 1, 1], ['src/d.kt', 3, 3]],
    reports: Object.keys(baselineReports),
    below: [['src/a.ts', 'line 8 is a defensive branch unreachable in tests']],
    fingerprint,
  })
allPass = runGate('S8a waiver match', [], belowResult(hexA), { coverageWaiver: { reason: 'reviewed', fingerprint: hexA } }) && allPass
allPass = runGate('S8b waiver fingerprint mismatch', ['coverage_waiver'], belowResult(hexB), { coverageWaiver: { reason: 'reviewed', fingerprint: hexA } }) && allPass
allPass = runGate('S8c no waiver', ['coverage_waiver'], belowResult(hexA)) && allPass
writeReports({ ...baselineReports, 'lcov.info': lcovReport(9) })
allPass = runGate('S8d above threshold below_threshold invalid', ['coverage_status'], belowResult(hexA, '14/15 (93.3%)', 9)) && allPass
writeReports({ ...baselineReports, 'lcov.info': lcovReport(7) })

// ---------------- 步骤 9：checkTask 链路（豁免持久化/继承/force 拒绝） ----------------
// RESULT 回到 below_threshold + hexA；轻量任务真 checkTask 三段。
writeFileSync(join(taskDir, 'case-result.md'), belowResult(hexA))
writeFileSync(join(taskDir, 'check.jsonl'), `${JSON.stringify({ file: 'src/a.ts', reason: 'changed file under test' })}\n`)
const before = { reason: 'reviewed by main session' }
const [err1, view1] = checkTask(repo, { taskRelPath: taskRel, summary: 'probe ok', coverageWaiver: { ...before } })
let taskJson = JSON.parse(readFileSync(join(taskDir, 'task.json'), 'utf8'))
const w1 = taskJson.check?.coverageWaiver
const s9a = err1 === null && view1 !== null && w1?.reason === 'reviewed by main session' && w1?.fingerprint === hexA && w1?.source === 'main' && typeof w1?.at === 'string' && w1.at !== ''
scenarioLog.push(`${s9a ? 'PASS' : 'FAIL'} | S9a checkTask waiver persisted | err=${err1?.message ?? 'null'} | waiver=${JSON.stringify(w1)}`)
const firstWaiver = { ...w1 }
const [err2] = checkTask(repo, { taskRelPath: taskRel, summary: 'probe ok again' })
taskJson = JSON.parse(readFileSync(join(taskDir, 'task.json'), 'utf8'))
const w2 = taskJson.check?.coverageWaiver
const s9b = err2 === null && w2?.reason === firstWaiver.reason && w2?.fingerprint === firstWaiver.fingerprint && w2?.at === firstWaiver.at && w2?.source === firstWaiver.source
scenarioLog.push(`${s9b ? 'PASS' : 'FAIL'} | S9b recheck inherits waiver | err=${err2?.message ?? 'null'} | same=${s9b}`)
const bytesAfterInherit = readFileSync(join(taskDir, 'task.json'), 'utf8')
writeFileSync(join(taskDir, 'case-result.md'), belowResult(hexB))
const [err3] = checkTask(repo, { taskRelPath: taskRel, summary: 'recheck after flip' })
const [err4] = checkTask(repo, { taskRelPath: taskRel, summary: 'try force', force: true, reason: 'try' })
const unchangedAfterReject = readFileSync(join(taskDir, 'task.json'), 'utf8') === bytesAfterInherit
// 指纹重建：带新豁免调用按当前 RESULT 指纹（hexB）重建豁免而通过。
const [err5] = checkTask(repo, { taskRelPath: taskRel, summary: 'rebind waiver', coverageWaiver: { reason: 'rebound after review' } })
taskJson = JSON.parse(readFileSync(join(taskDir, 'task.json'), 'utf8'))
const w5 = taskJson.check?.coverageWaiver
const s9c = err3 !== null && err4 !== null &&
  String(err3.message).includes('cannot be bypassed with force') && String(err4.message).includes('cannot be bypassed with force') &&
  unchangedAfterReject && JSON.parse(bytesAfterInherit).overrides.length === 0
const s9d = err5 === null && w5?.fingerprint === hexB && w5?.reason === 'rebound after review'
scenarioLog.push(`${s9c ? 'PASS' : 'FAIL'} | S9c fingerprint flip + force rejected | err3=${err3?.message ?? 'null'} | err4=${err4?.message ?? 'null'} | task.json unchanged=${unchangedAfterReject}`)
scenarioLog.push(`${s9d ? 'PASS' : 'FAIL'} | S9d fresh waiver rebinds to current fingerprint | err5=${err5?.message ?? 'null'} | fingerprint=${String(w5?.fingerprint).slice(0, 8)}`)
allPass = allPass && s9a && s9b && s9c && s9d
writeFileSync(join(taskDir, 'case-result.md'), belowResult(hexA))

// ---------------- 步骤 10：缺席硬拒（e.rs 提交） ----------------
writeReports(baselineReports)
writeFileSync(join(repo, 'src/e.rs'), 'fn main() {}\n// line 2\n// line 3\n// line 4\n')
git(['add', 'src/e.rs'])
git(['commit', '-m', 'add e.rs'])
allPass = runGate('S10 missing executable file', ['coverage_missing_file'], buildResult({ overall: '15/15 (100.0%)', files: baseFiles, reports: Object.keys(baselineReports) })) && allPass

// ---------------- 步骤 11：unsupported 回退（e.rs 提交之后） ----------------
rmSync(join(repo, '.workloom/config.json'))
writeReports({ 'plain.txt': plainReport() })
const fallbackFiles = [['docs/readme.md', 0, 0], ['src/C.java', 0, 0], ['src/a.ts', 0, 0], ['src/b.go', 0, 0], ['src/d.kt', 0, 0], ['src/e.rs', 0, 0]]
allPass = runGate('S11a fallback self-report pass', [], buildResult({ overall: '14/15 (93.3%)', files: fallbackFiles, reports: ['plain.txt'] })) && allPass
allPass = runGate('S11b fallback threshold hard', ['coverage_threshold'], buildResult({ overall: '13/15 (86.7%)', files: fallbackFiles, reports: ['plain.txt'] })) && allPass

// ---------------- 汇总 ----------------
console.log(scenarioLog.join('\n'))
console.log(`C2 RESULT: ${allPass ? 'PASS' : 'FAIL'} (${scenarioLog.filter((l) => l.startsWith('PASS')).length}/${scenarioLog.length} scenarios)`)

rmSync(repo, { recursive: true, force: true })
rmSync(homeTmp, { recursive: true, force: true })
if (!allPass) process.exitCode = 1
