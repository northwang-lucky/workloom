import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  buildExecutorIncrementalPrompt,
  createCaseRecord,
  ensureCaseTemplates,
  loadCaseResultTemplateText,
  loadCaseTemplateText,
  PARAM_DESCRIPTIONS,
  readTaskView,
  recordExecutorDispatch,
} from '@workloom-ai/core'
import { buildExecutorSchema } from '../src/dispatch/executor-schema.ts'
import { buildFullInjection } from '../src/dispatch/executor-injection.ts'

// 测试隔离：core 三层配置的全局层读 $HOME/.workloom/config（调用链无 homeDir
// 注入缝）；本机真实全局配置会泄漏进单测（历史遗留字段即抛解析错误）。重定向
// HOME 与 TMPDIR 到隔离目录使全局层恒为空（与 executor.test.ts / core
// task-store.test.ts 同口径）。
const isolatedHome = mkdtempSync(join(tmpdir(), 'workloom-dsh-case-executor-home-'))
process.env.HOME = isolatedHome
process.env.TMPDIR = isolatedHome

const REL = 'tasks/demo'
const CASE_TEXT = '# CASE custom marker\n'

function makeRoot() {
  const root = mkdtempSync(join(tmpdir(), 'workloom-dsh-case-executor-'))
  const dir = join(root, '.workloom', REL)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'prd.md'), '# Demo\n\n## Requirements\n\n- R1: test\n\n## Acceptance Criteria\n\n- AC1: test\n')
  writeFileSync(join(dir, 'case.md'), CASE_TEXT)
  const caseRecord = createCaseRecord(true)
  caseRecord.designSession = 'child-design'
  writeFileSync(join(dir, 'task.json'), JSON.stringify({
    title: 'Demo', status: 'in_progress', mode: 'full', case: caseRecord,
    children: [], dispatches: [], overrides: [],
    hooks: { after_create: [], after_start: [], after_finish: [], after_archive: [] },
  }))
  // 模板副本随夹具播种（派发只读守卫前提）。
  const caseTemplate = loadCaseTemplateText()
  const caseResultTemplate = loadCaseResultTemplateText()
  assert.ok(caseTemplate !== null && caseResultTemplate !== null)
  const [seedErr] = ensureCaseTemplates({ root, caseTemplate, caseResultTemplate })
  assert.equal(seedErr, null)
  return root
}

test('DSH purpose schema 与全量/增量 CASE 注入', () => {
  const properties = buildExecutorSchema(PARAM_DESCRIPTIONS).properties
  // purpose 值域三值：checker 收 case-design/execution，judger 收 plan-review（评审 #12）。
  assert.deepEqual(properties.purpose.enum, ['case-design', 'execution', 'plan-review'])
  const root = makeRoot()
  try {
    const full = buildFullInjection(root, REL, 'checker', 'design', '', false, 'case-design')
    // 纯指针：CASE 与模板副本只给路径，全文不进注入。
    assert.ok(full.text.includes('- .workloom/tasks/demo/case.md'))
    assert.ok(full.text.includes('- .workloom/templates/case.md'))
    assert.ok(full.text.includes('- .workloom/templates/case-result.md'))
    assert.ok(!full.text.includes(CASE_TEXT))
    assert.equal(full.stats.filesInlined, 0)
    const incremental = buildExecutorIncrementalPrompt({
      root, taskRelPath: REL, role: 'checker', userPrompt: 'execute', purpose: 'execution',
    })
    // 增量只追加本轮执行指令：不再追加确认哈希行，也不重复 CASE 全文
    assert.equal(incremental, 'execute')
    assert.ok(!incremental.includes('Confirmed CASE hash'))
    assert.ok(!incremental.includes(CASE_TEXT))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('DSH 模板副本缺失明确失败，失败记录保留 purpose（超预算路径已随指针化退役）', () => {
  const root = makeRoot()
  try {
    // CASE 全文不再内联，超预算不再触发失败；改由模板副本缺失触发派发拒绝，
    // 继续保护「失败派发记录保留 purpose」这条审计不变式。
    assert.equal(existsSync(join(root, '.workloom', 'templates', 'case.md')), true)
    rmSync(join(root, '.workloom', 'templates'), { recursive: true, force: true })
    assert.throws(
      () => buildFullInjection(root, REL, 'checker', 'design', '', false, 'case-design'),
      /rerun workloom init/,
    )
    // 失败派发留痕（core 正式写口）：failed 记录保留 purpose 字段（审计可溯）；
    // 换新设计会话按 core 不变式要求带 fallbackOf 链回旧会话。
    const [recordErr] = recordExecutorDispatch(root, REL, {
      kind: 'checker',
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
