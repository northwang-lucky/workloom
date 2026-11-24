/**
 * config 默认值与逐字段校验器（TypeScript）：默认配置快照、WorkloomConfigError、
 * require* 校验族、worktree 配置解析、占位符校验与 setup 命令渲染。
 *
 * 设计意图：
 * - 与加载编排（config-load）和 subagent 解析（config-subagent）拆分：本模块是
 *   两侧共用的叶子（错误类型与校验器），被单向下引，不回引任何一侧；
 * - 校验失败显式抛 WorkloomConfigError（携带字段路径），不静默回退，
 *   符合"无灰区"哲学；
 * - 命令渲染（renderSetupCommand）承载 packages.<name>.setup 的占位符语义。
 */

/** 增量覆盖率默认阈值：严格大于（恰好等于不达标），门禁/脚本/文案共用单源。 */
export const DEFAULT_THRESHOLD = 90

/** 磁盘覆盖率格式枚举（四值；计算侧 FORMAT_NORMALIZE 把 go-coverprofile 归一为 go）。 */
const COVERAGE_FORMAT_LITERALS = Object.freeze([
  'go-coverprofile',
  'lcov',
  'jacoco-xml',
  'cobertura-xml',
] as const)

/** 内置默认配置（与规格一致）。 */
export const DEFAULT_CONFIG: import('./config.d.ts').WorkloomConfig = {
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
  executor: { maxConcurrent: 0 },
  worktree: {
    enabled: true,
    branchTemplate: 'workloom/<task-id>',
    cleanup: 'rebase-keep-branch',
  },
  subagentProfiles: [],
  coverage: { threshold: DEFAULT_THRESHOLD, languages: {} },
}

/** resolveSubagentDefaults 的角色层并发上限兜底缺省（未配置时 3）。 */
export const DEFAULT_ROLE_MAX_CONCURRENT = 3

/** worktree 清理模式全集（cleanup 字段白名单）。 */
const WORKTREE_CLEANUP_MODES = Object.freeze([
  'merge-keep-branch',
  'merge-delete-branch',
  'keep-branch',
  'manual',
  'rebase-keep-branch',
  'rebase-delete-branch',
])

/** 分支名模板占位符白名单。 */
export const BRANCH_TEMPLATE_PLACEHOLDERS = new Set(['<task-id>', '<task-slug>', '<date>'])

/** setup 命令占位符 → 渲染值键。 */
const SETUP_PLACEHOLDER_TOKENS = Object.freeze({
  '<worktree>': 'worktree',
  '<source-checkout>': 'sourceCheckout',
})
const SETUP_PLACEHOLDERS = new Set(Object.keys(SETUP_PLACEHOLDER_TOKENS))

/**
 * 渲染 setup 命令占位符：`<worktree>` 与 `<source-checkout>` 替换为实际路径。
 * @param command 模板命令串
 * @param values 渲染值（worktree 根与源检出目录）
 * @returns 渲染后的命令串
 */
export function renderSetupCommand(
  command: string,
  values: { worktree: string; sourceCheckout: string },
): string {
  let rendered = command
  for (const [token, key] of Object.entries(SETUP_PLACEHOLDER_TOKENS)) {
    rendered = rendered.replaceAll(token, values[key])
  }
  return rendered
}

/** coverage 命令占位符 → 渲染值键（封闭三 token，值来源见 CoveragePlaceholderValues）。 */
const COVERAGE_PLACEHOLDER_TOKENS = Object.freeze({
  '<worktree>': 'worktree',
  '<profile>': 'profile',
  '<base-ref>': 'baseRef',
})
const COVERAGE_PLACEHOLDERS = new Set(Object.keys(COVERAGE_PLACEHOLDER_TOKENS))

/**
 * 渲染 coverage 命令占位符：先按封闭白名单校验，未知 token fail loud，再替换。
 * @param command 模板命令串
 * @param values 渲染值（worktree 根、报告输出路径、基线分支）
 * @returns 渲染后的命令串
 */
export function renderCoverageCommand(
  command: string,
  values: { worktree: string; profile: string; baseRef: string },
): string {
  assertPlaceholders('coverage.command', command, COVERAGE_PLACEHOLDERS)
  let rendered = command
  for (const [token, key] of Object.entries(COVERAGE_PLACEHOLDER_TOKENS)) {
    rendered = rendered.replaceAll(token, values[key])
  }
  return rendered
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
  /** 出错字段的路径（如 context_injection.max_file_bytes）。 */
  field: string

  /**
   * @param field 出错字段的路径（如 context_injection.max_file_bytes）
   * @param reason 具体原因
   */
  constructor(field: string, reason: string) {
    super(`workloom config: ${field}: ${reason}`)
    this.name = 'WorkloomConfigError'
    this.field = field
  }
}

/** @param field 字段路径 @param value 待校验值 @returns 非空 string */
export function requireString(field: string, value: unknown): string {
  if (typeof value !== 'string') throw new WorkloomConfigError(field, 'must be a string')
  return value
}

/** @param field 字段路径 @param value 待校验值 @returns 非负整数 */
export function requireNonNegativeInt(field: string, value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new WorkloomConfigError(field, 'must be a non-negative integer (0 means unlimited)')
  }
  return value
}

/** @param field 字段路径 @param value 待校验值 @returns boolean */
export function requireBoolean(field: string, value: unknown): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string' && BOOLEAN_WORDS.has(value.toLowerCase())) {
    return BOOLEAN_WORDS.get(value.toLowerCase()) as boolean
  }
  if (typeof value === 'number' && (value === 1 || value === 0)) {
    return value === 1
  }
  throw new WorkloomConfigError(field, 'must be a boolean (or true/false/yes/no/1/0/on/off)')
}

/** @param field 字段路径 @param value 待校验值 @returns 对象映射 */
export function requireMap(field: string, value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new WorkloomConfigError(field, 'must be an object map')
  }
  return value as Record<string, unknown>
}

/** @param field 字段路径 @param value 待校验值 @returns 字符串数组 */
export function requireStringList(field: string, value: unknown): string[] {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new WorkloomConfigError(field, 'must be an array of strings')
  }
  return value as string[]
}

/**
 * 校验 cleanup 模式：必须是六模式之一（WorktreeCleanupMode 值域）。
 * @param field 字段路径
 * @param value 用户文档值
 * @returns 合法模式
 */
export function requireWorktreeCleanup(field: string, value: unknown): import('./config.d.ts').WorktreeCleanupMode {
  if (typeof value !== 'string' || !WORKTREE_CLEANUP_MODES.includes(value)) {
    throw new WorkloomConfigError(
      field,
      `must be one of: ${WORKTREE_CLEANUP_MODES.join(', ')}`,
    )
  }
  return value as import('./config.d.ts').WorktreeCleanupMode
}

/**
 * 校验模板占位符白名单：正则扫描 `<…>` 片段，出现白名单外占位符
 * fail loud（worktree.branch_template 与 packages.<name>.setup 共用）。
 */
export function assertPlaceholders(field: string, template: string, allowed: Set<string>): void {
  for (const match of template.matchAll(/<([^>]+)>/g)) {
    const token = match[0]
    if (!allowed.has(token)) {
      throw new WorkloomConfigError(field, `unknown placeholder ${token}`)
    }
  }
}

/**
 * 校验 packages 映射：每个值是含 path 字符串的对象（缺省 '.'），可带 type/git
 * 标注；setup 为字符串数组（缺省 []，worktree 依赖准备命令），逐条做占位符
 * 白名单校验。
 * @param value 用户文档中的 packages 字段
 * @returns packages 映射（内存形态）
 */
export function parsePackages(value: unknown): import('./config.d.ts').WorkloomConfig['packages'] {
  const map = requireMap('packages', value)
  const result: import('./config.d.ts').WorkloomConfig['packages'] = {}
  for (const [name, entry] of Object.entries(map)) {
    const spec = requireMap(`packages.${name}`, entry)
    const path = requireString(`packages.${name}.path`, spec.path ?? '.')
    const parsed: import('./config.d.ts').WorkloomConfig['packages'][string] = {
      path,
      setup: requireStringList(`packages.${name}.setup`, spec.setup),
    }
    if (spec.type !== undefined) parsed.type = requireString(`packages.${name}.type`, spec.type)
    if (spec.git !== undefined) parsed.git = requireBoolean(`packages.${name}.git`, spec.git)
    for (const command of parsed.setup) {
      assertPlaceholders(`packages.${name}.setup`, command, SETUP_PLACEHOLDERS)
    }
    result[name] = parsed
  }
  return result
}

/**
 * 校验 threshold：0–100 整数，专用文案（不复用 "0 means unlimited"）。
 * @param field 字段路径
 * @param value 用户文档值
 * @returns 合法阈值
 */
function requireCoverageThreshold(field: string, value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 100) {
    throw new WorkloomConfigError(field, 'must be an integer between 0 and 100')
  }
  return value
}

/**
 * 校验磁盘覆盖率格式枚举（四值之一）。
 * @param field 字段路径
 * @param value 用户文档值
 * @returns 合法格式枚举
 */
function requireCoverageFormat(
  field: string,
  value: unknown,
): import('./config.d.ts').CoverageFormatLiteral {
  if (typeof value !== 'string' || !(COVERAGE_FORMAT_LITERALS as readonly string[]).includes(value)) {
    throw new WorkloomConfigError(field, `must be one of: ${COVERAGE_FORMAT_LITERALS.join(', ')}`)
  }
  return value as import('./config.d.ts').CoverageFormatLiteral
}

/**
 * 解析 coverage 配置节：缺省填默认、逐字段校验、未知子字段 fail loud。
 * 语言映射开放：内置语言仅提供缺省，用户可为任意语言配 format/command。
 * @param value 用户文档中的 coverage 字段
 * @returns coverage 内存形态（含默认值）
 */
export function parseCoverage(value: unknown): import('./config.d.ts').CoverageConfig {
  const spec = requireMap('coverage', value)
  for (const key of Object.keys(spec)) {
    if (key !== 'threshold' && key !== 'languages') {
      throw new WorkloomConfigError(`coverage.${key}`, 'unknown field (allowed: threshold, languages)')
    }
  }
  const result: import('./config.d.ts').CoverageConfig = {
    threshold: DEFAULT_THRESHOLD,
    languages: {},
  }
  if (spec.threshold !== undefined) {
    result.threshold = requireCoverageThreshold('coverage.threshold', spec.threshold)
  }
  if (spec.languages !== undefined) {
    const languages = requireMap('coverage.languages', spec.languages)
    for (const [lang, entry] of Object.entries(languages)) {
      const field = `coverage.languages.${lang}`
      const item = requireMap(field, entry)
      for (const key of Object.keys(item)) {
        if (key !== 'format' && key !== 'command') {
          throw new WorkloomConfigError(`${field}.${key}`, 'unknown field (allowed: format, command)')
        }
      }
      const parsed: import('./config.d.ts').CoverageLanguageConfig = {
        format: requireCoverageFormat(`${field}.format`, item.format),
      }
      if (item.command !== undefined) {
        const command = requireString(`${field}.command`, item.command)
        assertPlaceholders(`${field}.command`, command, COVERAGE_PLACEHOLDERS)
        parsed.command = command
      }
      result.languages[lang] = parsed
    }
  }
  return result
}
