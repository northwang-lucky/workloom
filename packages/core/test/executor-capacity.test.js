/**
 * executor 并发容量判定单测（R2 判定纯函数矩阵）：
 * 默认 2 / 显式 0 不限 / 达限拒绝 / 续用并槽 / 双层取严 / kind unset 不限 / 上下文正确 / receipt 文案。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { evaluateExecutorCapacity, formatAtCapacityReceipt } from '../src/legacy/executor-capacity.js'

/** 构造 running 记录。 @param {...([string, string])} pairs [childId, kind] */
function running(...pairs) {
  return pairs.map(([childId, kind]) => ({ childId, kind }))
}

// ---------- 全局闸 ----------

test('全局默认上限 2：在途 2 → 拒绝', () => {
  const result = evaluateExecutorCapacity({
    running: running(['c1', 'implement'], ['c2', 'implement']),
    kind: 'implement',
    globalLimit: 2,
  })
  assert.equal(result.allow, false)
  assert.equal(result.layer, 'global')
  assert.equal(result.globalCount, 2)
  assert.equal(result.kindCount, 2)
})

test('全局默认上限 2：在途 1 → 放行', () => {
  const result = evaluateExecutorCapacity({
    running: running(['c1', 'implement']),
    kind: 'implement',
    globalLimit: 2,
  })
  assert.equal(result.allow, true)
  assert.equal(result.globalCount, 1)
})

test('全局显式 0 = 不限：在途再多也放行', () => {
  const result = evaluateExecutorCapacity({
    running: running(['c1', 'implement'], ['c2', 'research'], ['c3', 'check']),
    kind: 'implement',
    globalLimit: 0,
  })
  assert.equal(result.allow, true)
  assert.equal(result.globalLimit, 0)
})

// ---------- kind 闸 ----------

test('kind 达限：kind 在途 2/2 → 拒绝（kind 层）', () => {
  const result = evaluateExecutorCapacity({
    running: running(['c1', 'implement'], ['c2', 'implement']),
    kind: 'implement',
    globalLimit: 0,
    kindLimit: 2,
  })
  assert.equal(result.allow, false)
  assert.equal(result.layer, 'kind')
  assert.equal(result.kindCount, 2)
  assert.equal(result.kindLimit, 2)
})

test('kind 显式 0 = 不限：kind 在途再多也放行', () => {
  const result = evaluateExecutorCapacity({
    running: running(['c1', 'implement'], ['c2', 'implement']),
    kind: 'implement',
    globalLimit: 0,
    kindLimit: 0,
  })
  assert.equal(result.allow, true)
})

test('kind 未配置（undefined）= 该层不限：仅全局闸生效', () => {
  const result = evaluateExecutorCapacity({
    running: running(['c1', 'implement'], ['c2', 'implement']),
    kind: 'implement',
    globalLimit: 4,
  })
  assert.equal(result.allow, true)
  assert.equal(result.kindLimit, undefined)
})

// ---------- 续用并槽 ----------

test('同 childId 多 kind running 合并占 1 槽（全局计数）', () => {
  const result = evaluateExecutorCapacity({
    running: running(['c1', 'implement'], ['c1', 'check']),
    kind: 'implement',
    globalLimit: 2,
  })
  // 全局 1 个唯一 childId，kind implement 1 个 → 放行
  assert.equal(result.allow, true)
  assert.equal(result.globalCount, 1)
  assert.equal(result.kindCount, 1)
})

test('同 childId 续用不误占槽：dispatch 同 childId 不同 kind 不重复计数', () => {
  const result = evaluateExecutorCapacity({
    running: running(['c1', 'implement'], ['c1', 'check'], ['c2', 'implement']),
    kind: 'implement',
    globalLimit: 2,
  })
  // 全局 2 个唯一 childId (c1, c2) → 达限 2/2
  assert.equal(result.allow, false)
  assert.equal(result.layer, 'global')
  assert.equal(result.globalCount, 2)
})

// ---------- 双层取严 ----------

test('双层均配置：kind 先撞 → 拒绝（kind 层）', () => {
  // globalLimit=4, kindLimit=2；全局 2/4 未撞，kind 2/2 撞
  const result = evaluateExecutorCapacity({
    running: running(['c1', 'implement'], ['c2', 'implement']),
    kind: 'implement',
    globalLimit: 4,
    kindLimit: 2,
  })
  assert.equal(result.allow, false)
  assert.equal(result.layer, 'kind')
  assert.equal(result.globalCount, 2)
  assert.equal(result.kindCount, 2)
})

test('双层均配置：全局先撞 → 拒绝（global 层）', () => {
  // globalLimit=2, kindLimit=4；全局 2/2 撞（优先报全局）
  const result = evaluateExecutorCapacity({
    running: running(['c1', 'implement'], ['c2', 'research']),
    kind: 'check',
    globalLimit: 2,
    kindLimit: 4,
  })
  assert.equal(result.allow, false)
  assert.equal(result.layer, 'global')
  assert.equal(result.globalCount, 2)
  assert.equal(result.kindCount, 0)
})

test('双层均达限：优先报全局闸', () => {
  // globalLimit=2, kindLimit=2；全局 2/2 且 kind 2/2 → 优先报 global
  const result = evaluateExecutorCapacity({
    running: running(['c1', 'implement'], ['c2', 'implement']),
    kind: 'implement',
    globalLimit: 2,
    kindLimit: 2,
  })
  assert.equal(result.allow, false)
  assert.equal(result.layer, 'global')
})

// ---------- 上下文正确 ----------

test('放行结果含完整上下文', () => {
  const result = evaluateExecutorCapacity({
    running: running(['c1', 'research']),
    kind: 'implement',
    globalLimit: 3,
    kindLimit: 2,
  })
  assert.deepEqual(result, {
    allow: true,
    globalCount: 1,
    kindCount: 0,
    globalLimit: 3,
    kindLimit: 2,
  })
})

test('拒绝结果含完整上下文', () => {
  const result = evaluateExecutorCapacity({
    running: running(['c1', 'implement'], ['c2', 'implement']),
    kind: 'implement',
    globalLimit: 4,
    kindLimit: 2,
  })
  assert.equal(result.allow, false)
  assert.equal(result.layer, 'kind')
  assert.equal(result.globalCount, 2)
  assert.equal(result.kindCount, 2)
  assert.equal(result.globalLimit, 4)
  assert.equal(result.kindLimit, 2)
})

test('空 running 集合 → 放行', () => {
  const result = evaluateExecutorCapacity({
    running: [],
    kind: 'implement',
    globalLimit: 2,
    kindLimit: 1,
  })
  assert.equal(result.allow, true)
  assert.equal(result.globalCount, 0)
  assert.equal(result.kindCount, 0)
})

// ---------- receipt 文案 ----------

test('receipt：撞 kind 文案含 kind/计数/全局', () => {
  const result = evaluateExecutorCapacity({
    running: running(['c1', 'implement'], ['c2', 'implement']),
    kind: 'implement',
    globalLimit: 4,
    kindLimit: 2,
  })
  const receipt = formatAtCapacityReceipt('implement', result)
  assert.equal(receipt, 'implement kind at capacity (2/2), global 2/4')
})

test('receipt：撞全局文案含计数', () => {
  const result = evaluateExecutorCapacity({
    running: running(['c1', 'implement'], ['c2', 'research']),
    kind: 'implement',
    globalLimit: 2,
  })
  const receipt = formatAtCapacityReceipt('implement', result)
  assert.equal(receipt, 'at capacity (2/2)')
})

test('receipt：放行返回空串', () => {
  const result = evaluateExecutorCapacity({
    running: [],
    kind: 'implement',
    globalLimit: 2,
  })
  assert.equal(formatAtCapacityReceipt('implement', result), '')
})
