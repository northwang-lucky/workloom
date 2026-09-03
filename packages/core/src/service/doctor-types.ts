/**
 * workloom-doctor 检查引擎的类型、检查元信息与共享常量（新增抽象，TypeScript）。
 *
 * 设计意图：
 * - 集中定义 DoctorReport 相关类型、11 类检查元信息（CHECK_META）与跨模块常量；
 * - doctor-checks.ts / doctor-fixes.ts / doctor.ts 各自从此处引用类型与常量，避免循环依赖；
 * - 运行时 issue/message 文案英文；注释中文。
 */

import type { TaskRecordWithPath } from '../legacy/task-store.d.ts'

/** 检查项 code 枚举。 */
export type DoctorIssueCode =
  | 'task-lifecycle'
  | 'parent-child'
  | 'archive'
  | 'dispatch-audit'
  | 'stage-consistency'
  | 'active-pointer'
  | 'doc-completeness'
  | 'spec-ref'
  | 'config'
  | 'local-prompts'
  | 'workflow-overlay'

/** 严重级别。 */
export type DoctorSeverity = 'error' | 'warn'

/** 单条 issue（schema 固定字段）。 */
export interface DoctorIssue {
  code: DoctorIssueCode
  title: string
  severity: DoctorSeverity
  /** 任务目录相对 .workloom 的路径；项目级 issue 为 null。 */
  task: string | null
  message: string
  /** 问题所在文件路径（相对项目根）或 null。 */
  path: string | null
  fixable: boolean
  hint: string | null
}

/** 单类检查（code/title/severity + issues + 正向状态行）。 */
export interface DoctorCheck {
  code: DoctorIssueCode
  title: string
  severity: DoctorSeverity
  issues: DoctorIssue[]
  /**
   * 正向状态行（非问题信息，供可观测性展示）：如 local-prompts 检查列出每个已
   * 加载片段（target、来源层、来源文件）。无正向信息为空数组。
   */
  info: string[]
}

/** 汇总统计。 */
export interface DoctorSummary {
  total: number
  fixable: number
  /**
   * 需要人工处理（即非 fixable）的 issue 计数。
   * 与报告字段 manual[] 口径不同：manual[] 是 --fix 后仍存留的全部 issue（含未修成的
   * fixable），而本字段只在全部 issue 中统计那些无法自动修复的项。
   */
  manual: number
}

/** doctor 报告。 */
export interface DoctorReport {
  checks: DoctorCheck[]
  summary: DoctorSummary
  /** --fix 时：已修复项（修复前 issue 快照）；否则为空数组。 */
  fixed: DoctorIssue[]
  /**
   * 检查后仍存留的全部 issue：--fix 后为「复核残留」（含未修成的 fixable 与全部
   * non-fixable）；无 --fix 时等于当前全部 issue。
   */
  manual: DoctorIssue[]
}

/** runDoctor 入参。 */
export interface RunDoctorOpts {
  fix: boolean
}

/** 任务节点（当前实际位置 + 记录）。 */
export interface TaskNode {
  name: string
  relPath: string
  archived: boolean
  record: TaskRecordWithPath
}

/** 目录常量。 */
export const TASK_DIR = 'tasks'
export const ARCHIVE_DIR = 'archive'
/** task.json 写回缩进（保持 2 空格 + 尾换行）。 */
export const JSON_INDENT = 2

/** 11 类检查的元信息（顺序即输出顺序；每类必出现）。 */
export const CHECK_META: ReadonlyArray<{
  code: DoctorIssueCode
  title: string
  severity: DoctorSeverity
}> = [
  { code: 'task-lifecycle', title: 'Task state machine', severity: 'warn' },
  { code: 'parent-child', title: 'Parent-child consistency', severity: 'error' },
  { code: 'archive', title: 'Archive integrity', severity: 'error' },
  { code: 'dispatch-audit', title: 'Executor dispatch audit', severity: 'warn' },
  { code: 'stage-consistency', title: 'Task stage consistency', severity: 'warn' },
  { code: 'active-pointer', title: 'Active-task pointer', severity: 'warn' },
  { code: 'doc-completeness', title: 'Documentation completeness', severity: 'warn' },
  { code: 'spec-ref', title: 'Spec reference integrity', severity: 'warn' },
  { code: 'config', title: 'Configuration', severity: 'warn' },
  { code: 'local-prompts', title: 'Local prompts', severity: 'warn' },
  { code: 'workflow-overlay', title: 'Workflow overlay migration', severity: 'warn' },
]
