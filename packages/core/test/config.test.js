/**
 * config 模块单测：默认值、覆盖、校验、容错。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { DEFAULT_CONFIG, loadConfig, WorkloomConfigError } from '../src/legacy/config.js'

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
