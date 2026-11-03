import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  buildExecutorIncrementalPrompt,
  computeCaseHash,
  createCaseRecord,
  readTask,
} from '@workloom-ai/core'
import { buildExecutorPromptWithPi, EXECUTOR_PARAMS, recordExecutorDispatchEntry } from '../src/executor.ts'

const REL = 'tasks/demo'
const CASE_TEXT = '# CASE custom marker\n'

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'workloom-pi-case-executor-'))
  const dir = join(root, '.workloom', REL)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(root, '.workloom', 'config.json'), '{}')
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

test('Pi purpose 参数、模板全文与增量摘要值', () => {
  assert.ok(JSON.stringify(EXECUTOR_PARAMS).includes('case-design'))
  assert.ok(!JSON.stringify(EXECUTOR_PARAMS).includes('fallback_models'))
  const root = makeRoot()
  try {
    const [err, built] = buildExecutorPromptWithPi({
      root, taskRelPath: REL, kind: 'check', userPrompt: 'design', purpose: 'case-design',
    }, false)
    assert.equal(err, null)
    assert.ok(built?.result.text.includes(CASE_TEXT))
    assert.ok(built?.result.text.includes('packages/assets/templates/case.md'))
    assert.ok(built?.result.text.includes('packages/assets/templates/case-result.md'))
    const incremental = buildExecutorIncrementalPrompt({
      root, taskRelPath: REL, kind: 'check', userPrompt: 'execute', purpose: 'execution',
    })
    assert.ok(incremental.startsWith('execute\n\nConfirmed CASE hash: '))
    assert.ok(!incremental.includes(CASE_TEXT))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('Pi case-design 记录保持 stage 并写 designSession', () => {
  const root = makeRoot()
  try {
    recordExecutorDispatchEntry(root, REL, {
      kind: 'check', title: 'design', childId: 'child-design', purpose: 'case-design',
    })
    const [, task] = readTask(root, REL)
    assert.ok(task)
    assert.equal(task.stage, 'implement')
    assert.equal(task.case?.designSession, 'child-design')
    assert.equal(task.dispatches[0]?.purpose, 'case-design')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

