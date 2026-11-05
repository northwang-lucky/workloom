import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const TASK_DIR = resolve(SCRIPT_DIR, '..')
const PROJECT_ROOT = resolve(TASK_DIR, '../../..')
const COVERAGE_DIR = join(TASK_DIR, 'coverage')
const V8_DIR = join(COVERAGE_DIR, 'v8')
const TARGET_RELATIVE = 'verify/case-runtime.mjs'
const TARGET_ABSOLUTE = join(PROJECT_ROOT, TARGET_RELATIVE)
const LCOV_PATH = join(COVERAGE_DIR, 'lcov.info')
const SUMMARY_PATH = join(COVERAGE_DIR, 'summary.json')

/** Reads every JSON file of the V8 coverage directory and accepts both the array and the { result } outer shapes. */
function readV8Scripts() {
  const names = readdirSync(V8_DIR).filter((name) => name.endsWith('.json')).sort()
  const scripts = []
  for (const name of names) {
    const parsed = JSON.parse(readFileSync(join(V8_DIR, name), 'utf8'))
    const entries = Array.isArray(parsed) ? parsed : parsed.result
    for (const entry of entries) scripts.push(entry)
  }
  return scripts
}

/** Resolves a script URL to a local absolute path; returns null for a non-local script. */
function scriptLocalPath(url) {
  if (!url.startsWith('file:')) return null
  return fileURLToPath(url)
}

/** Collects every coverage range of a single script entry. */
function scriptRanges(script) {
  const ranges = []
  for (const fn of script.functions) {
    for (const range of fn.ranges) {
      ranges.push({ start: range.startOffset, end: range.endOffset, count: range.count })
    }
  }
  return ranges
}

/** Finds the innermost range covering an offset; V8 nests ranges to express branch hits. */
function innermostRange(ranges, offset) {
  let best = null
  for (const range of ranges) {
    if (offset < range.start || offset >= range.end) continue
    if (best === null || range.end - range.start < best.end - best.start) best = range
  }
  return best
}

/** Computes the number and start offset of every executable source line, skipping blank and comment-only lines. */
function sourceLines(text) {
  const lines = []
  const rawLines = text.split('\n')
  let offset = 0
  for (let index = 0; index < rawLines.length; index += 1) {
    const content = rawLines[index]
    const trimmed = content.trim()
    const isComment = trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')
    if (trimmed !== '' && !isComment) lines.push({ number: index + 1, start: offset })
    offset += content.length + 1
  }
  return lines
}

/** Counts the hits per line of the target file; a line counts as covered when the innermost range covering it has a positive count. */
function lineCounts(scripts, lines) {
  const counts = new Map()
  for (const line of lines) counts.set(line.number, 0)
  for (const script of scripts) {
    if (scriptLocalPath(script.url) !== TARGET_ABSOLUTE) continue
    const ranges = scriptRanges(script)
    for (const line of lines) {
      const range = innermostRange(ranges, line.start)
      counts.set(line.number, counts.get(line.number) + (range === null ? 0 : range.count))
    }
  }
  return counts
}

/** Renders the lcov text, keeping the per-line hit counts and the line totals. */
function renderLcov(lines, counts) {
  const output = ['TN:workloom-case-runtime', `SF:${TARGET_RELATIVE}`]
  for (const line of lines) {
    output.push(`DA:${line.number},${counts.get(line.number) ?? 0}`)
  }
  const covered = lines.filter((line) => (counts.get(line.number) ?? 0) > 0).length
  output.push(`LF:${lines.length}`, `LH:${covered}`, 'end_of_record')
  return `${output.join('\n')}\n`
}

/** Main flow: reads the raw coverage and writes the lcov report and the summary report. */
function main() {
  if (!existsSync(V8_DIR)) {
    console.error(`coverage directory not found: ${V8_DIR}`)
    return 1
  }
  if (!existsSync(TARGET_ABSOLUTE)) {
    console.error(`target file not found: ${TARGET_ABSOLUTE}`)
    return 1
  }
  const scripts = readV8Scripts()
  const source = readFileSync(TARGET_ABSOLUTE, 'utf8')
  const lines = sourceLines(source)
  const counts = lineCounts(scripts, lines)
  const covered = lines.filter((line) => (counts.get(line.number) ?? 0) > 0).length
  const percent = lines.length === 0 ? 100 : Math.round((covered / lines.length) * 100)
  const summary = { files: { [TARGET_RELATIVE]: { covered, total: lines.length, percent } } }
  mkdirSync(COVERAGE_DIR, { recursive: true })
  writeFileSync(LCOV_PATH, renderLcov(lines, counts), 'utf8')
  writeFileSync(SUMMARY_PATH, `${JSON.stringify(summary, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify(summary, null, 2))
  return 0
}

const entry = process.argv[1] === undefined ? null : pathToFileURL(resolve(process.argv[1])).href
if (entry !== null && entry === import.meta.url) {
  process.exitCode = main()
}
