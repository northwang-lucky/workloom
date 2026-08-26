/**
 * config 模块单测：默认值、覆盖、校验、容错。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  DEFAULT_CONFIG,
  loadConfig,
  resolveSubagentDefaults,
  WorkloomConfigError,
} from '../src/legacy/config.js'

function makeRoot(configText) {
  const root = mkdtempSync(join(tmpdir(), 'workloom-config-'))
  mkdirSync(join(root, '.workloom'))
  if (configText !== undefined) {
    writeFileSync(join(root, '.workloom', 'config.yaml'), configText)
  }
  return root
}

test('config.yaml 缺失时返回全默认', () => {
  const root = makeRoot()
  try {
    const config = loadConfig(root)
    assert.deepEqual(config, DEFAULT_CONFIG)
    assert.equal(config.promptInjection.skipKeyword, 'no-workloom')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('字段覆盖与布尔词解析', () => {
  const root = makeRoot(`
max_journal_lines: 500
session_auto_commit: "off"
session_commit_message: "chore: journal"
prompt_injection:
  skip_keyword: ""
`)
  try {
    const config = loadConfig(root)
    assert.equal(config.maxJournalLines, 500)
    assert.equal(config.sessionAutoCommit, false)
    assert.equal(config.sessionCommitMessage, 'chore: journal')
    assert.equal(config.promptInjection.skipKeyword, '')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('非法值显式抛错', () => {
  const root = makeRoot('max_journal_lines: -1\n')
  try {
    assert.throws(() => loadConfig(root), WorkloomConfigError)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('未知字段容错忽略（旧平台字段向前兼容）', () => {
  const root = makeRoot(`
channel:
  worker_guard:
    idle_timeout: 5m
codex:
  dispatch_mode: auto
`)
  try {
    const config = loadConfig(root)
    assert.deepEqual(config, DEFAULT_CONFIG)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('packages 映射与 hooks 解析', () => {
  const root = makeRoot(`
packages:
  cli:
    path: packages/cli
  web:
    path: ./web
    git: true
hooks:
  after_create:
    - "echo created"
`)
  try {
    const config = loadConfig(root)
    assert.equal(config.packages.cli.path, 'packages/cli')
    assert.equal(config.packages.web.git, true)
    assert.deepEqual(config.hooks.afterCreate, ['echo created'])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('subagents 合法解析：完整字段、仅 model、仅 effort、空 map', () => {
  const root = makeRoot(`
subagents:
  research:
    model: deepseek-v4-flash
    effort: high
  implement:
    model: deepseek-v4-pro
  check:
    effort: medium
  empty: {}
`)
  try {
    const config = loadConfig(root)
    assert.deepEqual(config.subagents.research, { model: 'deepseek-v4-flash', effort: 'high' })
    assert.deepEqual(config.subagents.implement, { model: 'deepseek-v4-pro' })
    assert.deepEqual(config.subagents.check, { effort: 'medium' })
    assert.deepEqual(config.subagents.empty, {})
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('subagents 缺失时默认空对象', () => {
  const root = makeRoot('')
  try {
    const config = loadConfig(root)
    assert.deepEqual(config.subagents, {})
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('subagents 顶层非 map 抛错', () => {
  const root = makeRoot('subagents: 5\n')
  try {
    assert.throws(
      () => loadConfig(root),
      (error) => {
        assert.ok(error instanceof WorkloomConfigError)
        assert.equal(error.field, 'subagents')
        return true
      },
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('subagents 结构非法抛 WorkloomConfigError（带字段路径）', () => {
  const cases = [
    { text: 'subagents:\n  research: 5\n', field: 'subagents.research' },
    { text: 'subagents:\n  research:\n    model: 5\n', field: 'subagents.research.model' },
    { text: 'subagents:\n  research:\n    effort: 5\n', field: 'subagents.research.effort' },
  ]
  for (const { text, field } of cases) {
    const root = makeRoot(text)
    try {
      assert.throws(
        () => loadConfig(root),
        (error) => {
          assert.ok(error instanceof WorkloomConfigError)
          assert.equal(error.field, field)
          return true
        },
      )
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }
})

test('subagents 未知 key 结构合法不抛错且保留', () => {
  const root = makeRoot(`
subagents:
  research:
    model: deepseek-v4-flash
  future_kind:
    effort: high
  typo_kind:
    model: x
`)
  try {
    const config = loadConfig(root)
    assert.equal(config.subagents.research.model, 'deepseek-v4-flash')
    assert.deepEqual(config.subagents.future_kind, { effort: 'high' })
    assert.deepEqual(config.subagents.typo_kind, { model: 'x' })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('resolveSubagentDefaults：参数覆盖配置（字段独立合并）', () => {
  const config = { subagents: { research: { model: 'm-config', effort: 'high' } } }
  const byModel = resolveSubagentDefaults(config, 'research', { model: 'm-tool' })
  assert.deepEqual(byModel, { model: 'm-tool', effort: 'high' })
  const byEffort = resolveSubagentDefaults(config, 'research', { effort: 'max' })
  assert.deepEqual(byEffort, { model: 'm-config', effort: 'max' })
})

test('resolveSubagentDefaults：无参数回退配置', () => {
  const config = { subagents: { research: { model: 'm-config', effort: 'high' } } }
  const effective = resolveSubagentDefaults(config, 'research', {})
  assert.deepEqual(effective, { model: 'm-config', effort: 'high' })
})

test('resolveSubagentDefaults：均无配置时返回 undefined 字段', () => {
  const config = { subagents: {} }
  const effective = resolveSubagentDefaults(config, 'research', {})
  assert.deepEqual(effective, { model: undefined, effort: undefined })
})

test('resolveSubagentDefaults：未知 kind 均 undefined', () => {
  const config = { subagents: { research: { model: 'm', effort: 'high' } } }
  const effective = resolveSubagentDefaults(config, 'bogus', {})
  assert.deepEqual(effective, { model: undefined, effort: undefined })
})

test('resolveSubagentDefaults：不修改入参', () => {
  const config = { subagents: { research: { model: 'm', effort: 'high' } } }
  const before = structuredClone(config)
  resolveSubagentDefaults(config, 'research', { model: 'm-tool', effort: 'max' })
  assert.deepEqual(config, before)
})
