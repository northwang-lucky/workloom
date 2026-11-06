/**
 * CASE 文档结构解析与深度校验（TypeScript）：CASE 文档常量、记录创建、
 * front-matter 解析、小节/条目校验与 Traceability 核对。
 *
 * 设计意图：
 * - 与门禁求值（case-gates）和文件范围（case-scope）拆分：本模块只解析与校验
 *   CASE 文档本体，不读 git、不做任务生命周期判定；
 * - markdown 小节切分与 PRD AC/追溯行解析的单一实现在 prd-structure；
 * - 供 case-gates 复用的解析件（issue/parseDocument/field 族等）在此导出；
 * - core 不读取 assets；模板正文由 adapter 注入，本模块只消费任务目录中的实际文档。
 */
import { readFileSync } from 'node:fs'
import { parse as parseYaml } from 'yaml'

import { acceptanceIds, sectionMap, splitHeadings, traceabilityRows } from './prd-structure.ts'
/** CASE/RESULT 解析目标（task purpose 值域）。 */
export type CasePurpose = 'case-design' | 'execution'

/** CASE_PURPOSES 的键类型。 */
export type CasePurposeKey = 'DESIGN' | 'EXECUTION'

/** 文档 front-matter 元数据（YAML 解析结果）。 */
export type DocumentMeta = Record<string, unknown>

/** 任务 CASE 生命周期记录（task.json case 字段内存形态）。 */
export interface TaskCaseRecord {
  required: boolean
  designSession: string | null
}

/** CASE 结构问题（稳定 code + 英文文案）。 */
export interface CaseStructureIssue {
  code: string
  message: string
}

/** CASE 深度校验选项（任务路径、子任务与实际 git 变更）。 */
export interface CaseStructureOptions {
  taskRelPath?: string
  children?: string[]
  changedFiles?: string[]
}

/** CASE 结构条目（SR 或 C，id + 正文）。 */
export interface CaseItem {
  /** 条目编号（SR1/C2 等）。 */
  id: string
  /** 条目正文（标题行之后）。 */
  body: string
}

export const CASE_FILES = Object.freeze({ document: 'case.md', result: 'case-result.md' })
export const CASE_PURPOSES = Object.freeze({ DESIGN: 'case-design', EXECUTION: 'execution' })
export const CASE_MISSING = 'case.md is missing'

export const CASE_STRUCTURE = Object.freeze({
  caseSections: Object.freeze(['References', 'Scope', 'Static Review', 'Runtime Cases', 'Coverage', 'Traceability']),
  resultSections: Object.freeze([
    'Summary',
    'Static Review Results',
    'Runtime Results',
    'Coverage',
    'Standard Verification',
    'Resolved Findings',
    'Open issues',
  ]),
  srFields: Object.freeze(['Covers', 'Target', 'Checks', 'Expected']),
  cFields: Object.freeze(['Covers', 'Preconditions', 'Steps', 'Expected', 'Evidence', 'Cleanup']),
  coverageFields: Object.freeze(['Tool', 'Instrumentation', 'Aggregate command', 'Scope', 'Exclusions', 'Raw outputs']),
  resultStatuses: Object.freeze(['in_progress', 'passed', 'failed']),
  coverageStatuses: Object.freeze(['generated', 'not_applicable', 'failed']),
})
const REQUIRED_CASE_SECTIONS = CASE_STRUCTURE.caseSections
const SR_FIELDS = CASE_STRUCTURE.srFields
const C_FIELDS = CASE_STRUCTURE.cFields
const COVERAGE_FIELDS = CASE_STRUCTURE.coverageFields

/**
 * 创建带默认键的 CASE 记录：新记录只含 required 与 designSession；
 * 既有记录的历史字段原样保留，但不参与确认、执行或结果校验。
 * @param {boolean} required 是否启用新 CASE 通过条件
 * @param {TaskCaseRecord | null} [previous] 既有生命周期数据
 * @returns {TaskCaseRecord} 完整 CASE 记录
 */

/**
 * 创建带默认键的 CASE 记录：新记录只含 required 与 designSession；
 * 既有记录的历史字段原样保留，但不参与确认、执行或结果校验。
 * @param {boolean} required 是否启用新 CASE 通过条件
 * @param {TaskCaseRecord | null} [previous] 既有生命周期数据
 * @returns {TaskCaseRecord} 完整 CASE 记录
 */
export function createCaseRecord(required: boolean, previous: TaskCaseRecord | null = null): TaskCaseRecord {
  return {
    ...previous,
    required,
    designSession: previous?.designSession ?? null,
  }
}

/**
 * @param {string} code 机器可读问题码
 * @param {string} message 英文问题描述
 * @returns {CaseStructureIssue} 结构化问题
 */

/**
 * @param {string} code 机器可读问题码
 * @param {string} message 英文问题描述
 * @returns {CaseStructureIssue} 结构化问题
 */
export function issue(code: string, message: string): CaseStructureIssue {
  return { code, message }
}

/**
 * @param path 绝对文件路径
 * @returns 文件全文或 null
 */
export function readIfExists(path: string): string | null {
  try {
    return readFileSync(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return null
    throw error
  }
}



/**
 * @param {string | null} content 文档全文或 null
 * @param {string} missingCode 文档缺失问题码
 * @param {string} missingMessage 文档缺失文案
 * @param {CaseStructureIssue[]} issues 问题收集器
 * @returns {{meta: DocumentMeta | null, body: string}} YAML 与正文
 */
export function parseDocument(
  content: string | null,
  missingCode: string,
  missingMessage: string,
  issues: CaseStructureIssue[],
): { meta: Record<string, unknown> | null; body: string } {
  if (content === null) {
    issues.push(issue(missingCode, missingMessage))
    return { meta: null, body: '' }
  }
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(content)
  if (match === null) {
    issues.push(issue('frontmatter_missing', 'document must start with YAML front matter'))
    return { meta: null, body: content }
  }
  try {
    const meta = parseYaml(match[1] ?? '')
    if (typeof meta !== 'object' || meta === null || Array.isArray(meta)) {
      issues.push(issue('frontmatter_invalid', 'YAML front matter must be an object'))
      return { meta: null, body: content.slice(match[0].length) }
    }
    return { meta, body: content.slice(match[0].length) }
  } catch (error) {
    issues.push(issue('frontmatter_invalid', `invalid YAML front matter: ${String(error)}`))
    return { meta: null, body: content.slice(match[0].length) }
  }
}

/**
 * @param {string} body 小节正文
 * @param {string} name 字段名
 * @returns {boolean} 字段是否存在
 */
function hasField(body: string, name: string): boolean {
  return new RegExp(`^- ${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:`, 'm').test(body)
}

/**
 * @param {string} body 小节正文
 * @param {string} name 字段名
 * @returns {string | null} 去除外层反引号后的字段值
 */
export function field(body: string, name: string): string | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const value = new RegExp(`^- ${escaped}:\\s*(.*)$`, 'm').exec(body)?.[1]?.trim() ?? null
  return value === null ? null : value.replace(/^`(.*)`$/, '$1')
}

/**
 * @param {string} body 小节正文
 * @param {string} name 字段名
 * @returns {string} 字段及其缩进续行
 */
export function fieldBlock(body: string, name: string): string {
  const lines = body.split('\n')
  const start = lines.findIndex((line) => line.startsWith(`- ${name}:`))
  if (start === -1) return ''
  const kept = [lines[start] ?? '']
  for (const line of lines.slice(start + 1)) {
    if (/^- \S[^:]*:/.test(line) || /^#{1,6}\s/.test(line)) break
    kept.push(line)
  }
  return kept.join('\n')
}

/**
 * @param {string} body 小节正文
 * @param {readonly string[]} names 必需字段
 * @param {string} owner 所属小节或条目
 * @param {CaseStructureIssue[]} issues 问题收集器
 */
function requireFields(
  body: string,
  names: readonly string[],
  owner: string,
  issues: CaseStructureIssue[],
): void {
  for (const name of names) {
    if (!hasField(body, name)) issues.push(issue('field_missing', `${owner} missing field "${name}"`))
  }
}

/**
 * @param {string} body 小节正文
 * @param {string} prefix SR 或 C
 * @param {readonly string[]} fields 每条目的必需字段
 * @param {CaseStructureIssue[]} issues 问题收集器
 * @returns {CaseItem[]} 有序审查或用例条目
 */
export function parseItems(
  body: string,
  prefix: string,
  fields: readonly string[],
  issues: CaseStructureIssue[],
): { id: string; body: string }[] {
  const sections = splitHeadings(body, 3)
  const items: { id: string; body: string }[] = []
  for (const section of sections) {
    const match = new RegExp(`^${prefix}(\\d+)\\s+(.+)$`).exec(section.heading)
    if (match === null) {
      issues.push(issue('item_invalid', `invalid ${prefix} heading "${section.heading}"`))
      continue
    }
    const id = `${prefix}${match[1] ?? ''}`
    requireFields(section.body, fields, id, issues)
    items.push({ id, body: section.body })
  }
  if (items.length === 0) issues.push(issue('items_missing', `at least one ${prefix} item is required`))
  items.forEach((item, index) => {
    if (item.id !== `${prefix}${index + 1}`) {
      issues.push(issue('item_order_invalid', `${prefix} ids must be sequential from ${prefix}1`))
    }
  })
  return items
}

/**
 * 判断文件是否命中一条排除规则（通用匹配，格式保持 `- \`规则\`: 原因` 不变）：
 * - 以 `/` 结尾 → 目录前缀，命中该目录下任意层级的文件；
 * - 含 `*` → 段通配：`*` 匹配单个路径段内的任意字符（不跨 `/`），
 *   `**` 作为独立段匹配任意层级（含零层）；
 * - 其余 → 精确路径匹配。
 * @param {string} pattern 排除规则
 * @param {string} file repo 相对路径
 * @returns {boolean} 是否命中
 */
function exclusionMatches(pattern: string, file: string): boolean {
  if (pattern.endsWith('/')) return file.startsWith(pattern)
  if (!pattern.includes('*')) return pattern === file
  const segments = pattern.split('/')
  let source = '^'
  for (const [index, segment] of segments.entries()) {
    if (segment === '**') {
      // `**` 吞并自身与后续分隔符：尾段匹配任意剩余路径，中段匹配零层或多层目录。
      source += index === segments.length - 1 ? '.*' : '(?:[^/]+/)*'
      continue
    }
    source += segment
      .split('*')
      .map((piece) => piece.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
      .join('[^/]*')
    if (index < segments.length - 1) source += '/'
  }
  return new RegExp(`${source}$`).test(file)
}

/**
 * @param {Map<string, string>} exclusions 排除规则到原因
 * @param {string} file repo 相对路径
 * @returns {boolean} 是否被任一规则排除
 */
export function isExcluded(exclusions: Map<string, string>, file: string): boolean {
  for (const pattern of exclusions.keys()) {
    if (exclusionMatches(pattern, file)) return true
  }
  return false
}

/**
 * @param {string} body Coverage 小节正文
 * @returns {Map<string, string>} 排除规则到原因
 */
export function parseExclusions(body: string): Map<string, string> {
  const exclusions = new Map<string, string>()
  const block = fieldBlock(body, 'Exclusions')
  for (const line of block.split('\n')) {
    const match = /^\s*-\s+`?([^`:]+?)`?\s*:\s*(.+)$/.exec(line)
    if (match?.[1] !== undefined && match[2] !== undefined) {
      exclusions.set(match[1].trim(), match[2].trim())
    }
  }
  return exclusions
}

/**
 * @param {CaseItem[]} items 静态审查条目
 * @returns {string[]} SR 声明的文件路径
 */
export function targetFiles(items: readonly { id: string; body: string }[]): string[] {
  return items.map((item) => (field(item.body, 'Target') ?? '').split('#')[0]?.replaceAll('`', '').trim() ?? '').filter(Boolean)
}

/**
 * @param {string} body Traceability 正文
 * @param {string} prdContent PRD 全文
 * @param {CaseItem[]} srItems 静态审查条目
 * @param {CaseItem[]} cItems 真实运行用例
 * @param {CaseStructureIssue[]} issues 问题收集器
 */
function validateTraceability(
  body: string,
  prdContent: string,
  srItems: readonly { id: string; body: string }[],
  cItems: readonly { id: string; body: string }[],
  issues: CaseStructureIssue[],
): void {
  const required = acceptanceIds(prdContent)
  if (required.length === 0) issues.push(issue('acceptance_missing', 'PRD has no AC ids'))
  const srIds = new Set(srItems.map((item) => item.id))
  const cIds = new Set(cItems.map((item) => item.id))
  const rows = traceabilityRows(body)
  for (const ac of required) {
    const row = rows.get(ac)
    if (row === undefined) {
      issues.push(issue('traceability_missing', `${ac} has no Traceability row`))
      continue
    }
    if (row.srRefs.length + row.cRefs.length === 0) {
      issues.push(issue('traceability_empty', `${ac} has no SR or C reference`))
      continue
    }
    for (const id of row.srRefs) if (!srIds.has(id)) issues.push(issue('traceability_unknown', `${ac} references unknown ${id}`))
    for (const id of row.cRefs) if (!cIds.has(id)) issues.push(issue('traceability_unknown', `${ac} references unknown ${id}`))
  }
}

/**
 * 深度校验 CASE。
 * @param {string | null} caseContent CASE 全文或 null
 * @param {string} prdContent PRD 全文
 * @param {CaseStructureOptions} [options] 任务路径、子任务和实际 git 变更
 * @returns {CaseStructureIssue[]} 全部结构问题
 */
export function inspectCaseStructure(
  caseContent: string | null,
  prdContent: string,
  options: CaseStructureOptions = {},
): CaseStructureIssue[] {
  const issues: CaseStructureIssue[] = []
  const { meta, body } = parseDocument(caseContent, 'case_missing', CASE_MISSING, issues)
  if (meta === null) return issues
  if (meta.version !== 1) issues.push(issue('version_invalid', 'CASE version must be 1'))
  if (typeof meta.task !== 'string' || meta.task === '') issues.push(issue('task_invalid', 'CASE task is required'))
  if (options.taskRelPath !== undefined && meta.task !== options.taskRelPath) {
    issues.push(issue('task_mismatch', `CASE task must be ${options.taskRelPath}`))
  }
  if (!/^# CASE:\s+\S/m.test(body)) issues.push(issue('title_missing', 'CASE missing H1 title'))
  const sections = sectionMap(body, 2)
  for (const name of REQUIRED_CASE_SECTIONS) {
    if (!sections.has(name)) issues.push(issue('section_missing', `CASE section "${name}" is missing`))
  }
  const references = sections.get('References') ?? ''
  requireFields(references, ['PRD', 'Implementation', 'Code target', 'Source task'], 'References', issues)
  const scope = sections.get('Scope') ?? ''
  requireFields(scope, ['Requirements', 'Acceptance criteria', 'Out of scope'], 'Scope', issues)
  const srItems = parseItems(sections.get('Static Review') ?? '', 'SR', SR_FIELDS, issues)
  const cItems = parseItems(sections.get('Runtime Cases') ?? '', 'C', C_FIELDS, issues)
  const coverage = sections.get('Coverage') ?? ''
  requireFields(coverage, COVERAGE_FIELDS, 'Coverage', issues)
  validateTraceability(sections.get('Traceability') ?? '', prdContent, srItems, cItems, issues)
  const exclusions = parseExclusions(coverage)
  const srFiles = new Set(targetFiles(srItems))
  for (const file of options.changedFiles ?? []) {
    if (file.startsWith('.workloom/') || isExcluded(exclusions, file)) continue
    if (!srFiles.has(file)) issues.push(issue('changed_file_unreviewed', `${file} has no Static Review target`))
  }
  const children = options.children ?? []
  if (children.length > 0) {
    const implementation = fieldBlock(references, 'Implementation')
    let previous = -1
    for (const child of children) {
      const pointer = `${child}/plan.md`
      const at = implementation.indexOf(pointer)
      if (at === -1) issues.push(issue('parent_plan_missing', `Implementation missing ${pointer}`))
      if (at <= previous) issues.push(issue('parent_plan_order', 'child PLAN paths must follow task.children order'))
      previous = at
    }
  }
  return issues
}


