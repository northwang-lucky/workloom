/**
 * git 最小封装（行为移植模块，纯 JS + JSDoc）。
 *
 * 设计意图：
 * - 提供归档自动提交所需的 add+commit 原语，以及收尾命令所需的
 *   工作区脏文件检查（gitStatus）；
 * - gitStatusSync/gitCurrentBranchSync 是同步查询变体，供 systemPrompt
 *   的同步 text provider 直接调用（与异步版本行为一致，输出经 trim）；
 *   在非 git 目录静默失败（子进程 stderr 忽略，不向宿主 stderr 输出报错）；
 * - 每一步失败都显式返回 err，由调用方决定是否阻塞；
 * - 使用 execFile（无 shell 解释），避免命令注入。
 */

import { execFile, execFileSync } from 'node:child_process'

import { WORKLOOM_DIR } from './locate.js'

/** git 可执行文件名。 */
const GIT_BIN = 'git'

/** add 固定参数：只暂存资产目录（目录名以 locate 的常量为准）。 */
const GIT_ADD_ARGS = ['add', '--', WORKLOOM_DIR]

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
 * 暂存 .workloom 并提交（cwd 为 root）。
 * @param {string} root 项目根目录
 * @param {string} message 提交信息
 * @returns {Promise<[Error | null]>} err 为 null 表示成功
 */
export async function gitAddCommit(root, message) {
  const addErr = await runGit(root, GIT_ADD_ARGS)
  if (addErr) return [addErr]
  const commitErr = await runGit(root, ['commit', '-m', message])
  if (commitErr) return [commitErr]
  return [null]
}

/**
 * 读取工作区状态（git status --porcelain 的 stdout）。
 * 输出非空即存在未提交/未跟踪的脏文件；非 git 目录返回 err。
 * @param {string} root 工作目录
 * @returns {Promise<[Error | null, string | null]>}
 */
export function gitStatus(root) {
  return new Promise((resolve) => {
    execFile(GIT_BIN, GIT_STATUS_ARGS, { cwd: root }, (error, stdout) => {
      if (error) {
        resolve([error, null])
        return
      }
      resolve([null, stdout])
    })
  })
}

/**
 * 同步读取工作区状态（git status --porcelain 的 stdout）。
 * 行为与 gitStatus 一致，但同步执行，供 systemPrompt 同步 text provider 调用；
 * 非 git 目录静默返回 err（子进程 stderr 忽略，不向宿主 stderr 输出报错）。
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
 * 执行一次 git 命令，失败返回 Error（内部）。
 * @param {string} root 工作目录
 * @param {string[]} args 命令参数
 * @returns {Promise<Error | null>}
 */
function runGit(root, args) {
  return new Promise((resolve) => {
    execFile(GIT_BIN, args, { cwd: root }, (error) => resolve(error ?? null))
  })
}

/** @param {unknown} value @returns {Error} */
function toError(value) {
  return value instanceof Error ? value : new Error(String(value))
}
