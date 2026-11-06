/**
 * doctor 检查规则（瘦身后最小集，TypeScript）：仅保留不依赖旧工作流语义的
 * config 与 worktree 两类只读检查，worktree 已改接 .runtime/worktrees 新路径；
 * 其余检查项的空位以空槽提示行显式标注（doctor-types 的 DOCTOR_SLOTS_NOTE），
 * 由子任务三状态机重建承接。
 *
 * 设计意图：
 * - 全部检查只读，不写任何 `.workloom/` 文件；
 * - config：缺配置 / packages 空配置 / 配置非法三类提示；
 * - worktree：`.gitignore` 缺 `.runtime/` 条目 + 目录与 git 注册一致性
 *   （经 worktree-integrate 的 scanWorktreeConsistencySync 只读探测）；
 * - 运行时 issue/message 文案英文；注释中文。
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { loadConfig } from './config-load.ts'
import { WORKLOOM_DIR } from './locate.js'
import { scanWorktreeConsistencySync } from './worktree-integrate.ts'
import { makeIssue } from './doctor-tasks.ts'
import type { DoctorIssue } from './doctor-types.ts'

export function checkConfig(root: string): DoctorIssue[] {
  const issues: DoctorIssue[] = []
  const workloomDir = join(root, WORKLOOM_DIR)
  const hasConfig = ['config.json', 'config.js'].some((name) =>
    existsSync(join(workloomDir, name)),
  )
  if (!hasConfig) {
    issues.push(
      makeIssue({
        code: 'config',
        title: 'Missing config file',
        severity: 'warn',
        task: null,
        message: 'No .workloom/config.json or config.js; using built-in defaults.',
        path: join(WORKLOOM_DIR, 'config.json'),
        fixable: false,
        hint: 'Create .workloom/config.json to customize hooks, packages and subagents.',
      }),
    )
  } else {
    try {
      const config = loadConfig(root)
      // packages 空配置（design §7）：create 将拒绝一切任务 → 提前提示补配置。
      if (Object.keys(config.packages).length === 0) {
        issues.push(
          makeIssue({
            code: 'config',
            title: 'No packages configured',
            severity: 'warn',
            task: null,
            message:
              'packages is empty: workloom_task_create rejects every task until at least one package is declared.',
            path: join(WORKLOOM_DIR, 'config.json'),
            fixable: false,
            hint: 'Declare a packages entry in .workloom/config.json (run workloom-packages-scan to generate the list).',
          }),
        )
      }
    } catch (error) {
      issues.push(
        makeIssue({
          code: 'config',
          title: 'Invalid config file',
          severity: 'error',
          task: null,
          message: `config is invalid: ${messageOf(error)}`,
          path: join(WORKLOOM_DIR, 'config.json'),
          fixable: false,
          hint: 'Fix the config error in .workloom/config.json or config.js.',
        }),
      )
    }
  }
  return issues
}


/**
 * 检查⑩：worktree 一致性（design §7，第 12 类）：
 * - `.workloom/.gitignore` 缺 `.runtime/` 条目（worktree 状态收敛在
 *   `.runtime/worktrees/`，存量项目不自动迁移 → 提示补条目，
 *   迁移前主仓脏计数上升的副作用写入文案）；
 * - `.workloom/.runtime/worktrees/` 目录与 git 注册不一致（目录在但未注册 / 注册在但目录失
 *   或 prunable）→ 指引 `git worktree prune` + 人工检查（不自动破坏性修复）。
 * 非 git 项目跳过注册比对（start 侧已 fail loud）；config 非法跳过（config 检查报告）。
 * @param root 项目根
 * @returns 检查出的 issue 列表
 */
export function checkWorktree(root: string): DoctorIssue[] {
  const issues: DoctorIssue[] = []
  // ① .gitignore 缺 .runtime/ 条目（文件整体缺失时跳过：init 骨架总会生成该文件）。
  const gitignorePath = join(root, WORKLOOM_DIR, '.gitignore')
  const gitignore = readIfExists(gitignorePath)
  if (
    gitignore !== null &&
    !gitignore.split(/\r?\n/).some((line) => line.trim() === '.runtime/')
  ) {
    issues.push(
      makeIssue({
        code: 'worktree',
        title: 'Missing runtime gitignore entry',
        severity: 'warn',
        task: null,
        message:
          '.workloom/.gitignore does not ignore .runtime/ (task worktrees under .runtime/worktrees show up as untracked and raise the main-repo dirty count).',
        path: join(WORKLOOM_DIR, '.gitignore'),
        fixable: false,
        hint: "Add a '.runtime/' line to .workloom/.gitignore (existing projects are not migrated automatically).",
      }),
    )
  }
  // ② 目录与 git 注册一致性（只读探测，经 domain/worktree.js → domain/git.js）。
  let config: ReturnType<typeof loadConfig>
  try {
    config = loadConfig(root)
  } catch {
    return issues // config 非法由 config 检查报告；无法解析 packages → 跳过比对
  }
  const [scanErr, scan] = scanWorktreeConsistencySync(root, config)
  if (scanErr !== null) {
    issues.push(
      makeIssue({
        code: 'worktree',
        title: 'Worktree inspection failed',
        severity: 'warn',
        task: null,
        message: `cannot inspect task worktrees: ${messageOf(scanErr)}`,
        path: null,
        fixable: false,
        hint: 'Inspect .workloom/.runtime/worktrees and `git worktree list` manually.',
      }),
    )
    return issues
  }
  if (scan === null) return issues
  for (const rel of scan.unregistered) {
    issues.push(
      makeIssue({
        code: 'worktree',
        title: 'Unregistered worktree directory',
        severity: 'warn',
        task: null,
        message: `${rel} exists but is not a registered worktree (an empty directory would be silently reused by git worktree add).`,
        path: rel,
        fixable: false,
        hint: `Inspect ${rel} and remove it manually; destructive cleanup is never automated.`,
      }),
    )
  }
  for (const rel of scan.missing) {
    issues.push(
      makeIssue({
        code: 'worktree',
        title: 'Stale worktree registration',
        severity: 'warn',
        task: null,
        message: `${rel} is registered as a worktree but its directory is missing or prunable.`,
        path: rel,
        fixable: false,
        hint: 'Inspect the registration with `git worktree list`, then run `git worktree prune` to drop stale metadata.',
      }),
    )
  }
  return issues
}


/** 读取文件文本（缺失返回 null，其他错误透传）。 */
function readIfExists(absPath: string): string | null {
  try {
    return readFileSync(absPath, 'utf8')
  } catch (error) {
    if (isEnoent(error)) return null
    throw error
  }
}

/** @param error 未知异常 @returns 消息文本。 */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** @param error 未知异常 @returns 是否文件不存在。 */
function isEnoent(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | null)?.code === 'ENOENT'
}
