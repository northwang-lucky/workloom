/**
 * init 模块单测：骨架生成、config 模板可解析、幂等、developer 写入、legacy 检测。
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
  '.workloom/config.yaml',
  '.workloom/.developer',
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
