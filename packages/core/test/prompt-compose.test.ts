/**
 * executor-context 单测：上下文注入组装的段落白名单/分层协议/统计/报错行为（临时项目目录）。
 *
 * 覆盖：五角色段落白名单与顺序（Task prompt 在 Local directives 之后、contract 末段）；
 * 纯指针注入——全角色 prd 软指针（无全文、无 H2 目录预览），checker 的 case.md 与
 * 模板副本走 Pointer list 指针行，副本缺失/过期 fail loud 指引 init，filesInlined 恒 0；
 * `## Involved files` 段全角色删除；指针行无
 * 「read before acting」后缀；分层按需加载协议句（回声句后半逐字保留、禁 upfront
 * 通读）；researcher 只含 prd；末尾终极权威段（角色纪律段 + leaf 规则 + 权威声明）
 * 的注入位置/去重/分级语义；developer/checker 纪律段按需查材料/禁止全局 recon 指令；
 * developer contract 词数上限；role/effort 非法报错（过渡期旧 kind 值容忍放行）；
 * jsonl 坏行报错。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import {
  EFFORT_LEVELS,
  assertEffort,
  assertRole,
  buildExecutorIncrementalPrompt,
  buildExecutorPrompt,
} from '../src/injection/prompt-compose.ts'

// 测试隔离：core 三层配置的全局层读 $HOME/.workloom/config（调用链无 homeDir 注入
// 缝时吃 os.homedir 实时值）；本机真实全局配置会泄漏进单测。重定向 HOME 到临时目录
// 使全局层恒为空（与 config.test.ts 的 homeDir 注入、executor.test.ts 的重定向同口径）。
const isolatedHome = mkdtempSync(join(tmpdir(), 'workloom-core-home-'))
// TMPDIR 一并指向隔离目录：夹具临时目录随之落在 HOME 之内，findWorkloomRoot 的
// 上溯在 HOME 边界停下（与真实环境“家目录为上溯边界”的语义一致）。
process.env.HOME = isolatedHome
process.env.TMPDIR = isolatedHome

/** 契约节 stub（纪律文本已迁 dsh discipline-text；组装测试只验证位置与机制）。 */
const CONTRACT_SECTION_STUB =
  '## Executor contract\n### Stub executor directives\n\nSTUB-DISCIPLINE-BODY\n\nSTUB-AUTHORITY'

/** 剔除注入标记行（单次注入 marker 随机，跨调用比较时先归一）。 */
/** 写带 CASE 记录的 task.json（CASE 注入用例共用；记录只含 required/designSession）。 */
function writeCaseTask(root, _caseText) {
  writeTaskFile(root, 'task.json', JSON.stringify({
    title: 'Demo',
    status: 'in_progress',
    mode: 'full',
    case: {
      required: true,
      designSession: 'child-design',
    },
    children: [],
    dispatches: [],
    overrides: [],
    hooks: { after_create: [], after_start: [], after_finish: [], after_archive: [] },
  }))
}

/** 写 task.json（任务记录直写，worktree 注入用例）。 */
function writeTaskJson(root, record) {
  writeTaskFile(root, 'task.json', `${JSON.stringify(record)}\n`)
}

/** 归一化唯一 marker 行（每次派发 nonce 不同，快照零 diff 对比口径）。 */
function normalizeMarker(text) {
  return text.replace(/Injection marker: [^\n]+/, 'Injection marker: <nonce>')
}

function stripMarkerLine(text) {
  return text
    .split('\n')
    .filter((line) => !line.startsWith(INJECTION_MARKER_PREFIX))
    .join('\n')
}

/** 组装白名单顺序测试的完整任务夹具（artifacts + jsonl + research 产物）。 */
function writeFullFixture(root) {
  writeTaskFile(
    root,
    'prd.md',
    ['# 任务', '', '## Requirements', 'REQ_BODY_MARKER', '', '## Notes', 'NOTES_BODY_MARKER'].join(
      '\n',
    ),
  )
  writeTaskFile(
    root,
    'plan.md',
    ['# Plan', '', '## 决策', 'DESIGN_BODY_MARKER', '', '## 步骤', 'IMPL_BODY_MARKER'].join('\n'),
  )
  const entries = '{"file": "packages/a.js", "reason": "spec"}\n'
  writeTaskFile(root, 'implement.jsonl', entries)
  writeTaskFile(root, 'check.jsonl', entries)
  writeTaskFile(root, 'research/facts.md', '# 材料\n')
  writeRootFile(root, 'packages/a.js', 'const a = 1\n')
}

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

/** 注入标记行前缀（与实现一致，测试自给自足）。 */
const INJECTION_MARKER_PREFIX = 'Injection marker: '

/** 任务目录相对 .workloom 的路径（测试统一使用）。 */
const TASK_REL_PATH = 'tasks/08-24-demo'

/** research 材料注入段标题（与实现一致，测试自给自足）。 */
const RESEARCH_MATERIALS_HEADING = '## Research materials'

/** prd 软指针行（implement/frontend 专有，独立一行无标题，定稿模板）。 */
const PRD_SOFT_POINTER_LINE =
  'If the task prompt or the plan is ambiguous, consult .workloom/tasks/08-24-demo/prd.md before deciding.'

/** files 清单注入段标题（全角色已删除，测试用于负向断言）。 */
const FILES_LIST_HEADING = '## Involved files'

/** jsonl 指针清单段标题（与实现一致，测试自给自足）。 */
const POINTER_LIST_HEADING = '## Pointer list'

/** 本机片段注入段标题（与实现一致，测试自给自足）。 */
const LOCAL_DIRECTIVES_HEADING = '## Local directives'

/** 经 core 逻辑播种模板副本（纯指针派发的正向夹具前提：内容取自插件资产）。 */
function seedCaseTemplates(root) {
  const dir = join(root, '.workloom', 'templates')
  mkdirSync(dir, { recursive: true })
  for (const name of ['case.md', 'case-result.md']) {
    const template = readFileSync(new URL(`../resources/templates/${name}`, import.meta.url), 'utf8')
    writeFileSync(join(dir, name), template)
  }
}

/** 创建临时项目根（含任务目录 + 模板副本）；测试结束清理。 */
function makeProject() {
  const root = mkdtempSync(join(tmpdir(), 'workloom-exec-'))
  mkdirSync(join(root, '.workloom', TASK_REL_PATH), { recursive: true })
  seedCaseTemplates(root)
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

/** 组装入参（role 之外字段固定）。 */
function baseParams(root, role) {
  return {
    root,
    taskRelPath: TASK_REL_PATH,
    role,
    userPrompt: 'Do the thing',
    contractSection: CONTRACT_SECTION_STUB,
  }
}

test('常量导出：effort 档位', () => {
  assert.deepEqual([...EFFORT_LEVELS], ['low', 'medium', 'high', 'xhigh', 'max'])
})

test('S1 jsonl 纯指针：developer/checker 注入只含「路径 + reason」指针行，无文件全文、无后缀', () => {
  const root = makeProject()
  try {
    writeTaskFile(root, 'prd.md', '# PRD\n')
    writeTaskFile(root, 'plan.md', '# Plan\n')
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
      // developer：不内联任何 artifact（prd 走软指针），指针 = prd 软指针 + plan + jsonl×2
      developer: { filesInlined: 0, filesPointed: 4, truncated: 0 },
      // checker：纯指针，指针 = prd 软指针 + plan + jsonl×2 + 模板副本×2（无 case.md）
      checker: { filesInlined: 0, filesPointed: 6, truncated: 0 },
    }
    for (const value of ['developer', 'checker']) {
      const [err, result] = buildExecutorPrompt(baseParams(root, value))
      assert.equal(err, null)
      const text = result.text
      // 指针清单段带标题（首行固定为 plan.md 纯指针行，后接 jsonl 条目）
      assert.ok(text.includes(POINTER_LIST_HEADING))
      assert.ok(text.includes('- .workloom/tasks/08-24-demo/plan.md\n'))
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
      assert.deepEqual(result.stats, expected[value])
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('纯指针化：prd 不再物化节块，plan.md 仅纯指针行（无 H2 目录预览），五角色仅软指针', () => {
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
      'plan.md',
      [
        '# Plan',
        '',
        '## 1. 决策一',
        '设计正文 DESIGN_BODY_MARKER',
        '',
        '## 2. 决策二',
        '设计正文二 BODY2_MARKER',
        '',
      ].join('\n'),
    )
    for (const role of ['checker', 'researcher', 'judger', 'developer', 'frontend-developer']) {
      const [err, result] = buildExecutorPrompt(baseParams(root, role))
      assert.equal(err, null, role)
      const text = result.text
      // prd 全文节块与 H2 目录预览全灭：只留软指针行
      assert.ok(!text.includes('--- .workloom/tasks/08-24-demo/prd.md ---'), role)
      for (const marker of [
        'REQ_BODY_MARKER',
        'ACC_BODY_MARKER',
        'GOAL_BODY_MARKER',
        'NOTES_BODY_MARKER',
        'Read in file:',
        'Read the full document in the file.',
      ]) {
        assert.ok(!text.includes(marker), `${role} must not materialize prd: ${marker}`)
      }
      assert.ok(text.includes(PRD_SOFT_POINTER_LINE), role)
      // plan.md 纯指针行：无 H2 标题预览、无正文
      assert.ok(!text.includes('## 1. 决策一'), role)
      assert.ok(!text.includes('DESIGN_BODY_MARKER'), role)
      assert.ok(!text.includes('BODY2_MARKER'), role)
      assert.ok(text.endsWith('STUB-AUTHORITY'), role)
      assert.equal(result.stats.filesInlined, 0, role)
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('jsonl 纯指针：指针行不随文件内容膨胀（无截断、无索引降级）', () => {
  const root = makeProject()
  try {
    writeTaskFile(root, 'prd.md', '# PRD\n')
    writeTaskFile(root, 'plan.md', '# P\n')
    writeTaskFile(
      root,
      'implement.jsonl',
      ['{"file": "a.txt", "reason": "first"}', '{"file": "b.txt", "reason": "second"}'].join('\n'),
    )
    writeRootFile(root, 'a.txt', 'x'.repeat(500))
    writeRootFile(root, 'b.txt', 'y'.repeat(500))
    const [err, result] = buildExecutorPrompt(baseParams(root, 'developer'))
    assert.equal(err, null)
    const text = result.text
    // 全部转指针行：无全文、无截断提示、无 [indexed] 降级、无逐行读后判后缀
    assert.ok(text.includes('- a.txt (first)\n'))
    assert.ok(text.includes('- b.txt (second)\n'))
    assert.ok(!text.includes('read before acting'))
    assert.ok(!text.includes('[...truncated'))
    assert.ok(!text.includes('[indexed]'))
    assert.ok(!text.includes('x'.repeat(500)))
    // 指针行不受预算影响：prd 软指针 + plan + jsonl×2 共 4 条
    assert.deepEqual(result.stats, { filesInlined: 0, filesPointed: 4, truncated: 0 })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('researcher 无 Pointer list：prd 只出软指针，无 jsonl/plan 引用行', () => {
  const root = makeProject()
  try {
    writeTaskFile(root, 'prd.md', '# PRD\n')
    // 不建 plan.md 与 jsonl，验证 researcher 不读 jsonl、缺失 artifact 跳过
    const [err, result] = buildExecutorPrompt(baseParams(root, 'researcher'))
    assert.equal(err, null)
    const text = result.text
    assert.ok(!text.includes('--- .workloom/tasks/08-24-demo/prd.md ---'))
    assert.ok(text.includes(PRD_SOFT_POINTER_LINE))
    assert.ok(!text.includes(POINTER_LIST_HEADING))
    assert.ok(!text.includes('.workloom/tasks/08-24-demo/plan.md'))
    assert.ok(!text.includes('implement.jsonl'))
    assert.deepEqual(result.stats, {
      filesInlined: 0,
      filesPointed: 1,
      truncated: 0,
    })
    assert.ok(text.includes('## Task prompt\nDo the thing'))
    assert.ok(text.endsWith('STUB-AUTHORITY'))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('role/effort 非法报错，undefined 放行，旧 kind 值拒绝（写侧已收严）', () => {
  assert.throws(() => assertEffort('ultra'), /invalid effort/)
  assert.throws(() => assertRole('bogus'), /invalid role/)
  assert.doesNotThrow(() => assertEffort(undefined))
  assert.doesNotThrow(() => assertEffort('xhigh'))
  assert.doesNotThrow(() => assertRole('checker'))
  // 收严后旧 kind 值一律拒绝（五值逐一断言，报错文案列新值域）。
  for (const legacy of ['research', 'implement', 'check', 'frontend', 'review']) {
    assert.throws(() => assertRole(legacy), /invalid role/, `legacy ${legacy} must be rejected`)
  }
  const root = makeProject()
  try {
    writeTaskFile(root, 'prd.md', '# PRD\n')
    const [err, result] = buildExecutorPrompt(baseParams(root, 'bogus'))
    assert.ok(err instanceof Error)
    assert.match(err.message, /invalid role/)
    // 报错文案列新值域（researcher/developer/frontend-developer/checker/judger）。
    assert.match(err.message, /researcher\/developer\/frontend-developer\/checker\/judger/)
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
    const [err, result] = buildExecutorPrompt(baseParams(root, 'developer'))
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
    const [err, built] = buildExecutorPrompt(baseParams(root, 'developer'))
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
    const [err, built] = buildExecutorPrompt(baseParams(root, 'developer'))
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
    const [err, built] = buildExecutorPrompt(baseParams(root, 'developer'))
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
    const [err, built] = buildExecutorPrompt(baseParams(root, 'developer'))
    assert.ok(err)
    assert.match(err.message, /no file field/)
    assert.equal(built, null)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('localDirectives 传入：文本注入于 Task prompt 之前、终极权威段之前', () => {
  const root = makeProject()
  try {
    writeTaskFile(root, 'prd.md', '# PRD\n')
    const [err, result] = buildExecutorPrompt({
      root,
      taskRelPath: TASK_REL_PATH,
      role: 'developer',
      userPrompt: 'Do the thing',
      contractSection: CONTRACT_SECTION_STUB,
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
    const base = baseParams(root, 'checker')
    const [plainErr, plain] = buildExecutorPrompt(base)
    const [emptyErr, empty] = buildExecutorPrompt({ ...base, localDirectives: '' })
    assert.equal(plainErr, null)
    assert.equal(emptyErr, null)
    // 缺省与空串输出（剔除随派发生成的唯一 marker 行后）逐字一致：marker 为
    // 单次注入标记，两次派发 token 不同属预期，其余内容不因 localDirectives 差异
    // 而改变（宿主不传参 = 不注入，向后兼容）。
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
      role: 'developer',
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
    const [err, result] = buildExecutorPrompt(baseParams(root, 'developer'))
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
    const [err, result] = buildExecutorPrompt(baseParams(root, 'developer'))
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

test('researcher 注入 research 材料段与 prd 软指针，且全角色无 Involved files 段', () => {
  const root = makeProject()
  try {
    writeTaskFile(root, 'prd.md', '# PRD\n')
    writeTaskFile(root, 'research/facts.md', '# 材料\n\n## 节\n\n- `pkg/a.js:1` 锚点\n')
    const [err, result] = buildExecutorPrompt(baseParams(root, 'researcher'))
    assert.equal(err, null)
    const text = result.text
    // 材料段在 prd 软指针之前、Task prompt 之前；锚点上下文包不再产生 Involved files 段
    const materialsAt = text.indexOf(RESEARCH_MATERIALS_HEADING)
    const softAt = text.indexOf(PRD_SOFT_POINTER_LINE)
    const taskPromptAt = text.indexOf('## Task prompt')
    assert.ok(materialsAt !== -1 && softAt !== -1 && taskPromptAt !== -1)
    assert.ok(materialsAt < softAt && softAt < taskPromptAt)
    assert.ok(!text.includes(FILES_LIST_HEADING), 'Involved files section must be removed')
    assert.ok(!text.includes('pkg/a.js'), 'anchor file list must not be injected')
    assert.equal(result.stats.filesPointed, 2)
    assert.equal(result.stats.filesInlined, 0)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('无 research 产物：不注入 research 段与 Involved files 段，统计缺省 0，注入链不受影响', () => {
  const root = makeProject()
  try {
    writeTaskFile(root, 'prd.md', '# PRD\n')
    const [err, result] = buildExecutorPrompt(baseParams(root, 'developer'))
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
    assert.ok(text.endsWith('STUB-AUTHORITY'))
    assert.deepEqual(result.stats, {
      filesInlined: 0,
      filesPointed: 1,
      truncated: 0,
    })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('Involved files 段全角色删除：researcher 锚点上下文包不再注入清单段（userPrompt 关键词无关）', () => {
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
        '- `packages/core/src/domain/executor-context.js:100` 锚点一',
        '- `packages/core/src/domain/config.js:60` 锚点二',
        '',
      ].join('\n'),
    )
    for (const role of ['researcher', 'developer', 'checker', 'frontend-developer']) {
      for (const userPrompt of [
        'Do the thing',
        '涉及文件：a.js、b.js',
        'files: a.js',
        '改动文件：a.js',
      ]) {
        const [err, result] = buildExecutorPrompt({
          root,
          taskRelPath: TASK_REL_PATH,
          role,
          userPrompt,
        })
        assert.equal(err, null)
        assert.ok(
          !result.text.includes(FILES_LIST_HEADING),
          `${role} must not inject the Involved files section`,
        )
        assert.ok(
          !result.text.includes('packages/core/src/domain/executor-context.js'),
          `${role} must not leak the anchor file list`,
        )
      }
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('S5 护栏：注入含唯一 marker token（两次派发不同）', () => {
  const root = makeProject()
  try {
    writeTaskFile(root, 'prd.md', '# PRD\n')
    writeTaskFile(root, 'plan.md', '# Plan\n')
    writeTaskFile(root, 'implement.jsonl', '{"file": "packages/a.js", "reason": "spec"}\n')
    writeRootFile(root, 'packages/a.js', 'const a = 1\n')
    for (const role of ['researcher', 'developer', 'checker', 'frontend-developer', 'judger']) {
      const [err, result] = buildExecutorPrompt(baseParams(root, role))
      assert.equal(err, null)
            // 注入含唯一 marker token（随派发注入，证明注入到达）
      assert.ok(
        extractMarkerToken(result.text) !== null,
        `${role} injection must carry the unique marker token`,
      )
    }
    // 同任务两次派发 token 不同（单次注入标记回声机制）
    const first = buildExecutorPrompt(baseParams(root, 'developer'))
    const second = buildExecutorPrompt(baseParams(root, 'developer'))
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
test('段落白名单与顺序：五角色纯指针组装，Task prompt 在 Local directives 之后、contract 恒末段', () => {
  const root = makeProject()
  try {
    writeFullFixture(root)
    const marker = (text, needle) => {
      const at = text.indexOf(needle)
      assert.ok(at !== -1, `missing section: ${needle}`)
      return at
    }
    for (const role of ['researcher', 'developer', 'checker', 'frontend-developer', 'judger']) {
      const [err, result] = buildExecutorPrompt({
        ...baseParams(root, role),
        localDirectives: 'LOCAL_FRAGMENT',
      })
      assert.equal(err, null)
      const text = result.text
      // 公共段：任务标注 + 注入 marker 首行
      assert.ok(text.startsWith(`Active task: ${TASK_REL_PATH}\nInjection marker: `), role)
      const materialsAt = marker(text, RESEARCH_MATERIALS_HEADING)
      const localAt = marker(text, LOCAL_DIRECTIVES_HEADING)
      const taskAt = marker(text, '## Task prompt')
      const contractAt = marker(text, '## Executor contract')
      // 顺序：materials < Local directives < Task prompt < Executor contract（contract 恒末段）
      assert.ok(materialsAt < localAt && localAt < taskAt && taskAt < contractAt, role)
      assert.ok(text.endsWith('STUB-AUTHORITY'), role)
      // 全角色无 Involved files 段
      assert.ok(!text.includes(FILES_LIST_HEADING), role)
      // 指针行无逐行「read before acting」后缀
      assert.ok(!text.includes('read before acting'), role)
      // 分层加载协议断言随纪律文本迁 dsh discipline-text.test.ts；组装侧只要求
      // contract 节由调用方注入并整段收尾（stub 节恒末段已由上方断言覆盖）
      const prdBlockAt = text.indexOf('--- .workloom/tasks/08-24-demo/prd.md ---')
      const pointerAt = text.indexOf(POINTER_LIST_HEADING)
      const softAt = text.indexOf(PRD_SOFT_POINTER_LINE)
      // prd 全文块全角色删除；软指针独立一行无标题，位于 Research materials 之后、Local directives 之前
      assert.equal(prdBlockAt, -1, `${role} must not inline the prd block`)
      assert.ok(!text.includes('REQ_BODY_MARKER'), role)
      assert.ok(softAt !== -1 && materialsAt < softAt && softAt < localAt, role)
      if (role === 'researcher') {
        assert.equal(pointerAt, -1, 'research has no pointer list section')
      } else {
        // Pointer list：plan.md 纯指针行起头；checker 追加模板副本指针，后接 jsonl 条目
        assert.ok(pointerAt !== -1 && pointerAt < materialsAt, role)
        const pointerBlock = text.slice(pointerAt, materialsAt)
        const lines = pointerBlock.split('\n').filter((line) => line.startsWith('- '))
        const expected = ['- .workloom/tasks/08-24-demo/plan.md']
        if (role === 'checker') {
          expected.push(
            '- .workloom/templates/case.md',
            '- .workloom/templates/case-result.md',
          )
        }
        expected.push('- packages/a.js (spec)')
        assert.deepEqual(lines, expected, `${role} pointer list structure`)
      }
      // H2 目录预览全灭：plan.md 正文与标题均不进注入
      assert.ok(!text.includes('## 决策') && !text.includes('DESIGN_BODY_MARKER'), role)
      assert.ok(!text.includes('## 步骤') && !text.includes('IMPL_BODY_MARKER'), role)
      assert.ok(!text.includes('NOTES_BODY_MARKER'), role)
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('prd 软指针行缺失保护：prd.md 不存在时 implement/frontend 不出软指针行', () => {
  const root = makeProject()
  try {
    writeTaskFile(root, 'plan.md', '# Plan\n')
    for (const role of ['developer', 'frontend-developer']) {
      const [err, result] = buildExecutorPrompt(baseParams(root, role))
      assert.equal(err, null)
      assert.ok(!result.text.includes('consult .workloom/'), `${role} must omit the soft pointer`)
      assert.deepEqual(result.stats, { filesInlined: 0, filesPointed: 1, truncated: 0 })
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('S2 worktree 注入：worktree_path 非空 → ## Worktree 段（绝对路径 + Branch 行 + 三条纪律要点），位于 prd 软指针之后、Local directives/Task prompt 之前', () => {
  const root = makeProject()
  try {
    writeFullFixture(root)
    writeTaskJson(root, {
      title: 'Worktree task',
      status: 'in_progress',
      worktree_path: '.workloom/.runtime/worktrees/task-wt-1',
      branch: 'workloom/task-wt-1',
      base_branch: 'main',
    })
    const [err, result] = buildExecutorPrompt({
      ...baseParams(root, 'developer'),
      localDirectives: 'LOCAL_FRAGMENT',
    })
    assert.equal(err, null)
    const text = result.text
    const wtAt = text.indexOf('## Worktree')
    assert.ok(wtAt !== -1, 'worktree section must be injected')
    const softAt = text.indexOf(PRD_SOFT_POINTER_LINE)
    const localAt = text.indexOf(LOCAL_DIRECTIVES_HEADING)
    const taskAt = text.indexOf('## Task prompt')
    assert.ok(softAt !== -1 && softAt < wtAt, 'worktree section follows the prd soft pointer')
    assert.ok(
      wtAt < localAt && wtAt < taskAt,
      'worktree section precedes Local directives and Task prompt',
    )
    // 绝对路径 = resolve(root, worktree_path)
    assert.ok(
      text.includes(`Path: ${resolve(root, '.workloom/.runtime/worktrees/task-wt-1')}\n`),
      'abs worktree path must render',
    )
    assert.ok(text.includes('Branch: workloom/task-wt-1 (base main)\n'), 'branch line must render')
    // 纪律要点关键词：代码面指向 worktree / 元数据写主仓 .workloom / 提交在 worktree 任务分支
    assert.ok(
      text.includes('- All code reads, writes, builds, and tests target this worktree'),
      'code-target discipline bullet',
    )
    assert.ok(text.includes('workdir or absolute paths'), 'bash workdir discipline')
    assert.ok(
      text.includes('written to the main repository .workloom'),
      'metadata stays in main repo .workloom',
    )
    assert.ok(
      text.includes('- Code commits happen in this worktree on the task branch.'),
      'commit-on-task-branch bullet',
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('S2 worktree 零 diff：worktree_path 空串 / task.json 损坏（readTask 失败降级不抛）→ 产物与无 task.json 基线逐字相同（marker 归一），stats 一致', () => {
  /** @type {Record<string, string>} */
  const roots = {}
  try {
    for (const name of ['baseline', 'empty', 'broken']) {
      roots[name] = makeProject()
      writeFullFixture(roots[name])
    }
    writeTaskJson(roots.empty, {
      title: 'No worktree',
      status: 'in_progress',
      worktree_path: '',
      branch: 'workloom/x',
      base_branch: 'main',
    })
    writeTaskFile(roots.broken, 'task.json', '{ this is not valid json')
    for (const role of ['researcher', 'developer', 'checker', 'frontend-developer']) {
      const [baseErr, baseResult] = buildExecutorPrompt(baseParams(roots.baseline, role))
      assert.equal(baseErr, null)
      for (const name of ['empty', 'broken']) {
        const [err, result] = buildExecutorPrompt(baseParams(roots[name], role))
        assert.equal(err, null, `${name}/${role} must not fail (silent degrade)`)
        assert.ok(!result.text.includes('## Worktree'), `${name}/${role} must not inject worktree`)
        assert.equal(
          normalizeMarker(result.text),
          normalizeMarker(baseResult.text),
          `${name}/${role} must be byte-identical to the baseline`,
        )
        assert.deepEqual(result.stats, baseResult.stats, `${name}/${role} stats unchanged`)
      }
    }
  } finally {
    for (const root of Object.values(roots)) {
      rmSync(root, { recursive: true, force: true })
    }
  }
})

test('CASE 指针顺序：Pointer list 内 plan → case.md → 模板副本 → jsonl，全文不入注入', () => {
  const root = makeProject()
  try {
    writeFullFixture(root)
    writeTaskFile(root, 'case.md', 'CASE_BODY_MARKER\n')
    writeCaseTask(root, 'CASE_BODY_MARKER\n')
    const [err, result] = buildExecutorPrompt({
      ...baseParams(root, 'checker'),
      purpose: 'case-design',
    })
    assert.equal(err, null)
    const text = result.text
    const pointerAt = text.indexOf(POINTER_LIST_HEADING)
    assert.ok(pointerAt !== -1)
    const list = text
      .slice(pointerAt, text.indexOf(RESEARCH_MATERIALS_HEADING))
      .split('\n')
      .filter((line) => line.startsWith('- '))
    assert.deepEqual(list, [
      '- .workloom/tasks/08-24-demo/plan.md',
      '- .workloom/tasks/08-24-demo/case.md',
      '- .workloom/templates/case.md',
      '- .workloom/templates/case-result.md',
      '- packages/a.js (spec)',
    ])
    assert.ok(!text.includes('CASE_BODY_MARKER'), 'CASE 正文不外泄')
    // 非 checker 角色不注入 CASE 指针与模板副本指针
    const [, implement] = buildExecutorPrompt({
      ...baseParams(root, 'developer'),
      purpose: 'case-design',
    })
    assert.ok(!implement.text.includes('- .workloom/tasks/08-24-demo/case.md'))
    assert.ok(!implement.text.includes('- .workloom/templates/case.md'))
    assert.ok(!implement.text.includes('- .workloom/templates/case-result.md'))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('CASE 大内容只出指针：全文不进注入', () => {
  const root = makeProject()
  try {
    writeFullFixture(root)
    writeTaskFile(root, 'case.md', 'X'.repeat(64))
    writeCaseTask(root, 'X'.repeat(64))
    const [err, result] = buildExecutorPrompt({
      ...baseParams(root, 'checker'),
      purpose: 'case-design',
    })
    assert.equal(err, null)
    assert.ok(result.text.includes('- .workloom/tasks/08-24-demo/case.md'))
    assert.ok(!result.text.includes('X'.repeat(64)))
    assert.equal(result.stats.truncated, 0)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('纯指针注入：prd 对所有角色只出软指针，checker 的 case.md 与模板副本为 Pointer list 指针行', () => {
  const root = makeProject()
  try {
    writeFullFixture(root)
    writeTaskFile(root, 'case.md', 'CASE_BODY_MARKER\n')
    writeCaseTask(root, 'CASE_BODY_MARKER\n')
    for (const role of ['researcher', 'developer', 'checker', 'frontend-developer', 'judger']) {
      const [err, result] = buildExecutorPrompt(baseParams(root, role))
      assert.equal(err, null, role)
      const text = result.text
      // 无 prd 全文块：全角色只出软指针
      assert.ok(!text.includes('--- .workloom/tasks/08-24-demo/prd.md ---'), role)
      assert.ok(!text.includes('REQ_BODY_MARKER'), role)
      assert.ok(text.includes(PRD_SOFT_POINTER_LINE), role)
      assert.equal(result.stats.filesInlined, 0, role)
      if (role === 'checker') {
        const pointerAt = text.indexOf(POINTER_LIST_HEADING)
        assert.ok(pointerAt !== -1)
        const listBlock = text.slice(pointerAt, text.indexOf(RESEARCH_MATERIALS_HEADING))
        const list = listBlock.split('\n').filter((line) => line.startsWith('- '))
        assert.deepEqual(list, [
          '- .workloom/tasks/08-24-demo/plan.md',
          '- .workloom/tasks/08-24-demo/case.md',
          '- .workloom/templates/case.md',
          '- .workloom/templates/case-result.md',
          '- packages/a.js (spec)',
        ])
        assert.ok(!text.includes('CASE_BODY_MARKER'))
      } else if (role === 'researcher') {
        assert.ok(!text.includes(POINTER_LIST_HEADING), 'researcher has no Pointer list')
      }
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('checker 模板副本缺失/过期 fail loud，拒绝派发并指引重跑 init', () => {
  const root = makeProject()
  try {
    writeFullFixture(root)
    writeCaseTask(root, 'CASE_BODY_MARKER\n')
    rmSync(join(root, '.workloom', 'templates'), { recursive: true, force: true })
    // 副本缺失：拒绝派发
    const [missingErr, missing] = buildExecutorPrompt(baseParams(root, 'checker'))
    assert.ok(missingErr instanceof Error)
    assert.match(missingErr.message, /rerun workloom init/)
    assert.equal(missing, null)
    // 副本过期：写脏后同样拒绝
    seedCaseTemplates(root)
    writeFileSync(join(root, '.workloom/templates/case.md'), '# stale copy\n')
    const [staleErr] = buildExecutorPrompt(baseParams(root, 'checker'))
    assert.ok(staleErr instanceof Error)
    assert.match(staleErr.message, /rerun workloom init/)
    // 非 checker 不受守卫影响
    const [devErr] = buildExecutorPrompt(baseParams(root, 'developer'))
    assert.equal(devErr, null)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('增量续用只追加本轮执行指令，execution 缺设计会话先拒绝', () => {
  const root = makeProject()
  try {
    writeFullFixture(root)
    const caseText = '# CASE\n'
    writeTaskFile(root, 'case.md', caseText)
    writeTaskFile(root, 'task.json', JSON.stringify({
      title: 'Demo',
      status: 'in_progress',
      mode: 'full',
      case: {
        required: true,
        designSession: null,
      },
      children: [],
      dispatches: [],
      overrides: [],
      hooks: { after_create: [], after_start: [], after_finish: [], after_archive: [] },
    }))
    // execution 前置：required=true 且 designSession 缺失 → 拒绝且不发增量
    assert.throws(
      () => buildExecutorIncrementalPrompt({ ...baseParams(root, 'checker'), purpose: 'execution' }),
      /CASE execution rejected: case\.designSession is missing/,
    )
    // 设计轮无执行前置，增量原文返回
    assert.equal(
      buildExecutorIncrementalPrompt({ ...baseParams(root, 'checker'), purpose: 'case-design' }),
      'Do the thing',
    )
    // 记录 designSession 后 execution 放行：增量只含本轮指令，不追加哈希文本
    writeTaskFile(root, 'task.json', JSON.stringify({
      title: 'Demo',
      status: 'in_progress',
      mode: 'full',
      case: {
        required: true,
        designSession: 'child-design',
      },
      children: [],
      dispatches: [],
      overrides: [],
      hooks: { after_create: [], after_start: [], after_finish: [], after_archive: [] },
    }))
    const incremental = buildExecutorIncrementalPrompt({
      ...baseParams(root, 'checker'),
      purpose: 'execution',
    })
    assert.equal(incremental, 'Do the thing')
    assert.ok(!incremental.includes('Confirmed CASE hash'), '增量不得再追加确认哈希行')
    // 非 checker 角色：增量原文返回，不做 CASE 校验
    assert.equal(
      buildExecutorIncrementalPrompt({ ...baseParams(root, 'developer'), purpose: 'execution' }),
      'Do the thing',
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
