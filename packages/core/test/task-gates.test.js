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
  PRD_STRUCTURE_CODES,
  findMissingPrdTitle,
  findUnfilledPrdSections,
  inspectPrdStructure,
  countEffectiveJsonlRecords,
  evaluateFrontendDispatchGate,
  evaluateLightDispatchGate,
  evaluateStartGate,
  evaluateStaleAlignmentGate,
} from '../src/domain/task-gates.js'
import { computePrdHash } from '../src/domain/alignment.js'

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

/** 完整可确认 prd（H1 + 四小节实填 + 收敛 marker；对齐服务级验收样本的形状）。 */
const CONVERGED_PRD = `# Ship the gate

## Goal

Ship the gate.

## Requirements

- hard block by default

## Acceptance Criteria

- start refuses on placeholder prd

## Notes

- force is recorded

## Alignment Decisions

- design tree converged

<!-- workloom:open-nodes=none -->
`

test('inspectPrdStructure：prd 缺失只报 prd_missing', () => {
  assert.deepEqual(inspectPrdStructure(null), [
    { code: PRD_STRUCTURE_CODES.PRD_MISSING, message: 'prd.md is missing' },
  ])
})

test('inspectPrdStructure：完整收敛 prd 无结构问题', () => {
  assert.deepEqual(inspectPrdStructure(CONVERGED_PRD), [])
})

test('inspectPrdStructure：缺 H1 报 prd_title_missing', () => {
  const prd = CONVERGED_PRD.replace('# Ship the gate\n\n', '')
  const issues = inspectPrdStructure(prd)
  assert.deepEqual(issues, [
    { code: PRD_STRUCTURE_CODES.PRD_TITLE_MISSING, message: 'prd.md missing H1 title' },
  ])
})

test('inspectPrdStructure：小节整体缺失报 prd_section_missing（区别于 placeholder）', () => {
  const prd = CONVERGED_PRD.replace('## Notes\n\n- force is recorded\n\n', '')
  assert.deepEqual(inspectPrdStructure(prd), [
    {
      code: PRD_STRUCTURE_CODES.PRD_SECTION_MISSING,
      message: 'prd.md section "Notes" is missing',
      section: 'Notes',
    },
  ])
})

test('inspectPrdStructure：`## Note` 单数别名不兼容，按 Notes missing 处理', () => {
  const prd = CONVERGED_PRD.replace('## Notes', '## Note')
  assert.deepEqual(inspectPrdStructure(prd), [
    {
      code: PRD_STRUCTURE_CODES.PRD_SECTION_MISSING,
      message: 'prd.md section "Notes" is missing',
      section: 'Notes',
    },
  ])
})

test('inspectPrdStructure：小节存在但正文仍为 placeholder 报 prd_section_placeholder', () => {
  const prd = CONVERGED_PRD.replace('- force is recorded', '(placeholder: add notes and constraints)')
  assert.deepEqual(inspectPrdStructure(prd), [
    {
      code: PRD_STRUCTURE_CODES.PRD_SECTION_PLACEHOLDER,
      message: 'prd.md section "Notes" is still a placeholder',
      section: 'Notes',
    },
  ])
})

test('inspectPrdStructure：marker 缺失与非 none 状态分别报不同 code', () => {
  const noMarker = CONVERGED_PRD.replace('<!-- workloom:open-nodes=none -->\n', '')
  assert.deepEqual(inspectPrdStructure(noMarker), [
    {
      code: PRD_STRUCTURE_CODES.PRD_OPEN_NODES_MISSING,
      message: 'prd.md open-nodes marker is missing',
    },
  ])
  const pending = CONVERGED_PRD.replace('open-nodes=none', 'open-nodes=pending')
  assert.deepEqual(inspectPrdStructure(pending), [
    {
      code: PRD_STRUCTURE_CODES.PRD_OPEN_NODES_NOT_NONE,
      message: 'prd.md open nodes are not converged (marker state: "pending")',
    },
  ])
})

test('inspectPrdStructure：多问题一次返回且顺序固定（H1 → 骨架小节 → open nodes）', () => {
  const prd = `## Requirements

(placeholder: list the functional requirements)

## Acceptance Criteria

- ac

## Notes

- note

<!-- workloom:open-nodes=pending -->
`
  assert.deepEqual(inspectPrdStructure(prd), [
    { code: 'prd_title_missing', message: 'prd.md missing H1 title' },
    { code: 'prd_section_missing', message: 'prd.md section "Goal" is missing', section: 'Goal' },
    {
      code: 'prd_section_placeholder',
      message: 'prd.md section "Requirements" is still a placeholder',
      section: 'Requirements',
    },
    {
      code: 'prd_open_nodes_not_none',
      message: 'prd.md open nodes are not converged (marker state: "pending")',
    },
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

test('前端派发门禁：UI Design 小节首行为不适用声明 → 通过（不要求 frontend 派发）', () => {
  const declarations = [
    '不适用：本任务无前端界面改动，仅工具回执文本增加标注。',
    'N/A',
    'n/a: backend only',
    'Not applicable — 无前端触点',
    'NOT APPLICABLE',
    'None',
    '  不适用  ',
  ]
  for (const declaration of declarations) {
    const prd = `# Task\n\n## UI Design\n\n${declaration}\n`
    const missing = evaluateFrontendDispatchGate(prd, [])
    assert.deepEqual(missing, [], `declaration should pass: ${declaration}`)
  }
})

test('前端派发门禁：不适用声明带后续说明段 → 仍按首行认定通过', () => {
  const prd = `# Task\n\n## UI Design\n\n不适用：无前端界面。\n\n仅回执文本变化，属 runtime 文案。\n`
  const missing = evaluateFrontendDispatchGate(prd, [])
  assert.deepEqual(missing, [])
})

test('前端派发门禁：声明词只出现在正文中部 → 不认定声明，仍拦截', () => {
  const prd = `# Task\n\n## UI Design\n\n- 新增设置页\n- 旧布局说明：不适用\n`
  const missing = evaluateFrontendDispatchGate(prd, [])
  assert.deepEqual(missing, ['no frontend dispatch recorded for a task with UI requirements'])
})

test('前端派发门禁：UI Design 小节正文为空 → 维持现状拦截（空正文不是声明）', () => {
  const prd = `# Task\n\n## UI Design\n\n## Notes\n\n- x\n`
  const missing = evaluateFrontendDispatchGate(prd, [])
  assert.deepEqual(missing, ['no frontend dispatch recorded for a task with UI requirements'])
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

/**
 * 轻量任务的最低 prd：H1 + Goal 实填，其余小节仍是骨架 placeholder，
 * 且没有 open-nodes marker（轻量 start 门只要求 H1 + Goal）。
 */
const LIGHT_MIN_PRD = `# Light fix

## Goal

Repair the shell file.

## Requirements

(placeholder: list the functional requirements)

## Acceptance Criteria

(placeholder: list the verifiable acceptance criteria)

## Notes

(placeholder: add notes and constraints)
`

test('start 门禁 light：H1 + Goal 填写即放行（免 jsonl/凭证/marker）', () => {
  const { root, rel } = makeTaskDir(LIGHT_MIN_PRD)
  try {
    const task = { mode: 'light', status: 'planning', alignment: null }
    // 任务目录内没有 implement.jsonl/check.jsonl（makeTaskDir 只写 prd.md）。
    assert.deepEqual(evaluateStartGate(root, rel, task), [])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('start 门禁 light：缺 H1 仍拦截', () => {
  const { root, rel } = makeTaskDir(LIGHT_MIN_PRD.replace('# Light fix\n\n', ''))
  try {
    const missing = evaluateStartGate(root, rel, { mode: 'light', status: 'planning' })
    assert.deepEqual(missing, ['prd.md missing H1 title'])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('start 门禁 light：Goal 是小节 placeholder 或缺失仍拦截', () => {
  const placeholderGoal = LIGHT_MIN_PRD.replace(
    'Repair the shell file.',
    '(placeholder: describe the goal this task aims to achieve)',
  )
  const placeholderDir = makeTaskDir(placeholderGoal)
  try {
    const missing = evaluateStartGate(placeholderDir.root, placeholderDir.rel, {
      mode: 'light',
      status: 'planning',
    })
    assert.deepEqual(missing, ['prd.md section "Goal" is still a placeholder'])
  } finally {
    rmSync(placeholderDir.root, { recursive: true, force: true })
  }
  const missingGoal = LIGHT_MIN_PRD.replace('## Goal\n\nRepair the shell file.\n\n', '')
  const missingDir = makeTaskDir(missingGoal)
  try {
    const missing = evaluateStartGate(missingDir.root, missingDir.rel, {
      mode: 'light',
      status: 'planning',
    })
    assert.deepEqual(missing, ['prd.md section "Goal" is missing'])
  } finally {
    rmSync(missingDir.root, { recursive: true, force: true })
  }
})

test('start 门禁 light：prd 缺失只报 prd.md is missing', () => {
  const { root, rel } = makeTaskDir(LIGHT_MIN_PRD)
  try {
    rmSync(join(root, '.workloom', rel, 'prd.md'), { force: true })
    assert.deepEqual(
      evaluateStartGate(root, rel, { mode: 'light', status: 'planning' }),
      ['prd.md is missing'],
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('start 门禁 full：同一份最低 prd 仍按完整门禁拦截（零变化护栏）', () => {
  const { root, rel } = makeTaskDir(LIGHT_MIN_PRD)
  try {
    const missing = evaluateStartGate(root, rel, { mode: 'full', status: 'planning', alignment: null })
    // 其余三个骨架小节、marker、双 jsonl 与对齐凭证都必须出现在拦截项里。
    assert.ok(missing.some((item) => item.includes('"Requirements"')))
    assert.ok(missing.some((item) => item.includes('"Acceptance Criteria"')))
    assert.ok(missing.some((item) => item.includes('"Notes"')))
    assert.ok(missing.some((item) => item.includes('open-nodes marker')))
    assert.ok(missing.some((item) => item.includes('implement.jsonl')))
    assert.ok(missing.some((item) => item.includes('check.jsonl')))
    assert.ok(missing.some((item) => item.includes('alignment')))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('light 派发门禁：light 任务拒绝（文案说明主会话包办），full 任务放行', () => {
  const light = evaluateLightDispatchGate({ mode: 'light' })
  assert.equal(light.length, 1)
  assert.match(light[0], /light task/)
  assert.match(light[0], /main session/)
  assert.deepEqual(evaluateLightDispatchGate({ mode: 'full' }), [])
  // 旧记录缺 mode 的读取归一化由 task-store 负责；门禁只认显式 light。
  assert.deepEqual(evaluateLightDispatchGate({}), [])
})

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
