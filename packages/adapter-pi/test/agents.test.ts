/**
 * agent 定义数据单测：kind 键集合与 EXECUTOR_KINDS 一致、文案完整
 * （角色说明自写，含 workloom 身份与「禁止再派发」约束）。
 * 注意：定义数据从 agent-definitions.ts 导入（纯数据模块，本地类型
 * ExecutorAgentDefinition，无 pi-subagents 运行时依赖）。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { EXECUTOR_KINDS } from '@workloom-ai/core'

import {
  EXECUTOR_AGENT_DEFINITIONS,
  type ExecutorAgentDefinition,
} from '../src/agent-definitions.ts'

test('agent definitions: kinds match EXECUTOR_KINDS and carry full role copy', () => {
  const kinds = Object.values(EXECUTOR_KINDS)
  assert.deepEqual(Object.keys(EXECUTOR_AGENT_DEFINITIONS).sort(), [...kinds].sort())
  for (const kind of kinds) {
    const definition: ExecutorAgentDefinition | undefined = EXECUTOR_AGENT_DEFINITIONS[kind]
    assert.ok(definition !== undefined, `missing definition for ${kind}`)
    assert.ok(definition.description !== '')
    assert.ok(definition.systemPrompt !== '')
    // 角色说明自写：包含 workloom 身份与「禁止再派发」约束。
    assert.ok(definition.systemPrompt.includes('workloom'))
    assert.ok(definition.systemPrompt.includes('Do not dispatch subagents'))
  }
})

test('agent definitions: check role is fix-oriented, not report-only', () => {
  const check = EXECUTOR_AGENT_DEFINITIONS[EXECUTOR_KINDS.check]
  assert.ok(check !== undefined, 'missing definition for check')
  // 纯报告导向句已移除：不再承诺"只报告问题"、不再以"报告完成"收尾
  // （与 core check 纪律段"发现即修"冲突，见 executor-context 的 EXECUTOR_CONTRACT_BY_KIND）。
  assert.ok(!check.systemPrompt.includes('report issues with locations and fixes'))
  assert.ok(!check.systemPrompt.includes('You are done when your review report is complete'))
  // 评审+修复导向：发现即修；仅剩问题以 ## Open issues 结构化段报告，
  // 行格式含 file/line/severity/修复建议，无仅存问题写 - none；修复后验证。
  assert.ok(check.systemPrompt.includes('fix what you find'))
  assert.ok(check.systemPrompt.includes('## Open issues'))
  assert.ok(check.systemPrompt.includes('- none'))
  assert.match(check.systemPrompt, /verify/i)
})

test('agent definitions: check persona defers rules to the core discipline (no duplicated rule text)', () => {
  const check = EXECUTOR_AGENT_DEFINITIONS[EXECUTOR_KINDS.check]
  assert.ok(check !== undefined, 'missing definition for check')
  // persona 只保留验证工程师身份 + 互补句：两阶段 CASE 流程与规则来源指向 core 纪律段
  assert.ok(check.systemPrompt.includes('verification engineer'))
  assert.ok(check.systemPrompt.includes('purpose case-design'))
  assert.ok(check.systemPrompt.includes('purpose execution'))
  assert.ok(check.systemPrompt.includes('single source of rules'))
  // 与 core 重复的 P0/P1/P2 规则全文已删（行格式字面量是 core 纪律段的唯一载体）
  assert.ok(!check.systemPrompt.includes('- <file>:<line> [P0|P1|P2] <issue> — fix: <suggestion>'))
})

test('agent definitions: systemPrompt describes pointer-based context, not the retired inline mechanism', () => {
  const kinds = Object.values(EXECUTOR_KINDS)
  for (const kind of kinds) {
    const definition: ExecutorAgentDefinition | undefined = EXECUTOR_AGENT_DEFINITIONS[kind]
    assert.ok(definition !== undefined, `missing definition for ${kind}`)
    // 防回归：slim-executor-context 后注入为指针化 + 分层加载，
    // 角色自述不得再声称全量内联，也不得承诺超预算降级为索引行。
    assert.ok(
      !definition.systemPrompt.includes('already inlined'),
      `stale "already inlined" copy in ${kind}`,
    )
    assert.ok(
      !definition.systemPrompt.includes('degrade to index'),
      `stale "degrade to index" copy in ${kind}`,
    )
  }
})

test('agent definitions: check role classifies findings P0/P1/P2, fixes P2, escalates P0/P1', () => {
  const check = EXECUTOR_AGENT_DEFINITIONS[EXECUTOR_KINDS.check]
  assert.ok(check !== undefined, 'missing definition for check')
  // 分级导向保留为互补句（P0/P1/P2 提及 + P2 自修 + P0/P1 上报）；分级定义与
  // Open issues 行格式以 core 纪律段为唯一来源（persona 不再重复规则全文）。
  assert.ok(check.systemPrompt.includes('P0/P1/P2'))
  assert.ok(check.systemPrompt.includes('fix-P2-yourself'))
  assert.ok(check.systemPrompt.includes('escalation of P0/P1'))
  assert.ok(!check.systemPrompt.includes('[<severity>]'))
})

test('agent definitions: role copy reads the merged plan.md; stale artifact names are gone', () => {
  for (const kind of Object.values(EXECUTOR_KINDS)) {
    const definition: ExecutorAgentDefinition | undefined = EXECUTOR_AGENT_DEFINITIONS[kind]
    assert.ok(definition !== undefined, `missing definition for ${kind}`)
    assert.ok(
      !definition.systemPrompt.includes('implement.md'),
      `stale implement.md reference in ${kind}`,
    )
    assert.ok(
      !definition.systemPrompt.includes('design.md'),
      `stale design.md reference in ${kind}`,
    )
  }
  const implement = EXECUTOR_AGENT_DEFINITIONS[EXECUTOR_KINDS.implement]
  assert.ok(implement !== undefined)
  assert.ok(implement.systemPrompt.includes('Read the plan (plan.md) first'))
  assert.ok(implement.systemPrompt.includes('prescriptive'))
})

test('agent definitions: review 角色审计划、只写报告、不碰计划与代码', () => {
  const review = EXECUTOR_AGENT_DEFINITIONS[EXECUTOR_KINDS.review]
  assert.ok(review !== undefined, 'missing definition for review')
  assert.ok(review.systemPrompt.includes('workloom review executor'))
  assert.ok(review.systemPrompt.includes('Read the plan (plan.md) first'))
  assert.ok(review.systemPrompt.includes('belongs to the check executor'))
  assert.ok(review.systemPrompt.includes('plan-review.md'))
  assert.ok(review.systemPrompt.includes('Never edit the plan, the PRD, or any code file'))
  assert.ok(review.systemPrompt.includes('P0/P1/P2'))
})
