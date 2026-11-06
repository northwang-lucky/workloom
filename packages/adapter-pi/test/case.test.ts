import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import { createTask, PARAM_DESCRIPTIONS } from '@workloom-ai/core'
import { registerTaskTools } from '../src/tasks.ts'

interface CapturedTool {
  name: string
  parameters: { properties: Record<string, unknown>; required?: string[] }
  execute: (
    toolCallId: string,
    params: unknown,
    signal: unknown,
    onUpdate: unknown,
    ctx: unknown,
  ) => Promise<{
    details: {
      action: string
      case: string | null
      designSession: string | null
      structureIssues: { code: string; message: string }[]
      blockers: string[]
      readyForExecution: boolean
    }
  }>
}

function setup(): CapturedTool {
  const registered: CapturedTool[] = []
  const pi = {
    registerTool(def: CapturedTool) { registered.push(def); return () => {} },
  } as unknown as ExtensionAPI
  registerTaskTools(pi)
  const def = registered.find((entry) => entry.name === 'workloom_task_case')
  assert.ok(def)
  return def
}

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'workloom-pi-case-'))
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

test('TASK_CASE_PARAMS 只保留 review（无哈希参数与摘要参数）', () => {
  const def = setup()
  assert.ok(def)
  assert.ok(def.parameters.required?.includes('action'))
  const properties = def.parameters.properties as Record<string, unknown>
  assert.ok('action' in properties)
  assert.ok(!('expectedCaseHash' in properties), 'expectedCaseHash param must be removed')
  assert.ok(!('summary' in properties), 'case summary param must be removed with the confirm action')
  assert.equal(
    (properties.action as { description?: string }).description,
    PARAM_DESCRIPTIONS.caseAction,
  )
})

test('CASE review 通过 details 返回结构诊断', async () => {
  const root = makeRoot()
  try {
    const [, created] = await createTask(root, { title: 'Case', package: 'repo' })
    assert.ok(created)
    writeFileSync(
      join(root, '.workloom', created.taskRelPath, 'prd.md'),
      '# Case\n\n## Requirements\n\n- R1: verify\n\n## Acceptance Criteria\n\n- AC1: verify R1\n',
    )
    const def = setup()
    const ctx = { cwd: root, sessionManager: { getSessionId: () => 'pi-case' } }
    const result = await def.execute(
      'call-1',
      { action: 'review', taskPath: created.taskRelPath },
      undefined,
      undefined,
      ctx,
    )
    assert.equal(result.details.action, 'review')
    assert.equal(result.details.case, null)
    assert.equal(result.details.readyForExecution, false)
    assert.deepEqual(result.details.blockers, ['case.md is missing'])
    assert.equal('caseHash' in result.details, false)
    assert.equal('readyToConfirm' in result.details, false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

