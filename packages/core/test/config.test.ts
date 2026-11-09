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

import { DEFAULT_CONFIG, WorkloomConfigError } from '../src/workspace/config-defaults.ts'
import { loadConfig } from '../src/workspace/config-load.ts'
import {
  detectExecutorConflicts,
  resolveSubagentDefaults,
  splitProviderModel,
} from '../src/workspace/config-subagent.ts'

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
    session_auto_commit: false,
    prompt_injection: { skip_keyword: '' },
  })
  try {
    const config = loadConfig(root, { homeDir: home })
    assert.equal(config.sessionAutoCommit, false)
    assert.equal(config.promptInjection.skipKeyword, '')
  } finally {
    cleanup(root, home)
  }
})

test('config.js CommonJS 导出加载（module.exports）', () => {
  const root = makeRoot()
  const home = makeHome()
  writeProjectFile(root, 'config.js', 'module.exports = { session_auto_commit: false }\n')
  try {
    const config = loadConfig(root, { homeDir: home })
    assert.equal(config.sessionAutoCommit, false)
  } finally {
    cleanup(root, home)
  }
})

test('config.js ESM 导出归一（export default 取 .default）', () => {
  const root = makeRoot()
  const home = makeHome()
  writeProjectFile(root, 'config.js', 'export default { session_auto_commit: false }\n')
  try {
    const config = loadConfig(root, { homeDir: home })
    assert.equal(config.sessionAutoCommit, false)
  } finally {
    cleanup(root, home)
  }
})

test('config.js 导出函数：工厂入参为低层合并结果，返回值即最终文档', () => {
  const root = makeRoot()
  const home = makeHome()
  writeProjectFile(root, 'config.json', {
    prompt_injection: { skip_keyword: 'base' },
    session_auto_commit: false,
  })
  writeProjectFile(
    root,
    'config.local.js',
    'module.exports = (base) => ({ ...base, prompt_injection: { skip_keyword: "factory" } })\n',
  )
  try {
    const config = loadConfig(root, { homeDir: home })
    assert.deepEqual(config.promptInjection, { skipKeyword: 'factory' })
    // 工厂返回值即本层最终形态：session_auto_commit 保留（来自 ...base 展开）
    assert.equal(config.sessionAutoCommit, false)
  } finally {
    cleanup(root, home)
  }
})

test('对象层顶层 key 覆盖（非深合并）：local 的 subagent_profiles 整体替换 project', () => {
  const root = makeRoot()
  const home = makeHome()
  writeProjectFile(root, 'config.json', {
    subagent_profiles: [
      { roles: { developer: { model: 'm1', effort: 'high' } } },
      { whenMain: 'p/m', roles: { researcher: { model: 'm-r' } } },
    ],
  })
  writeProjectFile(root, 'config.local.json', {
    subagent_profiles: [{ roles: { developer: { model: 'm2' } } }],
  })
  try {
    const config = loadConfig(root, { homeDir: home })
    // 顶层 key 覆盖：local 的 subagent_profiles 整体替换，不逐条目深合并
    assert.deepEqual(config.subagentProfiles, [{ roles: { developer: { model: 'm2' } } }])
  } finally {
    cleanup(root, home)
  }
})

test('三层优先级链：全局 → 项目 → local 逐层覆盖', () => {
  const root = makeRoot()
  const home = makeHome()
  writeHomeFile(home, 'config.json', {
    prompt_injection: { skip_keyword: 'global' },
  })
  writeProjectFile(root, 'config.json', {
    prompt_injection: { skip_keyword: 'project' },
    packages: { cli: { path: 'packages/cli' } },
  })
  writeProjectFile(root, 'config.local.json', { session_auto_commit: false })
  try {
    const config = loadConfig(root, { homeDir: home })
    assert.equal(config.promptInjection.skipKeyword, 'project') // 项目覆盖全局
    assert.equal(config.sessionAutoCommit, false) // local 覆盖项目
    assert.deepEqual(config.packages, { cli: { path: 'packages/cli', setup: [] } }) // 项目字段保留
  } finally {
    cleanup(root, home)
  }
})

test('全局层缺失 = 零行为（项目配置不受影响）', () => {
  const root = makeRoot()
  const home = makeHome()
  writeProjectFile(root, 'config.json', { session_auto_commit: false })
  try {
    const config = loadConfig(root, { homeDir: home })
    assert.equal(config.sessionAutoCommit, false)
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
  writeProjectFile(root, 'config.json', '{"session_auto_commit": ')
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

test('全局白名单：项目无关字段放行', () => {
  const root = makeRoot()
  const home = makeHome()
  writeHomeFile(home, 'config.json', {
    subagent_profiles: [{ roles: { developer: { model: 'm' } } }],
    session_auto_commit: false,
    prompt_injection: { skip_keyword: 'skip' },
    context_injection: { max_file_bytes: 100 },
  })
  try {
    const config = loadConfig(root, { homeDir: home })
    assert.equal(config.sessionAutoCommit, false)
    assert.equal(config.promptInjection.skipKeyword, 'skip')
    assert.equal(config.contextInjection.maxFileBytes, 100)
    assert.deepEqual(config.subagentProfiles, [
      { roles: { developer: { model: 'm' } } },
    ])
  } finally {
    cleanup(root, home)
  }
})

test('全局白名单：packages / hooks / worktree 属项目字段报错', () => {
  for (const doc of [
    { packages: {} },
    { hooks: { after_create: [] } },
    { worktree: { enabled: true } },
  ]) {
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

test('全局根层级 subagents：出现即抛 WorkloomConfigError（文案含 subagent_profiles 迁移指引）', () => {
  const root = makeRoot()
  const home = makeHome()
  try {
    writeHomeFile(home, 'config.json', { subagents: { developer: { model: 'm-g' } } })
    assert.throws(
      () => loadConfig(root, { homeDir: home }),
      (error) => {
        assert.ok(error instanceof WorkloomConfigError)
        assert.equal(error.field, 'subagents')
        assert.match(error.message, /no longer supported/)
        assert.match(error.message, /migrate to subagent_profiles/)
        return true
      },
    )
  } finally {
    cleanup(root, home)
  }
})

test('项目层根层级 subagents：同口径抛错（与 subagent_profiles 并存时先报退役错误）', () => {
  const root = makeRoot()
  const home = makeHome()
  try {
    // 同时写根层级 subagents 与 subagent_profiles：加载期先报根层级退役错误，不进入解析链。
    writeProjectFile(root, 'config.json', {
      subagents: { researcher: { effort: 'high' } },
      subagent_profiles: [{ roles: { researcher: { model: 'm' } } }],
    })
    assert.throws(
      () => loadConfig(root, { homeDir: home }),
      (error) => {
        assert.ok(error instanceof WorkloomConfigError)
        assert.equal(error.field, 'subagents')
        assert.match(error.message, /migrate to subagent_profiles/)
        return true
      },
    )
  } finally {
    cleanup(root, home)
  }
})

test('subagent_profiles 条目内旧角色键：加载期一次性 WARNING（不抛错，文案指向新 role 键名）', () => {
  const warnings = []
  const original = console.warn
  console.warn = (message) => warnings.push(String(message))
  const root = makeRoot()
  const home = makeHome()
  try {
    // 'review' 键为旧 kind 值：WARNING 指向新键 judger；解析照常成功（不破坏存量环境）。
    writeProjectFile(root, 'config.json', {
      subagent_profiles: [{ roles: { review: { model: 'm-legacy-key' } } }],
    })
    const config = loadConfig(root, { homeDir: home })
    assert.deepEqual(config.subagentProfiles[0].roles.review, { model: 'm-legacy-key' })
    const legacyWarns = warnings.filter((w) => /legacy executor kind key/.test(w))
    assert.equal(legacyWarns.length, 1)
    assert.match(legacyWarns[0], /rename it to "judger"/)
    // 同一进程内同键只告警一次（loadConfig 高频调用不刷屏）。
    loadConfig(root, { homeDir: home })
    assert.equal(warnings.filter((w) => /legacy executor kind key/.test(w)).length, 1)
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
        roles: {
          developer: {
            model: 'm',
            tools: {
              includes: ['lsp_diagnostics', 'lsp_diagnostics', 'lsp_*'],
              excludes: ['web_fetch'],
            },
          },
          researcher: { tools: { includes: [], excludes: [] } },
        },
      },
    ],
  })
  try {
    const config = loadConfig(root, { homeDir: home })
    assert.deepEqual(config.subagentProfiles[0].roles.developer, {
      model: 'm',
      tools: { includes: ['lsp_diagnostics', 'lsp_*'], excludes: ['web_fetch'] },
    })
    assert.deepEqual(config.subagentProfiles[0].roles.researcher, {
      tools: { includes: [], excludes: [] },
    })
  } finally {
    cleanup(root, home)
  }
})

test('tools 类型错误报错（带字段路径，含数组元素下标）', () => {
  const cases = [
    {
      doc: { subagent_profiles: [{ roles: { developer: { tools: 5 } } }] },
      field: 'subagent_profiles[0].roles.developer.tools',
    },
    {
      doc: { subagent_profiles: [{ roles: { developer: { tools: { includes: 5 } } } }] },
      field: 'subagent_profiles[0].roles.developer.tools.includes',
    },
    {
      doc: {
        subagent_profiles: [{ roles: { developer: { tools: { includes: ['a', 5] } } } }],
      },
      field: 'subagent_profiles[0].roles.developer.tools.includes[1]',
    },
    {
      doc: {
        subagent_profiles: [{ roles: { developer: { tools: { includes: [''] } } } }],
      },
      field: 'subagent_profiles[0].roles.developer.tools.includes[0]',
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

test('条目内未知字段报错（profiles 层，allowed 清单全量）', () => {
  const cases = [
    {
      doc: { subagent_profiles: [{ roles: { developer: { bogus: 1 } } }] },
      field: 'subagent_profiles[0].roles.developer.bogus',
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

// ---------- L4：subagent_profiles 解析（JSON 形态） ----------

test('profile 条目合法解析：完整字段、仅 model、仅 effort、空 map、未知角色 key 保留', () => {
  const root = makeRoot()
  const home = makeHome()
  writeProjectFile(root, 'config.json', {
    subagent_profiles: [
      {
        roles: {
          researcher: { model: 'deepseek-v4-flash', effort: 'high' },
          developer: { model: 'deepseek-v4-pro' },
          checker: { effort: 'medium' },
          empty: {},
          future_role: { effort: 'high' },
          typo_role: { model: 'x' },
        },
      },
    ],
  })
  try {
    const config = loadConfig(root, { homeDir: home })
    const entries = config.subagentProfiles[0].roles
    assert.deepEqual(entries.researcher, { model: 'deepseek-v4-flash', effort: 'high' })
    assert.deepEqual(entries.developer, { model: 'deepseek-v4-pro' })
    assert.deepEqual(entries.checker, { effort: 'medium' })
    assert.deepEqual(entries.empty, {})
    assert.deepEqual(entries.future_role, { effort: 'high' })
    assert.deepEqual(entries.typo_role, { model: 'x' })
  } finally {
    cleanup(root, home)
  }
})

test('profile 条目结构非法抛 WorkloomConfigError（带字段路径）', () => {
  const cases = [
    {
      doc: { subagent_profiles: [{ roles: { researcher: 5 } }] },
      field: 'subagent_profiles[0].roles.researcher',
    },
    {
      doc: { subagent_profiles: [{ roles: { researcher: { model: 5 } } }] },
      field: 'subagent_profiles[0].roles.researcher.model',
    },
    {
      doc: { subagent_profiles: [{ roles: { researcher: { effort: 5 } } }] },
      field: 'subagent_profiles[0].roles.researcher.effort',
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

test('subagent_profiles 合法解析：string whenMain 与兜底条目（tools 同步解析）', () => {
  const root = makeRoot()
  const home = makeHome()
  writeProjectFile(root, 'config.json', {
    subagent_profiles: [
      {
        whenMain: 'kimi-coding/k3',
        roles: { developer: { model: 'deepseek-v4-flash', effort: 'max' } },
      },
      {
        whenMain: 'ark-coding-plan/glm-5.3-flash',
        roles: { researcher: { model: 'deepseek-v4-pro' } },
      },
      { roles: { checker: { effort: 'medium' } } },
    ],
  })
  try {
    const config = loadConfig(root, { homeDir: home })
    assert.deepEqual(config.subagentProfiles, [
      { whenMain: 'kimi-coding/k3', roles: { developer: { model: 'deepseek-v4-flash', effort: 'max' } } },
      {
        whenMain: 'ark-coding-plan/glm-5.3-flash',
        roles: { researcher: { model: 'deepseek-v4-pro' } },
      },
      { roles: { checker: { effort: 'medium' } } },
    ])
  } finally {
    cleanup(root, home)
  }
})

test('subagent_profiles 条目内旧字段名 subagents：抛错含 roles 迁移指引（决定 15，不做兼容读）', () => {
  const root = makeRoot()
  const home = makeHome()
  writeProjectFile(root, 'config.json', {
    subagent_profiles: [{ subagents: { developer: { model: 'm' } } }],
  })
  try {
    assert.throws(
      () => loadConfig(root, { homeDir: home }),
      (error) => {
        assert.ok(error instanceof WorkloomConfigError)
        assert.equal(error.field, 'subagent_profiles[0].subagents')
        assert.match(error.message, /rename the field to roles/)
        assert.match(error.message, /subagent_profiles\[i\]\.roles\.<role>/)
        return true
      },
    )
  } finally {
    cleanup(root, home)
  }
})

test('subagent_profiles 顶层非数组 / 条目非 map / whenMain 非法报错', () => {
  const cases = [
    { doc: { subagent_profiles: 5 }, field: 'subagent_profiles' },
    { doc: { subagent_profiles: [5] }, field: 'subagent_profiles[0]' },
    {
      doc: { subagent_profiles: [{ roles: 5 }] },
      field: 'subagent_profiles[0].roles',
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
      { roles: { researcher: { model: 'a' } } },
      { roles: { developer: { model: 'b' } } },
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

test('whenMain 条件重叠抛错（相同 provider/model 字符串）', () => {
  const root = makeRoot()
  const home = makeHome()
  writeProjectFile(root, 'config.json', {
    subagent_profiles: [{ whenMain: 'kimi-coding/k3' }, { whenMain: 'kimi-coding/k3' }],
  })
  try {
    assert.throws(
      () => loadConfig(root, { homeDir: home }),
      (error) => {
        assert.ok(error instanceof WorkloomConfigError)
        assert.equal(error.field, 'subagent_profiles')
        assert.match(error.message, /overlap/)
        assert.ok(error.message.includes('kimi-coding/k3'))
        return true
      },
    )
  } finally {
    cleanup(root, home)
  }
})

test('未知字段容错忽略（旧平台字段与 executor.gate 残留不报错）', () => {
  // 处置：executor 现已纳入 schema（maxConcurrent 缺省 0 = 不限），executor.gate 作为未知子字段
  // 仍容错忽略；断言调整为校验 executor.maxConcurrent 缺省值 + gate 子字段不残留。
  const root = makeRoot()
  const home = makeHome()
  writeProjectFile(root, 'config.json', {
    channel: { worker_guard: { idle_timeout: '5m' } },
    codex: { dispatch_mode: 'auto' },
    executor: { gate: false },
  })
  try {
    const config = loadConfig(root, { homeDir: home })
    assert.equal(config.executor.maxConcurrent, 0)
    assert.equal('gate' in config.executor, false)
  } finally {
    cleanup(root, home)
  }
})

test('非法值显式抛错（fail loud）', () => {
  const root = makeRoot()
  const home = makeHome()
  writeProjectFile(root, 'config.json', { session_auto_commit: 'maybe' })
  try {
    assert.throws(() => loadConfig(root, { homeDir: home }), WorkloomConfigError)
  } finally {
    cleanup(root, home)
  }
})

// ---------- L5：resolveSubagentDefaults 合并层 ----------

test('resolveSubagentDefaults：参数覆盖配置（字段独立合并）', () => {
  const config = { subagentProfiles: [{ roles: { researcher: { model: 'm-config', effort: 'high' } } }] }
  const byModel = resolveSubagentDefaults(config, 'researcher', { model: 'm-tool' })
  assert.deepEqual(byModel, {
    model: 'm-tool',
    effort: 'high',
    sources: { model: 'param', effort: 'config' },
    configSources: { model: undefined, effort: 'fallback' },
    tools: undefined,
    maxConcurrent: 3,
  })
  const byEffort = resolveSubagentDefaults(config, 'researcher', { effort: 'max' })
  assert.deepEqual(byEffort, {
    model: 'm-config',
    effort: 'max',
    sources: { model: 'config', effort: 'param' },
    configSources: { model: 'fallback', effort: undefined },
    tools: undefined,
    maxConcurrent: 3,
  })
})

test('resolveSubagentDefaults：无参数回退配置；model/effort 均无配置返回 undefined（maxConcurrent 兜底 3）', () => {
  const config = { subagentProfiles: [{ roles: { researcher: { model: 'm-config', effort: 'high' } } }] }
  assert.deepEqual(resolveSubagentDefaults(config, 'researcher', {}), {
    model: 'm-config',
    effort: 'high',
    sources: { model: 'config', effort: 'config' },
    configSources: { model: 'fallback', effort: 'fallback' },
    tools: undefined,
    maxConcurrent: 3,
  })
  assert.deepEqual(resolveSubagentDefaults({ subagentProfiles: [] }, 'researcher', {}), {
    model: undefined,
    effort: undefined,
    sources: { model: undefined, effort: undefined },
    configSources: { model: undefined, effort: undefined },
    tools: undefined,
    maxConcurrent: 3,
  })
})

test('resolveSubagentDefaults：不修改入参', () => {
  const config = { subagentProfiles: [{ roles: { researcher: { model: 'm', effort: 'high' } } }] }
  const before = structuredClone(config)
  resolveSubagentDefaults(config, 'researcher', { model: 'm-tool', effort: 'max' })
  assert.deepEqual(config, before)
})

test('resolveSubagentDefaults：whenMain string 两段归一化命中、裸 id 不命中', () => {
  const config = {
    subagentProfiles: [
      { whenMain: 'kimi-coding/k3', roles: { developer: { model: 'profile-m', effort: 'max' } } },
    ],
  }
  const hit = resolveSubagentDefaults(config, 'developer', {}, 'kimi-coding/k3')
  assert.deepEqual(hit, {
    model: 'profile-m',
    effort: 'max',
    sources: { model: 'config', effort: 'config' },
    configSources: { model: 'whenMain', effort: 'whenMain' },
    whenMainValue: 'kimi-coding/k3',
    tools: undefined,
    maxConcurrent: 3,
  })
  // 裸 id 不命中 whenMain：无兜底条目时字段继承宿主默认（undefined）。
  const miss = resolveSubagentDefaults(config, 'developer', {}, 'k3')
  assert.equal(miss.model, undefined)
})

test('resolveSubagentDefaults：兜底条目优先、角色级联、字段独立合并', () => {
  const config = {
    subagentProfiles: [
      { roles: { developer: { model: 'fallback-m', effort: 'high' }, researcher: { model: 'fallback-r' } } },
      { whenMain: 'kimi-coding/k3', roles: { developer: { model: 'whenmain-m' } } },
    ],
  }
  // 兜底条目在匹配顺序上优先：whenMain 条目在其后不再命中。
  assert.equal(
    resolveSubagentDefaults(config, 'developer', {}, 'kimi-coding/k3').model,
    'fallback-m',
  )
  // 角色级联：同一命中条目内各角色键独立取值。
  assert.equal(resolveSubagentDefaults(config, 'researcher', {}, 'kimi-coding/k3').model, 'fallback-r')
  assert.deepEqual(resolveSubagentDefaults(config, 'developer', {}, 'kimi-coding/k3'), {
    model: 'fallback-m',
    effort: 'high',
    sources: { model: 'config', effort: 'config' },
    configSources: { model: 'fallback', effort: 'fallback' },
    tools: undefined,
    maxConcurrent: 3,
  })
})

test('resolveSubagentDefaults：tools 随命中 profile 条目该角色透出', () => {
  const config = {
    subagentProfiles: [
      {
        whenMain: 'kimi-coding/k3',
        roles: {
          developer: { model: 'profile-m', tools: { includes: ['lsp_*'], excludes: ['bash'] } },
        },
      },
    ],
  }
  const hit = resolveSubagentDefaults(config, 'developer', {}, 'kimi-coding/k3')
  assert.deepEqual(hit.tools, { includes: ['lsp_*'], excludes: ['bash'] })
  // 未命中 profile 条目（mainModel 不匹配）→ tools 为 undefined。
  assert.equal(resolveSubagentDefaults(config, 'developer', {}, 'other/x').tools, undefined)
  // 命中条目但该角色未配 tools → undefined。
  const noTools = { subagentProfiles: [{ roles: { researcher: { model: 'm' } } }] }
  assert.equal(resolveSubagentDefaults(noTools, 'researcher', {}, 'kimi-coding/k3').tools, undefined)
})

test('resolveSubagentDefaults：显式参数覆盖 profile 配置', () => {
  const config = {
    subagentProfiles: [
      { whenMain: 'kimi-coding/k3', roles: { developer: { model: 'profile-m' } } },
    ],
  }
  const effective = resolveSubagentDefaults(
    config,
    'developer',
    { model: 'm-tool' },
    'kimi-coding/k3',
  )
  assert.deepEqual(effective, {
    model: 'm-tool',
    effort: undefined,
    sources: { model: 'param', effort: undefined },
    configSources: { model: undefined, effort: undefined },
    tools: undefined,
    maxConcurrent: 3,
  })
})

// ---------- L5b：fallback_models 失败转移链解析 ----------

test('fallback_models 合法解析（profiles 内层）：链保序、空数组等价缺省', () => {
  const root = makeRoot()
  const home = makeHome()
  writeProjectFile(root, 'config.json', {
    subagent_profiles: [
      {
        whenMain: 'kimi-coding/k3',
        roles: { checker: { fallback_models: [{ model: 'profile-m2' }] } },
      },
      {
        roles: {
          developer: {
            model: 'm-primary',
            fallback_models: [{ model: 'provider-a/m2', effort: 'high' }, { model: 'm3' }],
          },
          researcher: { fallback_models: [] },
        },
      },
    ],
  })
  try {
    const config = loadConfig(root, { homeDir: home })
    assert.deepEqual(config.subagentProfiles[1].roles.developer, {
      model: 'm-primary',
      fallbackModels: [{ model: 'provider-a/m2', effort: 'high' }, { model: 'm3' }],
    })
    // 空数组等价缺省：字段不出现（解析期归一）。
    assert.equal(config.subagentProfiles[1].roles.researcher.fallbackModels, undefined)
    assert.deepEqual(config.subagentProfiles[0].roles.checker.fallbackModels, [
      { model: 'profile-m2' },
    ])
  } finally {
    cleanup(root, home)
  }
})

test('fallback_models 非法形状按字段路径 fail loud', () => {
  const bad = (fallback) => ({
    subagent_profiles: [{ roles: { developer: { fallback_models: fallback } } }],
  })
  const prefix = 'subagent_profiles[0].roles.developer.fallback_models'
  const cases = [
    { doc: bad('m2'), field: prefix },
    { doc: bad([5]), field: `${prefix}[0]` },
    { doc: bad([{ effort: 'high' }]), field: `${prefix}[0].model` },
    { doc: bad([{ model: 5 }]), field: `${prefix}[0].model` },
    { doc: bad([{ model: { pi: 'm2' } }]), field: `${prefix}[0].model` },
    { doc: bad([{ model: '' }]), field: `${prefix}[0].model` },
    { doc: bad([{ model: 'm2', effort: 5 }]), field: `${prefix}[0].effort` },
    { doc: bad([{ model: 'm2', bogus: 1 }]), field: `${prefix}[0].bogus` },
    { doc: bad([{ model: 'm2' }, { model: 'm2' }]), field: prefix },
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

test('resolveSubagentDefaults：fallbackModels 命中条目透出（未配置不出现字段）', () => {
  const config = {
    subagentProfiles: [
      {
        whenMain: 'kimi-coding/k3',
        roles: {
          developer: {
            model: 'profile-m',
            fallbackModels: [{ model: 'profile-fb-1' }, { model: 'profile-fb-2', effort: 'high' }],
          },
        },
      },
      { roles: { developer: { model: 'fallback-m' } } },
    ],
  }
  const hit = resolveSubagentDefaults(config, 'developer', {}, 'kimi-coding/k3')
  assert.deepEqual(hit, {
    model: 'profile-m',
    effort: undefined,
    sources: { model: 'config', effort: undefined },
    configSources: { model: 'whenMain', effort: undefined, fallbackModels: 'whenMain' },
    whenMainValue: 'kimi-coding/k3',
    tools: undefined,
    maxConcurrent: 3,
    fallbackModels: [{ model: 'profile-fb-1' }, { model: 'profile-fb-2', effort: 'high' }],
  })
  // 命中兜底条目但该条目未配链：字段不出现（两层链已随根层级退役收敛为单点）。
  const miss = resolveSubagentDefaults(config, 'developer', {}, 'other/x')
  assert.equal(miss.fallbackModels, undefined)
  assert.equal('fallbackModels' in miss.configSources, false)
  // 全程未配置：字段不出现（与现状逐字一致，避免污染既有 deepEqual 断言）。
  const none = resolveSubagentDefaults({ subagentProfiles: [] }, 'developer', {})
  assert.equal(none.fallbackModels, undefined)
  assert.equal('fallbackModels' in none.configSources, false)
})

// ---------- L5b：rotate_on_busy 解析与透出 ----------

test('rotate_on_busy 解析五形态：true 落字段、false/缺省不落、字符串与数字抛错含字段路径', () => {
  const assertParsed = (roleValue, expectField) => {
    const root = makeRoot()
    const home = makeHome()
    writeProjectFile(root, 'config.json', {
      subagent_profiles: [{ roles: { developer: { rotate_on_busy: roleValue } } }],
    })
    try {
      const config = loadConfig(root, { homeDir: home })
      const entry = config.subagentProfiles[0].roles.developer
      assert.equal('rotateOnBusy' in entry, expectField)
      if (expectField) assert.equal(entry.rotateOnBusy, true)
    } finally {
      cleanup(root, home)
    }
  }
  // 仅显式 true 落内存字段；false 与缺省等价不落（同 fallbackModels 空数组等价缺省）。
  assertParsed(true, true)
  assertParsed(false, false)
  assertParsed(undefined, false)
  // 宽化写法不收：字符串/数字布尔 fail loud（错误含字段路径与 boolean 语义）。
  for (const bad of ['true', 1]) {
    const root = makeRoot()
    const home = makeHome()
    writeProjectFile(root, 'config.json', {
      subagent_profiles: [{ roles: { developer: { rotate_on_busy: bad } } }],
    })
    try {
      assert.throws(
        () => loadConfig(root, { homeDir: home }),
        (error) => {
          assert.ok(error instanceof WorkloomConfigError)
          assert.equal(error.field, 'subagent_profiles[0].roles.developer.rotate_on_busy')
          assert.match(error.message, /must be a boolean/)
          return true
        },
      )
    } finally {
      cleanup(root, home)
    }
  }
})

test('rotate_on_busy 不再触发未知字段报错（allowed 清单已收录）', () => {
  const root = makeRoot()
  const home = makeHome()
  writeProjectFile(root, 'config.json', {
    subagent_profiles: [{ roles: { developer: { rotate_on_busy: true } } }],
  })
  try {
    const config = loadConfig(root, { homeDir: home })
    assert.equal(config.subagentProfiles[0].roles.developer.rotateOnBusy, true)
  } finally {
    cleanup(root, home)
  }
})

test('resolveSubagentDefaults：rotateOnBusy 命中条目透出（未配置不出现字段）', () => {
  const config = {
    subagentProfiles: [
      {
        roles: {
          developer: { rotateOnBusy: true },
          researcher: { model: 'plain-m' },
        },
      },
    ],
  }
  const hit = resolveSubagentDefaults(config, 'developer', {})
  assert.equal(hit.rotateOnBusy, true)
  // 命中条目未配置轮换开关：字段不出现（零行为变化，不污染既有 deepEqual 断言）。
  const miss = resolveSubagentDefaults(config, 'researcher', {})
  assert.equal('rotateOnBusy' in miss, false)
  // 全程未配置：字段不出现。
  const none = resolveSubagentDefaults({ subagentProfiles: [] }, 'developer', {})
  assert.equal('rotateOnBusy' in none, false)
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
  const config = {
    subagentProfiles: [{ roles: { developer: { model: 'deepseek-official/x', effort: 'high' } } }],
  }
  const conflicting = detectExecutorConflicts(config, 'developer', { model: 'other/y' })
  assert.equal(conflicting.length, 1)
  assert.equal(conflicting[0].field, 'model')
  const consistent = detectExecutorConflicts(config, 'developer', { model: 'deepseek-official/x' })
  assert.equal(consistent.length, 0)
})

// ---------- L7：来源层 provenance（subagentProfilesSource） ----------

test('provenance：全程无 subagent_profiles 时来源字段为 undefined（不定义属性）', () => {
  // 项目/全局均无任何配置文件：来源字段不定义（读取为 undefined），且与默认配置完全相等
  const root = makeRoot()
  const home = makeHome()
  try {
    const config = loadConfig(root, { homeDir: home })
    assert.equal(config.subagentProfilesSource, undefined)
    assert.deepEqual(config, DEFAULT_CONFIG)
  } finally {
    cleanup(root, home)
  }
  // 配置文件存在但只写无关字段：同样不定义来源字段
  const withDoc = makeRoot()
  const withDocHome = makeHome()
  writeProjectFile(withDoc, 'config.json', { session_auto_commit: false })
  try {
    const config = loadConfig(withDoc, { homeDir: withDocHome })
    assert.equal(config.subagentProfilesSource, undefined)
    assert.equal(config.sessionAutoCommit, false)
  } finally {
    cleanup(withDoc, withDocHome)
  }
})

test('provenance：subagent_profiles 写在单层时记录该层来源', () => {
  const root = makeRoot()
  const home = makeHome()
  writeHomeFile(home, 'config.json', {
    subagent_profiles: [{ roles: { developer: { model: 'm' } } }],
  })
  try {
    const config = loadConfig(root, { homeDir: home })
    assert.equal(config.subagentProfilesSource, 'global')
  } finally {
    cleanup(root, home)
  }
  const proj = makeRoot()
  const projHome = makeHome()
  writeProjectFile(proj, 'config.json', {
    subagent_profiles: [{ roles: { researcher: { model: 'm' } } }],
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
    subagent_profiles: [{ roles: { developer: { model: 'g' } } }],
  })
  writeProjectFile(root, 'config.json', {
    subagent_profiles: [{ roles: { developer: { model: 'p' } } }],
  })
  writeProjectFile(root, 'config.local.json', {
    subagent_profiles: [{ roles: { developer: { model: 'l' } } }],
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
    subagent_profiles: [{ roles: { developer: { model: 'g' } } }],
  })
  // 项目/local 对象层只写了别的字段：不覆盖来源层
  writeProjectFile(root, 'config.json', { prompt_injection: { skip_keyword: 'p' } })
  writeProjectFile(root, 'config.local.json', { session_auto_commit: false })
  try {
    const config = loadConfig(root, { homeDir: home })
    assert.equal(config.subagentProfilesSource, 'global')
  } finally {
    cleanup(root, home)
  }
})

test('provenance：工厂层返回文档含 subagent_profiles 时归工厂层', () => {
  const root = makeRoot()
  const home = makeHome()
  writeProjectFile(root, 'config.json', {
    subagent_profiles: [{ roles: { developer: { model: 'p' } } }],
  })
  // local 工厂返回含 subagent_profiles 的文档（无论重写还是 ...base 透传）：归工厂层
  writeProjectFile(
    root,
    'config.local.js',
    'module.exports = (base) => ({ ...base, subagent_profiles: [{ roles: { researcher: { model: "l" } } }] })\n',
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
    subagent_profiles: [{ roles: { developer: { model: 'p' } } }],
  })
  // local 工厂丢弃 subagent_profiles（未透传 base）：最终配置不再含 profiles，
  // 来源沿用低层（project），不因丢弃而抹掉追溯信息
  writeProjectFile(
    root,
    'config.local.js',
    'module.exports = () => ({ session_auto_commit: false })\n',
  )
  try {
    const config = loadConfig(root, { homeDir: home })
    assert.equal(config.subagentProfilesSource, 'project')
    assert.deepEqual(config.subagentProfiles, [])
    assert.equal(config.sessionAutoCommit, false)
  } finally {
    cleanup(root, home)
  }
})

// ---------- executor 并发闸配置解析（R1） ----------

test('executor 缺省 max_concurrent = 0（不限，分闸重心在按角色缺省 3）', () => {
  const root = makeRoot()
  const home = makeHome()
  try {
    const config = loadConfig(root, { homeDir: home })
    assert.equal(config.executor.maxConcurrent, 0)
  } finally {
    cleanup(root, home)
  }
})

test('executor.max_concurrent 显式 0 = 不限', () => {
  const root = makeRoot()
  const home = makeHome()
  writeProjectFile(root, 'config.json', { executor: { max_concurrent: 0 } })
  try {
    const config = loadConfig(root, { homeDir: home })
    assert.equal(config.executor.maxConcurrent, 0)
  } finally {
    cleanup(root, home)
  }
})

test('executor.max_concurrent 自定义值', () => {
  const root = makeRoot()
  const home = makeHome()
  writeProjectFile(root, 'config.json', { executor: { max_concurrent: 5 } })
  try {
    const config = loadConfig(root, { homeDir: home })
    assert.equal(config.executor.maxConcurrent, 5)
  } finally {
    cleanup(root, home)
  }
})

test('executor.max_concurrent 负数 → WorkloomConfigError', () => {
  const root = makeRoot()
  const home = makeHome()
  writeProjectFile(root, 'config.json', { executor: { max_concurrent: -1 } })
  try {
    assert.throws(() => loadConfig(root, { homeDir: home }), (err) => {
      return err instanceof WorkloomConfigError && err.field === 'executor.max_concurrent'
    })
  } finally {
    cleanup(root, home)
  }
})

test('executor.max_concurrent 非整数 → WorkloomConfigError', () => {
  const root = makeRoot()
  const home = makeHome()
  writeProjectFile(root, 'config.json', { executor: { max_concurrent: 1.5 } })
  try {
    assert.throws(() => loadConfig(root, { homeDir: home }), (err) => {
      return err instanceof WorkloomConfigError && err.field === 'executor.max_concurrent'
    })
  } finally {
    cleanup(root, home)
  }
})

test('executor.max_concurrent 字符串 → WorkloomConfigError', () => {
  const root = makeRoot()
  const home = makeHome()
  writeProjectFile(root, 'config.json', { executor: { max_concurrent: 'two' } })
  try {
    assert.throws(() => loadConfig(root, { homeDir: home }), (err) => {
      return err instanceof WorkloomConfigError && err.field === 'executor.max_concurrent'
    })
  } finally {
    cleanup(root, home)
  }
})

test('executor 本地覆盖层覆盖项目层', () => {
  const root = makeRoot()
  const home = makeHome()
  writeProjectFile(root, 'config.json', { executor: { max_concurrent: 3 } })
  writeProjectFile(root, 'config.local.json', { executor: { max_concurrent: 1 } })
  try {
    const config = loadConfig(root, { homeDir: home })
    assert.equal(config.executor.maxConcurrent, 1)
  } finally {
    cleanup(root, home)
  }
})

test('executor 全局层可配置（白名单放行）', () => {
  const root = makeRoot()
  const home = makeHome()
  writeHomeFile(home, 'config.json', { executor: { max_concurrent: 4 } })
  try {
    const config = loadConfig(root, { homeDir: home })
    assert.equal(config.executor.maxConcurrent, 4)
  } finally {
    cleanup(root, home)
  }
})

test('subagent_profiles 条目含 max_concurrent（显式值覆盖缺省 3）', () => {
  const root = makeRoot()
  const home = makeHome()
  writeProjectFile(root, 'config.json', {
    subagent_profiles: [
      { roles: { developer: { model: 'p', max_concurrent: 5 } } },
    ],
  })
  try {
    const config = loadConfig(root, { homeDir: home })
    assert.equal(config.subagentProfiles[0].roles.developer.maxConcurrent, 5)
    // resolveSubagentDefaults 透出 maxConcurrent（显式值优先于缺省 3）
    const resolved = resolveSubagentDefaults(config, 'developer', {})
    assert.equal(resolved.maxConcurrent, 5)
  } finally {
    cleanup(root, home)
  }
})

test('subagent_profiles 条目 max_concurrent = 0 = 不限', () => {
  const root = makeRoot()
  const home = makeHome()
  writeProjectFile(root, 'config.json', {
    subagent_profiles: [
      { roles: { researcher: { max_concurrent: 0 } } },
    ],
  })
  try {
    const config = loadConfig(root, { homeDir: home })
    const resolved = resolveSubagentDefaults(config, 'researcher', {})
    assert.equal(resolved.maxConcurrent, 0)
  } finally {
    cleanup(root, home)
  }
})

test('subagent_profiles 条目 max_concurrent 负数 → WorkloomConfigError', () => {
  const root = makeRoot()
  const home = makeHome()
  writeProjectFile(root, 'config.json', {
    subagent_profiles: [
      { roles: { developer: { max_concurrent: -2 } } },
    ],
  })
  try {
    assert.throws(() => loadConfig(root, { homeDir: home }), (err) => {
      return (
        err instanceof WorkloomConfigError &&
        err.field === 'subagent_profiles[0].roles.developer.max_concurrent'
      )
    })
  } finally {
    cleanup(root, home)
  }
})

test('subagent_profiles 条目 max_concurrent 非整数 → WorkloomConfigError', () => {
  const root = makeRoot()
  const home = makeHome()
  writeProjectFile(root, 'config.json', {
    subagent_profiles: [
      { roles: { checker: { max_concurrent: 2.7 } } },
    ],
  })
  try {
    assert.throws(() => loadConfig(root, { homeDir: home }), (err) => {
      return (
        err instanceof WorkloomConfigError &&
        err.field === 'subagent_profiles[0].roles.checker.max_concurrent'
      )
    })
  } finally {
    cleanup(root, home)
  }
})

test('resolveSubagentDefaults：未配置 max_concurrent 时兜底缺省 3', () => {
  const root = makeRoot()
  const home = makeHome()
  writeProjectFile(root, 'config.json', {
    subagent_profiles: [{ roles: { developer: { model: 'p' } } }],
  })
  try {
    const config = loadConfig(root, { homeDir: home })
    const resolved = resolveSubagentDefaults(config, 'developer', {})
    assert.equal(resolved.maxConcurrent, 3)
  } finally {
    cleanup(root, home)
  }
})

// ---------- worktree 节配置解析（S1 R1） ----------

test('worktree 缺省值：enabled=true / branch_template=workloom/<task-id> / cleanup=rebase-keep-branch', () => {
  const root = makeRoot()
  const home = makeHome()
  try {
    const config = loadConfig(root, { homeDir: home })
    assert.deepEqual(config.worktree, {
      enabled: true,
      branchTemplate: 'workloom/<task-id>',
      cleanup: 'rebase-keep-branch',
    })
  } finally {
    cleanup(root, home)
  }
})

test('worktree 显式值解析（enabled=false、自定义模板含白名单占位符、六枚举值）', () => {
  const root = makeRoot()
  const home = makeHome()
  writeProjectFile(root, 'config.json', {
    worktree: {
      enabled: false,
      branch_template: 'feat/<task-slug>/<date>',
      cleanup: 'keep-branch',
    },
  })
  try {
    const config = loadConfig(root, { homeDir: home })
    assert.equal(config.worktree.enabled, false)
    assert.equal(config.worktree.branchTemplate, 'feat/<task-slug>/<date>')
    assert.equal(config.worktree.cleanup, 'keep-branch')
  } finally {
    cleanup(root, home)
  }
})

test('worktree.cleanup 六枚举：rebase-keep-branch / rebase-delete-branch 合法加载', () => {
  const root = makeRoot()
  const home = makeHome()
  try {
    // 两个 rebase 模式值逐个加载：合法值原样透出，不报枚举错误。
    writeProjectFile(root, 'config.json', { worktree: { cleanup: 'rebase-keep-branch' } })
    const keep = loadConfig(root, { homeDir: home })
    assert.equal(keep.worktree.cleanup, 'rebase-keep-branch')
    writeProjectFile(root, 'config.json', { worktree: { cleanup: 'rebase-delete-branch' } })
    const del = loadConfig(root, { homeDir: home })
    assert.equal(del.worktree.cleanup, 'rebase-delete-branch')
  } finally {
    cleanup(root, home)
  }
})

test('worktree.cleanup 六枚举之外的值 → WorkloomConfigError', () => {
  const root = makeRoot()
  const home = makeHome()
  writeProjectFile(root, 'config.json', { worktree: { cleanup: 'rebase' } })
  try {
    assert.throws(() => loadConfig(root, { homeDir: home }), (err) => {
      return err instanceof WorkloomConfigError && err.field === 'worktree.cleanup'
    })
  } finally {
    cleanup(root, home)
  }
})

test('worktree.branch_template 空模板 → WorkloomConfigError', () => {
  const root = makeRoot()
  const home = makeHome()
  writeProjectFile(root, 'config.json', { worktree: { branch_template: '   ' } })
  try {
    assert.throws(() => loadConfig(root, { homeDir: home }), (err) => {
      return err instanceof WorkloomConfigError && err.field === 'worktree.branch_template'
    })
  } finally {
    cleanup(root, home)
  }
})

test('worktree.branch_template 未知占位符 → WorkloomConfigError（白名单仅 task-id/task-slug/date）', () => {
  const root = makeRoot()
  const home = makeHome()
  writeProjectFile(root, 'config.json', { worktree: { branch_template: 'workloom/<bogus>' } })
  try {
    assert.throws(() => loadConfig(root, { homeDir: home }), (err) => {
      return (
        err instanceof WorkloomConfigError &&
        err.field === 'worktree.branch_template' &&
        /<bogus>/.test(err.message)
      )
    })
  } finally {
    cleanup(root, home)
  }
})

test('worktree 未知子字段 → WorkloomConfigError（fail loud）', () => {
  const root = makeRoot()
  const home = makeHome()
  writeProjectFile(root, 'config.json', { worktree: { bogus: 1 } })
  try {
    assert.throws(() => loadConfig(root, { homeDir: home }), (err) => {
      return err instanceof WorkloomConfigError && err.field === 'worktree.bogus'
    })
  } finally {
    cleanup(root, home)
  }
})

// ---------- packages.<name>.setup（worktree 依赖准备配置） ----------

test('packages.setup 合法数组解析（含白名单占位符）与缺省 []', () => {
  const root = makeRoot()
  const home = makeHome()
  writeProjectFile(root, 'config.json', {
    packages: {
      core: {
        path: 'packages/core',
        setup: ['pnpm install', 'cp -al <source-checkout>/node_modules <worktree>/node_modules'],
      },
      cli: { path: 'packages/cli' },
    },
  })
  try {
    const config = loadConfig(root, { homeDir: home })
    assert.deepEqual(config.packages.core.setup, [
      'pnpm install',
      'cp -al <source-checkout>/node_modules <worktree>/node_modules',
    ])
    assert.deepEqual(config.packages.cli.setup, [])
  } finally {
    cleanup(root, home)
  }
})

test('packages.<name>.setup 非字符串数组 → WorkloomConfigError（字段名准确）', () => {
  const root = makeRoot()
  const home = makeHome()
  writeProjectFile(root, 'config.json', { packages: { core: { path: '.', setup: 'pnpm install' } } })
  try {
    assert.throws(() => loadConfig(root, { homeDir: home }), (err) => {
      return err instanceof WorkloomConfigError && err.field === 'packages.core.setup'
    })
  } finally {
    cleanup(root)
  }
  const root2 = makeRoot()
  writeProjectFile(root2, 'config.json', { packages: { core: { path: '.', setup: ['ok', 42] } } })
  try {
    assert.throws(() => loadConfig(root2, { homeDir: home }), (err) => {
      return err instanceof WorkloomConfigError && err.field === 'packages.core.setup'
    })
  } finally {
    cleanup(root2, home)
  }
})

test('packages.<name>.setup 白名单外占位符 → 加载期 fail loud', () => {
  const root = makeRoot()
  const home = makeHome()
  writeProjectFile(root, 'config.json', {
    packages: { core: { path: '.', setup: ['echo <bogus>'] } },
  })
  try {
    assert.throws(() => loadConfig(root, { homeDir: home }), (err) => {
      return (
        err instanceof WorkloomConfigError &&
        err.field === 'packages.core.setup' &&
        /<bogus>/.test(err.message)
      )
    })
  } finally {
    cleanup(root, home)
  }
})
