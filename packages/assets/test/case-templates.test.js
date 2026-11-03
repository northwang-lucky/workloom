import { test } from 'node:test'
import assert from 'node:assert/strict'

import { loadCaseResultTemplateText, loadCaseTemplateText } from '../index.js'

test('CASE 模板 loader 返回带 YAML 的完整资产', () => {
  const caseText = loadCaseTemplateText()
  const resultText = loadCaseResultTemplateText()
  assert.ok(caseText?.startsWith('---\nversion: 1\ntask:'))
  assert.ok(resultText?.startsWith('---\nversion: 1\ntask:'))
  for (const heading of ['## Static Review', '## Runtime Cases', '## Coverage', '## Traceability']) {
    assert.ok(caseText.includes(heading), heading)
  }
  for (const heading of ['## Static Review Results', '## Runtime Results', '## Standard Verification', '## Open issues']) {
    assert.ok(resultText.includes(heading), heading)
  }
  assert.ok(caseText.endsWith('\n'))
  assert.ok(resultText.endsWith('\n'))
})
