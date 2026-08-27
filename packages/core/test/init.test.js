/**
 * init 模块单测：骨架生成、config 模板可解析、幂等、developer 写入、.gitignore 生成、legacy 检测。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { initWorkloom } from '../dist/legacy/init.js'
import { DEFAULT_CONFIG, loadConfig } from '../dist/legacy/config.js'

/** 完整骨架路径清单（相对 root，与实现创建顺序一致）。 */
const SKELETON = [
  '.workloom',
  '.workloom/tasks',
  '.workloom/spec',
  '.workloom/workspace',
  '.workloom/.runtime/sessions',
  '.workloom/spec/README.md',
  '.workloom/config.yaml',
  '.workloom/.developer',
  '.workloom/.gitignore',
]

function makeRoot() {
  return mkdtempSync(join(tmpdir(), 'workloom-init-'))
}

test('未命中时生成完整骨架', () => {
  const root = makeRoot()
  try {
    const [err, result] = initWorkloom(root)
    assert.equal(err, null)
    assert.ok(result)
    for (const rel of SKELETON) {
      assert.ok(existsSync(join(root, rel)), `missing ${rel}`)
    }
    assert.deepEqual(result.created, SKELETON)
    assert.equal(result.root, root)
    assert.equal(result.developer, '')
    assert.equal(result.legacyTrellisRoot, null)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('.gitignore 模板含 .runtime/、.developer 与 config.local.yaml 忽略条目', () => {
  const root = makeRoot()
  try {
    const [err] = initWorkloom(root)
    assert.equal(err, null)
    const content = readFileSync(join(root, '.workloom', '.gitignore'), 'utf8')
    assert.ok(content.includes('.runtime/'), 'missing .runtime/ entry')
    assert.ok(content.includes('.developer'), 'missing .developer entry')
    assert.ok(content.includes('config.local.yaml'), 'missing config.local.yaml entry')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('config.yaml 模板可被 loadConfig 解析且等于默认值', () => {
  const root = makeRoot()
  try {
    initWorkloom(root)
    const config = loadConfig(root)
    assert.deepEqual(config, DEFAULT_CONFIG)
    assert.equal(config.promptInjection.skipKeyword, 'no-workloom')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('已存在 .workloom 且非 force 时返回 err（含已存在路径）', () => {
  const root = makeRoot()
  try {
    const [firstErr] = initWorkloom(root)
    assert.equal(firstErr, null)
    const [err, result] = initWorkloom(root)
    assert.ok(err)
    assert.match(err.message, /already exists/)
    assert.match(err.message, new RegExp(root))
    assert.equal(result, null)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('force 幂等补建且不覆盖已有 config.yaml', () => {
  const root = makeRoot()
  try {
    mkdirSync(join(root, '.workloom'))
    writeFileSync(join(root, '.workloom', 'config.yaml'), 'max_journal_lines: 500\n')
    const [err, result] = initWorkloom(root, { force: true })
    assert.equal(err, null)
    assert.ok(result)
    assert.equal(
      readFileSync(join(root, '.workloom', 'config.yaml'), 'utf8'),
      'max_journal_lines: 500\n',
    )
    assert.ok(existsSync(join(root, '.workloom', 'tasks')))
    assert.ok(!result.created.includes('.workloom/config.yaml'))
    assert.ok(result.created.includes('.workloom/tasks'))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('developer 写入 .workloom/.developer', () => {
  const root = makeRoot()
  try {
    const [err, result] = initWorkloom(root, { developer: 'alice' })
    assert.equal(err, null)
    assert.equal(readFileSync(join(root, '.workloom', '.developer'), 'utf8'), 'alice')
    assert.equal(result.developer, 'alice')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('检测旧 .trellis 目录并在结果中报告', () => {
  const root = makeRoot()
  try {
    mkdirSync(join(root, '.trellis'))
    const [err, result] = initWorkloom(root)
    assert.equal(err, null)
    assert.equal(result.legacyTrellisRoot, root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('spec/README.md 生成且 force 不覆盖已有内容', () => {
  const root = makeRoot()
  try {
    const [err] = initWorkloom(root)
    assert.equal(err, null)
    const readme = join(root, '.workloom', 'spec', 'README.md')
    assert.ok(readFileSync(readme, 'utf8').includes('# workloom spec'))
    writeFileSync(readme, '# team custom\n')
    const [forceErr] = initWorkloom(root, { force: true })
    assert.equal(forceErr, null)
    assert.equal(readFileSync(readme, 'utf8'), '# team custom\n')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('force 幂等不覆盖用户自定义的 .gitignore', () => {
  const root = makeRoot()
  try {
    const [err] = initWorkloom(root)
    assert.equal(err, null)
    const gitignore = join(root, '.workloom', '.gitignore')
    writeFileSync(gitignore, '# team custom\n*.local\n')
    const [forceErr, forceResult] = initWorkloom(root, { force: true })
    assert.equal(forceErr, null)
    assert.ok(forceResult)
    assert.equal(readFileSync(gitignore, 'utf8'), '# team custom\n*.local\n')
    assert.ok(!forceResult.created.includes('.workloom/.gitignore'))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('已有 .workloom 但缺 .gitignore 时 force 补建', () => {
  const root = makeRoot()
  try {
    const [err] = initWorkloom(root)
    assert.equal(err, null)
    rmSync(join(root, '.workloom', '.gitignore'))
    const [forceErr, forceResult] = initWorkloom(root, { force: true })
    assert.equal(forceErr, null)
    assert.ok(forceResult)
    assert.ok(existsSync(join(root, '.workloom', '.gitignore')))
    assert.ok(forceResult.created.includes('.workloom/.gitignore'))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('init developer 白名单校验（非法名报错）', () => {
  const root = mkdtempSync(join(tmpdir(), 'workloom-init-dev-'))
  try {
    const [badErr] = initWorkloom(root, { developer: '小王' })
    assert.ok(badErr)
    assert.match(badErr.message, /invalid developer name/)
    const [dotErr] = initWorkloom(root, { developer: '.hidden' })
    assert.ok(dotErr)
    const [okErr, okResult] = initWorkloom(root, { developer: 'xiao.bei-01' })
    assert.equal(okErr, null)
    assert.equal(readFileSync(join(root, '.workloom', '.developer'), 'utf8'), 'xiao.bei-01')
    assert.equal(okResult.developer, 'xiao.bei-01')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
