/**
 * alignment 纯函数单测：alignment 门禁矩阵（凭据有无两态：planning 无凭据拦截，
 * 其余放行）。开放节点 HTML 标记已删除，收敛判断不依赖任何标记。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { ALIGNMENT_MISSING, evaluateAlignmentGate } from '../src/domain/alignment.js'

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
