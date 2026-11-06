import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const [root, lcovPath, outPath, fallbackList] = process.argv.slice(2)
const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' })
const changed = [
  ...git('diff', '--name-only', 'HEAD', '--', 'packages/core/src').split('\n'),
  ...git('ls-files', '--others', '--exclude-standard', '--', 'packages/core/src').split('\n'),
]
  .filter(Boolean)
  .map((path) => path.replace(/^packages\/core\//, ''))
  .filter((path) => /^src\/.+\.(js|ts)$/.test(path) && !path.endsWith('.d.ts'))
// 实现已提交时 git 变更集合为空，回退到 SR 声明的 core 文件清单。
const fallback = (fallbackList ?? '').split(',').filter(Boolean)
const wanted = new Set(changed.length > 0 ? changed : fallback)
const rows = []
for (const block of readFileSync(lcovPath, 'utf8').split('end_of_record')) {
  const file = /^SF:(.+)$/m.exec(block)?.[1]
  if (file === undefined) continue
  if (wanted.size > 0 && !wanted.has(file)) continue
  if (wanted.size === 0 && !/^src\/.+\.(js|ts)$/.test(file)) continue
  const lf = Number(/^LF:(\d+)$/m.exec(block)?.[1] ?? 0)
  const lh = Number(/^LH:(\d+)$/m.exec(block)?.[1] ?? 0)
  rows.push({ file, lf, lh })
}
rows.sort((left, right) => left.file.localeCompare(right.file))
const covered = rows.reduce((sum, row) => sum + row.lh, 0)
const total = rows.reduce((sum, row) => sum + row.lf, 0)
const percent = total === 0 ? 0 : (covered / total) * 100
const body = rows
  .map((row) => `${row.file}\t${row.lh}/${row.lf}\t${row.lf === 0 ? 0 : ((row.lh / row.lf) * 100).toFixed(2)}%`)
  .join('\n')
writeFileSync(outPath, `${body}\nOverall lines: ${covered}/${total} (${percent.toFixed(2)}%)\n`)
console.log(`Overall lines: ${covered}/${total} (${percent.toFixed(2)}%)`)
