/**
 * doctor 检查引擎的确定性机械修复器（3 类）+ 修复度量。
 *
 * 设计意图：
 * - 只修复「确定性机械问题」，且全部幂等（修一次后条件恒满足）：
 *   ① parent-child 双向补全；② active-pointer 清理；③ completed 归档迁移（无 check 拒绝）；
 * - 只写 `.workloom/` 内文件（task.json / 指针 / 目录），不受 executor.gate 影响；
 * - applyFixesAndMeasure 在 applyFixes 后做一次 collectChecks 复核，返回 fixed（修复前快照）
 *   与 post（复核残留）交回编排层，避免 doctor 编排再重复收集。
 * - 运行时 issue/message 文案英文；注释中文。
 */

import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

import { insideWorkloom } from '../legacy/locate.js'
import { TaskStatus } from '../legacy/task-store.js'
import { clearPointersToTask, listPointers } from '../legacy/active-task.js'
import { ARCHIVE_DIR, JSON_INDENT, TASK_DIR } from './doctor-types.js'
import type { DoctorCheck, DoctorIssue, TaskNode } from './doctor-types.js'
import { collectChecks } from './doctor-checks.js'
import { allIssues, canonicalRef, collectTasks, issueKey } from './doctor-tasks.js'

/**
 * 应用全部确定性机械修复并度量：返回 fixed（修复前快照）与 post（修复后复核）。
 * @param root 项目根
 * @param fixableSnapshot 修复前 issue 中可修复项的快照
 */
export function applyFixesAndMeasure(
  root: string,
  fixableSnapshot: DoctorIssue[],
): { fixed: DoctorIssue[]; post: DoctorCheck[] } {
  applyFixes(root)
  const post = collectChecks(root)
  const postKeys = new Set(allIssues(post).map(issueKey))
  const fixed = fixableSnapshot.filter((issue) => !postKeys.has(issueKey(issue)))
  return { fixed, post }
}

/** 应用全部确定性机械修复（幂等：只修一次，修完条件恒满足）。 */
function applyFixes(root: string): void {
  fixParentChildGaps(root)
  fixActivePointers(root)
  fixCompletedArchive(root)
}

/** 修复①：parent-child 双向补全（只写 .workloom 内 task.json）。 */
function fixParentChildGaps(root: string): void {
  const nodes = collectTasks(root)
  const byName = new Map<string, TaskNode>(nodes.map((node) => [node.name, node]))
  const changed = new Set<string>()
  for (const child of nodes) {
    const rec = child.record
    if (rec.parent === null) continue
    const parentName = basename(rec.parent)
    const parent = byName.get(parentName)
    if (parent === undefined) continue
    if (!parent.record.children.some((childRef) => basename(childRef) === child.name)) {
      parent.record.children.push(canonicalRef(child.name))
      changed.add(parent.name)
    }
  }
  for (const parent of nodes) {
    const rec = parent.record
    for (const childRef of rec.children) {
      const childName = basename(childRef)
      const child = byName.get(childName)
      if (child === undefined) continue
      if (child.record.parent === null) {
        child.record.parent = canonicalRef(parent.name)
        changed.add(child.name)
      }
    }
  }
  for (const name of changed) {
    const node = byName.get(name)
    if (node !== undefined) writeTaskRecord(root, node)
  }
}

/** 修复②：active-pointer 清理（删除指向不存在/归档任务的指针文件）。 */
function fixActivePointers(root: string): void {
  const nodes = collectTasks(root)
  const byName = new Map<string, TaskNode>(nodes.map((node) => [node.name, node]))
  const [, pointers] = listPointers(root)
  if (pointers === null) return
  for (const pointer of pointers) {
    const targetName = basename(pointer.current_task)
    const node = byName.get(targetName)
    if (node === undefined || node.archived) {
      rmSync(pointer.absPath, { force: true })
    }
  }
}

/** 修复③：completed 任务归档迁移（无 check 记录拒绝，不移）。 */
function fixCompletedArchive(root: string): void {
  const nodes = collectTasks(root)
  for (const node of nodes) {
    const rec = node.record
    if (rec.status !== TaskStatus.COMPLETED) continue
    if (node.archived) continue
    if (rec.check === null) continue // 无 check 凭据：拒绝迁移（保留为 manual）
    const now = new Date()
    const archiveRel = join(TASK_DIR, ARCHIVE_DIR, formatYearMonth(now), node.name)
    const archiveDir = insideWorkloom(root, archiveRel)
    if (existsSync(archiveDir)) continue // 目标已存在：跳过，交由 manual 处理
    mkdirSync(dirname(archiveDir), { recursive: true })
    renameSync(insideWorkloom(root, node.relPath), archiveDir)
    if (rec.completedAt === null) rec.completedAt = now.toISOString()
    const { taskRelPath: _dropped, ...record } = rec
    writeFileSync(join(archiveDir, 'task.json'), `${JSON.stringify(record, null, JSON_INDENT)}\n`)
    clearPointersToTask(root, node.relPath)
  }
}

/** 写回任务记录到当前位置（剥离 taskRelPath，保持 2 空格缩进+尾换行）。 */
function writeTaskRecord(root: string, node: TaskNode): void {
  const dir = insideWorkloom(root, node.relPath)
  const { taskRelPath: _dropped, ...record } = node.record
  writeFileSync(join(dir, 'task.json'), `${JSON.stringify(record, null, JSON_INDENT)}\n`)
}

/** 当前年月归档目录前缀（本地时区 YYYY-MM）。 */
function formatYearMonth(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`
}

/** @param {number} value @returns {string} 补零到两位。 */
function pad2(value: number): string {
  return String(value).padStart(2, '0')
}
