/**
 * task-gates 模块单测：prd placeholder 判定、jsonl 有效记录判定、
 * start 门禁（含 alignment 分支）与 stale alignment 门禁求值（纯函数接缝）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  findMissingPrdTitle,
  findUnfilledPrdSections,
  countEffectiveJsonlRecords,
  evaluateFrontendDispatchGate,
  evaluateStaleAlignmentGate,
} from '../src/legacy/task-gates.js'
import { computePrdHash } from '../src/legacy/alignment.js'

/** 骨架 prd 原文（字面量独立于此模块常量，防同义反复）。 */
const SKELETON_PRD = `## Goal

(placeholder: describe the goal this task aims to achieve)

## Requirements

(placeholder: list the functional requirements)

## Acceptance Criteria

(placeholder: list the verifiable acceptance criteria)

## Notes

(placeholder: add notes and constraints)
`

test('骨架 prd 四小节全部判定为未填', () => {
  assert.deepEqual(findUnfilledPrdSections(SKELETON_PRD), [
    'Goal',
    'Requirements',
    'Acceptance Criteria',
    'Notes',
  ])
})

test('findMissingPrdTitle：首行无 H1 判缺失', () => {
  // 空文件与以二级标题开头均判缺失
  assert.equal(findMissingPrdTitle(''), 'prd.md missing H1 title')
  const missing = SKELETON_PRD
  assert.equal(findMissingPrdTitle(missing), 'prd.md missing H1 title')
  // 裸 `#`（无标题文本）与首行为其他正文也判缺失
  assert.equal(findMissingPrdTitle('#\n'), 'prd.md missing H1 title')
  assert.equal(findMissingPrdTitle('text first\n'), 'prd.md missing H1 title')
})

test('findMissingPrdTitle：首行为 H1（允许前导空行）判通过', () => {
  const withTitle = `# Ship the gate

${SKELETON_PRD}`
  assert.equal(findMissingPrdTitle(withTitle), null)
  assert.equal(findMissingPrdTitle(`\n\n${withTitle}`), null)
})

test('四小节全部填写后无未填项', () => {
  const filled = `## Goal

Ship the gate.

## Requirements

- hard block by default

## Acceptance Criteria

- start refuses on placeholder prd

## Notes

- force is recorded
`
  assert.deepEqual(findUnfilledPrdSections(filled), [])
})

test('逐小节判定：只有正文 trim 后与 placeholder 完全一致才算未填', () => {
  const partial = `## Goal

Ship the gate.

## Requirements

(placeholder: list the functional requirements)

## Acceptance Criteria

  (placeholder: list the verifiable acceptance criteria)  

## Notes

- see design.md
`
  // Acceptance Criteria 正文带额外空白，trim 后仍等于 placeholder，判未填
  assert.deepEqual(findUnfilledPrdSections(partial), ['Requirements', 'Acceptance Criteria'])
})

test('小节整体缺失视为未填', () => {
  const missing = `## Goal

Ship the gate.
`
  assert.deepEqual(findUnfilledPrdSections(missing), [
    'Requirements',
    'Acceptance Criteria',
    'Notes',
  ])
})

test('jsonl 有效记录判定：seed _example 行不算，空行跳过', () => {
  const seedOnly =
    '{"_example": "implement event log: one JSON object per line; lines without a file field are skipped automatically"}\n'
  assert.equal(countEffectiveJsonlRecords(seedOnly, 'implement.jsonl'), 0)
  const withEntries = `${seedOnly}{"file": ".workloom/spec/repo/code-style/index.md", "reason": "style"}\n\n{"file": "AGENTS.md"}\n`
  assert.equal(countEffectiveJsonlRecords(withEntries, 'implement.jsonl'), 2)
})

test('jsonl 有效记录判定：无 file 且非 _example 的行抛错（fail loud）', () => {
  assert.throws(
    () => countEffectiveJsonlRecords('{"note": "no file field"}\n', 'check.jsonl'),
    /check\.jsonl line 1: entry has no file field/,
  )
})

test('jsonl 有效记录判定：坏 JSON 行抛错', () => {
  assert.throws(
    () => countEffectiveJsonlRecords('{oops}\n', 'check.jsonl'),
    /failed to parse check\.jsonl line 1/,
  )
})

test('前端派发门禁：prd 含 UI Design 小节且无 frontend 派发 → 返回缺失项', () => {
  const prd = `# Task\n\n## UI Design\n\n- pages and IA\n`
  const missing = evaluateFrontendDispatchGate(prd, [
    { kind: 'implement', at: '2026-08-29T00:00:00Z', title: 'impl' },
  ])
  assert.deepEqual(missing, ['no frontend dispatch recorded for a task with UI requirements'])
})

test('前端派发门禁：prd 含 UI Design 且已有 frontend 派发 → 通过', () => {
  const prd = `# Task\n\n## UI Design\n\n- pages and IA\n`
  const missing = evaluateFrontendDispatchGate(prd, [
    { kind: 'implement', at: '2026-08-29T00:00:00Z', title: 'impl' },
    { kind: 'frontend', at: '2026-08-29T01:00:00Z', title: 'ui' },
  ])
  assert.deepEqual(missing, [])
})

test('前端派发门禁：prd 无 UI Design 小节 → 通过（不涉及前端展示零影响）', () => {
  const prd = `# Task\n\n## Requirements\n\n- no ui\n`
  const missing = evaluateFrontendDispatchGate(prd, [])
  assert.deepEqual(missing, [])
})

test('前端派发门禁：prd 缺失（null）且无派发 → 通过（缺失不判前端展示）', () => {
  const missing = evaluateFrontendDispatchGate(null, [])
  assert.deepEqual(missing, [])
})

/** 构造临时项目根（含 .workloom）与一个带 prd 的任务目录。 */
function makeTaskDir(prdContent) {
  const root = mkdtempSync(join(tmpdir(), 'workloom-gates-'))
  mkdirSync(join(root, '.workloom', 'tasks', 'x'), { recursive: true })
  writeFileSync(join(root, '.workloom', 'tasks', 'x', 'prd.md'), prdContent)
  return { root, rel: join('tasks', 'x') }
}

/** 一份已收敛的最小 prd（H1 + 四小节）。 */
const FILLED_PRD = `# Ship the gate

## Goal

Do the thing.

## Requirements

- req

## Acceptance Criteria

- ac

## Notes

- note
`

test('stale alignment 门禁：in_progress + 凭据 hash 与当前 prd 一致 → 放行', () => {
  const { root, rel } = makeTaskDir(FILLED_PRD)
  try {
    const hash = computePrdHash(FILLED_PRD)
    const task = { status: 'in_progress', alignment: { passedAt: 'x', summary: 's', prdHash: hash } }
    assert.deepEqual(evaluateStaleAlignmentGate(root, rel, task), [])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('stale alignment 门禁：in_progress + hash 失配 → 拦截（文案指引重新确认）', () => {
  const { root, rel } = makeTaskDir(FILLED_PRD)
  try {
    const task = {
      status: 'in_progress',
      alignment: { passedAt: 'x', summary: 's', prdHash: 'deadbeef' },
    }
    const missing = evaluateStaleAlignmentGate(root, rel, task)
    assert.equal(missing.length, 1)
    assert.match(missing[0], /alignment credential is stale/)
    assert.match(missing[0], /workloom_task_align/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('stale alignment 门禁：in_progress 无凭据（旧任务）与 planning/completed → 一律放行', () => {
  const { root, rel } = makeTaskDir(FILLED_PRD)
  try {
    // 旧 in_progress 空凭据（R17：不追溯阻断）
    assert.deepEqual(evaluateStaleAlignmentGate(root, rel, { status: 'in_progress', alignment: null }), [])
    // planning（research 派发合法，start 门禁另行约束）与 completed
    assert.deepEqual(evaluateStaleAlignmentGate(root, rel, { status: 'planning', alignment: null }), [])
    const stale = { passedAt: 'x', summary: 's', prdHash: 'deadbeef' }
    assert.deepEqual(evaluateStaleAlignmentGate(root, rel, { status: 'planning', alignment: stale }), [])
    assert.deepEqual(evaluateStaleAlignmentGate(root, rel, { status: 'completed', alignment: stale }), [])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('stale alignment 门禁：prd 缺失时放行（缺失由其他门禁覆盖）', () => {
  const { root, rel } = makeTaskDir(FILLED_PRD)
  try {
    rmSync(join(root, '.workloom', rel, 'prd.md'), { force: true })
    const stale = { passedAt: 'x', summary: 's', prdHash: 'deadbeef' }
    assert.deepEqual(
      evaluateStaleAlignmentGate(root, rel, { status: 'in_progress', alignment: stale }),
      [],
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
