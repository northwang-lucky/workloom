/**
 * config 模块单测（配置系统换轨后）：json/js 双格式加载、对象层顶层 key 覆盖、
 * 函数工厂、三层优先级链、同层双文件歧义、遗留 yaml 探测、全局白名单、
 * tools 字段校验、default_package 删除、resolveSubagentDefaults 与冲突检测。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  DEFAULT_CONFIG,
  detectExecutorConflicts,
  loadConfig,
  resolveSubagentDefaults,
  splitProviderModel,
  WorkloomConfigError,
} from '../src/legacy/config.js'

/** 创建临时项目根。 */
function makeRoot() {
  return mkdtempSync(join(tmpdir(), 'workloom-config-'))
}

/** 创建临时 home 目录（全局配置层与全局 prompts 层用）。 */
function makeHome() {
  return mkdtempSync(join(tmpdir(), 'workloom-home-'))
}

/**
 * 写入项目 .workloom 下的配置文件：value 为对象时写 JSON，为字符串时当 JS 模块
 * 原文写入（config.js / 遗留 yaml 原文场景）。
 * @param {string} root 项目根
 * @param {string} name 文件名（config.json / config.js / config.local.json / config.local.js）
 * @param {unknown} value 配置内容
 */
function writeProjectFile(root, name, value) {
  const dir = join(root, '.workloom')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, name), typeof value === 'string' ? value : JSON.stringify(value, null, 2))
}

/** 写入全局层 $HOME/.workloom 下的配置文件（对象 → JSON / 字符串 → JS 原文）。 */
function writeHomeFile(homeDir, name, value) {
  const dir = join(homeDir, '.workloom')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, name), typeof value === 'string' ? value : JSON.stringify(value, null, 2))
}

/** 清理一组临时目录（root/home 元组或单目录）。 */
function cleanup(...paths) {
  for (const path of paths) {
    rmSync(path, { recursive: true, force: true })
  }
}

// ---------- L0：加载器（json/js、对象覆盖、工厂、三层链、歧义、yaml 探测） ----------

test('无任何配置文件（项目与全局均缺失）返回全默认', () => {
  const root = makeRoot()
  const home = makeHome()
  try {
    const config = loadConfig(root, { homeDir: home })
    assert.deepEqual(config, DEFAULT_CONFIG)
    assert.equal(config.promptInjection.skipKeyword, 'no-workloom')
  } finally {
    cleanup(root, home)
  }
})

test('config.json 对象层加载：字段覆盖与布尔解析', () => {
  const root = makeRoot()
  const home = makeHome()
  writeProjectFile(root, 'config.json', {
    max_journal_lines: 500,
    session_auto_commit: false,
    session_commit_message: 'chore: journal',
    prompt_injection: { skip_keyword: '' },
  })
  try {
    const config = loadConfig(root, { homeDir: home })
    assert.equal(config.maxJournalLines, 500)
    assert.equal(config.sessionAutoCommit, false)
    assert.equal(config.sessionCommitMessage, 'chore: journal')
    assert.equal(config.promptInjection.skipKeyword, '')
  } finally {
    cleanup(root, home)
  }
})

test('config.js CommonJS 导出加载（module.exports）', () => {
  const root = makeRoot()
  const home = makeHome()
  writeProjectFile(root, 'config.js', 'module.exports = { max_journal_lines: 600 }\n')
  try {
    const config = loadConfig(root, { homeDir: home })
    assert.equal(config.maxJournalLines, 600)
  } finally {
    cleanup(root, home)
  }
})

test('config.js ESM 导出归一（export default 取 .default）', () => {
  const root = makeRoot()
  const home = makeHome()
  writeProjectFile(root, 'config.js', 'export default { max_journal_lines: 700 }\n')
  try {
    const config = loadConfig(root, { homeDir: home })
    assert.equal(config.maxJournalLines, 700)
  } finally {
    cleanup(root, home)
  }
})

test('config.js 导出函数：工厂入参为低层合并结果，返回值即最终文档', () => {
  const root = makeRoot()
  const home = makeHome()
  writeProjectFile(root, 'config.json', {
    subagents: { implement: { model: 'm-base' } },
    session_commit_message: 'base',
  })
  writeProjectFile(
    root,
    'config.local.js',
    'module.exports = (base) => ({ ...base, subagents: { implement: { model: "m-factory", effort: "max" } } })\n',
  )
  try {
    const config = loadConfig(root, { homeDir: home })
    assert.deepEqual(config.subagents, { implement: { model: 'm-factory', effort: 'max' } })
    // 工厂返回值即本层最终形态：session_commit_message 保留（来自 ...base 展开）
    assert.equal(config.sessionCommitMessage, 'base')
  } finally {
    cleanup(root, home)
  }
})

test('对象层顶层 key 覆盖（非深合并）：local 的 subagents 整体替换 project', () => {
  const root = makeRoot()
  const home = makeHome()
  writeProjectFile(root, 'config.json', {
    subagents: {
      implement: { model: 'm1', effort: 'high' },
      research: { model: 'm-r' },
    },
  })
  writeProjectFile(root, 'config.local.json', {
    subagents: { implement: { model: 'm2' } },
  })
  try {
    const config = loadConfig(root, { homeDir: home })
    // 顶层 key 覆盖：local 的 subagents 整体替换，不按 kind 深合并
    assert.deepEqual(config.subagents, { implement: { model: 'm2' } })
  } finally {
    cleanup(root, home)
  }
})

test('三层优先级链：全局 → 项目 → local 逐层覆盖', () => {
  const root = makeRoot()
  const home = makeHome()
  writeHomeFile(home, 'config.json', {
    session_commit_message: 'global',
    max_journal_lines: 100,
  })
  writeProjectFile(root, 'config.json', {
    session_commit_message: 'project',
    packages: { cli: { path: 'packages/cli' } },
  })
  writeProjectFile(root, 'config.local.json', { max_journal_lines: 300 })
  try {
    const config = loadConfig(root, { homeDir: home })
    assert.equal(config.sessionCommitMessage, 'project') // 项目覆盖全局
    assert.equal(config.maxJournalLines, 300) // local 覆盖项目
    assert.deepEqual(config.packages, { cli: { path: 'packages/cli' } }) // 项目字段保留
  } finally {
    cleanup(root, home)
  }
})

test('全局层缺失 = 零行为（项目配置不受影响）', () => {
  const root = makeRoot()
  const home = makeHome()
  writeProjectFile(root, 'config.json', { max_journal_lines: 200 })
  try {
    const config = loadConfig(root, { homeDir: home })
    assert.equal(config.maxJournalLines, 200)
    assert.equal(config.sessionCommitMessage, DEFAULT_CONFIG.sessionCommitMessage)
  } finally {
    cleanup(root, home)
  }
})

test('同层双主文件歧义：config.json + config.js 并存报错', () => {
  const root = makeRoot()
  const home = makeHome()
  writeProjectFile(root, 'config.json', {})
  writeProjectFile(root, 'config.js', 'module.exports = {}\n')
  try {
    assert.throws(
      () => loadConfig(root, { homeDir: home }),
      (error) => {
        assert.ok(error instanceof WorkloomConfigError)
        assert.match(error.message, /ambiguous/)
        assert.match(error.message, /config\.json/)
        assert.match(error.message, /config\.js/)
        return true
      },
    )
  } finally {
    cleanup(root, home)
  }
})

test('同层双 local 文件歧义：config.local.json + config.local.js 并存报错', () => {
  const root = makeRoot()
  const home = makeHome()
  writeProjectFile(root, 'config.local.json', {})
  writeProjectFile(root, 'config.local.js', 'module.exports = {}\n')
  try {
    assert.throws(() => loadConfig(root, { homeDir: home }), WorkloomConfigError)
  } finally {
    cleanup(root, home)
  }
})

test('遗留 config.yaml 探测报错（错误文案指明迁移目标文件名）', () => {
  const root = makeRoot()
  const home = makeHome()
  writeProjectFile(root, 'config.yaml', 'packages:\n  cli:\n    path: packages/cli\n')
  try {
    assert.throws(
      () => loadConfig(root, { homeDir: home }),
      (error) => {
        assert.ok(error instanceof WorkloomConfigError)
        assert.match(error.message, /config\.json/)
        assert.match(error.message, /config\.js/)
        return true
      },
    )
  } finally {
    cleanup(root, home)
  }
})

test('遗留 config.local.yaml 探测报错（错误文案指明迁移目标文件名）', () => {
  const root = makeRoot()
  const home = makeHome()
  writeProjectFile(root, 'config.local.yaml', 'subagents: {}\n')
  try {
    assert.throws(
      () => loadConfig(root, { homeDir: home }),
      (error) => {
        assert.ok(error instanceof WorkloomConfigError)
        assert.match(error.message, /config\.local\.json/)
        assert.match(error.message, /config\.local\.js/)
        return true
      },
    )
  } finally {
    cleanup(root, home)
  }
})

test('JSON 解析失败报错（带字段路径）', () => {
  const root = makeRoot()
  const home = makeHome()
  writeProjectFile(root, 'config.json', '{"max_journal_lines": ')
  try {
    assert.throws(
      () => loadConfig(root, { homeDir: home }),
      (error) => {
        assert.ok(error instanceof WorkloomConfigError)
        assert.equal(error.field, 'config.json')
        assert.match(error.message, /parse failed/)
        return true
      },
    )
  } finally {
    cleanup(root, home)
  }
})

test('config.js 导出非对象非函数报错', () => {
  const root = makeRoot()
  const home = makeHome()
  writeProjectFile(root, 'config.js', 'module.exports = 42\n')
  try {
    assert.throws(
      () => loadConfig(root, { homeDir: home }),
      (error) => {
        assert.ok(error instanceof WorkloomConfigError)
        assert.equal(error.field, 'config.js')
        return true
      },
    )
  } finally {
    cleanup(root, home)
  }
})

test('config.js 工厂返回非对象报错', () => {
  const root = makeRoot()
  const home = makeHome()
  writeProjectFile(root, 'config.js', 'module.exports = () => 42\n')
  try {
    assert.throws(
      () => loadConfig(root, { homeDir: home }),
      (error) => {
        assert.ok(error instanceof WorkloomConfigError)
        assert.equal(error.field, 'config.js')
        return true
      },
    )
  } finally {
    cleanup(root, home)
  }
})

test('config.js 加载期抛错转 WorkloomConfigError（带字段路径）', () => {
  const root = makeRoot()
  const home = makeHome()
  writeProjectFile(root, 'config.js', 'throw new Error("boom")\n')
  try {
    assert.throws(
      () => loadConfig(root, { homeDir: home }),
      (error) => {
        assert.ok(error instanceof WorkloomConfigError)
        assert.equal(error.field, 'config.js')
        return true
      },
    )
  } finally {
    cleanup(root, home)
  }
})

// ---------- L1：全局白名单 ----------

test('全局白名单：6 类项目无关字段放行', () => {
  const root = makeRoot()
  const home = makeHome()
  writeHomeFile(home, 'config.json', {
    subagent_profiles: [{ subagents: { implement: { model: 'm' } } }],
    session_auto_commit: false,
    session_commit_message: 'global-commit',
    max_journal_lines: 123,
    prompt_injection: { skip_keyword: 'skip' },
    context_injection: { max_file_bytes: 100 },
  })
  try {
    const config = loadConfig(root, { homeDir: home })
    assert.equal(config.sessionAutoCommit, false)
    assert.equal(config.sessionCommitMessage, 'global-commit')
    assert.equal(config.maxJournalLines, 123)
    assert.equal(config.promptInjection.skipKeyword, 'skip')
    assert.equal(config.contextInjection.maxFileBytes, 100)
    assert.deepEqual(config.subagentProfiles, [
      { subagents: { implement: { model: 'm' } } },
    ])
  } finally {
    cleanup(root, home)
  }
})

test('全局白名单：packages / hooks 属项目字段报错', () => {
  for (const doc of [{ packages: {} }, { hooks: { after_create: [] } }]) {
    const root = makeRoot()
    const home = makeHome()
    writeHomeFile(home, 'config.json', doc)
    try {
      assert.throws(
        () => loadConfig(root, { homeDir: home }),
        (error) => {
          assert.ok(error instanceof WorkloomConfigError)
          assert.match(error.message, /project/i)
          return true
        },
      )
    } finally {
      cleanup(root, home)
    }
  }
})

test('全局白名单：白名单外顶层字段报错', () => {
  const root = makeRoot()
  const home = makeHome()
  writeHomeFile(home, 'config.json', { foo: 1 })
  try {
    assert.throws(
      () => loadConfig(root, { homeDir: home }),
      (error) => {
        assert.ok(error instanceof WorkloomConfigError)
        assert.match(error.message, /unsupported|global/i)
        return true
      },
    )
  } finally {
    cleanup(root, home)
  }
})

test('全局遗留 subagents：加载期 WARNING + 照常解析（项目层同口径）', () => {
  const warnings = []
  const original = console.warn
  console.warn = (message) => warnings.push(String(message))
  const root = makeRoot()
  const home = makeHome()
  try {
    writeHomeFile(home, 'config.json', { subagents: { implement: { model: 'm-g' } } })
    const config = loadConfig(root, { homeDir: home })
    assert.deepEqual(config.subagents, { implement: { model: 'm-g' } })
    assert.equal(warnings.length, 1)
    assert.match(warnings[0], /subagents/i)
  } finally {
    console.warn = original
    cleanup(root, home)
  }
})

test('项目层遗留 subagents：加载期 WARNING + 照常解析', () => {
  const warnings = []
  const original = console.warn
  console.warn = (message) => warnings.push(String(message))
  const root = makeRoot()
  const home = makeHome()
  try {
    writeProjectFile(root, 'config.json', { subagents: { research: { effort: 'high' } } })
    const config = loadConfig(root, { homeDir: home })
    assert.deepEqual(config.subagents, { research: { effort: 'high' } })
    assert.equal(warnings.length, 1)
  } finally {
    console.warn = original
    cleanup(root, home)
  }
})

// ---------- L2：tools 字段（profiles 层） ----------

test('subagent_profiles 内 tools 解析：includes/excludes、去重、空数组合法', () => {
  const root = makeRoot()
  const home = makeHome()
  writeProjectFile(root, 'config.json', {
    subagent_profiles: [
      {
        subagents: {
          implement: {
            model: 'm',
            tools: {
              includes: ['lsp_diagnostics', 'lsp_diagnostics', 'lsp_*'],
              excludes: ['web_fetch'],
            },
          },
          research: { tools: { includes: [], excludes: [] } },
        },
      },
    ],
  })
  try {
    const config = loadConfig(root, { homeDir: home })
    assert.deepEqual(config.subagentProfiles[0].subagents.implement, {
      model: 'm',
      tools: { includes: ['lsp_diagnostics', 'lsp_*'], excludes: ['web_fetch'] },
    })
    assert.deepEqual(config.subagentProfiles[0].subagents.research, {
      tools: { includes: [], excludes: [] },
    })
  } finally {
    cleanup(root, home)
  }
})

test('tools 类型错误报错（带字段路径，含数组元素下标）', () => {
  const cases = [
    {
      doc: { subagent_profiles: [{ subagents: { implement: { tools: 5 } } }] },
      field: 'subagent_profiles[0].subagents.implement.tools',
    },
    {
      doc: { subagent_profiles: [{ subagents: { implement: { tools: { includes: 5 } } } }] },
      field: 'subagent_profiles[0].subagents.implement.tools.includes',
    },
    {
      doc: {
        subagent_profiles: [{ subagents: { implement: { tools: { includes: ['a', 5] } } } }],
      },
      field: 'subagent_profiles[0].subagents.implement.tools.includes[1]',
    },
    {
      doc: {
        subagent_profiles: [{ subagents: { implement: { tools: { includes: [''] } } } }],
      },
      field: 'subagent_profiles[0].subagents.implement.tools.includes[0]',
    },
  ]
  for (const { doc, field } of cases) {
    const root = makeRoot()
    const home = makeHome()
    writeProjectFile(root, 'config.json', doc)
    try {
      assert.throws(
        () => loadConfig(root, { homeDir: home }),
        (error) => {
          assert.ok(error instanceof WorkloomConfigError)
          assert.equal(error.field, field)
          return true
        },
      )
    } finally {
      cleanup(root, home)
    }
  }
})

test('顶层 subagents 出现 tools 报错（仅支持于 subagent_profiles）', () => {
  const root = makeRoot()
  const home = makeHome()
  writeProjectFile(root, 'config.json', {
    subagents: { implement: { tools: { includes: ['x'] } } },
  })
  try {
    assert.throws(
      () => loadConfig(root, { homeDir: home }),
      (error) => {
        assert.ok(error instanceof WorkloomConfigError)
        assert.equal(error.field, 'subagents.implement.tools')
        assert.match(error.message, /subagent_profiles/)
        return true
      },
    )
  } finally {
    cleanup(root, home)
  }
})

test('条目内未知字段报错（subagents 层与 profiles 层一致）', () => {
  const cases = [
    {
      doc: { subagents: { implement: { bogus: 1 } } },
      field: 'subagents.implement.bogus',
    },
    {
      doc: { subagent_profiles: [{ subagents: { implement: { bogus: 1 } } }] },
      field: 'subagent_profiles[0].subagents.implement.bogus',
    },
  ]
  for (const { doc, field } of cases) {
    const root = makeRoot()
    const home = makeHome()
    writeProjectFile(root, 'config.json', doc)
    try {
      assert.throws(
        () => loadConfig(root, { homeDir: home }),
        (error) => {
          assert.ok(error instanceof WorkloomConfigError)
          assert.equal(error.field, field)
          return true
        },
      )
    } finally {
      cleanup(root, home)
    }
  }
})

// ---------- L3：default_package 删除 ----------

test('default_package 死字段：DEFAULT_CONFIG 不再携带', () => {
  assert.equal('defaultPackage' in DEFAULT_CONFIG, false)
})

test('default_package 不再解析：旧字段按未知字段静默忽略（不进结果）', () => {
  const root = makeRoot()
  const home = makeHome()
  writeProjectFile(root, 'config.json', { default_package: 'web' })
  try {
    const config = loadConfig(root, { homeDir: home })
    assert.equal('defaultPackage' in config, false)
    assert.deepEqual(config, DEFAULT_CONFIG)
  } finally {
    cleanup(root, home)
  }
})

// ---------- L4：subagents / subagent_profiles 解析（JSON 形态） ----------

test('subagents 合法解析：完整字段、仅 model、仅 effort、空 map、未知 kind key 保留', () => {
  const root = makeRoot()
  const home = makeHome()
  writeProjectFile(root, 'config.json', {
    subagents: {
      research: { model: 'deepseek-v4-flash', effort: 'high' },
      implement: { model: 'deepseek-v4-pro' },
      check: { effort: 'medium' },
      empty: {},
      future_kind: { effort: 'high' },
      typo_kind: { model: 'x' },
    },
  })
  try {
    const config = loadConfig(root, { homeDir: home })
    assert.deepEqual(config.subagents.research, { model: 'deepseek-v4-flash', effort: 'high' })
    assert.deepEqual(config.subagents.implement, { model: 'deepseek-v4-pro' })
    assert.deepEqual(config.subagents.check, { effort: 'medium' })
    assert.deepEqual(config.subagents.empty, {})
    assert.deepEqual(config.subagents.future_kind, { effort: 'high' })
    assert.deepEqual(config.subagents.typo_kind, { model: 'x' })
  } finally {
    cleanup(root, home)
  }
})

test('subagents 结构非法抛 WorkloomConfigError（带字段路径）', () => {
  const cases = [
    { doc: { subagents: 5 }, field: 'subagents' },
    { doc: { subagents: { research: 5 } }, field: 'subagents.research' },
    { doc: { subagents: { research: { model: 5 } } }, field: 'subagents.research.model' },
    { doc: { subagents: { research: { effort: 5 } } }, field: 'subagents.research.effort' },
  ]
  for (const { doc, field } of cases) {
    const root = makeRoot()
    const home = makeHome()
    writeProjectFile(root, 'config.json', doc)
    try {
      assert.throws(
        () => loadConfig(root, { homeDir: home }),
        (error) => {
          assert.ok(error instanceof WorkloomConfigError)
          assert.equal(error.field, field)
          return true
        },
      )
    } finally {
      cleanup(root, home)
    }
  }
})

test('subagents model map 形式解析（key 不白名单）与 value 非 string 报错', () => {
  const root = makeRoot()
  const home = makeHome()
  writeProjectFile(root, 'config.json', {
    subagents: {
      implement: {
        model: { dsh: 'deepseek-official/deepseek-v4-flash', pi: 'deepseek/deepseek-v4-flash' },
        effort: 'max',
      },
      research: { model: 'm-plain' },
    },
  })
  try {
    const config = loadConfig(root, { homeDir: home })
    assert.deepEqual(config.subagents.implement, {
      model: { dsh: 'deepseek-official/deepseek-v4-flash', pi: 'deepseek/deepseek-v4-flash' },
      effort: 'max',
    })
    assert.deepEqual(config.subagents.research, { model: 'm-plain' })
  } finally {
    cleanup(root, home)
  }
  const bad = makeRoot()
  const badHome = makeHome()
  writeProjectFile(bad, 'config.json', { subagents: { research: { model: { dsh: 5 } } } })
  try {
    assert.throws(
      () => loadConfig(bad, { homeDir: badHome }),
      (error) => {
        assert.ok(error instanceof WorkloomConfigError)
        assert.equal(error.field, 'subagents.research.model.dsh')
        return true
      },
    )
  } finally {
    cleanup(bad, badHome)
  }
})

test('subagent_profiles 合法解析：string/map whenMain 与兜底条目（tools 同步解析）', () => {
  const root = makeRoot()
  const home = makeHome()
  writeProjectFile(root, 'config.json', {
    subagent_profiles: [
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
    ],
  })
  try {
    const config = loadConfig(root, { homeDir: home })
    assert.deepEqual(config.subagentProfiles, [
      { whenMain: 'kimi-coding/k3', subagents: { implement: { model: 'deepseek-v4-flash', effort: 'max' } } },
      {
        whenMain: {
          dsh: 'qwen-token-plan-cn/qwen3.8-flash',
          pi: 'ark-coding-plan/glm-5.3-flash',
        },
        subagents: { research: { model: 'deepseek-v4-pro' } },
      },
      { subagents: { check: { effort: 'medium' } } },
    ])
    assert.deepEqual(config.subagents, {})
  } finally {
    cleanup(root, home)
  }
})

test('subagent_profiles 顶层非数组 / 条目非 map / whenMain 非法报错', () => {
  const cases = [
    { doc: { subagent_profiles: 5 }, field: 'subagent_profiles' },
    { doc: { subagent_profiles: [5] }, field: 'subagent_profiles[0]' },
    {
      doc: { subagent_profiles: [{ subagents: 5 }] },
      field: 'subagent_profiles[0].subagents',
    },
    { doc: { subagent_profiles: [{ whenMain: 'k3' }] }, field: 'subagent_profiles[0].whenMain' },
  ]
  for (const { doc, field } of cases) {
    const root = makeRoot()
    const home = makeHome()
    writeProjectFile(root, 'config.json', doc)
    try {
      assert.throws(
        () => loadConfig(root, { homeDir: home }),
        (error) => {
          assert.ok(error instanceof WorkloomConfigError)
          assert.equal(error.field, field)
          return true
        },
      )
    } finally {
      cleanup(root, home)
    }
  }
})

test('多条无 whenMain 条目抛错（fail loud）', () => {
  const root = makeRoot()
  const home = makeHome()
  writeProjectFile(root, 'config.json', {
    subagent_profiles: [
      { subagents: { research: { model: 'a' } } },
      { subagents: { implement: { model: 'b' } } },
    ],
  })
  try {
    assert.throws(
      () => loadConfig(root, { homeDir: home }),
      (error) => {
        assert.ok(error instanceof WorkloomConfigError)
        assert.equal(error.field, 'subagent_profiles')
        assert.match(error.message, /fallback/)
        return true
      },
    )
  } finally {
    cleanup(root, home)
  }
})

test('whenMain 条件重叠抛错（string/string、string/map、map/map）', () => {
  const cases = [
    {
      doc: { subagent_profiles: [{ whenMain: 'kimi-coding/k3' }, { whenMain: 'kimi-coding/k3' }] },
      value: 'kimi-coding/k3',
    },
    {
      doc: {
        subagent_profiles: [
          { whenMain: 'kimi-coding/k3' },
          { whenMain: { dsh: 'kimi-coding/k3' } },
        ],
      },
      value: 'kimi-coding/k3',
    },
    {
      doc: {
        subagent_profiles: [
          { whenMain: { dsh: 'kimi-coding/k3', pi: 'ark-coding-plan/glm-5.3-flash' } },
          { whenMain: { dsh: 'other/x', pi: 'ark-coding-plan/glm-5.3-flash' } },
        ],
      },
      value: 'ark-coding-plan/glm-5.3-flash',
    },
  ]
  for (const { doc, value } of cases) {
    const root = makeRoot()
    const home = makeHome()
    writeProjectFile(root, 'config.json', doc)
    try {
      assert.throws(
        () => loadConfig(root, { homeDir: home }),
        (error) => {
          assert.ok(error instanceof WorkloomConfigError)
          assert.equal(error.field, 'subagent_profiles')
          assert.match(error.message, /overlap/)
          assert.ok(error.message.includes(value))
          return true
        },
      )
    } finally {
      cleanup(root, home)
    }
  }
})

test('未知字段容错忽略（旧平台字段与 executor.gate 残留不报错）', () => {
  const root = makeRoot()
  const home = makeHome()
  writeProjectFile(root, 'config.json', {
    channel: { worker_guard: { idle_timeout: '5m' } },
    codex: { dispatch_mode: 'auto' },
    executor: { gate: false },
  })
  try {
    const config = loadConfig(root, { homeDir: home })
    assert.deepEqual(config, DEFAULT_CONFIG)
    assert.equal('executor' in config, false)
  } finally {
    cleanup(root, home)
  }
})

test('非法值显式抛错（fail loud）', () => {
  const root = makeRoot()
  const home = makeHome()
  writeProjectFile(root, 'config.json', { max_journal_lines: -1 })
  try {
    assert.throws(() => loadConfig(root, { homeDir: home }), WorkloomConfigError)
  } finally {
    cleanup(root, home)
  }
})

// ---------- L5：resolveSubagentDefaults 合并层 ----------

test('resolveSubagentDefaults：参数覆盖配置（字段独立合并）', () => {
  const config = { subagents: { research: { model: 'm-config', effort: 'high' } } }
  const byModel = resolveSubagentDefaults(config, 'research', { model: 'm-tool' })
  assert.deepEqual(byModel, {
    model: 'm-tool',
    effort: 'high',
    sources: { model: 'param', effort: 'config' },
    configSources: { model: undefined, effort: 'legacy' },
    tools: undefined,
  })
  const byEffort = resolveSubagentDefaults(config, 'research', { effort: 'max' })
  assert.deepEqual(byEffort, {
    model: 'm-config',
    effort: 'max',
    sources: { model: 'config', effort: 'param' },
    configSources: { model: 'legacy', effort: undefined },
    tools: undefined,
  })
})

test('resolveSubagentDefaults：无参数回退配置；均无配置返回 undefined 字段', () => {
  const config = { subagents: { research: { model: 'm-config', effort: 'high' } } }
  assert.deepEqual(resolveSubagentDefaults(config, 'research', {}), {
    model: 'm-config',
    effort: 'high',
    sources: { model: 'config', effort: 'config' },
    configSources: { model: 'legacy', effort: 'legacy' },
    tools: undefined,
  })
  assert.deepEqual(resolveSubagentDefaults({ subagents: {} }, 'research', {}), {
    model: undefined,
    effort: undefined,
    sources: { model: undefined, effort: undefined },
    configSources: { model: undefined, effort: undefined },
    tools: undefined,
  })
})

test('resolveSubagentDefaults：不修改入参', () => {
  const config = { subagents: { research: { model: 'm', effort: 'high' } } }
  const before = structuredClone(config)
  resolveSubagentDefaults(config, 'research', { model: 'm-tool', effort: 'max' })
  assert.deepEqual(config, before)
})

test('resolveSubagentDefaults：model map 按 runtime 取值、缺 key 抛错', () => {
  const config = { subagents: { implement: { model: { dsh: 'm-dsh', pi: 'm-pi' }, effort: 'high' } } }
  assert.equal(resolveSubagentDefaults(config, 'implement', {}, 'dsh').model, 'm-dsh')
  assert.equal(resolveSubagentDefaults(config, 'implement', {}, 'pi').model, 'm-pi')
  assert.throws(
    () => resolveSubagentDefaults({ subagents: { implement: { model: { dsh: 'x' } } } }, 'implement', {}, 'pi'),
    (error) => {
      assert.ok(error instanceof WorkloomConfigError)
      assert.equal(error.field, 'subagents.implement.model')
      assert.match(error.message, /missing entry for runtime "pi"/)
      return true
    },
  )
  assert.throws(
    () => resolveSubagentDefaults({ subagents: { implement: { model: { dsh: 'x' } } } }, 'implement', {}),
    WorkloomConfigError,
  )
})

test('resolveSubagentDefaults：whenMain string 两段归一化命中、裸 id 不命中', () => {
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
    tools: undefined,
  })
  const miss = resolveSubagentDefaults(config, 'implement', {}, 'dsh', 'k3')
  assert.equal(miss.model, 'legacy-m')
})

test('resolveSubagentDefaults：whenMain map 按 runtime 取值命中、mainModel 缺失跳过', () => {
  const config = {
    subagents: { implement: { model: 'legacy-m' } },
    subagentProfiles: [
      { whenMain: { dsh: 'dsh/x', pi: 'pi/y' }, subagents: { implement: { model: 'profile-m' } } },
    ],
  }
  assert.equal(resolveSubagentDefaults(config, 'implement', {}, 'dsh', 'dsh/x').model, 'profile-m')
  assert.equal(resolveSubagentDefaults(config, 'implement', {}, 'pi', 'dsh/x').model, 'legacy-m')
  assert.equal(resolveSubagentDefaults(config, 'implement', {}, 'dsh').model, 'legacy-m')
})

test('resolveSubagentDefaults：兜底条目优先、kind 级联、字段独立合并', () => {
  const config = {
    subagents: { research: { model: 'legacy-r' }, implement: { effort: 'high' } },
    subagentProfiles: [
      { subagents: { implement: { model: 'fallback-m' } } },
      { whenMain: 'kimi-coding/k3', subagents: { implement: { model: 'whenmain-m' } } },
    ],
  }
  assert.equal(
    resolveSubagentDefaults(config, 'implement', {}, 'dsh', 'kimi-coding/k3').model,
    'fallback-m',
  )
  assert.equal(resolveSubagentDefaults(config, 'research', {}, 'dsh', 'kimi-coding/k3').model, 'legacy-r')
  assert.deepEqual(resolveSubagentDefaults(config, 'implement', {}, 'dsh', 'kimi-coding/k3'), {
    model: 'fallback-m',
    effort: 'high',
    sources: { model: 'config', effort: 'config' },
    configSources: { model: 'fallback', effort: 'legacy' },
    tools: undefined,
  })
})

test('resolveSubagentDefaults：tools 随命中 profile 条目该 kind 透出（legacy 层无 tools）', () => {
  const config = {
    subagents: { implement: { model: 'legacy-m' } },
    subagentProfiles: [
      {
        whenMain: 'kimi-coding/k3',
        subagents: {
          implement: { model: 'profile-m', tools: { includes: ['lsp_*'], excludes: ['bash'] } },
        },
      },
    ],
  }
  const hit = resolveSubagentDefaults(config, 'implement', {}, 'dsh', 'kimi-coding/k3')
  assert.deepEqual(hit.tools, { includes: ['lsp_*'], excludes: ['bash'] })
  // 未命中 profile 条目（mainModel 不匹配）→ tools 为 undefined（legacy 层不支持 tools）。
  assert.equal(resolveSubagentDefaults(config, 'implement', {}, 'dsh', 'other/x').tools, undefined)
  // 命中条目但该 kind 未配 tools → undefined。
  const noTools = { subagents: {}, subagentProfiles: [{ subagents: { research: { model: 'm' } } }] }
  assert.equal(resolveSubagentDefaults(noTools, 'research', {}, 'dsh', 'kimi-coding/k3').tools, undefined)
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

test('resolveSubagentDefaults：显式参数覆盖 profile/map 配置（不触发 runtime 解析）', () => {
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
    tools: undefined,
  })
})

// ---------- L6：model 拆分与冲突检测 ----------

test('splitProviderModel：provider 前缀拆分与裸 id、非法输入抛错', () => {
  assert.deepEqual(splitProviderModel('deepseek-official/deepseek-v4-flash'), {
    provider: 'deepseek-official',
    model: 'deepseek-v4-flash',
  })
  assert.deepEqual(splitProviderModel('deepseek-v4-flash'), { model: 'deepseek-v4-flash' })
  assert.deepEqual(splitProviderModel('a/b/c'), { provider: 'a', model: 'b/c' })
  for (const bad of ['', '/model', 'provider/', null, 5]) {
    assert.throws(() => splitProviderModel(bad), Error)
  }
})

test('detectExecutorConflicts：配置限定字段与显式参数不一致时报冲突，一致不报', () => {
  const config = { subagents: { implement: { model: 'deepseek-official/x', effort: 'high' } } }
  const conflicting = detectExecutorConflicts(config, 'implement', { model: 'other/y' }, 'dsh')
  assert.equal(conflicting.length, 1)
  assert.equal(conflicting[0].field, 'model')
  const consistent = detectExecutorConflicts(config, 'implement', { model: 'deepseek-official/x' }, 'dsh')
  assert.equal(consistent.length, 0)
})

// ---------- L7：来源层 provenance（subagentProfilesSource / subagentsSource） ----------

test('provenance：全程无 subagent_profiles/subagents 时来源字段为 undefined（不定义属性）', () => {
  // 项目/全局均无任何配置文件：来源字段不定义（读取为 undefined），且与默认配置完全相等
  const root = makeRoot()
  const home = makeHome()
  try {
    const config = loadConfig(root, { homeDir: home })
    assert.equal(config.subagentProfilesSource, undefined)
    assert.equal(config.subagentsSource, undefined)
    assert.deepEqual(config, DEFAULT_CONFIG)
  } finally {
    cleanup(root, home)
  }
  // 配置文件存在但只写无关字段：同样不定义来源字段
  const withDoc = makeRoot()
  const withDocHome = makeHome()
  writeProjectFile(withDoc, 'config.json', { max_journal_lines: 300 })
  try {
    const config = loadConfig(withDoc, { homeDir: withDocHome })
    assert.equal(config.subagentProfilesSource, undefined)
    assert.equal(config.subagentsSource, undefined)
    assert.equal(config.maxJournalLines, 300)
  } finally {
    cleanup(withDoc, withDocHome)
  }
})

test('provenance：subagent_profiles 写在单层时记录该层来源', () => {
  const root = makeRoot()
  const home = makeHome()
  writeHomeFile(home, 'config.json', {
    subagent_profiles: [{ subagents: { implement: { model: 'm' } } }],
  })
  try {
    const config = loadConfig(root, { homeDir: home })
    assert.equal(config.subagentProfilesSource, 'global')
    assert.equal(config.subagentsSource, undefined)
  } finally {
    cleanup(root, home)
  }
  const proj = makeRoot()
  const projHome = makeHome()
  writeProjectFile(proj, 'config.json', {
    subagent_profiles: [{ subagents: { research: { model: 'm' } } }],
  })
  try {
    const config = loadConfig(proj, { homeDir: projHome })
    assert.equal(config.subagentProfilesSource, 'project')
  } finally {
    cleanup(proj, projHome)
  }
})

test('provenance：三层逐级写入 subagent_profiles，只记最后写入层（local）', () => {
  const root = makeRoot()
  const home = makeHome()
  writeHomeFile(home, 'config.json', {
    subagent_profiles: [{ subagents: { implement: { model: 'g' } } }],
  })
  writeProjectFile(root, 'config.json', {
    subagent_profiles: [{ subagents: { implement: { model: 'p' } } }],
  })
  writeProjectFile(root, 'config.local.json', {
    subagent_profiles: [{ subagents: { implement: { model: 'l' } } }],
  })
  try {
    const config = loadConfig(root, { homeDir: home })
    assert.equal(config.subagentProfilesSource, 'local')
  } finally {
    cleanup(root, home)
  }
})

test('provenance：对象层不含该 key 时沿用低层来源（顶层 key 覆盖语义）', () => {
  const root = makeRoot()
  const home = makeHome()
  writeHomeFile(home, 'config.json', {
    subagent_profiles: [{ subagents: { implement: { model: 'g' } } }],
  })
  // 项目/local 对象层只写了别的字段：不覆盖来源层
  writeProjectFile(root, 'config.json', { max_journal_lines: 200 })
  writeProjectFile(root, 'config.local.json', { session_auto_commit: false })
  try {
    const config = loadConfig(root, { homeDir: home })
    assert.equal(config.subagentProfilesSource, 'global')
  } finally {
    cleanup(root, home)
  }
})

test('provenance：subagents 与 subagent_profiles 独立记录各自来源层', () => {
  const root = makeRoot()
  const home = makeHome()
  writeHomeFile(home, 'config.json', {
    subagent_profiles: [{ subagents: { research: { model: 'm' } } }],
  })
  writeProjectFile(root, 'config.json', { subagents: { research: { effort: 'high' } } })
  // local 只覆盖 subagents：profiles 来源仍为 global，subagents 来源为 local
  writeProjectFile(root, 'config.local.json', { subagents: { check: { model: 'x/y' } } })
  try {
    const config = loadConfig(root, { homeDir: home })
    assert.equal(config.subagentProfilesSource, 'global')
    assert.equal(config.subagentsSource, 'local')
  } finally {
    cleanup(root, home)
  }
})

test('provenance：工厂层返回文档含 subagent_profiles 时归工厂层', () => {
  const root = makeRoot()
  const home = makeHome()
  writeProjectFile(root, 'config.json', {
    subagent_profiles: [{ subagents: { implement: { model: 'p' } } }],
  })
  // local 工厂返回含 subagent_profiles 的文档（无论重写还是 ...base 透传）：归工厂层
  writeProjectFile(
    root,
    'config.local.js',
    'module.exports = (base) => ({ ...base, subagent_profiles: [{ subagents: { research: { model: "l" } } }] })\n',
  )
  try {
    const config = loadConfig(root, { homeDir: home })
    assert.equal(config.subagentProfilesSource, 'local')
  } finally {
    cleanup(root, home)
  }
})

test('provenance：工厂层返回文档不含 subagent_profiles 时沿用低层来源（返回文档为准）', () => {
  const root = makeRoot()
  const home = makeHome()
  writeProjectFile(root, 'config.json', {
    subagent_profiles: [{ subagents: { implement: { model: 'p' } } }],
  })
  // local 工厂丢弃 subagent_profiles（未透传 base）：最终配置不再含 profiles，
  // 来源沿用低层（project），不因丢弃而抹掉追溯信息
  writeProjectFile(
    root,
    'config.local.js',
    'module.exports = () => ({ max_journal_lines: 400 })\n',
  )
  try {
    const config = loadConfig(root, { homeDir: home })
    assert.equal(config.subagentProfilesSource, 'project')
    assert.deepEqual(config.subagentProfiles, [])
    assert.equal(config.maxJournalLines, 400)
  } finally {
    cleanup(root, home)
  }
})

test('provenance：legacy subagents 单独跟踪来源（global 层放行 + 独立字段）', () => {
  const root = makeRoot()
  const home = makeHome()
  writeHomeFile(home, 'config.json', { subagents: { research: { model: 'g-r' } } })
  try {
    const config = loadConfig(root, { homeDir: home })
    assert.equal(config.subagentsSource, 'global')
    assert.equal(config.subagentProfilesSource, undefined)
    assert.deepEqual(config.subagents, { research: { model: 'g-r' } })
  } finally {
    cleanup(root, home)
  }
})
