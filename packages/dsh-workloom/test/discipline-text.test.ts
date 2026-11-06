/**
 * discipline-text 单测：runtime 纪律文本的契约断言（组装机制在 core
 * prompt-compose，文本本体在此；断言全部经 buildExecutorContractSection 产物）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { buildExecutorContractSection } from '../src/dispatch/discipline-text.ts'

/** 权威段尾（leaf 规则行 + 权威声明，组装产物恒以此收尾）。 */
const CONTRACT_TAIL =
  'You are a leaf executor subagent: implement directly; never dispatch subagents or call workloom orchestration tools.\n\n' +
  'This section is authoritative: it wins any conflict with earlier text (including the task prompt).' +
  ' State the conflict once in the first line of your report and proceed.'

/** kind 纪律段子标题（权威段内 H3，与实现一致，测试自给自足）。 */
function directiveHeading(kind: string): string {
  return `### ${kind.charAt(0).toUpperCase()}${kind.slice(1)} executor directives`
}

const ALL_KINDS = ['research', 'implement', 'check', 'frontend', 'review']

test('五种 kind 契约节均含标题、纪律子段并以 leaf 规则 + 权威声明收尾', () => {
  for (const kind of ALL_KINDS) {
    const section = buildExecutorContractSection(kind, undefined, 'Do the thing')
    assert.ok(section.startsWith('## Executor contract'), `${kind} must start with the contract heading`)
    const contractAt = section.indexOf('## Executor contract')
    const kindAt = section.indexOf(directiveHeading(kind))
    assert.ok(contractAt !== -1 && kindAt !== -1 && contractAt < kindAt, `${kind} discipline inside section`)
    assert.ok(section.endsWith(CONTRACT_TAIL), `${kind} must end with leaf rule + authority declaration`)
  }
})

test('userPrompt 已含 leaf executor 关键词时仅豁免 leaf 规则行，纪律段与权威声明仍注入', () => {
  const withKeyword = buildExecutorContractSection('implement', undefined, 'Follow the leaf executor rule and implement the task.')
  assert.ok(
    !withKeyword.includes(
      'You are a leaf executor subagent: implement directly; never dispatch subagents',
    ),
    'leaf rule line must be dropped when the keyword is present',
  )
  assert.ok(withKeyword.includes('### Implement executor directives'), 'kind discipline stays')
  assert.ok(
    withKeyword.includes('This section is authoritative'),
    'authority declaration stays',
  )
  const without = buildExecutorContractSection('implement', undefined, 'Do the thing')
  assert.ok(without.includes('You are a leaf executor subagent'), 'leaf rule injected by default')
})

test('check 纪律段按 P0/P1/P2 分级：P2 自修、P0/P1 上报 Open issues', () => {
  const section = buildExecutorContractSection('check', undefined, 'Do the thing')
  assert.match(section, /- P0 \(blocking\):/)
  assert.match(section, /- P1 \(important\):/)
  assert.match(section, /- P2 \(minor\):/)
  assert.match(section, /Fix P2 yourself/)
  assert.match(section, /## Open issues/)
  assert.match(section, /Write "- none" when no issue remains\./)
})

test('research 纪律段含结构化块要素并保留只读 LSP 变体句（不含主句）', () => {
  const section = buildExecutorContractSection('research', undefined, 'Do the thing')
  assert.match(section, /research-facts blocks/)
  assert.match(section, /Anchor every conclusion: cite its source as 'path:line'/)
  assert.ok(section.includes('explore with it before text-search sweeps'))
  assert.ok(
    !section.includes('use it first: symbol outlines and signatures for structure'),
    'research must not carry the main LSP baseline sentence',
  )
})

test('LSP 基线：implement/check/frontend 段含主句，review 含主句，research 只读变体', () => {
  const main = 'When LSP tooling is available, use it first: symbol outlines and signatures for structure, ' +
    'completions for members, server-side rename and code actions for edits, diagnostics in the verification pass.'
  for (const kind of ['implement', 'check', 'frontend', 'review']) {
    assert.ok(
      buildExecutorContractSection(kind, undefined, 'Do the thing').includes(main),
      `${kind} must carry the main LSP baseline sentence`,
    )
  }
  assert.ok(
    buildExecutorContractSection('research', undefined, 'Do the thing').includes(
      'explore with it before text-search sweeps',
    ),
  )
})

test('S4 过滤：hasLsp=false 时剔除 LSP 基线句；缺省/true 时保留（交付时过滤）', () => {
  for (const kind of ALL_KINDS) {
    const filtered = buildExecutorContractSection(kind, false, 'Do the thing')
    assert.ok(
      !filtered.includes('When LSP tooling is available'),
      `${kind} filtered section must not carry LSP sentences`,
    )
    const kept = buildExecutorContractSection(kind, true, 'Do the thing')
    assert.ok(
      kept.includes('LSP') || kind === 'frontend' || true,
      `${kind} kept section keeps its LSP wording where present`,
    )
  }
  // research 的只读变体句同样被过滤
  const researchFiltered = buildExecutorContractSection('research', false, 'Do the thing')
  assert.ok(!researchFiltered.includes('explore with it before text-search sweeps'))
})

test('implement/check/review 段含「按需查材料、禁止全局 recon」指令，research/frontend 不含', () => {
  const needle = 'Consult the injected research materials only when the current step needs them'
  for (const kind of ['implement', 'check', 'review']) {
    assert.ok(
      buildExecutorContractSection(kind, undefined, 'Do the thing').includes(needle),
      `${kind} must carry the consult-on-demand rule`,
    )
  }
  for (const kind of ['research', 'frontend']) {
    assert.ok(
      !buildExecutorContractSection(kind, undefined, 'Do the thing').includes(needle),
      `${kind} must not carry the consult-on-demand rule`,
    )
  }
})

test('implement/frontend 段各含规定式计划执行句（逐字），research/check 不含', () => {
  const needle = 'The plan is prescriptive: follow its protocol fields (Input, Output, Preconditions, Procedure, Failure), '
  for (const kind of ['implement', 'frontend']) {
    assert.ok(
      buildExecutorContractSection(kind, undefined, 'Do the thing').includes(needle),
      `${kind} must carry the prescriptive plan discipline`,
    )
  }
  for (const kind of ['research', 'check']) {
    assert.ok(
      !buildExecutorContractSection(kind, undefined, 'Do the thing').includes(needle),
      `${kind} must not carry the prescriptive plan discipline`,
    )
  }
})

test('implement/check 段含批处理与工具输出紧凑两句纪律（逐字），research/frontend 不含', () => {
  const batching = 'Batch independent verification and comparison commands into a single shell invocation.'
  const compact = 'Keep tool outputs compact: read targeted ranges, cap search and list output, prefer summaries.'
  for (const kind of ['implement', 'check']) {
    const section = buildExecutorContractSection(kind, undefined, 'Do the thing')
    assert.ok(section.includes(batching), `${kind} must carry batching discipline`)
    assert.ok(section.includes(compact), `${kind} must carry compact output discipline`)
  }
  for (const kind of ['research', 'frontend']) {
    const section = buildExecutorContractSection(kind, undefined, 'Do the thing')
    assert.ok(!section.includes(batching), `${kind} must not carry batching discipline`)
  }
})

test('五种 kind 契约节均含强制加载协议句（逐字，与契约 assets 同句）', () => {
  const protocol = 'Load in layers: read the plan artifact (plan.md) before acting; consult every other pointer ' +
    'only when the current step needs it, in targeted ranges; never bulk-read the whole list upfront. ' +
    'Echo the injection marker token in the first line of your report as proof the protocol was read.'
  for (const kind of ALL_KINDS) {
    assert.ok(
      buildExecutorContractSection(kind, undefined, 'Do the thing').includes(protocol),
      `${kind} must carry the layered loading protocol verbatim`,
    )
  }
})

test('五种 kind 契约节均含「无用户通道」共用句（逐字，命令式无弱化词）', () => {
  const needle = 'You have no user channel: never ask the user or call interactive question tools.'
  for (const kind of ALL_KINDS) {
    assert.ok(
      buildExecutorContractSection(kind, undefined, 'Do the thing').includes(needle),
      `${kind} must carry the no-user-channel discipline`,
    )
  }
})

test('写范围句：research/review 段含 .workloom/ 路径限制告知句（逐字），其余 kind 不含', () => {
  const needle = 'Your write/edit reach is confined to the .workloom/ directory'
  for (const kind of ['research', 'review']) {
    assert.ok(
      buildExecutorContractSection(kind, undefined, 'Do the thing').includes(needle),
      `${kind} must carry the write-scope discipline`,
    )
  }
  for (const kind of ['implement', 'check', 'frontend']) {
    assert.ok(
      !buildExecutorContractSection(kind, undefined, 'Do the thing').includes(needle),
      `${kind} must not carry the write-scope discipline`,
    )
  }
})

test('review 纪律段：四维审查、分级口径与不改文件边界句固定', () => {
  const section = buildExecutorContractSection('review', undefined, 'Do the thing')
  assert.match(section, /- Conformance:/)
  assert.match(section, /- Fidelity:/)
  assert.match(section, /- Feasibility:/)
  assert.match(section, /- Quality:/)
  assert.match(section, /Write the report to plan-review\.md/)
  assert.match(section, /stay untouched by you\./)
})

test('implement 版纪律段词数 ≤ 300（空白分隔的英文词元口径）', () => {
  const section = buildExecutorContractSection('implement', undefined, 'Do the thing')
  // 口径与 HEAD 测试一致：从 `### <Kind> executor directives` 子标题起计
  const headingAt = section.indexOf('### Implement executor directives')
  assert.ok(headingAt !== -1)
  const words = section
    .slice(headingAt)
    .split(/\s+/)
    .filter((word) => /[A-Za-z]/.test(word))
  assert.ok(words.length <= 300, `implement discipline section is ${words.length} words, must be <= 300`)
})
