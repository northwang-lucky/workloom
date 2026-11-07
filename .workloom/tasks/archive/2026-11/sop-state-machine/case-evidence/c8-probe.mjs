// C8：planReview 守卫探针（plan 确认在任何 autonomy 下都要求 clean；轨道边可判定）。
import assert from 'node:assert/strict'
import { rmSync } from 'node:fs'
import { core, makeRoot, satisfyStartDocs } from './probe-lib.mjs'

const { createTask, migrateTask, confirmPrd, confirmPlan, recordPlanReview } = core
const root = makeRoot('wl-c8-')
try {
  // 1. manual：planReview 非 clean 时 confirmPlan 失败，clean 后通过且迁移放行。
  {
    const [, t] = await createTask(root, { title: 'C8 Manual' })
    const rel = t.taskRelPath
    satisfyStartDocs(root, rel)
    assert.equal(confirmPrd(root, rel, { summary: 'prd ok' })[0], null)
    const [e1] = confirmPlan(root, rel, { summary: 'plan ok' })
    assert.ok(e1)
    assert.match(e1.message, /plan confirmation rejected/)
    assert.match(e1.message, /plan review is not clean \(current phase: none\)/)
    console.log(`[c8] manual planReview=none: confirmPlan rejected (${e1.message.slice(0, 140)}...)`)
    assert.equal(recordPlanReview(root, rel, 'reviewing')[0], null)
    const [e2] = confirmPlan(root, rel, { summary: 'plan ok' })
    assert.ok(e2)
    assert.match(e2.message, /current phase: reviewing/)
    console.log('[c8] manual planReview=reviewing: still rejected')
    assert.equal(recordPlanReview(root, rel, 'clean')[0], null)
    const [ok, ov] = confirmPlan(root, rel, { summary: 'plan ok' })
    assert.equal(ok, null, ok?.message)
    assert.equal(ov.planConfirmation.source, 'user')
    assert.equal(migrateTask(root, { taskRelPath: rel, to: 'implementing' })[0], null)
    console.log('[c8] manual planReview=clean: confirmPlan passed, planning -> implementing passed')
  }
  // 2. semi 与 auto：非 clean 时自动记录同样被拒（Judger 评审轨道与 autonomy 无关）。
  for (const autonomy of ['semi', 'auto']) {
    const [, t] = await createTask(root, { title: `C8 ${autonomy}`, autonomy })
    const rel = t.taskRelPath
    satisfyStartDocs(root, rel)
    if (autonomy === 'semi') {
      assert.equal(confirmPrd(root, rel, { summary: 'prd ok' })[0], null)
    } else {
      assert.equal(confirmPrd(root, rel, {})[0], null)
    }
    const [blocked] = confirmPlan(root, rel, {})
    assert.ok(blocked, `${autonomy} must be blocked before clean`)
    assert.match(blocked.message, /plan review is not clean/)
    for (const to of ['reviewing', 'clean']) assert.equal(recordPlanReview(root, rel, to)[0], null)
    const [ok, v] = confirmPlan(root, rel, {})
    assert.equal(ok, null, ok?.message)
    assert.equal(v.planConfirmation.source, 'auto')
    assert.match(v.planConfirmation.summary, new RegExp(`autonomy: ${autonomy}`))
    console.log(`[c8] ${autonomy}: blocked before clean (no auto record written), auto-recorded after clean (source=${v.planConfirmation.source})`)
  }
  // 3. 轨道边：非法边拒绝且可判定；合法边通过；revising 多轮不设上限。
  {
    const [, t] = await createTask(root, { title: 'C8 Track Edges' })
    const rel = t.taskRelPath
    const illegal = [
      ['none', 'clean'],
      ['none', 'revising'],
    ]
    for (const [, to] of illegal) {
      const [e] = recordPlanReview(root, rel, to)
      assert.ok(e, `${to} must be rejected`)
      assert.match(e.message, /illegal plan review transition/)
      console.log(`[c8] illegal edge none->${to} rejected: ${e.message.slice(0, 120)}`)
    }
    assert.equal(recordPlanReview(root, rel, 'reviewing')[0], null)
    assert.equal(recordPlanReview(root, rel, 'revising')[0], null)
    const [revErr] = recordPlanReview(root, rel, 'clean')
    assert.ok(revErr)
    assert.match(revErr.message, /illegal plan review transition: .*revising -> clean/)
    console.log('[c8] illegal edge revising->clean rejected (must go back through reviewing)')
    // 多轮 revising 回环不设上限，轮数只记录。
    for (let round = 0; round < 3; round++) {
      assert.equal(recordPlanReview(root, rel, 'reviewing')[0], null)
      if (round < 2) assert.equal(recordPlanReview(root, rel, 'revising')[0], null)
    }
    const [, v] = recordPlanReview(root, rel, 'clean')
    assert.equal(v.planReview, 'clean')
    assert.equal(v.planReviewRevisions, 3)
    console.log(`[c8] revising loop unlimited (revisions=${v.planReviewRevisions}, recorded not judged), reviewing->clean passed`)
    // clean 之后不可回头。
    const [backErr] = recordPlanReview(root, rel, 'reviewing')
    assert.ok(backErr)
    assert.match(backErr.message, /illegal plan review transition: .*clean -> reviewing/)
    console.log('[c8] illegal edge clean->reviewing rejected')
  }
  console.log('C8_OK: plan-review-clean guard is autonomy-independent and track edges are decidable')
} finally {
  rmSync(root, { recursive: true, force: true })
}
