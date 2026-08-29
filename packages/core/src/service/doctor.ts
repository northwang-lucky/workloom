/**
 * doctor：workloom 工作流健康检查命令的 core 引擎入口（编排层，TypeScript）。
 *
 * 设计意图：
 * - 本文件只做编排：runDoctor 收口异常 → doctorInternal 按 fix 开关走「检查 / 快照-修复-复核」；
 *   具体只读检查见 doctor-checks.ts，确定性修复见 doctor-fixes.ts，类型与元信息见 doctor-types.ts；
 * - --fix 路径 collectChecks 只执行 2 次（pre 检查 + 复核），复核结果由
 *   applyFixesAndMeasure 一并返回，避免额外中检；
 * - 复用 legacy task-store/active-task/task-gates/config API；仅在必要时补充极薄只读辅助；
 * - 运行时 issue/message 文案英文；注释中文。
 */

import { buildReport, collectChecks } from './doctor-checks.js'
import { applyFixesAndMeasure } from './doctor-fixes.js'
import { allIssues } from './doctor-tasks.js'
import type { DoctorReport, RunDoctorOpts } from './doctor-types.js'

export type {
  DoctorIssue,
  DoctorReport,
  DoctorCheck,
  DoctorSummary,
  DoctorIssueCode,
  DoctorSeverity,
  RunDoctorOpts,
} from './doctor-types.js'

/** 执行 doctor 引擎：返回 [err, report]（内部异常统一转 err）。 */
export function runDoctor(root: string, opts: RunDoctorOpts): [Error | null, DoctorReport | null] {
  try {
    return [null, doctorInternal(root, opts)]
  } catch (error) {
    return [toError(error), null]
  }
}

/** doctor 编排（内部）：无 --fix 直接出报告；有 --fix 先快照、修复、再复核。 */
function doctorInternal(root: string, opts: RunDoctorOpts): DoctorReport {
  const pre = collectChecks(root)
  if (!opts.fix) return buildReport(pre, [])
  const fixableSnapshot = allIssues(pre).filter((issue) => issue.fixable)
  const { fixed, post } = applyFixesAndMeasure(root, fixableSnapshot)
  return buildReport(post, fixed)
}

/** @param {unknown} value @returns {Error} */
function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value))
}

/**
 * 拼装 doctor 命令的 followup 注入文本：JSON 报告原文 + 引导 Agent 输出人类可读
 * 报告并引导修复非结构化问题（运行时文案英文）。
 * @param report doctor 报告
 * @returns 注入文本
 */
export function buildDoctorRelayText(report: DoctorReport): string {
  return [
    'The /workloom-doctor command produced the following workflow health report:',
    '',
    JSON.stringify(report, null, 2),
    '',
    "Based on this JSON, report the workflow health to the user in the user's language:",
    '- Summarize the total issues and their distribution across the checks.',
    '- For each issue, explain what is wrong, its severity, and the affected task/path.',
    '- For fixable: true issues, note they can be repaired by re-running with --fix (or were repaired; see fixed[]).',
    '- For fixable: false (manual) issues, give the concrete repair steps from the hint field.',
  ].join('\n')
}
