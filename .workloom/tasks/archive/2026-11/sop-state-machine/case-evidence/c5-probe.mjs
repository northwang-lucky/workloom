// C5：自治度门禁探针（semi/manual/auto 三值 + 中途切换）。
import assert from 'node:assert/strict'
import { rmSync } from 'node:fs'
import { core, makeRoot, satisfyStartDocs } from './probe-lib.mjs'

const { createTask, migrateTask, confirmPrd, confirmPlan, recordPlanReview, setAutonomy, readTaskView } = core
const root = makeRoot('wl-c5-')
const cleanReview = (rel) => {
  for (const to of ['reviewing', 'clean']) assert.equal(recordPlanReview(root, rel, to)[0], null)
}
try {
  // 1. semi：PRD 确认人工，PLAN 确认自动记录（summary 注明自动来源），迁移通过。
  {
    const [, t] = await createTask(root, { title: 'C5 Semi', autonomy: 'semi' })
    const rel = t.taskRelPath
    satisfyStartDocs(root, rel)
    const [pe, pv] = confirmPrd(root, rel, { summary: 'manual prd under semi' })
    assert.equal(pe, null, pe?.message)
    assert.equal(pv.alignment.source, 'user')
    assert.equal(pv.alignment.autonomy, 'semi')
    cleanReview(rel)
    const [le, lv] = confirmPlan(root, rel, {})
    assert.equal(le, null, le?.message)
    assert.equal(lv.planConfirmation.source, 'auto')
    assert.equal(lv.planConfirmation.autonomy, 'semi')
    assert.match(lv.planConfirmation.summary, /auto-recorded/)
    assert.match(lv.planConfirmation.summary, /autonomy: semi/)
    assert.match(lv.planConfirmation.summary, /source: auto/)
    const [me] = migrateTask(root, { taskRelPath: rel, to: 'implementing' })
    assert.equal(me, null, me?.message)
    console.log(`[c5] semi: PRD manual (source=${pv.alignment.source}), PLAN auto-recorded (source=${lv.planConfirmation.source}, summary="${lv.planConfirmation.summary}"), -> implementing OK`)
  }
  // 2. manual：行为不变——无 summary 拒绝自动记录；未确认时迁移被拒（旧文案）；人工确认后通过。
  {
    const [, t] = await createTask(root, { title: 'C5 Manual' })
    const rel = t.taskRelPath
    satisfyStartDocs(root, rel)
    assert.equal(confirmPrd(root, rel, { summary: 'user prd' })[0], null)
    cleanReview(rel)
    const [autoErr] = confirmPlan(root, rel, {})
    assert.ok(autoErr)
    assert.match(autoErr.message, /requires a non-empty summary/)
    console.log(`[c5] manual: confirmPlan without summary rejected (${autoErr.message.slice(0, 100)}...)`)
    const [migErr] = migrateTask(root, { taskRelPath: rel, to: 'implementing' })
    assert.ok(migErr)
    assert.match(migErr.message, /plan\.md content has not been confirmed \(run workloom_task_align with target=plan after reviewing plan\.md\)/)
    console.log('[c5] manual: planning -> implementing rejected with PLAN_CONFIRM_MISSING_TEXT literal (behavior unchanged)')
    const [ue, uv] = confirmPlan(root, rel, { summary: 'user plan' })
    assert.equal(ue, null, ue?.message)
    assert.equal(uv.planConfirmation.source, 'user')
    assert.equal(uv.planConfirmation.autonomy, 'manual')
    assert.equal(migrateTask(root, { taskRelPath: rel, to: 'implementing' })[0], null)
    console.log('[c5] manual: user confirmation recorded (source=user), -> implementing OK')
  }
  // 3. auto：两确认均自动记录。
  {
    const [, t] = await createTask(root, { title: 'C5 Auto', autonomy: 'auto' })
    const rel = t.taskRelPath
    satisfyStartDocs(root, rel)
    const [pe, pv] = confirmPrd(root, rel, {})
    assert.equal(pe, null, pe?.message)
    assert.equal(pv.alignment.source, 'auto')
    assert.match(pv.alignment.summary, /auto-recorded/)
    cleanReview(rel)
    const [le, lv] = confirmPlan(root, rel, {})
    assert.equal(le, null, le?.message)
    assert.equal(lv.planConfirmation.source, 'auto')
    assert.match(lv.planConfirmation.summary, /autonomy: auto/)
    assert.equal(migrateTask(root, { taskRelPath: rel, to: 'implementing' })[0], null)
    console.log(`[c5] auto: both confirmations auto-recorded (PRD source=${pv.alignment.source}, PLAN source=${lv.planConfirmation.source}), -> implementing OK`)
  }
  // 4. 中途切换：manual -> semi 只影响未发生的确认迁移，已记录确认不追溯改变。
  {
    const [, t] = await createTask(root, { title: 'C5 Switch' })
    const rel = t.taskRelPath
    satisfyStartDocs(root, rel)
    const [, before] = confirmPrd(root, rel, { summary: 'first user prd' })
    const passedAtBefore = before.alignment.passedAt
    assert.equal(before.alignment.source, 'user')
    const [se, sv] = setAutonomy(root, rel, 'semi')
    assert.equal(se, null, se?.message)
    assert.equal(sv.autonomy, 'semi')
    assert.ok(Array.isArray(sv.autonomyLog) && sv.autonomyLog.length === 1)
    const entry = sv.autonomyLog[0]
    assert.equal(entry.from, 'manual')
    assert.equal(entry.to, 'semi')
    assert.ok(typeof entry.at === 'string' && entry.at !== '')
    console.log(`[c5] setAutonomy manual->semi recorded with timestamp (at=${entry.at}, from=${entry.from}, to=${entry.to})`)
    const [, after] = readTaskView(root, rel)
    assert.equal(after.alignment.source, 'user')
    assert.equal(after.alignment.passedAt, passedAtBefore)
    assert.equal(after.alignment.summary, 'first user prd')
    console.log('[c5] existing PRD confirmation not retroactively changed (source/passedAt/summary intact)')
    cleanReview(rel)
    const [le, lv] = confirmPlan(root, rel, {})
    assert.equal(le, null, le?.message)
    assert.equal(lv.planConfirmation.source, 'auto')
    console.log('[c5] subsequent PLAN confirmation follows the new autonomy (auto-recorded under semi)')
    // 三值互切：semi -> auto -> manual。
    assert.equal(setAutonomy(root, rel, 'auto')[0], null)
    assert.equal(setAutonomy(root, rel, 'manual')[0], null)
    const [, final] = readTaskView(root, rel)
    assert.equal(final.autonomy, 'manual')
    assert.equal(final.autonomyLog.length, 3)
    console.log(`[c5] three-way switching semi->auto->manual OK (autonomyLog entries=${final.autonomyLog.length})`)
  }
  console.log('C5_OK: autonomy gate behaviors match Scope 6 with audit source on auto records')
} finally {
  rmSync(root, { recursive: true, force: true })
}
