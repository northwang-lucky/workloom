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
    configSources: { model: undefined, effort: 'legacy' },
  })
  const byEffort = resolveSubagentDefaults(config, 'research', { effort: 'max' })
  assert.deepEqual(byEffort, {
    model: 'm-config',
    effort: 'max',
    sources: { model: 'config', effort: 'param' },
    configSources: { model: 'legacy', effort: undefined },
  })
})

test('resolveSubagentDefaults：无参数回退配置', () => {
  const config = { subagents: { research: { model: 'm-config', effort: 'high' } } }
  const effective = resolveSubagentDefaults(config, 'research', {})
  assert.deepEqual(effective, {
    model: 'm-config',
    effort: 'high',
    sources: { model: 'config', effort: 'config' },
    configSources: { model: 'legacy', effort: 'legacy' },
  })
})

test('resolveSubagentDefaults：均无配置时返回 undefined 字段', () => {
  const config = { subagents: {} }
  const effective = resolveSubagentDefaults(config, 'research', {})
  assert.deepEqual(effective, {
    model: undefined,
    effort: undefined,
    sources: { model: undefined, effort: undefined },
    configSources: { model: undefined, effort: undefined },
  })
})

test('resolveSubagentDefaults：未知 kind 均 undefined', () => {
  const config = { subagents: { research: { model: 'm', effort: 'high' } } }
  const effective = resolveSubagentDefaults(config, 'bogus', {})
  assert.deepEqual(effective, {
    model: undefined,
    effort: undefined,
    sources: { model: undefined, effort: undefined },
    configSources: { model: undefined, effort: undefined },
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
    configSources: { model: 'legacy', effort: 'legacy' },
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
    configSources: { model: undefined, effort: undefined },
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

test('executor 不再作为配置字段：默认无 gate，旧字段静默忽略', () => {
  // 默认配置不含 executor 字段（写门禁已整体移除，不再有 executor.gate 开关）。
  assert.equal('executor' in DEFAULT_CONFIG, false, 'DEFAULT_CONFIG must not carry executor')
  // 旧项目残留 executor.gate 时按未知旧字段静默忽略：加载成功且结果无 executor。
  const legacy = makeRoot('executor:\n  gate: false\n')
  try {
    const config = loadConfig(legacy)
    assert.deepEqual(config, DEFAULT_CONFIG)
    assert.equal('executor' in config, false, 'old executor.gate must not appear in the result')
  } finally {
    rmSync(legacy, { recursive: true, force: true })
  }
  // executor 整体为非 map（旧字段被完全忽略，不再校验其形状）。
  const scalar = makeRoot('executor: 5\n')
  try {
    assert.deepEqual(loadConfig(scalar), DEFAULT_CONFIG)
  } finally {
    rmSync(scalar, { recursive: true, force: true })
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

// ---------- L1：subagent_profiles 解析层 ----------

test('subagent_profiles 合法解析：string/map whenMain 与兜底条目', () => {
  const root = makeRoot(`
subagent_profiles:
  - whenMain: kimi-coding/k3
    subagents:
      implement:
        model: deepseek-v4-flash
        effort: max
  - whenMain:
      dsh: qwen-token-plan-cn/qwen3.8-flash
      pi: ark-coding-plan/glm-5.3-flash
    subagents:
      research:
        model: deepseek-v4-pro
  - subagents:
      check:
        effort: medium
`)
  try {
    const config = loadConfig(root)
    assert.deepEqual(config.subagentProfiles, [
      {
        whenMain: 'kimi-coding/k3',
        subagents: { implement: { model: 'deepseek-v4-flash', effort: 'max' } },
      },
      {
        whenMain: {
          dsh: 'qwen-token-plan-cn/qwen3.8-flash',
          pi: 'ark-coding-plan/glm-5.3-flash',
        },
        subagents: { research: { model: 'deepseek-v4-pro' } },
      },
      { subagents: { check: { effort: 'medium' } } },
    ])
    // 旧 subagents 解析路径不受影响（双字段并存）
    assert.deepEqual(config.subagents, {})
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('subagent_profiles 缺失或空数组时默认空数组', () => {
  const missing = makeRoot('')
  try {
    assert.deepEqual(loadConfig(missing).subagentProfiles, [])
  } finally {
    rmSync(missing, { recursive: true, force: true })
  }
  const empty = makeRoot('subagent_profiles: []\n')
  try {
    assert.deepEqual(loadConfig(empty).subagentProfiles, [])
  } finally {
    rmSync(empty, { recursive: true, force: true })
  }
})

test('subagent_profiles 顶层非数组抛错', () => {
  const root = makeRoot('subagent_profiles: 5\n')
  try {
    assert.throws(
      () => loadConfig(root),
      (error) => {
        assert.ok(error instanceof WorkloomConfigError)
        assert.equal(error.field, 'subagent_profiles')
        return true
      },
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('whenMain string 非完整 provider/model 抛错（带字段路径）', () => {
  const cases = [
    { value: 'k3', text: 'subagent_profiles:\n  - whenMain: k3\n' },
    { value: '/model', text: 'subagent_profiles:\n  - whenMain: /model\n' },
    { value: 'provider/', text: 'subagent_profiles:\n  - whenMain: provider/\n' },
  ]
  for (const { value, text } of cases) {
    const root = makeRoot(text)
    try {
      assert.throws(
        () => loadConfig(root),
        (error) => {
          assert.ok(error instanceof WorkloomConfigError)
          assert.equal(error.field, 'subagent_profiles[0].whenMain')
          assert.ok(error.message.includes(value), `message must mention ${value}`)
          return true
        },
      )
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }
})

test('whenMain map 的 value 非完整形式或非 string 抛错', () => {
  const cases = [
    { text: 'subagent_profiles:\n  - whenMain:\n      dsh: k3\n', field: 'subagent_profiles[0].whenMain.dsh' },
    {
      text: 'subagent_profiles:\n  - whenMain:\n      dsh: 5\n',
      field: 'subagent_profiles[0].whenMain.dsh',
    },
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

test('whenMain 非 string 非 map 抛错', () => {
  const root = makeRoot('subagent_profiles:\n  - whenMain: 5\n')
  try {
    assert.throws(
      () => loadConfig(root),
      (error) => {
        assert.ok(error instanceof WorkloomConfigError)
        assert.equal(error.field, 'subagent_profiles[0].whenMain')
        return true
      },
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('多条无 whenMain 条目抛错（fail loud）', () => {
  const root = makeRoot(`
subagent_profiles:
  - subagents:
      research:
        model: deepseek-v4-flash
  - subagents:
      implement:
        model: deepseek-v4-pro
`)
  try {
    assert.throws(
      () => loadConfig(root),
      (error) => {
        assert.ok(error instanceof WorkloomConfigError)
        assert.equal(error.field, 'subagent_profiles')
        assert.match(error.message, /fallback/)
        return true
      },
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('whenMain 条件重叠抛错（string/string、string/map、map/map 共同 key 同值）', () => {
  const cases = [
    // string vs string 同值（视为所有 runtime 重叠）
    {
      text: 'subagent_profiles:\n  - whenMain: kimi-coding/k3\n  - whenMain: kimi-coding/k3\n',
      value: 'kimi-coding/k3',
    },
    // string vs map 任一 value 同值
    {
      text:
        'subagent_profiles:\n  - whenMain: kimi-coding/k3\n  - whenMain:\n      dsh: kimi-coding/k3\n',
      value: 'kimi-coding/k3',
    },
    // map vs map 共同 key 同值
    {
      text:
        'subagent_profiles:\n  - whenMain:\n      dsh: kimi-coding/k3\n      pi: ark-coding-plan/glm-5.3-flash\n  - whenMain:\n      dsh: other/x\n      pi: ark-coding-plan/glm-5.3-flash\n',
      value: 'ark-coding-plan/glm-5.3-flash',
    },
  ]
  for (const { text, value } of cases) {
    const root = makeRoot(text)
    try {
      assert.throws(
        () => loadConfig(root),
        (error) => {
          assert.ok(error instanceof WorkloomConfigError)
          assert.equal(error.field, 'subagent_profiles')
          assert.match(error.message, /overlap/)
          assert.ok(error.message.includes(value), 'message must name the conflicting value')
          return true
        },
      )
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }
})

test('whenMain 条件不重叠不抛错（map/map 不同 key 或不同值）', () => {
  const root = makeRoot(`
subagent_profiles:
  - whenMain:
      dsh: kimi-coding/k3
  - whenMain:
      pi: ark-coding-plan/glm-5.3-flash
  - whenMain:
      dsh: other/x
    subagents:
      research:
        effort: high
`)
  try {
    const config = loadConfig(root)
    assert.equal(config.subagentProfiles.length, 3)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('subagent_profiles 条目非 map 或内层 subagents 非 map 抛错', () => {
  const cases = [
    { text: 'subagent_profiles:\n  - 5\n', field: 'subagent_profiles[0]' },
    { text: 'subagent_profiles:\n  - subagents: 5\n', field: 'subagent_profiles[0].subagents' },
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

test('subagent_profiles 内层 subagents 复用现有 entry 校验（带 profile 字段路径）', () => {
  const cases = [
    {
      text: 'subagent_profiles:\n  - subagents:\n      research: 5\n',
      field: 'subagent_profiles[0].subagents.research',
    },
    {
      text: 'subagent_profiles:\n  - subagents:\n      research:\n        model: 5\n',
      field: 'subagent_profiles[0].subagents.research.model',
    },
    {
      text: 'subagent_profiles:\n  - subagents:\n      research:\n        effort: 5\n',
      field: 'subagent_profiles[0].subagents.research.effort',
    },
    {
      text: 'subagent_profiles:\n  - subagents:\n      research:\n        model:\n          dsh: 5\n',
      field: 'subagent_profiles[0].subagents.research.model.dsh',
    },
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

// ---------- L2：resolveSubagentDefaults 合并层 ----------

test('resolveSubagentDefaults：whenMain string 两段归一化命中', () => {
  const config = {
    subagents: { implement: { model: 'legacy-m', effort: 'high' } },
    subagentProfiles: [
      { whenMain: 'kimi-coding/k3', subagents: { implement: { model: 'profile-m', effort: 'max' } } },
    ],
  }
  const hit = resolveSubagentDefaults(config, 'implement', {}, 'dsh', 'kimi-coding/k3')
  assert.deepEqual(hit, {
    model: 'profile-m',
    effort: 'max',
    sources: { model: 'config', effort: 'config' },
    configSources: { model: 'whenMain', effort: 'whenMain' },
    whenMainValue: 'kimi-coding/k3',
  })
  // 裸 id 与带前缀条件不命中（两段归一化比较）
  const miss = resolveSubagentDefaults(config, 'implement', {}, 'dsh', 'k3')
  assert.equal(miss.model, 'legacy-m')
  assert.deepEqual(miss.configSources, { model: 'legacy', effort: 'legacy' })
})

test('resolveSubagentDefaults：whenMain map 按 runtime 取值命中、缺 key 跳过', () => {
  const config = {
    subagents: { implement: { model: 'legacy-m' } },
    subagentProfiles: [
      { whenMain: { dsh: 'dsh/x', pi: 'pi/y' }, subagents: { implement: { model: 'profile-m' } } },
    ],
  }
  const dsh = resolveSubagentDefaults(config, 'implement', {}, 'dsh', 'dsh/x')
  assert.equal(dsh.model, 'profile-m')
  assert.equal(dsh.configSources.model, 'whenMain')
  // 主模型与条件同值但 runtime 不同 → 不命中（map 按当前 runtime 取 key 比较）
  const piMiss = resolveSubagentDefaults(config, 'implement', {}, 'pi', 'dsh/x')
  assert.equal(piMiss.model, 'legacy-m')
  // map 缺当前 runtime key → 该条目不匹配（跳过，不报错）→ legacy
  const skip = resolveSubagentDefaults(config, 'implement', {}, 'unknown', 'dsh/x')
  assert.equal(skip.model, 'legacy-m')
})

test('resolveSubagentDefaults：mainModel undefined 时全部 whenMain 条目跳过 → legacy', () => {
  const config = {
    subagents: { implement: { model: 'legacy-m' } },
    subagentProfiles: [
      { whenMain: 'kimi-coding/k3', subagents: { implement: { model: 'profile-m' } } },
    ],
  }
  const effective = resolveSubagentDefaults(config, 'implement', {}, 'dsh')
  assert.equal(effective.model, 'legacy-m')
  assert.deepEqual(effective.configSources, { model: 'legacy', effort: undefined })
})

test('resolveSubagentDefaults：全部未命中且无兜底 → legacy', () => {
  const config = {
    subagents: { implement: { model: 'legacy-m' } },
    subagentProfiles: [
      { whenMain: 'a/b', subagents: { implement: { model: 'profile-m' } } },
    ],
  }
  const effective = resolveSubagentDefaults(config, 'implement', {}, 'dsh', 'x/y')
  assert.equal(effective.model, 'legacy-m')
  assert.equal(effective.configSources.model, 'legacy')
})

test('resolveSubagentDefaults：纯顺序匹配（兜底条目位置优先于 whenMain）', () => {
  const config = {
    subagents: {},
    subagentProfiles: [
      { subagents: { implement: { model: 'fallback-m' } } },
      { whenMain: 'kimi-coding/k3', subagents: { implement: { model: 'whenmain-m' } } },
    ],
  }
  const effective = resolveSubagentDefaults(config, 'implement', {}, 'dsh', 'kimi-coding/k3')
  assert.equal(effective.model, 'fallback-m')
  assert.equal(effective.configSources.model, 'fallback')
})

test('resolveSubagentDefaults：kind 级联（命中条目未配 kind → legacy → undefined）', () => {
  const config = {
    subagents: { research: { model: 'legacy-r' } },
    subagentProfiles: [
      { whenMain: 'kimi-coding/k3', subagents: { implement: { model: 'profile-m' } } },
    ],
  }
  const fromLegacy = resolveSubagentDefaults(config, 'research', {}, 'dsh', 'kimi-coding/k3')
  assert.equal(fromLegacy.model, 'legacy-r')
  assert.equal(fromLegacy.configSources.model, 'legacy')
  const none = resolveSubagentDefaults(config, 'frontend', {}, 'dsh', 'kimi-coding/k3')
  assert.equal(none.model, undefined)
  assert.equal(none.configSources.model, undefined)
})

test('resolveSubagentDefaults：字段独立合并（model 来自 profile、effort 来自 legacy）', () => {
  const config = {
    subagents: { implement: { effort: 'high' } },
    subagentProfiles: [
      { whenMain: 'kimi-coding/k3', subagents: { implement: { model: 'profile-m' } } },
    ],
  }
  const effective = resolveSubagentDefaults(config, 'implement', {}, 'dsh', 'kimi-coding/k3')
  assert.deepEqual(effective, {
    model: 'profile-m',
    effort: 'high',
    sources: { model: 'config', effort: 'config' },
    configSources: { model: 'whenMain', effort: 'legacy' },
    whenMainValue: 'kimi-coding/k3',
  })
})

test('resolveSubagentDefaults：显式参数覆盖 profile 配置（不触发 runtime 解析）', () => {
  const config = {
    subagents: { implement: { model: { dsh: 'm-dsh' } } },
    subagentProfiles: [
      { whenMain: 'kimi-coding/k3', subagents: { implement: { model: 'profile-m' } } },
    ],
  }
  const effective = resolveSubagentDefaults(
    config,
    'implement',
    { model: 'm-tool' },
    'dsh',
    'kimi-coding/k3',
  )
  assert.deepEqual(effective, {
    model: 'm-tool',
    effort: undefined,
    sources: { model: 'param', effort: undefined },
    configSources: { model: undefined, effort: undefined },
  })
})

test('resolveSubagentDefaults：profile 命中时 model map 缺当前 runtime key 抛错（带 profile 字段路径）', () => {
  const config = {
    subagents: {},
    subagentProfiles: [
      { whenMain: 'kimi-coding/k3', subagents: { implement: { model: { dsh: 'm-dsh' } } } },
    ],
  }
  assert.throws(
    () => resolveSubagentDefaults(config, 'implement', {}, 'pi', 'kimi-coding/k3'),
    (error) => {
      assert.ok(error instanceof WorkloomConfigError)
      assert.equal(error.field, 'subagent_profiles[0].subagents.implement.model')
      return true
    },
  )
})

test('resolveSubagentDefaults：subagent_profiles 缺失/空数组与现状逐字段等价', () => {
  const legacy = { subagents: { implement: { model: 'm', effort: 'high' } } }
  const missing = resolveSubagentDefaults(legacy, 'implement', {}, 'dsh')
  const empty = resolveSubagentDefaults(
    { ...legacy, subagentProfiles: [] },
    'implement',
    {},
    'dsh',
  )
  assert.deepEqual(missing, empty)
  assert.deepEqual(missing, {
    model: 'm',
    effort: 'high',
    sources: { model: 'config', effort: 'config' },
    configSources: { model: 'legacy', effort: 'legacy' },
  })
})

test('resolveSubagentDefaults：不修改入参（含 subagentProfiles）', () => {
  const config = {
    subagents: { implement: { model: 'm', effort: 'high' } },
    subagentProfiles: [
      { whenMain: 'kimi-coding/k3', subagents: { implement: { model: 'p' } } },
    ],
  }
  const before = structuredClone(config)
  resolveSubagentDefaults(config, 'implement', { model: 'm-tool' }, 'dsh', 'kimi-coding/k3')
  assert.deepEqual(config, before)
})
