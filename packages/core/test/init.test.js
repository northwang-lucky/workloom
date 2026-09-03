/**
 * init 模块单测（配置换轨后）：骨架生成、config.json 模板可解析、config.example.json/js
 * 两形态示例覆盖、幂等、developer 写入、.gitignore 生成、legacy 检测。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { initWorkloom } from '../dist/legacy/init.js'
import { DEFAULT_CONFIG, loadConfig } from '../dist/legacy/config.js'

/** 完整骨架路径清单（相对 root，与实现创建顺序一致）。 */
const SKELETON = [
  '.workloom',
  '.workloom/tasks',
  '.workloom/spec',
  '.workloom/workspace',
  '.workloom/.runtime/sessions',
  '.workloom/spec/README.md',
  '.workloom/config.json',
  '.workloom/config.example.json',
  '.workloom/config.example.js',
  '.workloom/.developer',
  '.workloom/.gitignore',
]

function makeRoot() {
  return mkdtempSync(join(tmpdir(), 'workloom-init-'))
}

function makeHome() {
  return mkdtempSync(join(tmpdir(), 'workloom-init-home-'))
}

/** 驼峰键转蛇形（配置文档字段名）。 */
function camelToSnake(name) {
  return name.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`)
}

/**
 * 收集对象字段的完整点号路径（keyName 变换每级键）；对象节点发射自身路径并
 * 递归子键，数组/标量止于自身。
 * @param {unknown} value 待遍历对象
 * @param {(key: string) => string} keyName 键名变换（驼峰转蛇形或恒等）
 * @param {string} [prefix] 已拼接前缀
 * @returns {string[]} 路径列表（如 context_injection.max_file_bytes）
 */
function collectPaths(value, keyName, prefix = '') {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return prefix === '' ? [] : [prefix]
  }
  const own = prefix === '' ? [] : [prefix]
  return [
    ...own,
    ...Object.entries(value).flatMap(([key, child]) =>
      collectPaths(child, keyName, prefix === '' ? keyName(key) : `${prefix}.${keyName(key)}`),
    ),
  ]
}

test('未命中时生成完整骨架', () => {
  const root = makeRoot()
  try {
    const [err, result] = initWorkloom(root)
    assert.equal(err, null)
    assert.ok(result)
    for (const rel of SKELETON) {
      assert.ok(existsSync(join(root, rel)), `missing ${rel}`)
    }
    assert.deepEqual(result.created, SKELETON)
    assert.equal(result.root, root)
    assert.equal(result.developer, '')
    assert.equal(result.legacyTrellisRoot, null)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('.gitignore 模板含 .runtime/、.developer 与 config.local.json/config.local.js 忽略条目', () => {
  const root = makeRoot()
  try {
    const [err] = initWorkloom(root)
    assert.equal(err, null)
    const content = readFileSync(join(root, '.workloom', '.gitignore'), 'utf8')
    assert.ok(content.includes('.runtime/'), 'missing .runtime/ entry')
    assert.ok(content.includes('.developer'), 'missing .developer entry')
    assert.ok(content.includes('config.local.json'), 'missing config.local.json entry')
    assert.ok(content.includes('config.local.js'), 'missing config.local.js entry')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('config.json 模板可被 loadConfig 解析且等于默认值', () => {
  const root = makeRoot()
  const home = makeHome()
  try {
    initWorkloom(root)
    const config = loadConfig(root, { homeDir: home })
    assert.deepEqual(config, DEFAULT_CONFIG)
    assert.equal(config.promptInjection.skipKeyword, 'no-workloom')
  } finally {
    rmSync(root, { recursive: true, force: true })
    rmSync(home, { recursive: true, force: true })
  }
})

test('init 生成 {} 的 config.json、有效 JSON 的 config.example.json 与带注释的 config.example.js', () => {
  const root = makeRoot()
  try {
    const [err] = initWorkloom(root)
    assert.equal(err, null)
    const config = readFileSync(join(root, '.workloom', 'config.json'), 'utf8')
    assert.equal(config.trim(), '{}', 'config.json 应为空对象占位')
    const exampleJson = readFileSync(join(root, '.workloom', 'config.example.json'), 'utf8')
    const doc = JSON.parse(exampleJson) // 必须是合法 JSON
    assert.equal(typeof doc, 'object')
    assert.ok(Array.isArray(doc.subagent_profiles))
    const exampleJs = readFileSync(join(root, '.workloom', 'config.example.js'), 'utf8')
    assert.match(exampleJs, /module\.exports/)
    assert.match(exampleJs, /factory form/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('config.example.json 覆盖 DEFAULT_CONFIG 全部字段键（含 tools，不含 default_package）', () => {
  const root = makeRoot()
  try {
    const [err] = initWorkloom(root)
    assert.equal(err, null)
    const example = readFileSync(join(root, '.workloom', 'config.example.json'), 'utf8')
    const doc = JSON.parse(example)
    const examplePaths = new Set(collectPaths(doc, (key) => key))
    const expectedPaths = collectPaths(DEFAULT_CONFIG, camelToSnake)
    for (const path of expectedPaths) {
      assert.ok(examplePaths.has(path), `missing ${path} in config.example.json`)
    }
    // subagents 必须同时展示 model 的 string 与按 runtime 的 map 双形式。
    for (const path of [
      'subagents.research.model',
      'subagents.research.effort',
      'subagents.implement.model.dsh',
      'subagents.implement.model.pi',
      'subagents.implement.effort',
      'subagents.check.model',
      'subagents.check.effort',
    ]) {
      assert.ok(examplePaths.has(path), `missing ${path} in config.example.json`)
    }
    // 标量示例值与默认值逐项对齐。
    assert.equal(doc.session_commit_message, DEFAULT_CONFIG.sessionCommitMessage)
    assert.equal(doc.max_journal_lines, DEFAULT_CONFIG.maxJournalLines)
    assert.equal(doc.session_auto_commit, DEFAULT_CONFIG.sessionAutoCommit)
    assert.equal(
      doc.context_injection.max_file_bytes,
      DEFAULT_CONFIG.contextInjection.maxFileBytes,
    )
    assert.equal(
      doc.context_injection.max_artifact_bytes,
      DEFAULT_CONFIG.contextInjection.maxArtifactBytes,
    )
    assert.equal(
      doc.context_injection.max_total_bytes,
      DEFAULT_CONFIG.contextInjection.maxTotalBytes,
    )
    assert.equal(doc.prompt_injection.skip_keyword, DEFAULT_CONFIG.promptInjection.skipKeyword)
    assert.equal(doc.packages.cli.path, 'packages/cli')
    // tools 字段在 subagent_profiles 内层展示（includes/excludes 带 lsp_* 前缀模式）。
    const checkEntry = doc.subagent_profiles.find((p) => p.subagents.check !== undefined)
    assert.ok(checkEntry, 'example must show a profile with a check entry')
    assert.deepEqual(checkEntry.subagents.check.tools.includes, ['lsp_diagnostics', 'lsp_*'])
    assert.deepEqual(checkEntry.subagents.check.tools.excludes, ['web_fetch'])
    // default_package 死字段不得出现在示例中。
    assert.equal('default_package' in doc, false, 'config.example.json must not show default_package')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('config.example.js 说明三层合并、工厂形态与全局白名单', () => {
  const root = makeRoot()
  try {
    const [err] = initWorkloom(root)
    assert.equal(err, null)
    const example = readFileSync(join(root, '.workloom', 'config.example.js'), 'utf8')
    assert.match(example, /three layers/)
    assert.match(example, /factory/)
    assert.match(example, /global/)
    assert.match(example, /config\.local\.json/)
    assert.match(example, /top-level key/)
    assert.match(example, /tools/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('已存在 .workloom 且非 force 时返回 err（含已存在路径）', () => {
  const root = makeRoot()
  try {
    const [firstErr] = initWorkloom(root)
    assert.equal(firstErr, null)
    const [err, result] = initWorkloom(root)
    assert.ok(err)
    assert.match(err.message, /already exists/)
    assert.match(err.message, new RegExp(root))
    assert.equal(result, null)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('force 幂等补建且不覆盖已有 config.json', () => {
  const root = makeRoot()
  try {
    mkdirSync(join(root, '.workloom'))
    writeFileSync(join(root, '.workloom', 'config.json'), '{"max_journal_lines": 500}\n')
    const [err, result] = initWorkloom(root, { force: true })
    assert.equal(err, null)
    assert.ok(result)
    assert.equal(
      readFileSync(join(root, '.workloom', 'config.json'), 'utf8'),
      '{"max_journal_lines": 500}\n',
    )
    assert.ok(existsSync(join(root, '.workloom', 'tasks')))
    assert.ok(!result.created.includes('.workloom/config.json'))
    assert.ok(result.created.includes('.workloom/tasks'))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('developer 写入 .workloom/.developer', () => {
  const root = makeRoot()
  try {
    const [err, result] = initWorkloom(root, { developer: 'alice' })
    assert.equal(err, null)
    assert.equal(readFileSync(join(root, '.workloom', '.developer'), 'utf8'), 'alice')
    assert.equal(result.developer, 'alice')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('检测旧 .trellis 目录并在结果中报告', () => {
  const root = makeRoot()
  try {
    mkdirSync(join(root, '.trellis'))
    const [err, result] = initWorkloom(root)
    assert.equal(err, null)
    assert.equal(result.legacyTrellisRoot, root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('spec/README.md 生成且 force 不覆盖已有内容', () => {
  const root = makeRoot()
  try {
    const [err] = initWorkloom(root)
    assert.equal(err, null)
    const readme = join(root, '.workloom', 'spec', 'README.md')
    assert.ok(readFileSync(readme, 'utf8').includes('# workloom spec'))
    writeFileSync(readme, '# team custom\n')
    const [forceErr] = initWorkloom(root, { force: true })
    assert.equal(forceErr, null)
    assert.equal(readFileSync(readme, 'utf8'), '# team custom\n')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('force 幂等不覆盖用户自定义的 .gitignore', () => {
  const root = makeRoot()
  try {
    const [err] = initWorkloom(root)
    assert.equal(err, null)
    const gitignore = join(root, '.workloom', '.gitignore')
    writeFileSync(gitignore, '# team custom\n*.local\n')
    const [forceErr, forceResult] = initWorkloom(root, { force: true })
    assert.equal(forceErr, null)
    assert.ok(forceResult)
    assert.equal(readFileSync(gitignore, 'utf8'), '# team custom\n*.local\n')
    assert.ok(!forceResult.created.includes('.workloom/.gitignore'))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('已有 .workloom 但缺 .gitignore 时 force 补建', () => {
  const root = makeRoot()
  try {
    const [err] = initWorkloom(root)
    assert.equal(err, null)
    rmSync(join(root, '.workloom', '.gitignore'))
    const [forceErr, forceResult] = initWorkloom(root, { force: true })
    assert.equal(forceErr, null)
    assert.ok(forceResult)
    assert.ok(existsSync(join(root, '.workloom', '.gitignore')))
    assert.ok(forceResult.created.includes('.workloom/.gitignore'))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('init developer 白名单校验（非法名报错）', () => {
  const root = mkdtempSync(join(tmpdir(), 'workloom-init-dev-'))
  try {
    const [badErr] = initWorkloom(root, { developer: '小王' })
    assert.ok(badErr)
    assert.match(badErr.message, /invalid developer name/)
    const [dotErr] = initWorkloom(root, { developer: '.hidden' })
    assert.ok(dotErr)
    const [okErr, okResult] = initWorkloom(root, { developer: 'xiao.bei-01' })
    assert.equal(okErr, null)
    assert.equal(readFileSync(join(root, '.workloom', '.developer'), 'utf8'), 'xiao.bei-01')
    assert.equal(okResult.developer, 'xiao.bei-01')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('force 幂等不覆盖已有的 config.example.json / config.example.js', () => {
  const root = makeRoot()
  try {
    const [err] = initWorkloom(root)
    assert.equal(err, null)
    const exampleJson = join(root, '.workloom', 'config.example.json')
    const exampleJs = join(root, '.workloom', 'config.example.js')
    writeFileSync(exampleJson, '# team custom json\n')
    writeFileSync(exampleJs, '# team custom js\n')
    const [forceErr, forceResult] = initWorkloom(root, { force: true })
    assert.equal(forceErr, null)
    assert.ok(forceResult)
    assert.equal(readFileSync(exampleJson, 'utf8'), '# team custom json\n')
    assert.equal(readFileSync(exampleJs, 'utf8'), '# team custom js\n')
    assert.ok(!forceResult.created.includes('.workloom/config.example.json'))
    assert.ok(!forceResult.created.includes('.workloom/config.example.js'))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
