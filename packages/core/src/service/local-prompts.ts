/**
 * local-prompts：提示词本机扩展点机制（.workloom/prompts.local/）的核心抽象。
 *
 * 设计意图：
 * - 本机片段是用户有意为之的增强（gitignore，不入库）：任何解析/校验失败必须
 *   fail loud（WorkloomLocalPromptError，含文件与字段路径），静默失效最难排查；
 * - 纯函数与 IO 分离：parseLocalFragment / filterAndOrderLocal 为纯函数（测试接缝），
 *   readLocalFragments / composeLocalDirectivesText 为 IO 组合；
 * - 目录不存在 = 无片段，整体零行为；文件缺失/内容为空 = 跳过该目标注入；
 * - 合成顺序：all.md 在前、<target>.md 在后（target 为 all 时只有 all）；
 * - requiresTools 为 AND 语义：声明工具全部 ∈ availableTools 才注入；缺省为空数组
 *   （无条件）；
 * - 本模块 runtime 无关（core 承载），工具探测与注入落地由 adapter-dsh 负责；
 *   主 agent 目标为 main，executor 子代理目标为各自 kind（research/implement/check/
 *   frontend），all 对两者通用。
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { parse as parseYaml } from 'yaml'

import { insideWorkloom } from '../legacy/locate.js'

/** 错误消息前缀（运行时文案英文）。 */
const ERR_PREFIX = 'workloom local prompts'

/** 本机片段目录相对 .workloom 的路径（doctor 侧检查复用同一约定，避免字符串分叉）。 */
export const LOCAL_PROMPTS_REL = 'prompts.local'

/** 片段目标枚举：文件名 → 目标（main 为主 agent，research/implement/check/frontend 为 executor kind，all 通用）。 */
export const LOCAL_FRAGMENT_TARGETS = Object.freeze([
  'main',
  'research',
  'implement',
  'check',
  'frontend',
  'all',
] as const)

/** LocalFragmentTarget 类型（合法片段目标）。 */
export type LocalFragmentTarget = (typeof LOCAL_FRAGMENT_TARGETS)[number]

/** 解析后的本机片段（target 来自文件名映射；requiresTools 缺省为空数组）。 */
export interface LocalFragment {
  /** 片段目标（main 为主 agent，research/implement/check/frontend 为 executor kind，all 通用）。 */
  target: LocalFragmentTarget
  /** 注入条件：声明的工具全部 ∈ 可用工具集才注入（AND 语义）；空数组 = 无条件。 */
  requiresTools: string[]
  /** Markdown 正文（front-matter 剥离，trim 保留原文）。 */
  text: string
}

/** 文件名 → 目标映射（合法文件名清单，错误文案按此列出）。 */
const TARGET_BY_FILE = Object.freeze({
  'main.md': 'main',
  'research.md': 'research',
  'implement.md': 'implement',
  'check.md': 'check',
  'frontend.md': 'frontend',
  'all.md': 'all',
} as const)

/** front-matter 分隔行（开头与结尾均为此行）。 */
const FRONT_MATTER_DELIMITER = '---'

/** front-matter 唯一合法字段（requiresTools）。 */
const REQUIRES_TOOLS_FIELD = 'requiresTools'

/** front-matter 未知字段时的合法字段清单（错误文案用）。 */
const ALLOWED_FIELDS = [REQUIRES_TOOLS_FIELD]

/** 合成排序权重：all 在前（0）、专属在后（1）。 */
const RANK_ALL = 0
const RANK_TARGET = 1

/**
 * 片段目标（target）是否为合法值。
 * @param target 待校验的目标
 * @returns 是否合法
 */
function isTarget(target: string): target is LocalFragmentTarget {
  return (LOCAL_FRAGMENT_TARGETS as readonly string[]).includes(target)
}

/**
 * 本机片段解析/校验错误：携带文件（相对 prompts.local 的文件名）与字段路径，
 * 措辞风格对齐 WorkloomConfigError（fail loud 口径）。
 */
export class WorkloomLocalPromptError extends Error {
  /** 出错文件名（相对 prompts.local；纯解析无文件名上下文时为 ''）。 */
  readonly file: string
  /** 出错字段路径（如 requiresTools、requiresTools[1]、front-matter、filename、target）。 */
  readonly field: string
  /** 具体原因（不含前缀）。 */
  readonly reason: string

  /**
   * @param file 出错文件名（相对 prompts.local；无文件名上下文时传 ''）
   * @param field 出错字段路径
   * @param reason 具体原因
   */
  constructor(file: string, field: string, reason: string) {
    const filePart = file === '' ? '' : `${file}: `
    super(`${ERR_PREFIX}: ${filePart}${field}: ${reason}`)
    this.name = 'WorkloomLocalPromptError'
    this.file = file
    this.field = field
    this.reason = reason
  }
}

/**
 * 解析片段正文（纯函数）：可选 YAML front-matter（--- 包裹）+ Markdown 正文。
 * 无 front-matter 视为无条件片段；requiresTools 缺省为空数组。
 * front-matter 非法（YAML 解析失败/根非 map/未知字段/requiresTools 非字符串数组）
 * 抛 WorkloomLocalPromptError（无文件名上下文，file 为 ''，由 IO 层补全）。
 * @param target 片段目标（来自文件名的映射，如 'main'；'all' 为通用片段）
 * @param body 文件全文
 * @returns 解析后的片段（正文 trim 保留原文）
 */
export function parseLocalFragment(target: string, body: string): LocalFragment {
  if (!isTarget(target)) {
    throw new WorkloomLocalPromptError(
      '',
      'target',
      `unknown target "${target}" (must be one of ${LOCAL_FRAGMENT_TARGETS.join('/')})`,
    )
  }
  const { meta, text } = splitFrontMatter(body)
  if (meta === null) {
    // 无 front-matter：正文即全文（无条件片段）。
    return { target, requiresTools: [], text: text.trim() }
  }
  const doc = parseFrontMatterMeta(meta)
  const keys = Object.keys(doc)
  const unknownKey = keys.find((key) => !ALLOWED_FIELDS.includes(key))
  if (unknownKey !== undefined) {
    throw new WorkloomLocalPromptError(
      '',
      unknownKey,
      `unknown field (allowed: ${ALLOWED_FIELDS.join(', ')})`,
    )
  }
  const requiresTools = parseRequiresTools(doc[REQUIRES_TOOLS_FIELD])
  return { target, requiresTools, text: text.trim() }
}

/**
 * 按条件过滤并按合成顺序排序（纯函数）：all 前、<target> 后；target 为 all 时只有
 * all 片段。requiresTools 非空时声明工具须全部 ∈ availableTools（AND 语义），
 * 条件过滤先于排序。
 * @param fragments 全部已解析片段
 * @param target 注入目标（main 或 executor kind）
 * @param availableTools 当前可用工具名集合
 * @returns 注入顺序的片段列表（可能为空）
 */
export function filterAndOrderLocal(
  fragments: readonly LocalFragment[],
  target: string,
  availableTools: readonly string[],
): LocalFragment[] {
  if (!isTarget(target)) {
    throw new WorkloomLocalPromptError(
      '',
      'target',
      `unknown target "${target}" (must be one of ${LOCAL_FRAGMENT_TARGETS.join('/')})`,
    )
  }
  const tools = new Set(availableTools)
  const matched = fragments.filter(
    (fragment) =>
      (fragment.target === 'all' || fragment.target === target) &&
      (fragment.requiresTools.length === 0 ||
        fragment.requiresTools.every((tool) => tools.has(tool))),
  )
  return matched.sort(
    (a, b) => rankOf(a.target) - rankOf(b.target),
  )
}

/**
 * 读取本机片段目录（IO）：目录不存在返回空；非 .md / 隐藏 / 目录条目忽略；
 * 未知 .md 文件名与单项解析错误 fail loud（WorkloomLocalPromptError，路径入错误
 * 信息，其余文件照常返回）；空文件/空正文片段跳过。
 * @param root 项目根
 * @returns [err, fragments]：失败时 err 为解析/文件名错误，fragments 为空数组
 */
export function readLocalFragments(root: string): [Error | null, LocalFragment[]] {
  try {
    return [null, readAllFragments(root)]
  } catch (error) {
    return [toError(error), []]
  }
}

/**
 * 组合本机片段注入文本（IO 组合）：readLocalFragments + filterAndOrderLocal，
 * 输出以 '\n\n' 拼接的最终文本（空串 = 无注入）。解析/目标错误 fail loud 返回 err。
 * @param root 项目根
 * @param target 注入目标（main 或 executor kind）
 * @param availableTools 当前可用工具名集合
 * @returns [err, text]：失败时 err 为片段错误，text 为空串
 */
export function composeLocalDirectivesText(
  root: string,
  target: string,
  availableTools: readonly string[],
): [Error | null, string] {
  const [err, fragments] = readLocalFragments(root)
  if (err !== null) return [err, '']
  try {
    const ordered = filterAndOrderLocal(fragments, target, availableTools)
    return [null, ordered.map((fragment) => fragment.text).join('\n\n')]
  } catch (error) {
    return [toError(error), '']
  }
}

/**
 * 遍历读取并解析全部片段（内部，失败抛错由外层转元组）。
 * @param root 项目根
 * @returns 已解析片段列表
 */
function readAllFragments(root: string): LocalFragment[] {
  const dir = insideWorkloom(root, LOCAL_PROMPTS_REL)
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch (error) {
    if (isEnoent(error)) return [] // 目录不存在 = 无片段，整体零行为
    throw error
  }
  const fragments: LocalFragment[] = []
  for (const entry of entries) {
    if (!entry.isFile()) continue // 目录条目忽略
    if (entry.name.startsWith('.')) continue // 隐藏文件忽略
    if (!entry.name.endsWith('.md')) continue // 非 .md 文件忽略
    const target = targetFromFileName(entry.name)
    const raw = readFileSync(join(dir, entry.name), 'utf8')
    if (raw.trim() === '') continue // 空文件跳过（零行为）
    let parsed: LocalFragment
    try {
      parsed = parseLocalFragment(target, raw)
    } catch (error) {
      // 解析错误补全文件名重新抛出（fail loud 需可定位到文件）。
      if (error instanceof WorkloomLocalPromptError && error.file === '') {
        throw new WorkloomLocalPromptError(entry.name, error.field, error.reason)
      }
      throw error
    }
    if (parsed.text === '') continue // 只有 front-matter 无正文：跳过
    fragments.push(parsed)
  }
  return fragments
}

/**
 * 文件名 → 目标映射；未知 .md 文件名 fail loud（文案列出合法清单）。
 * 导出供 doctor 的 local-prompts 检查逐文件判定加载状态复用同一映射。
 * @param name 文件名（已排除隐藏与非 .md）
 * @returns 目标
 */
export function targetFromFileName(name: string): LocalFragmentTarget {
  const target = TARGET_BY_FILE[name as keyof typeof TARGET_BY_FILE]
  if (target === undefined) {
    throw new WorkloomLocalPromptError(
      name,
      'filename',
      `unknown prompt file (allowed: ${Object.keys(TARGET_BY_FILE).join(', ')})`,
    )
  }
  return target
}

/**
 * 拆分 front-matter 与正文（内部）：首行为 '---' 时按第二个 '---' 行切分；
 * 无分隔符开头返回 null（无 front-matter）。
 * @param body 文件全文
 * @returns {meta, text}：meta 为 front-matter 文本（无则为 null），text 为正文
 */
function splitFrontMatter(body: string): { meta: string | null; text: string } {
  const lines = body.split('\n')
  const first = lines[0]
  if (first === undefined || first.trim() !== FRONT_MATTER_DELIMITER) {
    return { meta: null, text: body }
  }
  for (const [index, line] of lines.entries()) {
    if (index === 0) continue
    if (line.trim() === FRONT_MATTER_DELIMITER) {
      return { meta: lines.slice(1, index).join('\n'), text: lines.slice(index + 1).join('\n') }
    }
  }
  throw new WorkloomLocalPromptError(
    '',
    'front-matter',
    `unterminated front-matter (missing closing "${FRONT_MATTER_DELIMITER}" line)`,
  )
}

/**
 * 解析 front-matter YAML 文本（内部）：解析失败或根非 map 抛错（field 为 front-matter）。
 * @param meta front-matter 文本
 * @returns 字段映射
 */
function parseFrontMatterMeta(meta: string): Record<string, unknown> {
  let doc: unknown
  try {
    doc = parseYaml(meta) ?? {}
  } catch (error) {
    throw new WorkloomLocalPromptError(
      '',
      'front-matter',
      `parse failed: ${String(error)}`,
    )
  }
  if (typeof doc !== 'object' || doc === null || Array.isArray(doc)) {
    throw new WorkloomLocalPromptError('', 'front-matter', 'must be an object map')
  }
  return doc as Record<string, unknown>
}

/**
 * 校验 requiresTools 字段（内部）：缺省为空数组；须为字符串数组，否则抛错
 * （元素错误带下标路径）。
 * @param value 字段值（undefined 表示缺省）
 * @returns 工具名列表
 */
function parseRequiresTools(value: unknown): string[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) {
    throw new WorkloomLocalPromptError(
      '',
      REQUIRES_TOOLS_FIELD,
      'must be an array of tool names',
    )
  }
  for (const [index, tool] of value.entries()) {
    if (typeof tool !== 'string') {
      throw new WorkloomLocalPromptError(
        '',
        `${REQUIRES_TOOLS_FIELD}[${index}]`,
        'must be a string',
      )
    }
  }
  return value.filter((tool): tool is string => typeof tool === 'string')
}

/** 合成排序权重（内部）：all 在前、专属在后。 */
function rankOf(target: LocalFragmentTarget): number {
  return target === 'all' ? RANK_ALL : RANK_TARGET
}

/** @param value 未知异常 @returns 归一化 Error */
function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value))
}

/** @param error 未知异常 @returns 是否文件不存在 */
function isEnoent(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === 'ENOENT'
}