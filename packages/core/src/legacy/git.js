/**
 * git 最小封装（行为移植模块，纯 JS + JSDoc）。
 *
 * 设计意图：
 * - 提供归档/journal 自动提交所需的 add+commit 原语（暂存范围由调用方
 *   枚举路径收窄，绝不整目录暂存），以及工作区脏文件检查（gitStatusSync，
 *   session-context 的 breadcrumb 消费）；
 * - 工作区/分支查询只保留同步变体（gitStatusSync/gitCurrentBranchSync），
 *   供 systemPrompt 的同步 text provider 直接调用，输出经 trim；
 *   在非 git 目录静默失败（子进程 stderr 忽略，不向宿主 stderr 输出报错）；
 * - 每一步失败都显式返回 err，由调用方决定是否阻塞；
 * - 使用 execFile（无 shell 解释），避免命令注入。
 */

import { execFile, execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

/** git 可执行文件名。 */
const GIT_BIN = 'git'

/** status 固定参数：porcelain 格式，无未跟踪/未提交项时输出为空。 */
const GIT_STATUS_ARGS = ['status', '--porcelain']

/** branch 固定参数：输出当前分支名（未检出分支时输出为空串）。 */
const GIT_BRANCH_ARGS = ['branch', '--show-current']

/**
 * 同步查询的 stdio 配置：stdout 仍 pipe 取输出；stdin/stderr ignore，
 * 默认 stdio 下 execFileSync 失败会把子进程 stderr 打到宿主 stderr，
 * 置 ignore 后 git 报错（如「不是 git 仓库」）完全静默。
 * @type {import('node:child_process').StdioOptions}
 */
const GIT_SYNC_STDIO = ['ignore', 'pipe', 'ignore']

/**
 * 统计 --porcelain 输出中的脏行数（空输出为 0）；session-context 与 adapter 共用。
 * @param {string} status porcelain 输出
 * @returns {number} 脏文件行数
 */
export function countDirtyLines(status) {
  return status.split('\n').filter((line) => line.trim() !== '').length
}

/**
 * 暂存调用方枚举的路径并提交（cwd 为 root）。
 * 收窄暂存范围：paths 为相对项目根的路径列表，只提交本次操作相关路径，
 * 其他在途任务的脏文件零接触；paths 为空直接报错（fail loud，防误提交空集）。
 * @param {string} root 项目根目录
 * @param {string} message 提交信息
 * @param {string[]} paths 相对项目根的待暂存路径列表
 * @returns {Promise<[Error | null]>} err 为 null 表示成功
 */
export async function gitAddCommit(root, message, paths) {
  if (!Array.isArray(paths) || paths.length === 0) {
    return [new Error('git add requires at least one path')]
  }
  const stageable = await resolveStageablePaths(root, paths)
  if (stageable.length === 0) {
    return [new Error('git add: none of the given paths exists on disk or in the index')]
  }
  const [addErr] = await runGit(root, ['add', '--', ...stageable])
  if (addErr) return [addErr]
  const [commitErr] = await runGit(root, ['commit', '-m', message])
  if (commitErr) return [commitErr]
  return [null]
}

/**
 * 过滤可暂存路径（内部）：`git add` 的每个 pathspec 必须命中磁盘或索引，否则
 * 整条命令以「未匹配任何文件」失败——归档移动后的旧路径若从未被提交过即属此列，
 * 对提交零贡献。剔除规则：磁盘存在（新增/修改）或索引命中（记录删除）才保留；
 * 索引探测本身失败（非 git 仓库等）不在此吞错，原样交由后续 add 报错。
 * @param {string} root 项目根
 * @param {string[]} paths 相对项目根的路径列表
 * @returns {Promise<string[]>} 可暂存子集（保持入参顺序）
 */
async function resolveStageablePaths(root, paths) {
  const missing = paths.filter((path) => !existsSync(join(root, path)))
  if (missing.length === 0) return paths
  const [err, stdout] = await runGit(root, ['ls-files', '--', ...missing])
  if (err !== null || stdout === null) return paths
  // ls-files 输出索引内的文件路径：目录路径按「同名或位于其下」匹配。
  const tracked = stdout.split('\n').filter((line) => line !== '')
  return paths.filter(
    (path) =>
      existsSync(join(root, path)) ||
      tracked.some((line) => line === path || line.startsWith(`${path}/`)),
  )
}

/**
 * 同步读取工作区状态（git status --porcelain 的 stdout）。
 * 输出非空即存在未提交/未跟踪的脏文件；供 systemPrompt 同步 text provider
 * 调用（session-context breadcrumb 消费）；非 git 目录静默返回 err（子进程
 * stderr 忽略，不向宿主 stderr 输出报错）。
 * @param {string} root 工作目录
 * @returns {[Error | null, string | null]}
 */
export function gitStatusSync(root) {
  try {
    return [
      null,
      execFileSync(GIT_BIN, GIT_STATUS_ARGS, { cwd: root, encoding: 'utf8', stdio: GIT_SYNC_STDIO }).trim(),
    ]
  } catch (error) {
    return [toError(error), null]
  }
}

/**
 * 同步读取当前分支名（git branch --show-current 的 stdout）。
 * 非 git 目录静默返回 err（子进程 stderr 忽略，不向宿主 stderr 输出报错）；
 * 仓库存在但未检出分支时输出为空串（value 为 ''）。
 * @param {string} root 工作目录
 * @returns {[Error | null, string | null]}
 */
export function gitCurrentBranchSync(root) {
  try {
    return [
      null,
      execFileSync(GIT_BIN, GIT_BRANCH_ARGS, { cwd: root, encoding: 'utf8', stdio: GIT_SYNC_STDIO }).trim(),
    ]
  } catch (error) {
    return [toError(error), null]
  }
}

/**
 * 执行一次 git 命令（内部）：失败返回 [err, null]，成功返回 [null, stdout]。
 * @param {string} root 工作目录
 * @param {string[]} args 命令参数
 * @returns {Promise<[Error | null, string | null]>}
 */
function runGit(root, args) {
  return new Promise((resolve) => {
    execFile(GIT_BIN, args, { cwd: root }, (error, stdout) => {
      if (error) {
        resolve([error, null])
        return
      }
      resolve([null, stdout])
    })
  })
}

/** @param {unknown} value @returns {Error} */
function toError(value) {
  return value instanceof Error ? value : new Error(String(value))
}
