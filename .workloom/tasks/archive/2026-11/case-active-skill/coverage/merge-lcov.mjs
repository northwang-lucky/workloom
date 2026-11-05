import { readFileSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'

const [dir, repo] = process.argv.slice(2)
const reports = [
  ['lcov-adapter-dsh.info', 'packages/adapter-dsh', 'packages/adapter-dsh/src/skills.ts'],
  ['lcov-assets-fingerprint.info', 'packages/assets', 'packages/assets/skills/workloom-case-active/scripts/task-fingerprint.mjs'],
]
const files = new Map()
for (const [name, base, scoped] of reports) {
  let current = null
  for (const line of readFileSync(join(dir, name), 'utf8').split('\n')) {
    if (line.startsWith('SF:')) {
      const source = line.slice(3).trim()
      const rel = relative(repo, isAbsolute(source) ? source : resolve(repo, base, source))
      current = rel === scoped ? scoped : null
      if (current !== null && !files.has(current)) files.set(current, new Map())
      continue
    }
    if (line.startsWith('DA:') && current !== null) {
      const [lineNo, hits] = line.slice(3).split(',')
      const bucket = files.get(current)
      const key = Number(lineNo)
      bucket.set(key, Math.max(Number(hits), bucket.get(key) ?? 0))
    }
  }
}
const paths = [...files.keys()].sort()
let total = 0
let covered = 0
const out = ['TN:']
const summary = []
for (const path of paths) {
  const bucket = files.get(path)
  const lines = [...bucket.keys()].sort((a, b) => a - b)
  let hit = 0
  out.push(`SF:${path}`)
  for (const line of lines) {
    const count = bucket.get(line)
    hit += count > 0 ? 1 : 0
    out.push(`DA:${line},${count}`)
  }
  out.push(`LF:${lines.length}`, `LH:${hit}`, 'end_of_record')
  total += lines.length
  covered += hit
  summary.push(`${path} ${hit}/${lines.length} ${((hit / lines.length) * 100).toFixed(1)}%`)
}
summary.push(`TOTAL ${covered}/${total} (${((covered / total) * 100).toFixed(1)}%)`)
writeFileSync(join(dir, 'lcov.info'), `${out.join('\n')}\n`)
writeFileSync(join(dir, 'summary.txt'), `${summary.join('\n')}\n`)
console.log(summary.at(-1))
