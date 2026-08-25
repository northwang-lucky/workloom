/**
 * 旧 .trellis → .workloom 迁移（行为移植模块，纯 JS + JSDoc）。
 *
 * 设计意图：
 * - 目录迁移采用「递归复制 + 目标已存在则跳过」的幂等合并语义，
 *   migrated 记顶层区域、skipped 记冲突条目明细（均相对项目根）；
 * - config 迁移复用 config.js 的 DEFAULT_CONFIG 形状：解析旧 config.yaml，
 *   提取已知字段、改写 skip_keyword、丢弃未知字段（记入 droppedConfigFields）；
 *   仅当存在非默认值时覆盖新 config.yaml（全默认保持 init 模板不动）；
 * - 旧 workflow.md 定制指引只做存档（.workloom/migrated/trellis-workflow.md），
 *   不自动改写，人工整理成 workflow.override.md；
 * - deleteLegacy=true 才删除旧目录（默认保留），删除目标同样做防逃逸校验；
 * - 所有路径经 resolve 后必须落在对应根内（迁移目录名来自磁盘，仍做 inside 校验）。
 */

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'

import { DEFAULT_CONFIG } from './config.js'
import {
  detectLegacyTrellis,
  findWorkloomRoot,
  insideWorkloom,
  LEGACY_TRELLIS_DIR,
  WORKLOOM_DIR,
} from './locate.js'

/** 错误消息前缀（运行时文案英文）。 */
const ERR_PREFIX = 'workloom migrate'

/** 旧 config.yaml 文件名。 */
const CONFIG_FILE = 'config.yaml'

/** 旧 workflow.md 文件名（定制指引存档源）。 */
const WORKFLOW_FILE = 'workflow.md'

/** 迁移存档子目录（相对 .workloom）。 */
const MIGRATED_DIR = 'migrated'

/** 存档后的 workflow 文件名。 */
const ARCHIVED_WORKFLOW_NAME = 'trellis-workflow.md'

/** 旧逃生舱关键词：迁移时改写为新默认值（no-workloom）。 */
const LEGACY_SKIP_KEYWORD = 'no-trellis'

/** 迁移的顶层目录（相对旧 .trellis 根，目标为同名 .workloom 子目录）。 */
const LEGACY_DIRS = Object.freeze(['tasks', 'workspace', 'spec'])

/** 旧 config.yaml 的已知顶层字段（其余丢弃并记入 droppedConfigFields）。 */
const KNOWN_TOP_FIELDS = new Set([
  'session_commit_message',
  'max_journal_lines',
  'session_auto_commit',
  'hooks',
  'packages',
  'default_package',
  'context_injection',
  'prompt_injection',
])

/**
 * 迁移旧 .trellis 项目到 .workloom（目录复制 + config 映射 + workflow 存档）。
 * @param {string} root 项目根（或根下任意目录）
 * @param {import('./migrate.d.ts').MigrateLegacyTrellisParams} [params] 迁移参数
 * @returns {[Error | null, import('./migrate.d.ts').MigrateLegacyTrellisResult | null]}
 */
export function migrateLegacyTrellis(root, params = {}) {
  try {
    return [null, migrateLegacyTrellisInternal(root, params)]
  } catch (error) {
    return [toError(error), null]
  }
}

/**
 * 迁移（内部实现，失败抛错由外层转元组）。
 * @param {string} root 项目根
 * @param {import('./migrate.d.ts').MigrateLegacyTrellisParams} params 迁移参数
 * @returns {import('./migrate.d.ts').MigrateLegacyTrellisResult}
 */
function migrateLegacyTrellisInternal(root, params) {
  const legacy = detectLegacyTrellis(root)
  if (legacy === null) {
    throw new Error(`${ERR_PREFIX}: no legacy .trellis directory found`)
  }
  const found = findWorkloomRoot(root)
  if (found === null) {
    throw new Error(`${ERR_PREFIX}: run init first (no .workloom directory found)`)
  }
  const projectRoot = found.root
  const legacyRoot = legacy.root
  /** @type {string[]} */
  const migrated = []
  /** @type {string[]} */
  const skipped = []
  /** @type {string[]} */
  const unsupported = []
  for (const dirName of LEGACY_DIRS) {
    const sourceDir = join(legacyRoot, LEGACY_TRELLIS_DIR, dirName)
    if (!existsSync(sourceDir)) continue
    const targetDir = insideWorkloom(projectRoot, dirName)
    const existedBefore = existsSync(targetDir)
    const copied = copyDirRecursive(
      sourceDir,
      targetDir,
      legacyRoot,
      projectRoot,
      skipped,
      unsupported,
    )
    // migrated 记录「本次实际新写入的区域」：全部冲突跳过的区域不算迁移（幂等语义）；
    // 但首次创建的空目录区域（copied=0 且目标此前不存在）仍算迁移。
    if (copied > 0 || !existedBefore) migrated.push(join(WORKLOOM_DIR, dirName))
  }
  /** @type {string[]} */
  const droppedConfigFields = []
  migrateConfig(legacyRoot, projectRoot, droppedConfigFields)
  const archivedWorkflow = archiveWorkflow(legacyRoot, projectRoot, skipped)
  let legacyRemoved = false
  if (params.deleteLegacy === true) {
    removeLegacyDir(legacyRoot)
    legacyRemoved = true
  }
  return {
    migrated,
    skipped,
    unsupported,
    droppedConfigFields,
    archivedWorkflow,
    legacyRemoved,
    legacyRoot,
  }
}

/**
 * 递归复制目录：目标已存在同名条目则跳过并记入 skipped；只复制文件与目录。
 * @param {string} sourceDir 源目录
 * @param {string} targetDir 目标目录（.workloom 内）
 * @param {string} sourceRoot 旧 .trellis 所在根（源防逃逸基准）
 * @param {string} projectRoot 项目根（目标防逃逸基准、skipped 相对路径基准）
 * @param {string[]} skipped 冲突条目收集（相对 projectRoot 的目标路径）
 * @param {string[]} unsupported 符号链接等不支持条目收集（相对 projectRoot 的目标路径）
 * @returns {number} 本次实际新复制的条目数（文件与子目录均计数，幂等判定用）
 */
function copyDirRecursive(sourceDir, targetDir, sourceRoot, projectRoot, skipped, unsupported) {
  mkdirSync(targetDir, { recursive: true })
  let copied = 0
  for (const entry of readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = join(sourceDir, entry.name)
    const targetPath = join(targetDir, entry.name)
    // 目录名来自磁盘，仍做防逃逸校验（正常情况恒真）。
    assertInside(sourceRoot, sourcePath, 'legacy source')
    assertInside(projectRoot, targetPath, 'migration target')
    if (existsSync(targetPath)) {
      skipped.push(relative(projectRoot, targetPath))
      continue
    }
    if (entry.isDirectory()) {
      copied += copyDirRecursive(
        sourcePath,
        targetPath,
        sourceRoot,
        projectRoot,
        skipped,
        unsupported,
      )
    } else if (entry.isFile()) {
      copyFileSync(sourcePath, targetPath)
      copied += 1
    } else {
      // 符号链接等既非文件也非目录的条目：显式记入 unsupported，不做无痕丢弃。
      unsupported.push(relative(projectRoot, targetPath))
    }
  }
  return copied
}

/**
 * 校验解析后的目标路径落在根内（防路径逃逸）。
 * @param {string} root 基准根
 * @param {string} target 待校验路径
 * @param {string} what 用途描述（错误消息用）
 */
function assertInside(root, target, what) {
  const base = resolve(root)
  const resolved = resolve(target)
  if (resolved !== base && !resolved.startsWith(base + '/')) {
    throw new Error(`${ERR_PREFIX}: ${what} escapes project root: ${target}`)
  }
}

/** @param {unknown} value @returns {Error} */
function toError(value) {
  return value instanceof Error ? value : new Error(String(value))
}

/**
 * 迁移旧 config.yaml：提取已知字段、改写 skip_keyword、丢弃未知字段；
 * 仅当存在非默认值时覆盖新 config.yaml（全默认保持 init 模板不动）。
 * @param {string} legacyRoot 旧 .trellis 所在根
 * @param {string} projectRoot 项目根
 * @param {string[]} droppedConfigFields 被丢弃的未知字段名收集
 */
function migrateConfig(legacyRoot, projectRoot, droppedConfigFields) {
  const legacyConfigFile = join(legacyRoot, LEGACY_TRELLIS_DIR, CONFIG_FILE)
  if (!existsSync(legacyConfigFile)) return
  const raw = readFileSync(legacyConfigFile, 'utf8')
  let doc
  try {
    doc = parseYaml(raw) ?? {}
  } catch (error) {
    throw new Error(`${ERR_PREFIX}: failed to parse legacy config.yaml: ${String(error)}`, {
      cause: error,
    })
  }
  if (typeof doc !== 'object' || Array.isArray(doc)) {
    throw new Error(`${ERR_PREFIX}: legacy config.yaml must be an object map`)
  }
  for (const key of Object.keys(doc)) {
    if (!KNOWN_TOP_FIELDS.has(key)) droppedConfigFields.push(key)
  }
  const mapped = collectNonDefault(mapKnownFields(doc, droppedConfigFields))
  if (Object.keys(mapped).length === 0) return
  writeFileSync(join(projectRoot, WORKLOOM_DIR, CONFIG_FILE), stringifyYaml(mapped))
}

/**
 * 把旧 config 文档的已知字段映射到新配置形状（camelCase），
 * skip_keyword 旧值 'no-trellis' 改写为新默认值，其余值透传；
 * 类型不合法的值记入 droppedConfigFields 并跳过（不把坏值写进新配置）。
 * @param {Record<string, unknown>} doc 旧 config 文档
 * @param {string[]} droppedConfigFields 被丢弃字段名收集
 * @returns {import('./config.d.ts').WorkloomConfig}
 */
function mapKnownFields(doc, droppedConfigFields) {
  const config = structuredClone(DEFAULT_CONFIG)
  if (doc.session_commit_message !== undefined) {
    if (typeof doc.session_commit_message === 'string') {
      config.sessionCommitMessage = doc.session_commit_message
    } else {
      droppedConfigFields.push('session_commit_message')
    }
  }
  if (doc.max_journal_lines !== undefined) {
    if (
      typeof doc.max_journal_lines === 'number' &&
      Number.isInteger(doc.max_journal_lines) &&
      doc.max_journal_lines > 0
    ) {
      config.maxJournalLines = doc.max_journal_lines
    } else {
      droppedConfigFields.push('max_journal_lines')
    }
  }
  if (doc.session_auto_commit !== undefined) {
    if (typeof doc.session_auto_commit === 'boolean') {
      config.sessionAutoCommit = doc.session_auto_commit
    } else {
      droppedConfigFields.push('session_auto_commit')
    }
  }
  const ci = doc.context_injection
  if (isMap(ci)) {
    for (const [key, targetKey] of CI_FIELD_MAP) {
      const value = ci[key]
      if (value === undefined) continue
      if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
        config.contextInjection[targetKey] = value
      } else {
        droppedConfigFields.push(`context_injection.${key}`)
      }
    }
  }
  const pi = doc.prompt_injection
  if (isMap(pi) && pi.skip_keyword !== undefined) {
    if (typeof pi.skip_keyword === 'string') {
      config.promptInjection.skipKeyword =
        pi.skip_keyword === LEGACY_SKIP_KEYWORD
          ? DEFAULT_CONFIG.promptInjection.skipKeyword
          : pi.skip_keyword
    } else {
      droppedConfigFields.push('prompt_injection.skip_keyword')
    }
  }
  const hooks = doc.hooks
  if (isMap(hooks)) {
    for (const [key, targetKey] of HOOK_FIELD_MAP) {
      const value = hooks[key]
      if (value === undefined) continue
      if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
        config.hooks[targetKey] = value
      } else {
        droppedConfigFields.push(`hooks.${key}`)
      }
    }
  }
  if (doc.packages !== undefined) {
    if (!isMap(doc.packages)) {
      droppedConfigFields.push('packages')
    } else {
      // 逐项浅校验：值必须含 path 字符串；坏项整字段丢弃（不把坏值写进新配置）。
      let valid = true
      for (const value of Object.values(doc.packages)) {
        if (!isMap(value) || typeof value.path !== 'string') {
          valid = false
          break
        }
      }
      if (valid) {
        config.packages =
          /** @type {Record<string, {path: string, type?: string, git?: boolean}>} */ (doc.packages)
      } else {
        droppedConfigFields.push('packages')
      }
    }
  }
  if (doc.default_package !== undefined) {
    if (typeof doc.default_package === 'string') {
      config.defaultPackage = doc.default_package
    } else {
      droppedConfigFields.push('default_package')
    }
  }
  return config
}

/**
 * context_injection 的 snake_case → camelCase 字段映射（元组常量，类型收窄用）。
 * @type {readonly (readonly [string, 'maxFileBytes' | 'maxArtifactBytes' | 'maxTotalBytes'])[]}
 */
const CI_FIELD_MAP = [
  ['max_file_bytes', 'maxFileBytes'],
  ['max_artifact_bytes', 'maxArtifactBytes'],
  ['max_total_bytes', 'maxTotalBytes'],
]

/**
 * hooks 的 snake_case → camelCase 字段映射（元组常量，类型收窄用）。
 * @type {readonly (readonly [string, 'afterCreate' | 'afterStart' | 'afterFinish' | 'afterArchive'])[]}
 */
const HOOK_FIELD_MAP = [
  ['after_create', 'afterCreate'],
  ['after_start', 'afterStart'],
  ['after_finish', 'afterFinish'],
  ['after_archive', 'afterArchive'],
]

/** @param {unknown} value @returns {value is Record<string, unknown>} 是否对象映射 */
function isMap(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 提取与默认值不同的字段，组装成 snake_case 的 YAML 文档（全默认则返回空对象）。
 * @param {import('./config.d.ts').WorkloomConfig} config 映射后的配置
 * @returns {Record<string, unknown>}
 */
function collectNonDefault(config) {
  /** @type {Record<string, unknown>} */
  const doc = {}
  if (config.sessionCommitMessage !== DEFAULT_CONFIG.sessionCommitMessage) {
    doc.session_commit_message = config.sessionCommitMessage
  }
  if (config.maxJournalLines !== DEFAULT_CONFIG.maxJournalLines) {
    doc.max_journal_lines = config.maxJournalLines
  }
  if (config.sessionAutoCommit !== DEFAULT_CONFIG.sessionAutoCommit) {
    doc.session_auto_commit = config.sessionAutoCommit
  }
  /** @type {Record<string, unknown>} */
  const ci = {}
  if (config.contextInjection.maxFileBytes !== DEFAULT_CONFIG.contextInjection.maxFileBytes) {
    ci.max_file_bytes = config.contextInjection.maxFileBytes
  }
  if (
    config.contextInjection.maxArtifactBytes !== DEFAULT_CONFIG.contextInjection.maxArtifactBytes
  ) {
    ci.max_artifact_bytes = config.contextInjection.maxArtifactBytes
  }
  if (config.contextInjection.maxTotalBytes !== DEFAULT_CONFIG.contextInjection.maxTotalBytes) {
    ci.max_total_bytes = config.contextInjection.maxTotalBytes
  }
  if (Object.keys(ci).length > 0) doc.context_injection = ci
  if (config.promptInjection.skipKeyword !== DEFAULT_CONFIG.promptInjection.skipKeyword) {
    doc.prompt_injection = { skip_keyword: config.promptInjection.skipKeyword }
  }
  /** @type {Record<string, unknown>} */
  const hooks = {}
  if (!arraysEqual(config.hooks.afterCreate, DEFAULT_CONFIG.hooks.afterCreate)) {
    hooks.after_create = config.hooks.afterCreate
  }
  if (!arraysEqual(config.hooks.afterStart, DEFAULT_CONFIG.hooks.afterStart)) {
    hooks.after_start = config.hooks.afterStart
  }
  if (!arraysEqual(config.hooks.afterFinish, DEFAULT_CONFIG.hooks.afterFinish)) {
    hooks.after_finish = config.hooks.afterFinish
  }
  if (!arraysEqual(config.hooks.afterArchive, DEFAULT_CONFIG.hooks.afterArchive)) {
    hooks.after_archive = config.hooks.afterArchive
  }
  if (Object.keys(hooks).length > 0) doc.hooks = hooks
  if (Object.keys(config.packages).length > 0) doc.packages = config.packages
  if (config.defaultPackage !== DEFAULT_CONFIG.defaultPackage) {
    doc.default_package = config.defaultPackage
  }
  return doc
}

/** @param {string[]} a @param {string[]} b @returns {boolean} 数组逐项相等 */
function arraysEqual(a, b) {
  if (a.length !== b.length) return false
  return a.every((item, index) => item === b[index])
}

/**
 * 存档旧 workflow.md 到 .workloom/migrated/trellis-workflow.md；目标已存在则跳过。
 * @param {string} legacyRoot 旧 .trellis 所在根
 * @param {string} projectRoot 项目根
 * @param {string[]} skipped 冲突条目收集
 * @returns {string | null} 存档相对路径（无旧 workflow.md 时为 null）
 */
function archiveWorkflow(legacyRoot, projectRoot, skipped) {
  const legacyWorkflowFile = join(legacyRoot, LEGACY_TRELLIS_DIR, WORKFLOW_FILE)
  if (!existsSync(legacyWorkflowFile)) return null
  const rel = join(WORKLOOM_DIR, MIGRATED_DIR, ARCHIVED_WORKFLOW_NAME)
  const target = insideWorkloom(projectRoot, join(MIGRATED_DIR, ARCHIVED_WORKFLOW_NAME))
  if (existsSync(target)) {
    skipped.push(rel)
    return rel
  }
  mkdirSync(dirname(target), { recursive: true })
  copyFileSync(legacyWorkflowFile, target)
  return rel
}

/**
 * 删除旧 .trellis 目录：以 legacyRoot（来自 detectLegacyTrellis 的可信结果）为基准，
 * 仅校验目标名确为 .trellis，允许 legacy 位于项目根父目录的合法场景。
 * @param {string} legacyRoot 旧 .trellis 所在根
 */
function removeLegacyDir(legacyRoot) {
  const legacyDir = resolve(legacyRoot, LEGACY_TRELLIS_DIR)
  if (basename(legacyDir) !== LEGACY_TRELLIS_DIR) {
    throw new Error(`${ERR_PREFIX}: legacy delete target is not .trellis: ${legacyDir}`)
  }
  rmSync(legacyDir, { recursive: true, force: true })
}
