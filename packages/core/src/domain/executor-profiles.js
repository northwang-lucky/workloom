/**
 * 执行器画像小节组装（行为移植模块，纯 JS + JSDoc）。
 *
 * 设计意图：
 * - 会话上下文注入把「当前生效的执行器配置」摊给主会话看（本任务的治理盲区）：
 *   四个 kind 全量展示；配置命中的行给出 model/effort/tools 摘要与来源层标注，
 *   未配置的行标注继承父会话模型；首行带主会话模型，取不到时 whenMain 条目跳过；
 * - 画像解析复用 config.js 的 resolveSubagentDefaults（单一解析链，不造第二套）；
 *   tools 仅随命中 subagent_profiles 条目透出（legacy 层不支持 tools）；
 * - 来源层标注：文件层取 loadConfig 挂载的 provenance（subagentProfilesSource /
 *   subagentsSource），匹配方式取 resolve 返回的字段来源（whenMain/fallback/legacy）；
 *   行内只标一个来源（model > effort 的字段来源优先；极端「仅 tools」形态归兜底）；
 * - 纯同步、无副作用；解析失败（如 per-runtime model 缺 runtime）直接抛错，由调用方
 *   （session-context）按整节降级处理，不在此静默。
 */

import { resolveSubagentDefaults } from './config.js'
import { EXECUTOR_KINDS } from './executor-context.js'

/** 画像行缩进（与 guidelines 条目同宽）。 */
const ROW_INDENT = '  '

/** 工具清单保留上限：超过保留前 4 项加 … +N（N = 超出的项数）。 */
const TOOL_LIST_KEEP = 4

/** 未配置行的固定文案（继承父会话模型语义）。 */
const NOT_CONFIGURED_TEXT = 'not configured (inherits parent session model)'

/** 来源匹配方式 → 括号内标注文案。 */
const MATCH_LABELS = Object.freeze({
  whenMain: 'whenMain match',
  fallback: 'fallback entry',
  legacy: 'legacy subagents',
})

/**
 * 组装执行器画像小节（纯函数）：首行标题 + 每 kind 一行（顺序 = EXECUTOR_KINDS
 * 定义序）。画像解析复用 resolveSubagentDefaults（overrides 恒为空对象——此处只
 * 展示配置层生效结果，不含工具调用参数覆盖）。
 * @param {import('./config.d.ts').WorkloomConfig} config 配置对象（loadConfig 结果，含来源层字段）
 * @param {{mainModel?: string | null}} [options] mainModel 主会话模型
 *   （provider/model；缺省/空白 = 未知，whenMain 条目跳过，标题标注 unknown）
 * @returns {string[]} 小节行列表
 */
export function renderExecutorProfilesSection(config, options = {}) {
  const mainModel = normalizeMainModel(options.mainModel)
  const header =
    mainModel === null
      ? 'Executor profiles (main model unknown; whenMain entries skipped):'
      : `Executor profiles (main model ${mainModel}):`
  const lines = [header]
  for (const kind of Object.values(EXECUTOR_KINDS)) {
    const resolved = resolveSubagentDefaults(config, kind, {}, undefined, mainModel ?? undefined)
    lines.push(profileRowLine(kind, resolved, config))
  }
  return lines
}

/**
 * 归一化主会话模型（内部）：非字符串 / null / 空白均视为未知（返回 null）。
 * @param {string | null | undefined} mainModel 主会话模型（provider/model）
 * @returns {string | null} 归一化后的模型标识，未知返回 null
 */
function normalizeMainModel(mainModel) {
  if (typeof mainModel !== 'string') return null
  const trimmed = mainModel.trim()
  return trimmed === '' ? null : trimmed
}

/**
 * 组装单个 kind 的画像行（内部）：配置命中（model/effort 任一来自配置，或 tools
 * 任一侧非空）时拼 model/effort/tools/source 四段；全部未配置时输出继承文案。
 * @param {string} kind executor 类型（research/implement/check/frontend）
 * @param {import('./config.d.ts').ResolveSubagentDefaultsResult} resolved 解析结果
 * @param {import('./config.d.ts').WorkloomConfig} config 配置对象（含来源层字段）
 * @returns {string} 画像行
 */
function profileRowLine(kind, resolved, config) {
  const toolsConfigured = hasTools(resolved.tools)
  if (resolved.model === undefined && resolved.effort === undefined && !toolsConfigured) {
    return `${ROW_INDENT}${kind}: ${NOT_CONFIGURED_TEXT}`
  }
  const parts = []
  if (resolved.model !== undefined) parts.push(resolved.model)
  if (resolved.effort !== undefined) parts.push(`effort ${resolved.effort}`)
  if (toolsConfigured) parts.push(toolsSummary(/** @type {import('./config.d.ts').SubagentTools} */ (resolved.tools)))
  parts.push(sourcePart(resolved, config))
  return `${ROW_INDENT}${kind}: ${parts.join(' | ')}`
}

/**
 * tools 两清单是否任一侧非空（两侧均空 = 无实际变更，省略 tools 段）。
 * @param {import('./config.d.ts').SubagentTools | undefined} tools 命中条目的 tools 字段
 * @returns {boolean}
 */
function hasTools(tools) {
  return (
    tools !== undefined &&
    (tools.includes.length > 0 || tools.excludes.length > 0)
  )
}

/**
 * 组装来源标注段（内部）：匹配方式取字段来源（model > effort 优先），文件层按
 * 来源类型取对应 provenance；行内只标一个来源（命中条目整体归属该来源的兜底口径）。
 * legacy 层走 subagentsSource；whenMain/fallback 走 subagentProfilesSource。
 * @param {import('./config.d.ts').ResolveSubagentDefaultsResult} resolved 解析结果
 * @param {import('./config.d.ts').WorkloomConfig} config 配置对象（含来源层字段）
 * @returns {string} source 段（如 `source: local config (whenMain match)`）
 */
function sourcePart(resolved, config) {
  const mode = resolved.configSources.model ?? resolved.configSources.effort
  if (mode === undefined) {
    // 仅 tools 命中（model/effort 均未配置）：字段级来源无法区分 whenMain/fallback，
    // 统一按兜底标注（本行 tools 必来自某条命中 profile，层取 profiles 来源）。
    return `source: ${config.subagentProfilesSource ?? 'config'} config (${MATCH_LABELS.fallback})`
  }
  const layer = mode === 'legacy' ? config.subagentsSource : config.subagentProfilesSource
  return `source: ${layer ?? 'config'} config (${MATCH_LABELS[mode]})`
}

/**
 * 组装 tools 摘要段（内部）：includes/excludes 两侧各自列出原值，单侧超过 4 项时
 * 保留前 4 加 `… +N`；两侧均未配置时调用方不进入本函数（tools 段整体省略）。
 * @param {import('./config.d.ts').SubagentTools} tools 命中条目的 tools 字段
 * @returns {string} tools 段（如 `tools: includes [a, b], excludes [c]`）
 */
function toolsSummary(tools) {
  const sides = []
  if (tools.includes.length > 0) {
    sides.push(`includes [${summarizeToolList(tools.includes)}]`)
  }
  if (tools.excludes.length > 0) {
    sides.push(`excludes [${summarizeToolList(tools.excludes)}]`)
  }
  return `tools: ${sides.join(', ')}`
}

/**
 * 单侧工具清单摘要（内部）：不超过保留上限时原样逗号拼接；超过时保留前 N 项并
 * 追加 `… +M`（M = 被截掉的项数）。
 * @param {string[]} items 工具名清单
 * @returns {string} 摘要文本
 */
function summarizeToolList(items) {
  if (items.length <= TOOL_LIST_KEEP) return items.join(', ')
  return `${items.slice(0, TOOL_LIST_KEEP).join(', ')}, … +${items.length - TOOL_LIST_KEEP}`
}
