/**
 * agent 定义数据单测：三个 executor agent 定义与 EXECUTOR_KINDS 的一致性及公共字段。
 * 注意：从 agent-definitions.ts 导入（纯数据模块），避免加载 node_modules 内的
 * pi-subagents 源码（Node type-stripping 拒绝）。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { EXECUTOR_KINDS } from '@workloom/core'

import { EXECUTOR_AGENT_DEFINITIONS } from '../src/agent-definitions.ts'

test('agent definitions: kinds match EXECUTOR_KINDS and share common fields', () => {
  const kinds = Object.values(EXECUTOR_KINDS)
  assert.deepEqual(Object.keys(EXECUTOR_AGENT_DEFINITIONS).sort(), [...kinds].sort())
  for (const kind of kinds) {
    const definition = EXECUTOR_AGENT_DEFINITIONS[kind]
    assert.ok(definition !== undefined, `missing definition for ${kind}`)
    // 严格依赖语义：禁止再派发、不继承项目上下文、整体替换 systemPrompt。
    assert.equal(definition.maxSubagentDepth, 1)
    assert.equal(definition.inheritProjectContext, false)
    assert.equal(definition.systemPromptMode, 'replace')
    // thinking 不设（派发时 request.thinking 覆盖）。
    assert.equal(definition.thinking, undefined)
    assert.ok(definition.description !== '')
    assert.ok(definition.systemPrompt !== '')
    // 角色说明自写：包含 workloom 身份与「禁止再派发」约束。
    assert.ok(definition.systemPrompt.includes('workloom'))
    assert.ok(definition.systemPrompt.includes('Do not dispatch subagents'))
  }
})
