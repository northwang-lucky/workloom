// C2：非法迁移抽样探针（三要素可判定错误）。
import assert from 'node:assert/strict'
import { rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { core, makeRoot, satisfyStartDocs, LIGHT_MIN_PRD } from './probe-lib.mjs'

const { createTask, migrateTask, confirmPrd, confirmPlan, recordPlanReview } = core
const root = makeRoot('wl-c2-')
try {
  // 样本 1：standard 未做任何确认，从 aligning 直接请求进 implementing（跳过确认）。
  const [, s1] = await createTask(root, { title: 'C2 Std Skip Confirm' })
  const [e1] = migrateTask(root, { taskRelPath: s1.taskRelPath, to: 'implementing' })
  assert.ok(e1, 'sample1 must be rejected')
  console.log(`[c2] sample1 (skip confirmations -> implementing) rejected:\n  ${e1.message}`)
  assert.match(e1.message, /transition rejected/)
  assert.match(e1.message, /from stage "aligning"/)
  assert.match(e1.message, /to "implementing"/)
  assert.match(e1.message, /guard "prd-confirmed" failed/)

  // 样本 2：light 任务在 implementing 请求进 checking（light 无 checking 边）。
  const [, l2] = await createTask(root, { title: 'C2 Light Checking', mode: 'light' })
  writeFileSync(join(root, '.workloom', l2.taskRelPath, 'prd.md'), LIGHT_MIN_PRD)
  for (const to of ['planning', 'implementing']) {
    const [e] = migrateTask(root, { taskRelPath: l2.taskRelPath, to })
    assert.equal(e, null, e?.message)
  }
  const [e2] = migrateTask(root, { taskRelPath: l2.taskRelPath, to: 'checking' })
  assert.ok(e2, 'sample2 must be rejected')
  console.log(`[c2] sample2 (light implementing -> checking) rejected:\n  ${e2.message}`)
  assert.match(e2.message, /transition rejected/)
  assert.match(e2.message, /from stage "implementing"/)
  assert.match(e2.message, /to "checking"/)
  assert.match(e2.message, /mode light/)
  assert.match(e2.message, /no transition path in the table/)

  // 样本 3：standard 确认齐备且到 implementing，但 casePhase 未 approved 请求进 checking。
  const [, s3] = await createTask(root, { title: 'C2 Std No Case' })
  satisfyStartDocs(root, s3.taskRelPath)
  const [pe] = confirmPrd(root, s3.taskRelPath, { summary: 'converged' })
  assert.equal(pe, null, pe?.message)
  for (const to of ['reviewing', 'clean']) {
    const [e] = recordPlanReview(root, s3.taskRelPath, to)
    assert.equal(e, null, e?.message)
  }
  const [le] = confirmPlan(root, s3.taskRelPath, { summary: 'plan ok' })
  assert.equal(le, null, le?.message)
  const [se] = migrateTask(root, { taskRelPath: s3.taskRelPath, to: 'implementing' })
  assert.equal(se, null, se?.message)
  const [e3] = migrateTask(root, { taskRelPath: s3.taskRelPath, to: 'checking' })
  assert.ok(e3, 'sample3 must be rejected')
  console.log(`[c2] sample3 (standard casePhase=none -> checking) rejected:\n  ${e3.message}`)
  assert.match(e3.message, /transition rejected/)
  assert.match(e3.message, /from stage "implementing"/)
  assert.match(e3.message, /to "checking"/)
  assert.match(e3.message, /guard "case-approved" failed/)
  assert.match(e3.message, /CASE is not approved \(casePhase: none\)/)

  console.log('C2_OK: all three illegal transitions rejected with decidable errors (current stage, requested transition, reason)')
} finally {
  rmSync(root, { recursive: true, force: true })
}
