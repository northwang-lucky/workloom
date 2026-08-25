/**
 * agent 定义数据单测：三个 kind 与 EXECUTOR_KINDS 一致、文案完整
 * （角色说明自写，含 workloom 身份与「禁止再派发」约束）。
 * 注意：定义数据从 agent-definitions.ts 导入（纯数据模块，本地类型
 * ExecutorAgentDefinition，无 pi-subagents 运行时依赖）。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { EXECUTOR_KINDS } from '@workloom/core'

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
