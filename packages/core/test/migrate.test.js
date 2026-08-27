/**
 * migrate 模块单测：目录迁移、冲突跳过、config 映射、workflow 存档、
 * deleteLegacy 开关、前置条件错误。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { initWorkloom } from '../dist/legacy/init.js'
import { migrateLegacyTrellis } from '../dist/legacy/migrate.js'
import { loadConfig } from '../dist/legacy/config.js'

function makeRoot() {
  return mkdtempSync(join(tmpdir(), 'workloom-migrate-'))
}

/** 在 root 下构建一个旧 .trellis 项目（tasks/workspace/spec/workflow）。 */
function seedLegacy(root) {
  mkdirSync(join(root, '.trellis', 'tasks', '09-01-demo'), { recursive: true })
  writeFileSync(join(root, '.trellis', 'tasks', '09-01-demo', 'task.json'), '{"title": "demo"}\n')
  mkdirSync(join(root, '.trellis', 'tasks', 'archive', '2024-08', 'old'), { recursive: true })
  writeFileSync(
    join(root, '.trellis', 'tasks', 'archive', '2024-08', 'old', 'task.json'),
    '{"title": "old"}\n',
  )
  mkdirSync(join(root, '.trellis', 'workspace'), { recursive: true })
  writeFileSync(join(root, '.trellis', 'workspace', 'research.md'), '# research\n')
  mkdirSync(join(root, '.trellis', 'spec'), { recursive: true })
  writeFileSync(join(root, '.trellis', 'spec', 'req.md'), '# requirements\n')
  writeFileSync(join(root, '.trellis', 'workflow.md'), '# Custom workflow\n')
}

test('完整迁移：tasks/workspace/spec 内容复制、workflow 存档、默认保留旧目录', () => {
  const root = makeRoot()
  try {
    initWorkloom(root)
    seedLegacy(root)
    const [err, result] = migrateLegacyTrellis(root)
    assert.equal(err, null)
    assert.deepEqual(result.migrated, ['.workloom/tasks', '.workloom/workspace', '.workloom/spec'])
    assert.deepEqual(result.skipped, [])
    assert.equal(result.legacyRemoved, false)
    assert.equal(result.archivedWorkflow, '.workloom/migrated/trellis-workflow.md')
    assert.equal(
      readFileSync(join(root, '.workloom/tasks/09-01-demo/task.json'), 'utf8'),
      '{"title": "demo"}\n',
    )
    assert.equal(
      readFileSync(join(root, '.workloom/tasks/archive/2024-08/old/task.json'), 'utf8'),
      '{"title": "old"}\n',
    )
    assert.equal(
      readFileSync(join(root, '.workloom/workspace/research.md'), 'utf8'),
      '# research\n',
    )
    assert.equal(readFileSync(join(root, '.workloom/spec/req.md'), 'utf8'), '# requirements\n')
    assert.equal(
      readFileSync(join(root, '.workloom/migrated/trellis-workflow.md'), 'utf8'),
      '# Custom workflow\n',
    )
    assert.ok(existsSync(join(root, '.trellis')))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('冲突跳过：目标已存在同名条目不覆盖并记入 skipped', () => {
  const root = makeRoot()
  try {
    initWorkloom(root)
    mkdirSync(join(root, '.workloom', 'tasks', '09-01-demo'), { recursive: true })
    writeFileSync(join(root, '.workloom', 'tasks', '09-01-demo', 'task.json'), '{"keep": true}\n')
    mkdirSync(join(root, '.trellis', 'tasks', '09-01-demo'), { recursive: true })
    writeFileSync(join(root, '.trellis', 'tasks', '09-01-demo', 'task.json'), '{"replace": true}\n')
    mkdirSync(join(root, '.trellis', 'workspace'), { recursive: true })
    writeFileSync(join(root, '.trellis', 'workspace', 'note.md'), 'n\n')
    const [err, result] = migrateLegacyTrellis(root)
    assert.equal(err, null)
    assert.ok(result.skipped.includes('.workloom/tasks/09-01-demo'))
    // tasks 区域全部冲突跳过：新语义下不计入 migrated；workspace 有新写入才计入
    assert.ok(!result.migrated.includes('.workloom/tasks'))
    assert.ok(result.migrated.includes('.workloom/workspace'))
    assert.equal(
      readFileSync(join(root, '.workloom/tasks/09-01-demo/task.json'), 'utf8'),
      '{"keep": true}\n',
    )
    assert.equal(readFileSync(join(root, '.workloom/workspace/note.md'), 'utf8'), 'n\n')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('config 映射：已知字段迁移、no-trellis 改写、未知字段丢弃', () => {
  const root = makeRoot()
  try {
    initWorkloom(root)
    mkdirSync(join(root, '.trellis'), { recursive: true })
    writeFileSync(
      join(root, '.trellis', 'config.yaml'),
      [
        'session_commit_message: "feat: commit"',
        'max_journal_lines: 500',
        'session_auto_commit: false',
        'context_injection:',
        '  max_file_bytes: 1024',
        'prompt_injection:',
        '  skip_keyword: "no-trellis"',
        'hooks:',
        '  after_create:',
        '    - "echo hi"',
        'packages:',
        '  cli:',
        '    path: packages/cli',
        'default_package: cli',
        'channel: slack',
        'codex: true',
        '',
      ].join('\n'),
    )
    const [err, result] = migrateLegacyTrellis(root)
    assert.equal(err, null)
    assert.deepEqual(result.droppedConfigFields, ['channel', 'codex'])
    const config = loadConfig(root)
    assert.equal(config.sessionCommitMessage, 'feat: commit')
    assert.equal(config.maxJournalLines, 500)
    assert.equal(config.sessionAutoCommit, false)
    assert.equal(config.contextInjection.maxFileBytes, 1024)
    assert.equal(config.promptInjection.skipKeyword, 'no-workloom')
    assert.deepEqual(config.hooks.afterCreate, ['echo hi'])
    assert.deepEqual(config.packages, { cli: { path: 'packages/cli' } })
    assert.equal(config.defaultPackage, 'cli')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('自定义 skip_keyword 原样保留', () => {
  const root = makeRoot()
  try {
    initWorkloom(root)
    mkdirSync(join(root, '.trellis'), { recursive: true })
    writeFileSync(
      join(root, '.trellis', 'config.yaml'),
      'prompt_injection:\n  skip_keyword: "pause"\n',
    )
    const [err] = migrateLegacyTrellis(root)
    assert.equal(err, null)
    assert.equal(loadConfig(root).promptInjection.skipKeyword, 'pause')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('config 全默认时不覆盖 init 模板', () => {
  const root = makeRoot()
  try {
    initWorkloom(root)
    mkdirSync(join(root, '.trellis'), { recursive: true })
    writeFileSync(
      join(root, '.trellis', 'config.yaml'),
      'session_commit_message: "chore: record journal"\n',
    )
    const [err] = migrateLegacyTrellis(root)
    assert.equal(err, null)
    assert.equal(readFileSync(join(root, '.workloom/config.yaml'), 'utf8').trim(), '')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('deleteLegacy=true 迁移后删除旧 .trellis', () => {
  const root = makeRoot()
  try {
    initWorkloom(root)
    seedLegacy(root)
    const [err, result] = migrateLegacyTrellis(root, { deleteLegacy: true })
    assert.equal(err, null)
    assert.equal(result.legacyRemoved, true)
    assert.equal(existsSync(join(root, '.trellis')), false)
    assert.ok(existsSync(join(root, '.workloom/tasks/09-01-demo/task.json')))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('deleteLegacy 默认 false 保留旧 .trellis', () => {
  const root = makeRoot()
  try {
    initWorkloom(root)
    seedLegacy(root)
    const [err, result] = migrateLegacyTrellis(root)
    assert.equal(err, null)
    assert.equal(result.legacyRemoved, false)
    assert.ok(existsSync(join(root, '.trellis')))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('workflow.md 存档目标已存在时跳过并记入 skipped', () => {
  const root = makeRoot()
  try {
    initWorkloom(root)
    seedLegacy(root)
    mkdirSync(join(root, '.workloom', 'migrated'), { recursive: true })
    writeFileSync(join(root, '.workloom', 'migrated', 'trellis-workflow.md'), 'existing\n')
    const [err, result] = migrateLegacyTrellis(root)
    assert.equal(err, null)
    assert.ok(result.skipped.includes('.workloom/migrated/trellis-workflow.md'))
    assert.equal(result.archivedWorkflow, '.workloom/migrated/trellis-workflow.md')
    assert.equal(
      readFileSync(join(root, '.workloom/migrated/trellis-workflow.md'), 'utf8'),
      'existing\n',
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('无旧 .trellis 目录返回 err', () => {
  const root = makeRoot()
  try {
    initWorkloom(root)
    const [err, result] = migrateLegacyTrellis(root)
    assert.ok(err)
    assert.match(err.message, /no legacy \.trellis directory found/)
    assert.equal(result, null)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('无 .workloom 目录返回 err（run init first）', () => {
  const root = makeRoot()
  try {
    mkdirSync(join(root, '.trellis'), { recursive: true })
    const [err, result] = migrateLegacyTrellis(root)
    assert.ok(err)
    assert.match(err.message, /run init first/)
    assert.equal(result, null)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('二次迁移幂等：migrated 为空、冲突条目全记 skipped', () => {
  const root = makeRoot()
  try {
    initWorkloom(root)
    // 预置 legacy 数据并完整迁移一次
    mkdirSync(join(root, '.trellis', 'tasks', '09-02-demo'), { recursive: true })
    writeFileSync(join(root, '.trellis', 'tasks', '09-02-demo', 'task.json'), '{}\n')
    mkdirSync(join(root, '.trellis', 'spec'), { recursive: true })
    writeFileSync(join(root, '.trellis', 'spec', 'note.md'), 'n\n')
    const [firstErr, first] = migrateLegacyTrellis(root)
    assert.equal(firstErr, null)
    assert.ok(first.migrated.includes('.workloom/tasks'))
    // 二次迁移：全部条目已存在 → migrated 为空、skipped 计数
    const [secondErr, second] = migrateLegacyTrellis(root)
    assert.equal(secondErr, null)
    assert.deepEqual(second.migrated, [])
    assert.equal(second.skipped.length, 2)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
