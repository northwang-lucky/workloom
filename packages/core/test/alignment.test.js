/**
 * alignment 纯函数单测：prd 全文规范化 hash、开放节点标记扫描、
 * alignment 门禁矩阵（planning start / in_progress stale / 旧任务放行）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  ALIGNMENT_MISSING,
  ALIGNMENT_STALE,
  computePrdHash,
  evaluateAlignmentGate,
  findOpenNodeState,
  normalizePrdEol,
} from '../src/legacy/alignment.js'

/** 一份已收敛的最小 prd 全文（H1 + 四小节 + Alignment Decisions + open-nodes=none）。 */
const CONVERGED_PRD = `# Ship the alignment

## Goal

Replace grilling with a unified alignment skill.

## Requirements

- one design tree per task

## Acceptance Criteria

- confirm requires matching prd hash

## Notes

- old grilling fields stay inert

## Alignment Decisions

- design tree converges in Phase 1.1

<!-- workloom:open-nodes=none -->
`

test('normalizePrdEol：CRLF/CR 全部归一为 LF，其余原样保留', () => {
  const crlf = '# a\r\n\r\n## b\r\n- x\r\n'
  assert.equal(normalizePrdEol(crlf), '# a\n\n## b\n- x\n')
  const cr = '# a\r\r\n## b\r'
  assert.equal(normalizePrdEol(cr), '# a\n\n## b\n')
  // LF 原样（不二次改写）
  assert.equal(normalizePrdEol('# a\n\n## b\n'), '# a\n\n## b\n')
})

test('computePrdHash：确定性、64 位 hex、内容不同 hash 不同', () => {
  const h1 = computePrdHash(CONVERGED_PRD)
  const h2 = computePrdHash(CONVERGED_PRD)
  assert.equal(h1, h2)
  assert.match(h1, /^[0-9a-f]{64}$/)
  const changed = computePrdHash(`${CONVERGED_PRD}\n- extra`)
  assert.notEqual(h1, changed)
})

test('computePrdHash：换行归一化后 CRLF/CR/LF 三形态 hash 一致（全文参与 hash）', () => {
  const asLf = CONVERGED_PRD
  const asCrlf = CONVERGED_PRD.replace(/\n/g, '\r\n')
  const asCr = CONVERGED_PRD.replace(/\n/g, '\r')
  const lf = computePrdHash(asLf)
  assert.equal(computePrdHash(asCrlf), lf)
  assert.equal(computePrdHash(asCr), lf)
  // 正文内容变化（含 Alignment Decisions 小节）会使 hash 变化——凭据随用户审阅版失效
  const decisionsEdited = CONVERGED_PRD.replace('one design tree per task', 'two trees')
  assert.notEqual(computePrdHash(decisionsEdited), lf)
})

test('findOpenNodeState：无标记返回 null（未声明收敛状态）', () => {
  assert.equal(findOpenNodeState('# a\n\nplain body without marker\n'), null)
})

test('findOpenNodeState：none 标记返回 none（收敛态），pending 返回 pending', () => {
  assert.equal(findOpenNodeState(CONVERGED_PRD), 'none')
  const pending = CONVERGED_PRD.replace('workloom:open-nodes=none', 'workloom:open-nodes=pending')
  assert.equal(findOpenNodeState(pending), 'pending')
})

test('findOpenNodeState：同文多标记时任一 pending 即 pending（保守口径）', () => {
  const mixed = `${CONVERGED_PRD}\n\n<!-- workloom:open-nodes=pending -->\n`
  assert.equal(findOpenNodeState(mixed), 'pending')
  const noneOnly = `${CONVERGED_PRD}\n\n<!-- workloom:open-nodes=none -->\n`
  assert.equal(findOpenNodeState(noneOnly), 'none')
})

test('evaluateAlignmentGate：planning 无凭据拦截（含旧 planning 任务须重新 alignment）', () => {
  assert.deepEqual(evaluateAlignmentGate('planning', null, computePrdHash(CONVERGED_PRD)), [
    ALIGNMENT_MISSING,
  ])
})

test('evaluateAlignmentGate：planning 有凭据且 hash 一致放行，不一致拦截 stale', () => {
  const hash = computePrdHash(CONVERGED_PRD)
  const valid = { passedAt: '2026-09-01T00:00:00Z', summary: 'converged', prdHash: hash }
  assert.deepEqual(evaluateAlignmentGate('planning', valid, hash), [])
  assert.deepEqual(evaluateAlignmentGate('planning', valid, `${hash.slice(0, 63)}0`), [
    ALIGNMENT_STALE,
  ])
})

test('evaluateAlignmentGate：in_progress 无凭据放行（旧任务不追溯阻断），有凭据 hash 一致放行', () => {
  const hash = computePrdHash(CONVERGED_PRD)
  assert.deepEqual(evaluateAlignmentGate('in_progress', null, hash), [])
  const valid = { passedAt: '2026-09-01T00:00:00Z', summary: 'converged', prdHash: hash }
  assert.deepEqual(evaluateAlignmentGate('in_progress', valid, hash), [])
})

test('evaluateAlignmentGate：in_progress 凭据 stale 拦截（executor/check/archive 复用），completed 一律放行', () => {
  const hash = computePrdHash(CONVERGED_PRD)
  const stale = { passedAt: '2026-09-01T00:00:00Z', summary: 'converged', prdHash: `${hash.slice(0, 63)}0` }
  assert.deepEqual(evaluateAlignmentGate('in_progress', stale, hash), [ALIGNMENT_STALE])
  // completed（归档态）不参与 alignment 门禁
  assert.deepEqual(evaluateAlignmentGate('completed', null, hash), [])
  assert.deepEqual(evaluateAlignmentGate('completed', stale, hash), [])
})

test('evaluateAlignmentGate：hash 相等即放行（alignment 凭据 prdHash 与当前一致；文案含下一步指引）', () => {
  const hash = computePrdHash(CONVERGED_PRD)
  const [missing] = evaluateAlignmentGate('planning', null, hash)
  assert.ok(missing.includes('workloom_task_align'), '缺失文案须点名下一步工具')
  const [stale] = evaluateAlignmentGate('in_progress', { passedAt: 'x', summary: 's', prdHash: 'deadbeef' }, hash)
  assert.ok(stale.includes('workloom_task_align'), 'stale 文案须点名下一步工具')
  assert.equal(ALIGNMENT_STALE.includes('re-run'), true)
  assert.equal(ALIGNMENT_MISSING.includes('Phase 1.1'), true)
})
