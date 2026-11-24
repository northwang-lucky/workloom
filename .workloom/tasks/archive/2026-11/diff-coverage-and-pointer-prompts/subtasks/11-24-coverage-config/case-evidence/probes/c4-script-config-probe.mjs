#!/usr/bin/env node
/**
 * C4 探针一：task-diff-coverage.mjs 消费配置——--check 判定极性、formatHints 广播/纯推断、
 * config 非法非零退出。子进程运行，env HOME 指向空目录（HOME 隔离）。
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const WT = '/data00/home/wangyubo.1219/workbench/code-src/github/workloom/.workloom/.runtime/worktrees/11-24-coverage-config'
const SCRIPT = join(WT, 'packages/core/resources/scripts/task-diff-coverage.mjs')
const home = mkdtempSync(join(tmpdir(), 'c4-script-home-'))
const dirs = []

const lines = []
let failures = 0
function record(name, pass, detail) {
  lines.push(`[${name}] ${pass ? 'PASS' : 'FAIL'} ${detail}`)
  if (!pass) failures++
}

function makeWorktree(tag, files, modified) {
  const wt = mkdtempSync(join(tmpdir(), `c4-wt-${tag}-`))
  dirs.push(wt)
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(join(wt, file, '..'), { recursive: true })
    writeFileSync(join(wt, file), content)
  }
  const git = (...args) => execFileSync('git', ['-C', wt, '-c', 'user.name=Probe', '-c', 'user.email=probe@example.com', ...args], { stdio: ['ignore', 'ignore', 'ignore'] })
  git('init', '-q')
  git('add', '-A')
  git('commit', '-q', '-m', 'baseline')
  for (const [file, content] of Object.entries(modified)) writeFileSync(join(wt, file), content)
  return wt
}

function run(wt, reportPath, ...flags) {
  return execFileSync('node', [SCRIPT, wt, '-', reportPath, ...flags], {
    encoding: 'utf8',
    env: { ...process.env, HOME: home },
  })
}

function writeConfig(wt, coverage) {
  mkdirSync(join(wt, '.workloom'), { recursive: true })
  writeFileSync(join(wt, '.workloom/config.json'), JSON.stringify({ coverage }, null, 2))
}

function writeLcov(dir, file, hits) {
  const path = join(dir, 'report.lcov')
  const das = hits.map((hits0, index) => `DA:${index + 1},${hits0}`)
  writeFileSync(path, [`SF:${file}`, ...das, 'end_of_record', ''].join('\n'))
  return path
}

try {
  // A/B/C/F：a.ts 全 10 行未提交改写。
  const wtA = makeWorktree('a', { 'src/a.ts': 'export const a = 1\n' }, { 'src/a.ts': 'export const a = 2\n' })
  writeFileSync(join(wtA, 'src/a.ts'), 'export const a = 2\nline2\nline3\nline4\nline5\nline6\nline7\nline8\nline9\nline10\n')
  const hitTemplate = (covered) => Array.from({ length: 10 }, (_, index) => (index < covered ? 1 : 0))

  writeConfig(wtA, { threshold: 80 })
  let report = writeLcov(wtA, join(wtA, 'src/a.ts'), hitTemplate(8))
  let payload = JSON.parse(run(wtA, report, '--json', '--check'))
  record('A-check-fail', payload.threshold === 80 && payload.pass === false, `threshold=${payload.threshold} pass=${payload.pass}`)

  report = writeLcov(wtA, join(wtA, 'src/a.ts'), hitTemplate(9))
  payload = JSON.parse(run(wtA, report, '--json', '--check'))
  const markdown = run(wtA, report, '--check')
  record('B-check-pass', payload.pass === true && /Pass: yes/.test(markdown), `pass=${payload.pass} markdown=/Pass: yes/ matched=${/Pass: yes/.test(markdown)}`)

  payload = JSON.parse(run(wtA, report, '--json'))
  record('C-no-check', payload.pass === undefined && payload.threshold === undefined, `pass=${payload.pass} threshold=${payload.threshold} format=${payload.format}`)

  writeConfig(wtA, { threshold: -1 })
  try {
    run(wtA, report, '--json')
    record('F-invalid-config', false, 'no error thrown')
  } catch (error) {
    record('F-invalid-config', /coverage/.test(String(error.stderr ?? '')), `stderr=${String(error.stderr ?? '').trim().split('\n')[0]}`)
  }

  // D：单语言（只改 A.java）+ config java cobertura-xml + 空 cobertura 报告 → format 广播。
  const wtD = makeWorktree('d', { 'src/A.java': 'class A {\n  void m() {}\n  void n() {}\n  void o() {}\n  void p() {}\n}\n' }, { 'src/A.java': 'class A {\n  void m2() {}\n  void n2() {}\n  void o2() {}\n  void p2() {}\n}\n' })
  writeConfig(wtD, { languages: { java: { format: 'cobertura-xml' } } })
  const emptyCobertura = join(wtD, 'empty-cobertura.xml')
  writeFileSync(emptyCobertura, '<coverage line-rate="0"></coverage>\n')
  payload = JSON.parse(run(wtD, emptyCobertura, '--json'))
  record('D-hint-broadcast', payload.format === 'cobertura-xml', `format=${payload.format}`)

  // E：多语言（改 A.java + B.ts）同 config 同报告 → 纯推断 unsupported。
  const wtE = makeWorktree('e', {
    'src/A.java': 'class A {\n  void m() {}\n  void n() {}\n  void o() {}\n  void p() {}\n}\n',
    'src/B.ts': 'export const b = 1\nexport const b2 = 2\nexport const b3 = 3\n',
  }, {
    'src/A.java': 'class A {\n  void m2() {}\n  void n2() {}\n  void o2() {}\n  void p2() {}\n}\n',
    'src/B.ts': 'export const b = 2\nexport const b2 = 3\nexport const b3 = 4\n',
  })
  writeConfig(wtE, { languages: { java: { format: 'cobertura-xml' } } })
  const emptyCoberturaE = join(wtE, 'empty-cobertura.xml')
  writeFileSync(emptyCoberturaE, '<coverage line-rate="0"></coverage>\n')
  payload = JSON.parse(run(wtE, emptyCoberturaE, '--json'))
  record('E-multi-unsupported', payload.format === 'unsupported', `format=${payload.format}`)
} finally {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
  rmSync(home, { recursive: true, force: true })
}

console.log(lines.join('\n'))
console.log(`c4-script-config-probe: ${failures === 0 ? 'ALL PASS' : `${failures} FAILURES`}`)
process.exitCode = failures === 0 ? 0 : 1
