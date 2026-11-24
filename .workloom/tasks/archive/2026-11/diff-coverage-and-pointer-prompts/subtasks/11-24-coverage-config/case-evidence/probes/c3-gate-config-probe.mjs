#!/usr/bin/env node
/**
 * C3 探针：门禁配置消费——自定义阈值边界（80.0 拒 / 80.1 过、缺省 90）、coverage_config、
 * 非内置未配置语言 unsupported 回退（阈值硬 + not_applicable 反规避）、formatHints 单语言广播
 * 与多语言纯推断对照。夹具镜像 case.test.ts 的 validCase/validResult/makeTask 形态。
 */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const WT = '/data00/home/wangyubo.1219/workbench/code-src/github/workloom/.workloom/.runtime/worktrees/11-24-coverage-config'
const { evaluateCaseOutcomeGate } = await import(pathToFileURL(join(WT, 'packages/core/dist/task/case-gates.js')).href)
const { createCaseRecord } = await import(pathToFileURL(join(WT, 'packages/core/dist/task/case-structure.js')).href)

const REL = 'tasks/demo'
const FP = 'b'.repeat(64)

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

const CASE_DOC = `---
version: 1
task: ${REL}
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

function buildResult({ status = 'generated', overall = '19/20 (95%)', rows = '', reason = '' } = {}) {
  return `---
version: 1
task: ${REL}
codeBaseline: main@abc; codeFingerprint=${FP}
checkSession: child-design
status: passed
startedAt: '2026-01-01T00:00:00.000Z'
completedAt: '2026-01-01T00:01:00.000Z'
---

# CASE Result: Demo

## Summary

- Static review: \`2/2\`
- Runtime cases: \`2/2; blocked: 0\`
- Coverage: \`${status}\`
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

- Status: \`${status}\`
- Tool: \`node:test\`
- Command: \`node --test\`
- Overall lines: \`${overall}\`
- Raw reports:
  - \`coverage/lcov.info\`
${reason}
### Changed Files

| File | Covered/Total | Line coverage | Uncovered lines | Details |
| --- | --- | --- | --- | --- |
${rows}
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

function writeLcovReport(root, taskDir, total, covered, file = 'src/a.ts') {
  const das = Array.from({ length: total }, (_, index) => `DA:${index + 1},${index < covered ? 1 : 0}`)
  writeFileSync(join(taskDir, 'coverage/lcov.info'), [`SF:${join(root, file)}`, ...das, 'end_of_record', ''].join('\n'))
}

const lines = []
let failures = 0
function record(name, pass, detail) {
  lines.push(`[${name}] ${pass ? 'PASS' : 'FAIL'} ${detail}`)
  if (!pass) failures++
}
const coverageCodes = (issues) => issues.filter((item) => item.code.startsWith('coverage_')).map((item) => item.code)

const root = mkdtempSync(join(tmpdir(), 'c3-gate-root-'))
const home = mkdtempSync(join(tmpdir(), 'c3-gate-home-'))
const previousHome = process.env.HOME
process.env.HOME = home
const taskDir = join(root, '.workloom', REL)
try {
  for (const dir of [join(taskDir, 'case-evidence'), join(taskDir, 'coverage'), join(root, 'src')]) {
    mkdirSync(dir, { recursive: true })
  }
  writeFileSync(join(taskDir, 'prd.md'), PRD)
  writeFileSync(join(taskDir, 'case.md'), CASE_DOC)
  writeFileSync(join(taskDir, 'case-evidence/c1.txt'), 'ok\n')
  writeFileSync(join(root, 'src/a.ts'), 'export const a = 1\n')
  writeFileSync(join(root, 'src/A.java'), 'class A {}\n')
  writeFileSync(join(root, 'src/B.ts'), 'export const b = 1\n')
  writeFileSync(join(root, 'src/Main.elm'), 'module Main exposing (main)\n')
  const task = (() => {
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
  })()
  const writeConfig = (doc) => writeFileSync(join(root, '.workloom/config.json'), JSON.stringify(doc, null, 2))
  const writeResult = (opts) => writeFileSync(join(taskDir, 'case-result.md'), buildResult(opts))
  const run = (changedLines, changedFiles) =>
    coverageCodes(evaluateCaseOutcomeGate(root, REL, task, { changedLines, changedFiles }))

  // A：threshold 80，自报 80.0% → 拒（且机械复算一致，无 coverage_recompute）。
  writeConfig({ coverage: { threshold: 80 } })
  writeLcovReport(root, taskDir, 1000, 800)
  writeResult({ overall: '800/1000 (80.0%)', rows: '| `src/a.ts` | `800/1000` | `80.0%` | `801-1000` | `coverage/lcov.info` |\n' })
  let codes = run(new Map([['src/a.ts', [{ start: 1, end: 1000 }]]]), ['src/a.ts'])
  record('A-80-reject', codes.includes('coverage_threshold') && !codes.includes('coverage_recompute'), `codes=${JSON.stringify(codes)}`)

  // B：80.1% → 过。
  writeLcovReport(root, taskDir, 1000, 801)
  writeResult({ overall: '801/1000 (80.1%)', rows: '| `src/a.ts` | `801/1000` | `80.1%` | `802-1000` | `coverage/lcov.info` |\n' })
  codes = run(new Map([['src/a.ts', [{ start: 1, end: 1000 }]]]), ['src/a.ts'])
  record('B-801-pass', codes.length === 0, `codes=${JSON.stringify(codes)}`)

  // C：缺省 90——90.0% 拒、90.1% 过。
  writeConfig({ executor: { max_concurrent: 1 } })
  writeLcovReport(root, taskDir, 1000, 900)
  writeResult({ overall: '900/1000 (90.0%)', rows: '| `src/a.ts` | `900/1000` | `90.0%` | `901-1000` | `coverage/lcov.info` |\n' })
  codes = run(new Map([['src/a.ts', [{ start: 1, end: 1000 }]]]), ['src/a.ts'])
  const c1 = codes.includes('coverage_threshold')
  writeLcovReport(root, taskDir, 1000, 901)
  writeResult({ overall: '901/1000 (90.1%)', rows: '| `src/a.ts` | `901/1000` | `90.1%` | `902-1000` | `coverage/lcov.info` |\n' })
  codes = run(new Map([['src/a.ts', [{ start: 1, end: 1000 }]]]), ['src/a.ts'])
  record('C-default-90', c1 && codes.length === 0, `90.0%=${c1} 90.1% codes=${JSON.stringify(codes)}`)

  // D：config 非法 → 恰 coverage_config（函数正常返回，无裸异常）。
  writeConfig({ coverage: { threshold: -1 } })
  writeLcovReport(root, taskDir, 1000, 951)
  writeResult({ overall: '951/1000 (95.1%)', rows: '| `src/a.ts` | `951/1000` | `95.1%` | `952-1000` | `coverage/lcov.info` |\n' })
  codes = run(new Map([['src/a.ts', [{ start: 1, end: 1000 }]]]), ['src/a.ts'])
  record('D-coverage-config', JSON.stringify(codes) === '["coverage_config"]', `codes=${JSON.stringify(codes)}`)

  // E：非内置未配置语言 → unsupported 回退，阈值硬作用自报数；not_applicable 反规避。
  writeConfig({ coverage: { threshold: 80 } })
  writeFileSync(join(taskDir, 'coverage/lcov.info'), 'plain text without any known format\n')
  const elmLines = new Map([['src/Main.elm', [{ start: 1, end: 100 }]]])
  writeResult({ overall: '80/100 (80.0%)', rows: '| `src/Main.elm` | `80/100` | `80.0%` | `-` | `coverage/lcov.info` |\n' })
  codes = run(elmLines, ['src/Main.elm'])
  const e1 = codes.includes('coverage_threshold')
  writeResult({ overall: '81/100 (81.0%)', rows: '| `src/Main.elm` | `81/100` | `81.0%` | `-` | `coverage/lcov.info` |\n' })
  codes = run(elmLines, ['src/Main.elm'])
  const e2 = codes.length === 0
  writeResult({
    status: 'not_applicable',
    overall: 'N/A',
    rows: '| `src/Main.elm` | `-` | `-` | `-` | `coverage/lcov.info` |\n',
    reason: '- Reason: elm coverage tool reports a proprietary format; recompute unsupported\n',
  })
  codes = run(elmLines, ['src/Main.elm'])
  record('E-elm-fallback', e1 && e2 && codes.includes('coverage_not_applicable'),
    `80%=拒:${e1} 81%=过:${e2} not_applicable codes=${JSON.stringify(codes)}`)

  // F：formatHints 单语言广播——java + cobertura-xml 提示使空 cobertura 走机械复算。
  writeConfig({ coverage: { languages: { java: { format: 'cobertura-xml' } } } })
  writeFileSync(join(taskDir, 'coverage/lcov.info'), '<coverage line-rate="0"></coverage>\n')
  writeResult({ overall: '0/0 (0.0%)', rows: '' })
  codes = run(new Map([['src/A.java', [{ start: 1, end: 5 }]]]), ['src/A.java'])
  record('F-hint-broadcast', codes.includes('coverage_missing_file'), `codes=${JSON.stringify(codes)}`)

  // G：多语言纯推断——同报告无提示 → unsupported → 跳过缺席检测，自报达标放行。
  writeResult({
    overall: '10/10 (100.0%)',
    rows: '| `src/A.java` | `5/5` | `100%` | `-` | `coverage/lcov.info` |\n| `src/B.ts` | `5/5` | `100%` | `-` | `coverage/lcov.info` |\n',
  })
  codes = run(new Map([['src/A.java', [{ start: 1, end: 5 }]], ['src/B.ts', [{ start: 1, end: 5 }]]]), ['src/A.java', 'src/B.ts'])
  record('G-multi-pure-inference', !codes.includes('coverage_missing_file') && codes.length === 0, `codes=${JSON.stringify(codes)}`)
} finally {
  process.env.HOME = previousHome
  rmSync(root, { recursive: true, force: true })
  rmSync(home, { recursive: true, force: true })
}

console.log(lines.join('\n'))
console.log(`c3-gate-config-probe: ${failures === 0 ? 'ALL PASS' : `${failures} FAILURES`}`)
process.exitCode = failures === 0 ? 0 : 1
