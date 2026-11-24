/**
 * CASE 文件范围（TypeScript）：任务目录定位与实际 git 变更文件枚举。
 *
 * 设计意图：
 * - 与文档结构（case-structure）和门禁求值（case-gates）拆分：本模块只回答
 *   「代码改动的实际范围」——worktree 优先目录与 gitChangedFilesSync 封装；
 * - 无变更时由结果校验回退到 SR 声明范围（消费方决定）。
 */
import { resolve } from 'node:path'

import { gitChangedFilesSync, gitDiffChangedLines } from '../workspace/git-query.ts'
import { insideWorkloom } from '../workspace/locate.js'
import type { ChangedLineRange } from '../workspace/git-query.ts'
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

/**
 * 任务 diff 变更行清单（增量覆盖率门禁的分母口径）：
 * branch 与 base_branch 均非空时用 base_branch...HEAD 三点 diff；字段为空时走
 * 两点工作区 diff + 未跟踪文件；声明 ref 无效由原语 err 透传，不回退。
 * .workloom/ 元数据不属源码分母，直接过滤。
 * @returns {[Error | null, Map<string, ChangedLineRange[]> | null]} git 错误或变更行
 */
export function listCaseChangedLines(
  root: string,
  task: TaskRecord,
): [Error | null, Map<string, ChangedLineRange[]> | null] {
  const hasBranch =
    typeof task.branch === 'string' && task.branch !== '' &&
    typeof task.base_branch === 'string' && task.base_branch !== ''
  const baseRef = hasBranch ? task.base_branch : null
  const [err, changed] = gitDiffChangedLines(worktreeDirectory(root, task), baseRef)
  if (err !== null || changed === null) return [err, null]
  const filtered = new Map<string, ChangedLineRange[]>()
  for (const [file, ranges] of changed) {
    if (file.startsWith('.workloom/')) continue
    filtered.set(file, ranges)
  }
  return [null, filtered]
}


