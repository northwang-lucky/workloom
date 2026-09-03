/**
 * 注入链路测试：assembleSessionContextText 从契约文本组装快照（norms 透传）。
 * 契约样本文本自给自足，不依赖真实资产内容；node:test 风格（bun test 兼容）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import { SESSION_CONTEXT_CUSTOM_TYPE } from '../src/constants.ts'
import {
  assembleSessionContextText,
  composeMainLocalDirectives,
  registerInjections,
} from '../src/inject.ts'

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

/** 构造临时项目根并写入 main.md + all.md（均无条件注入，requiresTools 已移除）。 */
function makeFragmentsRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'workloom-pi-inject-fragments-'))
  const promptsDir = join(root, '.workloom', 'prompts.local')
  mkdirSync(promptsDir, { recursive: true })
  writeFileSync(join(promptsDir, 'main.md'), 'MAIN-UNCONDITIONAL-FRAGMENT')
  writeFileSync(join(promptsDir, 'all.md'), 'ALL-FRAGMENT')
  return root
}

test('composeMainLocalDirectives: main 与 all 片段都注入（无条件）', () => {
  const root = makeFragmentsRoot()
  try {
    const [err, text] = composeMainLocalDirectives(root)
    assert.equal(err, null)
    assert.ok(text.includes('MAIN-UNCONDITIONAL-FRAGMENT'))
    assert.ok(text.includes('ALL-FRAGMENT'))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('assembleSessionContextText: 传 localDirectives → 快照含 Local directives 小节与内容（TC4）', () => {
  const root = makeRoot()
  try {
    const [err, text] = assembleSessionContextText(
      root,
      'pi_sess-1',
      CONTRACT_WITH_NORMS,
      'MAIN-LOCAL-DIRECTIVE',
    )
    assert.equal(err, null)
    assert.ok(text !== null)
    assert.ok(text.includes('Local directives:'))
    assert.ok(text.includes('MAIN-LOCAL-DIRECTIVE'))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('assembleSessionContextText: 不传 localDirectives → 无 Local directives 小节（基线不变）', () => {
  const root = makeRoot()
  try {
    const [err, text] = assembleSessionContextText(root, 'pi_sess-1', CONTRACT_WITH_NORMS)
    assert.equal(err, null)
    assert.ok(text !== null)
    assert.ok(!text.includes('Local directives:'))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

/** 构造捕获监听注册与 sendMessage 调用的 mock pi（session_start 端到端接线断言用）。 */
function makeInjectingPi() {
  const listeners = new Map<string, (event: unknown, ctx: unknown) => void>()
  const sent: { customType: string; content: string; display: boolean }[] = []
  const pi = {
    on: (event: string, listener: (event: unknown, ctx: unknown) => void) => {
      listeners.set(event, listener)
    },
    sendMessage: (message: { customType: string; content: string; display: boolean }) => {
      sent.push(message)
    },
  } as unknown as ExtensionAPI
  return { pi, listeners, sent }
}

/** 构造 session_start 的 mock ctx（cwd 在 .workloom 项目内 + 会话 id）。 */
function makeSessionCtx(root: string) {
  return { cwd: root, sessionManager: { getSessionId: () => 'sess-1' } }
}

test('session_start 注入：快照含 Local directives 小节与 main/all 片段（TC4 接线）', () => {
  const root = makeFragmentsRoot()
  try {
    const { pi, listeners, sent } = makeInjectingPi()
    registerInjections(pi)
    const handler = listeners.get('session_start')
    assert.ok(handler !== undefined)
    handler({ reason: 'startup' }, makeSessionCtx(root))
    assert.equal(sent.length, 1)
    const message = sent[0]
    assert.ok(message !== undefined)
    assert.equal(message.customType, SESSION_CONTEXT_CUSTOM_TYPE)
    assert.ok(message.content.includes('<workloom-session-context>'))
    assert.ok(message.content.includes('Local directives:'))
    assert.ok(message.content.includes('MAIN-UNCONDITIONAL-FRAGMENT'))
    assert.ok(message.content.includes('ALL-FRAGMENT'))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('assembleSessionContextText: mainModel 传参 → 画像节首行带主模型（provider/id）', () => {
  const root = makeRoot()
  try {
    const [err, text] = assembleSessionContextText(
      root,
      'pi_sess-1',
      CONTRACT_WITH_NORMS,
      undefined,
      'kimi-coding/k3',
    )
    assert.equal(err, null)
    assert.ok(text !== null)
    assert.ok(
      text.includes('Executor profiles (main model kimi-coding/k3):'),
      '画像首行必须携带传入的主会话模型',
    )
    assert.ok(!text.includes('main model unknown'), '传入主模型必须替换 unknown 首行')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('session_start 注入：ExtensionContext 带 model 时画像首行透传主会话模型', () => {
  const root = makeFragmentsRoot()
  try {
    const { pi, listeners, sent } = makeInjectingPi()
    registerInjections(pi)
    const handler = listeners.get('session_start')
    assert.ok(handler !== undefined)
    const ctx = {
      ...makeSessionCtx(root),
      model: { provider: 'kimi-coding', id: 'k3' },
    }
    handler({ reason: 'startup' }, ctx)
    assert.equal(sent.length, 1)
    const message = sent[0]
    assert.ok(message !== undefined)
    assert.ok(message.content.includes('<workloom-session-context>'))
    assert.ok(
      message.content.includes('Executor profiles (main model kimi-coding/k3):'),
      '注入文本画像首行必须携带 ctx.model 的主会话模型',
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('session_start 注入：ExtensionContext 无 model 时画像首行走 main model unknown 分支（不造数据）', () => {
  const root = makeFragmentsRoot()
  try {
    const { pi, listeners, sent } = makeInjectingPi()
    registerInjections(pi)
    const handler = listeners.get('session_start')
    assert.ok(handler !== undefined)
    handler({ reason: 'startup' }, makeSessionCtx(root))
    assert.equal(sent.length, 1)
    const message = sent[0]
    assert.ok(message !== undefined)
    assert.ok(
      message.content.includes('Executor profiles (main model unknown; whenMain entries skipped):'),
      '取不到主会话模型时标注 unknown 且 whenMain 跳过（不 fail loud）',
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('session_start 注入（片段组装失败）：只告警不阻塞，快照照常注入且无 Local directives 小节', () => {
  const root = mkdtempSync(join(tmpdir(), 'workloom-pi-inject-bad-fragment-'))
  mkdirSync(join(root, '.workloom', 'prompts.local'), { recursive: true })
  // all.md 含未知 front-matter 字段 → 片段组装 fail loud；main.md 合法但同批被弃。
  writeFileSync(join(root, '.workloom', 'prompts.local', 'main.md'), 'MAIN-OK')
  writeFileSync(
    join(root, '.workloom', 'prompts.local', 'all.md'),
    '---\nbogusField: 1\n---\nALL-BAD',
  )
  const warnings: string[] = []
  const originalWarn = console.warn
  console.warn = (message: unknown) => {
    warnings.push(String(message))
  }
  try {
    const { pi, listeners, sent } = makeInjectingPi()
    registerInjections(pi)
    const handler = listeners.get('session_start')
    assert.ok(handler !== undefined)
    handler({ reason: 'startup' }, makeSessionCtx(root))
    assert.equal(warnings.length, 1)
    const warning = warnings[0]
    assert.ok(warning !== undefined)
    assert.match(warning, /local directives/)
    assert.equal(sent.length, 1, '注入是增强不是门禁：片段失败不阻塞会话快照')
    const message = sent[0]
    assert.ok(message !== undefined)
    assert.equal(message.customType, SESSION_CONTEXT_CUSTOM_TYPE)
    assert.ok(!message.content.includes('Local directives:'))
    assert.ok(!message.content.includes('MAIN-OK'))
  } finally {
    console.warn = originalWarn
    rmSync(root, { recursive: true, force: true })
  }
})
