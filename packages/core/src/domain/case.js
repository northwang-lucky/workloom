/**
 * CASE 文档、执行结果与文件范围的统一解析和校验（纯 JS + JSDoc）。
 * core 不读取 assets；模板正文由 adapter 注入，本模块只消费任务目录中的实际文档。
 */
import { existsSync, readFileSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { parse as parseYaml } from 'yaml'

import { gitChangedFilesSync } from './git.js'
import { insideWorkloom } from './locate.js'

/** @typedef {import('./case.d.ts').CaseStructureIssue} CaseStructureIssue */
/** @typedef {import('./case.d.ts').CaseStructureOptions} CaseStructureOptions */
/** @typedef {import('./case.d.ts').TaskCaseRecord} TaskCaseRecord */
/** @typedef {import('./task-store.d.ts').TaskRecord} TaskRecord */
/** @typedef {{id: string, body: string}} CaseItem */
/** @typedef {Record<string, unknown>} DocumentMeta */

export const CASE_FILES = Object.freeze({ document: 'case.md', result: 'case-result.md' })
export const CASE_PURPOSES = Object.freeze({ DESIGN: 'case-design', EXECUTION: 'execution' })
export const CASE_MISSING = 'case.md is missing'

const RESULT_MISSING = 'case-result.md is missing'
const CHECK_KIND = 'check'
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
const REQUIRED_RESULT_SECTIONS = CASE_STRUCTURE.resultSections
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
export function createCaseRecord(required, previous = null) {
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
function issue(code, message) {
  return { code, message }
}

/**
 * @param {string} path 绝对文件路径
 * @returns {string | null} 文件全文或 null
 */
function readIfExists(path) {
  try {
    return readFileSync(path, 'utf8')
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error)?.code === 'ENOENT') return null
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
function parseDocument(content, missingCode, missingMessage, issues) {
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
 * 按标题级别切分，忽略围栏代码块中的伪标题。
 * @param {string} content Markdown 正文
 * @param {number} level 标题级别（2 或 3）
 * @returns {{heading: string, body: string}[]} 有序小节
 */
function splitHeadings(content, level) {
  /** @type {{heading: string, lines: string[]}[]} */
  const sections = []
  /** @type {{heading: string, lines: string[]} | null} */
  let current = null
  let fence = ''
  const heading = new RegExp(`^#{${level}}\\s+(.+)$`)
  for (const line of content.split('\n')) {
    const marker = /^\s*(`{3,}|~{3,})/.exec(line)?.[1]?.[0]
    if (marker !== undefined) {
      if (fence === '') fence = marker
      else if (fence === marker) fence = ''
    }
    const match = fence === '' ? heading.exec(line) : null
    if (match !== null) {
      current = { heading: match[1]?.trim() ?? '', lines: [] }
      sections.push(current)
      continue
    }
    if (current !== null) current.lines.push(line)
  }
  return sections.map((section) => ({
    heading: section.heading,
    body: section.lines.join('\n').trim(),
  }))
}

/**
 * @param {string} content Markdown 正文
 * @param {number} level 标题级别
 * @returns {Map<string, string>} 标题到正文的映射
 */
function sectionMap(content, level) {
  return new Map(splitHeadings(content, level).map((section) => [section.heading, section.body]))
}

/**
 * @param {string} body 小节正文
 * @param {string} name 字段名
 * @returns {boolean} 字段是否存在
 */
function hasField(body, name) {
  return new RegExp(`^- ${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:`, 'm').test(body)
}

/**
 * @param {string} body 小节正文
 * @param {string} name 字段名
 * @returns {string | null} 去除外层反引号后的字段值
 */
function field(body, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const value = new RegExp(`^- ${escaped}:\\s*(.*)$`, 'm').exec(body)?.[1]?.trim() ?? null
  return value === null ? null : value.replace(/^`(.*)`$/, '$1')
}

/**
 * @param {string} body 小节正文
 * @param {string} name 字段名
 * @returns {string} 字段及其缩进续行
 */
function fieldBlock(body, name) {
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
function requireFields(body, names, owner, issues) {
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
function parseItems(body, prefix, fields, issues) {
  const sections = splitHeadings(body, 3)
  /** @type {CaseItem[]} */
  const items = []
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
function exclusionMatches(pattern, file) {
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
function isExcluded(exclusions, file) {
  for (const pattern of exclusions.keys()) {
    if (exclusionMatches(pattern, file)) return true
  }
  return false
}

/**
 * @param {string} body Coverage 小节正文
 * @returns {Map<string, string>} 排除规则到原因
 */
function parseExclusions(body) {
  /** @type {Map<string, string>} */
  const exclusions = new Map()
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
function targetFiles(items) {
  return items.map((item) => (field(item.body, 'Target') ?? '').split('#')[0]?.replaceAll('`', '').trim() ?? '').filter(Boolean)
}

/**
 * @param {string} prdContent PRD 全文
 * @returns {string[]} 排序后的 AC 编号
 */
function acceptanceIds(prdContent) {
  const body = sectionMap(prdContent, 2).get('Acceptance Criteria') ?? ''
  return [...new Set(body.match(/AC\d+/g) ?? [])].sort((a, b) => Number(a.slice(2)) - Number(b.slice(2)))
}

/**
 * 解析 Traceability 表格数据行（按列）：AC 列 / Static review 列 / Runtime cases 列。
 * 引用只从各自列提取——AC 编号本身（如 AC1）不充当 C 引用（修复同号 C 误匹配）。
 * @param {string} body Traceability 小节正文
 * @returns {Map<string, {srRefs: string[], cRefs: string[]}>} AC 编号到该行引用
 */
function traceabilityRows(body) {
  /** @type {Map<string, {srRefs: string[], cRefs: string[]}>} */
  const rows = new Map()
  for (const line of body.split('\n')) {
    if (!line.trim().startsWith('|')) continue
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim().replaceAll('`', ''))
    if (cells.length < 3) continue
    const ac = cells[0] ?? ''
    // AC 列正则已排除表头（AC）与分隔行（---）；`-` 是合法的空列占位，
    // 单独 SR 或 C 列为空都允许，只有两列皆空才报 traceability_empty。
    if (!/^AC\d+$/.test(ac)) continue
    rows.set(ac, {
      srRefs: cells[1]?.match(/SR\d+/g) ?? [],
      cRefs: cells[2]?.match(/C\d+/g) ?? [],
    })
  }
  return rows
}

/**
 * @param {string} body Traceability 正文
 * @param {string} prdContent PRD 全文
 * @param {CaseItem[]} srItems 静态审查条目
 * @param {CaseItem[]} cItems 真实运行用例
 * @param {CaseStructureIssue[]} issues 问题收集器
 */
function validateTraceability(body, prdContent, srItems, cItems, issues) {
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
export function inspectCaseStructure(caseContent, prdContent, options = {}) {
  /** @type {CaseStructureIssue[]} */
  const issues = []
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

/**
 * @param {string} root 项目根
 * @param {string} taskRelPath 任务相对路径
 * @returns {string} 任务目录绝对路径
 */
function taskDirectory(root, taskRelPath) {
  return insideWorkloom(root, taskRelPath)
}

/**
 * @param {string} root 项目根
 * @param {TaskRecord} task 任务记录
 * @returns {string} 代码 worktree 或项目根
 */
function worktreeDirectory(root, task) {
  return typeof task.worktree_path === 'string' && task.worktree_path !== ''
    ? resolve(root, task.worktree_path)
    : root
}

/**
 * 返回实际 git 变更；无变更时由结果校验回退到 SR 声明范围。
 * @param {string} root 项目根
 * @param {TaskRecord} task 任务记录
 * @returns {[Error | null, string[] | null]} git 错误或变更文件列表
 */
export function listCaseChangedFiles(root, task) {
  return gitChangedFilesSync(worktreeDirectory(root, task))
}

/**
 * 最终执行前置：仅 required=true 的新流程任务受约束。
 * @param {string} root 项目根
 * @param {string} taskRelPath 任务相对路径
 * @param {TaskRecord} task 任务记录
 * @returns {string[]} 缺失项描述列表
 */
export function evaluateCaseExecutionGate(root, taskRelPath, task) {
  if (task.case?.required !== true) return []
  const missing = []
  const content = readIfExists(join(taskDirectory(root, taskRelPath), CASE_FILES.document))
  if (content === null) return [CASE_MISSING]
  // 无哈希判据：CASE 复核由主会话对照 PRD/PLAN/代码完成，机器面只要求
  // 文档存在且设计会话链可用（复核满意后直接续接 designSession 执行）。
  if (typeof task.case.designSession !== 'string' || task.case.designSession === '') {
    missing.push('case.designSession is missing')
  }
  return missing
}

/**
 * @param {string} taskDir 任务目录绝对路径
 * @param {unknown} path 文档声明的相对路径
 * @returns {string | null} 任务目录内的绝对路径；越界返回 null
 */
function safeTaskFile(taskDir, path) {
  if (typeof path !== 'string' || path === '' || isAbsolute(path)) return null
  const absolute = resolve(taskDir, path)
  const rel = relative(taskDir, absolute)
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) return null
  return absolute
}

/**
 * @param {string} content RESULT 正文
 * @param {string} taskDir 任务目录绝对路径
 * @param {CaseStructureIssue[]} issues 问题收集器
 */
function validateReferencedFiles(content, taskDir, issues) {
  for (const match of content.matchAll(/`((?:case-evidence|coverage)\/[^`]+)`/g)) {
    const path = safeTaskFile(taskDir, match[1])
    if (path === null) issues.push(issue('artifact_path_invalid', `${match[1]} escapes the task directory`))
    else if (!existsSync(path)) issues.push(issue('artifact_missing', `${match[1]} does not exist`))
  }
}

/**
 * @param {TaskRecord} task 任务记录
 * @param {unknown} from RESULT 声明的执行会话
 * @param {unknown} target CASE 设计会话
 * @returns {boolean} 同会话或 fallbackOf 可达
 */
function sessionChainReaches(task, from, target) {
  if (from === target) return true
  const seen = new Set()
  let current = from
  while (typeof current === 'string' && current !== '' && !seen.has(current)) {
    seen.add(current)
    const link = task.dispatches.find(
      (entry) => entry.kind === CHECK_KIND && entry.childId === current && typeof entry.fallbackOf === 'string',
    )
    if (link === undefined) return false
    if (link.fallbackOf === target) return true
    current = link.fallbackOf
  }
  return false
}

/**
 * @param {string} body Markdown 表格正文
 * @returns {string[]} 排序后的首列路径
 */
function tablePaths(body) {
  /** @type {string[]} */
  const paths = []
  for (const line of body.split('\n')) {
    const match = /^\|\s*`([^`]+)`\s*\|/.exec(line)
    if (match?.[1] !== undefined) paths.push(match[1])
  }
  return paths.sort()
}

/**
 * @param {string} body Exclusions 表格正文
 * @returns {Map<string, string>} RESULT 声明的排除文件与原因
 */
function tableExclusions(body) {
  /** @type {Map<string, string>} */
  const exclusions = new Map()
  for (const line of body.split('\n')) {
    const match = /^\|\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|/.exec(line)
    if (match?.[1] !== undefined && match[2] !== undefined) {
      exclusions.set(match[1], match[2])
    }
  }
  return exclusions
}

/**
 * @param {Map<string, string>} left CASE 排除集合
 * @param {Map<string, string>} right RESULT 排除集合
 * @returns {boolean} 路径与原因逐项一致
 */
function sameExclusions(left, right) {
  return left.size === right.size && [...left].every(([path, reason]) => right.get(path) === reason)
}

/**
 * @param {string[]} left 左侧有序集合
 * @param {string[]} right 右侧有序集合
 * @returns {boolean} 逐项相等
 */
function sameStrings(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

/**
 * @param {string} body RESULT 条目正文
 * @returns {{id: string, status: string | null}[]} 条目状态
 */
function resultItems(body) {
  return splitHeadings(body, 3).map((section) => ({
    id: section.heading.split(' ')[0] ?? '',
    status: field(section.body, 'Status'),
  }))
}

/**
 * 最终 check/archive 共用的硬校验。
 * @param {string} root 项目根
 * @param {string} taskRelPath 任务相对路径
 * @param {TaskRecord} task 任务记录
 * @param {CaseStructureOptions} [options] 变更文件等求值选项
 * @returns {CaseStructureIssue[]} 全部核心问题
 */
export function evaluateCaseOutcomeGate(root, taskRelPath, task, options = {}) {
  if (task.case?.required !== true) return []
  const issues = evaluateCaseExecutionGate(root, taskRelPath, task).map((message) => issue('case_execution', message))
  const taskDir = taskDirectory(root, taskRelPath)
  const caseContent = readIfExists(join(taskDir, CASE_FILES.document))
  const prdContent = readIfExists(join(taskDir, 'prd.md'))
  /** @type {Error | null} */
  let gitErr = null
  /** @type {string[] | null} */
  let changedFiles = options.changedFiles ?? null
  if (options.changedFiles === undefined) {
    const result = listCaseChangedFiles(root, task)
    gitErr = result[0]
    changedFiles = result[1]
  }
  if (gitErr !== null) issues.push(issue('git_changed_files', gitErr.message))
  if (caseContent !== null && prdContent !== null) {
    issues.push(...inspectCaseStructure(caseContent, prdContent, {
      taskRelPath,
      children: task.children,
      changedFiles: changedFiles ?? [],
    }))
  }
  const resultContent = readIfExists(join(taskDir, CASE_FILES.result))
  const parsed = parseDocument(resultContent, 'result_missing', RESULT_MISSING, issues)
  if (parsed.meta === null || caseContent === null || resultContent === null) return issues
  const meta = parsed.meta
  const body = parsed.body
  if (meta.version !== 1) issues.push(issue('result_version', 'RESULT version must be 1'))
  if (meta.task !== taskRelPath) issues.push(issue('result_task', 'RESULT task does not match the active task'))
  if (typeof meta.codeBaseline !== 'string' || meta.codeBaseline === '') issues.push(issue('result_baseline', 'codeBaseline is required'))
  if (meta.status !== 'passed') issues.push(issue('result_status', 'RESULT status must be passed'))
  if (typeof meta.startedAt !== 'string' || meta.startedAt === '') issues.push(issue('result_started', 'startedAt is required'))
  if (typeof meta.completedAt !== 'string' || meta.completedAt === '') issues.push(issue('result_completed', 'completedAt is required for a passed result'))
  if (!sessionChainReaches(task, meta.checkSession, task.case.designSession)) {
    issues.push(issue('result_session', 'checkSession is neither the design session nor linked by fallbackOf'))
  }
  const caseSections = sectionMap(caseContent.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, ''), 2)
  const srExpected = parseItems(caseSections.get('Static Review') ?? '', 'SR', SR_FIELDS, []).map((item) => item.id)
  const cExpected = parseItems(caseSections.get('Runtime Cases') ?? '', 'C', C_FIELDS, []).map((item) => item.id)
  const sections = sectionMap(body, 2)
  for (const name of REQUIRED_RESULT_SECTIONS) {
    if (!sections.has(name)) issues.push(issue('result_section', `RESULT section "${name}" is missing`))
  }
  const srResults = resultItems(sections.get('Static Review Results') ?? '')
  const cResults = resultItems(sections.get('Runtime Results') ?? '')
  if (!sameStrings(srResults.map((item) => item.id).sort(), [...srExpected].sort())) {
    issues.push(issue('result_sr_set', 'Static Review Results do not match the CASE ids'))
  }
  if (!sameStrings(cResults.map((item) => item.id).sort(), [...cExpected].sort())) {
    issues.push(issue('result_c_set', 'Runtime Results do not match the CASE ids'))
  }
  for (const item of [...srResults, ...cResults]) {
    if (item.status !== 'passed') issues.push(issue('result_item', `${item.id} status must be passed, found ${String(item.status)}`))
  }
  const coverage = sections.get('Coverage') ?? ''
  const coverageStatus = field(coverage, 'Status')
  const summary = sections.get('Summary') ?? ''
  if (field(summary, 'Coverage') !== coverageStatus) issues.push(issue('coverage_summary', 'Summary coverage status differs from Coverage'))
  if (field(summary, 'Standard verification') !== 'passed') issues.push(issue('verification_summary', 'Standard verification must be passed'))
  const exclusions = parseExclusions(caseSections.get('Coverage') ?? '')
  const resultExclusions = tableExclusions(
    splitHeadings(coverage, 3).find((item) => item.heading === 'Exclusions')?.body ?? '',
  )
  if (!sameExclusions(exclusions, resultExclusions)) {
    issues.push(issue('coverage_exclusions', 'RESULT Exclusions must match CASE paths and reasons'))
  }
  const srFiles = targetFiles(parseItems(caseSections.get('Static Review') ?? '', 'SR', SR_FIELDS, []))
  const basis = changedFiles !== null && changedFiles.length > 0 ? changedFiles : srFiles
  const expected = [
    ...new Set(
      basis.filter(
        (file) => !file.startsWith('.workloom/') && !isExcluded(exclusions, file) && existsSync(join(worktreeDirectory(root, task), file)),
      ),
    ),
  ].sort()
  const actualCoverageFiles = tablePaths(splitHeadings(coverage, 3).find((item) => item.heading === 'Changed Files')?.body ?? '')
  if (coverageStatus === 'not_applicable') {
    if (expected.length > 0) issues.push(issue('coverage_not_applicable', 'not_applicable requires an empty coverable file scope'))
    if (actualCoverageFiles.length > 0) issues.push(issue('coverage_files', 'not_applicable requires an empty Changed Files table'))
    if (![null, '', 'none', 'N/A', 'n/a'].includes(field(coverage, 'Overall lines'))) {
      issues.push(issue('coverage_overall_na', 'not_applicable must use N/A for Overall lines'))
    }
    if (exclusions.size === 0) issues.push(issue('coverage_exclusions', 'not_applicable requires exclusion reasons'))
  } else if (coverageStatus === 'generated') {
    if (!/^\d+\/\d+\s+\(\d+(?:\.\d+)?%\)$/.test(field(coverage, 'Overall lines') ?? '')) {
      issues.push(issue('coverage_overall', 'Overall lines must be covered/total (percentage)'))
    }
    if (!sameStrings(actualCoverageFiles, expected)) {
      issues.push(issue('coverage_files', `Changed Files must equal ${expected.join(', ') || '<empty>'}`))
    }
    if ((fieldBlock(coverage, 'Raw reports').match(/`coverage\/[^`]+`/g) ?? []).length === 0) {
      issues.push(issue('coverage_raw', 'generated coverage requires a raw report under coverage/'))
    }
  } else {
    issues.push(issue('coverage_status', `coverage must be generated or not_applicable, found ${String(coverageStatus)}`))
  }
  const verification = sections.get('Standard Verification') ?? ''
  const commands = verification.split('\n').filter((line) => /^\|.*\|\s*`?0`?\s*\|/.test(line))
  if (commands.length === 0) issues.push(issue('verification_commands', 'Standard Verification needs at least one exit-code-0 row'))
  if (!verification.split('\n').every((line) => !line.startsWith('| `') || /\|\s*`?0`?\s*\|/.test(line))) {
    issues.push(issue('verification_exit', 'every verification command must exit 0'))
  }
  const openIssues = splitHeadings(body, 2).at(-1)
  if (openIssues?.heading !== 'Open issues' || openIssues.body.trim() !== '- none') {
    issues.push(issue('open_issues', 'Open issues must be the final section and contain only - none'))
  }
  validateReferencedFiles(body, taskDir, issues)
  return issues
}

