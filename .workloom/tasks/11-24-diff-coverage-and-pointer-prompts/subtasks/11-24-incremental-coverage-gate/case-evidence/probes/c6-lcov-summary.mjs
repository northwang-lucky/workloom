/**
 * C6 步骤 11：轨道一（旧格式）整文件汇总——解析两份 lcov，对非排除的可执行变更文件输出
 * 逐文件 LF/LH 与 hits=0 的 DA 行区间，写 coverage/whole-file-summary.md。
 * 用法：node c6-lcov-summary.mjs <WT> <TASK>
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const [WT, TASK] = process.argv.slice(2)
if (WT === undefined || TASK === undefined) throw new Error('usage: node c6-lcov-summary.mjs <WT> <TASK>')
const { isExcluded } = await import(pathToFileURL(join(WT, 'packages/core/dist/task/case-structure.js')).href)
const { isExecutableFile } = await import(pathToFileURL(join(WT, 'packages/core/dist/task/coverage-compute.js')).href)

const CASE_EXCLUSIONS = [
  'packages/core/dist/',
  'packages/dsh-workloom/dist/',
  'packages/core/test/',
  'packages/dsh-workloom/test/',
  'packages/core/resources/scripts/task-diff-coverage.test.mjs',
  'packages/core/resources/templates/case.md',
  'packages/core/resources/templates/case-result.md',
  'packages/core/resources/workflow/workflow.md',
  'coverage/',
]
const exclusions = new Map(CASE_EXCLUSIONS.map((pattern) => [pattern, 'summary']))

const status = execFileSync('git', ['status', '--porcelain'], { cwd: WT, encoding: 'utf8' })
const changedFiles = [...new Set(status.split('\n').filter(Boolean).map((line) => line.slice(3).trim()))].sort()
const scope = changedFiles.filter((file) => !file.startsWith('.workloom/') && !isExcluded(exclusions, file) && isExecutableFile(file))

/** 解析 lcov：SF → { lf, lh, lines: Map<lineNo, hits> }。 */
function parseLcov(path) {
  const files = new Map()
  let current = null
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (line.startsWith('SF:')) {
      current = { file: line.slice(3), lf: 0, lh: 0, lines: new Map() }
      files.set(current.file, current)
    } else if (current === null) continue
    else if (line.startsWith('LF:')) current.lf = Number(line.slice(3))
    else if (line.startsWith('LH:')) current.lh = Number(line.slice(3))
    else if (line.startsWith('DA:')) {
      const [lineNo, hits] = line.slice(3).split(',')
      current.lines.set(Number(lineNo), Number(hits))
    }
  }
  return files
}
const core = parseLcov(join(TASK, 'coverage/lcov-core.info'))
const dsh = parseLcov(join(TASK, 'coverage/lcov-dsh.info'))
/** 取文件所在报告：core 优先，其次 dsh；返回记录与来源文件名。 */
function source(file) {
  if (core.has(file)) return { record: core.get(file), report: 'coverage/lcov-core.info' }
  if (dsh.has(file)) return { record: dsh.get(file), report: 'coverage/lcov-dsh.info' }
  return null
}

/** 行号数组压缩为闭区间文案。 */
function ranges(numbers) {
  const sorted = [...numbers].sort((a, b) => a - b)
  const out = []
  for (const lineNo of sorted) {
    const last = out[out.length - 1]
    if (last && last.end + 1 === lineNo) last.end = lineNo
    else out.push({ start: lineNo, end: lineNo })
  }
  return out.map((range) => (range.start === range.end ? `${range.start}` : `${range.start}-${range.end}`)).join(', ')
}

const rows = []
let coveredTotal = 0
let totalTotal = 0
for (const file of scope) {
  const found = source(file)
  if (found === null) {
    rows.push({ file, covered: 0, total: 0, uncovered: 'no lcov record', report: '-' })
    continue
  }
  const report = found.record
  let covered = 0
  const uncovered = []
  for (const [lineNo, hits] of report.lines) {
    if (hits > 0) covered++
    else uncovered.push(lineNo)
  }
  coveredTotal += covered
  totalTotal += report.lines.size
  rows.push({ file, covered, total: report.lines.size, uncovered: ranges(uncovered) || '-', report: found.report })
}

const pct = (covered, total) => (total === 0 ? '0.0' : ((covered / total) * 100).toFixed(1))
const lines = [
  '# Whole-file line coverage (track one, legacy gate format)',
  '',
  `Source: coverage/lcov-core.info + coverage/lcov-dsh.info; scope = non-excluded changed executable files from \`git status --porcelain\` (${rows.length} files).`,
  '',
  '| File | Covered/Total | Line coverage | Uncovered lines | Details |',
  '| --- | --- | --- | --- | --- |',
  ...rows.map((row) => `| \`${row.file}\` | ${row.covered}/${row.total} | ${pct(row.covered, row.total)}% | ${row.uncovered} | \`${row.report}\` |`),
  '',
  `Overall lines: ${coveredTotal}/${totalTotal} (${pct(coveredTotal, totalTotal)}%)`,
  '',
  'Note: track one counts whole files (legacy gate format); track two (incremental, changed lines only) is coverage/diff-coverage.json.',
  '',
]
writeFileSync(join(TASK, 'coverage/whole-file-summary.md'), lines.join('\n'))
console.log(lines.join('\n'))
