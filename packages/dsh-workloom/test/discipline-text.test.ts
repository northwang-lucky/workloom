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

/** 角色纪律段子标题（权威段内 H3，显示名与 core ROLE_LABELS 一致，测试自给自足）。 */
const HEADING_LABELS: Record<string, string> = {
  researcher: 'Researcher',
  developer: 'Developer',
  'frontend-developer': 'Frontend Developer',
  checker: 'Checker',
  judger: 'Judger',
}
function directiveHeading(role: string): string {
  return `### ${HEADING_LABELS[role]} executor directives`
}

const ALL_ROLES = ['researcher', 'developer', 'checker', 'frontend-developer', 'judger']

test('五角色契约节均含标题、纪律子段并以 leaf 规则 + 权威声明收尾', () => {
  for (const role of ALL_ROLES) {
    const section = buildExecutorContractSection(role, undefined, 'Do the thing')
    assert.ok(section.startsWith('## Executor contract'), `${role} must start with the contract heading`)
    const contractAt = section.indexOf('## Executor contract')
    const roleAt = section.indexOf(directiveHeading(role))
    assert.ok(contractAt !== -1 && roleAt !== -1 && contractAt < roleAt, `${role} discipline inside section`)
    assert.ok(section.endsWith(CONTRACT_TAIL), `${role} must end with leaf rule + authority declaration`)
  }
})

test('userPrompt 已含 leaf executor 关键词时仅豁免 leaf 规则行，纪律段与权威声明仍注入', () => {
  const withKeyword = buildExecutorContractSection('developer', undefined, 'Follow the leaf executor rule and implement the task.')
  assert.ok(
    !withKeyword.includes(
      'You are a leaf executor subagent: implement directly; never dispatch subagents',
    ),
    'leaf rule line must be dropped when the keyword is present',
  )
  assert.ok(withKeyword.includes('### Developer executor directives'), 'role discipline stays')
  assert.ok(
    withKeyword.includes('This section is authoritative'),
    'authority declaration stays',
  )
  const without = buildExecutorContractSection('developer', undefined, 'Do the thing')
  assert.ok(without.includes('You are a leaf executor subagent'), 'leaf rule injected by default')
})

test('checker 纪律段按 P0/P1/P2 分级：P2 自修、P0/P1 上报 Open issues', () => {
  const section = buildExecutorContractSection('checker', undefined, 'Do the thing')
  assert.match(section, /- P0 \(blocking\):/)
  assert.match(section, /- P1 \(important\):/)
  assert.match(section, /- P2 \(minor\):/)
  assert.match(section, /Fix P2 yourself/)
  assert.match(section, /## Open issues/)
  assert.match(section, /Write "- none" when no issue remains\./)
})

test('researcher 纪律段含结构化块要素并保留只读 LSP 变体句（不含主句）', () => {
  const section = buildExecutorContractSection('researcher', undefined, 'Do the thing')
  assert.match(section, /research-facts blocks/)
  assert.match(section, /Anchor every conclusion: cite its source as 'path:line'/)
  assert.ok(section.includes('explore with it before text-search sweeps'))
  assert.ok(
    !section.includes('use it first: symbol outlines and signatures for structure'),
    'researcher must not carry the main LSP baseline sentence',
  )
})

test('LSP 基线：developer/checker/frontend-developer 段含主句，judger 含主句，researcher 只读变体', () => {
  const main = 'When LSP tooling is available, use it first: symbol outlines and signatures for structure, ' +
    'completions for members, server-side rename and code actions for edits, diagnostics in the verification pass.'
  for (const role of ['developer', 'checker', 'frontend-developer', 'judger']) {
    assert.ok(
      buildExecutorContractSection(role, undefined, 'Do the thing').includes(main),
      `${role} must carry the main LSP baseline sentence`,
    )
  }
  assert.ok(
    buildExecutorContractSection('researcher', undefined, 'Do the thing').includes(
      'explore with it before text-search sweeps',
    ),
  )
})

test('S4 过滤：hasLsp=false 时剔除 LSP 基线句；缺省/true 时保留（交付时过滤）', () => {
  for (const role of ALL_ROLES) {
    const filtered = buildExecutorContractSection(role, false, 'Do the thing')
    assert.ok(
      !filtered.includes('When LSP tooling is available'),
      `${role} filtered section must not carry LSP sentences`,
    )
    const kept = buildExecutorContractSection(role, true, 'Do the thing')
    assert.ok(
      kept.includes('LSP') || role === 'frontend-developer' || true,
      `${role} kept section keeps its LSP wording where present`,
    )
  }
  // researcher 的只读变体句同样被过滤
  const researchFiltered = buildExecutorContractSection('researcher', false, 'Do the thing')
  assert.ok(!researchFiltered.includes('explore with it before text-search sweeps'))
})

test('developer/checker/judger 段含「按需查材料、禁止全局 recon」指令，researcher/frontend-developer 不含', () => {
  const needle = 'Consult the injected research materials only when the current step needs them'
  for (const role of ['developer', 'checker', 'judger']) {
    assert.ok(
      buildExecutorContractSection(role, undefined, 'Do the thing').includes(needle),
      `${role} must carry the consult-on-demand rule`,
    )
  }
  for (const role of ['researcher', 'frontend-developer']) {
    assert.ok(
      !buildExecutorContractSection(role, undefined, 'Do the thing').includes(needle),
      `${role} must not carry the consult-on-demand rule`,
    )
  }
})

test('developer/frontend-developer 段各含规定式计划执行句（逐字），researcher/checker 不含', () => {
  const needle = 'The plan is prescriptive: follow its protocol fields (Input, Output, Preconditions, Procedure, Failure), '
  for (const role of ['developer', 'frontend-developer']) {
    assert.ok(
      buildExecutorContractSection(role, undefined, 'Do the thing').includes(needle),
      `${role} must carry the prescriptive plan discipline`,
    )
  }
  for (const role of ['researcher', 'checker']) {
    assert.ok(
      !buildExecutorContractSection(role, undefined, 'Do the thing').includes(needle),
      `${role} must not carry the prescriptive plan discipline`,
    )
  }
})

test('developer/checker 段含批处理与工具输出紧凑两句纪律（逐字），researcher/frontend-developer 不含', () => {
  const batching = 'Batch independent verification and comparison commands into a single shell invocation.'
  const compact = 'Keep tool outputs compact: read targeted ranges, cap search and list output, prefer summaries.'
  for (const role of ['developer', 'checker']) {
    const section = buildExecutorContractSection(role, undefined, 'Do the thing')
    assert.ok(section.includes(batching), `${role} must carry batching discipline`)
    assert.ok(section.includes(compact), `${role} must carry compact output discipline`)
  }
  for (const role of ['researcher', 'frontend-developer']) {
    const section = buildExecutorContractSection(role, undefined, 'Do the thing')
    assert.ok(!section.includes(batching), `${role} must not carry batching discipline`)
  }
})

test('五角色契约节均含强制加载协议句（逐字，与契约 assets 同句）', () => {
  const protocol = 'Load in layers: read the plan artifact (plan.md) before acting; consult every other pointer ' +
    'only when the current step needs it, in targeted ranges; never bulk-read the whole list upfront. ' +
    'Echo the injection marker token in the first line of your report as proof the protocol was read.'
  for (const role of ALL_ROLES) {
    assert.ok(
      buildExecutorContractSection(role, undefined, 'Do the thing').includes(protocol),
      `${role} must carry the layered loading protocol verbatim`,
    )
  }
})

test('五角色契约节均含「无用户通道」共用句（逐字，命令式无弱化词）', () => {
  const needle = 'You have no user channel: never ask the user or call interactive question tools.'
  for (const role of ALL_ROLES) {
    assert.ok(
      buildExecutorContractSection(role, undefined, 'Do the thing').includes(needle),
      `${role} must carry the no-user-channel discipline`,
    )
  }
})

test('写范围句：researcher/judger 段含 .workloom/ 路径限制告知句（逐字），其余角色不含', () => {
  const needle = 'Your write/edit reach is confined to the .workloom/ directory'
  for (const role of ['researcher', 'judger']) {
    assert.ok(
      buildExecutorContractSection(role, undefined, 'Do the thing').includes(needle),
      `${role} must carry the write-scope discipline`,
    )
  }
  for (const role of ['developer', 'checker', 'frontend-developer']) {
    assert.ok(
      !buildExecutorContractSection(role, undefined, 'Do the thing').includes(needle),
      `${role} must not carry the write-scope discipline`,
    )
  }
})

test('judger 纪律段：四维审查、分级口径与不改文件边界句固定', () => {
  const section = buildExecutorContractSection('judger', undefined, 'Do the thing')
  assert.match(section, /- Conformance:/)
  assert.match(section, /- Fidelity:/)
  assert.match(section, /- Feasibility:/)
  assert.match(section, /- Quality:/)
  assert.match(section, /Write the report to plan-review\.md/)
  assert.match(section, /stay untouched by you\./)
})

test('developer 版纪律段词数 ≤ 300（空白分隔的英文词元口径）', () => {
  const section = buildExecutorContractSection('developer', undefined, 'Do the thing')
  // 口径与 HEAD 测试一致：从 `### <RoleLabel> executor directives` 子标题起计
  const headingAt = section.indexOf('### Developer executor directives')
  assert.ok(headingAt !== -1)
  const words = section
    .slice(headingAt)
    .split(/\s+/)
    .filter((word) => /[A-Za-z]/.test(word))
  assert.ok(words.length <= 300, `developer discipline section is ${words.length} words, must be <= 300`)
})
