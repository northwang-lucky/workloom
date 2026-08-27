/**
 * task-gates 模块单测：prd placeholder 判定、jsonl 有效记录判定、
 * start/check/archive 门禁求值与 force 豁免记录（纯函数接缝）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  findUnfilledPrdSections,
  countEffectiveJsonlRecords,
} from '../src/legacy/task-gates.js'

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
