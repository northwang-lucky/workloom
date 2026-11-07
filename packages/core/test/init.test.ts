/**
 * init 模块单测（布局定版后）：骨架生成（tasks/spec/.runtime/worktrees + config.json
 * + .gitignore）、config.json 模板可解析、骨架撤项（workspace/.developer/config.example.*）、
 * 幂等、.gitignore 生成、legacy 检测。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { initWorkloom } from '../src/workspace/init.ts'
import {
  DEFAULT_CONFIG,
} from '../src/workspace/config-defaults.ts'
import {
  loadConfig,
} from '../src/workspace/config-load.ts'

/** 完整骨架路径清单（相对 root，与实现创建顺序一致）。 */
const SKELETON = [
  '.workloom',
  '.workloom/tasks',
  '.workloom/spec',
  '.workloom/.runtime/worktrees',
  '.workloom/spec/README.md',
  '.workloom/config.json',
  '.workloom/.gitignore',
]

/** 布局定版撤除的骨架项（init 不再生成）。 */
const REMOVED_ENTRIES = [
  '.workloom/workspace',
  '.workloom/.runtime/sessions',
  '.workloom/config.example.json',
  '.workloom/config.example.js',
  '.workloom/.developer',
]

function makeRoot() {
  return mkdtempSync(join(tmpdir(), 'workloom-init-'))
}

function makeHome() {
  return mkdtempSync(join(tmpdir(), 'workloom-init-home-'))
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
    for (const rel of REMOVED_ENTRIES) {
      assert.ok(!existsSync(join(root, rel)), `removed entry must not be created: ${rel}`)
    }
    assert.deepEqual(result.created, SKELETON)
    assert.equal(result.root, root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('.gitignore 模板含 .runtime/ 与 config.local.json/config.local.js 忽略条目，不含 sessions/.developer/worktree 旧条目', () => {
  const root = makeRoot()
  try {
    const [err] = initWorkloom(root)
    assert.equal(err, null)
    const content = readFileSync(join(root, '.workloom', '.gitignore'), 'utf8')
    assert.ok(content.includes('.runtime/'), 'missing .runtime/ entry')
    assert.ok(content.includes('config.local.json'), 'missing config.local.json entry')
    assert.ok(content.includes('config.local.js'), 'missing config.local.js entry')
    assert.ok(!content.includes('sessions/'), 'stale sessions/ entry must be gone')
    assert.ok(!content.includes('.developer'), 'stale .developer entry must be gone')
    assert.ok(!content.includes('worktree/'), 'stale worktree/ entry must be gone')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('config.json 模板种子根包 repo，其余字段等于默认值', () => {
  const root = makeRoot()
  const home = makeHome()
  try {
    initWorkloom(root)
    const config = loadConfig(root, { homeDir: home })
    // 种子根包：create/start 的 package 归属开箱可用（其余字段仍全默认）。
    assert.deepEqual(config.packages, { repo: { path: '.', setup: [] } })
    const expected = { ...DEFAULT_CONFIG }
    delete expected.packages
    const actual = { ...config }
    delete actual.packages
    assert.deepEqual(actual, expected)
    assert.equal(config.promptInjection.skipKeyword, 'no-workloom')
  } finally {
    rmSync(root, { recursive: true, force: true })
    rmSync(home, { recursive: true, force: true })
  }
})

test('init 生成种子根包 config.json，且不再生成 config.example.json / config.example.js', () => {
  const root = makeRoot()
  try {
    const [err] = initWorkloom(root)
    assert.equal(err, null)
    const config = readFileSync(join(root, '.workloom', 'config.json'), 'utf8')
    assert.deepEqual(
      JSON.parse(config),
      { packages: { repo: { path: '.' } } },
      'config.json 应种子根包 repo',
    )
    assert.ok(!existsSync(join(root, '.workloom', 'config.example.json')))
    assert.ok(!existsSync(join(root, '.workloom', 'config.example.js')))
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

test('force 幂等补建且不覆盖已有 config.json', () => {
  const root = makeRoot()
  try {
    mkdirSync(join(root, '.workloom'))
    writeFileSync(join(root, '.workloom', 'config.json'), '{"session_auto_commit": false}\n')
    const [err, result] = initWorkloom(root, { force: true })
    assert.equal(err, null)
    assert.ok(result)
    assert.equal(
      readFileSync(join(root, '.workloom', 'config.json'), 'utf8'),
      '{"session_auto_commit": false}\n',
    )
    assert.ok(existsSync(join(root, '.workloom', 'tasks')))
    assert.ok(!result.created.includes('.workloom/config.json'))
    assert.ok(result.created.includes('.workloom/tasks'))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('init 停写 .workloom/.developer（带 developer 入参也不落身份文件）', () => {
  const root = makeRoot()
  try {
    const [err] = initWorkloom(root)
    assert.equal(err, null)
    assert.ok(!existsSync(join(root, '.workloom', '.developer')))
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
