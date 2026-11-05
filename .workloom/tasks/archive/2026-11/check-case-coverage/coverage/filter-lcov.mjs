/**
 * 从 core 全量测试的机器 LCOV 中筛出本次 P1 修复涉及的可执行文件，
 * 输出仓库相对路径的 lcov.info、summary.txt 与 uncovered.txt。
 * 用法：node filter-lcov.mjs <coverage-dir>
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const [dir] = process.argv.slice(2)
if (dir === undefined) throw new Error('usage: node filter-lcov.mjs <coverage-dir>')

// 只保留本次变更的可执行文件；测试、d.ts 锚点与 dist 由 CASE Exclusions 说明。
const scope = new Map([
  ['src/domain/task-store.js', 'packages/core/src/domain/task-store.js'],
  ['src/service/case-service.ts', 'packages/core/src/service/case-service.ts'],
])

const files = new Map()
let current = null
for (const line of readFileSync(join(dir, 'lcov-core.info'), 'utf8').split('\n')) {
  if (line.startsWith('SF:')) {
    current = scope.get(line.slice(3).trim()) ?? null
    if (current !== null && !files.has(current)) files.set(current, new Map())
    continue
  }
  if (line.startsWith('DA:') && current !== null) {
    const [number, hits] = line.slice(3).split(',')
    const key = Number(number)
    const bucket = files.get(current)
    bucket.set(key, Math.max(Number(hits), bucket.get(key) ?? 0))
  }
}

const out = ['TN:']
const summary = []
const uncovered = []
let total = 0
let covered = 0
for (const path of [...files.keys()].sort()) {
  const lines = [...files.get(path).keys()].sort((a, b) => a - b)
  let hit = 0
  out.push(`SF:${path}`)
  const misses = []
  for (const line of lines) {
    const count = files.get(path).get(line)
    if (count > 0) hit += 1
    else misses.push(line)
    out.push(`DA:${line},${count}`)
  }
  out.push(`LF:${lines.length}`, `LH:${hit}`, 'end_of_record')
  total += lines.length
  covered += hit
  summary.push(`${path} ${hit}/${lines.length} ${((hit / lines.length) * 100).toFixed(1)}%`)
  uncovered.push(`${path} uncovered: ${misses.length === 0 ? 'none' : misses.join(',')}`)
}
summary.push(`TOTAL ${covered}/${total} (${((covered / total) * 100).toFixed(1)}%)`)
writeFileSync(join(dir, 'lcov.info'), `${out.join('\n')}\n`)
writeFileSync(join(dir, 'summary.txt'), `${summary.join('\n')}\n`)
writeFileSync(join(dir, 'uncovered.txt'), `${uncovered.join('\n')}\n`)
console.log(summary.at(-1))
