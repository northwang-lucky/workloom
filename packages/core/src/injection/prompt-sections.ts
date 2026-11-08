/**
 * prompt-sections：executor prompt 的各注入段函数（prompt-compose 兄弟文件）。
 *
 * 设计意图：
 * - 承载主组装（prompt-compose 入口的 buildInternal）逐段调用的注入段实现：
 *   CASE 全文与模板、worktree 纪律段、prd 全文节块（Requirements/Acceptance
 *   两节保留、其余节标题指针）、research 材料指针段与通用指针行拼装；
 * - 段落顺序与白名单语义由入口的主组装统一编排，本文件只产段文本与统计增量；
 * - 跨文件共享的 PRD_ARTIFACT 常量与 assertCheckDispatchGuards 守卫查询单源在
 *   prompt-compose 入口（兄弟文件相对导入）；预算与文件工具在 prompt-io。
 */

import { existsSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { WORKLOOM_DIR } from '../workspace/locate.js'
import { readTaskView } from '../task/state/index.ts'
import { CASE_FILES, CASE_PURPOSES } from '../task/case-structure.ts'
import { EXECUTOR_ROLES, normalizeExecutorRole } from '../dispatch/executor-roles.ts'
import { byteLength, isMissingLike, limitByBytes, readTaskFile } from './prompt-io.ts'
import { PRD_ARTIFACT, assertCheckDispatchGuards } from './prompt-compose.ts'

import type { BuildExecutorPromptParams, ExecutorPromptStats } from './prompt-compose.ts'

/** 文件块分隔模板：--- <path> ---（path 相对项目根）。 */
const BLOCK_SEPARATOR = '--- '

/** 文件块分隔结尾。 */
const BLOCK_SEPARATOR_END = ' ---'

/** worktree 纪律段标题（task.worktree_path 非空时注入，与 Local directives 同层级的独立段）。 */
const WORKTREE_HEADING = '## Worktree'

/** worktree 段绝对路径标签行前缀。 */
const WORKTREE_PATH_LABEL = 'Path: '

/**
 * worktree 纪律要点（英文运行时文案，段内无占位）：代码面一律指向 worktree、任务
 * 元数据写主仓 .workloom、代码提交在 worktree 任务分支（design §1）。
 */
const WORKTREE_DISCIPLINE_LINES = Object.freeze([
  '- All code reads, writes, builds, and tests target this worktree: point bash at it via workdir or absolute paths.',
  '- Task metadata (.workloom content: jsonl, context, research, prd, etc.) is always written to the main repository .workloom; injected relative paths resolve against the main repository root.',
  '- Code commits happen in this worktree on the task branch.',
])

/** research 产物目录名（相对任务目录）。 */
const RESEARCH_DIR = 'research'

/** research 材料注入段标题（Pointer list 之后、prd 软指针/Task prompt 之前）。 */
const RESEARCH_MATERIALS_HEADING = '## Research materials'

/** prd 全文保留节（Requirements/Acceptance 两节全文；其余节只留标题指针）。 */
const PRD_FULL_SECTIONS = Object.freeze(['Requirements', 'Acceptance Criteria'])

/** H2 标题行判定正则（## 起头且非 ###/####）。 */
const H2_HEADING_RE = /^##\s+\S/

/** H2 标题文字捕获正则（截取 ## 之后的标题文本）。 */
const H2_TITLE_RE = /^##\s+(.+)$/

/**
 * 内联当前 CASE 全文（内部，仅 checker）：紧跟 prd 块。execution 轮先校验执行
 * 前置（CASE 文档缺失/设计会话缺失抛错，拒绝启动 child）；文件缺失静默跳过
 * （case-design 首轮尚未写 case.md）；超预算直接抛错——CASE 是验收基线，
 * 不允许静默截断。
 * @param {string[]} parts prompt 段落列表
 * @param {import('./prompt-compose.ts').BuildExecutorPromptParams} params 注入参数
 * @param {string} taskDir 任务目录绝对路径
 * @param {import('../workspace/config.d.ts').WorkloomConfig['contextInjection']} ci 注入预算
 * @param {import('./prompt-compose.ts').ExecutorPromptStats} stats 注入统计
 */
export function inlineCurrentCase(parts: string[], params: BuildExecutorPromptParams, taskDir: string, ci: import('../workspace/config.d.ts').WorkloomConfig['contextInjection'], stats: ExecutorPromptStats): void {
  // 判定点经兼容读归一（过渡期 params.role 可能仍是旧值；脏值抛可判定错误）。
  if (normalizeExecutorRole(params.role) !== EXECUTOR_ROLES.CHECKER) return
  const [taskErr, task] = readTaskView(params.root, params.taskRelPath)
  // 任务记录缺失/损坏静默降级（与 worktree 段同口径：prompt 组装对坏记录宽容，
  // S2 零 diff 用例钉死该不变量）；记录可读时 execution 轮才做执行前置校验（fail loud）。
  if (taskErr !== null || task === null) return
  const purpose = params.purpose ?? CASE_PURPOSES.EXECUTION
  if (purpose === CASE_PURPOSES.EXECUTION) {
    assertCheckDispatchGuards(params.root, params.taskRelPath, task)
  }
  const path = join(taskDir, CASE_FILES.document)
  const text = readTaskFile(path)
  if (text === null) return
  const bytes = byteLength(text)
  if (ci.maxArtifactBytes > 0 && bytes > ci.maxArtifactBytes) {
    throw new Error(`case.md is ${bytes} bytes, exceeding maxArtifactBytes=${ci.maxArtifactBytes}; reduce the CASE or raise the project budget`)
  }
  const relPath = join(WORKLOOM_DIR, params.taskRelPath, CASE_FILES.document)
  parts.push(`${BLOCK_SEPARATOR}${relPath}${BLOCK_SEPARATOR_END}\n${text}`)
  stats.filesInlined += 1
}

/**
 * 内联 CASE 模板（内部，仅 checker）：adapter 从 assets 读取两份模板正文传入
 * （core 不 import assets），按传入顺序紧随 CASE 块、Pointer list 之前。
 * @param {string[]} parts prompt 段落列表
 * @param {import('./prompt-compose.ts').BuildExecutorPromptParams} params 注入参数
 * @param {import('./prompt-compose.ts').ExecutorPromptStats} stats 注入统计
 */
export function inlineCaseTemplates(parts: string[], params: BuildExecutorPromptParams, stats: ExecutorPromptStats): void {
  // 判定点经兼容读归一（与 inlineCurrentCase 同口径）。
  if (normalizeExecutorRole(params.role) !== EXECUTOR_ROLES.CHECKER) return
  for (const artifact of params.caseTemplates ?? []) {
    parts.push(`${BLOCK_SEPARATOR}${artifact.path}${BLOCK_SEPARATOR_END}\n${artifact.content}`)
    stats.filesInlined += 1
  }
}

/**
 * 组装 `## Worktree` 纪律段（内部）：task.worktree_path 非空时产出（绝对路径 +
 * Branch 行 + 纪律要点）；readTask 失败或路径为空时返回 null 静默降级（prompt
 * 组装对缺失/损坏任务记录本就宽容，产物与现状零变化，AC1）。branch/base 空串
 * 降级省略对应行/括注段。
 * @param {string} root 项目根
 * @param {string} taskRelPath 任务目录相对 .workloom 的路径
 * @returns {string | null} 段文本（不注入为 null）
 */
export function buildWorktreeSection(root: string, taskRelPath: string): string | null {
  const [taskErr, task] = readTaskView(root, taskRelPath)
  if (taskErr || task === null) return null
  const worktreePath = task.worktree_path
  if (typeof worktreePath !== 'string' || worktreePath === '') return null
  const lines = [WORKTREE_HEADING, `${WORKTREE_PATH_LABEL}${resolve(root, worktreePath)}`]
  const branch = typeof task.branch === 'string' ? task.branch : ''
  const baseBranch = typeof task.base_branch === 'string' ? task.base_branch : ''
  if (branch !== '') {
    lines.push(baseBranch === '' ? `Branch: ${branch}` : `Branch: ${branch} (base ${baseBranch})`)
  }
  lines.push(...WORKTREE_DISCIPLINE_LINES)
  return lines.join('\n')
}

/**
 * 内联 prd.md 全文节块（checker/researcher/judger 共用；验收基线/偏差判定/审查对象，职责必需）：
 * 按节提取注入，文件缺失跳过；块文本写入 parts；返回实际写入的字节数（缺失为 0）。
 * Requirements/Acceptance 两节全文保留，其余节只留标题指针；按 maxArtifactBytes
 * 截断（预算兜底）。
 * @param {string[]} parts prompt 段落列表（块文本追加于此）
 * @param {string} taskRelPath 任务目录相对 .workloom 的路径
 * @param {string} taskDir 任务目录绝对路径
 * @param {import('../workspace/config.d.ts').WorkloomConfig['contextInjection']} ci 注入预算
 * @param {import('./prompt-compose.ts').ExecutorPromptStats} stats 统计
 * @returns {number} 注入字节数（写入调用方累计预算）
 */
export function inlinePrdArtifact(
  parts: string[],
  taskRelPath: string,
  taskDir: string,
  ci: import('../workspace/config.d.ts').WorkloomConfig['contextInjection'],
  stats: ExecutorPromptStats,
): number {
  const text = readTaskFile(join(taskDir, PRD_ARTIFACT))
  if (text === null) return 0
  const relPath = join(WORKLOOM_DIR, taskRelPath, PRD_ARTIFACT)
  const content = extractPrdContent(text)
  const limited = limitByBytes(content, ci.maxArtifactBytes)
  parts.push(`${BLOCK_SEPARATOR}${relPath}${BLOCK_SEPARATOR_END}\n${limited.text}`)
  if (limited.truncated) stats.truncated += 1
  stats.filesInlined += 1
  return byteLength(limited.text)
}

/**
 * prd 提取：Requirements/Acceptance 两节全文保留，其余 H2 节只留标题指针。
 * 无 Requirements/Acceptance 节时整体只给文件指针（不猜节、无启发式）。
 * @param {string} text prd 全文
 * @returns {string} 注入正文
 */
export function extractPrdContent(text: string): string {
  const kept = []
  const others = []
  for (const section of splitH2Sections(text)) {
    if (PRD_FULL_SECTIONS.includes(section.heading)) {
      kept.push(`## ${section.heading}\n${section.body.trim()}`)
    } else {
      others.push(`## ${section.heading}`)
    }
  }
  const parts = []
  if (kept.length > 0) parts.push(kept.join('\n\n'))
  if (others.length > 0) parts.push(`Read in file: ${others.join(', ')}`)
  if (parts.length === 0) {
    parts.push(
      'Read the full document in the file (no Requirements or Acceptance Criteria sections).',
    )
  }
  return parts.join('\n\n')
}

/**
 * 按 H2 节切分 markdown 文本：返回 [{heading, body}]，body 不含标题行；
 * H2 之前（H1 标题等）的内容不属于任何节，跳过。
 * @param {string} text markdown 全文
 * @returns {{heading: string, body: string}[]}
 */
export function splitH2Sections(text: string): { heading: string; body: string }[] {
  const sections: { heading: string; bodyLines: string[] }[] = []
  let current: { heading: string; bodyLines: string[] } | null = null
  for (const line of text.split('\n')) {
    if (H2_HEADING_RE.test(line)) {
      const title = H2_TITLE_RE.exec(line)?.[1]?.trim() ?? ''
      current = { heading: title, bodyLines: [] }
      sections.push(current)
      continue
    }
    if (current !== null) current.bodyLines.push(line)
  }
  return sections.map((section) => ({
    heading: section.heading,
    body: section.bodyLines.join('\n'),
  }))
}

/**
 * 拼装指针行：`- <file>` 或 `- <file> (<reason>)`（reason 缺失省略括号；逐行
 * 「read before acting」后缀已删，逐行 mandate 由分层加载协议句统一取代）。
 * @param {string} file 条目路径
 * @param {string | undefined} [reason] 引用理由
 * @returns {string} 指针行
 */
export function pointerLine(file: string, reason?: string): string {
  const reasonPart = reason === undefined ? '' : ` (${reason})`
  return `- ${file}${reasonPart}`
}

/**
 * 内联任务 research/*.md 指针（切片 ②，自动行为，不由主会话控制）：
 * 按文件名排序逐文件给路径指针行，不内联正文（与 jsonl ① 同口径）；无 research
 * 目录或无 .md 产物时为空段，不影响注入链与统计（缺省 0）。
 * @param {string[]} parts prompt 段落列表（块文本追加于此）
 * @param {string} taskRelPath 任务目录相对 .workloom 的路径
 * @param {string} taskDir 任务目录绝对路径
 * @param {import('./prompt-compose.ts').ExecutorPromptStats} stats 统计
 */
export function inlineResearchMaterials(parts: string[], taskRelPath: string, taskDir: string, stats: ExecutorPromptStats): void {
  const names = listResearchMarkdownNames(taskDir)
  if (names.length === 0) return
  const lines = []
  for (const name of names) {
    const absPath = join(taskDir, RESEARCH_DIR, name)
    if (!existsSync(absPath)) continue // 产物缺失跳过
    const relPath = join(WORKLOOM_DIR, taskRelPath, RESEARCH_DIR, name)
    lines.push(pointerLine(relPath))
    stats.filesPointed += 1
  }
  if (lines.length > 0) {
    parts.push(`${RESEARCH_MATERIALS_HEADING}\n${lines.join('\n')}`)
  }
}

/**
 * 列出任务 research 目录下 *.md 文件名（字典序）；目录缺失/形态不符按空处理。
 * @param {string} taskDir 任务目录绝对路径
 * @returns {string[]}
 */
export function listResearchMarkdownNames(taskDir: string): string[] {
  let entries
  try {
    entries = readdirSync(join(taskDir, RESEARCH_DIR))
  } catch (error) {
    if (isMissingLike(error)) return []
    throw error
  }
  return entries.filter((name) => name.endsWith('.md')).sort()
}
