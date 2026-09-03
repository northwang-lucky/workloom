/**
 * doctor 检查引擎的 local-prompts 检查规则实现（只读）。
 *
 * 设计意图：
 * - 与 doctor-check-rules.ts 拆分的独立性规则文件（原文件追加后超 600 行，见
 *   code-style size 规则；本检查与任务生命周期无关，独立成文件不影响功能）；
 * - 覆盖三层提示词目录：全局 $HOME/.workloom/prompts/、项目 .workloom/prompts/、
 *   项目 .workloom/prompts.local/；逐片段输出加载状态：loaded 进 info 正向列表
 *   （target、来源层），未知文件名/front-matter 错误进 issues（与主链路 fail loud
 *   口径一致，doctor 给出可修复提示）；目录不存在返回空（该项通过，零行为）；
 * - 复用 local-prompts 模块的 parseLocalFragment / targetFromFileName 同一映射，
 *   避免主链路与诊断侧判定分叉；
 * - requiresTools 机制已移除：front-matter 残留该字段时 parseLocalFragment fail
 *   loud，doctor 按 error 上报（提示删除）；
 * - homeDir 供测试/沙箱注入全局层基准目录（缺省 os.homedir()）；
 * - 运行时 issue/message 文案英文；注释中文。
 */

import { readFileSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { WORKLOOM_DIR } from '../legacy/locate.js'
import type { LocalFragmentTarget } from './local-prompts.js'
import {
  LOCAL_PROMPTS_REL,
  parseLocalFragment,
  SHARED_PROMPTS_REL,
  targetFromFileName,
} from './local-prompts.js'
import type { DoctorIssue } from './doctor-types.js'
import { makeIssue } from './doctor-tasks.js'

/** 检查⑩：提示词三层片段（全局/项目共享/项目本机）加载状态可观测性。 */
export interface LocalPromptsCheckResult {
  issues: DoctorIssue[]
  /** 正向状态行：每个已加载片段（target、来源层、来源文件）。 */
  info: string[]
}

/** 单个提示词目录的扫描描述（来源标签 + 相对项目根的路径前缀）。 */
interface PromptDirSpec {
  /** 来源层标签（info 行展示）。 */
  layer: string
  /** 目录绝对路径。 */
  dir: string
  /** 相对项目根的路径前缀（issue/info 的 path 用；项目外为 null）。 */
  relPrefix: string | null
}

/**
 * 检查⑩：提示词三层片段逐片段输出加载状态。
 * 全局 → 项目共享 → 项目本机依次扫描；loaded 片段（front-matter 合法、文件名合法）
 * 进 info 正向列表（target、来源层、来源文件）；未知 .md 文件名报 warn；front-matter
 * 错误（含 requiresTools 残留）报 error（带 path，fail loud 口径与主链路一致）；
 * 目录不存在返回空（该项通过）。项目外文件（全局层）path 为 null。
 * @param root 项目根
 * @param homeDir 全局层基准目录（测试/沙箱用，缺省取 os.homedir()）
 * @returns issues + info
 */
export function checkLocalPrompts(
  root: string,
  homeDir?: string,
): LocalPromptsCheckResult {
  const home = homeDir ?? homedir()
  const specs: PromptDirSpec[] = [
    {
      layer: 'global',
      dir: join(home, '.workloom', SHARED_PROMPTS_REL),
      relPrefix: null,
    },
    {
      layer: SHARED_PROMPTS_REL,
      dir: join(root, WORKLOOM_DIR, SHARED_PROMPTS_REL),
      relPrefix: join(WORKLOOM_DIR, SHARED_PROMPTS_REL),
    },
    {
      layer: LOCAL_PROMPTS_REL,
      dir: join(root, WORKLOOM_DIR, LOCAL_PROMPTS_REL),
      relPrefix: join(WORKLOOM_DIR, LOCAL_PROMPTS_REL),
    },
  ]
  const issues: DoctorIssue[] = []
  const info: string[] = []
  for (const spec of specs) {
    scanPromptDir(spec, issues, info)
  }
  return { issues, info }
}

/**
 * 扫描单个提示词目录（内部）：逐条目判定加载状态；目录不存在零行为。
 * @param spec 目录描述
 * @param issues issue 收集
 * @param info 正向状态行收集
 */
function scanPromptDir(
  spec: PromptDirSpec,
  issues: DoctorIssue[],
  info: string[],
): void {
  let entries
  try {
    entries = readdirSync(spec.dir, { withFileTypes: true })
  } catch (error) {
    if (isEnoent(error)) return // 目录不存在 = 零片段，该项通过
    throw error
  }
  for (const entry of entries) {
    if (!entry.isFile() || entry.name.startsWith('.') || !entry.name.endsWith('.md')) continue
    const relPath = spec.relPrefix === null ? null : join(spec.relPrefix, entry.name)
    const absPath = join(spec.dir, entry.name)
    let target: LocalFragmentTarget
    try {
      target = targetFromFileName(entry.name)
    } catch {
      issues.push(
        makeIssue({
          code: 'local-prompts',
          title: 'Unknown prompt file',
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
          title: 'Unreadable prompt file',
          severity: 'error',
          task: null,
          message: `Cannot read prompt file: ${String(error)}`,
          path: relPath,
          fixable: false,
          hint: 'Fix the file permissions so the prompt loader can read it.',
        }),
      )
      continue
    }
    if (raw.trim() === '') continue // 空文件跳过（零行为，与主链路一致）
    try {
      parseLocalFragment(target, raw)
    } catch (error) {
      issues.push(
        makeIssue({
          code: 'local-prompts',
          title: 'Invalid prompt front-matter',
          severity: 'error',
          task: null,
          message: `Invalid prompt front-matter: ${messageOf(error)}`,
          path: relPath,
          fixable: false,
          hint: 'Fix the YAML front-matter (only unknown fields are rejected; requiresTools was removed).',
        }),
      )
      continue
    }
    // loaded：正向状态行（含 target 与来源层）。
    info.push(`- ${entry.name} [target=${target}][source=${spec.layer}]`)
  }
}

/** @param {unknown} error @returns {string} 消息文本。 */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** @param error 未知异常 @returns 是否文件不存在。 */
function isEnoent(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === 'ENOENT'
}
