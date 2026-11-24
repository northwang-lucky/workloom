/**
 * 任务 diff 增量覆盖率采集 CLI（薄壳）：从 core dist 复用单一计算源，输出
 * 逐文件变更行与交集结果。报告正文由调用方读取，路径相对当前工作目录解析。
 *
 * 用法：node task-diff-coverage.mjs <worktree> <baseRef> <report...>
 *                                  [--json] [--out-dir <dir>] [--exclude <pattern>...]
 * baseRef 传 '-' 或空串表示无分支工作区（两点 diff + 未跟踪文件口径）。
 * --exclude 可重复，按 CASE Exclusions 规则排除构建产物等分母噪声（自身证据用）。
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { DIFF_COVERAGE_ARTIFACTS, computeDiffCoverage } from '../../dist/task/coverage-compute.js'
import { gitDiffChangedLines } from '../../dist/workspace/git-query.js'

const ENCODING = 'utf8'
const FLAGS = Object.freeze({ json: '--json', outDir: '--out-dir', exclude: '--exclude' })
const USAGE = 'usage: node task-diff-coverage.mjs <worktree> <baseRef> <report...> [--json] [--out-dir <dir>] [--exclude <pattern>...]'

/** 解析 argv：两个位置参数 + 若干报告路径 + 可选标志（顺序任意）。 */
function parseArgs(argv) {
  const positional = []
  const excludes = []
  let json = false
  let outDir = null
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]
    if (arg === FLAGS.json) {
      json = true
      continue
    }
    if (arg === FLAGS.outDir || arg === FLAGS.exclude) {
      const value = argv[++index]
      if (value === undefined || value.startsWith('--')) throw new Error(`usage: ${arg} requires a value`)
      if (arg === FLAGS.outDir) outDir = value
      else excludes.push(value)
      continue
    }
    if (arg.startsWith('--')) throw new Error(`unknown option: ${arg}`)
    positional.push(arg)
  }
  if (positional.length < 3) throw new Error(USAGE)
  return { worktree: positional[0], baseRef: positional[1], reports: positional.slice(2), json, outDir, excludes }
}

/** 区间序列转展示文案。 */
function rangesText(ranges) {
  return ranges.map((range) => (range.start === range.end ? `${range.start}` : `${range.start}-${range.end}`)).join(', ')
}

/** 人类可读输出：逐文件变更行交集表 + overall。 */
function renderMarkdown(result) {
  const lines = ['## Diff coverage', '', '| File | Covered / Total | Uncovered changed lines |', '| --- | --- | --- |']
  if (result.files.length === 0) {
    lines.push('| _none_ | 0/0 | - |')
  } else {
    for (const file of result.files) {
      lines.push(`| \`${file.file}\` | ${file.covered}/${file.total} | \`${rangesText(file.uncoveredRanges) || '-'}\` |`)
    }
  }
  const { covered, total } = result.overall
  const pct = total === 0 ? '0.0' : ((covered / total) * 100).toFixed(1)
  lines.push('', `Overall: ${covered}/${total} (${pct}%)`, `Format: ${result.format}`)
  if (result.missingExecutableFiles.length > 0) {
    lines.push('', `Missing executable files: ${result.missingExecutableFiles.join(', ')}`)
  }
  return lines.join('\n')
}

/** CLI 主流程：提取变更行 → 复算交集 → 可选写产物 → stdout（具名导出供单测直接调用）。 */
export function main(argv) {
  const args = parseArgs(argv)
  const root = resolve(args.worktree)
  const baseRef = args.baseRef === '-' || args.baseRef === '' ? null : args.baseRef
  const reports = args.reports.map((path) => readFileSync(resolve(path), ENCODING))

  const [gitErr, changedLines] = gitDiffChangedLines(root, baseRef)
  if (gitErr !== null) throw gitErr
  const exclusions = new Map(args.excludes.map((pattern) => [pattern, 'self-evidence exclusion']))
  const [err, result] = computeDiffCoverage({ root, changedLines: changedLines ?? new Map(), reports, exclusions })
  if (err !== null) throw err

  const lines = changedLines ?? new Map()
  const changedPayload = Object.fromEntries([...lines].map(([file, ranges]) => [file, ranges]))
  if (args.outDir !== null) {
    mkdirSync(resolve(args.outDir), { recursive: true })
    writeFileSync(join(resolve(args.outDir), DIFF_COVERAGE_ARTIFACTS.changedLines), `${JSON.stringify(changedPayload, null, 2)}\n`, ENCODING)
    writeFileSync(join(resolve(args.outDir), DIFF_COVERAGE_ARTIFACTS.result), `${JSON.stringify(result, null, 2)}\n`, ENCODING)
  }
  console.log(args.json ? JSON.stringify(result, null, 2) : renderMarkdown(result))
}

const entry = process.argv[1] === undefined ? null : pathToFileURL(resolve(process.argv[1])).href
if (entry !== null && entry === import.meta.url) {
  main(process.argv.slice(2))
}
