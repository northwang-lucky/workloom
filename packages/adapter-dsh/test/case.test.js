import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createTask, PARAM_DESCRIPTIONS } from '@workloom-ai/core'
import { registerTaskTools } from '../dist/tasks.js'

function setup() {
  const registered = []
  const ctx = { tools: { register(def) { registered.push(def); return () => {} } } }
  registerTaskTools(ctx)
  return registered.find((def) => def.name === 'workloom_task_case')
}

function makeRoot() {
  const root = mkdtempSync(join(tmpdir(), 'workloom-dsh-case-'))
  mkdirSync(join(root, '.workloom'))
  writeFileSync(join(root, '.workloom', 'config.json'), JSON.stringify({ packages: { repo: { path: '.' } } }))
  execFileSync('git', ['init'], { cwd: root, stdio: 'ignore' })
  execFileSync('git', ['add', '.'], { cwd: root })
  execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'init'], {
    cwd: root,
    stdio: 'ignore',
  })
  return root
}

test('CASE 工具 schema 与主会话限制', async () => {
  const def = setup()
  assert.ok(def)
  assert.deepEqual(def.parameters.properties.action.enum, ['review', 'confirm'])
  assert.ok(def.parameters.required.includes('action'))
  assert.equal(def.parameters.properties.expectedCaseHash.description, PARAM_DESCRIPTIONS.expectedCaseHash)
  const exec = {
    agent: {
      id: 'child',
      options: { subagentDepth: 1 },
      session: { header: { cwd: '/tmp', delegationDepth: 1 } },
    },
  }
  await assert.rejects(() => def.execute({ action: 'review' }, exec), /main session/)
})

test('CASE review 投影返回快照、hash 与结构阻断项', async () => {
  const root = makeRoot()
  try {
    const [, created] = await createTask(root, { title: 'Case', package: 'repo' })
    writeFileSync(
      join(root, '.workloom', created.taskRelPath, 'prd.md'),
      '# Case\n\n## Requirements\n\n- R1: verify\n\n## Acceptance Criteria\n\n- AC1: verify R1\n',
    )
    const def = setup()
    // 主会话 agent 形状与宿主一致（delegationDepthOf 读取 options.subagentDepth，
    // 缺省即顶层 depth 0；夹具补空 options 与 Agent 类型形状对齐）。
    const exec = { agent: { id: 'main', options: {}, session: { header: { cwd: root } } } }
    const result = await def.execute({ action: 'review', taskPath: created.taskRelPath }, exec)
    assert.equal(result.action, 'review')
    assert.equal(result.case, null)
    assert.equal(result.caseHash, null)
    assert.equal(result.readyToConfirm, false)
    assert.deepEqual(result.confirmBlockers, ['case.md is missing'])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

