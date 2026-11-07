// C4：序列守卫探针（standard 的 checking 进入、light 无 CASE 轨道、parent 的 integrating 进入）。
import assert from 'node:assert/strict'
import { rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { core, makeRoot, satisfyStartDocs, LIGHT_MIN_PRD } from './probe-lib.mjs'

const { createTask, migrateTask, confirmPrd, confirmPlan, recordCasePhase, recordPlanReview, checkTask, TRANSITIONS } = core
const root = makeRoot('wl-c4-')
try {
  // 1. standard：casePhase 未批准时 checking 进入失败，批准后通过。
  const [, s] = await createTask(root, { title: 'C4 Std Sequence', autonomy: 'auto' })
  const rel = s.taskRelPath
  satisfyStartDocs(root, rel)
  assert.equal(confirmPrd(root, rel, {})[0], null)
  for (const to of ['reviewing', 'clean']) assert.equal(recordPlanReview(root, rel, to)[0], null)
  assert.equal(confirmPlan(root, rel, {})[0], null)
  assert.equal(migrateTask(root, { taskRelPath: rel, to: 'implementing' })[0], null)

  const [eNone] = migrateTask(root, { taskRelPath: rel, to: 'checking' })
  assert.ok(eNone)
  assert.match(eNone.message, /guard "case-approved" failed/)
  assert.match(eNone.message, /casePhase: none/)
  console.log(`[c4] standard checking entry with casePhase=none rejected: guard case-approved (${eNone.message.slice(0, 120)}...)`)

  assert.equal(recordCasePhase(root, rel, 'designing')[0], null)
  assert.equal(recordCasePhase(root, rel, 'reviewing')[0], null)
  const [eRev] = migrateTask(root, { taskRelPath: rel, to: 'checking' })
  assert.ok(eRev)
  assert.match(eRev.message, /casePhase: reviewing/)
  console.log('[c4] standard checking entry with casePhase=reviewing still rejected')

  assert.equal(recordCasePhase(root, rel, 'approved')[0], null)
  const [okErr, okRes] = migrateTask(root, { taskRelPath: rel, to: 'checking' })
  assert.equal(okErr, null, okErr?.message)
  assert.equal(okRes.view.stage, 'checking')
  console.log('[c4] standard checking entry with casePhase=approved passed -> checking')

  // 2. light：迁移表无 checking 相关边、无 CASE 守卫；implementing→archived 直达边存在。
  const lightEdges = TRANSITIONS.filter((entry) => entry.mode === 'light')
  assert.ok(lightEdges.length > 0)
  assert.ok(!lightEdges.some((entry) => entry.to === 'checking' || entry.from === 'checking'))
  // case.md 口径：light 无 case-approved 守卫挂载（归档边的 case-outcome-ready 对无 CASE 记录的 light 平凡通过，不构成 CASE 要求）。
  assert.ok(!lightEdges.some((entry) => entry.guards.includes('case-approved')))
  assert.ok(!lightEdges.some((entry) => entry.guards.includes('case-execution-ready')))
  const direct = lightEdges.find((entry) => entry.from === 'implementing' && entry.to === 'archived')
  assert.ok(direct, 'light implementing->archived edge must exist')
  console.log(`[c4] light TRANSITIONS: ${lightEdges.map((e) => `${e.from}->${e.to}[${e.guards.join(',')}]`).join(' ')}`)
  // 运行期验证：light 直达 archived 不要求 CASE（casePhase 全程 none）。
  const [, l] = await createTask(root, { title: 'C4 Light Direct', mode: 'light' })
  writeFileSync(join(root, '.workloom', l.taskRelPath, 'prd.md'), LIGHT_MIN_PRD)
  assert.equal(migrateTask(root, { taskRelPath: l.taskRelPath, to: 'planning' })[0], null)
  assert.equal(migrateTask(root, { taskRelPath: l.taskRelPath, to: 'implementing' })[0], null)
  assert.equal(checkTask(root, { taskRelPath: l.taskRelPath, summary: 'self-check' })[0], null)
  const [lae, lav] = migrateTask(root, { taskRelPath: l.taskRelPath, to: 'archived' })
  assert.equal(lae, null, lae?.message)
  assert.equal(lav.view.casePhase, 'none')
  console.log(`[c4] light implementing -> archived OK with casePhase=${lav.view.casePhase} (no CASE track)`)

  // 3. parent：子任务未全归档时 integrating 进入失败，全归档后通过。
  const [, p] = await createTask(root, { title: 'C4 Parent Sequence', mode: 'parent', autonomy: 'auto' })
  const prel = p.taskRelPath
  satisfyStartDocs(root, prel)
  assert.equal(confirmPrd(root, prel, {})[0], null)
  const [, kid] = await createTask(root, { title: 'C4 Parent Kid', mode: 'light', parent: prel })
  assert.equal(migrateTask(root, { taskRelPath: prel, to: 'orchestrating' })[0], null)
  const [blockedErr] = migrateTask(root, { taskRelPath: prel, to: 'integrating' })
  assert.ok(blockedErr)
  assert.match(blockedErr.message, /guard "children-archived" failed/)
  assert.match(blockedErr.message, /children not archived yet/)
  console.log(`[c4] parent integrating entry with pending child rejected: ${blockedErr.message.slice(0, 160)}...`)
  // 子任务走完 light 链归档。
  writeFileSync(join(root, '.workloom', kid.taskRelPath, 'prd.md'), LIGHT_MIN_PRD)
  assert.equal(migrateTask(root, { taskRelPath: kid.taskRelPath, to: 'planning' })[0], null)
  assert.equal(migrateTask(root, { taskRelPath: kid.taskRelPath, to: 'implementing' })[0], null)
  assert.equal(checkTask(root, { taskRelPath: kid.taskRelPath, summary: 'kid self-check' })[0], null)
  assert.equal(migrateTask(root, { taskRelPath: kid.taskRelPath, to: 'archived' })[0], null)
  const [intErr, intRes] = migrateTask(root, { taskRelPath: prel, to: 'integrating' })
  assert.equal(intErr, null, intErr?.message)
  assert.equal(intRes.view.stage, 'integrating')
  console.log('[c4] parent integrating entry after child archived passed -> integrating')

  console.log('C4_OK: sequence guards decidable for all three modes')
} finally {
  rmSync(root, { recursive: true, force: true })
}
