/**
 * C1 探针：夹具仓库 + 三份报告夹具 → CLI 三次运行（工作区口径无排除 / 带 --exclude / 三点口径），
 * 逐项核对 changed-lines.json 与 diff-coverage.json，并做 hunk 头交叉核对。
 * 用法：node c1-diff-coverage-probe.mjs <WT> <TASK>
 */
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const [WT, TASK] = process.argv.slice(2)
if (WT === undefined || TASK === undefined) throw new Error('usage: node c1-diff-coverage-probe.mjs <WT> <TASK>')
const CLI = join(WT, 'packages/core/resources/scripts/task-diff-coverage.mjs')
const FIX = join(TASK, 'case-evidence/fixtures/c1')
const EV = join(TASK, 'case-evidence')

/** 夹具文件内容（基线提交）。 */
const FILES = {
  'go.mod': 'module example.com/demo\n',
  'src/a.ts': Array.from({ length: 10 }, (_, index) => `export const a${index + 1} = ${index + 1}\n`).join(''),
  'src/b.ts': Array.from({ length: 4 }, (_, index) => `export const b${index + 1} = ${index + 1}\n`).join(''),
  'pkg/c.go': Array.from({ length: 6 }, (_, index) => `var c${index + 1} = ${index + 1}\n`).join(''),
  'src/Mapper.java': Array.from({ length: 5 }, (_, index) => `int m${index + 1} = ${index + 1};\n`).join(''),
  'docs/readme.md': 'a\nb\nc\n',
}

/** 报告夹具（与 CASE C1 步骤 3 逐行一致）。 */
const REPORTS = {
  'lcov.info': [
    'TN:',
    'SF:src/a.ts',
    ...Array.from({ length: 10 }, (_, index) => `DA:${index + 1},${index === 3 ? 0 : 1}`),
    'end_of_record',
    'SF:src/c.ts',
    'DA:1,0',
    'DA:2,3',
    'DA:3,1',
    'DA:4,1',
    'end_of_record',
    '',
  ].join('\n'),
  'cover.out': [
    'mode: set',
    'example.com/demo/pkg/c.go:1.1,1.10 1 0',
    'example.com/demo/pkg/c.go:5.5,5.10 1 1',
    '',
  ].join('\n'),
  'jacoco.xml':
    '<report name="example.com/demo"><package name="src"><sourcefile name="Mapper.java">' +
    '<line nr="2" mi="3" ci="0" mb="0" cb="0"/><line nr="4" mi="0" ci="5" mb="0" cb="0"/>' +
    '</sourcefile></package></report>\n',
}

const results = []
/** 记录一条期望核对结果。 */
function check(name, ok, detail) {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` — ${detail}`}`)
}

/** 改写文件指定行（1 起始）。 */
function replaceLine(root, file, lineNo, text) {
  const path = join(root, file)
  const lines = readFileSync(path, 'utf8').split('\n')
  lines[lineNo - 1] = text
  writeFileSync(path, lines.join('\n'))
}

function git(root, args) {
  return spawnSync('git', args, { cwd: root, encoding: 'utf8' })
}

/** 区间数组展开为行集合。 */
function lineSet(ranges) {
  const set = new Set()
  for (const range of ranges ?? []) for (let line = range.start; line <= range.end; line++) set.add(line)
  return [...set].sort((a, b) => a - b).join(',')
}

function sameRanges(left, right) {
  const keys = Object.keys(left).sort()
  if (JSON.stringify(keys) !== JSON.stringify(Object.keys(right).sort())) return false
  return keys.every((key) => lineSet(left[key]) === lineSet(right[key]))
}

const fixture = mkdtempSync(join(tmpdir(), 'c1-fixture-'))
const out1 = mkdtempSync(join(tmpdir(), 'c1-out1-'))
const out2 = mkdtempSync(join(tmpdir(), 'c1-out2-'))
const out3 = mkdtempSync(join(tmpdir(), 'c1-out3-'))
try {
  // 报告夹具落任务目录（不放进夹具仓库，避免进入变更行清单）。
  for (const [name, content] of Object.entries(REPORTS)) {
    mkdirSync(FIX, { recursive: true })
    writeFileSync(join(FIX, name), content)
  }
  const reportPaths = ['lcov.info', 'cover.out', 'jacoco.xml'].map((name) => join(FIX, name))

  // 夹具仓库：基线提交 + 未提交改动。
  for (const [file, content] of Object.entries(FILES)) {
    mkdirSync(join(fixture, file, '..'), { recursive: true })
    writeFileSync(join(fixture, file), content)
  }
  let run = git(fixture, ['init', '-q'])
  if (run.status !== 0) throw new Error(run.stderr)
  git(fixture, ['config', 'user.email', 'probe@example.com'])
  git(fixture, ['config', 'user.name', 'probe'])
  git(fixture, ['add', '-A'])
  run = git(fixture, ['commit', '-q', '-m', 'base'])
  if (run.status !== 0) throw new Error(run.stderr)
  const base = git(fixture, ['rev-parse', 'HEAD']).stdout.trim()

  replaceLine(fixture, 'src/a.ts', 3, 'export const a3 = 33')
  replaceLine(fixture, 'src/a.ts', 4, 'export const a4 = 44')
  run = git(fixture, ['mv', 'src/b.ts', 'src/c.ts'])
  if (run.status !== 0) throw new Error(run.stderr)
  replaceLine(fixture, 'src/c.ts', 2, 'export const b2 = 22')
  writeFileSync(join(fixture, 'src/new.ts'), 'x\ny\nz\n')
  replaceLine(fixture, 'docs/readme.md', 1, 'A')
  replaceLine(fixture, 'pkg/c.go', 5, 'var c5 = 55')
  replaceLine(fixture, 'src/Mapper.java', 4, 'int m4 = 44;')

  const runCli = (args, out) => {
    const proc = spawnSync('node', [CLI, fixture, ...args, ...reportPaths, '--json', '--out-dir', out], { cwd: WT, encoding: 'utf8' })
    if (proc.status !== 0) throw new Error(`CLI exit ${proc.status}: ${proc.stderr}`)
    return {
      diff: JSON.parse(readFileSync(join(out, 'diff-coverage.json'), 'utf8')),
      lines: JSON.parse(readFileSync(join(out, 'changed-lines.json'), 'utf8')),
      stdout: proc.stdout,
    }
  }

  const first = runCli(['-'], out1)
  const second = runCli(['-', '--exclude', 'src/new.ts'], out2)
  console.log('--- out-1 changed-lines.json ---')
  console.log(JSON.stringify(first.lines))
  console.log('--- out-1 diff-coverage.json ---')
  console.log(JSON.stringify(first.diff))

  // 步骤 3/4：工作区口径的变更行清单与交集结果。
  check('changed-lines: src/a.ts 行集合为 3,4', lineSet(first.lines['src/a.ts']) === '3,4', lineSet(first.lines['src/a.ts']))
  check('changed-lines: src/c.ts 行集合为 2（重命名归新名）', lineSet(first.lines['src/c.ts']) === '2', lineSet(first.lines['src/c.ts']))
  check('changed-lines: src/new.ts 行集合为 1,2,3（未跟踪全行）', lineSet(first.lines['src/new.ts']) === '1,2,3', lineSet(first.lines['src/new.ts']))
  check('changed-lines: docs/readme.md 为 1', lineSet(first.lines['docs/readme.md']) === '1', lineSet(first.lines['docs/readme.md']))
  check('changed-lines: pkg/c.go 为 5', lineSet(first.lines['pkg/c.go']) === '5', lineSet(first.lines['pkg/c.go']))
  check('changed-lines: src/Mapper.java 为 4', lineSet(first.lines['src/Mapper.java']) === '4', lineSet(first.lines['src/Mapper.java']))
  check('changed-lines: 不含 src/b.ts', !('src/b.ts' in first.lines), Object.keys(first.lines).join(','))
  const byFile = Object.fromEntries(first.diff.files.map((file) => [file.file, file]))
  check('out-1 files: src/a.ts 1/2 未覆盖 [4,4]', byFile['src/a.ts']?.covered === 1 && byFile['src/a.ts']?.total === 2 && JSON.stringify(byFile['src/a.ts']?.uncoveredRanges) === JSON.stringify([{ start: 4, end: 4 }]), JSON.stringify(byFile['src/a.ts']))
  check('out-1 files: src/c.ts 1/1', byFile['src/c.ts']?.covered === 1 && byFile['src/c.ts']?.total === 1, JSON.stringify(byFile['src/c.ts']))
  check('out-1 files: pkg/c.go 1/1', byFile['pkg/c.go']?.covered === 1 && byFile['pkg/c.go']?.total === 1, JSON.stringify(byFile['pkg/c.go']))
  check('out-1 files: src/Mapper.java 1/1', byFile['src/Mapper.java']?.covered === 1 && byFile['src/Mapper.java']?.total === 1, JSON.stringify(byFile['src/Mapper.java']))
  check('out-1 files 恰为四个文件（集合相等，顺序按 locale 排序）', [...first.diff.files.map((file) => file.file)].sort().join(',') === 'pkg/c.go,src/Mapper.java,src/a.ts,src/c.ts', first.diff.files.map((file) => file.file).join(','))
  check('out-1 overall 为 4/5', first.diff.overall.covered === 4 && first.diff.overall.total === 5, JSON.stringify(first.diff.overall))
  check('out-1 missingExecutableFiles 恰为 src/new.ts', JSON.stringify(first.diff.missingExecutableFiles) === JSON.stringify(['src/new.ts']), JSON.stringify(first.diff.missingExecutableFiles))
  check('out-1 format 为 mixed', first.diff.format === 'mixed', first.diff.format)
  check('out-1 --json stdout 与 diff-coverage.json 一致', JSON.stringify(JSON.parse(first.stdout)) === JSON.stringify(first.diff), first.stdout.slice(0, 80))

  // 步骤 4：追加 --exclude src/new.ts。
  check('out-2 missingExecutableFiles 为空', second.diff.missingExecutableFiles.length === 0, JSON.stringify(second.diff.missingExecutableFiles))
  check('out-2 overall 仍为 4/5', second.diff.overall.covered === 4 && second.diff.overall.total === 5, JSON.stringify(second.diff.overall))
  check('out-2 files 与 out-1 一致', JSON.stringify(second.diff.files) === JSON.stringify(first.diff.files), 'files differ')

  // 步骤 5：三点口径。
  git(fixture, ['add', '-A'])
  run = git(fixture, ['commit', '-q', '-m', 'work'])
  if (run.status !== 0) throw new Error(run.stderr)
  const third = runCli([base], out3)
  check('out-3 变更行与工作区口径一致（文件集合与区间）', sameRanges(third.lines, first.lines), JSON.stringify(third.lines))
  check('out-3 overall 与 files 与 out-1 一致', JSON.stringify(third.diff.overall) === JSON.stringify(first.diff.overall) && JSON.stringify(third.diff.files) === JSON.stringify(first.diff.files), JSON.stringify(third.diff))

  // 步骤 6：hunk 头交叉核对。
  const show = git(fixture, ['show', '--format=', '--unified=0', 'HEAD', '--', 'src/a.ts']).stdout
  const hunk = /@@ -\d+(?:,\d+)? \+(\d+),(\d+) @@/.exec(show)
  check('src/a.ts 新侧 hunk 头为 +3,2', hunk?.[1] === '3' && hunk?.[2] === '2', show.split('\n').find((line) => line.startsWith('@@')))

  // 步骤 7：产物复制到任务证据目录。
  copyFileSync(join(out1, 'diff-coverage.json'), join(EV, 'c1-worktree-no-exclude.json'))
  copyFileSync(join(out2, 'diff-coverage.json'), join(EV, 'c1-worktree-exclude.json'))
  copyFileSync(join(out3, 'diff-coverage.json'), join(EV, 'c1-three-dot.json'))
  copyFileSync(join(out1, 'changed-lines.json'), join(EV, 'c1-changed-lines.json'))
  copyFileSync(join(out3, 'changed-lines.json'), join(EV, 'c1-three-dot-changed-lines.json'))
} finally {
  for (const dir of [fixture, out1, out2, out3]) rmSync(dir, { recursive: true, force: true })
}

const failed = results.filter((item) => !item.ok)
console.log(`--- summary: ${results.length - failed.length}/${results.length} checks passed; fixture and out dirs removed ---`)
process.exit(failed.length === 0 ? 0 : 1)
