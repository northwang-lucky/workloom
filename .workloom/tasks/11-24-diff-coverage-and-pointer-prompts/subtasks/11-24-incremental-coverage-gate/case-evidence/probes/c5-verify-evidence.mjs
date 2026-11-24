/**
 * C5 核对探针：(1) diff-coverage.json 的 files 集合 == 变更集中非排除的可执行文件；
 * (2) 单文件手工复算——按 changed-lines.json 区间展开 lcov DA 行统计 covered/total，与脚本值比对（逐文件）。
 * 用法：node c5-verify-evidence.mjs <WT> <TASK>
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const [WT, TASK] = process.argv.slice(2)
if (WT === undefined || TASK === undefined) throw new Error('usage: node c5-verify-evidence.mjs <WT> <TASK>')
const { isExcluded } = await import(pathToFileURL(join(WT, 'packages/core/dist/task/case-structure.js')).href)
const { isExecutableFile } = await import(pathToFileURL(join(WT, 'packages/core/dist/task/coverage-compute.js')).href)

/** 与 CASE Exclusions 逐项相同，另加 .workloom/ 与 coverage/（CLI 自身证据运行的排除集）。 */
const EXCLUSIONS = [
  'packages/core/dist/',
  'packages/dsh-workloom/dist/',
  'packages/core/test/',
  'packages/dsh-workloom/test/',
  'packages/core/resources/scripts/task-diff-coverage.test.mjs',
  'packages/core/resources/templates/case.md',
  'packages/core/resources/templates/case-result.md',
  'packages/core/resources/workflow/workflow.md',
  'coverage/',
  '.workloom/',
]
const exclusions = new Map(EXCLUSIONS.map((pattern) => [pattern, 'probe']))
const changedLines = JSON.parse(readFileSync(join(TASK, 'coverage/changed-lines.json'), 'utf8'))
const diff = JSON.parse(readFileSync(join(TASK, 'coverage/diff-coverage.json'), 'utf8'))

// (1) 变更集（git status --porcelain，与旧门禁 gitChangedFilesSync 同源）→ 非排除可执行文件。
const status = execFileSync('git', ['status', '--porcelain'], { cwd: WT, encoding: 'utf8' })
const changedFiles = [...new Set(status.split('\n').filter(Boolean).map((line) => line.slice(3).trim()))].sort()
const expected = changedFiles.filter((file) => !isExcluded(exclusions, file) && isExecutableFile(file))
const actual = diff.files.map((file) => file.file).sort()
console.log('expected (non-excluded executable changed files):')
for (const file of expected) console.log(`  ${file}`)
console.log('actual (diff-coverage.json files):')
for (const file of actual) console.log(`  ${file}`)
const setOk = JSON.stringify(expected) === JSON.stringify(actual)
console.log(`${setOk ? 'PASS' : 'FAIL'} files 集合等于非排除可执行变更文件（${expected.length} 个）`)
console.log(`${diff.missingExecutableFiles.length === 0 ? 'PASS' : 'FAIL'} missingExecutableFiles 为空`)
console.log(`${diff.format === 'lcov' ? 'PASS' : 'FAIL'} format 为 lcov（${diff.format}）`)
const meets = diff.overall.covered * 100 > diff.overall.total * 90
console.log(`${meets ? 'PASS' : 'FAIL'} overall ${diff.overall.covered}/${diff.overall.total} (${((diff.overall.covered / diff.overall.total) * 100).toFixed(1)}%) 严格大于 90%`)

// (2) 逐文件手工复算：lcov DA 行 → 行覆盖；变更行区间展开 → 交集。
const lcov = [...readFileSync(join(TASK, 'coverage/lcov-core.info'), 'utf8').split('\n'), ...readFileSync(join(TASK, 'coverage/lcov-dsh.info'), 'utf8').split('\n')]
const coveredLines = new Map()
let current = null
for (const line of lcov) {
  if (line.startsWith('SF:')) {
    current = line.slice(3)
    if (!coveredLines.has(current)) coveredLines.set(current, new Map())
  } else if (line.startsWith('DA:') && current !== null) {
    const [lineNo, hits] = line.slice(3).split(',')
    const map = coveredLines.get(current)
    map.set(Number(lineNo), Math.max(map.get(Number(lineNo)) ?? 0, Number(hits)))
  }
}
console.log('--- per-file manual recompute (changed lines ∩ DA lines) ---')
let mismatch = 0
for (const file of diff.files) {
  const report = coveredLines.get(file.file)
  const ranges = changedLines[file.file]
  const uncovered = []
  let covered = 0
  let total = 0
  for (const range of ranges) {
    for (let lineNo = range.start; lineNo <= range.end; lineNo++) {
      if (report === undefined || !report.has(lineNo)) continue
      total++
      if ((report.get(lineNo) ?? 0) > 0) covered++
      else uncovered.push(lineNo)
    }
  }
  const ok = covered === file.covered && total === file.total && JSON.stringify(uncovered) === JSON.stringify(file.uncoveredRanges.flatMap((range) => Array.from({ length: range.end - range.start + 1 }, (_, index) => range.start + index)))
  if (!ok) mismatch++
  console.log(`${ok ? 'PASS' : 'FAIL'} ${file.file} manual ${covered}/${total} vs script ${file.covered}/${file.total}; uncovered ${uncovered.join(',') || '-'}`)
}
console.log(`--- summary: ${mismatch === 0 && setOk ? 'ALL PASS' : 'MISMATCH'} ---`)
process.exit(mismatch === 0 && setOk && meets && diff.missingExecutableFiles.length === 0 ? 0 : 1)
