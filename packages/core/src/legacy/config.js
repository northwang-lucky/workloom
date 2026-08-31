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
  subagentProfiles: [],
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
  if (doc.subagent_profiles !== undefined) {
    config.subagentProfiles = parseSubagentProfiles(doc.subagent_profiles)
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
  return parseSubagentsEntries('subagents', requireMap('subagents', value))
}

/**
 * 校验 subagents 条目映射（解析核心，前缀可参数化：旧 subagents 字段与
 * subagent_profiles 内层复用同一套 entry 校验）。
 * @param {string} prefix 字段路径前缀（subagents 或 subagent_profiles[i].subagents）
 * @param {Record<string, unknown>} map 条目映射
 * @returns {Record<string, {model?: string | Record<string, string>, effort?: string}>}
 */
function parseSubagentsEntries(prefix, map) {
  /** @type {Record<string, {model?: string | Record<string, string>, effort?: string}>} */
  const result = {}
  for (const [name, entry] of Object.entries(map)) {
    const spec = requireMap(`${prefix}.${name}`, entry)
    /** @type {{model?: string | Record<string, string>, effort?: string}} */
    const parsed = {}
    if (spec.model !== undefined) {
      parsed.model = parseSubagentModel(`${prefix}.${name}.model`, spec.model)
    }
    if (spec.effort !== undefined) {
      parsed.effort = requireString(`${prefix}.${name}.effort`, spec.effort)
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
 * 校验 subagent_profiles 数组：每条为 {whenMain?, subagents}，顺序即匹配顺序。
 * whenMain 支持 string（所有 runtime 同值）或按 runtime 取值的 map，值必须是
 * 完整 provider/model；内层 subagents 复用 parseSubagentsEntries 的 entry 校验。
 * 解析后做歧义检查（多条兜底条目、whenMain 条件重叠，均 fail loud）。
 * @param {unknown} value 用户文档中的 subagent_profiles 字段
 * @returns {import('./config.d.ts').SubagentProfile[]}
 */
function parseSubagentProfiles(value) {
  if (!Array.isArray(value)) {
    throw new WorkloomConfigError('subagent_profiles', 'must be an array')
  }
  /** @type {import('./config.d.ts').SubagentProfile[]} */
  const result = []
  for (let i = 0; i < value.length; i++) {
    const entry = requireMap(`subagent_profiles[${i}]`, value[i])
    /** @type {import('./config.d.ts').SubagentProfile} */
    const parsed = {}
    if (entry.whenMain !== undefined) {
      parsed.whenMain = parseWhenMain(`subagent_profiles[${i}].whenMain`, entry.whenMain)
    }
    const subs = requireMap(`subagent_profiles[${i}].subagents`, entry.subagents ?? {})
    parsed.subagents = parseSubagentsEntries(`subagent_profiles[${i}].subagents`, subs)
    result.push(parsed)
  }
  assertNoAmbiguousProfiles(result)
  return result
}

/**
 * 校验 whenMain 条件：string 或 per-runtime map；每个值必须是完整
 * provider/model（首个 / 前后均非空），否则 WorkloomConfigError（fail loud）。
 * runtime 取值语义在 resolveSubagentDefaults 消费端（loadConfig 保持 runtime 无关）。
 * @param {string} field 字段路径（subagent_profiles[i].whenMain）
 * @param {unknown} value 用户文档值
 * @returns {string | Record<string, string>}
 */
function parseWhenMain(field, value) {
  if (typeof value === 'string') {
    assertFullProviderModel(field, value)
    return value
  }
  if (!isPlainObject(value)) {
    throw new WorkloomConfigError(field, 'must be a string or a per-runtime map')
  }
  /** @type {Record<string, string>} */
  const result = {}
  for (const [runtime, model] of Object.entries(value)) {
    const sub = requireString(`${field}.${runtime}`, model)
    assertFullProviderModel(`${field}.${runtime}`, sub)
    result[runtime] = sub
  }
  return result
}

/**
 * 断言 model 是完整 provider/model 标识（首个 / 前后均非空）。
 * @param {string} field 字段路径
 * @param {string} model 模型标识
 */
function assertFullProviderModel(field, model) {
  const slash = model.indexOf('/')
  if (slash <= 0 || slash === model.length - 1) {
    throw new WorkloomConfigError(
      field,
      `must be a full "provider/model" identifier: ${model}`,
    )
  }
}

/**
 * subagent_profiles 歧义检查（fail loud，loadConfig 时静态可判）：
 * - 无 whenMain 的条目（兜底）多于一条 → 报错；
 * - 两条目 whenMain 条件重叠 → 报错（string 视为所有 runtime 同值；map 取
 *   共同 key 且值相同），报错信息写明冲突 runtime 与值。
 * @param {import('./config.d.ts').SubagentProfile[]} profiles 解析后的条目
 */
function assertNoAmbiguousProfiles(profiles) {
  const fallbacks = []
  for (const [i, profile] of profiles.entries()) {
    if (profile.whenMain === undefined) fallbacks.push(i)
  }
  if (fallbacks.length > 1) {
    throw new WorkloomConfigError(
      'subagent_profiles',
      `multiple fallback entries without whenMain (indices ${fallbacks.join(', ')}); only one is allowed`,
    )
  }
  for (let i = 0; i < profiles.length; i++) {
    for (let j = i + 1; j < profiles.length; j++) {
      const overlap = findWhenMainOverlap(profiles[i]?.whenMain, profiles[j]?.whenMain)
      if (overlap !== null) {
        throw new WorkloomConfigError(
          'subagent_profiles',
          `whenMain conditions overlap between indices ${i} and ${j}: matching value "${overlap.value}" on runtime "${overlap.runtime}"`,
        )
      }
    }
  }
}

/**
 * 两条 whenMain 条件的重叠判定：string 形式对所有 runtime 有该值；map 按
 * 自身 key。任意 runtime 上匹配值相同即重叠。返回首个重叠的 {runtime, value}；
 * string vs string 的 runtime 记为 any（对所有 runtime 成立）。
 * @param {string | Record<string, string> | undefined} left 第一条条件
 * @param {string | Record<string, string> | undefined} right 第二条条件
 * @returns {{runtime: string, value: string} | null} 首个重叠点，无重叠返回 null
 */
function findWhenMainOverlap(left, right) {
  if (left === undefined || right === undefined) return null
  const leftIsString = typeof left === 'string'
  const rightIsString = typeof right === 'string'
  if (leftIsString && rightIsString) {
    return left === right ? { runtime: 'any', value: left } : null
  }
  if (leftIsString) return findMapOverlapWithString(left, /** @type {Record<string, string>} */ (right))
  if (rightIsString) return findMapOverlapWithString(right, /** @type {Record<string, string>} */ (left))
  for (const [runtime, value] of Object.entries(/** @type {Record<string, string>} */ (left))) {
    if (right[runtime] !== undefined && right[runtime] === value) {
      return { runtime, value }
    }
  }
  return null
}

/**
 * string 条件与 map 条件的重叠判定：map 任一 value 与 string 相同即重叠。
 * @param {string} str string 条件
 * @param {Record<string, string>} map map 条件
 * @returns {{runtime: string, value: string} | null}
 */
function findMapOverlapWithString(str, map) {
  for (const [runtime, value] of Object.entries(map)) {
    if (value === str) return { runtime, value }
  }
  return null
}

/**
 * 合并 executor 子代理默认 model/effort：工具调用参数优先，未出现的字段回退到
 * subagent_profiles 命中条目（按主会话模型匹配），再回退到旧 subagents 配置
 * （按 kind 对应条目）；全部缺失时字段为 undefined（继承父会话）。model 与
 * effort 独立合并。model 的 map 形式按 runtime 取值，缺当前 runtime 的 key 时
 * fail loud（避免静默用错模型）。纯同步、无副作用（不修改入参）。
 * @param {import('./config.d.ts').WorkloomConfig} config 配置对象
 * @param {string} kind executor 类型（research/implement/check/frontend）
 * @param {{model?: string, effort?: string}} overrides 工具调用参数（仅覆盖出现的字段）
 * @param {string} [runtime] 当前 runtime 名（entry.model 为 map 形式时必填）
 * @param {string} [mainModel] 主会话模型（provider/model 字符串；取不到时不传，
 *   全部 whenMain 条目跳过，走兜底/旧 subagents）
 * @returns {import('./config.d.ts').ResolveSubagentDefaultsResult} 合并结果与字段来源
 */
export function resolveSubagentDefaults(config, kind, overrides, runtime, mainModel) {
  // 顺序匹配 subagent_profiles：无 whenMain 的条目无条件命中（兜底）；whenMain
  // 条目在 mainModel 可取且两段归一化相等时命中；mainModel 取不到时一律跳过
  // whenMain 条目（运行时信息缺失，非配置错误，不 fail loud）。
  /** @type {{index: number, subagents: Record<string, import('./config.d.ts').SubagentConfigEntry>, source: 'whenMain' | 'fallback', whenMainValue?: string} | null} */
  let matched = null
  const profiles = config.subagentProfiles ?? []
  for (const [i, profile] of profiles.entries()) {
    if (profile.whenMain === undefined) {
      matched = { index: i, subagents: profile.subagents, source: 'fallback' }
      break
    }
    if (mainModel === undefined) continue
    const value = whenMainValueFor(profile.whenMain, mainModel, runtime)
    if (value !== undefined) {
      matched = { index: i, subagents: profile.subagents, source: 'whenMain', whenMainValue: value }
      break
    }
  }
  // 命中条目未配置该 kind 时该层为空对象，字段依次回退旧 subagents（kind 级联）。
  const profileLayer = matched?.subagents[kind] ?? {}
  const legacyLayer = config.subagents[kind]
  // 字段独立合并：显式参数 > 命中 profile 条目字段 > 旧 subagents 字段；model 的
  // map 形式按 runtime 解析（缺 key fail loud），字段路径带来源层级便于定位。
  let model
  /** @type {import('./config.d.ts').SubagentConfigSource | undefined} */
  let modelConfigSource
  if (overrides.model !== undefined) {
    model = overrides.model
  } else if (matched !== null && profileLayer.model !== undefined) {
    model = resolveEntryModel(
      `subagent_profiles[${matched.index}].subagents.${kind}.model`,
      profileLayer,
      runtime,
    )
    modelConfigSource = matched.source
  } else if (legacyLayer?.model !== undefined) {
    model = resolveEntryModel(`subagents.${kind}.model`, legacyLayer, runtime)
    modelConfigSource = 'legacy'
  }
  let effort
  /** @type {import('./config.d.ts').SubagentConfigSource | undefined} */
  let effortConfigSource
  if (overrides.effort !== undefined) {
    effort = overrides.effort
  } else if (matched !== null && profileLayer.effort !== undefined) {
    effort = profileLayer.effort
    effortConfigSource = matched.source
  } else if (legacyLayer?.effort !== undefined) {
    effort = legacyLayer.effort
    effortConfigSource = 'legacy'
  }
  return {
    model,
    effort,
    sources: {
      model: overrides.model !== undefined ? 'param' : model !== undefined ? 'config' : undefined,
      effort:
        overrides.effort !== undefined ? 'param' : effort !== undefined ? 'config' : undefined,
    },
    configSources: { model: modelConfigSource, effort: effortConfigSource },
    // whenMainValue 仅在字段实际来自 whenMain 条目时返回（receipt 展示用）。
    ...(matched?.whenMainValue !== undefined &&
    (modelConfigSource === 'whenMain' || effortConfigSource === 'whenMain')
      ? { whenMainValue: matched.whenMainValue }
      : {}),
  }
}

/**
 * whenMain 匹配判定：mainModel 与条件值做两段归一化比较（provider/model 各自
 * 相等）。string 形式与 mainModel 整体比较；map 形式取当前 runtime 的值，缺
 * key 不匹配（跳过该条目，不报错）。返回匹配值（receipt 展示用），不匹配
 * 返回 undefined。
 * @param {string | Record<string, string>} whenMain 命中条件
 * @param {string} mainModel 主会话模型（provider/model）
 * @param {string | undefined} runtime 当前 runtime 名
 * @returns {string | undefined}
 */
function whenMainValueFor(whenMain, mainModel, runtime) {
  if (typeof whenMain === 'string') {
    return sameProviderModel(whenMain, mainModel) ? whenMain : undefined
  }
  if (runtime === undefined) return undefined
  const value = whenMain[runtime]
  if (value === undefined) return undefined
  return sameProviderModel(value, mainModel) ? value : undefined
}

/**
 * 解析 subagents entry 的 model 字段：string 原样返回；map 按 runtime 取值，
 * 缺 key 抛错（fail loud）。runtime 未提供但 model 为 map 时同样抛错。
 * @param {string} field 字段路径（subagents.<kind>.model 或
 *   subagent_profiles[i].subagents.<kind>.model）
 * @param {{model?: string | Record<string, string>, effort?: string} | undefined} entry
 * @param {string | undefined} runtime 当前 runtime 名
 * @returns {string | undefined}
 */
function resolveEntryModel(field, entry, runtime) {
  const model = entry?.model
  if (model === undefined || typeof model === 'string') return model
  if (runtime === undefined) {
    throw new WorkloomConfigError(
      field,
      'is a per-runtime map but no runtime was provided',
    )
  }
  const resolved = model[runtime]
  if (resolved === undefined) {
    throw new WorkloomConfigError(
      field,
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
 * - 配置侧生效值按合并链解析（resolveSubagentDefaults 同口径：profile 命中
 *   条目 > 旧 subagents，model 的 map 形式按 runtime 解析，缺 key 走 fail
 *   loud）；model/effort 独立判定，配置未限定的字段不触发。
 * @param {import('./config.d.ts').WorkloomConfig} config 配置对象
 * @param {string} kind executor 类型（research/implement/check/frontend）
 * @param {{model?: string, effort?: string}} overrides 工具显式参数
 * @param {string | undefined} runtime 当前 runtime 名（model 为 map 形式时必填）
 * @param {string} [mainModel] 主会话模型（provider/model；whenMain 匹配用）
 * @returns {import('./config.d.ts').ExecutorConflict[]} 冲突清单（空数组表示无冲突）
 */
export function detectExecutorConflicts(config, kind, overrides, runtime, mainModel) {
  const merged = resolveSubagentDefaults(config, kind, {}, runtime, mainModel)
  /** @type {import('./config.d.ts').ExecutorConflict[]} */
  const conflicts = []
  if (
    overrides.model !== undefined &&
    merged.model !== undefined &&
    !sameProviderModel(merged.model, overrides.model)
  ) {
    conflicts.push({
      field: 'model',
      configured: merged.model,
      passed: overrides.model,
      configuredSource: merged.configSources.model,
      ...(merged.whenMainValue !== undefined ? { whenMainValue: merged.whenMainValue } : {}),
    })
  }
  if (
    overrides.effort !== undefined &&
    merged.effort !== undefined &&
    merged.effort !== overrides.effort
  ) {
    conflicts.push({
      field: 'effort',
      configured: merged.effort,
      passed: overrides.effort,
      configuredSource: merged.configSources.effort,
      ...(merged.whenMainValue !== undefined ? { whenMainValue: merged.whenMainValue } : {}),
    })
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
 * 文本、不派发；含该 kind 的配置值（带来源细分）、传入值与 force+reason 用法。
 * @param {string} kind executor 类型（research/implement/check/frontend）
 * @param {import('./config.d.ts').ExecutorConflict[]} conflicts 冲突清单（非空）
 * @returns {string} 提示文本
 */
export function buildConflictNotice(kind, conflicts) {
  return [
    `${ERR_PREFIX}: explicit parameters conflict with subagents.${kind} config:`,
    ...conflicts.map(
      (conflict) =>
        `- ${conflict.field}: config "${conflict.configured}"${configSourceSuffix(conflict)}, passed "${conflict.passed}"`,
    ),
    'Pass force: true with a non-empty reason to override the config; the override is recorded in task.json overrides.',
  ].join('\n')
}

/**
 * 冲突条目配置值的来源细分标注：whenMain 带匹配值（receipt 同款文案）；
 * fallback/legacy 直接标注；无来源（旧调用方构造）时不追加（向后兼容）。
 * @param {import('./config.d.ts').ExecutorConflict} conflict 冲突条目
 * @returns {string} 追加的标注文本（可为空串）
 */
function configSourceSuffix(conflict) {
  if (conflict.configuredSource === 'whenMain') {
    return ` (config: whenMain=${conflict.whenMainValue ?? conflict.configured})`
  }
  if (conflict.configuredSource === 'fallback') return ' (config: fallback)'
  if (conflict.configuredSource === 'legacy') return ' (config: legacy)'
  return ''
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
