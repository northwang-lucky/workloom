/**
 * executor 并发容量判定单测（判定纯函数矩阵）：
 * 全局闸显式值/0 不限 / 达限拒绝 / 续用并槽 / 双层取严 / role unset 不限 / 上下文正确 /
 * receipt 文案（role 层含 global 段与省略段两个分支、全局层）/ 过渡期两侧归一。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { evaluateExecutorCapacity, formatAtCapacityReceipt } from '../src/dispatch/executor-capacity.js'

/** 构造 running 记录。 @param {...([string, string])} pairs [childId, role] */
function running(...pairs) {
  return pairs.map(([childId, role]) => ({ childId, role }))
}

// ---------- 全局闸 ----------

test('全局闸显式上限 2：在途 2 → 拒绝', () => {
  const result = evaluateExecutorCapacity({
    running: running(['c1', 'developer'], ['c2', 'developer']),
    role: 'developer',
    globalLimit: 2,
  })
  assert.equal(result.allow, false)
  assert.equal(result.layer, 'global')
  assert.equal(result.globalCount, 2)
  assert.equal(result.roleCount, 2)
})

test('全局闸显式上限 2：在途 1 → 放行', () => {
  const result = evaluateExecutorCapacity({
    running: running(['c1', 'developer']),
    role: 'developer',
    globalLimit: 2,
  })
  assert.equal(result.allow, true)
  assert.equal(result.globalCount, 1)
})

test('全局显式 0 = 不限：在途再多也放行', () => {
  const result = evaluateExecutorCapacity({
    running: running(['c1', 'developer'], ['c2', 'researcher'], ['c3', 'checker']),
    role: 'developer',
    globalLimit: 0,
  })
  assert.equal(result.allow, true)
  assert.equal(result.globalLimit, 0)
})

// ---------- 角色闸 ----------

test('角色达限：角色在途 2/2 → 拒绝（角色层）', () => {
  const result = evaluateExecutorCapacity({
    running: running(['c1', 'developer'], ['c2', 'developer']),
    role: 'developer',
    globalLimit: 0,
    roleLimit: 2,
  })
  assert.equal(result.allow, false)
  assert.equal(result.layer, 'role')
  assert.equal(result.roleCount, 2)
  assert.equal(result.roleLimit, 2)
})

test('角色显式 0 = 不限：角色在途再多也放行', () => {
  const result = evaluateExecutorCapacity({
    running: running(['c1', 'developer'], ['c2', 'developer']),
    role: 'developer',
    globalLimit: 0,
    roleLimit: 0,
  })
  assert.equal(result.allow, true)
})

test('角色未配置（undefined）= 该层不限：仅全局闸生效', () => {
  const result = evaluateExecutorCapacity({
    running: running(['c1', 'developer'], ['c2', 'developer']),
    role: 'developer',
    globalLimit: 4,
  })
  assert.equal(result.allow, true)
  assert.equal(result.roleLimit, undefined)
})

// ---------- 续用并槽 ----------

test('同 childId 多角色 running 合并占 1 槽（全局计数）', () => {
  const result = evaluateExecutorCapacity({
    running: running(['c1', 'developer'], ['c1', 'checker']),
    role: 'developer',
    globalLimit: 2,
  })
  // 全局 1 个唯一 childId，developer 1 个 → 放行
  assert.equal(result.allow, true)
  assert.equal(result.globalCount, 1)
  assert.equal(result.roleCount, 1)
})

test('同 childId 续用不误占槽：dispatch 同 childId 不同角色不重复计数', () => {
  const result = evaluateExecutorCapacity({
    running: running(['c1', 'developer'], ['c1', 'checker'], ['c2', 'developer']),
    role: 'developer',
    globalLimit: 2,
  })
  // 全局 2 个唯一 childId (c1, c2) → 达限 2/2
  assert.equal(result.allow, false)
  assert.equal(result.layer, 'global')
  assert.equal(result.globalCount, 2)
})

// ---------- 双层取严 ----------

test('双层均配置：角色闸先撞 → 拒绝（角色层）', () => {
  // globalLimit=4, roleLimit=2；全局 2/4 未撞，角色 2/2 撞
  const result = evaluateExecutorCapacity({
    running: running(['c1', 'developer'], ['c2', 'developer']),
    role: 'developer',
    globalLimit: 4,
    roleLimit: 2,
  })
  assert.equal(result.allow, false)
  assert.equal(result.layer, 'role')
  assert.equal(result.globalCount, 2)
  assert.equal(result.roleCount, 2)
})

test('双层均配置：全局先撞 → 拒绝（global 层）', () => {
  // globalLimit=2, roleLimit=4；全局 2/2 撞（优先报全局）
  const result = evaluateExecutorCapacity({
    running: running(['c1', 'developer'], ['c2', 'researcher']),
    role: 'checker',
    globalLimit: 2,
    roleLimit: 4,
  })
  assert.equal(result.allow, false)
  assert.equal(result.layer, 'global')
  assert.equal(result.globalCount, 2)
  assert.equal(result.roleCount, 0)
})

test('双层均达限：优先报全局闸', () => {
  // globalLimit=2, roleLimit=2；全局 2/2 且角色 2/2 → 优先报 global
  const result = evaluateExecutorCapacity({
    running: running(['c1', 'developer'], ['c2', 'developer']),
    role: 'developer',
    globalLimit: 2,
    roleLimit: 2,
  })
  assert.equal(result.allow, false)
  assert.equal(result.layer, 'global')
})

// ---------- 上下文正确 ----------

test('放行结果含完整上下文', () => {
  const result = evaluateExecutorCapacity({
    running: running(['c1', 'researcher']),
    role: 'developer',
    globalLimit: 3,
    roleLimit: 2,
  })
  assert.deepEqual(result, {
    allow: true,
    globalCount: 1,
    roleCount: 0,
    globalLimit: 3,
    roleLimit: 2,
  })
})

test('拒绝结果含完整上下文', () => {
  const result = evaluateExecutorCapacity({
    running: running(['c1', 'developer'], ['c2', 'developer']),
    role: 'developer',
    globalLimit: 4,
    roleLimit: 2,
  })
  assert.equal(result.allow, false)
  assert.equal(result.layer, 'role')
  assert.equal(result.globalCount, 2)
  assert.equal(result.roleCount, 2)
  assert.equal(result.globalLimit, 4)
  assert.equal(result.roleLimit, 2)
})

test('空 running 集合 → 放行', () => {
  const result = evaluateExecutorCapacity({
    running: [],
    role: 'developer',
    globalLimit: 2,
    roleLimit: 1,
  })
  assert.equal(result.allow, true)
  assert.equal(result.globalCount, 0)
  assert.equal(result.roleCount, 0)
})

// ---------- receipt 文案 ----------

test('receipt：撞角色闸文案含 role/计数/全局', () => {
  const result = evaluateExecutorCapacity({
    running: running(['c1', 'developer'], ['c2', 'developer']),
    role: 'developer',
    globalLimit: 4,
    roleLimit: 2,
  })
  const receipt = formatAtCapacityReceipt('developer', result)
  assert.equal(receipt, 'developer role at capacity (2/2), global 2/4')
})

test('receipt：撞角色闸且全局闸 0（不限）→ 省略 global 段', () => {
  // 新缺省形态：全局 0（不限）+ 每角色 3，角色层拒绝只报 角色计数。
  const result = evaluateExecutorCapacity({
    running: running(['c1', 'developer'], ['c2', 'developer'], ['c3', 'developer']),
    role: 'developer',
    globalLimit: 0,
    roleLimit: 3,
  })
  const receipt = formatAtCapacityReceipt('developer', result)
  assert.equal(receipt, 'developer role at capacity (3/3)')
})

test('receipt：撞全局文案含计数', () => {
  const result = evaluateExecutorCapacity({
    running: running(['c1', 'developer'], ['c2', 'researcher']),
    role: 'developer',
    globalLimit: 2,
  })
  const receipt = formatAtCapacityReceipt('developer', result)
  assert.equal(receipt, 'at capacity (2/2)')
})

test('receipt：放行返回空串', () => {
  const result = evaluateExecutorCapacity({
    running: [],
    role: 'developer',
    globalLimit: 2,
  })
  assert.equal(formatAtCapacityReceipt('developer', result), '')
})

// ---------- 过渡期两侧归一（步骤 5：记录值与入参新旧值域混合正确计数） ----------

test('两侧归一：旧记录值 + 旧入参混合新值记录 → 同角色合并计数', () => {
  // 采集侧（toTaskView 归一后）见新值 developer，in-flight 登记与闸参数仍旧值
  // implement：两侧归一后同角色，roleCount 合并计 2（单侧归一会漏计为 1）。
  const result = evaluateExecutorCapacity({
    running: running(['c1', 'implement'], ['c2', 'developer']),
    role: 'implement',
    globalLimit: 0,
    roleLimit: 2,
  })
  assert.equal(result.allow, false)
  assert.equal(result.layer, 'role')
  assert.equal(result.roleCount, 2)
})

test('两侧归一：新入参 + 旧记录值 → 同角色计数；异角色旧值不误计', () => {
  const result = evaluateExecutorCapacity({
    running: running(['c1', 'check'], ['c2', 'research']),
    role: 'checker',
    globalLimit: 0,
    roleLimit: 1,
  })
  assert.equal(result.allow, false)
  assert.equal(result.layer, 'role')
  // check → checker 计入；research → researcher 不计入。
  assert.equal(result.roleCount, 1)
  assert.equal(result.globalCount, 2)
})

test('两侧归一：脏值记录不入角色闸计数，但全局闸照常占槽', () => {
  const result = evaluateExecutorCapacity({
    running: running(['c1', 'bogus'], ['c2', 'developer']),
    role: 'developer',
    globalLimit: 0,
    roleLimit: 2,
  })
  // 脏值归一落空：不入角色闸（roleCount 只有 c2），全局闸按 childId 去重不漏计。
  assert.equal(result.allow, true)
  assert.equal(result.roleCount, 1)
  assert.equal(result.globalCount, 2)
})
