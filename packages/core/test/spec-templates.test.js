/**
 * spec-templates 单测：模板落盘幂等、root 定位、收集器隔离（临时项目目录）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { ensureSpecTemplates } from '../dist/service/spec-templates.js'
import { collectSpecIndexes } from '../dist/legacy/spec-index.js'
import { loadConfig } from '../dist/legacy/config.js'

/** 模板入参样例。 */
const TEMPLATES = {
  indexTemplate: '# <package>/<layer> standards\n\n- <standard summary> — see <detail-file>.md\n',
  detailTemplate: '# <topic>\n\n- rule: <the rule>\n',
}

/** 创建临时项目根（含 .workloom/spec）。 */
function makeProject() {
  const root = mkdtempSync(join(tmpdir(), 'workloom-tpl-'))
  mkdirSync(join(root, '.workloom', 'spec'), { recursive: true })
  return root
}

test('模板幂等落盘到 .workloom/spec/.templates/', () => {
  const root = makeProject()
  try {
    const [err, result] = ensureSpecTemplates({ root, ...TEMPLATES })
    assert.equal(err, null)
    assert.ok(result)
    assert.equal(result.root, root)
    assert.deepEqual(result.created, [
      '.workloom/spec/.templates/spec-index.md',
      '.workloom/spec/.templates/spec-detail.md',
    ])
    const indexPath = join(root, '.workloom/spec/.templates/spec-index.md')
    assert.equal(readFileSync(indexPath, 'utf8'), TEMPLATES.indexTemplate)
    // 再次调用不覆盖（幂等）
    writeFileSync(indexPath, '# team custom\n')
    const [againErr, again] = ensureSpecTemplates({ root, ...TEMPLATES })
    assert.equal(againErr, null)
    assert.deepEqual(again.created, [])
    assert.equal(readFileSync(indexPath, 'utf8'), '# team custom\n')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('root 可为根下子目录（内部定位 .workloom）', () => {
  const root = makeProject()
  try {
    const sub = join(root, 'src', 'deep')
    mkdirSync(sub, { recursive: true })
    const [err, result] = ensureSpecTemplates({ root: sub, ...TEMPLATES })
    assert.equal(err, null)
    assert.ok(result)
    assert.equal(result.root, root)
    assert.ok(existsSync(join(root, '.workloom/spec/.templates/spec-index.md')))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('单文件已存在时只补缺失的另一文件且不覆盖', () => {
  const root = makeProject()
  try {
    const tplDir = join(root, '.workloom/spec/.templates')
    mkdirSync(tplDir, { recursive: true })
    const indexPath = join(tplDir, 'spec-index.md')
    writeFileSync(indexPath, '# team custom index\n')
    const [err, result] = ensureSpecTemplates({ root, ...TEMPLATES })
    assert.equal(err, null)
    assert.ok(result)
    assert.deepEqual(result.created, ['.workloom/spec/.templates/spec-detail.md'])
    assert.equal(readFileSync(indexPath, 'utf8'), '# team custom index\n')
    assert.equal(
      readFileSync(join(tplDir, 'spec-detail.md'), 'utf8'),
      TEMPLATES.detailTemplate,
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('无 .workloom 时返回 err', () => {
  const root = mkdtempSync(join(tmpdir(), 'workloom-tpl-none-'))
  try {
    const [err, result] = ensureSpecTemplates({ root, ...TEMPLATES })
    assert.ok(err)
    assert.match(err.message, /no \.workloom found/)
    assert.equal(result, null)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('.templates 目录不进 spec 索引', () => {
  const root = makeProject()
  try {
    ensureSpecTemplates({ root, ...TEMPLATES })
    // 再放一个真实规范，确认只有它进索引
    const indexDir = join(root, '.workloom', 'spec', 'cli', 'backend')
    mkdirSync(indexDir, { recursive: true })
    writeFileSync(join(indexDir, 'index.md'), '# cli backend\n')
    const [err, result] = collectSpecIndexes(root, loadConfig(root))
    assert.equal(err, null)
    assert.ok(result)
    assert.deepEqual(result.indexes, ['.workloom/spec/cli/backend/index.md'])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
