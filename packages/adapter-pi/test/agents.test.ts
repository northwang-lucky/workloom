/**
 * agent 注册单测：定义数据与 EXECUTOR_KINDS 的一致性、公共字段，
 * 以及文件式注册的写入/幂等行为（临时目录，finally rmSync）。
 * 注意：定义数据从 agent-definitions.ts 导入（纯数据模块）；文件写入
 * 从 agents.ts 导入（本机 node --test 可加载其 node: 内建依赖）。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { EXECUTOR_KINDS } from '@workloom/core'

import { EXECUTOR_AGENT_DEFINITIONS } from '../src/agent-definitions.ts'
import { writeExecutorAgentFiles } from '../src/agents.ts'

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

test('writeExecutorAgentFiles: writes three frontmatter files and is idempotent', () => {
  const agentDir = mkdtempSync(join(tmpdir(), 'workloom-agents-'))
  try {
    const first = writeExecutorAgentFiles(agentDir)
    assert.deepEqual(first.written.sort(), [...Object.values(EXECUTOR_KINDS)].sort())
    assert.deepEqual(first.skipped, [])
    for (const kind of Object.values(EXECUTOR_KINDS)) {
      const content = readFileSync(join(agentDir, 'agents', `workloom-${kind}.md`), 'utf8')
      assert.ok(content.startsWith('---\n'), `frontmatter delimiter for ${kind}`)
      assert.ok(content.includes(`name: "${kind}"`), `name field for ${kind}`)
      assert.ok(content.includes('maxSubagentDepth: 1'), `depth field for ${kind}`)
      assert.ok(content.includes('systemPromptMode: "replace"'), `mode field for ${kind}`)
      assert.ok(content.includes('inheritProjectContext: false'), `inherit field for ${kind}`)
      assert.ok(content.includes('Do not dispatch subagents'), `body for ${kind}`)
    }
    // 幂等：内容未变时全部跳过，不重写。
    const second = writeExecutorAgentFiles(agentDir)
    assert.deepEqual(second.written, [])
    assert.deepEqual(second.skipped.sort(), [...Object.values(EXECUTOR_KINDS)].sort())
  } finally {
    rmSync(agentDir, { recursive: true, force: true })
  }
})
