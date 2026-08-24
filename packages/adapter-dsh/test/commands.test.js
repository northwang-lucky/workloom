/**
 * commands 纯函数单测：init 参数解析与迁移摘要。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { migrationSummaryLines, parseInitArgs } from '../dist/commands.js'

test('parseInitArgs 精确 --purge 进入 purge 模式', () => {
  assert.deepEqual(parseInitArgs('--purge'), { purge: true, developer: '' })
  assert.deepEqual(parseInitArgs('  --purge  '), { purge: true, developer: '' })
})

test('parseInitArgs --purge 后带空格也进入 purge 模式', () => {
  assert.deepEqual(parseInitArgs('--purge now'), { purge: true, developer: '' })
})

test('parseInitArgs 类似前缀不误判为 purge', () => {
  assert.deepEqual(parseInitArgs('--purge-x'), { purge: false, developer: '--purge-x' })
  assert.deepEqual(parseInitArgs('--purgex'), { purge: false, developer: '--purgex' })
})

test('parseInitArgs 非 purge 输入视为 developer identity', () => {
  assert.deepEqual(parseInitArgs('alice'), { purge: false, developer: 'alice' })
  assert.deepEqual(parseInitArgs(''), { purge: false, developer: '' })
})

function summaryResult(overrides) {
  return {
    migrated: [],
    skipped: [],
    unsupported: [],
    droppedConfigFields: [],
    archivedWorkflow: null,
    legacyRemoved: false,
    legacyRoot: '/tmp/x',
    ...overrides,
  }
}

test('migrationSummaryLines 无新增时给已迁移措辞', () => {
  const lines = migrationSummaryLines(summaryResult({ migrated: [] }))
  assert.ok(lines[0].includes('Already migrated'))
})

test('migrationSummaryLines 完整摘要覆盖五项', () => {
  const lines = migrationSummaryLines(
    summaryResult({
      migrated: ['tasks', 'workspace'],
      skipped: ['tasks/08-01-demo'],
      droppedConfigFields: ['channel'],
      archivedWorkflow: '.workloom/migrated/trellis-workflow.md',
      legacyRemoved: false,
    }),
  )
  const joined = lines.join('\n')
  assert.match(joined, /Migrated: tasks, workspace/)
  assert.match(joined, /Skipped existing entries: 1/)
  assert.match(joined, /Dropped legacy config fields: channel/)
  assert.match(joined, /archived to .workloom\/migrated\/trellis-workflow.md/)
  assert.match(joined, /--purge/)
})
