/**
 * .workloom/config.yaml 解析（行为移植模块，纯 JS + JSDoc）。
 *
 * 设计意图：
 * - 字段与默认值对齐原 Trellis 的 config.yaml 规格（数据格式兼容），
 *   文案与实现全新撰写（clean-room）；
 * - 解析失败显式抛错（fail loud），不静默回退，符合“无灰区”哲学；
 * - 未知字段容错忽略（如 channel/codex 等原平台特定字段），向前兼容；
 * - 逃生舱关键词默认改为 no-workloom（原为 no-trellis）。
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse as parseYaml } from 'yaml'

/** 内置默认配置（与规格一致）。 */
/** @type {import('./config.d.ts').WorkloomConfig} */
export const DEFAULT_CONFIG = {
  sessionCommitMessage: 'chore: record journal',
  maxJournalLines: 2000,
  sessionAutoCommit: true,
  contextInjection: {
    maxFileBytes: 32768,
    maxArtifactBytes: 65536,
    maxTotalBytes: 131072,
  },
  promptInjection: {
    skipKeyword: 'no-workloom',
  },
  hooks: {
    afterCreate: [],
    afterStart: [],
    afterFinish: [],
    afterArchive: [],
  },
  packages: {},
  defaultPackage: null,
}

/** 布尔值合法写法（大小写不敏感），行为对齐原规格。 */
const BOOLEAN_WORDS = new Map([
  ['true', true], ['yes', true], ['1', true], ['on', true],
  ['false', false], ['no', false], ['0', false], ['off', false],
])

/**
 * 配置解析错误：携带字段路径，便于上层显式报告。
 */
export class WorkloomConfigError extends Error {
  /**
   * @param {string} field 出错字段的路径（如 context_injection.max_file_bytes）
   * @param {string} reason 具体原因
   */
  constructor(field, reason) {
    super(`workloom config: ${field}: ${reason}`)
    this.name = 'WorkloomConfigError'
    this.field = field
  }
}

/**
 * 从项目根加载配置；config.yaml 缺失时返回全默认。
 * @param {string} root 项目根目录
 * @returns {import('./config.d.ts').WorkloomConfig} 合并默认后的配置对象
 */
export function loadConfig(root) {
  const file = join(root, '.workloom', 'config.yaml')
  let raw
  try {
    raw = readFileSync(file, 'utf8')
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT') {
      return structuredClone(DEFAULT_CONFIG)
    }
    throw error
  }
  let doc
  try {
    doc = parseYaml(raw) ?? {}
  } catch (error) {
    throw new WorkloomConfigError('<yaml>', `解析失败: ${String(error)}`)
  }
  if (typeof doc !== 'object' || Array.isArray(doc)) {
    throw new WorkloomConfigError('<root>', '必须是对象映射')
  }
  return mergeWithDefaults(doc)
}

/**
 * 把用户文档合并进默认值，逐字段校验。
 * @param {Record<string, unknown>} doc 用户 YAML 文档
 * @returns {import('./config.d.ts').WorkloomConfig}
 */
function mergeWithDefaults(doc) {
  const config = structuredClone(DEFAULT_CONFIG)

  if (doc.session_commit_message !== undefined) {
    config.sessionCommitMessage = requireString('session_commit_message', doc.session_commit_message)
  }
  if (doc.max_journal_lines !== undefined) {
    config.maxJournalLines = requirePositiveInt('max_journal_lines', doc.max_journal_lines)
  }
  if (doc.session_auto_commit !== undefined) {
    config.sessionAutoCommit = requireBoolean('session_auto_commit', doc.session_auto_commit)
  }
  if (doc.context_injection !== undefined) {
    const ci = requireMap('context_injection', doc.context_injection)
    if (ci.max_file_bytes !== undefined) {
      config.contextInjection.maxFileBytes = requireNonNegativeInt('context_injection.max_file_bytes', ci.max_file_bytes)
    }
    if (ci.max_artifact_bytes !== undefined) {
      config.contextInjection.maxArtifactBytes = requireNonNegativeInt('context_injection.max_artifact_bytes', ci.max_artifact_bytes)
    }
    if (ci.max_total_bytes !== undefined) {
      config.contextInjection.maxTotalBytes = requireNonNegativeInt('context_injection.max_total_bytes', ci.max_total_bytes)
    }
  }
  if (doc.prompt_injection !== undefined) {
    const pi = requireMap('prompt_injection', doc.prompt_injection)
    if (pi.skip_keyword !== undefined) {
      config.promptInjection.skipKeyword = requireString('prompt_injection.skip_keyword', pi.skip_keyword)
    }
  }
  if (doc.hooks !== undefined) {
    const hooks = requireMap('hooks', doc.hooks)
    config.hooks.afterCreate = requireStringList('hooks.after_create', hooks.after_create)
    config.hooks.afterStart = requireStringList('hooks.after_start', hooks.after_start)
    config.hooks.afterFinish = requireStringList('hooks.after_finish', hooks.after_finish)
    config.hooks.afterArchive = requireStringList('hooks.after_archive', hooks.after_archive)
  }
  if (doc.packages !== undefined) {
    config.packages = parsePackages(doc.packages)
  }
  if (doc.default_package !== undefined) {
    config.defaultPackage = requireString('default_package', doc.default_package)
  }
  return config
}

/**
 * 校验 packages 映射：每个值是含 path 字符串的对象，可带 type/git 标注。
 * @param {unknown} value 用户文档中的 packages 字段
 * @returns {Record<string, {path: string, type?: string, git?: boolean}>}
 */
function parsePackages(value) {
  const map = requireMap('packages', value)
  /** @type {Record<string, {path: string, type?: string, git?: boolean}>} */
  const result = {}
  for (const [name, entry] of Object.entries(map)) {
    const spec = requireMap(`packages.${name}`, entry)
    const path = requireString(`packages.${name}.path`, spec.path ?? '.')
    /** @type {{path: string, type?: string, git?: boolean}} */
    const parsed = { path }
    if (spec.type !== undefined) parsed.type = requireString(`packages.${name}.type`, spec.type)
    if (spec.git !== undefined) parsed.git = requireBoolean(`packages.${name}.git`, spec.git)
    result[name] = parsed
  }
  return result
}

/** @param {string} field @param {unknown} value @returns {string} */
function requireString(field, value) {
  if (typeof value !== 'string') throw new WorkloomConfigError(field, '必须是字符串')
  return value
}

/** @param {string} field @param {unknown} value @returns {number} */
function requirePositiveInt(field, value) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new WorkloomConfigError(field, '必须是正整数')
  }
  return value
}

/** @param {string} field @param {unknown} value @returns {number} */
function requireNonNegativeInt(field, value) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new WorkloomConfigError(field, '必须是非负整数（0 表示不限制）')
  }
  return value
}

/** @param {string} field @param {unknown} value @returns {boolean} */
function requireBoolean(field, value) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string' && BOOLEAN_WORDS.has(value.toLowerCase())) {
    return /** @type {boolean} */ (BOOLEAN_WORDS.get(value.toLowerCase()))
  }
  if (typeof value === 'number' && (value === 1 || value === 0)) {
    return value === 1
  }
  throw new WorkloomConfigError(field, '必须是布尔值（或 true/false/yes/no/1/0/on/off）')
}

/** @param {string} field @param {unknown} value @returns {Record<string, unknown>} */
function requireMap(field, value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new WorkloomConfigError(field, '必须是对象映射')
  }
  return /** @type {Record<string, unknown>} */ (value)
}

/** @param {string} field @param {unknown} value @returns {string[]} */
function requireStringList(field, value) {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new WorkloomConfigError(field, '必须是字符串数组')
  }
  return /** @type {string[]} */ (value)
}
