import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { ensureCaseTemplates } from '../src/workspace/case-templates.ts'

// 测试隔离：findWorkloomRoot 的上溯以 HOME 为边界，重定向避免误发现真实家目录 .workloom。
const isolatedHome = mkdtempSync(join(tmpdir(), 'workloom-core-home-'))
process.env.HOME = isolatedHome
process.env.TMPDIR = isolatedHome

/** 相对 core 包 resources 根读取文本资源（模板路径随 resources 目录定版）。 */
function readResource(rel: string): string {
  return readFileSync(new URL(`../resources/${rel}`, import.meta.url), 'utf8')
}

/** 解析 front-matter 键集合（`---` 块内的 `key:` 首层字段）。 */
function frontMatterKeys(text: string): string[] {
  const match = /^---\n([\s\S]*?)\n---/.exec(text)
  if (match === null) return []
  return (match[1].match(/^[a-zA-Z][a-zA-Z0-9]*:/gm) ?? []).map((line) => line.slice(0, -1))
}

test('CASE 模板 loader 返回带 YAML 的完整资产', () => {
  const caseText = readResource('templates/case.md')
  const resultText = readResource('templates/case-result.md')
  assert.ok(caseText?.startsWith('---\nversion: 1\ntask:'))
  assert.ok(resultText?.startsWith('---\nversion: 1\ntask:'))
  for (const heading of ['## Static Review', '## Runtime Cases', '## Coverage', '## Traceability']) {
    assert.ok(caseText.includes(heading), heading)
  }
  for (const heading of ['## Static Review Results', '## Runtime Results', '## Standard Verification', '## Open issues']) {
    assert.ok(resultText.includes(heading), heading)
  }
  assert.ok(caseText.endsWith('\n'))
  assert.ok(resultText.endsWith('\n'))
  // RESULT front-matter 键集合固定且不含 caseHash（哈希确认机制已删除，
  // codeBaseline/codeFingerprint 保留为当次代码证据）。
  assert.deepEqual(frontMatterKeys(resultText), [
    'version',
    'task',
    'codeBaseline',
    'checkSession',
    'status',
    'startedAt',
    'completedAt',
  ])
  assert.ok(!resultText.includes('caseHash'), 'RESULT 模板不得再含 caseHash')
})

/** CASE 模板入参样例（内容比对以逐字相等为准）。 */
const CASE_TEMPLATES = {
  caseTemplate: '# CASE\nversion: 1\n',
  caseResultTemplate: '# CASE RESULT\nversion: 1\n',
}

/** 创建临时项目根（含 .workloom）。 */
function makeProject() {
  const root = mkdtempSync(join(tmpdir(), 'workloom-case-tpl-'))
  mkdirSync(join(root, '.workloom'), { recursive: true })
  return root
}

test('ensureCaseTemplates 缺失新建两份副本并返回相对路径', () => {
  const root = makeProject()
  try {
    const [err, result] = ensureCaseTemplates({ root, ...CASE_TEMPLATES })
    assert.equal(err, null)
    assert.ok(result)
    assert.equal(result.root, root)
    assert.deepEqual(result.created, ['.workloom/templates/case.md', '.workloom/templates/case-result.md'])
    assert.deepEqual(result.updated, [])
    assert.equal(readFileSync(join(root, '.workloom/templates/case.md'), 'utf8'), CASE_TEMPLATES.caseTemplate)
    assert.equal(readFileSync(join(root, '.workloom/templates/case-result.md'), 'utf8'), CASE_TEMPLATES.caseResultTemplate)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('ensureCaseTemplates 内容一致跳过（不刷新、不污染 created/updated）', () => {
  const root = makeProject()
  try {
    ensureCaseTemplates({ root, ...CASE_TEMPLATES })
    const [err, result] = ensureCaseTemplates({ root, ...CASE_TEMPLATES })
    assert.equal(err, null)
    assert.ok(result)
    assert.deepEqual(result.created, [])
    assert.deepEqual(result.updated, [])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('ensureCaseTemplates 内容不一致原子刷新（written 内容逐字覆盖旧副本）', () => {
  const root = makeProject()
  try {
    ensureCaseTemplates({ root, ...CASE_TEMPLATES })
    const casePath = join(root, '.workloom/templates/case.md')
    writeFileSync(casePath, '# local stale\n')
    const [err, result] = ensureCaseTemplates({ root, ...CASE_TEMPLATES })
    assert.equal(err, null)
    assert.ok(result)
    assert.deepEqual(result.created, [])
    assert.deepEqual(result.updated, ['.workloom/templates/case.md'])
    assert.equal(readFileSync(casePath, 'utf8'), CASE_TEMPLATES.caseTemplate)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('ensureCaseTemplates 单文件缺失只补缺失项，另一份一致不刷新', () => {
  const root = makeProject()
  try {
    ensureCaseTemplates({ root, ...CASE_TEMPLATES })
    rmSync(join(root, '.workloom/templates/case-result.md'))
    const [err, result] = ensureCaseTemplates({ root, ...CASE_TEMPLATES })
    assert.equal(err, null)
    assert.ok(result)
    assert.deepEqual(result.created, ['.workloom/templates/case-result.md'])
    assert.deepEqual(result.updated, [])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('ensureCaseTemplates root 可为根下子目录（内部定位 .workloom）', () => {
  const root = makeProject()
  try {
    const sub = join(root, 'src', 'deep')
    mkdirSync(sub, { recursive: true })
    const [err, result] = ensureCaseTemplates({ root: sub, ...CASE_TEMPLATES })
    assert.equal(err, null)
    assert.ok(result)
    assert.equal(result.root, root)
    assert.ok(existsSync(join(root, '.workloom/templates/case.md')))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('ensureCaseTemplates 无 .workloom 返回 err', () => {
  const root = mkdtempSync(join(tmpdir(), 'workloom-case-tpl-none-'))
  try {
    const [err, result] = ensureCaseTemplates({ root, ...CASE_TEMPLATES })
    assert.ok(err)
    assert.match(err.message, /no \.workloom found/)
    assert.equal(result, null)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
