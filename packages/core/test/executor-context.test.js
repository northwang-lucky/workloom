/**
 * executor-context 单测：上下文注入组装的段落白名单/分层协议/统计/报错行为（临时项目目录）。
 *
 * 覆盖：四种 kind 段落白名单与顺序（Task prompt 在 Local directives 之后、contract 末段）；
 * check/research 物化 prd 块、implement/frontend 物化 prd 软指针（无全文、无 H2 目录预览）；
 * `## Involved files` 段全 kind 删除；指针行无「read before acting」后缀；
 * 分层按需加载协议句（回声句后半逐字保留、禁 upfront 通读）；research 只含 prd；
 * 末尾终极权威段（kind 纪律段 + leaf 规则 + 权威声明）的注入位置/去重/分级语义；
 * implement/check 纪律段按需查材料/禁止全局 recon 指令；implement contract 词数上限；
 * kind/effort 非法报错；jsonl 坏行报错。
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

test('S1 jsonl 纯指针：implement/check 注入只含「路径 + reason」指针行，无文件全文、无后缀', () => {
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
    const expected = {
      // implement：不内联任何 artifact（prd 走软指针），指针 = prd 软指针 + design + implement + jsonl×2
      implement: { filesInlined: 0, filesPointed: 5, truncated: 0 },
      // check：内联 prd 块，指针 = design + implement + jsonl×2
      check: { filesInlined: 1, filesPointed: 4, truncated: 0 },
    }
    for (const kind of ['implement', 'check']) {
      const [err, result] = buildExecutorPrompt(baseParams(root, kind))
      assert.equal(err, null)
      const text = result.text
      // 指针清单段带标题（前两行固定为 design/implement 纯指针行，后接 jsonl 条目）
      assert.ok(text.includes(POINTER_LIST_HEADING))
      assert.ok(text.includes('- .workloom/tasks/08-24-demo/design.md\n'))
      assert.ok(text.includes('- .workloom/tasks/08-24-demo/implement.md\n'))
      // 两角色统一纯指针：指针行含路径 + reason，无「— read before acting」逐行后缀
      assert.ok(text.includes('- packages/a.js (spec)\n'))
      assert.ok(text.includes('- packages/b.md (research)\n'))
      assert.ok(!text.includes('read before acting'))
      // 无文件全文进入注入（撤全文内联与预取）
      assert.ok(!text.includes('FULL_CONTENT_A_MARKER'))
      assert.ok(!text.includes('FULL_CONTENT_B_MARKER'))
      assert.ok(!text.includes('--- packages/a.js ---'))
      // seed _example 行被跳过，不产生指针行
      assert.ok(!text.includes('seed line'))
      assert.deepEqual(result.stats, expected[kind])
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('S2 artifacts 提取：check/research 物化 prd 全文节块；design/implement 仅纯指针行（无 H2 目录预览）；implement 软指针不进 prd 全文', () => {
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
    // check：Requirements/Acceptance 两节全文保留，其余节标题指针（prd 块职责必需）
    const [checkErr, checkResult] = buildExecutorPrompt(baseParams(root, 'check'))
    assert.equal(checkErr, null)
    const checkText = checkResult.text
    assert.ok(checkText.includes('## Requirements'))
    assert.ok(checkText.includes('REQ_BODY_MARKER'))
    assert.ok(checkText.includes('## Acceptance Criteria'))
    assert.ok(checkText.includes('ACC_BODY_MARKER'))
    assert.ok(checkText.includes('Read in file: ## Goal, ## Notes'))
    assert.ok(!checkText.includes('GOAL_BODY_MARKER'))
    assert.ok(!checkText.includes('NOTES_BODY_MARKER'))
    // design/implement：纯指针行，无 H2 目录预览、无正文、无目录尾注指针
    assert.ok(!checkText.includes('## 1. 决策一'))
    assert.ok(!checkText.includes('DESIGN_BODY_MARKER'))
    assert.ok(!checkText.includes('BODY2_MARKER'))
    assert.ok(!checkText.includes('Read the full document in the file.'))
    assert.ok(checkText.endsWith(CONTRACT_TAIL))
    // implement：prd 不再全文内联（软指针独立一行），design/implement 同为纯指针行
    const [implErr, implResult] = buildExecutorPrompt(baseParams(root, 'implement'))
    assert.equal(implErr, null)
    const implText = implResult.text
    assert.ok(!implText.includes('--- .workloom/tasks/08-24-demo/prd.md ---'))
    assert.ok(!implText.includes('## Requirements'))
    assert.ok(!implText.includes('REQ_BODY_MARKER'))
    assert.ok(!implText.includes('ACC_BODY_MARKER'))
    assert.ok(!implText.includes('GOAL_BODY_MARKER'))
    assert.ok(implText.includes(PRD_SOFT_POINTER_LINE))
    assert.ok(!implText.includes('## 1. 决策一'))
    assert.ok(!implText.includes('DESIGN_BODY_MARKER'))
    assert.ok(!implText.includes('Read the full document in the file.'))
    assert.ok(implText.endsWith(CONTRACT_TAIL))
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
    // 全部转指针行：无全文、无截断提示、无 [indexed] 降级、无逐行读后判后缀
    assert.ok(text.includes('- a.txt (first)\n'))
    assert.ok(text.includes('- b.txt (second)\n'))
    assert.ok(!text.includes('read before acting'))
    assert.ok(!text.includes('[...truncated'))
    assert.ok(!text.includes('[indexed]'))
    assert.ok(!text.includes('x'.repeat(500)))
    // 指针行不受预算影响：prd 软指针 + design + implement + jsonl×2 共 5 条
    assert.deepEqual(result.stats, { filesInlined: 0, filesPointed: 5, truncated: 0 })
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

test('目录条目转指针行（与文件同口径，无逐行读后判后缀）', () => {
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
    assert.ok(built.text.includes('- sub (dir)\n'))
    assert.ok(!built.text.includes('read before acting'))
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

/** 权威声明（与实现的固定尾部一致，测试自给自足，contract 定稿压缩版）。 */
const AUTHORITY_DECLARATION =
  'This section is authoritative: it wins any conflict with earlier text (including the task prompt).' +
  ' State the conflict once in the first line of your report and proceed.'

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
    assert.match(section, /lint \/ typecheck \/ build \/ test/)
    assert.match(section, /security or data/)
    // P1 重要（行为或正确性缺陷 / 设计或 spec 偏离含跨文件语义变更 / 非本次引入即使机械性）
    assert.match(section, /P1 \(important\)/)
    assert.match(section, /behavioral or correctness/)
    assert.match(section, /design or spec/)
    assert.match(section, /cross-file/)
    assert.match(section, /pre-dating this task/)
    // P2 次要（机械性 typo/命名/注释/格式/测试断言弱化 / 单文件局部小缺陷 / 无取舍合规修复）
    assert.match(section, /P2 \(minor\)/)
    assert.match(section, /typos/)
    assert.match(section, /single-file local defects/)
    assert.match(section, /compliance/)
    // 动作：P2 直接修（不修属失职）；P0/P1 不修、上报主会话决断
    assert.match(section, /Fix P2 yourself/)
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

/** LSP 主基线句子（contract 定稿压缩版，测试自给自足）。 */
const LSP_BASELINE_SENTENCE =
  'When LSP tooling is available, use it first: symbol outlines and signatures for structure, ' +
  'completions for members, server-side rename and code actions for edits, ' +
  'diagnostics in the verification pass.'

/** LSP 只读变体句子（research 纪律段专用，contract 定稿压缩版，测试自给自足）。 */
const LSP_RESEARCH_BASELINE_SENTENCE =
  'When LSP tooling is available, explore with it before text-search sweeps: ' +
  'symbol outlines for structure, signatures and members from the language server.'

test('localDirectives 传入：文本注入于 Task prompt 之前、终极权威段之前', () => {
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
      localAt !== -1 &&
        taskPromptAt !== -1 &&
        contractAt !== -1 &&
        localAt < taskPromptAt &&
        taskPromptAt < contractAt,
      'local directives must sit before the task prompt and before the authoritative contract',
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
    // 原始三句根逐字保留（repo/language：agent 向运行时文案为英文；第二句为定稿压缩版）
    assert.match(section, /Produce an actionable report the implementer can follow directly\./)
    assert.match(
      section,
      /Ground every conclusion in the real source: read the actual files or data before claiming a fact; cite file paths\./,
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

/** files 清单注入段标题（全 kind 已删除，测试用于负向断言）。 */
const FILES_LIST_HEADING = '## Involved files'

/** prd 软指针行（implement/frontend 专有，独立一行无标题，定稿模板）。 */
const PRD_SOFT_POINTER_LINE =
  'If the task prompt or the plan is ambiguous, consult .workloom/tasks/08-24-demo/prd.md before deciding.'

/** 纪律段「按需查材料、禁止全局 recon」指令（contract 定稿，测试自给自足）。 */
const CONSULT_MATERIALS_ON_DEMAND_RULE =
  'Consult the injected research materials only when the current step needs them; do not re-discover ' +
  'the repository (no git sweeps, no whole-repo globs, no bulk unrelated reads).'

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
    // 只给路径指针行（无逐行读后判后缀），正文不进注入
    assert.ok(text.includes('- .workloom/tasks/08-24-demo/research/a.md\n'))
    assert.ok(text.includes('- .workloom/tasks/08-24-demo/research/b.md\n'))
    assert.ok(!text.includes('read before acting'))
    assert.ok(!text.includes('RESEARCH_BODY_A'))
    assert.ok(!text.includes('RESEARCH_BODY_B'))
    assert.ok(!text.includes('# A 材料'))
    // 位置：research 段在 prd 软指针之前、Task prompt 之前（分层协议：步骤需要时再读）
    const softPrdAt = text.indexOf(PRD_SOFT_POINTER_LINE)
    const researchAt = text.indexOf(RESEARCH_MATERIALS_HEADING)
    const taskPromptAt = text.indexOf('## Task prompt')
    assert.ok(softPrdAt !== -1 && researchAt !== -1 && taskPromptAt !== -1)
    assert.ok(researchAt < softPrdAt && softPrdAt < taskPromptAt)
    // research 指针行与 prd 软指针计入 filesPointed（不内联 artifact）
    assert.deepEqual(result.stats, { filesInlined: 0, filesPointed: 3, truncated: 0 })
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
    // 指针行按文件名排序，正文/截断标注/读后判后缀均不出现
    assert.ok(text.indexOf('research/a.md') < text.indexOf('research/b.md'))
    assert.ok(text.includes('- .workloom/tasks/08-24-demo/research/a.md\n'))
    assert.ok(text.includes('- .workloom/tasks/08-24-demo/research/b.md\n'))
    assert.ok(!text.includes('read before acting'))
    assert.ok(!text.includes('RESEARCH_BODY_A'))
    assert.ok(!text.includes('RESEARCH_BODY_B'))
    assert.ok(!text.includes('[...truncated'))
    assert.deepEqual(result.stats, { filesInlined: 0, filesPointed: 2, truncated: 0 })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('research kind 注入 research 材料段与 prd 块，且全 kind 无 Involved files 段', () => {
  const root = makeProject()
  try {
    writeTaskFile(root, 'prd.md', '# PRD\n')
    writeTaskFile(root, 'research/facts.md', '# 材料\n\n## 节\n\n- `pkg/a.js:1` 锚点\n')
    const [err, result] = buildExecutorPrompt(baseParams(root, 'research'))
    assert.equal(err, null)
    const text = result.text
    // 材料段在 prd 块之后、Task prompt 之前；锚点上下文包不再产生 Involved files 段
    const prdAt = text.indexOf('--- .workloom/tasks/08-24-demo/prd.md ---')
    const materialsAt = text.indexOf(RESEARCH_MATERIALS_HEADING)
    const taskPromptAt = text.indexOf('## Task prompt')
    assert.ok(prdAt !== -1 && materialsAt !== -1 && taskPromptAt !== -1)
    assert.ok(prdAt < materialsAt && materialsAt < taskPromptAt)
    assert.ok(!text.includes(FILES_LIST_HEADING), 'Involved files section must be removed')
    assert.ok(!text.includes('pkg/a.js'), 'anchor file list must not be injected')
    assert.equal(result.stats.filesPointed, 1)
    assert.equal(result.stats.filesInlined, 1)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('无 research 产物：不注入 research 段与 Involved files 段，统计缺省 0，注入链不受影响', () => {
  const root = makeProject()
  try {
    writeTaskFile(root, 'prd.md', '# PRD\n')
    const [err, result] = buildExecutorPrompt(baseParams(root, 'implement'))
    assert.equal(err, null)
    const text = result.text
    assert.ok(!text.includes(RESEARCH_MATERIALS_HEADING))
    assert.ok(!text.includes(FILES_LIST_HEADING))
    // 既有注入链完整：Active task → prd 软指针 → Task prompt → 终极权威段（纪律段+leaf+权威声明）
    assert.ok(text.startsWith(`Active task: ${TASK_REL_PATH}`))
    assert.ok(
      !text.includes('--- .workloom/tasks/08-24-demo/prd.md ---'),
      'implement inlines no prd block',
    )
    assert.ok(text.includes(PRD_SOFT_POINTER_LINE))
    assert.ok(text.includes('## Task prompt\nDo the thing'))
    assert.ok(text.endsWith(CONTRACT_TAIL))
    assert.deepEqual(result.stats, {
      filesInlined: 0,
      filesPointed: 1,
      truncated: 0,
    })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('Involved files 段全 kind 删除：research 锚点上下文包不再注入清单段（userPrompt 关键词无关）', () => {
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
        '- `packages/core/src/legacy/config.js:60` 锚点二',
        '',
      ].join('\n'),
    )
    for (const kind of ['research', 'implement', 'check', 'frontend']) {
      for (const userPrompt of [
        'Do the thing',
        '涉及文件：a.js、b.js',
        'files: a.js',
        '改动文件：a.js',
      ]) {
        const [err, result] = buildExecutorPrompt({
          root,
          taskRelPath: TASK_REL_PATH,
          kind,
          userPrompt,
        })
        assert.equal(err, null)
        assert.ok(
          !result.text.includes(FILES_LIST_HEADING),
          `${kind} must not inject the Involved files section`,
        )
        assert.ok(
          !result.text.includes('packages/core/src/legacy/executor-context.js'),
          `${kind} must not leak the anchor file list`,
        )
      }
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('implement/check 纪律段含「按需查材料、禁止全局 recon」指令，research/frontend 不含', () => {
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
        section.includes(CONSULT_MATERIALS_ON_DEMAND_RULE),
        `${kind} discipline must carry the on-demand materials rule`,
      )
      // "file list" 提法已随 Involved files 段全删
      assert.ok(!section.includes('file list'), `${kind} must not reference the removed file list`)
    }
    for (const kind of ['research', 'frontend']) {
      const [err, result] = buildExecutorPrompt(baseParams(root, kind))
      assert.equal(err, null)
      const contractAt = result.text.indexOf('## Executor contract')
      const section = result.text.slice(contractAt)
      assert.ok(
        !section.includes(CONSULT_MATERIALS_ON_DEMAND_RULE),
        `${kind} discipline must not carry the on-demand materials rule`,
      )
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

/** 批处理纪律句（implement/check 纪律段共用，contract 定稿，逐字，命令式）。 */
const BATCHING_DISCIPLINE =
  'Batch independent verification and comparison commands into a single shell invocation.'

/** 工具输出紧凑纪律句（implement/check 纪律段共用，contract 定稿，逐字，命令式）。 */
const COMPACT_OUTPUT_DISCIPLINE =
  'Keep tool outputs compact: read targeted ranges, cap search and list output, prefer summaries.'

/** 分层加载协议 + marker 回声纪律句（contract 定稿，与契约 assets workflow.md 逐字同源；后半句回声协议逐字不动）。 */
const INJECTION_PROTOCOL_DISCIPLINE =
  'Load in layers: read the plan artifact (implement.md) before acting; consult every other pointer only when the current step needs it, in targeted ranges; never bulk-read the whole list upfront. ' +
  'Echo the injection marker token in the first line of your report as proof the protocol was read.'

/** 注入标记行前缀（与实现一致，测试自给自足）。 */
const INJECTION_MARKER_PREFIX = 'Injection marker: '

/** 无用户通道纪律句（终极权威段共用部分，contract 定稿，逐字，命令式无弱化词）。 */
const NO_USER_CHANNEL_DISCIPLINE =
  'You have no user channel: never ask the user or call interactive question tools. ' +
  'On a gap you cannot resolve, stop and list every open question as a blocking item in your final report; ' +
  'the main session batches them to the user.'

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

/** 组装白名单顺序测试的完整任务夹具（artifacts + jsonl + research 产物）。 */
function writeFullFixture(root) {
  writeTaskFile(
    root,
    'prd.md',
    ['# 任务', '', '## Requirements', 'REQ_BODY_MARKER', '', '## Notes', 'NOTES_BODY_MARKER'].join(
      '\n',
    ),
  )
  writeTaskFile(root, 'design.md', ['# Design', '', '## 决策', 'DESIGN_BODY_MARKER'].join('\n'))
  writeTaskFile(root, 'implement.md', ['# Implement', '', '## 步骤', 'IMPL_BODY_MARKER'].join('\n'))
  const entries = '{"file": "packages/a.js", "reason": "spec"}\n'
  writeTaskFile(root, 'implement.jsonl', entries)
  writeTaskFile(root, 'check.jsonl', entries)
  writeTaskFile(root, 'research/facts.md', '# 材料\n')
  writeRootFile(root, 'packages/a.js', 'const a = 1\n')
}

/** 回声协议后半句（与实现/契约逐字一致，后半句为组件级不变量）。 */
const ECHO_PROTOCOL_HALF =
  'Echo the injection marker token in the first line of your report as proof the protocol was read.'

test('段落白名单与顺序：四种 kind 按 prd Requirements 1 组装，Task prompt 在 Local directives 之后、contract 恒末段', () => {
  const root = makeProject()
  try {
    writeFullFixture(root)
    const marker = (text, needle) => {
      const at = text.indexOf(needle)
      assert.ok(at !== -1, `missing section: ${needle}`)
      return at
    }
    for (const kind of ['research', 'implement', 'check', 'frontend']) {
      const [err, result] = buildExecutorPrompt({
        ...baseParams(root, kind),
        localDirectives: 'LOCAL_FRAGMENT',
      })
      assert.equal(err, null)
      const text = result.text
      // 公共段：任务标注 + 注入 marker 首行
      assert.ok(text.startsWith(`Active task: ${TASK_REL_PATH}\nInjection marker: `), kind)
      const materialsAt = marker(text, RESEARCH_MATERIALS_HEADING)
      const localAt = marker(text, LOCAL_DIRECTIVES_HEADING)
      const taskAt = marker(text, '## Task prompt')
      const contractAt = marker(text, '## Executor contract')
      // 顺序：materials < Local directives < Task prompt < Executor contract（contract 恒末段）
      assert.ok(materialsAt < localAt && localAt < taskAt && taskAt < contractAt, kind)
      assert.ok(text.endsWith(CONTRACT_TAIL), kind)
      // 全 kind 无 Involved files 段
      assert.ok(!text.includes(FILES_LIST_HEADING), kind)
      // 指针行无逐行「read before acting」后缀
      assert.ok(!text.includes('read before acting'), kind)
      // 分层加载协议：回声句后半逐字 + 禁 upfront 通读词面可辨
      assert.ok(text.includes(ECHO_PROTOCOL_HALF), kind)
      assert.ok(text.includes('never bulk-read the whole list upfront'), kind)
      const prdBlockAt = text.indexOf('--- .workloom/tasks/08-24-demo/prd.md ---')
      const pointerAt = text.indexOf(POINTER_LIST_HEADING)
      const softAt = text.indexOf(PRD_SOFT_POINTER_LINE)
      if (kind === 'check' || kind === 'research') {
        // prd 块物化（check/research），位于 pointer list（research 无此段）之前
        assert.ok(prdBlockAt !== -1 && prdBlockAt < materialsAt, kind)
        assert.ok(text.includes('REQ_BODY_MARKER'), kind)
      } else {
        assert.equal(prdBlockAt, -1, `${kind} must not inline the prd block`)
        assert.ok(!text.includes('REQ_BODY_MARKER'), kind)
        // prd 软指针独立一行无标题，位于 Research materials 之后、Local directives 之前
        assert.ok(softAt !== -1 && materialsAt < softAt && softAt < localAt, kind)
      }
      if (kind === 'research') {
        assert.equal(pointerAt, -1, 'research has no pointer list section')
        assert.equal(softAt, -1, 'research has no prd soft pointer')
      } else {
        // Pointer list：前两行固定 design.md / implement.md 纯指针行，后接 jsonl 条目
        assert.ok(pointerAt !== -1 && pointerAt > prdBlockAt && pointerAt < materialsAt, kind)
        const pointerBlock = text.slice(pointerAt, materialsAt)
        const lines = pointerBlock.split('\n').filter((line) => line.startsWith('- '))
        assert.deepEqual(
          lines.slice(0, 3),
          [
            '- .workloom/tasks/08-24-demo/design.md',
            '- .workloom/tasks/08-24-demo/implement.md',
            '- packages/a.js (spec)',
          ],
          `${kind} pointer list must lead with design/implement then jsonl entries`,
        )
      }
      // H2 目录预览全灭：design/implement 正文与标题均不进注入
      assert.ok(!text.includes('## 决策') && !text.includes('DESIGN_BODY_MARKER'), kind)
      assert.ok(!text.includes('## 步骤') && !text.includes('IMPL_BODY_MARKER'), kind)
      assert.ok(!text.includes('NOTES_BODY_MARKER'), kind)
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('prd 软指针行缺失保护：prd.md 不存在时 implement/frontend 不出软指针行', () => {
  const root = makeProject()
  try {
    writeTaskFile(root, 'design.md', '# Design\n')
    writeTaskFile(root, 'implement.md', '# Implement\n')
    for (const kind of ['implement', 'frontend']) {
      const [err, result] = buildExecutorPrompt(baseParams(root, kind))
      assert.equal(err, null)
      assert.ok(!result.text.includes('consult .workloom/'), `${kind} must omit the soft pointer`)
      assert.deepEqual(result.stats, { filesInlined: 0, filesPointed: 2, truncated: 0 })
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('分层加载协议句：四种 kind contract 段均含分层语义 + 回声句后半逐字保留', () => {
  const root = makeProject()
  try {
    writeTaskFile(root, 'prd.md', '# PRD\n')
    for (const kind of ['research', 'implement', 'check', 'frontend']) {
      const [err, result] = buildExecutorPrompt(baseParams(root, kind))
      assert.equal(err, null)
      const section = result.text.slice(result.text.indexOf('## Executor contract'))
      assert.ok(section.includes('Load in layers'), `${kind} must carry layered loading`)
      assert.ok(
        section.includes('read the plan artifact (implement.md) before acting'),
        `${kind} must keep the plan-first mandate`,
      )
      assert.ok(
        section.includes('never bulk-read the whole list upfront'),
        `${kind} must forbid upfront bulk reads`,
      )
      assert.ok(section.includes(ECHO_PROTOCOL_HALF), `${kind} echo half must stay verbatim`)
      // 旧的「开工前强制全读」措辞不得残留
      assert.ok(
        !section.includes('Read the files in the injected pointer list before acting'),
        kind,
      )
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('implement 版 contract 段词数 ≤ 260（定稿压缩，空白分隔的英文词元口径）', () => {
  const root = makeProject()
  try {
    writeFullFixture(root)
    const [err, result] = buildExecutorPrompt(baseParams(root, 'implement'))
    assert.equal(err, null)
    const headingAt = result.text.indexOf('### Implement executor directives')
    assert.ok(headingAt !== -1)
    const section = result.text.slice(headingAt)
    // 口径：空白分隔后仅计含英文字母的词元（###、/ 等 markdown/标点符号不计）
    const words = section.split(/\s+/).filter((word) => /[A-Za-z]/.test(word))
    assert.ok(
      words.length <= 260,
      `implement contract section is ${words.length} words, must be <= 260`,
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
