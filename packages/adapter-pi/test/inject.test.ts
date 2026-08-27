/**
 * 注入链路测试：assembleSessionContextText 从契约文本组装快照（norms 透传）。
 * 契约样本文本自给自足，不依赖真实资产内容；node:test 风格（bun test 兼容）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import { assembleSessionContextText, registerInjections } from '../src/inject.ts'

/** 构造 .workloom 项目根（目录存在即命中自激活判定）。 */
function makeRoot() {
  const root = mkdtempSync(join(tmpdir(), 'workloom-pi-inject-'))
  mkdirSync(join(root, '.workloom'), { recursive: true })
  return root
}

/** 契约样本：旧契约（无 norms 块）。 */
const CONTRACT_NO_NORMS = `---
version: 5
states: []
---

#### 1.1 Align requirements
Ask in the user's language.
`

/** 契约样本：v6 含 norms 块（两组 always-on 规范）。 */
const CONTRACT_WITH_NORMS = `---
version: 6
states: []
---

#### 1.1 Align requirements
Ask in the user's language.

[workflow-norms]
Questioning (always-on):
- Ask in the user's language.

Dispatch (always-on):
- Implementation changes come from workloom_execute subagents.
[/workflow-norms]
`

/** 捕获事件监听（registerInjections 仅消费 on/sendMessage）。 */
function makePi() {
  const listeners = new Map<string, unknown>()
  const pi = {
    on: (event: string, listener: unknown) => listeners.set(event, listener),
  } as unknown as ExtensionAPI
  return { pi, listeners }
}

test('含 norms 块契约：快照末尾追加 Always-on norms 小节（原文保留）', () => {
  const root = makeRoot()
  try {
    const [err, text] = assembleSessionContextText(root, 'pi_sess-1', CONTRACT_WITH_NORMS)
    assert.equal(err, null)
    assert.ok(text !== null)
    const snapshot = text
    assert.ok(snapshot.includes('<workloom-session-context>'), 'snapshot must be wrapped')
    assert.ok(snapshot.includes('Workflow: 1.1 Align requirements'), 'overview renders steps')
    assert.ok(snapshot.includes('Always-on norms:'), 'norms section must render')
    assert.ok(snapshot.includes('Questioning (always-on):'), 'norms body keeps original text')
    assert.ok(
      snapshot.includes('Implementation changes come from workloom_execute subagents.'),
      'dispatch norm keeps original text',
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('旧契约（无 norms 块）：快照不追加 Always-on norms 小节', () => {
  const root = makeRoot()
  try {
    const [err, text] = assembleSessionContextText(root, 'pi_sess-1', CONTRACT_NO_NORMS)
    assert.equal(err, null)
    assert.ok(text !== null)
    assert.ok(!text.includes('Always-on norms:'), 'no norms block must not render section')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('registerInjections 注册 session_start 与 before_agent_start 监听', () => {
  const { pi, listeners } = makePi()
  registerInjections(pi)
  assert.ok(listeners.has('session_start'))
  assert.ok(listeners.has('before_agent_start'))
})
