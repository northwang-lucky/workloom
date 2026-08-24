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
