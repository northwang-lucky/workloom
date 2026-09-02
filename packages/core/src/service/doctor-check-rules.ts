/**
 * doctor 检查引擎的 9 类检查规则实现（只读）。
 *
 * 设计意图：
 * - 从 doctor-checks.ts 拆分出的检查函数集（原文件超 600 行，见 code-style size 规则）；
 * - doctor-checks.ts 保留 collectChecks/buildReport（收集与报告），此处只实现单类检查；
 * - 全部检查只读，不写任何 `.workloom/` 文件；makeIssue 等 issue 辅助在 doctor-tasks.ts；
 * - 运行时 issue/message 文案英文；注释中文。
 */

import { existsSync, readFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'

import { insideWorkloom, WORKLOOM_DIR } from '../legacy/locate.js'
import { TaskStage, TaskStatus } from '../legacy/task-store.js'
import { EXECUTOR_KINDS, parseJsonlEntries } from '../legacy/executor-context.js'
import type { JsonlEntry } from '../legacy/executor-context.d.ts'
import { listPointers } from '../legacy/active-task.js'
import {
  countEffectiveJsonlRecords,
  findMissingPrdTitle,
  findUnfilledPrdSections,
} from '../legacy/task-gates.js'
import { loadConfig } from '../legacy/config.js'
import type { DoctorIssue, TaskNode } from './doctor-types.js'
import { makeIssue, pointerPath, taskJsonPath } from './doctor-tasks.js'

/** 计划任务超期未 start 的判定窗口（24h）。 */
const PLANNING_STALE_MS = 24 * 3600 * 1000

/** 检查的 jsonl 文件。 */
const JSONL_NAMES = ['implement.jsonl', 'check.jsonl'] as const

/** 检查①：任务状态机（planning 超期 / in_progress 无 check / completed 未归档）。 */
export function checkTaskLifecycle(root: string, nodes: TaskNode[]): DoctorIssue[] {
  const issues: DoctorIssue[] = []
  const now = Date.now()
  for (const node of nodes) {
    const rec = node.record
    if (rec.status === TaskStatus.PLANNING) {
      const createdAt = new Date(rec.createdAt).getTime()
      if (Number.isFinite(createdAt) && now - createdAt > PLANNING_STALE_MS) {
        issues.push(
          makeIssue({
            code: 'task-lifecycle',
            title: 'Stale planning task',
            severity: 'warn',
            task: node.relPath,
            message: `Task has been in planning for more than 24h (created ${rec.createdAt}); it has not been started.`,
            path: taskJsonPath(node.relPath),
            fixable: false,
            hint: 'Start the task (workloom_task_start) or drop it if it is no longer needed.',
          }),
        )
      }
    } else if (rec.status === TaskStatus.IN_PROGRESS && rec.check === null) {
      issues.push(
        makeIssue({
          code: 'task-lifecycle',
          title: 'In-progress task without a check',
          severity: 'warn',
          task: node.relPath,
          message: 'Task is in_progress but has no recorded check (step 2.2 not recorded).',
          path: taskJsonPath(node.relPath),
          fixable: false,
          hint: 'Run the check step (workloom_task_check) once the implementation passes.',
        }),
      )
    } else if (rec.status === TaskStatus.COMPLETED && !node.archived) {
      const fixable = rec.check !== null
      issues.push(
        makeIssue({
          code: 'task-lifecycle',
          title: 'Completed task not archived',
          severity: 'error',
          task: node.relPath,
          message: 'Task is completed but still under tasks/; it has not been archived.',
          path: taskJsonPath(node.relPath),
          fixable,
          hint: fixable
            ? 'Re-run with --fix to move it into archive/, or run workloom_task_archive.'
            : 'No check was recorded, so it cannot be archived automatically; record a check first.',
        }),
      )
    }
  }
  return issues
}

/** 检查②：父子一致性（双向缺失）。 */
export function checkParentChild(nodes: TaskNode[], byName: Map<string, TaskNode>): DoctorIssue[] {
  const issues: DoctorIssue[] = []
  for (const child of nodes) {
    const rec = child.record
    if (rec.parent === null) continue
    const parentName = basename(rec.parent)
    const parent = byName.get(parentName)
    if (parent === undefined) {
      issues.push(
        makeIssue({
          code: 'parent-child',
          title: 'Child references a missing parent',
          severity: 'error',
          task: child.relPath,
          message: `Task references parent '${rec.parent}' but no such task exists.`,
          path: taskJsonPath(child.relPath),
          fixable: false,
          hint: 'Reconcile the parent reference manually or remove it if the parent is gone.',
        }),
      )
    } else if (!parent.record.children.some((childRef) => basename(childRef) === child.name)) {
      issues.push(
        makeIssue({
          code: 'parent-child',
          title: 'Parent missing child back-reference',
          severity: 'warn',
          task: child.relPath,
          message: `Parent '${parentName}' (${parent.relPath}) is missing this child in its children list.`,
          path: taskJsonPath(child.relPath),
          fixable: true,
          hint: 'Re-run with --fix to append the child reference to the parent.',
        }),
      )
    }
  }
  for (const parent of nodes) {
    const rec = parent.record
    for (const childRef of rec.children) {
      const childName = basename(childRef)
      const child = byName.get(childName)
      if (child === undefined) continue
      if (child.record.parent === null) {
        issues.push(
          makeIssue({
            code: 'parent-child',
            title: 'Child missing parent back-reference',
            severity: 'warn',
            task: child.relPath,
            message: `Task '${childName}' is listed under ${parent.name}'s children but has no parent back-reference.`,
            path: taskJsonPath(child.relPath),
            fixable: true,
            hint: 'Re-run with --fix to set the child parent back-reference.',
          }),
        )
      }
    }
  }
  return issues
}

/** 检查③：归档完整性（父与子归档位置不一致）。 */
export function checkArchive(nodes: TaskNode[], byName: Map<string, TaskNode>): DoctorIssue[] {
  const issues: DoctorIssue[] = []
  for (const parent of nodes) {
    const rec = parent.record
    if (rec.children.length === 0) continue
    for (const childRef of rec.children) {
      const childName = basename(childRef)
      const child = byName.get(childName)
      if (child === undefined) continue
      if (child.archived !== parent.archived) {
        issues.push(
          makeIssue({
            code: 'archive',
            title: 'Parent/child archive mismatch',
            severity: 'error',
            task: parent.relPath,
            message: `Parent '${parent.name}' is ${parent.archived ? 'archived' : 'active'} but child '${childName}' is ${child.archived ? 'archived' : 'active'}.`,
            path: taskJsonPath(parent.relPath),
            fixable: false,
            hint: 'Archive or un-archive the mismatched task so parent/child locations stay consistent.',
          }),
        )
      }
    }
  }
  return issues
}

/** 检查④：executor 派发审计（已离开 planning 但无派发记录）。 */
export function checkDispatchAudit(nodes: TaskNode[]): DoctorIssue[] {
  const issues: DoctorIssue[] = []
  for (const node of nodes) {
    const rec = node.record
    if (rec.status === TaskStatus.PLANNING) continue
    if (rec.dispatches.length === 0) {
      issues.push(
        makeIssue({
          code: 'dispatch-audit',
          title: 'No recorded executor dispatch',
          severity: 'warn',
          task: node.relPath,
          message: `Task is ${rec.status} but has no recorded executor dispatch; work may have bypassed the workloom_execute dispatch convention.`,
          path: taskJsonPath(node.relPath),
          fixable: false,
          hint: 'Dispatch the work through workloom_execute so the audit has a record.',
        }),
      )
    }
  }
  return issues
}

/** 检查⑤：任务阶段一致性（stage=check 无/非 check 派发；stage 非法值）。 */
export function checkStageConsistency(nodes: TaskNode[]): DoctorIssue[] {
  const issues: DoctorIssue[] = []
  const stageValues = Object.values(TaskStage)
  for (const node of nodes) {
    const rec = node.record
    // stage 非法值（手改/损坏）：readTask 归一化只兜底 null/undefined，非空非法值原样保留。
    if (!stageValues.includes(rec.stage)) {
      issues.push(
        makeIssue({
          code: 'stage-consistency',
          title: 'Invalid task stage',
          severity: 'warn',
          task: node.relPath,
          message: `Task has invalid stage value '${String(rec.stage)}' (must be implement or check); task.json may have been edited manually.`,
          path: taskJsonPath(node.relPath),
          fixable: false,
          hint: 'Restore the stage field to implement or check (re-dispatch through workloom_execute to rewrite it).',
        }),
      )
      continue
    }
    // 仅 in_progress + stage=check 需要「最近派发为 check」的审计闭环。
    if (rec.status !== TaskStatus.IN_PROGRESS || rec.stage !== TaskStage.CHECK) continue
    const last = rec.dispatches[rec.dispatches.length - 1]
    if (last === undefined) {
      issues.push(
        makeIssue({
          code: 'stage-consistency',
          title: 'Check stage without dispatch',
          severity: 'warn',
          task: node.relPath,
          message: "Task is in_progress with stage 'check' but has no recorded executor dispatch; the check phase has no audit trail.",
          path: taskJsonPath(node.relPath),
          fixable: false,
          hint: 'Dispatch a check executor (workloom_execute kind=check) to record the phase.',
        }),
      )
    } else if (last.kind !== EXECUTOR_KINDS.check) {
      issues.push(
        makeIssue({
          code: 'stage-consistency',
          title: 'Check stage with stale dispatch',
          severity: 'warn',
          task: node.relPath,
          message: `Task is in_progress with stage 'check' but the latest dispatch was kind '${last.kind}' (not check); the stage may be out of sync.`,
          path: taskJsonPath(node.relPath),
          fixable: false,
          hint: 'Dispatch a check executor (workloom_execute kind=check) to sync the stage, or reset the stage if the task never entered check.',
        }),
      )
    }
  }
  return issues
}

/** 检查⑥：活跃指针（指向不存在/已归档任务）。 */
export function checkActivePointer(root: string, byName: Map<string, TaskNode>): DoctorIssue[] {
  const issues: DoctorIssue[] = []
  const [, pointers] = listPointers(root)
  if (pointers === null) return issues
  for (const pointer of pointers) {
    const targetName = basename(pointer.current_task)
    const node = byName.get(targetName)
    if (node === undefined) {
      issues.push(
        makeIssue({
          code: 'active-pointer',
          title: 'Dangling active-task pointer',
          severity: 'warn',
          task: pointer.current_task,
          message: `Active pointer for session '${pointer.contextKey}' references '${pointer.current_task}', which does not exist.`,
          path: pointerPath(pointer.contextKey),
          fixable: true,
          hint: 'Re-run with --fix to clear the dangling pointer.',
        }),
      )
    } else if (node.archived) {
      issues.push(
        makeIssue({
          code: 'active-pointer',
          title: 'Active pointer to archived task',
          severity: 'warn',
          task: pointer.current_task,
          message: `Active pointer for session '${pointer.contextKey}' references archived task '${pointer.current_task}'.`,
          path: pointerPath(pointer.contextKey),
          fixable: true,
          hint: 'Re-run with --fix to clear the pointer to the archived task.',
        }),
      )
    }
  }
  return issues
}

/** 检查⑦：文档完整性（prd 占位符/H1、jsonl 有效记录）。 */
export function checkDocCompleteness(root: string, nodes: TaskNode[]): DoctorIssue[] {
  const issues: DoctorIssue[] = []
  for (const node of nodes) {
    const taskDir = insideWorkloom(root, node.relPath)
    const prd = readIfExists(join(taskDir, 'prd.md'))
    if (prd === null) {
      issues.push(
        makeIssue({
          code: 'doc-completeness',
          title: 'Missing prd.md',
          severity: 'warn',
          task: node.relPath,
          message: 'prd.md is missing.',
          path: join(WORKLOOM_DIR, node.relPath, 'prd.md'),
          fixable: false,
          hint: 'Write prd.md with Goal, Requirements, Acceptance Criteria and Notes sections.',
        }),
      )
    } else {
      const titleMissing = findMissingPrdTitle(prd)
      if (titleMissing !== null) {
        issues.push(
          makeIssue({
            code: 'doc-completeness',
            title: 'prd.md missing H1',
            severity: 'warn',
            task: node.relPath,
            message: `prd.md is missing an H1 title (${titleMissing}).`,
            path: join(WORKLOOM_DIR, node.relPath, 'prd.md'),
            fixable: false,
            hint: 'Start prd.md with a "# Task title" H1 line.',
          }),
        )
      }
      const unfilled = findUnfilledPrdSections(prd)
      if (unfilled.length > 0) {
        issues.push(
          makeIssue({
            code: 'doc-completeness',
            title: 'prd.md placeholder sections',
            severity: 'warn',
            task: node.relPath,
            message: `prd.md sections still placeholder: ${unfilled.join(', ')}.`,
            path: join(WORKLOOM_DIR, node.relPath, 'prd.md'),
            fixable: false,
            hint: `Fill in the following sections: ${unfilled.join(', ')}.`,
          }),
        )
      }
    }
    if (node.record.status === TaskStatus.PLANNING) continue
    for (const jsonlName of JSONL_NAMES) {
      const content = readIfExists(join(taskDir, jsonlName))
      if (content === null) {
        issues.push(
          makeIssue({
            code: 'doc-completeness',
            title: 'Missing jsonl',
            severity: 'warn',
            task: node.relPath,
            message: `${jsonlName} is missing.`,
            path: join(WORKLOOM_DIR, node.relPath, jsonlName),
            fixable: false,
            hint: `Record the specs/files in ${jsonlName} (one JSON object per line with a file field).`,
          }),
        )
        continue
      }
      let effective: number
      try {
        effective = countEffectiveJsonlRecords(content, jsonlName)
      } catch {
        issues.push(
          makeIssue({
            code: 'doc-completeness',
            title: 'Malformed jsonl',
            severity: 'warn',
            task: node.relPath,
            message: `${jsonlName} has a malformed line.`,
            path: join(WORKLOOM_DIR, node.relPath, jsonlName),
            fixable: false,
            hint: `Fix the JSON lines in ${jsonlName}.`,
          }),
        )
        continue
      }
      if (effective === 0) {
        issues.push(
          makeIssue({
            code: 'doc-completeness',
            title: 'jsonl without effective records',
            severity: 'warn',
            task: node.relPath,
            message: `${jsonlName} has no effective records.`,
            path: join(WORKLOOM_DIR, node.relPath, jsonlName),
            fixable: false,
            hint: `Record the specs/files in ${jsonlName} (one JSON object per line with a file field).`,
          }),
        )
      }
    }
  }
  return issues
}

/** 检查⑧：spec 引用完整性（jsonl 引用文件不存在）。 */
export function checkSpecRef(root: string, nodes: TaskNode[]): DoctorIssue[] {
  const issues: DoctorIssue[] = []
  for (const node of nodes) {
    const taskDir = insideWorkloom(root, node.relPath)
    for (const jsonlName of JSONL_NAMES) {
      const content = readIfExists(join(taskDir, jsonlName))
      if (content === null) continue
      let entries: JsonlEntry[]
      try {
        entries = parseJsonlEntries(content, jsonlName)
      } catch {
        continue // 结构性坏行已在 doc-completeness 报，此处避免重复
      }
      for (const entry of entries) {
        if (entry.type === 'directory') continue
        const absFile = resolveInsideRoot(root, entry.file)
        if (absFile === null) continue
        if (!existsSync(absFile)) {
          issues.push(
            makeIssue({
              code: 'spec-ref',
              title: 'Missing referenced file',
              severity: 'warn',
              task: node.relPath,
              message: `${jsonlName} references a missing file: ${entry.file}.`,
              path: join(WORKLOOM_DIR, node.relPath, jsonlName),
              fixable: false,
              hint: 'Fix the spec/research reference so the referenced file exists.',
            }),
          )
        }
      }
    }
  }
  return issues
}

/** 检查⑨：配置（.workloom/config.yaml 缺失/非法）。 */
export function checkConfig(root: string): DoctorIssue[] {
  const issues: DoctorIssue[] = []
  const configPath = join(root, WORKLOOM_DIR, 'config.yaml')
  if (!existsSync(configPath)) {
    issues.push(
      makeIssue({
        code: 'config',
        title: 'Missing config.yaml',
        severity: 'warn',
        task: null,
        message: 'config.yaml is missing; using built-in defaults.',
        path: join(WORKLOOM_DIR, 'config.yaml'),
        fixable: false,
        hint: 'Create .workloom/config.yaml to customize hooks, packages and subagents.',
      }),
    )
  } else {
    try {
      loadConfig(root)
    } catch (error) {
      issues.push(
        makeIssue({
          code: 'config',
          title: 'Invalid config.yaml',
          severity: 'error',
          task: null,
          message: `config.yaml is invalid: ${messageOf(error)}`,
          path: join(WORKLOOM_DIR, 'config.yaml'),
          fixable: false,
          hint: 'Fix the YAML error in .workloom/config.yaml.',
        }),
      )
    }
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

/** 把 jsonl 引用文件解析为项目根内绝对路径；越界返回 null（防路径逃逸）。 */
function resolveInsideRoot(root: string, file: string): string | null {
  const abs = resolve(root, file)
  if (abs !== root && !abs.startsWith(`${root}/`)) return null
  return abs
}

/** @param {unknown} error @returns {string} 消息文本。 */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** @param {unknown} error @returns {boolean} 是否文件不存在。 */
function isEnoent(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | null)?.code === 'ENOENT'
}
