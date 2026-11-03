import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  buildExecutorIncrementalPrompt,
  computeCaseHash,
  createCaseRecord,
  PARAM_DESCRIPTIONS,
  readTask,
} from '@workloom-ai/core'
import { buildExecutorSchema } from '../dist/executor-schema.js'
import { buildFullInjection } from '../dist/executor-injection.js'
import { recordFailedDispatchAttempt } from '../dist/executor-failover-chain.js'

const REL = 'tasks/demo'
const CASE_TEXT = '# CASE custom marker\n'

function makeRoot(maxArtifactBytes = 0) {
  const root = mkdtempSync(join(tmpdir(), 'workloom-dsh-case-executor-'))
  const dir = join(root, '.workloom', REL)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(root, '.workloom', 'config.json'), JSON.stringify({ context_injection: { max_artifact_bytes: maxArtifactBytes } }))
  writeFileSync(join(dir, 'prd.md'), '# Demo\n\n## Requirements\n\n- R1: test\n\n## Acceptance Criteria\n\n- AC1: test\n')
  writeFileSync(join(dir, 'case.md'), CASE_TEXT)
  const caseRecord = createCaseRecord(true)
  caseRecord.designSession = 'child-design'
  caseRecord.caseHash = computeCaseHash(CASE_TEXT)
  writeFileSync(join(dir, 'task.json'), JSON.stringify({
    title: 'Demo', status: 'in_progress', mode: 'full', case: caseRecord,
    children: [], dispatches: [], overrides: [],
    hooks: { after_create: [], after_start: [], after_finish: [], after_archive: [] },
  }))
  return root
}

test('DSH purpose schema 与全量/增量 CASE 注入', () => {
  const properties = buildExecutorSchema(PARAM_DESCRIPTIONS).properties
  assert.deepEqual(properties.purpose.enum, ['case-design', 'execution'])
  const root = makeRoot()
  try {
    const full = buildFullInjection(root, REL, 'check', 'design', '', false, 'case-design')
    assert.ok(full.text.includes(CASE_TEXT))
    assert.ok(full.text.includes('packages/assets/templates/case.md'))
    assert.ok(full.text.includes('packages/assets/templates/case-result.md'))
    const incremental = buildExecutorIncrementalPrompt({
      root, taskRelPath: REL, kind: 'check', userPrompt: 'execute', purpose: 'execution',
    })
    assert.ok(incremental.startsWith('execute\n\nConfirmed CASE hash: '))
    assert.ok(!incremental.includes(CASE_TEXT))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('DSH 超预算 CASE 明确失败，失败记录保留 purpose/fallbackOf', () => {
  const root = makeRoot(8)
  try {
    assert.throws(
      () => buildFullInjection(root, REL, 'check', 'design', '', false, 'case-design'),
      /exceeding maxArtifactBytes=8/,
    )
    recordFailedDispatchAttempt({
      root,
      taskRelPath: REL,
      kind: 'check',
      title: 'design failover',
      childId: 'child-exec',
      error: new Error('model unavailable'),
      fallbackOf: 'child-design',
      fallbackAttempt: 2,
      purpose: 'case-design',
    })
    const [, task] = readTask(root, REL)
    assert.equal(task.stage, 'implement')
    assert.equal(task.case.designSession, 'child-exec')
    const record = task.dispatches.find((entry) => entry.childId === 'child-exec')
    assert.equal(record.purpose, 'case-design')
    assert.equal(record.fallbackOf, 'child-design')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
