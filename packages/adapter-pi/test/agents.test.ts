/**
 * agent 定义数据单测：四个 kind 与 EXECUTOR_KINDS 一致、文案完整
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
