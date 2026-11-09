// Coverage 聚合：解析两包 lcov，dist 记录映射回 src，同名源文件取逐行最大 hits，
// 输出 Coverage Scope 八模块的 covered/total 与未覆盖行区间，并汇总 Overall lines。
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const TASK = '/data00/home/wangyubo.1219/workbench/code-src/github/workloom/.workloom/tasks/11-08-rotate-on-busy'
const CORE = join(TASK, 'coverage', 'core.lcov.info')
const DSH = join(TASK, 'coverage', 'dsh-workloom.lcov.info')

const SCOPE = [
  'packages/core/src/workspace/config-subagent.ts',
  'packages/core/src/injection/surface.ts',
  'packages/dsh-workloom/src/dispatch/dispatch-binding.ts',
  'packages/dsh-workloom/src/dispatch/executor-capacity.ts',
  'packages/dsh-workloom/src/dispatch/executor-continuation.ts',
  'packages/dsh-workloom/src/dispatch/executor-rotation.ts',
  'packages/dsh-workloom/src/dispatch/executor-settle.ts',
  'packages/dsh-workloom/src/dispatch/executor.ts',
]

/** 解析单个 lcov 文件，返回 规范化路径 -> Map<line, hits>。 */
function parseLcov(file, packagePrefix) {
  const text = readFileSync(file, 'utf8')
  const result = new Map()
  let current = null
  for (const line of text.split('\n')) {
    if (line.startsWith('SF:')) {
      let path = line.slice(3)
      // dist 记录映射回 src，避免同一模块重复计数。
      if (path.startsWith('dist/')) path = `src/${path.slice(5)}`
      current = `${packagePrefix}/${path}`
      if (!result.has(current)) result.set(current, new Map())
      continue
    }
    if (line.startsWith('DA:')) {
      const [lineNo, hits] = line.slice(3).split(',').map(Number)
      if (current === null || !Number.isFinite(lineNo)) continue
      const target = result.get(current)
      const prev = target.get(lineNo) ?? 0
      target.set(lineNo, Math.max(prev, Number.isFinite(hits) ? hits : 0))
      continue
    }
    if (line === 'end_of_record') current = null
  }
  return result
}

/** 把未覆盖行号压成区间文本（如 12-14,20）。 */
function toRanges(lines) {
  if (lines.length === 0) return '-'
  const ranges = []
  let start = lines[0]
  let prev = lines[0]
  for (const value of lines.slice(1)) {
    if (value === prev + 1) {
      prev = value
      continue
    }
    ranges.push(start === prev ? String(start) : `${start}-${prev}`)
    start = value
    prev = value
  }
  ranges.push(start === prev ? String(start) : `${start}-${prev}`)
  return ranges.join(',')
}

const merged = new Map()
for (const [path, lines] of parseLcov(CORE, 'packages/core')) {
  merged.set(path, lines)
}
for (const [path, lines] of parseLcov(DSH, 'packages/dsh-workloom')) {
  const existing = merged.get(path)
  if (existing === undefined) {
    merged.set(path, lines)
    continue
  }
  for (const [lineNo, hits] of lines) {
    existing.set(lineNo, Math.max(existing.get(lineNo) ?? 0, hits))
  }
}

const files = []
let overallCovered = 0
let overallTotal = 0
for (const path of SCOPE) {
  const lines = merged.get(path)
  if (lines === undefined) {
    files.push({ path, covered: 0, total: 0, percent: '0.0', uncovered: 'missing', missing: true })
    continue
  }
  const all = [...lines.keys()].sort((a, b) => a - b)
  const uncovered = all.filter((lineNo) => lines.get(lineNo) === 0)
  const covered = all.length - uncovered.length
  overallCovered += covered
  overallTotal += all.length
  files.push({
    path,
    covered,
    total: all.length,
    percent: all.length === 0 ? '0.0' : ((covered / all.length) * 100).toFixed(1),
    uncovered: toRanges(uncovered),
  })
}

const overallPercent = overallTotal === 0 ? '0.0' : ((overallCovered / overallTotal) * 100).toFixed(1)
console.log(JSON.stringify({ overall: { covered: overallCovered, total: overallTotal, percent: overallPercent }, files }, null, 2))
