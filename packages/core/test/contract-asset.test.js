/**
 * 资产契约兼容测试：assets 的 workflow.md 必须能被 core 的 parseContract 解析。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { parseContract } from '../src/legacy/workflow-contract.js'

const assetPath = fileURLToPath(new URL('../../assets/workflow/workflow.md', import.meta.url))

test('assets 的 workflow.md 可被 parseContract 解析', () => {
  const [err, contract] = parseContract(readFileSync(assetPath, 'utf8'))
  assert.equal(err, null)
  assert.deepEqual(contract.states, ['no_task', 'planning', 'in_progress', 'completed'])
  // 四个状态块齐全，无 warnings
  for (const status of contract.states) {
    assert.ok(contract.breadcrumbs.has(status), `缺少 ${status} 的 tag 块`)
  }
  assert.deepEqual(contract.warnings, [])
})

test('契约 v12 含 norms 块（两组规范）且措辞与 1.1/2.1 正文一致', () => {
  const [err, contract] = parseContract(readFileSync(assetPath, 'utf8'))
  assert.equal(err, null)
  assert.equal(contract.version, 12)
  assert.ok(contract.norms !== null, 'v12 契约必须含 norms 块')
  // 两组规范齐全
  assert.match(contract.norms, /Questioning \(always-on\):/)
  assert.match(contract.norms, /Dispatch \(always-on\):/)
  // 提问四条与 1.1 正文逐字一致
  const alignBody = contract.steps.find((step) => step.id === '1.1').body
  const questionRules = [
    "Ask in the user's language; you judge which language that is from how the user writes.",
    'Keep the options out of the question text: the question states only what is being asked, and the options follow as a separate numbered list.',
    'Never use an interactive question tool (ask_user_question and equivalents); pose questions as plain text output on any runtime.',
    'Never ask one question at a time: once per stage, list every open question identified so far as one numbered batch, and let the user answer them freely, in any order and any subset.',
  ]
  for (const rule of questionRules) {
    assert.ok(contract.norms.includes(rule), `norms 缺提问规范：${rule}`)
    assert.ok(alignBody.includes(rule), `1.1 正文缺提问规范：${rule}`)
  }
  // 派发硬约束与 2.1 正文逐字一致
  const dispatchRule =
    'Hard constraint: the main session must not write implementation code directly — including test-first test seeds — and every implementation file change comes from the dispatched implement subagent.'
  const implementBody = contract.steps.find((step) => step.id === '2.1').body
  assert.ok(contract.norms.includes(dispatchRule), 'norms 缺派发硬约束')
  assert.ok(implementBody.includes(dispatchRule), '2.1 正文缺派发硬约束')
})

test('契约 v12 含 UI 固定问题与 1.1b/1.1c 定位', () => {
  const [err, contract] = parseContract(readFileSync(assetPath, 'utf8'))
  assert.equal(err, null)
  const uiBody = contract.steps.find((step) => step.id === '1.1').body
  assert.ok(
    uiBody.includes('Does this task involve frontend UI presentation?'),
    '1.1 正文缺 UI 固定问题措辞',
  )
  assert.ok(uiBody.includes('Phase 1.1b'), '1.1 正文缺 Phase 1.1b 定位')
  assert.ok(uiBody.includes('Phase 1.1c'), '1.1 正文缺 Phase 1.1c 定位')
})

test('契约 v12 锁定 frontend 派发强制（2.1）与 check UI 门禁（2.2）', () => {
  const [err, contract] = parseContract(readFileSync(assetPath, 'utf8'))
  assert.equal(err, null)
  const implementBody = contract.steps.find((step) => step.id === '2.1').body
  assert.ok(
    implementBody.includes('must go through a `workloom_execute` dispatch with `kind: frontend`'),
    '2.1 正文缺 frontend 派发强制措辞',
  )
  const checkBody = contract.steps.find((step) => step.id === '2.2').body
  assert.ok(
    checkBody.includes('it additionally refuses unless a `frontend` dispatch has been recorded'),
    '2.2 正文缺 UI 门禁措辞',
  )
})

test('契约 v12 锁定「推荐 → 用户确认 → 才创建」与 H1 门禁措辞', () => {
  const [err, contract] = parseContract(readFileSync(assetPath, 'utf8'))
  assert.equal(err, null)
  // 1.0 步骤正文：推荐建任务，用户确认后才创建
  const createBody = contract.steps.find((step) => step.id === '1.0').body
  assert.ok(
    createBody.includes('recommend whether it warrants a task'),
    '1.0 正文缺「推荐建任务」措辞',
  )
  assert.ok(
    createBody.includes('only after the user confirms'),
    '1.0 正文缺「用户确认后才创建」措辞',
  )
  // no_task 状态指引：纯问答豁免 + 用户确认后才创建
  const noTaskBreadcrumb = contract.breadcrumbs.get('no_task')
  assert.ok(
    noTaskBreadcrumb.includes('answer direct questions outright'),
    'no_task 缺纯问答豁免措辞',
  )
  assert.ok(
    noTaskBreadcrumb.includes('only after the user confirms'),
    'no_task 缺「用户确认后才创建」措辞',
  )
  // completed 状态指引：新任务同样需要推荐 + 用户确认
  const completedBreadcrumb = contract.breadcrumbs.get('completed')
  assert.ok(
    completedBreadcrumb.includes('recommend whether a new task is warranted'),
    'completed 缺「推荐新任务」措辞',
  )
  assert.ok(
    completedBreadcrumb.includes('only after the user confirms'),
    'completed 缺「用户确认后才创建」措辞',
  )
  // 1.4 正文：start 门禁要求 prd.md 以一级标题开头
  const reviewBody = contract.steps.find((step) => step.id === '1.4').body
  assert.ok(reviewBody.includes('prd.md has no H1 title'), '1.4 正文缺 H1 门禁措辞')
})

test('契约 v12 含 grilling 固定问题（时序/选项/后果/UI yes 不问）', () => {
  const [err, contract] = parseContract(readFileSync(assetPath, 'utf8'))
  assert.equal(err, null)
  const alignBody = contract.steps.find((step) => step.id === '1.1').body
  assert.ok(
    alignBody.includes('does this task involve design-tree grilling?'),
    '1.1 正文缺 grilling 固定问题措辞',
  )
  assert.ok(
    alignBody.includes('A. yes: grilling joins the alignment scope (Phase 1.1c)'),
    '缺 A 选项与 1.1c 定位',
  )
  assert.ok(alignBody.includes('- B. no.'), '缺 B 选项')
  assert.ok(alignBody.includes('phase=grilling, required=true'), '缺 For A 判定记录指引')
  assert.ok(alignBody.includes('passedAt + summary'), '缺收敛记录指引')
  assert.ok(alignBody.includes('acceptance criteria'), '缺收敛结论入验收标准指引')
  assert.ok(alignBody.includes('go straight into Phase 1.1c'), '缺「UI yes 不再问 grilling」的明文')
  // 三个固定问题按流程时序编排：test-first → UI → grilling
  const questionHeadings = [
    'The fixed test-first question',
    'The fixed UI-design question',
    'The fixed grilling question',
  ]
  let cursor = -1
  for (const heading of questionHeadings) {
    const at = alignBody.indexOf(heading)
    assert.ok(at > cursor, `1.1 固定问题时序错乱：${heading}`)
    cursor = at
  }
})

test('契约 v12 planning 面包屑为行动指令式（brainstorm → grilling → 收敛前不 finalize prd）', () => {
  const [err, contract] = parseContract(readFileSync(assetPath, 'utf8'))
  assert.equal(err, null)
  const crumb = contract.breadcrumbs.get('planning')
  assert.ok(
    crumb.includes('load the workloom-brainstorm skill'),
    'planning 缺 load brainstorm 行动指令',
  )
  assert.ok(crumb.includes('fixed grilling question'), 'planning 缺固定 grilling 问题指令')
  assert.ok(
    crumb.includes('do not finalize prd.md before grilling converges'),
    'planning 缺收敛前不 finalize prd 指令',
  )
})

test('契约 v12 norms Grilling 条目含补强句（planning 在 brainstorm 后 grilling，收敛前不 finalize prd）', () => {
  const [err, contract] = parseContract(readFileSync(assetPath, 'utf8'))
  assert.equal(err, null)
  assert.ok(
    contract.norms.includes('In the planning phase, run grilling after brainstorm'),
    'norms 缺「planning 阶段在 brainstorm 之后运行 grilling」补强',
  )
  assert.ok(
    contract.norms.includes('do not finalize prd.md before grilling converges'),
    'norms 缺「收敛前不得 finalize prd.md」补强',
  )
})

test('契约步骤节覆盖 Phase 1/2/3 全部编号', () => {
  const [, contract] = parseContract(readFileSync(assetPath, 'utf8'))
  const ids = contract.steps.map((step) => step.id)
  assert.deepEqual(ids, ['1.0', '1.1', '1.2', '1.3', '1.4', '2.1', '2.2', '2.3', '3.1'])
  // 关键步骤含完成判据（no grey areas gate 文案在 1.1）
  const alignStep = contract.steps.find((step) => step.id === '1.1')
  assert.match(alignStep.body, /no grey areas/)
  const loopStep = contract.steps.find((step) => step.id === '2.1')
  assert.match(loopStep.body, /red-green/)
})
