/**
 * init 模块单测：骨架生成、config 模板可解析、幂等、developer 写入、.gitignore 生成、legacy 检测。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { initWorkloom } from '../dist/legacy/init.js'
import { DEFAULT_CONFIG, loadConfig } from '../dist/legacy/config.js'
import { parse as parseYaml } from 'yaml'

/** 完整骨架路径清单（相对 root，与实现创建顺序一致）。 */
const SKELETON = [
  '.workloom',
  '.workloom/tasks',
  '.workloom/spec',
  '.workloom/workspace',
  '.workloom/.runtime/sessions',
  '.workloom/spec/README.md',
  '.workloom/config.yaml',
  '.workloom/config.example.yaml',
  '.workloom/.developer',
  '.workloom/.gitignore',
]

function makeRoot() {
  return mkdtempSync(join(tmpdir(), 'workloom-init-'))
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

/**
 * 从全注释模板提取配置文档：剥掉注释前缀，仅保留键/列表行后解析 YAML（散文行剔除）。
 * @param {string} text 模板原文
 * @returns {Record<string, unknown>} 解析出的配置文档
 */
function parseCommentTemplate(text) {
  const lines = []
  for (const raw of text.split('\n')) {
    const line = raw.replace(/^# ?/, '')
    const trimmed = line.trim()
    if (trimmed === '' || /^[A-Za-z_][\w]*:/.test(trimmed) || /^- /.test(trimmed)) {
      lines.push(line)
    }
  }
  return /** @type {Record<string, unknown>} */ (parseYaml(lines.join('\n')) ?? {})
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

test('.gitignore 模板含 .runtime/、.developer 与 config.local.yaml 忽略条目', () => {
  const root = makeRoot()
  try {
    const [err] = initWorkloom(root)
    assert.equal(err, null)
    const content = readFileSync(join(root, '.workloom', '.gitignore'), 'utf8')
    assert.ok(content.includes('.runtime/'), 'missing .runtime/ entry')
    assert.ok(content.includes('.developer'), 'missing .developer entry')
    assert.ok(content.includes('config.local.yaml'), 'missing config.local.yaml entry')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('config.yaml 模板可被 loadConfig 解析且等于默认值', () => {
  const root = makeRoot()
  try {
    initWorkloom(root)
    const config = loadConfig(root)
    assert.deepEqual(config, DEFAULT_CONFIG)
    assert.equal(config.promptInjection.skipKeyword, 'no-workloom')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('init 生成无注释 config.yaml 与全注释 config.example.yaml', () => {
  const root = makeRoot()
  try {
    const [err] = initWorkloom(root)
    assert.equal(err, null)
    const config = readFileSync(join(root, '.workloom', 'config.yaml'), 'utf8')
    assert.equal(config.trim(), '', 'config.yaml 应为无注释空占位')
    const example = readFileSync(join(root, '.workloom', 'config.example.yaml'), 'utf8')
    assert.match(example, /^# workloom configuration reference/)
    assert.ok(
      example.split('\n').every((line) => line === '' || line.startsWith('#')),
      'config.example.yaml 每一行都应为注释或空行',
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('config.example.yaml 覆盖 DEFAULT_CONFIG 全部字段键', () => {
  const root = makeRoot()
  try {
    const [err] = initWorkloom(root)
    assert.equal(err, null)
    const example = readFileSync(join(root, '.workloom', 'config.example.yaml'), 'utf8')
    const doc = parseCommentTemplate(example)
    const examplePaths = new Set(collectPaths(doc, (key) => key))
    const expectedPaths = collectPaths(DEFAULT_CONFIG, camelToSnake)
    for (const path of expectedPaths) {
      assert.ok(examplePaths.has(path), `missing ${path} in config.example.yaml`)
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
      assert.ok(examplePaths.has(path), `missing ${path} in config.example.yaml`)
    }
    // 标量示例值与默认值逐项对齐（空数组/空映射字段按示例值形态展示）。
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
    // executor 写门禁字段已整体移除：模板不得再输出 executor.gate 说明。
    assert.equal(doc.executor, undefined, 'config.example.yaml must not document executor')
    // hooks 四钩子带示例命令；packages/default_package 带示例值。
    for (const hook of ['after_create', 'after_start', 'after_finish', 'after_archive']) {
      assert.ok(
        Array.isArray(doc.hooks[hook]) && /** @type {unknown[]} */ (doc.hooks[hook]).length > 0,
        `hooks.${hook} needs a sample command`,
      )
    }
    assert.equal(doc.packages.cli.path, 'packages/cli')
    assert.equal(doc.default_package, 'web')
    assert.equal(typeof doc.subagents.research.model, 'string')
    assert.equal(typeof doc.subagents.implement.model.dsh, 'string')
    assert.equal(typeof doc.subagents.implement.model.pi, 'string')
    assert.equal(typeof doc.subagents.check.model, 'string')
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

test('force 幂等补建且不覆盖已有 config.yaml', () => {
  const root = makeRoot()
  try {
    mkdirSync(join(root, '.workloom'))
    writeFileSync(join(root, '.workloom', 'config.yaml'), 'max_journal_lines: 500\n')
    const [err, result] = initWorkloom(root, { force: true })
    assert.equal(err, null)
    assert.ok(result)
    assert.equal(
      readFileSync(join(root, '.workloom', 'config.yaml'), 'utf8'),
      'max_journal_lines: 500\n',
    )
    assert.ok(existsSync(join(root, '.workloom', 'tasks')))
    assert.ok(!result.created.includes('.workloom/config.yaml'))
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

test('config.example.yaml 说明 config.local.yaml 深合并与 subagents map 缺 key fail loud', () => {
  const root = makeRoot()
  try {
    const [err] = initWorkloom(root)
    assert.equal(err, null)
    const example = readFileSync(join(root, '.workloom', 'config.example.yaml'), 'utf8')
    assert.match(example, /config\.local\.yaml/)
    assert.match(example, /deep-merge/)
    assert.match(example, /fails loudly/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('force 幂等不覆盖已有的 config.example.yaml', () => {
  const root = makeRoot()
  try {
    const [err] = initWorkloom(root)
    assert.equal(err, null)
    const example = join(root, '.workloom', 'config.example.yaml')
    writeFileSync(example, '# team custom\n')
    const [forceErr, forceResult] = initWorkloom(root, { force: true })
    assert.equal(forceErr, null)
    assert.ok(forceResult)
    assert.equal(readFileSync(example, 'utf8'), '# team custom\n')
    assert.ok(!forceResult.created.includes('.workloom/config.example.yaml'))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
