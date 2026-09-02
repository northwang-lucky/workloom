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

/** 写 .workloom/config.yaml。 */
function writeConfig(root, yaml) {
  writeFileSync(join(root, '.workloom', 'config.yaml'), yaml)
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

test('implement 组装：artifact 与 jsonl 引用文件全部内联，任务正文在末尾', () => {
  const root = makeProject()
  try {
    writeTaskFile(root, 'prd.md', '# PRD\n')
    writeTaskFile(root, 'design.md', '# Design\n')
    writeTaskFile(root, 'implement.md', '# Implement\n')
    writeTaskFile(
      root,
      'implement.jsonl',
      [
        '{"_example": "seed line"}',
        '{"file": "packages/a.js", "reason": "spec"}',
        '{"file": "packages/b.md", "reason": "research"}',
      ].join('\n'),
    )
    writeRootFile(root, 'packages/a.js', 'const a = 1\n')
    writeRootFile(root, 'packages/b.md', '# B\n')
    const [err, result] = buildExecutorPrompt(baseParams(root, 'implement'))
    assert.equal(err, null)
    const text = result.text
    assert.ok(text.startsWith(`Active task: ${TASK_REL_PATH}`))
    assert.ok(text.includes('--- .workloom/tasks/08-24-demo/prd.md ---'))
    assert.ok(text.includes('--- .workloom/tasks/08-24-demo/design.md ---'))
    assert.ok(text.includes('--- .workloom/tasks/08-24-demo/implement.md ---'))
    assert.ok(text.includes('--- packages/a.js ---'))
    assert.ok(text.includes('--- packages/b.md ---'))
    // seed _example 行被跳过，不产生内容块
    assert.ok(!text.includes('seed line'))
    // 任务正文之后是终极权威段（kind 纪律段 + leaf 规则 + 权威声明），文本以权威声明结尾
    assert.ok(text.includes('## Task prompt\nDo the thing'))
    assert.ok(text.endsWith(CONTRACT_TAIL))
    assert.deepEqual(result.stats, {
      filesInlined: 5,
      filesIndexed: 0,
      truncated: 0,
      researchInlined: 0,
      researchTruncated: 0,
    })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('预算截断：小 max_file_bytes 截断提示，小 max_total_bytes 后序条目降级索引行', () => {
  const root = makeProject()
  try {
    writeConfig(
      root,
      ['context_injection:', '  max_file_bytes: 16', '  max_total_bytes: 120', ''].join('\n'),
    )
    writeTaskFile(root, 'prd.md', '# PRD\n')
    writeTaskFile(root, 'design.md', '# D\n')
    writeTaskFile(root, 'implement.md', '# I\n')
    writeTaskFile(
      root,
      'implement.jsonl',
      ['{"file": "a.txt", "reason": "first"}', '{"file": "b.txt", "reason": "second"}'].join('\n'),
    )
    writeRootFile(root, 'a.txt', 'x'.repeat(100))
    writeRootFile(root, 'b.txt', 'y'.repeat(100))
    const [err, result] = buildExecutorPrompt(baseParams(root, 'implement'))
    assert.equal(err, null)
    const text = result.text
    // 第一条文件内联但按 max_file_bytes 截断并带提示
    assert.ok(text.includes('--- a.txt ---'))
    assert.ok(text.includes('[...truncated at 16 bytes]'))
    // 第二条按截断后字节口径仍可落进总量预算：内联且截断（不再按 raw size 误降级）
    assert.ok(text.includes('--- b.txt ---'))
    assert.ok(!text.includes('[indexed]'))
    assert.deepEqual(result.stats, {
      filesInlined: 5,
      filesIndexed: 0,
      truncated: 2,
      researchInlined: 0,
      researchTruncated: 0,
    })
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
      filesIndexed: 0,
      truncated: 0,
      researchInlined: 0,
      researchTruncated: 0,
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

test('maxFileBytes 为 0 时整文件内联不截断', async () => {
  const root = makeProject()
  try {
    writeConfig(root, 'context_injection:\n  max_file_bytes: 0\n')
    writeRootFile(root, 'big.txt', 'x'.repeat(500))
    writeTaskFile(root, 'implement.jsonl', '{"file": "big.txt", "reason": "big"}\n')
    const [err, built] = await buildExecutorPrompt(baseParams(root, 'implement'))
    assert.equal(err, null)
    assert.match(built.text, /x{500}/)
    assert.equal(built.stats.filesInlined, 1)
    assert.equal(built.stats.truncated, 0)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('越界路径条目被跳过且防逃逸', async () => {
  const root = makeProject()
  try {
    writeTaskFile(root, 'implement.jsonl', '{"file": "../secret.txt", "reason": "escape"}\n')
    const [err, built] = await buildExecutorPrompt(baseParams(root, 'implement'))
    assert.equal(err, null)
    assert.doesNotMatch(built.text, /secret/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('目录条目计入 indexed 且不输出内容', async () => {
  const root = makeProject()
  try {
    writeTaskFile(
      root,
      'implement.jsonl',
      '{"file": "sub", "type": "directory", "reason": "dir"}\n',
    )
    const [err, built] = await buildExecutorPrompt(baseParams(root, 'implement'))
    assert.equal(err, null)
    assert.equal(built.stats.filesIndexed, 1)
    assert.equal(built.stats.filesInlined, 0)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('无 file 且非 _example 的行报错', async () => {
  const root = makeProject()
  try {
    writeTaskFile(root, 'implement.jsonl', '{"foo": 1}\n')
    const [err, built] = await buildExecutorPrompt(baseParams(root, 'implement'))
    assert.ok(err)
    assert.match(err.message, /no file field/)
    assert.equal(built, null)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('max_total_bytes 极小时 jsonl 文件全部降级为索引行', () => {
  const root = makeProject()
  try {
    writeConfig(root, ['context_injection:', '  max_total_bytes: 1', ''].join('\n'))
    writeTaskFile(root, 'prd.md', '# PRD\n')
    writeTaskFile(
      root,
      'implement.jsonl',
      ['{"file": "a.txt", "reason": "first"}', '{"file": "b.txt", "reason": "second"}'].join('\n'),
    )
    writeRootFile(root, 'a.txt', 'x'.repeat(50))
    writeRootFile(root, 'b.txt', 'y'.repeat(50))
    const [err, result] = buildExecutorPrompt(baseParams(root, 'implement'))
    assert.equal(err, null)
    assert.ok(result.text.includes('- a.txt (first) — 50 bytes [indexed]'))
    assert.ok(result.text.includes('- b.txt (second) — 50 bytes [indexed]'))
    assert.ok(!result.text.includes('--- a.txt ---'))
    assert.equal(result.stats.filesIndexed, 2)
    assert.equal(result.stats.filesInlined, 1)
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

test('localDirectives 未传/空串：不插入且输出与旧版逐字一致', () => {
  const root = makeProject()
  try {
    writeTaskFile(root, 'prd.md', '# PRD\n')
    const base = baseParams(root, 'check')
    const [plainErr, plain] = buildExecutorPrompt(base)
    const [emptyErr, empty] = buildExecutorPrompt({ ...base, localDirectives: '' })
    assert.equal(plainErr, null)
    assert.equal(emptyErr, null)
    // 缺省与空串输出逐字一致（Pi 不传参 = 不注入，向后兼容）。
    assert.equal(plain.text, empty.text)
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

/** research 材料注入段标题（与实现一致，测试自给自足）。 */
const RESEARCH_MATERIALS_HEADING = '## Research materials'

/** files 清单注入段标题（与实现一致，测试自给自足）。 */
const FILES_LIST_HEADING = '## Involved files'

/** research 截断标注行（与实现一致，测试自给自足）。 */
const RESEARCH_TRUNCATED_MARKER =
  '[...truncated: research/*.md research materials over 20000 chars]'

/** 纪律段「先读材料、禁止全局 recon」指令（与实现一致，测试自给自足）。 */
const READ_MATERIALS_RULE =
  'Read the injected research materials and file list before acting; do not re-discover ' +
  'the repository state (no git status/log sweeps, no whole-repo globs, no bulk reads of ' +
  'unrelated files).'

test('research 产物全文注入：research/*.md 逐文件内联，位于 artifacts 之后、Task prompt 之前', () => {
  const root = makeProject()
  try {
    writeTaskFile(root, 'prd.md', '# PRD\n')
    writeTaskFile(root, 'research/a.md', '# A 材料\n\n## 节一\n\n- `a.go:1` 锚点\n')
    writeTaskFile(root, 'research/b.md', '# B 材料\n\n## 节二\n\n- `b.go:2` 锚点\n')
    const [err, result] = buildExecutorPrompt(baseParams(root, 'implement'))
    assert.equal(err, null)
    const text = result.text
    assert.ok(text.includes(RESEARCH_MATERIALS_HEADING))
    assert.ok(text.includes('--- .workloom/tasks/08-24-demo/research/a.md ---'))
    assert.ok(text.includes('--- .workloom/tasks/08-24-demo/research/b.md ---'))
    // 全文注入：标题与正文原样保留（不足 20K 预算不截断）
    assert.ok(text.includes('# A 材料'))
    assert.ok(text.includes('- `a.go:1` 锚点'))
    assert.ok(text.includes('# B 材料'))
    assert.ok(text.includes('- `b.go:2` 锚点'))
    // 位置：research 段在 artifact 块之后、Task prompt 之前（先读材料再行动）
    const artifactAt = text.indexOf('--- .workloom/tasks/08-24-demo/prd.md ---')
    const researchAt = text.indexOf(RESEARCH_MATERIALS_HEADING)
    const taskPromptAt = text.indexOf('## Task prompt')
    assert.ok(artifactAt !== -1 && researchAt !== -1 && taskPromptAt !== -1)
    assert.ok(artifactAt < researchAt && researchAt < taskPromptAt)
    assert.deepEqual(result.stats, {
      filesInlined: 1,
      filesIndexed: 0,
      truncated: 0,
      researchInlined: 2,
      researchTruncated: 0,
    })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('research 合计超 20K 字符：截断为标题区+锚点区并追加截断标注行', () => {
  const root = makeProject()
  try {
    // 大文件：头部标题 + 锚点行 + 紧随的代码围栏摘录，正文夹 30K 无锚点叙述
    const big =
      '# 大文件\n\n## 保留节\n\n- `big.go:1` 锚点行\n\n```go\nfunc kept() {}\n```\n\n' +
      'NARRATIVE_BODY_MARKER\n' +
      'x'.repeat(30000) +
      '\n'
    writeTaskFile(root, 'research/big.md', big)
    const [err, result] = buildExecutorPrompt(baseParams(root, 'implement'))
    assert.equal(err, null)
    const text = result.text
    // 保留区：标题、锚点行、锚点紧随的代码围栏摘录行
    assert.ok(text.includes('# 大文件'))
    assert.ok(text.includes('## 保留节'))
    assert.ok(text.includes('- `big.go:1` 锚点行'))
    assert.ok(text.includes('```go'))
    assert.ok(text.includes('func kept() {}'))
    // 正文叙述行预算外截掉；被截断文件追加截断标注行
    assert.ok(!text.includes('NARRATIVE_BODY_MARKER'))
    assert.ok(text.includes(RESEARCH_TRUNCATED_MARKER))
    assert.equal(result.stats.researchInlined, 1)
    assert.equal(result.stats.researchTruncated, 1)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('research 多文件按文件名排序计入预算：预算内文件全文注入，超预算文件截断', () => {
  const root = makeProject()
  try {
    writeTaskFile(root, 'research/a.md', '# A 小文件全文保留\n\nSMALL_MARKER_A\n')
    const big =
      '# B 大文件\n\n## B 节\n\n- `b.go:1` 锚点\n\n```ts\nconst b = 1\n```\n\n' +
      'BODY_B_MARKER\n' +
      'y'.repeat(30000) +
      '\n'
    writeTaskFile(root, 'research/b.md', big)
    const [err, result] = buildExecutorPrompt(baseParams(root, 'implement'))
    assert.equal(err, null)
    const text = result.text
    // a.md 在预算内：正文行全文保留
    assert.ok(text.includes('SMALL_MARKER_A'))
    // b.md 超预算：保留标题与锚点区、丢弃正文叙述并带截断标注
    assert.ok(text.includes('# B 大文件'))
    assert.ok(text.includes('const b = 1'))
    assert.ok(!text.includes('BODY_B_MARKER'))
    assert.ok(text.includes(RESEARCH_TRUNCATED_MARKER))
    assert.deepEqual(result.stats, {
      filesInlined: 0,
      filesIndexed: 0,
      truncated: 0,
      researchInlined: 2,
      researchTruncated: 1,
    })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('research 20K 字符边界：合计恰好 20000 全量注入，超过 1 字符即截断', () => {
  // 单文件恰好 20000 字符（'# E\n' 4 字符 + 19996 x）：不截断、无标注
  const exactRoot = makeProject()
  try {
    writeTaskFile(exactRoot, 'research/exact.md', `# E\n${'x'.repeat(19996)}`)
    const [err, result] = buildExecutorPrompt(baseParams(exactRoot, 'implement'))
    assert.equal(err, null)
    assert.ok(result.text.includes('x'.repeat(19996)))
    assert.ok(!result.text.includes(RESEARCH_TRUNCATED_MARKER))
    assert.equal(result.stats.researchInlined, 1)
    assert.equal(result.stats.researchTruncated, 0)
  } finally {
    rmSync(exactRoot, { recursive: true, force: true })
  }
  // 单文件 20001 字符：超出 1 字符即截断（保留标题，正文叙述丢弃并带标注）
  const overRoot = makeProject()
  try {
    writeTaskFile(overRoot, 'research/over.md', `# O\n${'y'.repeat(19997)}`)
    const [err, result] = buildExecutorPrompt(baseParams(overRoot, 'implement'))
    assert.equal(err, null)
    assert.ok(!result.text.includes('y'.repeat(19997)))
    assert.ok(result.text.includes(RESEARCH_TRUNCATED_MARKER))
    assert.equal(result.stats.researchInlined, 1)
    assert.equal(result.stats.researchTruncated, 1)
  } finally {
    rmSync(overRoot, { recursive: true, force: true })
  }
  // 多文件合计恰好 20000：跨文件累计不超预算，两文件均全文注入
  const multiRoot = makeProject()
  try {
    writeTaskFile(multiRoot, 'research/a.md', `# A\n${'a'.repeat(9996)}`)
    writeTaskFile(multiRoot, 'research/b.md', `# B\n${'b'.repeat(9996)}`)
    const [err, result] = buildExecutorPrompt(baseParams(multiRoot, 'implement'))
    assert.equal(err, null)
    assert.ok(result.text.includes('a'.repeat(9996)))
    assert.ok(result.text.includes('b'.repeat(9996)))
    assert.ok(!result.text.includes(RESEARCH_TRUNCATED_MARKER))
    assert.equal(result.stats.researchInlined, 2)
    assert.equal(result.stats.researchTruncated, 0)
  } finally {
    rmSync(multiRoot, { recursive: true, force: true })
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
    assert.equal(result.stats.researchInlined, 1)
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
      filesIndexed: 0,
      truncated: 0,
      researchInlined: 0,
      researchTruncated: 0,
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
