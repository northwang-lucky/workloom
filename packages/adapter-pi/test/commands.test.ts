/**
 * commands.ts 纯函数单测：parseInitArgs 与 migrationSummaryLines。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import type { MigrateLegacyTrellisResult } from '@workloom/core'

import { migrationSummaryLines, parseInitArgs } from '../src/commands.ts'

/** 构造最小迁移结果（未覆盖字段取默认）。 */
function resultOf(overrides: Partial<MigrateLegacyTrellisResult>): MigrateLegacyTrellisResult {
  return {
    migrated: [],
    skipped: [],
    unsupported: [],
    droppedConfigFields: [],
    archivedWorkflow: null,
    legacyRemoved: false,
    legacyRoot: '/tmp/project',
    ...overrides,
  }
}

test('parseInitArgs: exact --purge enables purge mode', () => {
  assert.deepEqual(parseInitArgs('--purge'), { purge: true, developer: '' })
})

test('parseInitArgs: --purge followed by args enables purge mode', () => {
  assert.deepEqual(parseInitArgs('--purge extra args'), { purge: true, developer: '' })
})

test('parseInitArgs: plain text is a developer identity', () => {
  assert.deepEqual(parseInitArgs('alice'), { purge: false, developer: 'alice' })
})

test('parseInitArgs: prefix-lookalike is not treated as purge', () => {
  assert.deepEqual(parseInitArgs('--purgex'), { purge: false, developer: '--purgex' })
})

test('migrationSummaryLines: empty migrated uses Already-migrated wording', () => {
  const lines = migrationSummaryLines(resultOf({}))
  assert.ok((lines[0] ?? '').includes('Already migrated'))
})

test('migrationSummaryLines: migrated with combined field lines', () => {
  const lines = migrationSummaryLines(
    resultOf({
      migrated: ['.workloom/tasks'],
      skipped: ['.workloom/config.yaml'],
      unsupported: ['.trellis/workflow.md'],
      droppedConfigFields: ['channel'],
      archivedWorkflow: '.trellis/workflow.md',
      legacyRemoved: true,
    }),
  )
  assert.ok((lines[0] ?? '').includes('Migrated: .workloom/tasks'))
  assert.ok(lines.some((line) => line.includes('Skipped existing entries: 1')))
  assert.ok(lines.some((line) => line.includes('Unsupported entries')))
  assert.ok(lines.some((line) => line.includes('Dropped legacy config fields: channel')))
  assert.ok(lines.some((line) => line.includes('Legacy workflow.md archived')))
  assert.ok(lines.some((line) => line.includes('Legacy .trellis directory was removed.')))
})

test('migrationSummaryLines: legacy kept wording when not removed', () => {
  const lines = migrationSummaryLines(resultOf({ legacyRemoved: false }))
  assert.ok(lines.some((line) => line.includes('--purge to delete it')))
})
