// C13 探针：解析两包 lcov，输出 9 个变更可执行文件的覆盖率表行。
import { readFileSync } from 'node:fs'

const [coreLcov, dshLcov] = process.argv.slice(2)
const FILE_MAP = new Map([
  [coreLcov, (sf) => `packages/core/${sf}`],
  [dshLcov, (sf) => `packages/dsh-workloom/${sf}`],
])
const expected = [
  'packages/core/src/injection/prompt-compose.ts',
  'packages/core/src/injection/protocol.js',
  'packages/core/src/injection/session-context.ts',
  'packages/core/src/injection/surface.ts',
  'packages/core/src/resources-manifest.ts',
  'packages/core/src/task/task-ops.ts',
  'packages/dsh-workloom/src/dispatch/executor-dispatch.ts',
  'packages/dsh-workloom/src/plugin.ts',
  'packages/dsh-workloom/src/tooling/tasks.ts',
]

function parse(file, mapSf) {
  const records = new Map()
  let current = null
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (line.startsWith('SF:')) {
      current = { path: mapSf(line.slice(3)), lh: 0, lf: 0, zero: [] }
      records.set(current.path, current)
      continue
    }
    if (current === null) continue
    if (line.startsWith('LH:')) current.lh = Number(line.slice(3))
    else if (line.startsWith('LF:')) current.lf = Number(line.slice(3))
    else if (line.startsWith('DA:')) {
      const [num, hits] = line.slice(3).split(',')
      if (Number(hits) === 0) current.zero.push(Number(num))
    }
  }
  return records
}

function ranges(lines) {
  if (lines.length === 0) return '-'
  const sorted = [...new Set(lines)].sort((a, b) => a - b)
  const out = []
  let start = sorted[0]
  let prev = sorted[0]
  for (const n of sorted.slice(1)) {
    if (n === prev + 1) { prev = n; continue }
    out.push(start === prev ? `${start}` : `${start}-${prev}`)
    start = n; prev = n
  }
  out.push(start === prev ? `${start}` : `${start}-${prev}`)
  return out.join(', ')
}

const all = new Map()
for (const [file, mapSf] of FILE_MAP) for (const [path, rec] of parse(file, mapSf)) all.set(path, { ...rec, file })
console.log('| File | Covered/Total | Line coverage | Uncovered lines | Details |')
console.log('| --- | --- | --- | --- | --- |')
let missing = 0
for (const path of expected) {
  const rec = all.get(path)
  if (rec === undefined) {
    missing += 1
    console.log(`MISSING ${path}`)
    continue
  }
  const pct = rec.lf === 0 ? '0.0%' : `${((rec.lh / rec.lf) * 100).toFixed(1)}%`
  const details = rec.file.endsWith('core.lcov.info') ? 'coverage/core.lcov.info' : 'coverage/dsh-workloom.lcov.info'
  console.log(`| \`${path}\` | ${rec.lh}/${rec.lf} | ${pct} | ${ranges(rec.zero)} | \`${details}\` |`)
}
console.log(`MISSING_COUNT=${missing}`)
