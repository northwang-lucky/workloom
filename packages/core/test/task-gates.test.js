/**
 * task-gates 模块单测：prd placeholder 判定、jsonl 有效记录判定、
 * start 门禁（PRD/PLAN 内容确认只判记录有无）求值（纯函数接缝）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  PLAN_MISSING,
  PLAN_NOT_CONFIRMED,
  PRD_STRUCTURE_CODES,
  findMissingPrdTitle,
  findUnfilledPrdSections,
  inspectPlanStructure,
  inspectPrdStructure,
  countEffectiveJsonlRecords,
  evaluateFrontendDispatchGate,
  evaluateLightDispatchGate,
  evaluateStartGate,
} from '../src/domain/task-gates.js'

/** 骨架 prd 原文（字面量独立于此模块常量，防同义反复）：完整任务固定十一小节。 */
const SKELETON_PRD = `## Context

(placeholder: explain the problem background and why this task exists now; describe the consumer-observable situation, not the solution)

## Goal

(placeholder: describe the outcome this task achieves and how it will be observed; the goal must follow from the context above)

## Scope

(placeholder: state what is in scope and what is explicitly excluded (non-goals); keep each boundary decidable)

## Assumptions, Constraints and Dependencies

(placeholder: list assumptions taken, hard constraints respected, and external dependencies relied on; write none with a short reason when a category does not apply)

## Requirements

(placeholder: group requirements by capability or behavior as numbered items R1, R2, ...; each item is one necessary, decidable statement; do not transcribe Q&A rounds)

## Acceptance Criteria

(placeholder: list acceptance criteria as numbered items AC1, AC2, ...; each item cites the R numbers it covers and states its verification method)

## Edge Cases and Failure Paths

(placeholder: describe boundary conditions and failure modes with how each is handled; write none with a short reason when there are none)

## Risks and Open Questions

(placeholder: record unresolved questions and risks directly; the main session decides convergence from this content)

## Alignment Decisions

(placeholder: record only the key decisions with their rationale; do not save Q/A numbering or per-round replies)

## References

(placeholder: link the research reports, specs, and external sources this PRD relies on; write none when there are none)

## Notes

(placeholder: add notes that do not belong to any section above)
`

test('骨架 prd 十一小节全部判定为未填', () => {
  assert.deepEqual(findUnfilledPrdSections(SKELETON_PRD), [
    'Context',
    'Goal',
    'Scope',
    'Assumptions, Constraints and Dependencies',
    'Requirements',
    'Acceptance Criteria',
    'Edge Cases and Failure Paths',
    'Risks and Open Questions',
    'Alignment Decisions',
    'References',
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

/** 除 Requirements/Acceptance Criteria 外九个小节的实填正文（逐小节判定测试共用）。 */
const FILLED_OTHER_SECTIONS = `## Context

The start gate needs a sample prd.

## Goal

Ship the gate.

## Scope

In scope: the gate itself. Non-goals: none.

## Assumptions, Constraints and Dependencies

Runs on the existing gate harness without new dependencies.

## Edge Cases and Failure Paths

None: no boundary conditions beyond the gate itself.

## Risks and Open Questions

None: no open questions remain.

## Alignment Decisions

- design tree converged

## References

None.

## Notes

- see design.md
`

test('十一小节全部填写后无未填项', () => {
  const filled = `${FILLED_OTHER_SECTIONS}

## Requirements

- R1: hard block by default

## Acceptance Criteria

- AC1（覆盖 R1）: start refuses on placeholder prd. 验证方法：run the gate tests.
`
  assert.deepEqual(findUnfilledPrdSections(filled), [])
})

test('逐小节判定：只有正文 trim 后与 placeholder 完全一致才算未填', () => {
  const partial = `${FILLED_OTHER_SECTIONS}

## Requirements

(placeholder: group requirements by capability or behavior as numbered items R1, R2, ...; each item is one necessary, decidable statement; do not transcribe Q&A rounds)

## Acceptance Criteria

  (placeholder: list acceptance criteria as numbered items AC1, AC2, ...; each item cites the R numbers it covers and states its verification method)  
`
  // Acceptance Criteria 正文带额外空白，trim 后仍等于 placeholder，判未填
  assert.deepEqual(findUnfilledPrdSections(partial), ['Requirements', 'Acceptance Criteria'])
})

test('小节整体缺失视为未填', () => {
  const missing = `## Goal

Ship the gate.
`
  assert.deepEqual(findUnfilledPrdSections(missing), [
    'Context',
    'Scope',
    'Assumptions, Constraints and Dependencies',
    'Requirements',
    'Acceptance Criteria',
    'Edge Cases and Failure Paths',
    'Risks and Open Questions',
    'Alignment Decisions',
    'References',
    'Notes',
  ])
})

/** 完整可确认 prd（H1 + 十一小节实填 + R/AC 追踪；无开放节点标记，对齐服务级验收样本的形状）。 */
const CONVERGED_PRD = `# Ship the gate

## Context

The start gate needs a sample prd that passes structure checks.

## Goal

Ship the gate.

## Scope

In scope: the gate itself. Non-goals: none.

## Assumptions, Constraints and Dependencies

Runs on the existing gate harness without new dependencies.

## Requirements

- R1：hard block by default

## Acceptance Criteria

- AC1（覆盖 R1）：start refuses on placeholder prd. 验证方法是运行 start 门禁测试。

## Edge Cases and Failure Paths

None: no boundary conditions beyond the gate itself.

## Risks and Open Questions

None: no open questions remain.

## Alignment Decisions

- design tree converged

## References

None.

## Notes

- force is recorded
`

// ---------- R/AC 追踪校验（Requirements 与 Acceptance Criteria 的编号溯源） ----------

test('inspectPrdStructure：任务 PRD 实际写法（中文冒号 R、（覆盖 R…）、验证方法是）零问题', () => {
  const prd = `# Real sample

## Context

LLM 容易把问答逐条搬进 PRD，使文档变成按时间排列的清单。

## Goal

让 PRD 成为可以独立阅读的需求文档。

## Scope

覆盖 PRD 模板、结构检查、对齐指引与评测。Non-goals: 不改 PLAN 协议。

## Assumptions, Constraints and Dependencies

现有 R/AC 编号与内容确认工具是必须保留的内部约束。

## Requirements

### 文档结构与叙述

- R1：完整任务的 PRD 固定包含全部十一小节。
- R2：PRD 主文按问题、目标、范围、需求和验收的逻辑组织。

### 需求质量与追踪

- R3：每条 R 只表达一个必要且可判定的需求。

## Acceptance Criteria

- AC1（覆盖 R1、R3）：新模板包含全部固定小节及填写用途。验证方法是运行 core 模板与结构测试。
- AC2（覆盖 R2）：评审包含对照样本。验证方法是运行 alignment 评测。

## Edge Cases and Failure Paths

内容类别不适用时保留标题并写出原因。

## Risks and Open Questions

主要风险是模板变长后产生新的套话。

## Alignment Decisions

采用完整且固定的分层结构，不适用的小节显式保留。

## References

- 调研报告：research/industry-prd-formats.md。

## Notes

本任务不涉及前端 UI。
`
  assert.deepEqual(inspectPrdStructure(prd), [])
})

/** R/AC 检查共用基线：其余小节视为已填（R/AC 专项测试只替换 Requirements/AC 正文）。 */
const TRACE_PRD_BASE = `# Trace

## Context

The gate needs R/AC traceability samples.

## Goal

Check R/AC validation.

## Scope

In scope: the R/AC checks. Non-goals: none.

## Assumptions, Constraints and Dependencies

None: no new dependencies.

## Edge Cases and Failure Paths

None: no boundary conditions.

## Risks and Open Questions

None: no open questions.

## Alignment Decisions

- design tree converged

## References

None.

## Notes

- note
`

/** 在 R/AC 基线上替换 Requirements 与 Acceptance Criteria 两节正文。 */
function tracePrd(requirementsBody, acceptanceBody) {
  return `${TRACE_PRD_BASE}

## Requirements

${requirementsBody}

## Acceptance Criteria

${acceptanceBody}
`
}

test('inspectPrdStructure：Requirements 无 R 编号条目报 prd_requirements_empty', () => {
  const prd = tracePrd('- hard block by default (no R numbering)', '- AC1（覆盖 R1）: works. 验证方法: run tests')
  assert.deepEqual(inspectPrdStructure(prd), [
    {
      code: PRD_STRUCTURE_CODES.PRD_REQUIREMENTS_EMPTY,
      message: 'prd.md section "Requirements" has no "- R<number>:" requirement items',
    },
  ])
})

test('inspectPrdStructure：Acceptance Criteria 无 AC 编号条目报 prd_acceptance_empty', () => {
  const prd = tracePrd('- R1: hard block by default', '- start refuses on placeholder prd')
  assert.deepEqual(inspectPrdStructure(prd), [
    {
      code: PRD_STRUCTURE_CODES.PRD_ACCEPTANCE_EMPTY,
      message: 'prd.md section "Acceptance Criteria" has no "- AC<number>:" acceptance items',
    },
  ])
})

test('inspectPrdStructure：重复 R 与重复 AC 编号分别报 prd_reference_duplicate', () => {
  const dupR = tracePrd('- R1: first\n- R1: second', '- AC1（覆盖 R1）: works. 验证方法: run tests')
  assert.deepEqual(inspectPrdStructure(dupR), [
    { code: PRD_STRUCTURE_CODES.PRD_REFERENCE_DUPLICATE, message: 'prd.md requirement R1 is duplicated' },
  ])
  const dupAc = tracePrd('- R1: hard block', '- AC1（覆盖 R1）: works. 验证方法: run tests\n- AC1: again. Verify: tests')
  assert.deepEqual(inspectPrdStructure(dupAc), [
    {
      code: PRD_STRUCTURE_CODES.PRD_REFERENCE_DUPLICATE,
      message: 'prd.md acceptance criterion AC1 is duplicated',
    },
  ])
})

test('inspectPrdStructure：AC 引用未定义 R 报 prd_ac_unknown_reference', () => {
  const prd = tracePrd('- R1: hard block by default', '- AC1（覆盖 R1、R2）: works. 验证方法: run tests')
  assert.deepEqual(inspectPrdStructure(prd), [
    {
      code: PRD_STRUCTURE_CODES.PRD_AC_UNKNOWN_REFERENCE,
      message: 'prd.md acceptance criterion AC1 references undefined R2',
    },
  ])
  const noRef = tracePrd('- R1: hard block by default', '- AC1: works. 验证方法: run tests')
  assert.deepEqual(inspectPrdStructure(noRef), [
    {
      code: PRD_STRUCTURE_CODES.PRD_AC_UNKNOWN_REFERENCE,
      message: 'prd.md acceptance criterion AC1 references no defined R item',
    },
  ])
})

test('inspectPrdStructure：AC 缺验证标识报 prd_ac_verification_missing', () => {
  const prd = tracePrd('- R1: hard block by default', '- AC1（覆盖 R1）: start refuses on placeholder prd')
  assert.deepEqual(inspectPrdStructure(prd), [
    {
      code: PRD_STRUCTURE_CODES.PRD_AC_VERIFICATION_MISSING,
      message:
        'prd.md acceptance criterion AC1 has no verification method (expected 验证方法, Verification, or Verify)',
    },
  ])
})

test('inspectPrdStructure：小节缺失或仍为 placeholder 时不叠加 R/AC 追踪问题', () => {
  const missingRequirements = inspectPrdStructure(
    CONVERGED_PRD.replace('## Requirements\n\n- R1：hard block by default\n\n', ''),
  )
  assert.deepEqual(
    missingRequirements.filter((issue) => issue.code.startsWith('prd_requirements') || issue.code.startsWith('prd_ac')),
    [],
  )
  const placeholderRequirements = inspectPrdStructure(
    CONVERGED_PRD.replace(
      '- R1：hard block by default',
      '(placeholder: group requirements by capability or behavior as numbered items R1, R2, ...; each item is one necessary, decidable statement; do not transcribe Q&A rounds)',
    ),
  )
  assert.equal(
    placeholderRequirements.some((issue) => issue.code === PRD_STRUCTURE_CODES.PRD_REQUIREMENTS_EMPTY),
    false,
  )
})

test('inspectPrdStructure：无冒号的 R/AC 行与正文中的 R 提法不参与条目识别', () => {
  // 正文句子提到 R1 但不是条目行：不产生编号条目，按空列表报问题
  const prose = tracePrd('The gate must block (R1 mentioned in prose)', 'AC1 mentioned in prose only')
  assert.deepEqual(
    inspectPrdStructure(prose).map((issue) => issue.code),
    [PRD_STRUCTURE_CODES.PRD_REQUIREMENTS_EMPTY, PRD_STRUCTURE_CODES.PRD_ACCEPTANCE_EMPTY],
  )
})

test('inspectPrdStructure：完整收敛 prd 无结构问题（含 R/AC 追踪）', () => {
  assert.deepEqual(inspectPrdStructure(CONVERGED_PRD), [])
})

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
  const prd = CONVERGED_PRD.replace('## Notes\n\n- force is recorded\n', '')
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
  // References 正文整体替换为骨架占位文案
  const prd = CONVERGED_PRD.replace(
    'None.',
    '(placeholder: link the research reports, specs, and external sources this PRD relies on; write none when there are none)',
  )
  assert.deepEqual(inspectPrdStructure(prd), [
    {
      code: PRD_STRUCTURE_CODES.PRD_SECTION_PLACEHOLDER,
      message: 'prd.md section "References" is still a placeholder',
      section: 'References',
    },
  ])
})

test('inspectPrdStructure：无标记的合法 PRD 零问题，旧标记文本只作为普通文本保留', () => {
  // 开放节点标记已删除：无标记的合法 PRD 直接通过结构检查。
  assert.deepEqual(inspectPrdStructure(CONVERGED_PRD), [])
  // 历史文件中的旧标记只作为普通文本保留，不参与任何逻辑。
  const legacy = `${CONVERGED_PRD}\n<!-- workloom:open-nodes=pending -->\n`
  assert.deepEqual(inspectPrdStructure(legacy), [])
})

test('inspectPrdStructure：多问题一次返回且顺序固定（H1 → 骨架小节 → R/AC 追踪）', () => {
  const prd = `## Requirements

- requirement without numbering

## Acceptance Criteria

- ac

## Notes

- note
`
  assert.deepEqual(inspectPrdStructure(prd), [
    { code: 'prd_title_missing', message: 'prd.md missing H1 title' },
    { code: 'prd_section_missing', message: 'prd.md section "Context" is missing', section: 'Context' },
    { code: 'prd_section_missing', message: 'prd.md section "Goal" is missing', section: 'Goal' },
    { code: 'prd_section_missing', message: 'prd.md section "Scope" is missing', section: 'Scope' },
    {
      code: 'prd_section_missing',
      message: 'prd.md section "Assumptions, Constraints and Dependencies" is missing',
      section: 'Assumptions, Constraints and Dependencies',
    },
    {
      code: 'prd_section_missing',
      message: 'prd.md section "Edge Cases and Failure Paths" is missing',
      section: 'Edge Cases and Failure Paths',
    },
    {
      code: 'prd_section_missing',
      message: 'prd.md section "Risks and Open Questions" is missing',
      section: 'Risks and Open Questions',
    },
    {
      code: 'prd_section_missing',
      message: 'prd.md section "Alignment Decisions" is missing',
      section: 'Alignment Decisions',
    },
    { code: 'prd_section_missing', message: 'prd.md section "References" is missing', section: 'References' },
    {
      code: 'prd_requirements_empty',
      message: 'prd.md section "Requirements" has no "- R<number>:" requirement items',
    },
    {
      code: 'prd_acceptance_empty',
      message: 'prd.md section "Acceptance Criteria" has no "- AC<number>:" acceptance items',
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

/** 一份已收敛的最小 prd（H1 + 十一小节，R/AC 追踪合法）。 */
const FILLED_PRD = `# Ship the gate

## Context

The gate needs a filled prd sample.

## Goal

Do the thing.

## Scope

In scope: the thing itself. Non-goals: none.

## Assumptions, Constraints and Dependencies

Runs on the existing gate harness without new dependencies.

## Requirements

- R1: the thing happens by default

## Acceptance Criteria

- AC1（覆盖 R1）: the thing is observable. Verification: run the gate tests.

## Edge Cases and Failure Paths

None: no boundary conditions beyond the gate itself.

## Risks and Open Questions

None: no open questions remain.

## Alignment Decisions

- design tree converged

## References

None.

## Notes

- note
`

/**
 * 轻量任务的最低 prd：H1 + Goal 实填，其余小节仍是骨架 placeholder，
 * 且没有 open-nodes marker（轻量 start 门只要求 H1 + Goal，
 * 其余小节缺失与 R/AC 追踪问题一律不拦截）。
 */
const LIGHT_MIN_PRD = `# Light fix

## Goal

Repair the shell file.

## Requirements

(placeholder: group requirements by capability or behavior as numbered items R1, R2, ...; each item is one necessary, decidable statement; do not transcribe Q&A rounds)

## Acceptance Criteria

(placeholder: list acceptance criteria as numbered items AC1, AC2, ...; each item cites the R numbers it covers and states its verification method)

## Notes

(placeholder: add notes that do not belong to any section above)
`

test('start 门禁 light：R/AC 追踪问题（空需求/空验收）也不拦截轻量任务', () => {
  // Requirements/AC 有实填正文但无编号条目：全量分类会报 requirements/acceptance empty，
  // 轻量门只保留 H1 与 Goal，仍放行。
  const prd = `# Light fix

## Goal

Repair the shell file.

## Requirements

- req without numbering

## Acceptance Criteria

- ac without numbering
`
  const { root, rel } = makeTaskDir(prd)
  try {
    const task = { mode: 'light', status: 'planning', alignment: null }
    assert.deepEqual(evaluateStartGate(root, rel, task), [])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('start 门禁 light：H1 + Goal 填写即放行（免 jsonl/凭证）', () => {
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
    '(placeholder: describe the outcome this task achieves and how it will be observed; the goal must follow from the context above)',
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
    // 其余三个骨架小节、R/AC 追踪、双 jsonl、PLAN 结构与两份内容确认都必须出现在拦截项里。
    assert.ok(missing.some((item) => item.includes('"Requirements"')))
    assert.ok(missing.some((item) => item.includes('"Acceptance Criteria"')))
    assert.ok(missing.some((item) => item.includes('"Notes"')))
    assert.ok(missing.some((item) => item.includes('implement.jsonl')))
    assert.ok(missing.some((item) => item.includes('check.jsonl')))
    assert.ok(missing.includes(PLAN_MISSING))
    assert.ok(missing.includes(PLAN_NOT_CONFIRMED) === false, '缺 PLAN 时只报结构缺失，不叠加确认缺失')
    assert.ok(missing.some((item) => item.includes('no alignment credential recorded')))
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

/** 最小合法 PLAN（外层四要素 + Edit 五字段伪代码协议齐全；夹具 prd 无 AC 编号，无溯源要求）。 */
const MIN_PLAN = `# Plan

## Steps

#### 步骤 1 implement

- Covers: AC1
- Target: src/a.js
- Edit:
  Input: adjust src/a.js behavior.
  Output: function returns updated result.
  Preconditions: none
  Procedure: edit the guarded branch per anchors.
  Failure: none
- Verify: pnpm lint
`

/** 在任务目录写入 PLAN 与双 jsonl 有效记录（start 门禁的其余前置）。 */
function satisfyNonPrdGates(root, rel) {
  writeFileSync(join(root, '.workloom', rel, 'plan.md'), MIN_PLAN)
  writeFileSync(join(root, '.workloom', rel, 'implement.jsonl'), '{"file": "AGENTS.md", "reason": "spec"}\n')
  writeFileSync(join(root, '.workloom', rel, 'check.jsonl'), '{"file": "AGENTS.md", "reason": "spec"}\n')
}


test('start 门禁：PLAN 结构合格但未确认 → 只报 PLAN_NOT_CONFIRMED', () => {
  const { root, rel } = makeTaskDir(FILLED_PRD)
  try {
    satisfyNonPrdGates(root, rel)
    const confirmed = {
      mode: 'full',
      status: 'planning',
      alignment: { passedAt: 'x', summary: 's' },
      planConfirmation: null,
    }
    const missing = evaluateStartGate(root, rel, confirmed)
    assert.deepEqual(missing, [PLAN_NOT_CONFIRMED])
    // 补上 PLAN 确认后放行（两份确认只判记录有无）
    const missingAfter = evaluateStartGate(root, rel, {
      ...confirmed,
      planConfirmation: { passedAt: 'y', summary: 'p' },
    })
    assert.deepEqual(missingAfter, [])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('start 门禁：PRD 与 PLAN 均未确认 → 两条缺失项同时返回（一次修完）', () => {
  const { root, rel } = makeTaskDir(FILLED_PRD)
  try {
    satisfyNonPrdGates(root, rel)
    const missing = evaluateStartGate(root, rel, {
      mode: 'full',
      status: 'planning',
      alignment: null,
      planConfirmation: null,
    })
    assert.ok(missing.some((item) => item.includes('no alignment credential recorded')))
    assert.ok(missing.includes(PLAN_NOT_CONFIRMED))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('start 门禁：缺 PLAN 只报结构缺失，不叠加 PLAN_NOT_CONFIRMED', () => {
  const { root, rel } = makeTaskDir(FILLED_PRD)
  try {
    writeFileSync(join(root, '.workloom', rel, 'implement.jsonl'), '{"file": "AGENTS.md", "reason": "spec"}\n')
    writeFileSync(join(root, '.workloom', rel, 'check.jsonl'), '{"file": "AGENTS.md", "reason": "spec"}\n')
    const missing = evaluateStartGate(root, rel, {
      mode: 'full',
      status: 'planning',
      alignment: { passedAt: 'x', summary: 's' },
      planConfirmation: null,
    })
    assert.ok(missing.includes(PLAN_MISSING))
    assert.equal(missing.includes(PLAN_NOT_CONFIRMED), false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('start 门禁：容器任务（children 非空）豁免 PLAN 结构与确认门禁', () => {
  const { root, rel } = makeTaskDir(FILLED_PRD)
  try {
    writeFileSync(join(root, '.workloom', rel, 'implement.jsonl'), '{"file": "AGENTS.md", "reason": "spec"}\n')
    writeFileSync(join(root, '.workloom', rel, 'check.jsonl'), '{"file": "AGENTS.md", "reason": "spec"}\n')
    const missing = evaluateStartGate(root, rel, {
      mode: 'full',
      status: 'planning',
      children: ['tasks/xx-01-child'],
      alignment: { passedAt: 'x', summary: 's' },
      planConfirmation: null,
    })
    assert.deepEqual(missing, [])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('start 门禁：确认后修改 prd/plan 不产生 stale 缺失项（无哈希失效判定）', () => {
  const { root, rel } = makeTaskDir(FILLED_PRD)
  try {
    satisfyNonPrdGates(root, rel)
    const confirmed = {
      mode: 'full',
      status: 'in_progress',
      alignment: { passedAt: 'x', summary: 's' },
      planConfirmation: { passedAt: 'y', summary: 'p' },
    }
    assert.deepEqual(evaluateStartGate(root, rel, confirmed), [])
    // 确认后文档被修改：门禁只认记录有无，不再比对哈希，仍然放行。
    writeFileSync(join(root, '.workloom', rel, 'prd.md'), `${FILLED_PRD}\n- edited after confirm\n`)
    writeFileSync(join(root, '.workloom', rel, 'plan.md'), `${MIN_PLAN}\n<!-- edited -->\n`)
    assert.deepEqual(evaluateStartGate(root, rel, confirmed), [])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

// ---------- PLAN 伪代码协议结构校验（Edit 区域五字段） ----------

/** 协议用例共用 prd（含 AC1，供 Covers 覆盖校验）。 */
const PROTOCOL_PRD = '# P\n\n## Acceptance Criteria\n\n- AC1: works\n'

/** 合法五字段基线（fence 缩进写法，与 plan-authoring 模板同形；none 是合法值）。 */
const PROTOCOL_PLAN = `# Plan

## Steps

#### 步骤 1 implement

- Covers: AC1
- Target: src/a.js
- Edit:
  \`\`\`text
  Input: locate the guarded branch in src/a.js.
  Output: branch returns the normalized payload.
  Preconditions: none
  Procedure:
    replace the branch body per anchors.
  Failure: none
  \`\`\`
- Verify: pnpm lint
`

test('PLAN 协议：五字段齐全、none 合法、fence 缩进写法通过', () => {
  assert.deepEqual(inspectPlanStructure(PROTOCOL_PLAN, PROTOCOL_PRD), [])
})

test('PLAN 协议：缺字段按字段常量序报告缺失问题', () => {
  const plan = PROTOCOL_PLAN.replace('  Output: branch returns the normalized payload.\n', '')
  assert.deepEqual(inspectPlanStructure(plan, PROTOCOL_PRD), [
    { code: 'plan_protocol_missing', message: 'plan.md step 1 protocol field "Output" is missing or empty' },
  ])
})

test('PLAN 协议：空值与纯空白视为缺失内容', () => {
  const plan = PROTOCOL_PLAN.replace('  Preconditions: none', '  Preconditions:   ')
  const issues = inspectPlanStructure(plan, PROTOCOL_PRD).filter((issue) => issue.code === 'plan_protocol_missing')
  assert.deepEqual(issues.map((issue) => issue.message), [
    'plan.md step 1 protocol field "Preconditions" is missing or empty',
  ])
})

test('PLAN 协议：全部存在时顺序不符报乱序；缺字段时不叠加顺序问题', () => {
  const reordered = PROTOCOL_PLAN.replace('  Input: locate the guarded branch in src/a.js.\n', '').replace(
    '  Failure: none',
    '  Input: locate the guarded branch in src/a.js.\n  Failure: none',
  )
  assert.deepEqual(
    inspectPlanStructure(reordered, PROTOCOL_PRD).filter((issue) => issue.code === 'plan_protocol_order'),
    [
      {
        code: 'plan_protocol_order',
        message: 'plan.md step 1 protocol field order must be Input -> Output -> Preconditions -> Procedure -> Failure',
      },
    ],
  )
  const missingOne = PROTOCOL_PLAN.replace('  Output: branch returns the normalized payload.\n', '')
  assert.equal(
    inspectPlanStructure(missingOne, PROTOCOL_PRD).some((issue) => issue.code === 'plan_protocol_order'),
    false,
  )
})

test('PLAN 协议：重复出现的字段名返回重复问题', () => {
  const plan = PROTOCOL_PLAN.replace('  Failure: none', '  Output: duplicated anchor line.\n  Failure: none')
  const issues = inspectPlanStructure(plan, PROTOCOL_PRD).filter((issue) => issue.code === 'plan_protocol_duplicate')
  assert.deepEqual(issues.map((issue) => issue.message), [
    'plan.md step 1 protocol field "Output" is duplicated',
  ])
})

test('PLAN 协议：Verify 正文与后续步骤的同名字段不参与识别（跨区域隔离）', () => {
  const plan = PROTOCOL_PLAN.replace(
    '- Verify: pnpm lint',
    '- Verify: pnpm lint\n  Input: mentioned inside Verify body',
  )
  assert.deepEqual(inspectPlanStructure(plan, PROTOCOL_PRD), [])
  const withLaterStep = `${PROTOCOL_PLAN}
#### 步骤 2 docs

- Covers: AC1
- Target: docs/a.md
- Edit:
  Input: rewrite the usage section.
  Output: doc updated.
  Preconditions: none
  Procedure: follow the anchors in docs/a.md.
  Failure: none
- Verify: pnpm lint
`
  assert.deepEqual(inspectPlanStructure(withLaterStep, PROTOCOL_PRD), [])
})

test('PLAN 协议：Edit 缺失时只报外层字段问题，跳过协议检查', () => {
  const plan = '# Plan\n\n## Steps\n\n#### 步骤 1 implement\n\n- Covers: AC1\n- Target: src/a.js\n- Verify: pnpm lint\n'
  assert.deepEqual(inspectPlanStructure(plan, PROTOCOL_PRD), [
    { code: 'plan_step_field', message: 'plan.md step 1 missing Edit' },
  ])
})

test('PLAN 协议：bullet、额外缩进与无冒号形式不识别为协议字段', () => {
  const plan = PROTOCOL_PLAN
    .replace('  Input: locate the guarded branch in src/a.js.', '  - Input: locate the guarded branch in src/a.js.')
    .replace('  Output: branch returns the normalized payload.', '  Output : branch returns the normalized payload.')
  const messages = inspectPlanStructure(plan, PROTOCOL_PRD)
    .filter((issue) => issue.code === 'plan_protocol_missing')
    .map((issue) => issue.message)
  assert.deepEqual(messages, [
    'plan.md step 1 protocol field "Input" is missing or empty',
    'plan.md step 1 protocol field "Output" is missing or empty',
  ])
})
