/**
 * breadcrumb 模块单测：overlay 合并、breadcrumb 组装、逃生舱关键词。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { parseContract, WorkflowContractError } from '../src/legacy/workflow-contract.js'
import { buildBreadcrumb, mergeOverlay, shouldSkipBreadcrumb } from '../src/legacy/breadcrumb.js'

/** 内置契约（planning/in_progress/completed 三态，completed 缺块）。 */
function makeContract() {
  const [err, contract] = parseContract(`---
version: 1
states:
  - planning
  - in_progress
  - completed
---

#### 1.0 创建任务
内置步骤正文

[workflow-state:planning]
内置规划指引
[/workflow-state:planning]

[workflow-state:in_progress]
内置执行指引
[/workflow-state:in_progress]
`)
  assert.equal(err, null)
  return contract
}

/** 构造最小配置对象。 */
function makeConfig(keyword) {
  return { promptInjection: { skipKeyword: keyword } }
}

test('mergeOverlay 覆盖块正文且不改原契约', () => {
  const contract = makeContract()
  const overlay = `[workflow-state:planning]
overlay 规划指引
[/workflow-state:planning]
`
  const [err, merged] = mergeOverlay(contract, overlay)
  assert.equal(err, null)
  assert.equal(merged.breadcrumbs.get('planning'), 'overlay 规划指引')
  assert.equal(merged.breadcrumbs.get('in_progress'), '内置执行指引')
  assert.equal(contract.breadcrumbs.get('planning'), '内置规划指引')
})

test('mergeOverlay 覆盖步骤正文并保留其余步骤', () => {
  const contract = makeContract()
  const overlay = `#### 1.0 创建任务
overlay 步骤正文
`
  const [err, merged] = mergeOverlay(contract, overlay)
  assert.equal(err, null)
  assert.equal(merged.steps.length, 1)
  assert.equal(merged.steps[0].body, 'overlay 步骤正文')
  assert.equal(contract.steps[0].body, '内置步骤正文')
})

test('mergeOverlay 引入未声明状态报错', () => {
  const contract = makeContract()
  const overlay = `[workflow-state:archived]
归档指引
[/workflow-state:archived]
`
  const [err, merged] = mergeOverlay(contract, overlay)
  assert.ok(err instanceof WorkflowContractError)
  assert.equal(merged, null)
})

test('mergeOverlay 补齐缺块后 warnings 重新计算', () => {
  const contract = makeContract()
  const overlay = `[workflow-state:completed]
收尾指引
[/workflow-state:completed]
`
  const [err, merged] = mergeOverlay(contract, overlay)
  assert.equal(err, null)
  assert.deepEqual(merged.warnings, [])
  assert.deepEqual(contract.warnings, [
    'status completed is declared but has no corresponding tag block',
  ])
})

test('buildBreadcrumb 命中块返回正文', () => {
  const contract = makeContract()
  const [err, text] = buildBreadcrumb(contract, 'planning')
  assert.equal(err, null)
  assert.equal(text, '内置规划指引')
})

test('buildBreadcrumb 无块返回通用提示', () => {
  const contract = makeContract()
  const [err, text] = buildBreadcrumb(contract, 'completed')
  assert.equal(err, null)
  assert.equal(text, 'Refer to the workflow document to confirm the current step.')
})

test('buildBreadcrumb 非法状态报错', () => {
  const contract = makeContract()
  const [err, text] = buildBreadcrumb(contract, 'archived')
  assert.ok(err instanceof WorkflowContractError)
  assert.equal(text, null)
})

test('shouldSkipBreadcrumb 独立词命中（大小写不敏感）', () => {
  assert.equal(shouldSkipBreadcrumb(makeConfig('no-workloom'), 'no-workloom'), true)
  assert.equal(shouldSkipBreadcrumb(makeConfig('no-workloom'), 'a no-workloom b'), true)
  assert.equal(shouldSkipBreadcrumb(makeConfig('No-Workloom'), 'please NO-WORKLOOM now'), true)
})

test('shouldSkipBreadcrumb 子串不命中', () => {
  assert.equal(shouldSkipBreadcrumb(makeConfig('no-workloom'), 'no-workloomfoo'), false)
  assert.equal(shouldSkipBreadcrumb(makeConfig('no-workloom'), 'xno-workloom y'), false)
})

test('shouldSkipBreadcrumb 空关键词恒 false', () => {
  assert.equal(shouldSkipBreadcrumb(makeConfig(''), 'no-workloom'), false)
})

test('shouldSkipBreadcrumb 特殊字符关键词转义', () => {
  assert.equal(shouldSkipBreadcrumb(makeConfig('c++'), 'learn c++ today'), true)
  assert.equal(shouldSkipBreadcrumb(makeConfig('c++'), 'learn c+ today'), false)
  assert.equal(shouldSkipBreadcrumb(makeConfig('a.b'), 'use a.b here'), true)
  assert.equal(shouldSkipBreadcrumb(makeConfig('a.b'), 'use axb here'), false)
})

test('shouldSkipBreadcrumb 句首与句尾命中', () => {
  assert.equal(shouldSkipBreadcrumb(makeConfig('no-workloom'), 'no-workloom please'), true)
  assert.equal(shouldSkipBreadcrumb(makeConfig('no-workloom'), 'please no-workloom'), true)
  assert.equal(shouldSkipBreadcrumb(makeConfig('no-workloom'), 'no-workloom'), true)
})

test('mergeOverlay 引入未声明步骤报错', () => {
  const contract = makeContract()
  const overlay = `#### 9.9 越界步骤
正文
`
  const [err, merged] = mergeOverlay(contract, overlay)
  assert.ok(err instanceof WorkflowContractError)
  assert.match(err.message, /not declared in the contract/)
  assert.equal(merged, null)
})

test('mergeOverlay 只覆盖步骤正文、保留内置标题', () => {
  const contract = makeContract()
  const overlay = `#### 1.0 别的标题
覆盖后的正文
`
  const [err, merged] = mergeOverlay(contract, overlay)
  assert.equal(err, null)
  const step = merged.steps.find((item) => item.id === '1.0')
  assert.ok(step)
  assert.equal(step.title, contract.steps.find((item) => item.id === '1.0').title)
  assert.equal(step.body, '覆盖后的正文')
  // 未被覆盖的步骤保持原状
  const untouched = merged.steps.find((item) => item.id === '2.1')
  assert.deepEqual(
    untouched,
    contract.steps.find((item) => item.id === '2.1'),
  )
})

test('mergeOverlay 不改原契约的 states 数组', () => {
  const contract = makeContract()
  const before = [...contract.states]
  const [err] = mergeOverlay(contract, '')
  assert.equal(err, null)
  assert.deepEqual(contract.states, before)
})
