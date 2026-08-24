/**
 * git 最小封装（行为移植模块，纯 JS + JSDoc）。
 *
 * 设计意图：
 * - 提供归档自动提交所需的 add+commit 原语，以及收尾命令所需的
 *   工作区脏文件检查（gitStatus）；
 * - 每一步失败都显式返回 err，由调用方决定是否阻塞；
 * - 使用 execFile（无 shell 解释），避免命令注入。
 */

import { execFile } from 'node:child_process'

import { WORKLOOM_DIR } from './locate.js'

/** git 可执行文件名。 */
const GIT_BIN = 'git'

/** add 固定参数：只暂存资产目录（目录名以 locate 的常量为准）。 */
const GIT_ADD_ARGS = ['add', '--', WORKLOOM_DIR]

/** status 固定参数：porcelain 格式，无未跟踪/未提交项时输出为空。 */
const GIT_STATUS_ARGS = ['status', '--porcelain']

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
