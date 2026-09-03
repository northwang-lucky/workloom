/**
 * executor.ts 纯函数单测：receipt 追加（含 forced 标注）、冲突门判定
 * （resolveConflictGate）、force 覆盖记录（recordForcedOverride）、
 * 工具参数 schema（force/reason/title）。
 *
 * 说明：executeTool/dispatchChildPi 涉及 spawn 子进程与文件系统，属集成面，
 * 不在本单测覆盖；冲突门与记录步骤已抽为可测函数。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { Value } from 'typebox/value'

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import { buildExecutorReceipt, buildNewDispatchBinding, PARAM_DESCRIPTIONS } from '@workloom-ai/core'
import type { WorkloomConfig } from '@workloom-ai/core'

import {
  appendExecutorReceipt,
  buildExecutorPromptWithPi,
  buildPiToolAllow,
  EXECUTOR_PARAMS,
  recordExecutorDispatchEntry,
  recordForcedOverride,
  recordForceOverrides,
  resolveConflictGate,
} from '../src/executor.ts'
import { buildChildPiArgs } from '../src/pi-args.ts'
import { PI_LSP_SOURCE } from '../src/pi-tools.ts'
import researchScope from '../assets/research-scope.ts'

test('appendExecutorReceipt: 非空文本尾部追加 receipt 行', () => {
  const text = '子代理输出内容'
  const effective = {
    model: 'deepseek/deepseek-v4-flash',
    effort: 'high',
    sources: { model: 'config' as const, effort: 'param' as const },
  }
  const result = appendExecutorReceipt(text, effective)
  assert.ok(result.startsWith('子代理输出内容\n\n'))
  assert.ok(result.includes('[workloom executor]'))
  assert.ok(result.includes('deepseek/deepseek-v4-flash'))
  assert.ok(result.includes('(config)'))
  assert.ok(result.includes('high'))
  assert.ok(result.includes('(param)'))
})

test('appendExecutorReceipt: 空文本只返回 receipt 行', () => {
  const effective = {
    model: 'gpt-4o',
    sources: { model: 'param' as const },
  }
  const result = appendExecutorReceipt('', effective)
  assert.ok(result.startsWith('[workloom executor]'))
  assert.ok(result.includes('gpt-4o'))
  assert.ok(result.includes('(param)'))
  assert.ok(!result.includes('\n\n'))
})

test('appendExecutorReceipt: 未配置字段显示 default 来源（effort 段省略）', () => {
  const effective = {
    sources: {},
  }
  const result = appendExecutorReceipt('output', effective)
  assert.ok(result.includes('<parent session>'))
  assert.ok(result.includes('(default)'))
  assert.ok(!result.includes('effort:'), 'effort 未配置时整段省略（core 条件渲染语义）')
  assert.ok(!result.includes('<unset>'))
})

test('buildExecutorReceipt: 与 core 的导出行为一致（sanity check）', () => {
  const line = buildExecutorReceipt({
    model: 'pi-model',
    modelSource: 'config',
    effort: 'max',
    effortSource: 'config',
  })
  assert.equal(line, '[workloom executor] model: pi-model (config), effort: max (config)')
})

test('appendExecutorReceipt: forced 时来源标注追加 (forced) 标记', () => {
  const effective = {
    model: 'deepseek/deepseek-v4-flash',
    effort: 'high',
    sources: { model: 'config' as const, effort: 'param' as const },
  }
  const result = appendExecutorReceipt('output', effective, { forced: true })
  assert.ok(result.includes('(config, forced)'))
  assert.ok(result.includes('(param, forced)'))
  assert.ok(!result.includes('(config)'))
  assert.ok(!result.includes('(param)'))
})

test('appendExecutorReceipt: 未强制时来源标注不含 forced（默认参数）', () => {
  const effective = {
    model: 'm',
    sources: { model: 'param' as const },
  }
  const result = appendExecutorReceipt('output', effective)
  assert.ok(result.includes('(param)'))
  assert.ok(!result.includes('forced'))
})

test('appendExecutorReceipt: 注入统计四元组同行渲染（KB 一位小数）', () => {
  const effective = {
    model: 'm',
    sources: { model: 'param' as const },
  }
  const result = appendExecutorReceipt('output', effective, {
    injection: { bytes: 18739, inlined: 7, truncated: 0, indexed: 0 },
  })
  assert.ok(
    result.includes('; injection: 18.3KB, 7 inlined, 0 truncated, 0 indexed'),
    'injection 4-tuple must render on the same line (KB with one decimal)',
  )
  // 未传注入统计时保持原样（向后兼容：不渲染 injection 段）
  const plain = appendExecutorReceipt('output', effective)
  assert.ok(!plain.includes('; injection:'))
  assert.ok(!plain.includes(' inlined'))
})

/** 构造完整形状的最小配置对象（冲突检测只消费 subagents 字段）。 */
function makeConfig(subagents: WorkloomConfig['subagents']): WorkloomConfig {
  return {
    sessionCommitMessage: 'feat: {title}',
    maxJournalLines: 10,
    sessionAutoCommit: true,
    contextInjection: { maxFileBytes: 1, maxArtifactBytes: 1, maxTotalBytes: 1 },
    promptInjection: { skipKeyword: 'SKIP' },
    hooks: { afterCreate: [], afterStart: [], afterFinish: [], afterArchive: [] },
    packages: {},
    subagents,
  }
}

/** TypeBox v1 的返回类型不含 schema options（description 仅运行时保留），显式收窄读取。 */
function readDescription(schema: unknown): string | undefined {
  return (schema as { description?: string }).description
}

test('EXECUTOR_PARAMS: schema 含 force/reason 参数', () => {
  const properties = EXECUTOR_PARAMS.properties
  assert.equal(properties.force.type, 'boolean')
  assert.equal(readDescription(properties.force), PARAM_DESCRIPTIONS.forceExecutor)
  assert.equal(properties.reason.type, 'string')
  assert.equal(readDescription(properties.reason), PARAM_DESCRIPTIONS.reasonExecutor)
})

test('EXECUTOR_PARAMS: schema 含 title 参数（必填 + minLength 1，描述引用 titleExecutor）', () => {
  const properties = EXECUTOR_PARAMS.properties
  assert.equal(properties.title.type, 'string')
  assert.equal((properties.title as { minLength?: number }).minLength, 1)
  assert.equal(readDescription(properties.title), PARAM_DESCRIPTIONS.titleExecutor)
  assert.ok(EXECUTOR_PARAMS.required.includes('title'))
})

test('EXECUTOR_PARAMS: title 必填（缺失/空白被拒，正常值通过）', () => {
  const base = { kind: 'implement', prompt: 'implement the task' }
  assert.equal(Value.Check(EXECUTOR_PARAMS, base), false, 'missing title must be rejected')
  assert.equal(
    Value.Check(EXECUTOR_PARAMS, { ...base, title: '' }),
    false,
    'empty title must be rejected by minLength',
  )
  assert.ok(Value.Check(EXECUTOR_PARAMS, { ...base, title: 'fix login bug' }))
  // title 不进入 child pi 派发投影（dispatchChildPi 入参不含该字段，typecheck 保证）。
})

test('resolveConflictGate: 冲突且未 force → 返回中断提示且不放行', () => {
  const config = makeConfig({
    implement: { model: 'deepseek/deepseek-v4-flash', effort: 'high' },
  })
  const result = resolveConflictGate(config, {
    kind: 'implement',
    model: 'deepseek/deepseek-v3',
    effort: 'max',
  })
  assert.equal(result.forced, false)
  assert.ok(result.notice !== undefined)
  assert.match(result.notice, /explicit parameters conflict with subagents\.implement config/)
  assert.ok(result.notice.includes('deepseek/deepseek-v4-flash'))
  assert.ok(result.notice.includes('deepseek/deepseek-v3'))
  assert.ok(result.notice.includes('high'))
  assert.match(result.notice, /force: true with a non-empty reason/)
})

test('resolveConflictGate: 归一化比较口径生效（等价不冲突、裸/带前缀冲突）', () => {
  const config = makeConfig({ implement: { model: 'deepseek/deepseek-v4-flash' } })
  const same = resolveConflictGate(config, {
    kind: 'implement',
    model: 'deepseek/deepseek-v4-flash',
  })
  assert.equal(same.forced, false)
  assert.equal(same.notice, undefined)
  const bare = resolveConflictGate(config, { kind: 'implement', model: 'deepseek-v4-flash' })
  assert.ok(bare.notice !== undefined)
})

test('resolveConflictGate: 冲突 + force + 缺 reason → 抛错', () => {
  const config = makeConfig({ implement: { model: 'a/b' } })
  for (const reason of [undefined, '', '   ']) {
    assert.throws(
      () => resolveConflictGate(config, { kind: 'implement', model: 'c/d', force: true, reason }),
      /force: true requires a non-empty reason/,
    )
  }
})

test('resolveConflictGate: 冲突 + force + reason → 放行', () => {
  const config = makeConfig({ implement: { model: 'a/b', effort: 'high' } })
  const result = resolveConflictGate(config, {
    kind: 'implement',
    model: 'c/d',
    effort: 'max',
    force: true,
    reason: 'hotfix',
  })
  assert.equal(result.forced, true)
  assert.equal(result.notice, undefined)
})

test('resolveConflictGate: 无冲突或配置无该 kind 条目 → 原路径', () => {
  const empty = makeConfig({})
  const noEntry = resolveConflictGate(empty, { kind: 'implement', model: 'x/y' })
  assert.equal(noEntry.forced, false)
  assert.equal(noEntry.notice, undefined)
  const unconfigured = makeConfig({ implement: {} })
  const noValue = resolveConflictGate(unconfigured, {
    kind: 'implement',
    model: 'x/y',
    effort: 'high',
  })
  assert.equal(noValue.forced, false)
  assert.equal(noValue.notice, undefined)
})

/** 创建临时项目根并写入最小 task.json（含空 overrides）。 */
function makeTaskRoot(): { root: string; taskRelPath: string } {
  const root = mkdtempSync(join(tmpdir(), 'workloom-pi-executor-'))
  const taskRelPath = 'tasks/08-27-demo'
  const taskDir = join(root, '.workloom', taskRelPath)
  mkdirSync(taskDir, { recursive: true })
  writeFileSync(
    join(taskDir, 'task.json'),
    JSON.stringify({ id: 't-1', name: 'demo', title: 'Demo', overrides: [] }),
  )
  return { root, taskRelPath }
}

test('recordForcedOverride: 写入 task.json overrides 且 reason 透传', () => {
  const { root, taskRelPath } = makeTaskRoot()
  try {
    recordForcedOverride(root, taskRelPath, 'hotfix: need a new model')
    const record = JSON.parse(
      readFileSync(join(root, '.workloom', taskRelPath, 'task.json'), 'utf8'),
    ).overrides[0]
    assert.equal(record.gate, 'executor_model_effort')
    assert.equal(record.tool, 'workloom_execute')
    assert.equal(record.reason, 'hotfix: need a new model')
    assert.ok(!Number.isNaN(Date.parse(record.at)))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('recordForcedOverride: task.json 缺失时只 WARNING 不抛错', () => {
  const { root, taskRelPath } = makeTaskRoot()
  rmSync(join(root, '.workloom', taskRelPath, 'task.json'))
  const warnings: string[] = []
  const originalWarn = console.warn
  console.warn = (message: unknown) => {
    warnings.push(String(message))
  }
  try {
    assert.doesNotThrow(() => recordForcedOverride(root, taskRelPath, 'r'))
    assert.equal(warnings.length, 1)
    const warning = warnings[0]
    assert.ok(warning !== undefined)
    assert.match(warning, /failed to record forced override/)
  } finally {
    console.warn = originalWarn
    rmSync(root, { recursive: true, force: true })
  }
})

test('recordExecutorDispatchEntry: 写入 task.json dispatches 且 kind/title 透传', () => {
  const { root, taskRelPath } = makeTaskRoot()
  try {
    recordExecutorDispatchEntry(root, taskRelPath, { kind: 'frontend', title: 'ui impl' })
    const record = JSON.parse(
      readFileSync(join(root, '.workloom', taskRelPath, 'task.json'), 'utf8'),
    ).dispatches[0]
    assert.equal(record.kind, 'frontend')
    assert.equal(record.title, 'ui impl')
    assert.ok(!Number.isNaN(Date.parse(record.at)))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('派发记录落绑定：配置命中时 dispatches 含 model/effort/modelSource（design §8.2）', () => {
  const { root, taskRelPath } = makeTaskRoot()
  try {
    // executeTool 记录路径同形：绑定由 core buildNewDispatchBinding 构造。
    const binding = buildNewDispatchBinding(
      {},
      {
        model: 'p/m',
        effort: 'high',
        sources: { model: 'fallback', effort: 'fallback' },
        configSources: { model: 'fallback', effort: 'fallback' },
      },
      'main/model',
    )
    recordExecutorDispatchEntry(root, taskRelPath, { kind: 'implement', title: 'impl', ...binding })
    const record = JSON.parse(
      readFileSync(join(root, '.workloom', taskRelPath, 'task.json'), 'utf8'),
    ).dispatches[0]
    assert.equal(record.model, 'p/m')
    assert.equal(record.effort, 'high')
    assert.equal(record.modelSource, 'fallback')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('派发记录落绑定：inherit 且主模型可读时落主模型快照', () => {
  const { root, taskRelPath } = makeTaskRoot()
  try {
    const binding = buildNewDispatchBinding(
      {},
      { model: undefined, effort: undefined, sources: {}, configSources: {} },
      'main/model',
    )
    recordExecutorDispatchEntry(root, taskRelPath, { kind: 'research', title: 'r', ...binding })
    const record = JSON.parse(
      readFileSync(join(root, '.workloom', taskRelPath, 'task.json'), 'utf8'),
    ).dispatches[0]
    assert.equal(record.model, 'main/model')
    assert.equal(record.modelSource, 'inherit')
    assert.ok(!('effort' in record))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('recordExecutorDispatchEntry: task.json 缺失时只 WARNING 不抛错', () => {
  const { root, taskRelPath } = makeTaskRoot()
  rmSync(join(root, '.workloom', taskRelPath, 'task.json'))
  const warnings: string[] = []
  const originalWarn = console.warn
  console.warn = (message: unknown) => {
    warnings.push(String(message))
  }
  try {
    assert.doesNotThrow(() =>
      recordExecutorDispatchEntry(root, taskRelPath, { kind: 'frontend', title: 'ui' }),
    )
    assert.equal(warnings.length, 1)
    const warning = warnings[0]
    assert.ok(warning !== undefined)
    assert.match(warning, /failed to record executor dispatch/)
  } finally {
    console.warn = originalWarn
    rmSync(root, { recursive: true, force: true })
  }
})

/** 创建临时项目根并写入三个无条件 kind 片段（requiresTools 已移除）。 */
function makeLspFragmentsRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'workloom-pi-executor-fragments-'))
  const promptsDir = join(root, '.workloom', 'prompts.local')
  mkdirSync(promptsDir, { recursive: true })
  writeFileSync(join(promptsDir, 'implement.md'), 'IMPLEMENT-LSP-FRAGMENT')
  writeFileSync(join(promptsDir, 'check.md'), 'CHECK-LSP-FRAGMENT')
  writeFileSync(join(promptsDir, 'frontend.md'), 'FRONTEND-LSP-FRAGMENT')
  return root
}

test('buildExecutorPromptWithPi: hasLsp=true → 产物含 Local directives 与 implement 片段（TC3）', () => {
  const root = makeLspFragmentsRoot()
  try {
    const [err, result] = buildExecutorPromptWithPi(
      {
        root,
        taskRelPath: 'tasks/09-01-demo',
        kind: 'implement',
        userPrompt: 'implement the task',
      },
      true,
    )
    assert.equal(err, null)
    assert.ok(result !== null)
    assert.equal(result.hasLsp, true)
    assert.ok(result.result.text.includes('## Local directives'))
    assert.ok(result.result.text.includes('IMPLEMENT-LSP-FRAGMENT'))
    assert.ok(!result.result.text.includes('CHECK-LSP-FRAGMENT'))
    assert.ok(!result.result.text.includes('FRONTEND-LSP-FRAGMENT'))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('buildExecutorPromptWithPi: 命中时 check/frontend kind 各自注入对应片段（TC3）', () => {
  const root = makeLspFragmentsRoot()
  try {
    for (const [kind, mark] of [
      ['implement', 'IMPLEMENT-LSP-FRAGMENT'],
      ['check', 'CHECK-LSP-FRAGMENT'],
      ['frontend', 'FRONTEND-LSP-FRAGMENT'],
    ] as const) {
      const [err, result] = buildExecutorPromptWithPi(
        {
          root,
          taskRelPath: 'tasks/09-01-demo',
          kind,
          userPrompt: `do ${kind}`,
        },
        true,
      )
      assert.equal(err, null)
      assert.ok(result !== null)
      assert.ok(result.result.text.includes('## Local directives'))
      assert.ok(result.result.text.includes(mark))
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('buildExecutorPromptWithPi: hasLsp=false → 本机片段仍注入（无工具面过滤），纪律段 LSP 句被过滤', () => {
  const root = makeLspFragmentsRoot()
  try {
    const [err, result] = buildExecutorPromptWithPi(
      {
        root,
        taskRelPath: 'tasks/09-01-demo',
        kind: 'implement',
        userPrompt: 'implement the task',
      },
      false,
    )
    assert.equal(err, null)
    assert.ok(result !== null)
    assert.equal(result.hasLsp, false)
    // requiresTools 已移除：片段无条件注入，与 LSP 能力无关。
    assert.ok(result.result.text.includes('## Local directives'))
    assert.ok(result.result.text.includes('IMPLEMENT-LSP-FRAGMENT'))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

/** LSP 主基线句（与 core 纪律段一致，测试自给自足）。 */
const LSP_BASELINE_SENTENCE =
  'When LSP tooling is available, treat it as the first choice for code work: ' +
  'read structure through LSP symbol outlines and call signatures; ' +
  'resolve members and arguments with completions; ' +
  'rename symbols through server-side rename and fix them with code actions ' +
  'instead of hand-searched edits; ' +
  'and include an LSP diagnostics check in the verification pass.'

test('S4 交付时过滤：hasLsp=false 时首条 prompt 不含纪律段 LSP 句，true 时保留', () => {
  const root = makeLspFragmentsRoot()
  try {
    const [missErr, miss] = buildExecutorPromptWithPi(
      { root, taskRelPath: 'tasks/09-01-demo', kind: 'implement', userPrompt: 'p' },
      false,
    )
    assert.equal(missErr, null)
    assert.ok(miss !== null)
    assert.ok(
      !miss.result.text.includes(LSP_BASELINE_SENTENCE),
      'no LSP capability must drop the LSP discipline sentence',
    )
    const [hitErr, hit] = buildExecutorPromptWithPi(
      { root, taskRelPath: 'tasks/09-01-demo', kind: 'implement', userPrompt: 'p' },
      true,
    )
    assert.equal(hitErr, null)
    assert.ok(hit !== null)
    assert.ok(
      hit.result.text.includes(LSP_BASELINE_SENTENCE),
      'with LSP capability must keep the LSP discipline sentence',
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('buildPiToolAllow: 默认 allow = 内置 4 件；父会话有 lsp 但未配置 includes 也不授 lsp', () => {
  const noParent = buildPiToolAllow(undefined, false)
  assert.deepEqual(noParent.allow, ['read', 'bash', 'edit', 'write'])
  assert.equal(noParent.childHasLsp, false)
  // 父会话有 pi-lsp（理论可见集含 lsp）但未配置 includes：lsp 不入 allow（默认不授）。
  const parentLsp = buildPiToolAllow(undefined, true)
  assert.deepEqual(parentLsp.allow, ['read', 'bash', 'edit', 'write'])
  assert.equal(parentLsp.childHasLsp, false)
})

test('buildPiToolAllow: config tools.includes lsp_* 补入 → childHasLsp true（父会话无 lsp 则不可见）', () => {
  const withLsp = buildPiToolAllow({ includes: ['lsp_*'] }, true)
  assert.deepEqual(withLsp.allow, [
    'read',
    'bash',
    'edit',
    'write',
    'lsp_diagnostics',
    'lsp_fix',
  ])
  assert.equal(withLsp.childHasLsp, true)
  // 父会话无 pi-lsp：理论可见集无 lsp，即使配置 includes 也不进 allow。
  const noParent = buildPiToolAllow({ includes: ['lsp_*'] }, false)
  assert.deepEqual(noParent.allow, ['read', 'bash', 'edit', 'write'])
  assert.equal(noParent.childHasLsp, false)
})

test('buildPiToolAllow: excludes 全移除 → allow 空（dispatch 空交集前兆）', () => {
  const empty = buildPiToolAllow({ excludes: ['read', 'bash', 'edit', 'write'] }, false)
  assert.deepEqual(empty.allow, [])
  assert.equal(empty.childHasLsp, false)
  // 空集经 buildChildPiArgs fail loud（指明 kind）。
  assert.throws(
    () => buildChildPiArgs({ prompt: 'p', kind: 'research', tools: empty.allow }),
    /research/,
  )
})

test('接线：childHasLsp 驱动 PI_LSP_SOURCE 的 -e 按需加载（allow 含 lsp 才加载）', () => {
  // 未配置 includes：allow 无 lsp → 不加载 pi-lsp。
  const miss = buildPiToolAllow(undefined, true)
  assert.equal(miss.childHasLsp, false)
  const missArgs = buildChildPiArgs({ prompt: 'p', kind: 'implement', tools: miss.allow })
  assert.ok(!missArgs.includes('npm:@narumitw/pi-lsp'))
  // 配置 includes lsp_*：allow 含 lsp → 加载 pi-lsp。
  const hit = buildPiToolAllow({ includes: ['lsp_*'] }, true)
  assert.equal(hit.childHasLsp, true)
  const hitArgs = buildChildPiArgs({
    prompt: 'p',
    kind: 'implement',
    tools: hit.allow,
    loadExtensions: hit.childHasLsp ? [PI_LSP_SOURCE] : undefined,
  })
  assert.ok(hitArgs.includes('npm:@narumitw/pi-lsp'))
})

test('research-scope 扩展：同名 write/edit 副本，域内成功、越界拒绝（英文）', async () => {
  const registered: Record<string, { execute: (...args: unknown[]) => Promise<unknown> }> = {}
  const mockPi = {
    registerTool: (tool: { name: string; execute: (...args: unknown[]) => Promise<unknown> }) => {
      registered[tool.name] = tool
    },
  } as unknown as ExtensionAPI
  researchScope(mockPi)
  const write = registered['write']
  const edit = registered['edit']
  assert.ok(write && edit, 'same-name write/edit must be registered')
  const root = mkdtempSync(join(tmpdir(), 'pi-research-scope-'))
  try {
    const ctx = { cwd: root }
    // 域内 write：成功落盘。
    await write.execute('c1', { path: '.workloom/x.md', content: 'hello' }, undefined, undefined, ctx)
    assert.equal(readFileSync(join(root, '.workloom/x.md'), 'utf8'), 'hello')
    // 越界 write：拒绝（英文）。
    await assert.rejects(
      write.execute('c2', { path: '/tmp/escape.md', content: 'x' }, undefined, undefined, ctx),
      /denied|outside/i,
    )
    // 域内 edit：成功替换。
    await edit.execute(
      'c3',
      { path: '.workloom/x.md', edits: [{ oldText: 'hello', newText: 'world' }] },
      undefined,
      undefined,
      ctx,
    )
    assert.equal(readFileSync(join(root, '.workloom/x.md'), 'utf8'), 'world')
    // 越界 edit（相对路径逃逸）：拒绝。
    await assert.rejects(
      edit.execute(
        'c4',
        { path: '../escape.md', edits: [{ oldText: 'a', newText: 'b' }] },
        undefined,
        undefined,
        ctx,
      ),
      /denied|outside/i,
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('recordForceOverrides: 冲突 + stale 同存 → 一次调用落两条 override（executor_model_effort + stale_alignment）', () => {
  const { root, taskRelPath } = makeTaskRoot()
  try {
    recordForceOverrides(root, taskRelPath, {
      conflictForced: true,
      staleMissing: true,
      reason: 'user asked to bypass both gates',
    })
    const overrides = JSON.parse(
      readFileSync(join(root, '.workloom', taskRelPath, 'task.json'), 'utf8'),
    ).overrides
    assert.deepEqual(
      overrides.map((o: { gate: string }) => o.gate),
      ['executor_model_effort', 'stale_alignment'],
    )
    assert.equal(overrides[1].tool, 'workloom_execute')
    assert.equal(overrides[1].reason, 'user asked to bypass both gates')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('recordForceOverrides: 仅冲突绕过 → 只留 executor_model_effort', () => {
  const { root, taskRelPath } = makeTaskRoot()
  try {
    recordForceOverrides(root, taskRelPath, {
      conflictForced: true,
      staleMissing: false,
      reason: 'conflict only',
    })
    const overrides = JSON.parse(
      readFileSync(join(root, '.workloom', taskRelPath, 'task.json'), 'utf8'),
    ).overrides
    assert.deepEqual(
      overrides.map((o: { gate: string }) => o.gate),
      ['executor_model_effort'],
    )
    assert.equal(overrides[0].reason, 'conflict only')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('recordForceOverrides: 仅 stale 绕过 → 只留 stale_alignment；都不绕过 → 零写入', () => {
  const { root, taskRelPath } = makeTaskRoot()
  try {
    recordForceOverrides(root, taskRelPath, {
      conflictForced: false,
      staleMissing: true,
      reason: 'stale only',
    })
    let overrides = JSON.parse(
      readFileSync(join(root, '.workloom', taskRelPath, 'task.json'), 'utf8'),
    ).overrides
    assert.deepEqual(
      overrides.map((o: { gate: string }) => o.gate),
      ['stale_alignment'],
    )
    recordForceOverrides(root, taskRelPath, {
      conflictForced: false,
      staleMissing: false,
      reason: 'no bypass',
    })
    overrides = JSON.parse(
      readFileSync(join(root, '.workloom', taskRelPath, 'task.json'), 'utf8'),
    ).overrides
    assert.equal(overrides.length, 1, '无绕过时不追加 override')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
