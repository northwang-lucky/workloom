#!/usr/bin/env node
/**
 * C6 探针三（轨道一）：读两份 lcov，对 CASE Coverage Scope 的可执行文件集合输出
 * 整文件 LF/LH 与 hits=0 的 DA 行区间，写 coverage/whole-file-summary.md（供 RESULT 旧口径填写）。
 */
import { readFileSync, writeFileSync } from 'node:fs'

const TASK = '/data00/home/wangyubo.1219/workbench/code-src/github/workloom/.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-coverage-config'
const FILES = [
  'packages/core/src/workspace/config-defaults.ts',
  'packages/core/src/workspace/config-load.ts',
  'packages/core/src/task/coverage-compute.ts',
  'packages/core/src/task/case-gates.ts',
  'packages/core/resources/scripts/task-diff-coverage.mjs',
  'packages/core/resources/skills/workloom-packages-scan/scripts/scan-packages.mjs',
]

function summarize(lcovPath, file) {
  const lcov = readFileSync(lcovPath, 'utf8')
  const record = lcov.split('end_of_record').find((r) => r.includes(`SF:${file}\n`) || r.includes(`SF:${file}`))
  if (record === undefined) return null
  const lf = /^LF:(\d+)/m.exec(record)?.[1]
  const lh = /^LH:(\d+)/m.exec(record)?.[1]
  const zero = [...record.matchAll(/^DA:(\d+),0$/gm)].map((m) => Number(m[1]))
  return { lf: Number(lf ?? 0), lh: Number(lh ?? 0), zero }
}

function compress(numbers) {
  const ranges = []
  for (const n of numbers) {
    const last = ranges[ranges.length - 1]
    if (last !== undefined && last.end + 1 === n) last.end = n
    else ranges.push({ start: n, end: n })
  }
  return ranges.map((r) => (r.start === r.end ? `${r.start}` : `${r.start}-${r.end}`)).join(',')
}

const lines = [
  '# Track-1 whole-file lcov summary (old-gate scope)',
  '',
  'Per-file LF/LH and hits=0 DA line ranges from lcov-core.info / lcov-dsh.info for the CASE Coverage scope files.',
  '',
  '| File | LF | LH | Uncovered (hits=0 DA ranges) | Source |',
  '| --- | --- | --- | --- | --- |',
]
for (const file of FILES) {
  const core = summarize(`${TASK}/coverage/lcov-core.info`, file)
  const dsh = summarize(`${TASK}/coverage/lcov-dsh.info`, file)
  const entry = core ?? dsh
  if (entry === null) {
    lines.push(`| \`${file}\` | 0 | 0 | - | (no SF record) |`)
    continue
  }
  lines.push(`| \`${file}\` | ${entry.lf} | ${entry.lh} | ${compress(entry.zero) || '-'} | ${core !== null ? 'lcov-core.info' : 'lcov-dsh.info'} |`)
}
let totalLf = 0
let totalLh = 0
for (const file of FILES) {
  const entry = summarize(`${TASK}/coverage/lcov-core.info`, file) ?? summarize(`${TASK}/coverage/lcov-dsh.info`, file)
  if (entry !== null) {
    totalLf += entry.lf
    totalLh += entry.lh
  }
}
lines.push('', `- Overall (whole-file): ${totalLh}/${totalLf} (${((totalLh / totalLf) * 100).toFixed(1)}%)`, '')
writeFileSync(`${TASK}/coverage/whole-file-summary.md`, lines.join('\n'), 'utf8')
console.log(lines.join('\n'))
