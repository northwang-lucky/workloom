/**
 * CASE 文件范围（TypeScript）：任务目录定位与实际 git 变更文件枚举。
 *
 * 设计意图：
 * - 与文档结构（case-structure）和门禁求值（case-gates）拆分：本模块只回答
 *   「代码改动的实际范围」——worktree 优先目录与 gitChangedFilesSync 封装；
 * - 无变更时由结果校验回退到 SR 声明范围（消费方决定）。
 */
import { resolve } from 'node:path'

import { gitChangedFilesSync } from '../workspace/git-query.ts'
import { insideWorkloom } from '../workspace/locate.js'
import type { TaskRecord } from './storage/index.ts'

/**
 * @param {string} root 项目根
 * @param {string} taskRelPath 任务相对路径
 * @returns {string} 任务目录绝对路径
 */
export function taskDirectory(root: string, taskRelPath: string): string {
  return insideWorkloom(root, taskRelPath)
}

/**
 * @param {string} root 项目根
 * @param {TaskRecord} task 任务记录
 * @returns {string} 代码 worktree 或项目根
 */
export function worktreeDirectory(root: string, task: TaskRecord): string {
  return typeof task.worktree_path === 'string' && task.worktree_path !== ''
    ? resolve(root, task.worktree_path)
    : root
}

/**
 * 返回实际 git 变更；无变更时由结果校验回退到 SR 声明范围。
 * @param {string} root 项目根
 * @param {TaskRecord} task 任务记录
 * @returns {[Error | null, string[] | null]} git 错误或变更文件列表
 */
export function listCaseChangedFiles(root: string, task: TaskRecord): [Error | null, string[] | null] {
  return gitChangedFilesSync(worktreeDirectory(root, task))
}


