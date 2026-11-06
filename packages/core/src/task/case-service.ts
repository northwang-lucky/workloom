/**
 * workloom_task_case 的 runtime 无关 review-only 编排（TypeScript）。
 * CASE 由主会话对照 PRD、PLAN 与实际代码复核；复核满意后直接续接同一
 * designSession 执行，不再有用户确认动作，也不写任何复核凭证。
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { CASE_FILES, inspectCaseStructure, listCaseChangedFiles } from './case.js'
import type { CaseStructureIssue } from './case.d.ts'
import { findWorkloomRoot, insideWorkloom } from '../workspace/locate.js'
import { findArchivedTaskPath, readTask } from './task-store.js'
import type { TaskRecordWithPath, TaskStatusValue } from './task-store.d.ts'
import { ERR_PREFIX } from '../injection/surface.ts'
import { requireWorkloomCwd, resolveTaskRelPath } from './task-ops.ts'

/** review 成功结果：CASE 内容 + 结构诊断 + 会话链现状（零写盘，无哈希）。 */
export interface CaseReviewResult {
  action: 'review'
  taskRelPath: string
  status: TaskStatusValue
  /** case.md 全文快照（缺失为 null，由结构问题表达）。 */
  case: string | null
  /** 当前 CASE 设计会话（未记录为 null；执行续接的定位依据）。 */
  designSession: string | null
  /** CASE 结构问题（顺序由分类器决定，一次返回全部）。 */
  structureIssues: CaseStructureIssue[]
  /** structureIssues 的英文文案投影，供主会话直接展示。 */
  blockers: string[]
  /** 严格等价于 structureIssues 为空：主会话复核的机器可读参考。 */
  readyForExecution: boolean
}

export interface ExecuteTaskCaseParams {
  taskPath?: string
  /** 只支持 review：复核诊断只读，不写任何记录。 */
  action: 'review'
}

export type ExecuteTaskCaseResult = CaseReviewResult

export function executeTaskCase(
  cwd: string,
  contextKey: string,
  params: ExecuteTaskCaseParams,
): [Error | null, ExecuteTaskCaseResult | null] {
  try {
    requireWorkloomCwd(cwd)
    // 协议只保留 review：其他动作显式拒绝（无用户确认动作，也不写复核凭证）。
    if (params.action !== 'review') {
      throw new Error(
        `${ERR_PREFIX.taskTool}: only action=review is supported ` +
          '(the main session reviews the CASE and then continues the design session for execution)',
      )
    }
    const taskRelPath = resolveTaskRelPath(cwd, contextKey, params.taskPath, ERR_PREFIX.taskTool)
    const root = requireProjectRoot(cwd)
    const [taskErr, task] = readTask(root, taskRelPath)
    if (taskErr !== null || task === null) throw taskErr ?? new Error('task not found')
    return [null, reviewCase(root, taskRelPath, task)]
  } catch (error) {
    return [toError(error), null]
  }
}

function reviewCase(root: string, taskRelPath: string, task: TaskRecordWithPath): CaseReviewResult {
  const caseContent = readTaskFile(root, taskRelPath, CASE_FILES.document)
  const prdContent = readTaskFile(root, taskRelPath, 'prd.md')
  if (prdContent === null) throw new Error(`${ERR_PREFIX.taskTool}: prd.md is missing`)
  const [gitErr, changedFiles] = listCaseChangedFiles(root, task)
  if (gitErr !== null || changedFiles === null) throw gitErr ?? new Error('git changed files returned no result')
  const structureIssues = inspectCaseStructure(caseContent, prdContent, {
    taskRelPath,
    children: task.children,
    changedFiles,
  })
  for (const child of task.children) {
    // 子任务归档后 children 仍指向归档前路径：先读当前路径，缺失时按任务名
    // 兼容解析 tasks/archive/<YYYY-MM>/<name>/plan.md；两处都缺失才报缺失。
    const plan = readTaskFile(root, child, 'plan.md') ?? readArchivedChildPlan(root, child)
    if (plan === null) {
      structureIssues.push({ code: 'parent_plan_missing', message: `${child}/plan.md is missing` })
    }
  }
  return {
    action: 'review',
    taskRelPath,
    status: task.status,
    case: caseContent,
    designSession: task.case?.designSession ?? null,
    structureIssues,
    blockers: structureIssues.map((item) => item.message),
    readyForExecution: structureIssues.length === 0,
  }
}

function readTaskFile(root: string, taskRelPath: string, name: string): string | null {
  try {
    return readFileSync(join(insideWorkloom(root, taskRelPath), name), 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return null
    throw error
  }
}

/** 子任务已归档时按任务名回退读取归档目录内的 plan.md。 */
function readArchivedChildPlan(root: string, child: string): string | null {
  const archived = findArchivedTaskPath(root, child)
  return archived === null ? null : readTaskFile(root, archived, 'plan.md')
}

function requireProjectRoot(cwd: string): string {
  const found = findWorkloomRoot(cwd)
  if (found === null) throw new Error(`${ERR_PREFIX.taskTool}: no .workloom directory found`)
  return found.root
}

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value))
}
