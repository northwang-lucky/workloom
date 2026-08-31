/**
 * 注入链路测试：assembleSessionContextText 从契约文本组装快照（norms 透传）。
 * 测试依赖 dist（test 脚本先 build 再跑 node --test），契约样本文本自给自足。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { assembleSessionContextText } from '../dist/plugin.js'

/** 构造 .workloom 项目根（目录存在即命中自激活判定）。 */
function makeRoot() {
  const root = mkdtempSync(join(tmpdir(), 'workloom-dsh-inject-'))
  mkdirSync(join(root, '.workloom'), { recursive: true })
  return root
}

/** 构造注入目标（最小形状：root + agent.id 用于 contextKey；options/session 供 delegationDepthOf 读取）。 */
function makeTarget(root) {
  return { root, agent: { id: 'agent-1', options: {}, session: { header: {} } } }
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

test('旧契约（无 norms 块）：快照不追加 Always-on norms 小节', () => {
  const root = makeRoot()
  try {
    const text = assembleSessionContextText(makeTarget(root), CONTRACT_NO_NORMS)
    assert.ok(text.startsWith('<workloom-session-context>\n'), 'snapshot must be wrapped')
    assert.ok(text.includes('No active task.'), 'no pointer renders no active task')
    assert.ok(text.includes('Workflow: 1.1 Align requirements'), 'overview renders steps')
    assert.ok(!text.includes('Always-on norms:'), 'no norms block must not render section')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('含 norms 块契约：快照末尾追加 Always-on norms 小节（原文保留）', () => {
  const root = makeRoot()
  try {
    const text = assembleSessionContextText(makeTarget(root), CONTRACT_WITH_NORMS)
    const normsIdx = text.indexOf('Always-on norms:')
    assert.ok(normsIdx >= 0, 'norms section must render')
    assert.ok(normsIdx > text.indexOf('Workflow: '), 'norms section must come after overview')
    assert.ok(text.includes('Questioning (always-on):'), 'norms body keeps original text')
    assert.ok(
      text.includes('Implementation changes come from workloom_execute subagents.'),
      'dispatch norm keeps original text',
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('委派深度>0：快照 norms 段整体替换为 executor 版（零派发语义）', () => {
  const root = makeRoot()
  try {
    // 深度由调用方（plugin 的 text provider 经 delegationDepthOf(target.agent) 读取）透传第三参。
    const text = assembleSessionContextText(makeTarget(root), CONTRACT_WITH_NORMS, 1)
    const normsIdx = text.indexOf('Always-on norms:')
    assert.ok(normsIdx >= 0, 'executor norms section must render for depth > 0')
    assert.ok(normsIdx > text.indexOf('Workflow: '), 'overview kept before norms')
    assert.ok(
      !text.includes('Implementation changes come from workloom_execute subagents.'),
      'contract norms must be replaced entirely',
    )
    assert.ok(text.includes('leaf executor'), 'executor norms name the leaf executor role')
    assert.ok(!text.includes('dispatch'), 'executor norms carry zero dispatch semantics')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
