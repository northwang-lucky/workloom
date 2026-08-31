/**
 * executor-context 单测：W9 上下文注入组装的预算/降级/报错行为（临时项目目录）。
 *
 * 覆盖：implement 全内联与统计；文件/总量预算截断与索引降级；research 只含 prd；
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

/** 写任务目录内文件。 */
function writeTaskFile(root, name, content) {
  writeFileSync(join(root, '.workloom', TASK_REL_PATH, name), content)
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
    // 任务正文在 prompt 末尾（其后仅叶子执行器契约段）
    assert.ok(text.includes('## Task prompt\nDo the thing'))
    assert.ok(text.endsWith(LEAF_CONTRACT_SUFFIX))
    assert.deepEqual(result.stats, { filesInlined: 5, filesIndexed: 0, truncated: 0 })
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
    assert.deepEqual(result.stats, { filesInlined: 5, filesIndexed: 0, truncated: 2 })
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
    assert.deepEqual(result.stats, { filesInlined: 1, filesIndexed: 0, truncated: 0 })
    assert.ok(text.includes('## Task prompt\nDo the thing'))
    assert.ok(text.endsWith(LEAF_CONTRACT_SUFFIX))
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

/** 叶子执行器契约段（与实现的固定尾部一致，测试自给自足）。 */
const LEAF_CONTRACT_SUFFIX =
  '## Executor contract\n' +
  'You are a leaf executor subagent: implement directly; never dispatch subagents or call workloom orchestration tools.'

test('prompt 末尾追加叶子执行器契约段（所有 kind 一致生效）', () => {
  const root = makeProject()
  try {
    writeTaskFile(root, 'prd.md', '# PRD\n')
    for (const kind of ['research', 'implement', 'check', 'frontend']) {
      const [err, result] = buildExecutorPrompt(baseParams(root, kind))
      assert.equal(err, null)
      assert.ok(
        result.text.endsWith(LEAF_CONTRACT_SUFFIX),
        `${kind} prompt must end with the leaf executor contract`,
      )
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('userPrompt 已含 leaf executor 关键词时不重复追加叶子契约段', () => {
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
    const count = result.text.split('## Executor contract').length - 1
    assert.equal(count, 0, 'leaf contract must not be appended when the keyword is already present')
    // userPrompt 原文保留（含关键词的正文仍在 prompt 中，其后注入 kind 纪律段）
    const promptAt = result.text.indexOf('## Task prompt')
    const directiveAt = result.text.indexOf('## Implement executor directives')
    assert.ok(promptAt !== -1 && directiveAt > promptAt, 'kind directive must follow the task prompt')
    assert.ok(
      result.text.includes('## Task prompt\nFollow the leaf executor rule and implement the task.'),
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

/** kind 纪律段标题（与实现一致，测试自给自足）。 */
function directiveHeading(kind) {
  return `## ${kind.charAt(0).toUpperCase()}${kind.slice(1)} executor directives`
}

test('四种 kind 均注入对应纪律段（独立标题 + 正文硬指令，位于叶子契约段之前）', () => {
  const root = makeProject()
  try {
    writeTaskFile(root, 'prd.md', '# PRD\n')
    const bodyKeywords = {
      research: 'Ground every conclusion in the real source',
      implement: 'Make the smallest change that satisfies the requirement',
      check: 'Fix what you find',
      frontend: 'Touch frontend files only',
    }
    for (const kind of Object.keys(bodyKeywords)) {
      const [err, result] = buildExecutorPrompt(baseParams(root, kind))
      assert.equal(err, null)
      const text = result.text
      const headingAt = text.indexOf(directiveHeading(kind))
      const taskPromptAt = text.indexOf('## Task prompt')
      const leafAt = text.indexOf('## Executor contract')
      assert.ok(headingAt !== -1, `${kind} prompt must include its kind directive heading`)
      assert.ok(
        taskPromptAt !== -1 && taskPromptAt < headingAt && headingAt < leafAt,
        `${kind} directive must sit between the task prompt and the leaf contract`,
      )
      assert.ok(text.includes(bodyKeywords[kind]), `${kind} directive body must be injected`)
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('check 纪律段要求发现即修、验证后以结构化 Open issues 段报告仅存问题', () => {
  const root = makeProject()
  try {
    writeTaskFile(root, 'prd.md', '# PRD\n')
    const [err, result] = buildExecutorPrompt(baseParams(root, 'check'))
    assert.equal(err, null)
    const start = result.text.indexOf(directiveHeading('check'))
    const end = result.text.indexOf('## Executor contract')
    const section = result.text.slice(start, end)
    // 发现即修，不做纯报告者
    assert.match(section, /Fix what you find/)
    assert.match(section, /not a reporter/)
    // 修复后运行项目验证
    assert.match(section, /lint \/ typecheck \/ tests/)
    // 报告末段结构化「仅存问题」段：段名 + 行格式 + 无仅存问题时写 - none
    assert.match(section, /## Open issues/)
    assert.match(section, /<file>:<line> \[<severity>\] <issue> — fix: <suggestion>/)
    assert.match(section, /"- none"/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('userPrompt 已含该 kind 纪律段标题时不再重复追加纪律段', () => {
  const root = makeProject()
  try {
    writeTaskFile(root, 'prd.md', '# PRD\n')
    // 对照：不含标题关键词时纪律段正常注入（保证本测试在实现前真实失败）
    const [plainErr, plain] = buildExecutorPrompt(baseParams(root, 'check'))
    assert.equal(plainErr, null)
    assert.ok(plain.text.includes('Fix what you find'))
    // 去重：userPrompt 已含标题短语时不重复注入纪律段正文
    const [err, result] = buildExecutorPrompt({
      root,
      taskRelPath: TASK_REL_PATH,
      kind: 'check',
      userPrompt: 'Check executor directives are already given; run the review.',
    })
    assert.equal(err, null)
    // 纪律段正文未注入：输出中仅 userPrompt 原样保留标题短语（无纪律段正文关键词）
    assert.equal(result.text.split(directiveHeading('check')).length, 1)
    assert.ok(!result.text.includes('## Open issues'))
    // 叶子契约段仍追加（userPrompt 未含 leaf executor 关键词）
    assert.ok(result.text.endsWith(LEAF_CONTRACT_SUFFIX))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
