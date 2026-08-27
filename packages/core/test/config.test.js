/**
 * config 模块单测：默认值、覆盖、校验、容错。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  DEFAULT_CONFIG,
  loadConfig,
  resolveSubagentDefaults,
  splitProviderModel,
  WorkloomConfigError,
} from '../src/legacy/config.js'

function makeRoot(configText, localText) {
  const root = mkdtempSync(join(tmpdir(), 'workloom-config-'))
  mkdirSync(join(root, '.workloom'))
  if (configText !== undefined) {
    writeFileSync(join(root, '.workloom', 'config.yaml'), configText)
  }
  if (localText !== undefined) {
    writeFileSync(join(root, '.workloom', 'config.local.yaml'), localText)
  }
  return root
}

test('config.yaml 缺失时返回全默认', () => {
  const root = makeRoot()
  try {
    const config = loadConfig(root)
    assert.deepEqual(config, DEFAULT_CONFIG)
    assert.equal(config.promptInjection.skipKeyword, 'no-workloom')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('字段覆盖与布尔词解析', () => {
  const root = makeRoot(`
max_journal_lines: 500
session_auto_commit: "off"
session_commit_message: "chore: journal"
prompt_injection:
  skip_keyword: ""
`)
  try {
    const config = loadConfig(root)
    assert.equal(config.maxJournalLines, 500)
    assert.equal(config.sessionAutoCommit, false)
    assert.equal(config.sessionCommitMessage, 'chore: journal')
    assert.equal(config.promptInjection.skipKeyword, '')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('非法值显式抛错', () => {
  const root = makeRoot('max_journal_lines: -1\n')
  try {
    assert.throws(() => loadConfig(root), WorkloomConfigError)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('未知字段容错忽略（旧平台字段向前兼容）', () => {
  const root = makeRoot(`
channel:
  worker_guard:
    idle_timeout: 5m
codex:
  dispatch_mode: auto
`)
  try {
    const config = loadConfig(root)
    assert.deepEqual(config, DEFAULT_CONFIG)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('packages 映射与 hooks 解析', () => {
  const root = makeRoot(`
packages:
  cli:
    path: packages/cli
  web:
    path: ./web
    git: true
hooks:
  after_create:
    - "echo created"
`)
  try {
    const config = loadConfig(root)
    assert.equal(config.packages.cli.path, 'packages/cli')
    assert.equal(config.packages.web.git, true)
    assert.deepEqual(config.hooks.afterCreate, ['echo created'])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('subagents 合法解析：完整字段、仅 model、仅 effort、空 map', () => {
  const root = makeRoot(`
subagents:
  research:
    model: deepseek-v4-flash
    effort: high
  implement:
    model: deepseek-v4-pro
  check:
    effort: medium
  empty: {}
`)
  try {
    const config = loadConfig(root)
    assert.deepEqual(config.subagents.research, { model: 'deepseek-v4-flash', effort: 'high' })
    assert.deepEqual(config.subagents.implement, { model: 'deepseek-v4-pro' })
    assert.deepEqual(config.subagents.check, { effort: 'medium' })
    assert.deepEqual(config.subagents.empty, {})
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('subagents 缺失时默认空对象', () => {
  const root = makeRoot('')
  try {
    const config = loadConfig(root)
    assert.deepEqual(config.subagents, {})
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('subagents 顶层非 map 抛错', () => {
  const root = makeRoot('subagents: 5\n')
  try {
    assert.throws(
      () => loadConfig(root),
      (error) => {
        assert.ok(error instanceof WorkloomConfigError)
        assert.equal(error.field, 'subagents')
        return true
      },
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('subagents 结构非法抛 WorkloomConfigError（带字段路径）', () => {
  const cases = [
    { text: 'subagents:\n  research: 5\n', field: 'subagents.research' },
    { text: 'subagents:\n  research:\n    model: 5\n', field: 'subagents.research.model' },
    { text: 'subagents:\n  research:\n    effort: 5\n', field: 'subagents.research.effort' },
  ]
  for (const { text, field } of cases) {
    const root = makeRoot(text)
    try {
      assert.throws(
        () => loadConfig(root),
        (error) => {
          assert.ok(error instanceof WorkloomConfigError)
          assert.equal(error.field, field)
          return true
        },
      )
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }
})

test('subagents 未知 key 结构合法不抛错且保留', () => {
  const root = makeRoot(`
subagents:
  research:
    model: deepseek-v4-flash
  future_kind:
    effort: high
  typo_kind:
    model: x
`)
  try {
    const config = loadConfig(root)
    assert.equal(config.subagents.research.model, 'deepseek-v4-flash')
    assert.deepEqual(config.subagents.future_kind, { effort: 'high' })
    assert.deepEqual(config.subagents.typo_kind, { model: 'x' })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('resolveSubagentDefaults：参数覆盖配置（字段独立合并）', () => {
  const config = { subagents: { research: { model: 'm-config', effort: 'high' } } }
  const byModel = resolveSubagentDefaults(config, 'research', { model: 'm-tool' })
  assert.deepEqual(byModel, {
    model: 'm-tool',
    effort: 'high',
    sources: { model: 'param', effort: 'config' },
  })
  const byEffort = resolveSubagentDefaults(config, 'research', { effort: 'max' })
  assert.deepEqual(byEffort, {
    model: 'm-config',
    effort: 'max',
    sources: { model: 'config', effort: 'param' },
  })
})

test('resolveSubagentDefaults：无参数回退配置', () => {
  const config = { subagents: { research: { model: 'm-config', effort: 'high' } } }
  const effective = resolveSubagentDefaults(config, 'research', {})
  assert.deepEqual(effective, {
    model: 'm-config',
    effort: 'high',
    sources: { model: 'config', effort: 'config' },
  })
})

test('resolveSubagentDefaults：均无配置时返回 undefined 字段', () => {
  const config = { subagents: {} }
  const effective = resolveSubagentDefaults(config, 'research', {})
  assert.deepEqual(effective, {
    model: undefined,
    effort: undefined,
    sources: { model: undefined, effort: undefined },
  })
})

test('resolveSubagentDefaults：未知 kind 均 undefined', () => {
  const config = { subagents: { research: { model: 'm', effort: 'high' } } }
  const effective = resolveSubagentDefaults(config, 'bogus', {})
  assert.deepEqual(effective, {
    model: undefined,
    effort: undefined,
    sources: { model: undefined, effort: undefined },
  })
})

test('resolveSubagentDefaults：不修改入参', () => {
  const config = { subagents: { research: { model: 'm', effort: 'high' } } }
  const before = structuredClone(config)
  resolveSubagentDefaults(config, 'research', { model: 'm-tool', effort: 'max' })
  assert.deepEqual(config, before)
})

test('subagents model map 形式解析（key 不白名单）', () => {
  const root = makeRoot(`
subagents:
  implement:
    model:
      dsh: deepseek-official/deepseek-v4-flash
      pi: deepseek/deepseek-v4-flash
    effort: max
  research:
    model: m-plain
`)
  try {
    const config = loadConfig(root)
    assert.deepEqual(config.subagents.implement, {
      model: { dsh: 'deepseek-official/deepseek-v4-flash', pi: 'deepseek/deepseek-v4-flash' },
      effort: 'max',
    })
    assert.deepEqual(config.subagents.research, { model: 'm-plain' })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('subagents model map 的 value 非 string 抛错（带 runtime 字段路径）', () => {
  const root = makeRoot('subagents:\n  research:\n    model:\n      dsh: 5\n')
  try {
    assert.throws(
      () => loadConfig(root),
      (error) => {
        assert.ok(error instanceof WorkloomConfigError)
        assert.equal(error.field, 'subagents.research.model.dsh')
        return true
      },
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('resolveSubagentDefaults：model map 按 runtime 取值', () => {
  const config = {
    subagents: { implement: { model: { dsh: 'm-dsh', pi: 'm-pi' }, effort: 'high' } },
  }
  const dsh = resolveSubagentDefaults(config, 'implement', {}, 'dsh')
  assert.deepEqual(dsh, {
    model: 'm-dsh',
    effort: 'high',
    sources: { model: 'config', effort: 'config' },
  })
  const pi = resolveSubagentDefaults(config, 'implement', {}, 'pi')
  assert.equal(pi.model, 'm-pi')
})

test('resolveSubagentDefaults：model map 缺当前 runtime key 抛错（fail loud）', () => {
  const config = { subagents: { implement: { model: { dsh: 'm-dsh' } } } }
  assert.throws(
    () => resolveSubagentDefaults(config, 'implement', {}, 'pi'),
    (error) => {
      assert.ok(error instanceof WorkloomConfigError)
      assert.equal(error.field, 'subagents.implement.model')
      assert.match(error.message, /missing entry for runtime "pi"/)
      return true
    },
  )
})

test('resolveSubagentDefaults：model 为 map 但未提供 runtime 抛错', () => {
  const config = { subagents: { implement: { model: { dsh: 'm-dsh' } } } }
  assert.throws(() => resolveSubagentDefaults(config, 'implement', {}), WorkloomConfigError)
})

test('resolveSubagentDefaults：param 覆盖 map 形式配置（不触发 runtime 解析）', () => {
  const config = { subagents: { implement: { model: { dsh: 'm-dsh' } } } }
  const effective = resolveSubagentDefaults(config, 'implement', { model: 'm-tool' })
  assert.deepEqual(effective, {
    model: 'm-tool',
    effort: undefined,
    sources: { model: 'param', effort: undefined },
  })
})

test('config.local.yaml 深合并覆盖：map 按 key 合并、数组替换、其余字段保留', () => {
  const root = makeRoot(
    `
subagents:
  implement:
    model: m-base
    effort: high
  research:
    model: m-research
hooks:
  after_create:
    - "echo base"
`,
    `
subagents:
  implement:
    model: m-local
hooks:
  after_create:
    - "echo local"
`,
  )
  try {
    const config = loadConfig(root)
    // local 只覆盖 model，config.yaml 的 effort 保留（map 按 key 深合并）
    assert.deepEqual(config.subagents.implement, { model: 'm-local', effort: 'high' })
    // 未被 local 触及的 kind 原样保留
    assert.deepEqual(config.subagents.research, { model: 'm-research' })
    // 数组整体替换而非拼接
    assert.deepEqual(config.hooks.afterCreate, ['echo local'])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('config.yaml 缺失时 config.local.yaml 仍可生效（local-only）', () => {
  const root = makeRoot(undefined, 'session_auto_commit: false\n')
  try {
    const config = loadConfig(root)
    assert.equal(config.sessionAutoCommit, false)
    assert.equal(config.maxJournalLines, DEFAULT_CONFIG.maxJournalLines)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('config.local.yaml 非法内容抛错（字段标签区分文件）', () => {
  const cases = [
    { text: 'key: [unclosed\n' }, // YAML 解析失败
    { text: '5\n' }, // 根非 map
  ]
  for (const { text } of cases) {
    const root = makeRoot('', text)
    try {
      assert.throws(
        () => loadConfig(root),
        (error) => {
          assert.ok(error instanceof WorkloomConfigError)
          assert.equal(error.field, '<config.local.yaml>')
          return true
        },
      )
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }
})

test('executor.gate：默认 true、显式 false、非法值抛错', () => {
  const defaults = makeRoot('')
  try {
    assert.equal(loadConfig(defaults).executor.gate, true)
  } finally {
    rmSync(defaults, { recursive: true, force: true })
  }
  const off = makeRoot('executor:\n  gate: "off"\n')
  try {
    assert.equal(loadConfig(off).executor.gate, false)
  } finally {
    rmSync(off, { recursive: true, force: true })
  }
  const invalid = makeRoot('executor:\n  gate: maybe\n')
  try {
    assert.throws(
      () => loadConfig(invalid),
      (error) => {
        assert.ok(error instanceof WorkloomConfigError)
        assert.equal(error.field, 'executor.gate')
        return true
      },
    )
  } finally {
    rmSync(invalid, { recursive: true, force: true })
  }
})

test('executor 非 map 抛错', () => {
  const root = makeRoot('executor: 5\n')
  try {
    assert.throws(
      () => loadConfig(root),
      (error) => {
        assert.ok(error instanceof WorkloomConfigError)
        assert.equal(error.field, 'executor')
        return true
      },
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('splitProviderModel：provider 前缀拆分与裸 id', () => {
  assert.deepEqual(splitProviderModel('deepseek-official/deepseek-v4-flash'), {
    provider: 'deepseek-official',
    model: 'deepseek-v4-flash',
  })
  assert.deepEqual(splitProviderModel('deepseek-v4-flash'), { model: 'deepseek-v4-flash' })
  // 多段前缀按首个 / 切分，余下整体归 model
  assert.deepEqual(splitProviderModel('a/b/c'), { provider: 'a', model: 'b/c' })
})

test('splitProviderModel：非法输入抛错', () => {
  for (const bad of ['', '/model', 'provider/', null, 5]) {
    assert.throws(() => splitProviderModel(bad), Error)
  }
})
