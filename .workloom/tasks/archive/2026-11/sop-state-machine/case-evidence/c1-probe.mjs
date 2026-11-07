// C1：三模式合法迁移链探针（light / standard / parent 各走一条全程链）。
import assert from 'node:assert/strict'
import { rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { core, makeRoot, satisfyStartDocs, LIGHT_MIN_PRD } from './probe-lib.mjs'

const { createTask, migrateTask, confirmPrd, confirmPlan, recordCasePhase, recordPlanReview, checkTask } = core
const root = makeRoot('wl-c1-')
const log = []
try {
  // ---- light 链：aligning→planning→implementing→archived（无 CASE 轨道） ----
  {
    const [err, t] = await createTask(root, { title: 'C1 Light Chain', mode: 'light', autonomy: 'auto' })
    assert.equal(err, null, err?.message)
    const rel = t.taskRelPath
    writeFileSync(join(root, '.workloom', rel, 'prd.md'), LIGHT_MIN_PRD)
    for (const to of ['planning', 'implementing']) {
      const [e, res] = migrateTask(root, { taskRelPath: rel, to })
      assert.equal(e, null, `light -> ${to}: ${e?.message}`)
      log.push(`light -> ${to} OK (stage=${res.view.stage}, status=${res.view.status})`)
    }
    const [ce, cv] = checkTask(root, { taskRelPath: rel, summary: 'light self-check' })
    assert.equal(ce, null, ce?.message)
    log.push(`light checkTask credential OK (stage stays ${cv.stage})`)
    const [ae, av] = migrateTask(root, { taskRelPath: rel, to: 'archived' })
    assert.equal(ae, null, `light -> archived: ${ae?.message}`)
    assert.equal(av.view.stage, 'archived')
    assert.equal(av.view.status, 'completed')
    assert.equal(av.view.casePhase, 'none')
    log.push(`light -> archived OK (status=${av.view.status}, casePhase=${av.view.casePhase})`)
  }
  // ---- standard 链：aligning→planning→implementing→checking→archived ----
  {
    const [err, t] = await createTask(root, { title: 'C1 Standard Chain', autonomy: 'auto' })
    assert.equal(err, null, err?.message)
    const rel = t.taskRelPath
    satisfyStartDocs(root, rel)
    const [pe, pv] = confirmPrd(root, rel, {})
    assert.equal(pe, null, pe?.message)
    assert.equal(pv.stage, 'planning')
    assert.equal(pv.alignment.source, 'auto')
    log.push(`standard confirmPrd(auto) OK -> planning (source=${pv.alignment.source})`)
    for (const to of ['reviewing', 'clean']) {
      const [e] = recordPlanReview(root, rel, to)
      assert.equal(e, null, e?.message)
    }
    const [le, lv] = confirmPlan(root, rel, {})
    assert.equal(le, null, le?.message)
    assert.equal(lv.planConfirmation.source, 'auto')
    log.push(`standard planReview->clean + confirmPlan(auto) OK (source=${lv.planConfirmation.source})`)
    const [se, sv] = migrateTask(root, { taskRelPath: rel, to: 'implementing' })
    assert.equal(se, null, se?.message)
    log.push(`standard -> implementing OK (status=${sv.view.status})`)
    for (const to of ['designing', 'reviewing', 'approved']) {
      const [e] = recordCasePhase(root, rel, to)
      assert.equal(e, null, e?.message)
    }
    log.push('standard casePhase -> approved OK')
    const [ke, kv] = checkTask(root, { taskRelPath: rel, summary: 'probe check' })
    assert.equal(ke, null, ke?.message)
    assert.equal(kv.stage, 'checking')
    log.push(`standard checkTask -> checking OK (case-approved/check-ready/ui-dispatch-ready/case-outcome-ready passed)`)
    const [ae, av] = migrateTask(root, { taskRelPath: rel, to: 'archived' })
    assert.equal(ae, null, ae?.message)
    assert.equal(av.view.stage, 'archived')
    assert.equal(av.view.status, 'completed')
    assert.ok(av.view.completedAt !== null)
    log.push(`standard -> archived OK (status=${av.view.status}, completedAt set)`)
  }
  // ---- parent 链：aligning→planning→orchestrating→integrating→archived ----
  {
    const [err, p] = await createTask(root, { title: 'C1 Parent Chain', mode: 'parent', autonomy: 'auto' })
    assert.equal(err, null, err?.message)
    const rel = p.taskRelPath
    satisfyStartDocs(root, rel)
    const [pe] = confirmPrd(root, rel, {})
    assert.equal(pe, null, pe?.message)
    log.push('parent confirmPrd(auto) OK -> planning')
    const [ce, child] = await createTask(root, { title: 'C1 Parent Child', mode: 'light', parent: rel })
    assert.equal(ce, null, ce?.message)
    const crel = child.taskRelPath
    writeFileSync(join(root, '.workloom', crel, 'prd.md'), LIGHT_MIN_PRD)
    for (const to of ['planning', 'implementing']) {
      const [e] = migrateTask(root, { taskRelPath: crel, to })
      assert.equal(e, null, `child -> ${to}: ${e?.message}`)
    }
    const [c2e] = checkTask(root, { taskRelPath: crel, summary: 'child self-check' })
    assert.equal(c2e, null, c2e?.message)
    const [cae, cav] = migrateTask(root, { taskRelPath: crel, to: 'archived' })
    assert.equal(cae, null, cae?.message)
    log.push(`parent child light chain -> archived OK (mode=${cav.view.mode}, children-archived satisfied)`)
    const [oe, ov] = migrateTask(root, { taskRelPath: rel, to: 'orchestrating' })
    assert.equal(oe, null, oe?.message)
    log.push(`parent -> orchestrating OK (plan-confirmed exempt for container, stage=${ov.view.stage})`)
    const [ie, iv] = migrateTask(root, { taskRelPath: rel, to: 'integrating' })
    assert.equal(ie, null, ie?.message)
    log.push(`parent -> integrating OK (children-archived passed, stage=${iv.view.stage})`)
    const [pce] = checkTask(root, { taskRelPath: rel, summary: 'parent integration check' })
    assert.equal(pce, null, pce?.message)
    const [pae, pav] = migrateTask(root, { taskRelPath: rel, to: 'archived' })
    assert.equal(pae, null, pae?.message)
    assert.equal(pav.view.stage, 'archived')
    assert.equal(pav.view.status, 'completed')
    log.push(`parent -> archived OK (archive-ready + integration-case-passed passed, status=${pav.view.status})`)
  }
  console.log(log.map((line) => `[c1] ${line}`).join('\n'))
  console.log('C1_OK: three mode chains all completed (light/standard/parent)')
} finally {
  rmSync(root, { recursive: true, force: true })
}
