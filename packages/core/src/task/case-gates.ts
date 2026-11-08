/**
 * CASE 门禁求值（TypeScript）：最终执行前置门禁与 check/archive 共用的
 * RESULT 深度硬校验。
 *
 * 设计意图：
 * - 与文档结构（case-structure）和文件范围（case-scope）拆分：本模块只判定
 *   「CASE/RESULT 是否放行」，解析件全部复用 case-structure 的导出；
 * - 仅 required=true 的新流程任务受约束；RESULT 校验一次返回全部问题。
 */
import { existsSync, readFileSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'

import { EXECUTOR_ROLES, tryNormalizeExecutorRole } from '../dispatch/executor-roles.ts'
import { sectionMap, splitHeadings } from './prd-structure.ts'
import {
  CASE_FILES,
  CASE_MISSING,
  CASE_STRUCTURE,
  field,
  fieldBlock,
  inspectCaseStructure,
  isExcluded,
  issue,
  parseDocument,
  parseExclusions,
  parseItems,
  targetFiles,
} from './case-structure.ts'
import { listCaseChangedFiles, taskDirectory, worktreeDirectory } from './case-scope.ts'
import type { CaseStructureIssue, CaseStructureOptions } from './case-structure.ts'
import type { TaskRecord } from './storage/index.ts'

/** RESULT 缺失文案。 */
const RESULT_MISSING = 'case-result.md is missing'

/** 执行会话链回溯的角色（checker 派发记录；值域单源在 executor-roles）。 */
const CHECK_ROLE = EXECUTOR_ROLES.CHECKER

const REQUIRED_RESULT_SECTIONS = CASE_STRUCTURE.resultSections
const SR_FIELDS = CASE_STRUCTURE.srFields
const C_FIELDS = CASE_STRUCTURE.cFields

/**
 * @param path 绝对文件路径
 * @returns 文件全文或 null
 */
function readIfExists(path: string): string | null {
  try {
    return readFileSync(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return null
    throw error
  }
}

/**
 * 最终执行前置：仅 required=true 的新流程任务受约束。
 * @param {string} root 项目根
 * @param {string} taskRelPath 任务相对路径
 * @param {TaskRecord} task 任务记录
 * @returns {string[]} 缺失项描述列表
 */
export function evaluateCaseExecutionGate(root: string, taskRelPath: string, task: TaskRecord): string[] {
  if (task.case?.required !== true) return []
  const missing: string[] = []
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
function safeTaskFile(taskDir: string, path: unknown): string | null {
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
function validateReferencedFiles(content: string, taskDir: string, issues: CaseStructureIssue[]): void {
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
function sessionChainReaches(task: TaskRecord, from: unknown, target: unknown): boolean {
  if (from === target) return true
  const seen = new Set()
  let current = from
  while (typeof current === 'string' && current !== '' && !seen.has(current)) {
    seen.add(current)
    const link = task.dispatches.find(
      // 记录值经兼容读归一后比较（历史旧值记录同样识别为 checker；脏值跳过）。
      (entry) => tryNormalizeExecutorRole(entry.kind) === CHECK_ROLE && entry.childId === current && typeof entry.fallbackOf === 'string',
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
function tablePaths(body: string): string[] {
  const paths: string[] = []
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
function tableExclusions(body: string): Map<string, string> {
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
function sameExclusions(left: Map<string, string>, right: Map<string, string>): boolean {
  return left.size === right.size && [...left].every(([path, reason]) => right.get(path) === reason)
}

/**
 * @param {string[]} left 左侧有序集合
 * @param {string[]} right 右侧有序集合
 * @returns {boolean} 逐项相等
 */
function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

/**
 * @param {string} body RESULT 条目正文
 * @returns {{id: string, status: string | null}[]} 条目状态
 */
function resultItems(body: string): { id: string; status: string | null }[] {
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
export function evaluateCaseOutcomeGate(
  root: string,
  taskRelPath: string,
  task: TaskRecord,
  options: CaseStructureOptions = {},
): CaseStructureIssue[] {
  if (task.case?.required !== true) return []
  const issues = evaluateCaseExecutionGate(root, taskRelPath, task).map((message) => issue('case_execution', message))
  const taskDir = taskDirectory(root, taskRelPath)
  const caseContent = readIfExists(join(taskDir, CASE_FILES.document))
  const prdContent = readIfExists(join(taskDir, 'prd.md'))
  let gitErr: Error | null = null
  let changedFiles: string[] | null = options.changedFiles ?? null
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


