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

test('契约 v6 含 norms 块（两组规范）且措辞与 1.1/2.1 正文一致', () => {
  const [err, contract] = parseContract(readFileSync(assetPath, 'utf8'))
  assert.equal(err, null)
  assert.equal(contract.version, 6)
  assert.ok(contract.norms !== null, 'v6 契约必须含 norms 块')
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
