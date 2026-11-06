/**
 * alignment 纯函数单测：开放节点标记扫描、
 * alignment 门禁矩阵（凭据有无两态：planning 无凭据拦截，其余放行）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  ALIGNMENT_MISSING,
  evaluateAlignmentGate,
  findOpenNodeState,
} from '../src/domain/alignment.js'

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

test('evaluateAlignmentGate：planning 无凭据拦截（PRD 内容确认是 start 前置）', () => {
  assert.deepEqual(evaluateAlignmentGate('planning', null), [ALIGNMENT_MISSING])
})

test('evaluateAlignmentGate：凭据只判有无（无哈希），planning 有凭据即放行', () => {
  // 旧数据兼容：凭据里遗留的 prdHash 字段不参与任何新判断。
  const legacy = { passedAt: '2026-09-01T00:00:00Z', summary: 'converged', prdHash: 'deadbeef' }
  assert.deepEqual(evaluateAlignmentGate('planning', legacy), [])
  const fresh = { passedAt: '2026-09-01T00:00:00Z', summary: 'converged' }
  assert.deepEqual(evaluateAlignmentGate('planning', fresh), [])
})

test('evaluateAlignmentGate：in_progress 无凭据放行（旧任务不追溯阻断），completed 一律放行', () => {
  assert.deepEqual(evaluateAlignmentGate('in_progress', null), [])
  const record = { passedAt: '2026-09-01T00:00:00Z', summary: 'converged' }
  assert.deepEqual(evaluateAlignmentGate('in_progress', record), [])
  assert.deepEqual(evaluateAlignmentGate('completed', null), [])
  assert.deepEqual(evaluateAlignmentGate('completed', record), [])
})

test('alignment 缺失文案点名下一步工具（指引 workloom_task_align）', () => {
  assert.ok(ALIGNMENT_MISSING.includes('workloom_task_align'), '缺失文案须点名下一步工具')
  assert.ok(ALIGNMENT_MISSING.includes('Phase 1.1'), '缺失文案须说明确认时机')
})
