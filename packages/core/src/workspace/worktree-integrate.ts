/**
 * worktree 整合面（TypeScript）：merge/rebase 整合共用门禁与 gitlink 联动、
 * 目录与注册一致性扫描，以及三个 worktree 模块共用的错误辅助。
 *
 * 设计意图：
 * - 与生命周期编排（worktree-lifecycle）、setup 配置执行器（setup-executor）
 *   拆分：本模块承载 archive 整合的原语层与 doctor 只读扫描；
 * - 共享错误辅助（wtErr/errText/errCode）置于此叶子模块，供 lifecycle 与
 *   setup-executor 单向引用，不产生循环；
 * - 一致性扫描只读：不 prune、不删除任何路径，非 git 项目返回空结果。
 */

import { existsSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'

import { gitAddCommit } from './git-ops.ts'
import { gitRevParse, gitWorktreeListSync } from './git-query.ts'
import { WORKLOOM_DIR } from './locate.js'
import type { TaskRepoResolution } from './worktree.d.ts'
import type { TaskRecord } from '../task/storage/index.ts'

/** 错误消息前缀（运行时文案英文）。 */
export const ERR_PREFIX = 'workloom worktree'

/** worktree 根目录（相对 .workloom，布局定版收敛进运行时状态目录 `.runtime/worktrees/…`）。 */
export const WORKTREE_DIR = '.runtime/worktrees'

/** archive 清理中的合并模式（no-edit 合并回 base）。 */
export const MERGE_MODES = new Set(['merge-keep-branch', 'merge-delete-branch'])

/** archive 清理中的 rebase 整合模式（rebase 到 base 之上再 ff 合入，线性历史）。 */
export const REBASE_MODES = new Set(['rebase-keep-branch', 'rebase-delete-branch'])

/**
 * archive 清理中的整合模式（把任务分支整合进 base）：merge 与 rebase 共用
 * 主检出 HEAD==base 门禁与 submodule gitlink 联动。
 */
export const INTEGRATE_MODES = new Set([...MERGE_MODES, ...REBASE_MODES])

/** archive 清理中的分支删除模式（delete 语义集合；删除顺序在 worktree remove 之后）。 */
export const DELETE_BRANCH_MODES = new Set(['merge-delete-branch', 'rebase-delete-branch'])

/**
 * 组装 worktree 错误（共享辅助）。
 * @param message 英文文案（不含前缀）
 */
export function wtErr(message: string): Error {
  return new Error(`${ERR_PREFIX}: ${message}`)
}

/**
 * 提取 git 失败的可读文案（共享辅助）：优先 stderr（git 原始 fatal 文案），
 * 否则回退 Error.message。
 */
export function errText(error: Error & { stderr?: string | Buffer }): string {
  const stderr = typeof error.stderr === 'string' ? error.stderr.trim() : ''
  return stderr !== '' ? stderr : error.message
}

/**
 * 提取 git 失败的退出码（共享辅助）：spawn 失败（如 ENOENT）时无数字码。
 */
export function errCode(error: Error & { code?: unknown }): string {
  return typeof error.code === 'number' ? `exit ${error.code}` : `code ${String(error.code)}`
}

/**
 * 校验主检出 HEAD == base_branch（merge 与 rebase 整合路径共用）：
 * git 自身不拦 detached，显式比对是唯一防线。
 * @param repoRoot 仓根（主检出所在目录）
 * @param task 任务记录（base_branch）
 * @returns 不一致或探测失败时返回 err（含对齐指引）
 */
export async function assertMainHeadOnBaseBranch(repoRoot: string, task: TaskRecord): Promise<Error | null> {
  const [headErr, headBranch] = await gitRevParse(repoRoot, ['--abbrev-ref', 'HEAD'])
  if (headErr !== null) {
    return wtErr(`cannot determine current branch at ${repoRoot}: ${errText(headErr)}`)
  }
  if (headBranch !== task.base_branch) {
    return wtErr(
      `main checkout HEAD is ${JSON.stringify(headBranch)}, expected base branch ` +
        `${JSON.stringify(task.base_branch)} at ${repoRoot}; align the checkout before re-running archive`,
    )
  }
  return null
}

/**
 * submodule gitlink 幂等联动（design §3.4 步 4d）：根仓记录的 gitlink sha
 * 与 submodule 主检出 HEAD 不等 → 窄暂存 submodule 路径一条并提交（复用
 * gitAddCommit 纪律）；提交失败 fail loud（不复用「失败只 WARNING」的自动提交契约）。
 * @param root 项目根（= 根仓工作目录）
 * @param repo 仓解析结果（submodule）
 * @param task 任务记录
 * @returns true = 本次提交了 gitlink 更新
 */
export async function syncGitlink(
  root: string,
  repo: TaskRepoResolution,
  task: TaskRecord,
): Promise<[Error | null, boolean | null]> {
  if (repo.subPath === undefined) {
    return [wtErr('repo resolution is missing subPath for gitlink sync'), null]
  }
  const [recordedErr, recorded] = await gitRevParse(root, [`HEAD:${repo.subPath}`])
  if (recordedErr !== null) {
    return [wtErr(`cannot read recorded gitlink for ${JSON.stringify(repo.subPath)}: ${errText(recordedErr)}`), null]
  }
  const [subErr, actual] = await gitRevParse(repo.repoRoot, ['HEAD'])
  if (subErr !== null) {
    return [wtErr(`cannot read submodule HEAD at ${repo.repoRoot}: ${errText(subErr)}`), null]
  }
  if (recorded === actual) return [null, false]
  const [commitErr] = await gitAddCommit(root, `chore: update gitlink ${repo.subPath} for task ${task.name}`, [
    repo.subPath,
  ])
  if (commitErr !== null) {
    return [wtErr(`gitlink commit failed for ${JSON.stringify(repo.subPath)}: ${errText(commitErr)}`), null]
  }
  return [null, true]
}

/**
 * worktree 目录与 git 注册一致性探测（doctor 只读消费，design §7/§1）：
 * 扫描 `.workloom/.runtime/worktrees/` 两层布局（`<task-id>/` 与 `<task-id>/<pkg>/`），
 * 与根仓及配置声明 git 子仓的 `git worktree list --porcelain` 注册集比对。
 * 同步（doctor 收集链同步）；非 git 项目返回空结果（worktree 生命周期不可用，
 * 由 config/start 检查负责）。只读：不 prune、不删除任何路径。
 * @param root 项目根
 * @param config 项目配置（声明 git 子仓）
 * @returns unregistered = 目录在但未注册（项目根相对路径）；
 *   missing = 注册在但目录失或 prunable（项目根相对路径）
 */
export function scanWorktreeConsistencySync(
  root: string,
  config: import('./config.d.ts').WorkloomConfig,
): [Error | null, { unregistered: string[]; missing: string[] } | null] {
  /** 注册集（resolve 后的绝对路径 → 状态）。 */
  const registered = new Map<string, { prunable: boolean }>()
  const [rootListErr, rootEntries] = gitWorktreeListSync(root)
  if (rootListErr !== null || rootEntries === null) {
    const detail = errText((rootListErr ?? new Error('empty worktree list')) as Error & { stderr?: string })
    if (/not a git repository/.test(detail)) {
      // 非 git 项目：worktree 生命周期不可用，一致性检查无意义 → 空结果跳过。
      return [null, { unregistered: [], missing: [] }]
    }
    return [wtErr(`cannot list worktrees at ${root}: ${detail}`), null]
  }
  for (const entry of rootEntries) {
    registered.set(resolve(entry.path), { prunable: entry.prunable })
  }
  // 配置声明的 git 子仓（sub/submodule）的 worktree 注册在子仓自身列表下。
  for (const pkg of Object.values(config.packages)) {
    if (pkg.git !== true) continue
    const pkgDir = resolve(root, pkg.path)
    if (!existsSync(pkgDir)) continue
    const [pkgErr, pkgEntries] = gitWorktreeListSync(pkgDir)
    if (pkgErr !== null || pkgEntries === null) continue // 子仓探测失败不阻断（start 侧 fail loud）
    for (const entry of pkgEntries) {
      registered.set(resolve(entry.path), { prunable: entry.prunable })
    }
  }

  const wtRoot = resolve(root, WORKLOOM_DIR, WORKTREE_DIR)
  const unregistered: string[] = []
  const missing: string[] = []
  /** 项目根相对路径（展示用）。 */
  const toRel = (absPath: string): string => relative(root, absPath) || '.'

  // 注册在但目录失 / git 标记 prunable → 提示人工 `git worktree prune`（不自动修）。
  for (const [absPath, state] of registered) {
    if (absPath !== wtRoot && !absPath.startsWith(wtRoot + sep)) continue
    if (state.prunable || !existsSync(absPath)) missing.push(toRel(absPath))
  }

  // 目录在但未注册：两层布局扫描。level1 已注册 = root 布局 worktree（不再下钻，
  // 其检出子目录天然不注册）；level1 未注册时按容器（子级为 package worktree）或
  // 残留目录判定——任一子级已注册则 level1 视为容器不报。
  if (existsSync(wtRoot)) {
    if (!isDirectory(wtRoot)) {
      // `.workloom/.runtime/worktrees` 是普通文件等异常占位 → 直接报未注册。
      unregistered.push(toRel(wtRoot))
    } else {
      for (const name of readdirSync(wtRoot)) {
        const level1 = join(wtRoot, name)
        if (!isDirectory(level1)) {
          // 顶层残留文件（如 worktree 路径被文件占用）→ 未注册。
          unregistered.push(toRel(level1))
          continue
        }
        if (registered.has(resolve(level1))) continue // root 布局：整棵已注册
        const children = listSubdirectories(level1)
        const childRegistered = children.some((child) => registered.has(resolve(level1, child)))
        if (!childRegistered) {
          // 空目录 / 无任何已注册子级 → 残留（含空目录，add 静默复用盲区）。
          unregistered.push(toRel(level1))
        }
        for (const child of children) {
          if (!registered.has(resolve(level1, child))) unregistered.push(toRel(join(level1, child)))
        }
      }
    }
  }
  return [null, { unregistered, missing }]
}

/**
 * 目录判定（内部，doctor 探测用）：stat 失败（不存在/竞态）按非目录处理。
 */
function isDirectory(target: string): boolean {
  try {
    return statSync(target).isDirectory()
  } catch {
    return false
  }
}

/**
 * 列出子目录名（内部，doctor 探测用）：读取失败返回空数组。
 */
function listSubdirectories(dir: string): string[] {
  try {
    return readdirSync(dir).filter((child) => isDirectory(join(dir, child)))
  } catch {
    return []
  }
}
