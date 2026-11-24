import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { main } from './task-diff-coverage.mjs'

const SCRIPT = fileURLToPath(new URL('task-diff-coverage.mjs', import.meta.url))

function git(root, args) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

/** 基线与当前各一个提交：a.ts 第 2 行修改，报告只覆盖第 1、3 行。 */
function makeFixture() {
  const root = mkdtempSync(join(tmpdir(), 'workloom-diff-coverage-'))
  git(root, ['init', '-q'])
  writeFileSync(join(root, 'a.ts'), 'one\ntwo\nthree\n')
  git(root, ['add', 'a.ts'])
  git(root, ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-q', '-m', 'init'])
  git(root, ['branch', 'base'])
  writeFileSync(join(root, 'a.ts'), 'one\nTWO-NEW\nthree\n')
  // 缺席报告的可执行文件：用于 --exclude 排除项测试。
  writeFileSync(join(root, 'missing.go'), 'package main\n')
  git(root, ['add', 'a.ts', 'missing.go'])
  git(root, ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-q', '-m', 'change'])
  const report = join(root, 'lcov.info')
  writeFileSync(report, [`SF:${join(root, 'a.ts')}`, 'DA:1,1', 'DA:2,0', 'DA:3,1', 'end_of_record', ''].join('\n'))
  return { root, report }
}

function run(root, report, ...flags) {
  return execFileSync(process.execPath, [SCRIPT, root, 'base', report, ...flags], { encoding: 'utf8' })
}

test('CLI --out-dir 写 changed-lines.json 与 diff-coverage.json，stdout 输出 markdown', () => {
  const { root, report } = makeFixture()
  try {
    const outDir = join(root, 'coverage')
    const stdout = run(root, report, '--out-dir', outDir)
    assert.match(stdout, /Overall: 0\/1 \(0\.0%\)/)
    assert.match(stdout, /\| `a\.ts` \| 0\/1 \| `2` \|/)

    const changedLines = JSON.parse(readFileSync(join(outDir, 'changed-lines.json'), 'utf8'))
    assert.deepEqual(changedLines, {
      'a.ts': [{ start: 2, end: 2 }],
      'missing.go': [{ start: 1, end: 1 }],
    })
    const coverage = JSON.parse(readFileSync(join(outDir, 'diff-coverage.json'), 'utf8'))
    assert.equal(coverage.format, 'lcov')
    assert.deepEqual(coverage.overall, { covered: 0, total: 1 })
    assert.deepEqual(coverage.files[0].uncoveredRanges, [{ start: 2, end: 2 }])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('CLI --json 仅stdout 输出 JSON，省略 --out-dir 不写任何文件', () => {
  const { root, report } = makeFixture()
  try {
    const stdout = run(root, report, '--json')
    const parsed = JSON.parse(stdout)
    assert.equal(parsed.overall.total, 1)
    assert.equal(parsed.files[0].file, 'a.ts')
    assert.equal(existsSync(join(root, 'changed-lines.json')), false)
    assert.equal(existsSync(join(root, 'diff-coverage.json')), false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('CLI --exclude 按 Exclusions 规则移除分母噪声与缺席可执行文件', () => {
  const { root, report } = makeFixture()
  try {
    const runWith = (...flags) => JSON.parse(execFileSync(process.execPath, [SCRIPT, root, 'base', report, '--json', ...flags], { encoding: 'utf8' }))
    assert.deepEqual(runWith().missingExecutableFiles, ['missing.go'])
    assert.deepEqual(runWith('--exclude', 'missing.go').missingExecutableFiles, [])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('main 具名导出可直接调用：stdout 与 --out-dir 产物同 CLI 子进程一致', () => {
  const { root, report } = makeFixture()
  const outDir = join(root, 'direct-coverage')
  const logs = []
  const originalLog = console.log
  console.log = (value) => logs.push(value)
  try {
    main([root, 'base', report, '--json', '--out-dir', outDir])
    assert.equal(logs.length, 1)
    assert.deepEqual(JSON.parse(logs[0]).overall, { covered: 0, total: 1 })
    const coverage = JSON.parse(readFileSync(join(outDir, 'diff-coverage.json'), 'utf8'))
    assert.equal(coverage.format, 'lcov')
    assert.deepEqual(coverage.missingExecutableFiles, ['missing.go'])
  } finally {
    console.log = originalLog
    rmSync(root, { recursive: true, force: true })
  }
})

test('CLI 缺失参数时抛 usage 错误', () => {
  assert.throws(
    () => execFileSync(process.execPath, [SCRIPT], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }),
    /usage: node task-diff-coverage\.mjs/,
  )
})
