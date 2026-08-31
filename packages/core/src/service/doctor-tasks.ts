/**
 * doctor 检查引擎的任务扫描与 issue/报告辅助（只读）。
 *
 * 设计意图：
 * - collectTasks 统一枚举 active + archive 任务，供 9 类检查与修复器复用；
 * - allIssues/issueKey 在检查与修复度量之间共享「拉平」「唯一键」口径；
 * - taskJsonPath/canonicalRef/pointerPath 拼装 issue 引用的路径；makeIssue 组装 issue 字段；
 * - 运行时 issue/message 文案英文；注释中文。
 */

import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { insideWorkloom, WORKLOOM_DIR } from '../legacy/locate.js'
import { readTask } from '../legacy/task-store.js'
import { ARCHIVE_DIR, TASK_DIR } from './doctor-types.js'
import type {
  DoctorCheck,
  DoctorIssue,
  DoctorIssueCode,
  DoctorSeverity,
  TaskNode,
} from './doctor-types.js'

/** 枚举全部任务目录（active + archive），损坏/缺失目录跳过。 */
export function collectTasks(root: string): TaskNode[] {
  const tasksDir = insideWorkloom(root, TASK_DIR)
  if (!existsSync(tasksDir)) return []
  const nodes: TaskNode[] = []
  for (const entry of readdirSync(tasksDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === ARCHIVE_DIR) continue
    const relPath = join(TASK_DIR, entry.name)
    const [err, task] = readTask(root, relPath)
    if (err !== null || task === null) continue
    nodes.push({ name: entry.name, relPath, archived: false, record: task })
  }
  const archiveDir = join(tasksDir, ARCHIVE_DIR)
  if (!existsSync(archiveDir)) return nodes
  for (const month of readdirSync(archiveDir, { withFileTypes: true })) {
    if (!month.isDirectory()) continue
    const monthDir = join(archiveDir, month.name)
    for (const taskEntry of readdirSync(monthDir, { withFileTypes: true })) {
      if (!taskEntry.isDirectory()) continue
      const relPath = join(TASK_DIR, ARCHIVE_DIR, month.name, taskEntry.name)
      const [err, task] = readTask(root, relPath)
      if (err !== null || task === null) continue
      nodes.push({ name: taskEntry.name, relPath, archived: true, record: task })
    }
  }
  return nodes
}

/** 拉平全部检查的 issue 列表。 */
export function allIssues(checks: DoctorCheck[]): DoctorIssue[] {
  return checks.flatMap((check) => check.issues)
}

/** issue 唯一键：code+task+title+message（修复前后判「已消解」用）。 */
export function issueKey(issue: DoctorIssue): string {
  return `${issue.code}|${issue.task ?? ''}|${issue.title}|${issue.message}`
}

/** 把某检查产出追加到 issueMap 对应桶（初始化过，恒存在）。 */
export function pushIssues(
  issueMap: Map<DoctorIssueCode, DoctorIssue[]>,
  code: DoctorIssueCode,
  issues: DoctorIssue[],
): void {
  const target = issueMap.get(code)
  if (target !== undefined) target.push(...issues)
}

/** 任务级 issue 的 task.json 路径（相对项目根）。 */
export function taskJsonPath(relPath: string): string {
  return join(WORKLOOM_DIR, relPath, 'task.json')
}

/** 规范化父子引用：tasks/<name>。 */
export function canonicalRef(name: string): string {
  return join(TASK_DIR, name)
}

/** 指针文件路径（相对项目根，给 issue.path 用）。 */
export function pointerPath(contextKey: string): string {
  return join(WORKLOOM_DIR, '.runtime', 'sessions', `${contextKey}.json`)
}

/** makeIssue 入参（hint 可省略）。 */
export interface IssueInput {
  code: DoctorIssueCode
  title: string
  severity: DoctorSeverity
  task: string | null
  message: string
  path: string | null
  fixable: boolean
  hint?: string | null
}

/** 组装一条 issue（缺省 hint 为 null，保证字段齐全）。 */
export function makeIssue(input: IssueInput): DoctorIssue {
  return {
    code: input.code,
    title: input.title,
    severity: input.severity,
    task: input.task,
    message: input.message,
    path: input.path,
    fixable: input.fixable,
    hint: input.hint ?? null,
  }
}
