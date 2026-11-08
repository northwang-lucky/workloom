/**
 * workloom-doctor 检查引擎的类型、检查元信息与共享常量（TypeScript）。
 *
 * 设计意图：
 * - 集中定义 DoctorReport 相关类型、五类检查集元信息（CHECK_META）与跨模块常量；
 * - doctor-checks.ts / doctor.ts / doctor-check-rules.ts 各自从此处引用类型与
 *   常量，避免循环依赖；
 * - 检查集五类（状态机重建后）：生命周期一致性、确认记录完整性（对照
 *   autonomy）、CASE 记录一致性、worktree 一致性、config；空槽提示行已随
 *   五类就位退役；
 * - 运行时 issue/message 文案英文；注释中文。
 */

import type { TaskRecordWithPath } from '../task/storage/index.ts'
import type { TaskView } from '../task/state/index.ts'

/** 检查项 code 枚举（五类：生命周期/确认完整性/CASE 一致性/worktree/config）。 */
export type DoctorIssueCode =
  | 'lifecycle-consistency'
  | 'confirm-completeness'
  | 'case-consistency'
  | 'worktree'
  | 'config'

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
   * 正向状态行（非问题信息，供可观测性展示）：如 planReview 的 revising 轮数
   * 只记录不判定，即经本数组输出。无正向信息为空数组。
   */
  info: string[]
}

/** 汇总统计。 */
export interface DoctorSummary {
  total: number
  fixable: number
  /**
   * 需要人工处理（即非 fixable）的 issue 计数。
   * 与报告字段 manual[] 口径不同：manual[] 是全部存留 issue（含可自动修复项），
   * 而本字段只统计其中无法自动修复的项。
   */
  manual: number
}

/** doctor 报告（空槽提示行已随五类检查集就位退役）。 */
export interface DoctorReport {
  checks: DoctorCheck[]
  summary: DoctorSummary
  /** 当前全部 issue。 */
  manual: DoctorIssue[]
}

/**
 * 任务扫描节点：活跃区与归档区的每个任务目录一条；record/view 为 null 表示
 * task.json 不可读或值域未映射（readError 携带可判定原因，生命周期检查消费）。
 */
export interface DoctorTaskNode {
  /** 任务目录名（basename）。 */
  name: string
  /** 任务目录相对 .workloom 的路径。 */
  relPath: string
  /** 是否位于归档区（tasks/archive/<YYYY-MM>/ 下）。 */
  archived: boolean
  /** 原始记录（物理读取失败为 null）。 */
  record: TaskRecordWithPath | null
  /** 兼容读视图（原始读取或值域映射失败为 null）。 */
  view: TaskView | null
  /** 读取/映射失败的可判定原因（成功为 null）。 */
  readError: string | null
}

/** 目录常量。 */
export const TASK_DIR = 'tasks'
export const ARCHIVE_DIR = 'archive'
/** task.json 写回缩进（保持 2 空格 + 尾换行）。 */
export const JSON_INDENT = 2

/**
 * 五类检查集元信息（顺序即输出顺序；每类必出现）。
 */
export const CHECK_META: ReadonlyArray<{
  code: DoctorIssueCode
  title: string
  severity: DoctorSeverity
}> = [
  { code: 'lifecycle-consistency', title: 'Lifecycle consistency', severity: 'warn' },
  { code: 'confirm-completeness', title: 'Confirmation completeness', severity: 'warn' },
  { code: 'case-consistency', title: 'CASE record consistency', severity: 'warn' },
  { code: 'worktree', title: 'Worktree consistency', severity: 'warn' },
  { code: 'config', title: 'Configuration', severity: 'warn' },
]
