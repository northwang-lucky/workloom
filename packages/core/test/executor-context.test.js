/**
 * executor-context 单测：W9 上下文注入组装的预算/降级/报错行为（临时项目目录）。
 *
 * 覆盖：implement 全内联与统计；文件/总量预算截断与索引降级；research 只含 prd；
 * research 产物全文注入与 20K 截断（标题区+锚点区，含恰好 20K 边界与全 kind 注入）；
 * files 清单注入与去重；
 * 末尾终极权威段（kind 纪律段 + leaf 规则 + 权威声明）的注入位置/去重/分级语义；
 * implement/check 纪律段「先读材料、禁止全局 recon」指令；kind/effort 非法报错；
 * jsonl 坏行报错。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import {
  EFFORT_LEVELS,
  EXECUTOR_KINDS,
  assertEffort,
  assertKind,
  buildExecutorPrompt,
} from '../dist/legacy/executor-context.js'

/** 任务目录相对 .workloom 的路径（测试统一使用）。 */
const TASK_REL_PATH = 'tasks/08-24-demo'

/** 创建临时项目根（含任务目录）；测试结束清理。 */
function makeProject() {
  const root = mkdtempSync(join(tmpdir(), 'workloom-exec-'))
  mkdirSync(join(root, '.workloom', TASK_REL_PATH), { recursive: true })
  return root
}

/** 写任务目录内文件（自动建父目录）。 */
function writeTaskFile(root, name, content) {
  const abs = join(root, '.workloom', TASK_REL_PATH, name)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, content)
}

/** 写项目根内任意路径文件（自动建父目录）。 */
function writeRootFile(root, rel, content) {
  const abs = join(root, rel)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, content)
}

/** 写 .workloom/config.json（对象 → JSON）。 */
function writeConfig(root, doc) {
  writeFileSync(join(root, '.workloom', 'config.json'), JSON.stringify(doc))
}

/** 组装入参（kind 之外字段固定）。 */
function baseParams(root, kind) {
  return { root, taskRelPath: TASK_REL_PATH, kind, userPrompt: 'Do the thing' }
}

test('常量导出：effort 档位与 executor kind 枚举', () => {
  assert.deepEqual([...EFFORT_LEVELS], ['low', 'medium', 'high', 'xhigh', 'max'])
  assert.deepEqual(EXECUTOR_KINDS, {
    research: 'research',
    implement: 'implement',
    check: 'check',
    frontend: 'frontend',
  })
})

test('S1 jsonl 纯指针：implement/check 注入只含「路径 + reason + 先读后判」指针行，无文件全文', () => {
  const root = makeProject()
  try {
    writeTaskFile(root, 'prd.md', '# PRD\n')
    writeTaskFile(root, 'design.md', '# Design\n')
    writeTaskFile(root, 'implement.md', '# Implement\n')
    const entries = [
      '{"_example": "seed line"}',
      '{"file": "packages/a.js", "reason": "spec"}',
      '{"file": "packages/b.md", "reason": "research"}',
    ].join('\n')
    writeTaskFile(root, 'implement.jsonl', entries)
    writeTaskFile(root, 'check.jsonl', entries)
    writeRootFile(root, 'packages/a.js', 'const a = 1\nFULL_CONTENT_A_MARKER\n')
    writeRootFile(root, 'packages/b.md', '# B\nFULL_CONTENT_B_MARKER\n')
    for (const kind of ['implement', 'check']) {
      const [err, result] = buildExecutorPrompt(baseParams(root, kind))
      assert.equal(err, null)
      const text = result.text
      // 指针清单段带标题（指针行归入 Pointer list 段，与纪律句「injected pointer list」呼应）
      assert.ok(text.includes(POINTER_LIST_HEADING))
      // 两角色统一纯指针：指针行含路径 + reason + 先读后判
      assert.ok(text.includes('- packages/a.js (spec) — read before acting'))
      assert.ok(text.includes('- packages/b.md (research) — read before acting'))
      // 无文件全文进入注入（撤全文内联与预取）
      assert.ok(!text.includes('FULL_CONTENT_A_MARKER'))
      assert.ok(!text.includes('FULL_CONTENT_B_MARKER'))
      assert.ok(!text.includes('--- packages/a.js ---'))
      // seed _example 行被跳过，不产生指针行
      assert.ok(!text.includes('seed line'))
      // 指针行不算 inlined 文件：filesInlined 只含 artifact 块，filesPointed 计数指针
      assert.deepEqual(result.stats, { filesInlined: 3, filesPointed: 2, truncated: 0 })
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('S2 artifacts 提取：prd Requirements/Acceptance 全文保留、其余节标题指针；design/implement 只进 H2 目录 + 指针', () => {
  const root = makeProject()
  try {
    writeTaskFile(
      root,
      'prd.md',
      [
        '# 任务',
        '',
        '## Goal',
        '目标正文 GOAL_BODY_MARKER',
        '',
        '## Requirements',
        '需求正文 REQ_BODY_MARKER',
        '',
        '## Acceptance Criteria',
        '验收正文 ACC_BODY_MARKER',
        '',
        '## Notes',
        '备注正文 NOTES_BODY_MARKER',
        '',
      ].join('\n'),
    )
    writeTaskFile(
      root,
      'design.md',
      [
        '# Design',
        '',
        '## 1. 决策一',
        '设计正文 DESIGN_BODY_MARKER',
        '',
        '## 2. 决策二',
        '设计正文二 BODY2_MARKER',
        '',
      ].join('\n'),
    )
    writeTaskFile(root, 'implement.md', '# Implement\n')
    const [err, result] = buildExecutorPrompt(baseParams(root, 'implement'))
    assert.equal(err, null)
    const text = result.text
    // prd：Requirements/Acceptance 两节全文保留
    assert.ok(text.includes('## Requirements'))
    assert.ok(text.includes('REQ_BODY_MARKER'))
    assert.ok(text.includes('## Acceptance Criteria'))
    assert.ok(text.includes('ACC_BODY_MARKER'))
    // prd 其余节（Goal/Notes）只留标题指针，正文不进注入
    assert.ok(text.includes('Read in file: ## Goal, ## Notes'))
    assert.ok(!text.includes('GOAL_BODY_MARKER'))
    assert.ok(!text.includes('NOTES_BODY_MARKER'))
    // design：只进 H2 目录 + 文件指针，正文不进注入
    assert.ok(text.includes('## 1. 决策一'))
    assert.ok(text.includes('## 2. 决策二'))
    assert.ok(!text.includes('DESIGN_BODY_MARKER'))
    assert.ok(!text.includes('BODY2_MARKER'))
    // design 指针行逐字断言（正文由执行器按加载协议自读的入口）
    assert.ok(text.includes('Read the full document in the file.'))
    // implement：无 H2 节 → 只给文件指针（逐字断言，正文不进注入）
    assert.ok(text.includes('Read the full document in the file (no H2 sections).'))
    assert.ok(text.endsWith(CONTRACT_TAIL))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('jsonl 纯指针：指针行不受文件/总量预算影响（无截断、无索引降级）', () => {
  const root = makeProject()
  try {
    writeConfig(root, { context_injection: { max_file_bytes: 16, max_total_bytes: 1 } })
    writeTaskFile(root, 'prd.md', '# PRD\n')
    writeTaskFile(root, 'design.md', '# D\n')
    writeTaskFile(root, 'implement.md', '# I\n')
    writeTaskFile(
      root,
      'implement.jsonl',
      ['{"file": "a.txt", "reason": "first"}', '{"file": "b.txt", "reason": "second"}'].join('\n'),
    )
    writeRootFile(root, 'a.txt', 'x'.repeat(500))
    writeRootFile(root, 'b.txt', 'y'.repeat(500))
    const [err, result] = buildExecutorPrompt(baseParams(root, 'implement'))
    assert.equal(err, null)
    const text = result.text
    // 全部转指针行：无全文、无截断提示、无 [indexed] 降级
    assert.ok(text.includes('- a.txt (first) — read before acting'))
    assert.ok(text.includes('- b.txt (second) — read before acting'))
    assert.ok(!text.includes('[...truncated'))
    assert.ok(!text.includes('[indexed]'))
    assert.ok(!text.includes('x'.repeat(500)))
    assert.deepEqual(result.stats, { filesInlined: 3, filesPointed: 2, truncated: 0 })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('research 只内联 prd，无 jsonl 引用行', () => {
  const root = makeProject()
  try {
    writeTaskFile(root, 'prd.md', '# PRD\n')
    // 不建 design/implement 与 jsonl，验证 research 不读 jsonl、缺失 artifact 跳过
    const [err, result] = buildExecutorPrompt(baseParams(root, 'research'))
    assert.equal(err, null)
    const text = result.text
    assert.ok(text.includes('--- .workloom/tasks/08-24-demo/prd.md ---'))
    assert.ok(!text.includes('design.md'))
    assert.ok(!text.includes('implement.jsonl'))
    assert.deepEqual(result.stats, {
      filesInlined: 1,
      filesPointed: 0,
      truncated: 0,
    })
    assert.ok(text.includes('## Task prompt\nDo the thing'))
    assert.ok(text.endsWith(CONTRACT_TAIL))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('kind/effort 非法报错，undefined 放行', () => {
  assert.throws(() => assertEffort('ultra'), /invalid effort/)
  assert.throws(() => assertKind('bogus'), /invalid kind/)
  assert.doesNotThrow(() => assertEffort(undefined))
  assert.doesNotThrow(() => assertEffort('xhigh'))
  assert.doesNotThrow(() => assertKind('check'))
  const root = makeProject()
  try {
    writeTaskFile(root, 'prd.md', '# PRD\n')
    const [err, result] = buildExecutorPrompt(baseParams(root, 'bogus'))
    assert.ok(err instanceof Error)
    assert.match(err.message, /invalid kind/)
    assert.equal(result, null)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('jsonl 坏行报错（fail loud，带文件名与行号）', () => {
  const root = makeProject()
  try {
    writeTaskFile(root, 'prd.md', '# PRD\n')
    writeTaskFile(root, 'implement.jsonl', '{"file": "ok.txt"}\n{not json\n')
    writeRootFile(root, 'ok.txt', 'ok')
    const [err, result] = buildExecutorPrompt(baseParams(root, 'implement'))
    assert.ok(err instanceof Error)
    assert.match(err.message, /failed to parse implement\.jsonl line 2/)
    assert.equal(result, null)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('越界路径条目被跳过且防逃逸', () => {
  const root = makeProject()
  try {
    writeTaskFile(root, 'implement.jsonl', '{"file": "../secret.txt", "reason": "escape"}\n')
    const [err, built] = buildExecutorPrompt(baseParams(root, 'implement'))
    assert.equal(err, null)
    assert.doesNotMatch(built.text, /secret/)
    assert.equal(built.stats.filesPointed, 0)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('引用文件缺失时跳过指针行（不指向空）', () => {
  const root = makeProject()
  try {
    writeTaskFile(root, 'implement.jsonl', '{"file": "missing.txt", "reason": "gone"}\n')
    const [err, built] = buildExecutorPrompt(baseParams(root, 'implement'))
    assert.equal(err, null)
    assert.ok(!built.text.includes('missing.txt'))
    assert.equal(built.stats.filesPointed, 0)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('目录条目转指针行（与文件同口径，先读后判）', () => {
  const root = makeProject()
  try {
    writeTaskFile(
      root,
      'implement.jsonl',
      '{"file": "sub", "type": "directory", "reason": "dir"}\n',
    )
    mkdirSync(join(root, 'sub'), { recursive: true })
    const [err, built] = buildExecutorPrompt(baseParams(root, 'implement'))
    assert.equal(err, null)
    assert.ok(built.text.includes('- sub (dir) — read before acting'))
    assert.equal(built.stats.filesPointed, 1)
    assert.equal(built.stats.filesInlined, 0)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('无 file 且非 _example 的行报错', () => {
  const root = makeProject()
  try {
    writeTaskFile(root, 'implement.jsonl', '{"foo": 1}\n')
    const [err, built] = buildExecutorPrompt(baseParams(root, 'implement'))
    assert.ok(err)
    assert.match(err.message, /no file field/)
    assert.equal(built, null)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

/** 权威声明（与实现的固定尾部一致，测试自给自足）。 */
const AUTHORITY_DECLARATION =
  "This section is authoritative: when it conflicts with any earlier text (including the user prompt's own instructions), this section wins." +
  ' When an earlier instruction conflicts with this section, follow this section, state the conflict once in the first line of your report, and proceed — do not deliberate on which to obey.'

/** 权威段固定尾部（leaf 规则 + 权威声明，与实现的固定尾部一致，测试自给自足）。 */
const CONTRACT_TAIL =
  'You are a leaf executor subagent: implement directly; never dispatch subagents or call workloom orchestration tools.\n\n' +
  AUTHORITY_DECLARATION

test('prompt 末尾追加终极权威段：kind 纪律段 + leaf 规则 + 权威声明（所有 kind 一致生效）', () => {
  const root = makeProject()
  try {
    writeTaskFile(root, 'prd.md', '# PRD\n')
    for (const kind of ['research', 'implement', 'check', 'frontend']) {
      const [err, result] = buildExecutorPrompt(baseParams(root, kind))
      assert.equal(err, null)
      assert.ok(
        result.text.endsWith(CONTRACT_TAIL),
        `${kind} prompt must end with the authoritative contract tail (leaf rule + authority declaration)`,
      )
      // kind 纪律段并入权威段内部（位于 `## Executor contract` 标题之后、leaf 规则之前）
      const contractAt = result.text.indexOf('## Executor contract')
      const kindAt = result.text.indexOf(directiveHeading(kind))
      assert.ok(
        contractAt !== -1 && kindAt !== -1 && contractAt < kindAt,
        `${kind} discipline must live inside the authoritative contract section`,
      )
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('userPrompt 已含 leaf executor 关键词时仅豁免 leaf 规则行，纪律段与权威声明仍注入', () => {
  const root = makeProject()
  try {
    writeTaskFile(root, 'prd.md', '# PRD\n')
    const [err, result] = buildExecutorPrompt({
      root,
      taskRelPath: TASK_REL_PATH,
      kind: 'implement',
      userPrompt: 'Follow the leaf executor rule and implement the task.',
    })
    assert.equal(err, null)
    // 去重仅豁免 leaf 规则行：kind 纪律段与权威声明始终注入，权威兜底不因去重丢失
    assert.ok(result.text.includes('## Executor contract'))
    assert.ok(result.text.includes(directiveHeading('implement')))
    assert.ok(result.text.includes('Make the smallest change that satisfies the requirement'))
    assert.ok(!result.text.includes('You are a leaf executor subagent'))
    assert.ok(result.text.endsWith(AUTHORITY_DECLARATION))
    // userPrompt 原文保留（含关键词的正文仍在 prompt 中）
    const taskPrompt = '## Task prompt\nFollow the leaf executor rule and implement the task.'
    assert.ok(result.text.includes(taskPrompt))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

/** kind 纪律段子标题（权威段内 H3，与实现一致，测试自给自足）。 */
function directiveHeading(kind) {
  return `### ${kind.charAt(0).toUpperCase()}${kind.slice(1)} executor directives`
}

test('四种 kind 纪律段均并入末尾权威段（kind 子标题 + 正文硬指令）', () => {
  const root = makeProject()
  try {
    writeTaskFile(root, 'prd.md', '# PRD\n')
    const bodyKeywords = {
      research: 'Ground every conclusion in the real source',
      implement: 'Make the smallest change that satisfies the requirement',
      check: 'Classify every finding by severity',
      frontend: 'Touch frontend files only',
    }
    for (const kind of Object.keys(bodyKeywords)) {
      const [err, result] = buildExecutorPrompt(baseParams(root, kind))
      assert.equal(err, null)
      const text = result.text
      const taskPromptAt = text.indexOf('## Task prompt')
      const contractAt = text.indexOf('## Executor contract')
      const kindAt = text.indexOf(directiveHeading(kind))
      assert.ok(
        taskPromptAt !== -1 && contractAt !== -1 && taskPromptAt < contractAt,
        `${kind} authoritative contract must come after the task prompt`,
      )
      assert.ok(
        kindAt !== -1 && contractAt < kindAt,
        `${kind} discipline must live inside the authoritative contract section`,
      )
      assert.ok(text.includes(bodyKeywords[kind]), `${kind} directive body must be injected`)
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('check 纪律段按 P0/P1/P2 分级：P2 自修、P0/P1 上报 Open issues', () => {
  const root = makeProject()
  try {
    writeTaskFile(root, 'prd.md', '# PRD\n')
    const [err, result] = buildExecutorPrompt(baseParams(root, 'check'))
    assert.equal(err, null)
    const contractAt = result.text.indexOf('## Executor contract')
    const section = result.text.slice(contractAt)
    // 分级定义：P0 阻断（验收判据不满足 / 构建或测试红线失败 / 安全或数据风险）
    assert.match(section, /P0 \(blocking\)/)
    assert.match(section, /acceptance criteria/)
    assert.match(section, /lint \/ typecheck \/ build \/ tests/)
    assert.match(section, /security or data/)
    // P1 重要（行为或正确性缺陷 / 设计或 spec 偏离含跨文件语义变更 / 非本次引入即使机械性）
    assert.match(section, /P1 \(important\)/)
    assert.match(section, /behavioral or correctness/)
    assert.match(section, /design or spec/)
    assert.match(section, /cross-file/)
    assert.match(section, /pre-date this task/)
    // P2 次要（机械性 typo/命名/注释/格式/测试断言弱化 / 单文件局部小缺陷 / 无取舍合规修复）
    assert.match(section, /P2 \(minor\)/)
    assert.match(section, /typos/)
    assert.match(section, /single file/)
    assert.match(section, /compliance/)
    // 动作：P2 直接修（不修属失职）；P0/P1 不修、上报主会话决断
    assert.match(section, /Fix P2 findings yourself/)
    assert.match(section, /dereliction of duty/)
    assert.match(section, /Do not fix P0\/P1/)
    // 修复后运行项目验证
    assert.match(section, /lint \/ typecheck \/ tests/)
    // 报告末段结构化「仅存问题」段：行格式 [P0|P1|P2] + 无仅存问题时写 - none
    assert.match(section, /## Open issues/)
    assert.match(section, /- <file>:<line> \[P0\|P1\|P2\] <issue> — fix: <suggestion>/)
    assert.match(section, /"- none"/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('userPrompt 已含 kind 纪律段标题不影响权威段注入（kind 标题去重分支已删除）', () => {
  const root = makeProject()
  try {
    writeTaskFile(root, 'prd.md', '# PRD\n')
    // 对照：普通 prompt 权威段正常注入（含 check 纪律段正文）
    const [plainErr, plain] = buildExecutorPrompt(baseParams(root, 'check'))
    assert.equal(plainErr, null)
    assert.ok(plain.text.includes('## Open issues'))
    // 去重只看 leaf executor 关键词：userPrompt 含 kind 标题时权威段仍完整注入
    const [err, result] = buildExecutorPrompt({
      root,
      taskRelPath: TASK_REL_PATH,
      kind: 'check',
      userPrompt: 'Check executor directives are already given; run the review.',
    })
    assert.equal(err, null)
    assert.ok(result.text.includes('## Executor contract'))
    assert.ok(result.text.includes('## Open issues'))
    assert.ok(result.text.endsWith(CONTRACT_TAIL))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

/** 本机片段注入段标题（与实现一致，测试自给自足）。 */
const LOCAL_DIRECTIVES_HEADING = '## Local directives'

/** LSP 主基线句子（与实现一致，测试自给自足）。 */
const LSP_BASELINE_SENTENCE =
  'When LSP tooling is available, treat it as the first choice for code work: ' +
  'read structure through LSP symbol outlines and call signatures; ' +
  'resolve members and arguments with completions; ' +
  'rename symbols through server-side rename and fix them with code actions ' +
  'instead of hand-searched edits; ' +
  'and include an LSP diagnostics check in the verification pass.'

/** LSP 只读变体句子（research 纪律段专用，与实现一致，测试自给自足）。 */
const LSP_RESEARCH_BASELINE_SENTENCE =
  'When LSP tooling is available, explore through it before falling back to ' +
  'text-search sweeps: map code structure with LSP symbol outlines and resolve ' +
  'call signatures and members from the language server.'

test('localDirectives 传入：文本注入于 userPrompt 之后、终极权威段之前', () => {
  const root = makeProject()
  try {
    writeTaskFile(root, 'prd.md', '# PRD\n')
    const [err, result] = buildExecutorPrompt({
      root,
      taskRelPath: TASK_REL_PATH,
      kind: 'implement',
      userPrompt: 'Do the thing',
      localDirectives: 'Always use the LSP tools.\nRun lsp_diagnostics at the end.',
    })
    assert.equal(err, null)
    const taskPromptAt = result.text.indexOf('## Task prompt')
    const localAt = result.text.indexOf(LOCAL_DIRECTIVES_HEADING)
    const contractAt = result.text.indexOf('## Executor contract')
    assert.ok(localAt !== -1, 'local directives section must be present')
    assert.ok(
      taskPromptAt !== -1 && contractAt !== -1 && taskPromptAt < localAt && localAt < contractAt,
      'local directives must sit between the task prompt and the authoritative contract',
    )
    assert.ok(
      result.text.includes(
        `${LOCAL_DIRECTIVES_HEADING}\nAlways use the LSP tools.\nRun lsp_diagnostics at the end.`,
      ),
      'local directives body must be injected verbatim under the heading',
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('localDirectives 未传/空串：不插入且输出（除 marker 行外）逐字一致', () => {
  const root = makeProject()
  try {
    writeTaskFile(root, 'prd.md', '# PRD\n')
    const base = baseParams(root, 'check')
    const [plainErr, plain] = buildExecutorPrompt(base)
    const [emptyErr, empty] = buildExecutorPrompt({ ...base, localDirectives: '' })
    assert.equal(plainErr, null)
    assert.equal(emptyErr, null)
    // 缺省与空串输出（剔除随派发生成的唯一 marker 行后）逐字一致：marker 为
    // 单次注入标记，两次派发 token 不同属预期，其余内容不因 localDirectives 差异
    // 而改变（Pi 不传参 = 不注入，向后兼容）。
    assert.equal(stripMarkerLine(plain.text), stripMarkerLine(empty.text))
    assert.ok(!plain.text.includes(LOCAL_DIRECTIVES_HEADING))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('userPrompt 已含 ## Local directives 时不重复注入', () => {
  const root = makeProject()
  try {
    writeTaskFile(root, 'prd.md', '# PRD\n')
    const [err, result] = buildExecutorPrompt({
      root,
      taskRelPath: TASK_REL_PATH,
      kind: 'implement',
      userPrompt: '## Local directives\nUse my own local rules.',
      localDirectives: 'extra rules',
    })
    assert.equal(err, null)
    // 标题恰好出现一次（userPrompt 自带；本地段不再追加，正文也不注入）。
    assert.equal(
      result.text.indexOf(LOCAL_DIRECTIVES_HEADING),
      result.text.lastIndexOf(LOCAL_DIRECTIVES_HEADING),
      'heading must appear exactly once (from userPrompt only)',
    )
    assert.ok(!result.text.includes('extra rules'))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('research 纪律段含结构化块三要素且保留原始三句根', () => {
  const root = makeProject()
  try {
    writeTaskFile(root, 'prd.md', '# PRD\n')
    const [err, result] = buildExecutorPrompt(baseParams(root, 'research'))
    assert.equal(err, null)
    // research 纪律段并入末尾权威段：从 `## Executor contract` 起提取全文断言
    const contractAt = result.text.indexOf('## Executor contract')
    const section = result.text.slice(contractAt)
    // 原始三句根逐字保留（repo/language：agent 向运行时文案为英文）
    assert.match(section, /Produce an actionable report the implementer can follow directly\./)
    assert.match(
      section,
      /Ground every conclusion in the real source: read the actual files or data before claiming a fact, and cite file paths for each conclusion\./,
    )
    assert.match(
      section,
      /Separate verified findings from suggestions, and mark anything unverified as such\./,
    )
    // 结构化块三要素：节标题要点句 / 每条结论 path:line 锚点 / 代码围栏摘录
    assert.match(section, /'##' section headings/)
    assert.match(section, /takeaway in one sentence/)
    assert.match(section, /'path:line'/)
    assert.match(section, /fenced code blocks/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('LSP 基线：implement/check/frontend 纪律段含主句，research 段含只读变体句', () => {
  const root = makeProject()
  try {
    writeTaskFile(root, 'prd.md', '# PRD\n')
    for (const kind of ['implement', 'check', 'frontend']) {
      const [err, result] = buildExecutorPrompt(baseParams(root, kind))
      assert.equal(err, null)
      // kind 纪律段并入末尾权威段：从 `## Executor contract` 起提取全文断言
      const contractAt = result.text.indexOf('## Executor contract')
      const section = result.text.slice(contractAt)
      assert.ok(
        section.includes(LSP_BASELINE_SENTENCE),
        `${kind} discipline must carry the LSP main baseline sentence`,
      )
      assert.ok(
        !section.includes(LSP_RESEARCH_BASELINE_SENTENCE),
        `${kind} discipline must not carry the research-only variant sentence`,
      )
    }
    const [err, result] = buildExecutorPrompt(baseParams(root, 'research'))
    assert.equal(err, null)
    const contractAt = result.text.indexOf('## Executor contract')
    const section = result.text.slice(contractAt)
    assert.ok(
      section.includes(LSP_RESEARCH_BASELINE_SENTENCE),
      'research discipline must carry the read-only LSP variant sentence',
    )
    assert.ok(
      !section.includes(LSP_BASELINE_SENTENCE),
      'research discipline must not carry the LSP main baseline sentence',
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('S4 过滤：hasLsp=false 时纪律段不含 LSP 基线句；缺省/true 时保留（交付时过滤）', () => {
  const root = makeProject()
  try {
    writeTaskFile(root, 'prd.md', '# PRD\n')
    for (const kind of ['research', 'implement', 'check', 'frontend']) {
      // 无 LSP 工具：纪律段不注入 LSP 基线句（主句与 research 只读变体均剔除）
      const [noErr, noLsp] = buildExecutorPrompt({ ...baseParams(root, kind), hasLsp: false })
      assert.equal(noErr, null)
      const noSection = noLsp.text.slice(noLsp.text.indexOf('## Executor contract'))
      assert.ok(
        !noSection.includes(LSP_BASELINE_SENTENCE),
        `${kind} must drop the LSP main baseline when no LSP tooling`,
      )
      assert.ok(
        !noSection.includes(LSP_RESEARCH_BASELINE_SENTENCE),
        `${kind} must drop the LSP research variant when no LSP tooling`,
      )
      // 缺省（undefined）向后兼容：保留 LSP 句
      const [defErr, def] = buildExecutorPrompt(baseParams(root, kind))
      assert.equal(defErr, null)
      const defSection = def.text.slice(def.text.indexOf('## Executor contract'))
      assert.ok(
        kind === 'research'
          ? defSection.includes(LSP_RESEARCH_BASELINE_SENTENCE)
          : defSection.includes(LSP_BASELINE_SENTENCE),
        `${kind} default must keep the LSP sentence`,
      )
      // 显式 hasLsp=true 同样保留
      const [trueErr, withLsp] = buildExecutorPrompt({ ...baseParams(root, kind), hasLsp: true })
      assert.equal(trueErr, null)
      const trueSection = withLsp.text.slice(withLsp.text.indexOf('## Executor contract'))
      assert.ok(
        kind === 'research'
          ? trueSection.includes(LSP_RESEARCH_BASELINE_SENTENCE)
          : trueSection.includes(LSP_BASELINE_SENTENCE),
        `${kind} with LSP must keep the LSP sentence`,
      )
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

/** research 材料注入段标题（与实现一致，测试自给自足）。 */
const RESEARCH_MATERIALS_HEADING = '## Research materials'

/** jsonl 指针清单段标题（与实现一致，测试自给自足）。 */
const POINTER_LIST_HEADING = '## Pointer list'

/** files 清单注入段标题（与实现一致，测试自给自足）。 */
const FILES_LIST_HEADING = '## Involved files'

/** 纪律段「先读材料、禁止全局 recon」指令（与实现一致，测试自给自足）。 */
const READ_MATERIALS_RULE =
  'Read the injected research materials and file list before acting; do not re-discover ' +
  'the repository state (no git status/log sweeps, no whole-repo globs, no bulk reads of ' +
  'unrelated files).'

test('research 产物指针化：research/*.md 只给路径不内联正文，位于 artifacts 之后、Task prompt 之前', () => {
  const root = makeProject()
  try {
    writeTaskFile(root, 'prd.md', '# PRD\n')
    writeTaskFile(
      root,
      'research/a.md',
      '# A 材料\n\n## 节一\n\n- `a.go:1` 锚点\nRESEARCH_BODY_A\n',
    )
    writeTaskFile(
      root,
      'research/b.md',
      '# B 材料\n\n## 节二\n\n- `b.go:2` 锚点\nRESEARCH_BODY_B\n',
    )
    const [err, result] = buildExecutorPrompt(baseParams(root, 'implement'))
    assert.equal(err, null)
    const text = result.text
    assert.ok(text.includes(RESEARCH_MATERIALS_HEADING))
    // 只给路径指针行（先读后判），正文不进注入
    assert.ok(text.includes('- .workloom/tasks/08-24-demo/research/a.md — read before acting'))
    assert.ok(text.includes('- .workloom/tasks/08-24-demo/research/b.md — read before acting'))
    assert.ok(!text.includes('RESEARCH_BODY_A'))
    assert.ok(!text.includes('RESEARCH_BODY_B'))
    assert.ok(!text.includes('# A 材料'))
    // 位置：research 段在 artifact 块之后、Task prompt 之前（先读材料再行动）
    const artifactAt = text.indexOf('--- .workloom/tasks/08-24-demo/prd.md ---')
    const researchAt = text.indexOf(RESEARCH_MATERIALS_HEADING)
    const taskPromptAt = text.indexOf('## Task prompt')
    assert.ok(artifactAt !== -1 && researchAt !== -1 && taskPromptAt !== -1)
    assert.ok(artifactAt < researchAt && researchAt < taskPromptAt)
    // research 指针行计入 filesPointed（不算 inlined）
    assert.deepEqual(result.stats, { filesInlined: 1, filesPointed: 2, truncated: 0 })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('research 多文件按文件名排序输出指针行（无截断/无预算语义）', () => {
  const root = makeProject()
  try {
    writeTaskFile(
      root,
      'research/a.md',
      '# A 大文件\n\nRESEARCH_BODY_A\n' + 'x'.repeat(30000) + '\n',
    )
    writeTaskFile(
      root,
      'research/b.md',
      '# B 大文件\n\nRESEARCH_BODY_B\n' + 'y'.repeat(30000) + '\n',
    )
    const [err, result] = buildExecutorPrompt(baseParams(root, 'implement'))
    assert.equal(err, null)
    const text = result.text
    // 指针行按文件名排序，正文/截断标注均不出现
    assert.ok(text.indexOf('research/a.md') < text.indexOf('research/b.md'))
    assert.ok(text.includes('- .workloom/tasks/08-24-demo/research/a.md — read before acting'))
    assert.ok(text.includes('- .workloom/tasks/08-24-demo/research/b.md — read before acting'))
    assert.ok(!text.includes('RESEARCH_BODY_A'))
    assert.ok(!text.includes('RESEARCH_BODY_B'))
    assert.ok(!text.includes('[...truncated'))
    assert.deepEqual(result.stats, { filesInlined: 0, filesPointed: 2, truncated: 0 })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('research kind 同样注入 research 材料段与 files 清单（全 kind 自动注入）', () => {
  const root = makeProject()
  try {
    writeTaskFile(root, 'prd.md', '# PRD\n')
    writeTaskFile(root, 'research/facts.md', '# 材料\n\n## 节\n\n- `pkg/a.js:1` 锚点\n')
    const [err, result] = buildExecutorPrompt(baseParams(root, 'research'))
    assert.equal(err, null)
    const text = result.text
    // 材料段在 Task prompt 之前；files 清单段在材料段之后（相对路径行，来自 T3 上下文包）
    const materialsAt = text.indexOf(RESEARCH_MATERIALS_HEADING)
    const filesAt = text.indexOf(FILES_LIST_HEADING)
    const taskPromptAt = text.indexOf('## Task prompt')
    assert.ok(materialsAt !== -1, 'research kind must get the research materials section')
    assert.ok(filesAt !== -1 && materialsAt < filesAt && filesAt < taskPromptAt)
    const nextHeading = text.indexOf('\n## ', filesAt)
    assert.equal(
      text
        .slice(filesAt + FILES_LIST_HEADING.length, nextHeading === -1 ? undefined : nextHeading)
        .trim(),
      'pkg/a.js',
    )
    assert.equal(result.stats.filesPointed, 1)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('无 research 产物：不注入 research 段与 files 清单，统计缺省 0，注入链不受影响', () => {
  const root = makeProject()
  try {
    writeTaskFile(root, 'prd.md', '# PRD\n')
    const [err, result] = buildExecutorPrompt(baseParams(root, 'implement'))
    assert.equal(err, null)
    const text = result.text
    assert.ok(!text.includes(RESEARCH_MATERIALS_HEADING))
    assert.ok(!text.includes(FILES_LIST_HEADING))
    // 既有注入链完整：Active task → artifact → Task prompt → 终极权威段（纪律段+leaf+权威声明）
    assert.ok(text.startsWith(`Active task: ${TASK_REL_PATH}`))
    assert.ok(text.includes('--- .workloom/tasks/08-24-demo/prd.md ---'))
    assert.ok(text.includes('## Task prompt\nDo the thing'))
    assert.ok(text.endsWith(CONTRACT_TAIL))
    assert.deepEqual(result.stats, {
      filesInlined: 1,
      filesPointed: 0,
      truncated: 0,
    })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('files 清单注入：research 锚点生成清单段；userPrompt 含显式清单关键词时不重复注入', () => {
  const root = makeProject()
  try {
    writeTaskFile(
      root,
      'research/facts.md',
      [
        '# 材料',
        '',
        '## 节',
        '',
        '- `packages/core/src/legacy/executor-context.js:100` 锚点一',
        '- `packages/core/src/legacy/research-facts.js:60` 锚点二',
        '',
      ].join('\n'),
    )
    // 正向：无关键词时自动注入清单段（相对路径行，来自 T3 上下文包）
    const [plainErr, plain] = buildExecutorPrompt(baseParams(root, 'implement'))
    assert.equal(plainErr, null)
    const listStart = plain.text.indexOf(FILES_LIST_HEADING)
    const nextHeading = plain.text.indexOf('\n## ', listStart)
    const listBody = plain.text.slice(
      listStart + FILES_LIST_HEADING.length,
      nextHeading === -1 ? undefined : nextHeading,
    )
    assert.equal(
      listBody.trim(),
      [
        'packages/core/src/legacy/executor-context.js',
        'packages/core/src/legacy/research-facts.js',
      ].join('\n'),
    )
    // 去重：userPrompt 已含显式清单关键词（涉及文件/files:/改动文件）时不重复注入
    for (const keyword of ['涉及文件', 'files:', '改动文件']) {
      const [err, result] = buildExecutorPrompt({
        root,
        taskRelPath: TASK_REL_PATH,
        kind: 'implement',
        userPrompt: `${keyword}：a.js、b.js`,
      })
      assert.equal(err, null)
      assert.ok(
        !result.text.includes(FILES_LIST_HEADING),
        `files list must not be injected when userPrompt contains ${keyword}`,
      )
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('implement/check 纪律段含「先读材料、禁止全局 recon」指令，research/frontend 不含', () => {
  const root = makeProject()
  try {
    writeTaskFile(root, 'prd.md', '# PRD\n')
    for (const kind of ['implement', 'check']) {
      const [err, result] = buildExecutorPrompt(baseParams(root, kind))
      assert.equal(err, null)
      // kind 纪律段并入末尾权威段：从 `## Executor contract` 起提取全文断言
      const contractAt = result.text.indexOf('## Executor contract')
      const section = result.text.slice(contractAt)
      assert.ok(
        section.includes(READ_MATERIALS_RULE),
        `${kind} discipline must carry the read-materials rule`,
      )
    }
    for (const kind of ['research', 'frontend']) {
      const [err, result] = buildExecutorPrompt(baseParams(root, kind))
      assert.equal(err, null)
      const contractAt = result.text.indexOf('## Executor contract')
      const section = result.text.slice(contractAt)
      assert.ok(
        !section.includes(READ_MATERIALS_RULE),
        `${kind} discipline must not carry the read-materials rule`,
      )
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

/** 批处理纪律句（implement/check 纪律段共用，逐字，命令式无弱化词）。 */
const BATCHING_DISCIPLINE =
  "Combine verification and comparison commands that do not depend on each other's output into a single shell invocation; one command per invocation wastes a reasoning round each."

/** 工具输出紧凑纪律句（implement/check 纪律段共用，逐字，命令式）。 */
const COMPACT_OUTPUT_DISCIPLINE =
  'Keep tool outputs compact: read targeted ranges instead of whole files, cap search and list output, and prefer summaries over full dumps.'

/** 强制加载协议 + marker 回声纪律句（与契约 assets workflow.md 逐字一致，测试自给自足）。 */
const INJECTION_PROTOCOL_DISCIPLINE =
  'Read the files in the injected pointer list before acting. ' +
  'Echo the injection marker token in the first line of your report as proof the protocol was read.'

/** 注入标记行前缀（与实现一致，测试自给自足）。 */
const INJECTION_MARKER_PREFIX = 'Injection marker: '

/** 无用户通道纪律句（终极权威段共用部分两句，逐字，命令式无弱化词）。 */
const NO_USER_CHANNEL_DISCIPLINE =
  'You have no user channel: never ask the user questions and never call ' +
  'interactive question tools (ask_user_question or equivalents). ' +
  'When you hit a gap you cannot resolve yourself, stop working, write every open ' +
  'question as a blocking item in your final report, and let the main session batch ' +
  'them to the user for decisions.'

/** research 写/编辑路径限制告知句（research 纪律段专属，逐字，机制强制前置告知）。 */
const RESEARCH_WRITE_SCOPE_DISCIPLINE =
  'Your write/edit reach is confined to the .workloom/ directory: paths ' + 'outside it are denied.'

test('implement/check 纪律段各含批处理与工具输出紧凑两句纪律（逐字），research/frontend 不含', () => {
  const root = makeProject()
  try {
    writeTaskFile(root, 'prd.md', '# PRD\n')
    for (const kind of ['implement', 'check']) {
      const [err, result] = buildExecutorPrompt(baseParams(root, kind))
      assert.equal(err, null)
      // kind 纪律段并入末尾权威段：从 `## Executor contract` 起提取全文逐字断言
      const contractAt = result.text.indexOf('## Executor contract')
      const section = result.text.slice(contractAt)
      assert.ok(
        section.includes(BATCHING_DISCIPLINE),
        `${kind} discipline must carry the batching sentence`,
      )
      assert.ok(
        section.includes(COMPACT_OUTPUT_DISCIPLINE),
        `${kind} discipline must carry the compact-output sentence`,
      )
    }
    for (const kind of ['research', 'frontend']) {
      const [err, result] = buildExecutorPrompt(baseParams(root, kind))
      assert.equal(err, null)
      const contractAt = result.text.indexOf('## Executor contract')
      const section = result.text.slice(contractAt)
      assert.ok(
        !section.includes(BATCHING_DISCIPLINE),
        `${kind} discipline must not carry the batching sentence`,
      )
      assert.ok(
        !section.includes(COMPACT_OUTPUT_DISCIPLINE),
        `${kind} discipline must not carry the compact-output sentence`,
      )
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

/** 提取注入文本中的 marker token（无 marker 时返回 null，测试辅助）。 */
function extractMarkerToken(text) {
  const at = text.indexOf(INJECTION_MARKER_PREFIX)
  if (at === -1) return null
  const lineEnd = text.indexOf('\n', at)
  const token = text.slice(
    at + INJECTION_MARKER_PREFIX.length,
    lineEnd === -1 ? undefined : lineEnd,
  )
  return token.trim()
}

/** 剔除注入标记行（单次注入 marker 随机，跨调用比较时先归一）。 */
function stripMarkerLine(text) {
  return text
    .split('\n')
    .filter((line) => !line.startsWith(INJECTION_MARKER_PREFIX))
    .join('\n')
}

test('S5 护栏：四种 kind 纪律段均含强制加载协议句（逐字）；注入含唯一 marker token（两次派发不同）', () => {
  const root = makeProject()
  try {
    writeTaskFile(root, 'prd.md', '# PRD\n')
    writeTaskFile(root, 'design.md', '# Design\n')
    writeTaskFile(root, 'implement.md', '# Implement\n')
    writeTaskFile(root, 'implement.jsonl', '{"file": "packages/a.js", "reason": "spec"}\n')
    writeRootFile(root, 'packages/a.js', 'const a = 1\n')
    for (const kind of ['research', 'implement', 'check', 'frontend']) {
      const [err, result] = buildExecutorPrompt(baseParams(root, kind))
      assert.equal(err, null)
      // 纪律段含强制加载协议句（逐字断言，与契约 assets 同句）
      const contractAt = result.text.indexOf('## Executor contract')
      const section = result.text.slice(contractAt)
      assert.ok(
        section.includes(INJECTION_PROTOCOL_DISCIPLINE),
        `${kind} discipline must carry the injection protocol sentence verbatim`,
      )
      // 注入含唯一 marker token（随派发注入，证明注入到达）
      assert.ok(
        extractMarkerToken(result.text) !== null,
        `${kind} injection must carry the unique marker token`,
      )
    }
    // 同任务两次派发 token 不同（单次注入标记回声机制）
    const first = buildExecutorPrompt(baseParams(root, 'implement'))
    const second = buildExecutorPrompt(baseParams(root, 'implement'))
    assert.equal(first[0], null)
    assert.equal(second[0], null)
    assert.notEqual(
      extractMarkerToken(first[1].text),
      extractMarkerToken(second[1].text),
      'two dispatches of the same task must produce different marker tokens',
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('纪律两句：四种 kind 纪律段均含「无用户通道」共用句（逐字，命令式无弱化词）', () => {
  const root = makeProject()
  try {
    writeTaskFile(root, 'prd.md', '# PRD\n')
    for (const kind of ['research', 'implement', 'check', 'frontend']) {
      const [err, result] = buildExecutorPrompt(baseParams(root, kind))
      assert.equal(err, null)
      // 纪律段并入末尾权威段：从 `## Executor contract` 起提取全文逐字断言
      const contractAt = result.text.indexOf('## Executor contract')
      const section = result.text.slice(contractAt)
      assert.ok(
        section.includes(NO_USER_CHANNEL_DISCIPLINE),
        `${kind} discipline must carry the no-user-channel sentence verbatim`,
      )
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('research 路径句：research 纪律段含 .workloom/ 路径限制告知句（逐字），其余 kind 不含', () => {
  const root = makeProject()
  try {
    writeTaskFile(root, 'prd.md', '# PRD\n')
    const [err, result] = buildExecutorPrompt(baseParams(root, 'research'))
    assert.equal(err, null)
    const contractAt = result.text.indexOf('## Executor contract')
    const section = result.text.slice(contractAt)
    assert.ok(
      section.includes(RESEARCH_WRITE_SCOPE_DISCIPLINE),
      'research discipline must carry the write-scope sentence verbatim',
    )
    for (const kind of ['implement', 'check', 'frontend']) {
      const [kErr, kResult] = buildExecutorPrompt(baseParams(root, kind))
      assert.equal(kErr, null)
      const kContractAt = kResult.text.indexOf('## Executor contract')
      const kSection = kResult.text.slice(kContractAt)
      assert.ok(
        !kSection.includes(RESEARCH_WRITE_SCOPE_DISCIPLINE),
        `${kind} discipline must not carry the research write-scope sentence`,
      )
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
