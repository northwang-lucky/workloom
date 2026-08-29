/**
 * doctor 检查引擎的只读检查实现（8 类检查 + collectChecks + buildReport）。
 *
 * 设计意图：
 * - 全部检查只读，不写任何 `.workloom/` 文件；写入逻辑在 doctor-fixes.ts；
 * - 任务扫描（collectTasks）与 issue/报告辅助见 doctor-tasks.ts，此处按需引用；
 * - buildReport 负责把 checks[] 汇总为 DoctorReport（summary + manual[]）；
 * - 运行时 issue/message 文案英文；注释中文。
 */

import { existsSync, readFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'

import { findWorkloomRoot, insideWorkloom, WORKLOOM_DIR } from '../legacy/locate.js'
import { TaskStatus } from '../legacy/task-store.js'
import { listPointers } from '../legacy/active-task.js'
import {
  countEffectiveJsonlRecords,
  findMissingPrdTitle,
  findUnfilledPrdSections,
} from '../legacy/task-gates.js'
import { loadConfig } from '../legacy/config.js'
import { parseJsonlEntries } from '../legacy/executor-context.js'
import type { JsonlEntry } from '../legacy/executor-context.d.ts'
import { CHECK_META } from './doctor-types.js'
import type {
  DoctorCheck,
  DoctorIssue,
  DoctorIssueCode,
  DoctorReport,
  DoctorSeverity,
  TaskNode,
} from './doctor-types.js'
import {
  allIssues,
  collectTasks,
  pointerPath,
  pushIssues,
  taskJsonPath,
} from './doctor-tasks.js'

/** 计划任务超期未 start 的判定窗口（24h）。 */
const PLANNING_STALE_MS = 24 * 3600 * 1000

/** 检查的 jsonl 文件。 */
const JSONL_NAMES = ['implement.jsonl', 'check.jsonl'] as const

/** makeIssue 入参（hint 可省略）。 */
interface IssueInput {
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
function makeIssue(input: IssueInput): DoctorIssue {
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

/** 收集全部检查：无 .workloom 时只出 config issue，其余检查为空。 */
export function collectChecks(root: string): DoctorCheck[] {
  const found = findWorkloomRoot(root)
  if (found === null) {
    const configIssue = makeIssue({
      code: 'config',
      title: 'No .workloom directory',
      severity: 'error',
      task: null,
      message: `no .workloom directory found (searched up from ${root})`,
      path: null,
      fixable: false,
      hint: 'Run the workloom init command to create the .workloom skeleton.',
    })
    return CHECK_META.map((meta) => ({
      ...meta,
      issues: meta.code === 'config' ? [configIssue] : [],
    }))
  }
  const projectRoot = found.root
  const nodes = collectTasks(projectRoot)
  const byName = new Map<string, TaskNode>(nodes.map((node) => [node.name, node]))
  /** @type {Map<DoctorIssueCode, DoctorIssue[]>} */
  const issueMap = new Map<DoctorIssueCode, DoctorIssue[]>()
  for (const meta of CHECK_META) issueMap.set(meta.code, [])
  pushIssues(issueMap, 'task-lifecycle', checkTaskLifecycle(projectRoot, nodes))
  pushIssues(issueMap, 'parent-child', checkParentChild(nodes, byName))
  pushIssues(issueMap, 'archive', checkArchive(nodes, byName))
  pushIssues(issueMap, 'dispatch-audit', checkDispatchAudit(nodes))
  pushIssues(issueMap, 'active-pointer', checkActivePointer(projectRoot, byName))
  pushIssues(issueMap, 'doc-completeness', checkDocCompleteness(projectRoot, nodes))
  pushIssues(issueMap, 'spec-ref', checkSpecRef(projectRoot, nodes))
  pushIssues(issueMap, 'config', checkConfig(projectRoot))
  return CHECK_META.map((meta) => ({ ...meta, issues: issueMap.get(meta.code) ?? [] }))
}

/** 组装报告：summary 取自当前 checks（fix 后即复核残留）。 */
export function buildReport(checks: DoctorCheck[], fixed: DoctorIssue[]): DoctorReport {
  const issues = allIssues(checks)
  return {
    checks,
    summary: {
      total: issues.length,
      fixable: issues.filter((issue) => issue.fixable).length,
      manual: issues.filter((issue) => !issue.fixable).length,
    },
    fixed,
    // 无 --fix 时 manual 即为全部存量 issue；fix 后为复核残留。
    manual: issues,
  }
}

/** 检查①：任务状态机（planning 超期 / in_progress 无 check / completed 未归档）。 */
function checkTaskLifecycle(root: string, nodes: TaskNode[]): DoctorIssue[] {
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
function checkParentChild(nodes: TaskNode[], byName: Map<string, TaskNode>): DoctorIssue[] {
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
function checkArchive(nodes: TaskNode[], byName: Map<string, TaskNode>): DoctorIssue[] {
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
function checkDispatchAudit(nodes: TaskNode[]): DoctorIssue[] {
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
          message: `Task is ${rec.status} but has no recorded executor dispatch; work may have bypassed the executor gate.`,
          path: taskJsonPath(node.relPath),
          fixable: false,
          hint: 'Dispatch the work through workloom_execute so the audit has a record.',
        }),
      )
    }
  }
  return issues
}

/** 检查⑤：活跃指针（指向不存在/已归档任务）。 */
function checkActivePointer(root: string, byName: Map<string, TaskNode>): DoctorIssue[] {
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

/** 检查⑥：文档完整性（prd 占位符/H1、jsonl 有效记录）。 */
function checkDocCompleteness(root: string, nodes: TaskNode[]): DoctorIssue[] {
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

/** 检查⑦：spec 引用完整性（jsonl 引用文件不存在）。 */
function checkSpecRef(root: string, nodes: TaskNode[]): DoctorIssue[] {
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

/** 检查⑧：配置（.workloom/config.yaml 缺失/非法、executor.gate 状态）。 */
function checkConfig(root: string): DoctorIssue[] {
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
        hint: 'Create .workloom/config.yaml to customize hooks, packages, subagents and the executor gate.',
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
  try {
    if (loadConfig(root).executor.gate === false) {
      issues.push(
        makeIssue({
          code: 'config',
          title: 'Executor gate disabled',
          severity: 'warn',
          task: null,
          message: 'executor.gate is disabled; main-session direct file writes are not hard-gated.',
          path: join(WORKLOOM_DIR, 'config.yaml'),
          fixable: false,
          hint: 'Consider re-enabling executor.gate to enforce the dispatch hard constraint.',
        }),
      )
    }
  } catch {
    // config.yaml 非法已在上面报过，此处不再重复（gate 状态无法读取）。
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
