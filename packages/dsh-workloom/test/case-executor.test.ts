import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  buildExecutorIncrementalPrompt,
  createCaseRecord,
  PARAM_DESCRIPTIONS,
  readTaskView,
  recordExecutorDispatch,
} from '@workloom-ai/core'
import { buildExecutorSchema } from '../src/dispatch/executor-schema.ts'
import { buildFullInjection } from '../src/dispatch/executor-injection.ts'

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
    assert.ok(full.text.includes('packages/core/resources/templates/case.md'))
    assert.ok(full.text.includes('packages/core/resources/templates/case-result.md'))
    const incremental = buildExecutorIncrementalPrompt({
      root, taskRelPath: REL, kind: 'check', userPrompt: 'execute', purpose: 'execution',
    })
    // 增量只追加本轮执行指令：不再追加确认哈希行，也不重复 CASE 全文
    assert.equal(incremental, 'execute')
    assert.ok(!incremental.includes('Confirmed CASE hash'))
    assert.ok(!incremental.includes(CASE_TEXT))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('DSH 超预算 CASE 明确失败，失败记录保留 purpose', () => {
  const root = makeRoot(8)
  try {
    assert.throws(
      () => buildFullInjection(root, REL, 'check', 'design', '', false, 'case-design'),
      /exceeding maxArtifactBytes=8/,
    )
    // 失败派发留痕（core 正式写口）：failed 记录保留 purpose 字段（审计可溯）；
    // 换新设计会话按 core 不变式要求带 fallbackOf 链回旧会话。
    const [recordErr] = recordExecutorDispatch(root, REL, {
      kind: 'check',
      title: 'design fail',
      childId: 'child-exec',
      status: 'failed',
      error: 'model unavailable',
      fallbackOf: 'child-design',
      purpose: 'case-design',
    })
    assert.equal(recordErr, null)
    const [, task] = readTaskView(root, REL)
    // case-design 派发不推进主线阶段（兼容读把旧值 implement 映射为 implementing）。
    assert.equal(task.stage, 'implementing')
    assert.equal(task.case.designSession, 'child-exec')
    const record = task.dispatches.find((entry) => entry.childId === 'child-exec')
    assert.equal(record.purpose, 'case-design')
    assert.equal(record.fallbackOf, 'child-design')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
