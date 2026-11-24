/**
 * 增量覆盖率计算单测：三格式路径归一、变更行交集、单行 hunk、缺席可执行文件、
 * 空分母、unsupported 回退信号与阈值整数边界。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  EXECUTABLE_EXTENSIONS,
  buildWaiver,
  computeDiffCoverage,
  inferFormat,
  isExecutableFile,
  meetsThreshold,
  parseGoCoverprofile,
  parseJacocoXml,
  parseLcov,
} from '../src/task/coverage-compute.ts'
import type { ChangedLineRange } from '../src/workspace/git-query.ts'

/** 带 go.mod 的临时 worktree 根。 */
function makeRoot(withGoMod = true) {
  const root = mkdtempSync(join(tmpdir(), 'workloom-coverage-'))
  if (withGoMod) writeFileSync(join(root, 'go.mod'), 'module example.com/proj\n')
  return root
}

function changed(entries: [string, ChangedLineRange[]][]): Map<string, ChangedLineRange[]> {
  return new Map(entries)
}

test('go coverprofile：剥 module 前缀转 repo 相对，block 首末行闭区间交集', async () => {
  const root = makeRoot()
  try {
    const report = [
      'mode: set',
      'example.com/proj/internal/app.go:10.1,11.5 2 1',
      'example.com/proj/internal/app.go:12.1,12.20 1 0',
    ].join('\n')
    const [err, result] = await computeDiffCoverage({
      root,
      changedLines: changed([['internal/app.go', [{ start: 10, end: 12 }]]]),
      reports: [report],
    })
    assert.equal(err, null)
    assert.equal(result.format, 'go')
    assert.deepEqual(result.files, [
      {
        file: 'internal/app.go',
        covered: 2,
        total: 3,
        uncoveredRanges: [{ start: 12, end: 12 }],
        changedRanges: [{ start: 10, end: 12 }],
      },
    ])
    assert.deepEqual(result.overall, { covered: 2, total: 3 })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('lcov：SF 绝对路径剥 worktree 前缀，未改动行不进分母', async () => {
  const root = makeRoot(false)
  try {
    const report = [
      `SF:${join(root, 'src/a.ts')}`,
      'DA:1,1',
      'DA:2,0',
      'DA:3,2',
      'DA:5,1',
      'end_of_record',
    ].join('\n')
    const [err, result] = await computeDiffCoverage({
      root,
      changedLines: changed([['src/a.ts', [{ start: 1, end: 4 }]]]),
      reports: [report],
    })
    assert.equal(err, null)
    assert.equal(result.format, 'lcov')
    assert.deepEqual(result.files[0], {
      file: 'src/a.ts',
      covered: 2,
      total: 3,
      uncoveredRanges: [{ start: 2, end: 2 }],
      changedRanges: [{ start: 1, end: 4 }],
    })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('jacoco：package+sourcefile 后缀匹配 diff 路径，ci>0 即覆盖', async () => {
  const root = makeRoot(false)
  try {
    const report = [
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
      '<report name="jacoco">',
      '<package name="com/acme">',
      '<sourcefile name="Foo.java">',
      '<line nr="5" mi="0" ci="2"/>',
      '<line nr="6" mi="1" ci="0"/>',
      '<line nr="7" mi="0" ci="1"/>',
      '</sourcefile>',
      '</package>',
      '</report>',
    ].join('\n')
    const [err, result] = await computeDiffCoverage({
      root,
      changedLines: changed([['src/main/java/com/acme/Foo.java', [{ start: 5, end: 7 }]]]),
      reports: [report],
    })
    assert.equal(err, null)
    assert.equal(result.format, 'jacoco-xml')
    assert.deepEqual(result.files[0], {
      file: 'src/main/java/com/acme/Foo.java',
      covered: 2,
      total: 3,
      uncoveredRanges: [{ start: 6, end: 6 }],
      changedRanges: [{ start: 5, end: 7 }],
    })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('jacoco 同后缀多候选歧义时返回 err（fail loud）', async () => {
  const diffFiles = ['src/main/com/acme/Foo.java', 'src/test/com/acme/Foo.java']
  const report = '<report><package name="com/acme"><sourcefile name="Foo.java"><line nr="1" ci="1"/></sourcefile></package></report>'
  const [err, parsed] = parseJacocoXml(report, diffFiles)
  assert.ok(err)
  assert.match(err.message, /ambiguous/)
  assert.equal(parsed, null)
})

test('单行 hunk 与缺席可执行文件：可执行缺席入 missing，非可执行缺席不触发', async () => {
  const root = makeRoot(false)
  try {
    const report = `SF:${join(root, 'a.ts')}\nDA:2,0\nend_of_record`
    const [err, result] = await computeDiffCoverage({
      root,
      changedLines: changed([
        ['a.ts', [{ start: 2, end: 2 }]],
        ['notes.md', [{ start: 1, end: 1 }]],
        ['missing.py', [{ start: 1, end: 1 }]],
      ]),
      reports: [report],
    })
    assert.equal(err, null)
    assert.deepEqual(result.files, [
      {
        file: 'a.ts',
        covered: 0,
        total: 1,
        uncoveredRanges: [{ start: 2, end: 2 }],
        changedRanges: [{ start: 2, end: 2 }],
      },
    ])
    assert.deepEqual(result.missingExecutableFiles, ['missing.py'])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('.d.ts 类型声明不计入可执行集合：缺席报告不触发 missing', () => {
  const root = makeRoot(false)
  try {
    const [err, result] = computeDiffCoverage({
      root,
      changedLines: changed([
        ['types.d.ts', [{ start: 1, end: 3 }]],
        ['a.ts', [{ start: 2, end: 2 }]],
      ]),
      reports: [`SF:${join(root, 'a.ts')}\nDA:2,1\nend_of_record`],
    })
    assert.equal(err, null)
    assert.deepEqual(result.missingExecutableFiles, [])
    assert.equal(isExecutableFile('types.d.ts'), false)
    assert.equal(isExecutableFile('a.ts'), true)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('带原因的排除项不进入 missing 与交集', async () => {
  const root = makeRoot(false)
  try {
    const report = `SF:${join(root, 'a.ts')}\nDA:1,1\nend_of_record`
    const [err, result] = await computeDiffCoverage({
      root,
      changedLines: changed([
        ['a.ts', [{ start: 1, end: 1 }]],
        ['generated.py', [{ start: 1, end: 1 }]],
      ]),
      reports: [report],
      exclusions: new Map([['generated.py', 'auto-generated']]),
    })
    assert.equal(err, null)
    assert.deepEqual(result.missingExecutableFiles, [])
    assert.deepEqual(result.files.map((file) => file.file), ['a.ts'])
    assert.ok(EXECUTABLE_EXTENSIONS.includes('.py'))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('空分母：变更行不被工具统计时 files 为空、overall 为 0/0', async () => {
  const root = makeRoot(false)
  try {
    const report = `SF:${join(root, 'a.ts')}\nDA:1,1\nend_of_record`
    const [err, result] = await computeDiffCoverage({
      root,
      changedLines: changed([['a.ts', [{ start: 2, end: 2 }]]]),
      reports: [report],
    })
    assert.equal(err, null)
    assert.deepEqual(result.files, [])
    assert.deepEqual(result.overall, { covered: 0, total: 0 })
    assert.deepEqual(result.missingExecutableFiles, [])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('unsupported 报告标记 unsupported 且跳过缺席检测', async () => {
  const [err, result] = await computeDiffCoverage({
    changedLines: changed([['a.ts', [{ start: 1, end: 1 }]]]),
    reports: ['checker self-reported numbers'],
  })
  assert.equal(err, null)
  assert.equal(result.format, 'unsupported')
  assert.deepEqual(result.files, [])
  assert.deepEqual(result.missingExecutableFiles, [])
})

test('多报告混格式按文件合并、行覆盖取并', async () => {
  const root = makeRoot()
  try {
    const goReport = 'mode: set\nexample.com/proj/b.go:1.1,2.2 2 1'
    const lcovReport = `SF:${join(root, 'a.ts')}\nDA:1,0\nDA:2,1\nDA:3,0\nend_of_record`
    const [err, result] = await computeDiffCoverage({
      root,
      changedLines: changed([
        ['a.ts', [{ start: 1, end: 3 }]],
        ['b.go', [{ start: 1, end: 2 }]],
      ]),
      reports: [lcovReport, goReport],
    })
    assert.equal(err, null)
    assert.equal(result.format, 'mixed')
    assert.deepEqual(result.files.map((file) => [file.file, file.covered, file.total]), [
      ['a.ts', 1, 3],
      ['b.go', 2, 2],
    ])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('inferFormat / meetsThreshold / buildWaiver 边界', () => {
  assert.equal(inferFormat('mode: set\n'), 'go')
  assert.equal(inferFormat('SF:/a\nDA:1,1\n'), 'lcov')
  assert.equal(inferFormat('<report name="x">'), 'jacoco-xml')
  assert.equal(inferFormat('plain text'), 'unsupported')

  assert.equal(meetsThreshold(90, 100), false, '恰好 90% 不达标')
  assert.equal(meetsThreshold(91, 100), true)
  assert.equal(meetsThreshold(0, 0), false)
  const waiver = buildWaiver('reviewed', 'main@abc')
  assert.equal(waiver.reason, 'reviewed')
  assert.equal(waiver.fingerprint, 'main@abc')
  assert.equal(waiver.source, 'main')
  assert.match(waiver.at, /^\d{4}-\d{2}-\d{2}T/)
})

test('解析器直接调用：go 无 go.mod 时后缀匹配；lcov 非法 DA 返回 err', async () => {
  const root = makeRoot(false)
  try {
    const [goErr, parsed] = parseGoCoverprofile(
      'mode: set\nexample.com/proj/internal/app.go:10.1,10.5 1 1',
      root,
      ['internal/app.go'],
    )
    assert.equal(goErr, null)
    assert.deepEqual(parsed.map((file) => file.file), ['internal/app.go'])
    const [lcovErr, bad] = parseLcov('SF:/a.ts\nDA:not-a-line,1\n')
    assert.ok(lcovErr)
    assert.equal(bad, null)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
