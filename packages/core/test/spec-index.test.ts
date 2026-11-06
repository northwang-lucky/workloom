/**
 * spec-index 单测：collectSpecIndexes 的收集/过滤/排序/截断边界（临时项目目录）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { collectSpecIndexes, MAX_GUIDELINES_BYTES } from '../src/injection/spec-index.js'
import {
  loadConfig,
} from '../src/workspace/config-load.ts'

// 测试隔离：core 三层配置的全局层读 $HOME/.workloom/config（调用链无 homeDir 注入
// 缝时吃 os.homedir 实时值）；本机真实全局配置会泄漏进单测。重定向 HOME 到临时目录
// 使全局层恒为空（与 config.test.ts 的 homeDir 注入、executor.test.ts 的重定向同口径）。
const isolatedHome = mkdtempSync(join(tmpdir(), 'workloom-core-home-'))
// TMPDIR 一并指向隔离目录：夹具临时目录随之落在 HOME 之内，findWorkloomRoot 的
// 上溯在 HOME 边界停下（与真实环境“家目录为上溯边界”的语义一致），不会误发现
// 本机真实家目录的 .workloom。
process.env.HOME = isolatedHome
process.env.TMPDIR = isolatedHome


/** 创建临时项目根（含 .workloom/spec）。 */
function makeProject() {
  const root = mkdtempSync(join(tmpdir(), 'workloom-spec-'))
  mkdirSync(join(root, '.workloom', 'spec'), { recursive: true })
  return root
}

/** 写入两级 index.md：spec/<pkg>/<layer>/index.md。 */
function addIndex(root, pkg, layer) {
  const dir = join(root, '.workloom', 'spec', pkg, layer)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'index.md'), `# ${pkg}/${layer}\n`)
}

/** 声明 packages 配置并落盘（config.json）。 */
function declarePackages(root, names) {
  const packages = Object.fromEntries(names.map((name) => [name, { path: '.' }]))
  writeFileSync(join(root, '.workloom', 'config.json'), JSON.stringify({ packages }, null, 2))
}

test('packages 未声明时全量收集且按 (package, layer) 字典序', () => {
  const root = makeProject()
  try {
    addIndex(root, 'zoo', 'backend')
    addIndex(root, 'api', 'frontend')
    addIndex(root, 'api', 'backend')
    const [err, result] = collectSpecIndexes(root, loadConfig(root))
    assert.equal(err, null)
    assert.ok(result)
    assert.deepEqual(result.indexes, [
      '.workloom/spec/api/backend/index.md',
      '.workloom/spec/api/frontend/index.md',
      '.workloom/spec/zoo/backend/index.md',
    ])
    assert.equal(result.truncated, 0)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('packages 声明子集时只收集声明包名的 spec', () => {
  const root = makeProject()
  try {
    addIndex(root, 'zoo', 'backend')
    addIndex(root, 'api', 'frontend')
    declarePackages(root, ['api'])
    const [err, result] = collectSpecIndexes(root, loadConfig(root))
    assert.equal(err, null)
    assert.ok(result)
    assert.deepEqual(result.indexes, ['.workloom/spec/api/frontend/index.md'])
    assert.equal(result.truncated, 0)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('声明的 package 在 spec 目录不存在时安静跳过', () => {
  const root = makeProject()
  try {
    declarePackages(root, ['ghost'])
    const [err, result] = collectSpecIndexes(root, loadConfig(root))
    assert.equal(err, null)
    assert.ok(result)
    assert.deepEqual(result.indexes, [])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('非两级形态与非法目录名不收集', () => {
  const root = makeProject()
  try {
    // 无 layer 的 index.md：布局不符，不收集。
    mkdirSync(join(root, '.workloom', 'spec', 'cli'))
    writeFileSync(join(root, '.workloom', 'spec', 'cli', 'index.md'), '# cli\n')
    // 有 layer 但缺 index.md：不收集。
    mkdirSync(join(root, '.workloom', 'spec', 'cli', 'backend'), { recursive: true })
    writeFileSync(join(root, '.workloom', 'spec', 'cli', 'backend', 'notes.md'), '# notes\n')
    // 非法目录名（空格）：跳过。
    addIndex(root, 'bad name', 'backend')
    const [err, result] = collectSpecIndexes(root, loadConfig(root))
    assert.equal(err, null)
    assert.ok(result)
    assert.deepEqual(result.indexes, [])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('spec 目录缺失按空处理（不算错误）', () => {
  const root = mkdtempSync(join(tmpdir(), 'workloom-spec-empty-'))
  try {
    mkdirSync(join(root, '.workloom'))
    const [err, result] = collectSpecIndexes(root, loadConfig(root))
    assert.equal(err, null)
    assert.ok(result)
    assert.deepEqual(result.indexes, [])
    assert.equal(result.truncated, 0)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('累计字节超预算截断并记余量', () => {
  const root = makeProject()
  try {
    // 单组件名 ≤255（文件系统上限），每条路径 535 字节：保留 15 条（8025），第 16 条起截断。
    const layer = 'layer-' + 'y'.repeat(249)
    for (let i = 0; i < 20; i += 1) {
      addIndex(root, `pkg-${String(i).padStart(2, '0')}-` + 'x'.repeat(248), layer)
    }
    const [err, result] = collectSpecIndexes(root, loadConfig(root))
    assert.equal(err, null)
    assert.ok(result)
    assert.equal(result.indexes.length, 15)
    assert.equal(result.truncated, 5)
    assert.equal(MAX_GUIDELINES_BYTES, 8192)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
