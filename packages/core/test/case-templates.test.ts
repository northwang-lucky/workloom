import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

/** 相对 core 包 resources 根读取文本资源（模板路径随 resources 目录定版）。 */
function readResource(rel: string): string {
  return readFileSync(new URL(`../resources/${rel}`, import.meta.url), 'utf8')
}

/** 解析 front-matter 键集合（`---` 块内的 `key:` 首层字段）。 */
function frontMatterKeys(text: string): string[] {
  const match = /^---\n([\s\S]*?)\n---/.exec(text)
  if (match === null) return []
  return (match[1].match(/^[a-zA-Z][a-zA-Z0-9]*:/gm) ?? []).map((line) => line.slice(0, -1))
}

test('CASE 模板 loader 返回带 YAML 的完整资产', () => {
  const caseText = readResource('templates/case.md')
  const resultText = readResource('templates/case-result.md')
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
  // RESULT front-matter 键集合固定且不含 caseHash（哈希确认机制已删除，
  // codeBaseline/codeFingerprint 保留为当次代码证据）。
  assert.deepEqual(frontMatterKeys(resultText), [
    'version',
    'task',
    'codeBaseline',
    'checkSession',
    'status',
    'startedAt',
    'completedAt',
  ])
  assert.ok(!resultText.includes('caseHash'), 'RESULT 模板不得再含 caseHash')
})
