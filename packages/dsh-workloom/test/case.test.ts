import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createTask, PARAM_DESCRIPTIONS } from '@workloom-ai/core'
import { registerTaskTools } from '../src/tooling/tasks.ts'

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

test('CASE 工具 schema 只保留 review，主会话限制保留', async () => {
  const def = setup()
  assert.ok(def)
  // 只支持 review：confirm 分支随 CASE 用户确认机制一并删除
  assert.deepEqual(def.parameters.properties.action.enum, ['review'])
  assert.ok(def.parameters.required.includes('action'))
  // 完整结构缺席断言：哈希与摘要参数不再存在
  const props = def.parameters.properties
  assert.equal('expectedCaseHash' in props, false, 'expectedCaseHash must be removed from the case schema')
  assert.equal('summary' in props, false, 'case summary parameter must be removed with the confirm action')
  assert.equal(props.action.description, PARAM_DESCRIPTIONS.caseAction)
  const exec = {
    agent: {
      id: 'child',
      options: { subagentDepth: 1 },
      session: { header: { cwd: '/tmp', delegationDepth: 1 } },
    },
  }
  await assert.rejects(() => def.execute({ action: 'review' }, exec), /main session/)
})

test('CASE review 投影返回快照、会话链与结构阻断项（无哈希字段）', async () => {
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
    assert.equal(result.designSession, null)
    assert.equal(result.readyForExecution, false)
    assert.deepEqual(result.blockers, ['case.md is missing'])
    // 无哈希字段：review 结果不再携带任何确认指纹
    assert.equal('caseHash' in result, false)
    assert.equal('confirmBlockers' in result, false)
    assert.equal('readyToConfirm' in result, false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

