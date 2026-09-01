/**
 * doctor 检查引擎的 local-prompts 检查规则实现（只读）。
 *
 * 设计意图：
 * - 与 doctor-check-rules.ts 拆分的独立性规则文件（原文件追加后超 600 行，见
 *   code-style size 规则；本检查与任务生命周期无关，独立成文件不影响功能）；
 * - 逐片段输出加载状态：loaded 进 info 正向列表（target、requiresTools 条件、
 *   来源文件），skipped/未知文件名/front-matter 错误进 issues（与主链路 fail loud
 *   口径一致，doctor 给出可修复提示）；目录不存在返回空（该项通过，零行为）；
 * - 复用 local-prompts 模块的 parseLocalFragment / targetFromFileName 同一映射，
 *   避免主链路与诊断侧判定分叉；
 * - availableTools 由 adapter 探测后传入（core runtime 无关）：undefined 时不判定
 *   skipped，仅列出有条件片段的声明条件。
 * - 运行时 issue/message 文案英文；注释中文。
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { WORKLOOM_DIR } from '../legacy/locate.js'
import type { LocalFragmentTarget } from './local-prompts.js'
import { LOCAL_PROMPTS_REL, parseLocalFragment, targetFromFileName } from './local-prompts.js'
import type { DoctorIssue } from './doctor-types.js'
import { makeIssue } from './doctor-tasks.js'

/** 检查⑩：本机片段（.workloom/prompts.local/）加载状态可观测性。 */
export interface LocalPromptsCheckResult {
  issues: DoctorIssue[]
  /** 正向状态行：每个已加载片段（target、requiresTools 条件、来源文件）。 */
  info: string[]
}

/**
 * 检查⑩：本机片段（prompts.local）逐片段输出加载状态。
 * loaded 片段（front-matter 合法、文件名合法、条件满足）进 info 正向列表（target、
 * 条件、来源文件）；skipped（requiresTools 声明工具不在可用集，availableTools 已知
 * 时判定）报 warn 并列出缺失工具；未知 .md 文件名报 warn；front-matter 错误报 error
 * （带 path，fail loud 口径与主链路一致）；目录不存在返回空（该项通过）。
 * @param root 项目根
 * @param availableTools 当前可用工具名集合（adapter 探测后传入；undefined 时不判定
 *   skipped，仅列出有条件片段的声明条件）
 * @returns issues + info
 */
export function checkLocalPrompts(
  root: string,
  availableTools?: readonly string[],
): LocalPromptsCheckResult {
  const issues: DoctorIssue[] = []
  const info: string[] = []
  const dir = join(root, WORKLOOM_DIR, LOCAL_PROMPTS_REL)
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch (error) {
    if (isEnoent(error)) return { issues, info } // 目录不存在 = 零片段，该项通过
    throw error
  }
  const tools = availableTools === undefined ? undefined : new Set(availableTools)
  for (const entry of entries) {
    if (!entry.isFile() || entry.name.startsWith('.') || !entry.name.endsWith('.md')) continue
    const relPath = join(WORKLOOM_DIR, LOCAL_PROMPTS_REL, entry.name)
    const absPath = join(dir, entry.name)
    let target: LocalFragmentTarget
    try {
      target = targetFromFileName(entry.name)
    } catch {
      issues.push(
        makeIssue({
          code: 'local-prompts',
          title: 'Unknown local prompt file',
          severity: 'warn',
          task: null,
          message: `Unknown prompt file name: ${entry.name}; only main/research/implement/check/frontend/all .md files are injected.`,
          path: relPath,
          fixable: false,
          hint: 'Rename the file to one of main.md, research.md, implement.md, check.md, frontend.md, all.md, or move it elsewhere.',
        }),
      )
      continue
    }
    let raw: string
    try {
      raw = readFileSync(absPath, 'utf8')
    } catch (error) {
      issues.push(
        makeIssue({
          code: 'local-prompts',
          title: 'Unreadable local prompt file',
          severity: 'error',
          task: null,
          message: `Cannot read local prompt file: ${String(error)}`,
          path: relPath,
          fixable: false,
          hint: 'Fix the file permissions so the prompt loader can read it.',
        }),
      )
      continue
    }
    if (raw.trim() === '') continue // 空文件跳过（零行为，与主链路一致）
    let fragment
    try {
      fragment = parseLocalFragment(target, raw)
    } catch (error) {
      issues.push(
        makeIssue({
          code: 'local-prompts',
          title: 'Invalid local prompt front-matter',
          severity: 'error',
          task: null,
          message: `Invalid local prompt front-matter: ${messageOf(error)}`,
          path: relPath,
          fixable: false,
          hint: 'Fix the YAML front-matter (only the requiresTools field is allowed; it must be an array of tool names).',
        }),
      )
      continue
    }
    if (fragment.text === '') continue // 无正文片段跳过
    // 条件判定：requiresTools 非空时须全部 ∈ 可用集（AND 语义）；可用集未知时不判定。
    const missing = fragment.requiresTools.filter(
      (tool) => tools !== undefined && !tools.has(tool),
    )
    if (missing.length > 0) {
      issues.push(
        makeIssue({
          code: 'local-prompts',
          title: 'Local prompt condition not satisfied',
          severity: 'warn',
          task: null,
          message: `Local prompt ${entry.name} requires tools that are not available: ${missing.join(', ')}; the fragment is not injected.`,
          path: relPath,
          fixable: false,
          hint: 'Make the required tools available to the runtime, or remove the requiresTools condition from the fragment.',
        }),
      )
      continue
    }
    // loaded：正向状态行（含 target、条件、来源文件）。
    const condition =
      fragment.requiresTools.length === 0
        ? ''
        : ` [requiresTools=${fragment.requiresTools.join(', ')}]`
    info.push(`- ${entry.name} [target=${target}]${condition}`)
  }
  return { issues, info }
}

/** @param {unknown} error @returns {string} 消息文本。 */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** @param error 未知异常 @returns 是否文件不存在。 */
function isEnoent(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === 'ENOENT'
}