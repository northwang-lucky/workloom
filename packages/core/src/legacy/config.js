/**
 * .workloom/config.yaml 解析（行为移植模块，纯 JS + JSDoc）。
 *
 * 设计意图：
 * - 字段与默认值为既有数据布局约定（数据格式兼容），文案自撰；
 * - 解析失败显式抛错（fail loud），不静默回退，符合“无灰区”哲学；
 * - 未知字段容错忽略（如 channel/codex 等历史平台特定字段），向前兼容；
 * - config.local.yaml 为本地覆盖层：存在时深合并覆盖 config.yaml
 *   （map 按 key 递归合并，数组/标量整体替换）；
 * - 逃生舱关键词为 no-workloom；
 * - executor 派发参数与 subagents 配置的冲突检测与 force 校验
 *   （detectExecutorConflicts/assertForceReason），提示文案 buildConflictNotice。
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
  subagents: {},
  executor: {
    gate: true,
  },
}

/** 布尔值合法写法（大小写不敏感），行为对齐原规格。 */
const BOOLEAN_WORDS = new Map([
  ['true', true],
  ['yes', true],
  ['1', true],
  ['on', true],
  ['false', false],
  ['no', false],
  ['0', false],
  ['off', false],
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
 * 从项目根加载配置；config.yaml 缺失时以空文档起底（叠加 local 后仍可全默认）。
 * config.local.yaml 存在时深合并覆盖 config.yaml（map 按 key 递归、其余替换）。
 * @param {string} root 项目根目录
 * @returns {import('./config.d.ts').WorkloomConfig} 合并默认后的配置对象
 */
export function loadConfig(root) {
  const dir = join(root, '.workloom')
  const base = readConfigDoc(join(dir, 'config.yaml'), '<yaml>', '<root>') ?? {}
  const overlay = readConfigDoc(
    join(dir, 'config.local.yaml'),
    '<config.local.yaml>',
    '<config.local.yaml>',
  )
  const doc = overlay === undefined ? base : deepMerge(base, overlay)
  return mergeWithDefaults(doc)
}

/**
 * 读取单个 YAML 配置文档：ENOENT 视为缺失返回 undefined；
 * 解析失败/根非 map 抛 WorkloomConfigError（fail loud，不静默回退）。
 * @param {string} file 配置文件路径
 * @param {string} parseField 解析失败时的字段标签
 * @param {string} rootField 根非 map 时的字段标签
 * @returns {Record<string, unknown> | undefined}
 */
function readConfigDoc(file, parseField, rootField) {
  let raw
  try {
    raw = readFileSync(file, 'utf8')
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT') {
      return undefined
    }
    throw error
  }
  let doc
  try {
    doc = parseYaml(raw) ?? {}
  } catch (error) {
    throw new WorkloomConfigError(parseField, `parse failed: ${String(error)}`)
  }
  if (typeof doc !== 'object' || Array.isArray(doc)) {
    throw new WorkloomConfigError(rootField, 'must be an object map')
  }
  return /** @type {Record<string, unknown>} */ (doc)
}

/**
 * 深合并两份配置文档：两边同为 plain object 时按 key 递归合并，
 * 其余情况（数组/标量/null）overlay 整体替换。纯函数，不修改入参。
 * @param {Record<string, unknown>} base 底层文档（config.yaml）
 * @param {Record<string, unknown>} overlay 覆盖层文档（config.local.yaml）
 * @returns {Record<string, unknown>}
 */
function deepMerge(base, overlay) {
  /** @type {Record<string, unknown>} */
  const result = { ...base }
  for (const [key, value] of Object.entries(overlay)) {
    const current = result[key]
    if (isPlainObject(current) && isPlainObject(value)) {
      result[key] = deepMerge(current, value)
    } else {
      result[key] = value
    }
  }
  return result
}

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 把用户文档合并进默认值，逐字段校验。
 * @param {Record<string, unknown>} doc 用户 YAML 文档
 * @returns {import('./config.d.ts').WorkloomConfig}
 */
function mergeWithDefaults(doc) {
  const config = structuredClone(DEFAULT_CONFIG)

  if (doc.session_commit_message !== undefined) {
    config.sessionCommitMessage = requireString(
      'session_commit_message',
      doc.session_commit_message,
    )
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
      config.contextInjection.maxFileBytes = requireNonNegativeInt(
        'context_injection.max_file_bytes',
        ci.max_file_bytes,
      )
    }
    if (ci.max_artifact_bytes !== undefined) {
      config.contextInjection.maxArtifactBytes = requireNonNegativeInt(
        'context_injection.max_artifact_bytes',
        ci.max_artifact_bytes,
      )
    }
    if (ci.max_total_bytes !== undefined) {
      config.contextInjection.maxTotalBytes = requireNonNegativeInt(
        'context_injection.max_total_bytes',
        ci.max_total_bytes,
      )
    }
  }
  if (doc.prompt_injection !== undefined) {
    const pi = requireMap('prompt_injection', doc.prompt_injection)
    if (pi.skip_keyword !== undefined) {
      config.promptInjection.skipKeyword = requireString(
        'prompt_injection.skip_keyword',
        pi.skip_keyword,
      )
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
  if (doc.subagents !== undefined) {
    config.subagents = parseSubagents(doc.subagents)
  }
  if (doc.executor !== undefined) {
    const executor = requireMap('executor', doc.executor)
    if (executor.gate !== undefined) {
      config.executor.gate = requireBoolean('executor.gate', executor.gate)
    }
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

/**
 * 校验 subagents 映射：每个值是含可选 model/effort 的对象，key 不限集合
 * （不对 executor kind 白名单校验，可容纳未来新增 kind / 拼写错误）。
 * model 支持两种形式：string（所有 runtime 同值）或按 runtime 取值的 map
 * （map 的 key 同样不白名单，与 kind 约定一致）。
 * @param {unknown} value 用户文档中的 subagents 字段
 * @returns {Record<string, {model?: string | Record<string, string>, effort?: string}>}
 */
function parseSubagents(value) {
  const map = requireMap('subagents', value)
  /** @type {Record<string, {model?: string | Record<string, string>, effort?: string}>} */
  const result = {}
  for (const [name, entry] of Object.entries(map)) {
    const spec = requireMap(`subagents.${name}`, entry)
    /** @type {{model?: string | Record<string, string>, effort?: string}} */
    const parsed = {}
    if (spec.model !== undefined) {
      parsed.model = parseSubagentModel(`subagents.${name}.model`, spec.model)
    }
    if (spec.effort !== undefined) {
      parsed.effort = requireString(`subagents.${name}.effort`, spec.effort)
    }
    result[name] = parsed
  }
  return result
}

/**
 * 解析 subagents.<kind>.model：string 原样返回；map 逐个校验 value 为 string。
 * runtime 取值语义在 resolveSubagentDefaults 消费端（loadConfig 保持 runtime 无关）。
 * @param {string} field 字段路径（subagents.<kind>.model）
 * @param {unknown} value 用户文档值
 * @returns {string | Record<string, string>}
 */
function parseSubagentModel(field, value) {
  if (typeof value === 'string') return value
  if (!isPlainObject(value)) {
    throw new WorkloomConfigError(field, 'must be a string or a per-runtime map')
  }
  /** @type {Record<string, string>} */
  const result = {}
  for (const [runtime, model] of Object.entries(value)) {
    result[runtime] = requireString(`${field}.${runtime}`, model)
  }
  return result
}

/**
 * 合并 executor 子代理默认 model/effort：工具调用参数优先，未出现的字段回退到
 * subagents 配置（按 kind 对应条目）；entry 缺失时字段为 undefined。model 与
 * effort 独立合并。model 的 map 形式按 runtime 取值，缺当前 runtime 的 key 时
 * fail loud（避免静默用错模型）。纯同步、无副作用（不修改入参）。
 * @param {import('./config.d.ts').WorkloomConfig} config 配置对象
 * @param {string} kind executor 类型（research/implement/check）
 * @param {{model?: string, effort?: string}} overrides 工具调用参数（仅覆盖出现的字段）
 * @param {string} [runtime] 当前 runtime 名（entry.model 为 map 形式时必填）
 * @returns {import('./config.d.ts').ResolveSubagentDefaultsResult} 合并结果与字段来源
 */
export function resolveSubagentDefaults(config, kind, overrides, runtime) {
  const entry = config.subagents[kind]
  const model = overrides.model ?? resolveEntryModel(kind, entry, runtime)
  const effort = overrides.effort ?? entry?.effort
  return {
    model,
    effort,
    sources: {
      model: overrides.model !== undefined ? 'param' : model !== undefined ? 'config' : undefined,
      effort:
        overrides.effort !== undefined ? 'param' : effort !== undefined ? 'config' : undefined,
    },
  }
}

/**
 * 解析 subagents entry 的 model 字段：string 原样返回；map 按 runtime 取值，
 * 缺 key 抛错（fail loud）。runtime 未提供但 model 为 map 时同样抛错。
 * @param {string} kind executor 类型
 * @param {{model?: string | Record<string, string>, effort?: string} | undefined} entry
 * @param {string | undefined} runtime 当前 runtime 名
 * @returns {string | undefined}
 */
function resolveEntryModel(kind, entry, runtime) {
  const model = entry?.model
  if (model === undefined || typeof model === 'string') return model
  if (runtime === undefined) {
    throw new WorkloomConfigError(
      `subagents.${kind}.model`,
      'is a per-runtime map but no runtime was provided',
    )
  }
  const resolved = model[runtime]
  if (resolved === undefined) {
    throw new WorkloomConfigError(
      `subagents.${kind}.model`,
      `missing entry for runtime "${runtime}"`,
    )
  }
  return resolved
}

/**
 * 拆分 model 字符串的 provider 前缀：按首个 `/` 切分；无 `/` 时返回裸 model
 * （provider 为 undefined，语义 = 按父会话 provider 解析）。adapter 据此把
 * provider 一并传给运行时，跨 provider 派发才不会解析失败。
 * @param {string} model 模型标识（可带 provider/ 前缀）
 * @returns {{provider?: string, model: string}}
 */
export function splitProviderModel(model) {
  if (typeof model !== 'string' || model === '') {
    throw new Error('splitProviderModel: model must be a non-empty string')
  }
  const slash = model.indexOf('/')
  if (slash === -1) return { model }
  const provider = model.slice(0, slash)
  const rest = model.slice(slash + 1)
  if (provider === '' || rest === '') {
    throw new Error(`splitProviderModel: malformed "provider/model" identifier: ${model}`)
  }
  return { provider, model: rest }
}

/** 错误消息前缀（executor 派发参数与配置冲突，运行时文案英文）。 */
const ERR_PREFIX = 'workloom executor'

/**
 * 检测显式 executor 参数与 subagents 配置的冲突（纯函数，不修改入参）。
 *
 * 设计意图：
 * - 配置限定了某 kind 的 model/effort 时，工具显式传参与配置不一致等于静默
 *   绕过用户配置，需中断提示（force 放行须留痕审计）；
 * - 归一化比较：model 拆 provider/model 后各自相等才算一致；裸 id 与带前缀
 *   id 因 provider 一侧缺失视为冲突（跨 provider 派发语义不同）；
 * - model 的 map 形式按 runtime 解析取值（缺 key 走 resolveSubagentDefaults
 *   的 fail loud）；model/effort 独立判定，配置未限定的字段不触发。
 * @param {import('./config.d.ts').WorkloomConfig} config 配置对象
 * @param {string} kind executor 类型（research/implement/check）
 * @param {{model?: string, effort?: string}} overrides 工具显式参数
 * @param {string | undefined} runtime 当前 runtime 名（model 为 map 形式时必填）
 * @returns {import('./config.d.ts').ExecutorConflict[]} 冲突清单（空数组表示无冲突）
 */
export function detectExecutorConflicts(config, kind, overrides, runtime) {
  const entry = config.subagents[kind]
  if (entry === undefined) return []
  /** @type {import('./config.d.ts').ExecutorConflict[]} */
  const conflicts = []
  if (overrides.model !== undefined) {
    // map 形式按 runtime 解析（缺 key 抛错，fail loud 语义同 resolveSubagentDefaults）。
    const configured = resolveSubagentDefaults(config, kind, {}, runtime).model
    if (configured !== undefined && !sameProviderModel(configured, overrides.model)) {
      conflicts.push({ field: 'model', configured, passed: overrides.model })
    }
  }
  if (
    overrides.effort !== undefined &&
    entry.effort !== undefined &&
    entry.effort !== overrides.effort
  ) {
    conflicts.push({ field: 'effort', configured: entry.effort, passed: overrides.effort })
  }
  return conflicts
}

/**
 * 归一化比较两个 model（内部）：各自拆 provider/model 后两段分别相等才算一致；
 * 裸 id（provider undefined）只匹配裸 id（undefined provider 仅匹配 undefined）。
 * @param {string} configured 配置侧 model
 * @param {string} passed 工具显式传入 model
 * @returns {boolean}
 */
function sameProviderModel(configured, passed) {
  const left = splitProviderModel(configured)
  const right = splitProviderModel(passed)
  return left.provider === right.provider && left.model === right.model
}

/**
 * 组装冲突中断提示（英文运行时文案）：adapter 检测到冲突且未 force 时返回该
 * 文本、不派发；含该 kind 的配置值、传入值与 force+reason 用法。
 * @param {string} kind executor 类型（research/implement/check）
 * @param {import('./config.d.ts').ExecutorConflict[]} conflicts 冲突清单（非空）
 * @returns {string} 提示文本
 */
export function buildConflictNotice(kind, conflicts) {
  return [
    `${ERR_PREFIX}: explicit parameters conflict with subagents.${kind} config:`,
    ...conflicts.map(
      (conflict) =>
        `- ${conflict.field}: config "${conflict.configured}", passed "${conflict.passed}"`,
    ),
    'Pass force: true with a non-empty reason to override the config; the override is recorded in task.json overrides.',
  ].join('\n')
}

/**
 * 校验 force 覆盖参数：force 非 true 一律放行（非布尔按 false 处理，工具 schema
 * 已约束，此处仅防御）；force 为 true 时 reason 必须是非空字符串（覆盖须留痕，
 * 审计不可缺失），否则抛错。
 * @param {unknown} force 是否强制覆盖
 * @param {unknown} reason 覆盖原因
 */
export function assertForceReason(force, reason) {
  if (force !== true) return
  if (typeof reason !== 'string' || reason.trim() === '') {
    throw new Error(
      `${ERR_PREFIX}: force: true requires a non-empty reason (the override is recorded in task.json overrides)`,
    )
  }
}

/** @param {string} field @param {unknown} value @returns {string} */
function requireString(field, value) {
  if (typeof value !== 'string') throw new WorkloomConfigError(field, 'must be a string')
  return value
}

/** @param {string} field @param {unknown} value @returns {number} */
function requirePositiveInt(field, value) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new WorkloomConfigError(field, 'must be a positive integer')
  }
  return value
}

/** @param {string} field @param {unknown} value @returns {number} */
function requireNonNegativeInt(field, value) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new WorkloomConfigError(field, 'must be a non-negative integer (0 means unlimited)')
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
  throw new WorkloomConfigError(field, 'must be a boolean (or true/false/yes/no/1/0/on/off)')
}

/** @param {string} field @param {unknown} value @returns {Record<string, unknown>} */
function requireMap(field, value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new WorkloomConfigError(field, 'must be an object map')
  }
  return /** @type {Record<string, unknown>} */ (value)
}

/** @param {string} field @param {unknown} value @returns {string[]} */
function requireStringList(field, value) {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new WorkloomConfigError(field, 'must be an array of strings')
  }
  return /** @type {string[]} */ (value)
}
