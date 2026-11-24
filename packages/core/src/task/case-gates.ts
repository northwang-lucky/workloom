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
} from './case-structure.ts'
import { DEFAULT_THRESHOLD } from '../workspace/config-defaults.ts'
import { loadConfig } from '../workspace/config-load.ts'
import { listCaseChangedFiles, listCaseChangedLines, taskDirectory, worktreeDirectory } from './case-scope.ts'
import {
  buildFormatHints,
  computeDiffCoverage,
  isDiffCoverageArtifact,
  meetsThreshold,
} from './coverage-compute.ts'
import type { CaseStructureIssue, CaseStructureOptions } from './case-structure.ts'
import type { WorkloomConfig } from '../workspace/config.d.ts'
import type { ChangedLineRange } from '../workspace/git-query.ts'
import type { TaskRecord } from './storage/index.ts'

/** RESULT 缺失文案。 */
const RESULT_MISSING = 'case-result.md is missing'

/** CASE 门禁问题码（稳定英文 snake_case；字面量单源，避免重复字面量）。 */
const ISSUE_CODES = Object.freeze({
  ARTIFACT_MISSING: 'artifact_missing',
  ARTIFACT_PATH_INVALID: 'artifact_path_invalid',
  CASE_EXECUTION: 'case_execution',
  COVERAGE_CONFIG: 'coverage_config',
  COVERAGE_BELOW_REASONS: 'coverage_below_reasons',
  COVERAGE_EXCLUSIONS: 'coverage_exclusions',
  COVERAGE_FILES: 'coverage_files',
  COVERAGE_MISSING_FILE: 'coverage_missing_file',
  COVERAGE_NA_REASON: 'coverage_na_reason',
  COVERAGE_NOT_APPLICABLE: 'coverage_not_applicable',
  COVERAGE_OVERALL: 'coverage_overall',
  COVERAGE_OVERALL_NA: 'coverage_overall_na',
  COVERAGE_PARSE: 'coverage_parse',
  COVERAGE_RAW: 'coverage_raw',
  COVERAGE_RECOMPUTE: 'coverage_recompute',
  COVERAGE_REPORT_MISSING: 'coverage_report_missing',
  COVERAGE_STATUS: 'coverage_status',
  COVERAGE_SUMMARY: 'coverage_summary',
  COVERAGE_THRESHOLD: 'coverage_threshold',
  COVERAGE_WAIVER: 'coverage_waiver',
  GIT_CHANGED_FILES: 'git_changed_files',
  GIT_CHANGED_LINES: 'git_changed_lines',
  OPEN_ISSUES: 'open_issues',
  RESULT_BASELINE: 'result_baseline',
  RESULT_C_SET: 'result_c_set',
  RESULT_COMPLETED: 'result_completed',
  RESULT_ITEM: 'result_item',
  RESULT_SECTION: 'result_section',
  RESULT_SESSION: 'result_session',
  RESULT_SR_SET: 'result_sr_set',
  RESULT_STARTED: 'result_started',
  RESULT_STATUS: 'result_status',
  RESULT_TASK: 'result_task',
  RESULT_VERSION: 'result_version',
  VERIFICATION_COMMANDS: 'verification_commands',
  VERIFICATION_EXIT: 'verification_exit',
  VERIFICATION_SUMMARY: 'verification_summary',
})

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
    if (path === null) issues.push(issue(ISSUE_CODES.ARTIFACT_PATH_INVALID, `${match[1]} escapes the task directory`))
    else if (!existsSync(path)) issues.push(issue(ISSUE_CODES.ARTIFACT_MISSING, `${match[1]} does not exist`))
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

/** RESULT Raw reports 中 coverage/ 下的原生报告路径（相对任务目录）；交集 CLI 产物不是报告，跳过。 */
function coverageReportPaths(coverage: string): string[] {
  const matches = fieldBlock(coverage, 'Raw reports').match(/`coverage\/[^`]+`/g) ?? []
  return [...new Set(matches.map((value) => value.slice(1, -1)))].filter((path) => !isDiffCoverageArtifact(path))
}

/** RESULT Changed Files 表逐文件的 covered/total 整数。 */
function resultFileNumbers(coverage: string): Map<string, { covered: number; total: number }> {
  const table = splitHeadings(coverage, 3).find((item) => item.heading === 'Changed Files')?.body ?? ''
  const numbers = new Map<string, { covered: number; total: number }>()
  for (const line of table.split('\n')) {
    const match = /^\|\s*`([^`]+)`\s*\|\s*`(\d+)\/(\d+)`\s*\|/.exec(line)
    if (match?.[1] !== undefined && match[2] !== undefined && match[3] !== undefined) {
      numbers.set(match[1], { covered: Number(match[2]), total: Number(match[3]) })
    }
  }
  return numbers
}

/** RESULT Overall lines 的 covered/total 整数（显示 pct 不参与核对）。 */
function resultOverallNumbers(coverage: string): { covered: number; total: number } | null {
  const match = /^(\d+)\/(\d+)\s+\(/.exec(field(coverage, 'Overall lines') ?? '')
  return match === null ? null : { covered: Number(match[1]), total: Number(match[2]) }
}

/** Below Threshold 子节的逐文件原因行（`- \`file\`: reason`）。 */
function belowThresholdReasons(coverage: string): string[] {
  const section = splitHeadings(coverage, 3).find((item) => item.heading === 'Below Threshold')
  if (section === undefined) return []
  return section.body.split('\n').filter((line) => /^-\s+`[^`]+`\s*:/.test(line))
}

/**
 * RESULT 绑定的代码指纹（豁免比对源）：从 codeBaseline 字符串中的
 * `codeFingerprint=<64-hex>` 片段提取（与 task-fingerprint.mjs 输出同形），
 * 无匹配返回 null。旧的顶层 codeFingerprint 键不是判据。
 */
function resultFingerprint(meta: Record<string, unknown>): string | null {
  if (typeof meta.codeBaseline !== 'string') return null
  return /codeFingerprint=([0-9a-f]{64})/.exec(meta.codeBaseline)?.[1] ?? null
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
  const issues = evaluateCaseExecutionGate(root, taskRelPath, task).map((message) => issue(ISSUE_CODES.CASE_EXECUTION, message))
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
  if (gitErr !== null) issues.push(issue(ISSUE_CODES.GIT_CHANGED_FILES, gitErr.message))
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
  if (meta.version !== 1) issues.push(issue(ISSUE_CODES.RESULT_VERSION, 'RESULT version must be 1'))
  if (meta.task !== taskRelPath) issues.push(issue(ISSUE_CODES.RESULT_TASK, 'RESULT task does not match the active task'))
  if (typeof meta.codeBaseline !== 'string' || meta.codeBaseline === '') issues.push(issue(ISSUE_CODES.RESULT_BASELINE, 'codeBaseline is required'))
  if (meta.status !== 'passed') issues.push(issue(ISSUE_CODES.RESULT_STATUS, 'RESULT status must be passed'))
  if (typeof meta.startedAt !== 'string' || meta.startedAt === '') issues.push(issue(ISSUE_CODES.RESULT_STARTED, 'startedAt is required'))
  if (typeof meta.completedAt !== 'string' || meta.completedAt === '') issues.push(issue(ISSUE_CODES.RESULT_COMPLETED, 'completedAt is required for a passed result'))
  if (!sessionChainReaches(task, meta.checkSession, task.case.designSession)) {
    issues.push(issue(ISSUE_CODES.RESULT_SESSION, 'checkSession is neither the design session nor linked by fallbackOf'))
  }
  const caseSections = sectionMap(caseContent.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, ''), 2)
  const srExpected = parseItems(caseSections.get('Static Review') ?? '', 'SR', SR_FIELDS, []).map((item) => item.id)
  const cExpected = parseItems(caseSections.get('Runtime Cases') ?? '', 'C', C_FIELDS, []).map((item) => item.id)
  const sections = sectionMap(body, 2)
  for (const name of REQUIRED_RESULT_SECTIONS) {
    if (!sections.has(name)) issues.push(issue(ISSUE_CODES.RESULT_SECTION, `RESULT section "${name}" is missing`))
  }
  const srResults = resultItems(sections.get('Static Review Results') ?? '')
  const cResults = resultItems(sections.get('Runtime Results') ?? '')
  if (!sameStrings(srResults.map((item) => item.id).sort(), [...srExpected].sort())) {
    issues.push(issue(ISSUE_CODES.RESULT_SR_SET, 'Static Review Results do not match the CASE ids'))
  }
  if (!sameStrings(cResults.map((item) => item.id).sort(), [...cExpected].sort())) {
    issues.push(issue(ISSUE_CODES.RESULT_C_SET, 'Runtime Results do not match the CASE ids'))
  }
  for (const item of [...srResults, ...cResults]) {
    if (item.status !== 'passed') issues.push(issue(ISSUE_CODES.RESULT_ITEM, `${item.id} status must be passed, found ${String(item.status)}`))
  }
  const coverage = sections.get('Coverage') ?? ''
  const coverageStatus = field(coverage, 'Status')
  const summary = sections.get('Summary') ?? ''
  if (field(summary, 'Coverage') !== coverageStatus) issues.push(issue(ISSUE_CODES.COVERAGE_SUMMARY, 'Summary coverage status differs from Coverage'))
  if (field(summary, 'Standard verification') !== 'passed') issues.push(issue(ISSUE_CODES.VERIFICATION_SUMMARY, 'Standard verification must be passed'))
  const exclusions = parseExclusions(caseSections.get('Coverage') ?? '')
  const resultExclusions = tableExclusions(
    splitHeadings(coverage, 3).find((item) => item.heading === 'Exclusions')?.body ?? '',
  )
  if (!sameExclusions(exclusions, resultExclusions)) {
    issues.push(issue(ISSUE_CODES.COVERAGE_EXCLUSIONS, 'RESULT Exclusions must match CASE paths and reasons'))
  }
  const actualCoverageFiles = tablePaths(splitHeadings(coverage, 3).find((item) => item.heading === 'Changed Files')?.body ?? '')

  // 增量复算：变更行优先取入参，报告路径相对任务目录解析（与产物校验同口径）。
  const worktree = worktreeDirectory(root, task)
  // 覆盖率配置取任务 worktree 根（分支配置优先）；非法配置报 coverage_config，不抛裸异常。
  let coverageConfig: WorkloomConfig | null = null
  try {
    coverageConfig = loadConfig(worktree)
  } catch (error) {
    issues.push(issue(ISSUE_CODES.COVERAGE_CONFIG, `coverage config is invalid: ${String(error)}`))
  }
  const threshold = coverageConfig?.coverage.threshold ?? DEFAULT_THRESHOLD
  let changedLines = options.changedLines ?? null
  let linesErr: Error | null = null
  if (changedLines === null) {
    const extracted = listCaseChangedLines(root, task)
    linesErr = extracted[0]
    changedLines = extracted[1]
  }
  if (linesErr !== null) issues.push(issue(ISSUE_CODES.GIT_CHANGED_LINES, linesErr.message))
  const lines: Map<string, ChangedLineRange[]> = changedLines ?? new Map()
  const reportPaths = coverageReportPaths(coverage)
  const reportTexts: string[] = []
  for (const path of reportPaths) {
    const absolute = safeTaskFile(taskDir, path)
    if (absolute === null) {
      issues.push(issue(ISSUE_CODES.ARTIFACT_PATH_INVALID, `${path} escapes the task directory`))
      continue
    }
    try {
      reportTexts.push(readFileSync(absolute, 'utf8'))
    } catch {
      issues.push(issue(ISSUE_CODES.COVERAGE_REPORT_MISSING, `${path} is missing`))
    }
  }
  const formatHints = coverageConfig === null
    ? undefined
    : buildFormatHints(lines.keys(), reportTexts.length, coverageConfig.coverage.languages)
  const recomputed = reportTexts.length > 0
    ? computeDiffCoverage({ root: worktree, changedLines: lines, reports: reportTexts, exclusions, formatHints })
    : null
  if (recomputed?.[0] !== null && recomputed?.[0] !== undefined) {
    issues.push(issue(ISSUE_CODES.COVERAGE_PARSE, recomputed[0].message))
  }
  const computed = recomputed?.[1] ?? null
  const supported = computed !== null && computed.format !== 'unsupported'
  const recomputedFiles = computed?.files ?? []
  const expected = supported
    ? recomputedFiles.map((file) => file.file).sort()
    : [...new Set([...lines.keys()].filter((file) => !file.startsWith('.workloom/') && !isExcluded(exclusions, file) && existsSync(join(worktree, file))))].sort()
  const reported = resultOverallNumbers(coverage)
  const thresholdBasis = supported ? computed.overall : reported ?? { covered: 0, total: 0 }
  const fingerprint = resultFingerprint(meta)
  const waiver = options.coverageWaiver ?? task.check?.coverageWaiver ?? null
  // 缺席可执行文件对 generated/below_threshold/not_applicable 三态统一硬拒；
  // unsupported 格式跳过（无机械复算依据）。
  if (supported && computed.missingExecutableFiles.length > 0) {
    issues.push(issue(ISSUE_CODES.COVERAGE_MISSING_FILE, `executable files missing from reports: ${computed.missingExecutableFiles.join(', ')}`))
  }

  if (coverageStatus === 'not_applicable') {
    if (expected.length > 0) issues.push(issue(ISSUE_CODES.COVERAGE_NOT_APPLICABLE, 'not_applicable requires an empty coverable file scope'))
    if (actualCoverageFiles.length > 0) issues.push(issue(ISSUE_CODES.COVERAGE_FILES, 'not_applicable requires an empty Changed Files table'))
    if (![null, '', 'none', 'N/A', 'n/a'].includes(field(coverage, 'Overall lines'))) {
      issues.push(issue(ISSUE_CODES.COVERAGE_OVERALL_NA, 'not_applicable must use N/A for Overall lines'))
    }
    // 零分母原因载体是独立 - Reason: 行，不再要求非空 Exclusions。
    const reason = field(coverage, 'Reason')
    if (reason === null || reason.trim() === '') {
      issues.push(issue(ISSUE_CODES.COVERAGE_NA_REASON, 'not_applicable requires a non-empty - Reason: line'))
    }
  } else if (coverageStatus === 'generated' || coverageStatus === 'below_threshold') {
    if (reportPaths.length === 0 || reportTexts.length === 0) {
      issues.push(issue(ISSUE_CODES.COVERAGE_RAW, 'generated/below_threshold coverage requires a raw report under coverage/'))
    }
    if (reported === null) issues.push(issue(ISSUE_CODES.COVERAGE_OVERALL, 'Overall lines must be covered/total (percentage)'))
    if (!sameStrings(actualCoverageFiles, expected)) {
      issues.push(issue(ISSUE_CODES.COVERAGE_FILES, `Changed Files must equal ${expected.join(', ') || '<empty>'}`))
    }
    if (supported) {
      const numbers = resultFileNumbers(coverage)
      for (const file of recomputedFiles) {
        const stated = numbers.get(file.file)
        if (stated === undefined || stated.covered !== file.covered || stated.total !== file.total) {
          issues.push(issue(ISSUE_CODES.COVERAGE_RECOMPUTE, `${file.file} must report ${file.covered}/${file.total}`))
        }
      }
      for (const file of numbers.keys()) {
        if (!recomputedFiles.some((entry) => entry.file === file)) {
          issues.push(issue(ISSUE_CODES.COVERAGE_RECOMPUTE, `${file} is outside the recomputed changed-line scope`))
        }
      }
      if (reported !== null && (reported.covered !== computed.overall.covered || reported.total !== computed.overall.total)) {
        issues.push(issue(ISSUE_CODES.COVERAGE_RECOMPUTE, `Overall lines must be ${computed.overall.covered}/${computed.overall.total}`))
      }
    }
    if (meetsThreshold(thresholdBasis.covered, thresholdBasis.total, threshold)) {
      if (coverageStatus === 'below_threshold') {
        issues.push(issue(ISSUE_CODES.COVERAGE_STATUS, `below_threshold requires incremental coverage <= configured threshold ${threshold}% (default ${DEFAULT_THRESHOLD}%)`))
      }
    } else if (coverageStatus !== 'below_threshold') {
      issues.push(issue(ISSUE_CODES.COVERAGE_THRESHOLD, `incremental coverage must be > configured threshold ${threshold}% (default ${DEFAULT_THRESHOLD}%) or below_threshold with a valid waiver`))
    } else {
      const valid = waiver !== null &&
        typeof waiver.reason === 'string' && waiver.reason.trim() !== '' &&
        fingerprint !== null && waiver.fingerprint === fingerprint
      if (!valid) issues.push(issue(ISSUE_CODES.COVERAGE_WAIVER, 'below_threshold requires a waiver matching RESULT codeFingerprint'))
      const reasons = belowThresholdReasons(coverage)
      if (reasons.length === 0) issues.push(issue(ISSUE_CODES.COVERAGE_BELOW_REASONS, 'Below Threshold requires per-file reason lines'))
    }
  } else {
    issues.push(issue(ISSUE_CODES.COVERAGE_STATUS, `coverage must be generated/below_threshold/not_applicable, found ${String(coverageStatus)}`))
  }
  const verification = sections.get('Standard Verification') ?? ''
  const commands = verification.split('\n').filter((line) => /^\|.*\|\s*`?0`?\s*\|/.test(line))
  if (commands.length === 0) issues.push(issue(ISSUE_CODES.VERIFICATION_COMMANDS, 'Standard Verification needs at least one exit-code-0 row'))
  if (!verification.split('\n').every((line) => !line.startsWith('| `') || /\|\s*`?0`?\s*\|/.test(line))) {
    issues.push(issue(ISSUE_CODES.VERIFICATION_EXIT, 'every verification command must exit 0'))
  }
  const openIssues = splitHeadings(body, 2).at(-1)
  if (openIssues?.heading !== 'Open issues' || openIssues.body.trim() !== '- none') {
    issues.push(issue(ISSUE_CODES.OPEN_ISSUES, 'Open issues must be the final section and contain only - none'))
  }
  validateReferencedFiles(body, taskDir, issues)
  return issues
}

