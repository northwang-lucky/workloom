// C6：doctor 五类探针（临时目录；非法状态样本；空槽提示行退役）。
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { core, baseRecord, writeTask, gitInitWithCommit } from './probe-lib.mjs'

const { createTask, initWorkloom, runDoctor, buildDoctorRelayText } = core
// doctor 探针根不预建 .workloom（由 initWorkloom 创建骨架；与 doctor.test.ts 同口径）。
const root = mkdtempSync(join(tmpdir(), 'wl-c6-'))
try {
  const [initErr] = initWorkloom(root)
  assert.equal(initErr, null, initErr?.message)
  gitInitWithCommit(root)
  // 正常样本：新建 standard 任务（aligning，无确认记录属正常初始态）。
  const [, ok] = await createTask(root, { title: 'C6 Normal' })
  const okRel = ok.taskRelPath
  // 非法样本 a：stage 与 mode 组合非法（standard 携带 parent 专属 orchestrating）。
  const relA = writeTask(root, 'tasks/c6-bad-combo', baseRecord({
    name: 'c6-bad-combo', status: 'in_progress', mode: 'standard', stage: 'orchestrating',
  }))
  // 非法样本 b：manual 缺确认却过 planning（implementing 且无任何确认记录）。
  const relB = writeTask(root, 'tasks/c6-no-confirm', baseRecord({
    name: 'c6-no-confirm', status: 'in_progress', mode: 'standard', stage: 'implementing',
  }))
  // 非法样本 c：casePhase 取非法轨道值。
  const relC = writeTask(root, 'tasks/c6-bad-case-phase', baseRecord({
    name: 'c6-bad-case-phase', status: 'in_progress', mode: 'standard', stage: 'implementing',
    case: { required: false, designSession: null, phase: 'bogus' },
  }))
  // 非法样本 d：planReview 取非法轨道值。
  const relD = writeTask(root, 'tasks/c6-bad-plan-review', baseRecord({
    name: 'c6-bad-plan-review', status: 'in_progress', mode: 'standard', stage: 'implementing',
    planReview: 'bogus',
  }))
  const [err, report] = runDoctor(root)
  assert.equal(err, null, err?.message)
  const codes = report.checks.map((item) => item.code)
  console.log(`[c6] doctor check categories: ${JSON.stringify(codes)}`)
  for (const want of ['lifecycle-consistency', 'confirm-completeness', 'case-consistency', 'worktree', 'config']) {
    assert.ok(codes.includes(want), `missing category ${want}`)
  }
  const checkOf = (code) => report.checks.find((item) => item.code === code)
  const lifecycle = checkOf('lifecycle-consistency')
  const confirm = checkOf('confirm-completeness')
  // 正常样本无误报（生命周期一致性不含正常任务）。
  assert.ok(!lifecycle.issues.some((item) => item.task === okRel))
  console.log(`[c6] normal sample ${okRel}: lifecycle-consistency issues=0 (no false positive)`)
  // 样本 a：lifecycle 报 Invalid stage for mode。
  const ia = lifecycle.issues.find((item) => item.task === relA)
  assert.ok(ia, 'sample a must be reported by lifecycle-consistency')
  assert.equal(ia.title, 'Invalid stage for mode')
  console.log(`[c6] sample a (standard+orchestrating): lifecycle issue "${ia.title}": ${ia.message}`)
  // 样本 b：manual 缺确认却过 planning → confirm-completeness 报 issue（PRD Scope 8 分类，
  // case.md 经主会话 2026-11-07 裁定修订：lifecycle-consistency 只保留组合非法与轨道值非法）。
  const ib = lifecycle.issues.filter((item) => item.task === relB)
  const cb = confirm.issues.filter((item) => item.task === relB)
  console.log(`[c6] sample b (manual missing confirmations past planning): confirm-completeness issues=${cb.length} (${cb.map((item) => item.title).join(' | ')}), lifecycle issues=${ib.length}`)
  assert.ok(cb.some((item) => item.title === 'Missing PRD confirmation'), 'sample b must report Missing PRD confirmation')
  assert.ok(cb.some((item) => item.title === 'Missing PLAN confirmation'), 'sample b must report Missing PLAN confirmation')
  assert.equal(ib.length, 0, 'sample b belongs to confirm-completeness, lifecycle must stay clean for it')
  // 样本 c/d：轨道值非法 → 兼容读可判定错误 → lifecycle 报 Unreadable or invalid task record。
  for (const [rel, label] of [[relC, 'c (casePhase=bogus)'], [relD, 'd (planReview=bogus)']]) {
    const it = lifecycle.issues.find((item) => item.task === rel)
    assert.ok(it, `sample ${label} must be reported`)
    assert.equal(it.title, 'Unreadable or invalid task record')
    assert.match(it.message, /unmapped/)
    console.log(`[c6] sample ${label}: lifecycle issue "${it.title}" (decidable: ${it.message.slice(0, 110)}...)`)
  }
  // 空槽提示行退役：报告无 slotsNote 字段，转述文案无旧字样。
  assert.ok(!('slotsNote' in report), 'slotsNote must be retired from the report')
  const relay = buildDoctorRelayText(report)
  assert.ok(!relay.includes('检查集待状态机重建'))
  console.log('[c6] report has no slotsNote field; relay text contains no legacy slots note')
  console.log('C6_OK: five categories present; samples a/c/d reported by lifecycle-consistency; sample b reported by confirm-completeness (revised case.md caliber, adjudicated 2026-11-07)')
} finally {
  rmSync(root, { recursive: true, force: true })
}
