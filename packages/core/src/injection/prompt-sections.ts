/**
 * prompt-sections：executor prompt 的各注入段函数（prompt-compose 兄弟文件）。
 *
 * 设计意图：
 * - 承载主组装（prompt-compose 入口的 buildInternal）逐段调用的注入段实现：
 *   CASE/模板副本指针行、worktree 纪律段、research 材料指针段与通用指针行拼装；
 * - 段落顺序与白名单语义由入口的主组装统一编排，本文件只产段文本、指针行与统计增量；
 * - 纯指针口径：CASE、模板副本、research 材料只给路径指针行，正文由执行器按
 *   分层协议在步骤需要时读；prd 软指针由入口对所有角色统一发；
 * - 跨文件共享的 assertCheckDispatchGuards 守卫查询单源在 prompt-compose 入口
 *   （兄弟文件相对导入），副本只读比对在 case-templates，插件模板 loader 在 resources 清单。
 */

import { existsSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { WORKLOOM_DIR } from '../workspace/locate.js'
import { readTaskView } from '../task/state/index.ts'
import { CASE_FILES, CASE_PURPOSES } from '../task/case-structure.ts'
import { EXECUTOR_ROLES, normalizeExecutorRole } from '../dispatch/executor-roles.ts'
import { isMissingLike } from './prompt-io.ts'
import { ERR_PREFIX, assertCheckDispatchGuards } from './prompt-compose.ts'
import {
  CASE_TEMPLATE_COPY_DIR,
  CASE_TEMPLATE_COPY_FILES,
  compareCaseTemplateCopies,
} from '../workspace/case-templates.ts'
import { loadCaseResultTemplateText, loadCaseTemplateText } from '../resources-manifest.ts'

import type { BuildExecutorPromptParams, ExecutorPromptStats } from './prompt-compose.ts'

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

/**
 * 当前 CASE 指针行（内部，仅 checker）：execution 轮先校验执行前置（CASE 文档
 * 缺失/设计会话缺失抛错，拒绝启动 child）；case.md 存在才追加路径指针行，正文
 * 不进注入（执行器按分层协议在步骤需要时读）；case-design 首轮未写 case.md 时
 * 静默跳过。
 * @param {string[]} lines 指针行列表（Pointer list 段的内容）
 * @param {import('./prompt-compose.ts').BuildExecutorPromptParams} params 注入参数
 * @param {string} taskDir 任务目录绝对路径
 * @param {import('./prompt-compose.ts').ExecutorPromptStats} stats 注入统计
 */
export function inlineCurrentCase(lines: string[], params: BuildExecutorPromptParams, taskDir: string, stats: ExecutorPromptStats): void {
  // 判定点经兼容读归一（过渡期 params.role 可能仍是旧值；脏值抛可判定错误）。
  if (normalizeExecutorRole(params.role) !== EXECUTOR_ROLES.CHECKER) return
  const [taskErr, task] = readTaskView(params.root, params.taskRelPath)
  // 任务记录缺失/损坏静默降级（与 worktree 段同口径：prompt 组装对坏记录宽容）；
  // 记录可读时 execution 轮才做执行前置校验（fail loud）。
  if (taskErr !== null || task === null) return
  const purpose = params.purpose ?? CASE_PURPOSES.EXECUTION
  if (purpose === CASE_PURPOSES.EXECUTION) {
    assertCheckDispatchGuards(params.root, params.taskRelPath, task)
  }
  if (!existsSync(join(taskDir, CASE_FILES.document))) return
  lines.push(pointerLine(join(WORKLOOM_DIR, params.taskRelPath, CASE_FILES.document)))
  stats.filesPointed += 1
}

/**
 * CASE 模板副本指针行（内部，仅 checker）：副本经 init 落盘且派发前守卫已校验
 * 与插件模板一致；这里只给两行路径指针（按 new/result 顺序），全文不进注入。
 * @param {string[]} lines 指针行列表（Pointer list 段的内容）
 * @param {import('./prompt-compose.ts').BuildExecutorPromptParams} params 注入参数
 * @param {import('./prompt-compose.ts').ExecutorPromptStats} stats 注入统计
 */
export function inlineCaseTemplates(lines: string[], params: BuildExecutorPromptParams, stats: ExecutorPromptStats): void {
  // 判定点经兼容读归一（与 inlineCurrentCase 同口径）。
  if (normalizeExecutorRole(params.role) !== EXECUTOR_ROLES.CHECKER) return
  for (const name of CASE_TEMPLATE_COPY_FILES) {
    lines.push(pointerLine(`${CASE_TEMPLATE_COPY_DIR}/${name}`))
    stats.filesPointed += 1
  }
}

/**
 * checker 派发前的 CASE 模板副本只读守卫：副本缺失或与插件模板不一致即抛错拒绝
 * 派发，并指引重跑 init 刷新副本（不自动补落——写入是 init 的职责）。插件模板
 * 资产缺失属部署残缺，同样 fail loud。
 * @param {string} root 项目根
 */
export function assertCaseTemplatesReady(root: string): void {
  const caseTemplate = loadCaseTemplateText()
  const caseResultTemplate = loadCaseResultTemplateText()
  if (caseTemplate === null || caseResultTemplate === null) {
    throw new Error(`${ERR_PREFIX}: missing CASE template asset (incomplete deployment)`)
  }
  const status = compareCaseTemplateCopies(root, caseTemplate, caseResultTemplate)
  // 无 .workloom 时由 doctor/config 检查报错，本守卫不额外阻塞。
  if (status === null) return
  const stale = [...status.missing, ...status.outdated]
  if (stale.length === 0) return
  const relPaths = stale.map((name) => `${CASE_TEMPLATE_COPY_DIR}/${name}`).join(', ')
  throw new Error(
    `${ERR_PREFIX}: CASE template copies missing or outdated: ${relPaths}; rerun workloom init to refresh them`,
  )
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
