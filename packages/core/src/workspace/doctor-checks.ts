/**
 * doctor 检查引擎（状态机重建后的五类，TypeScript）：收集 lifecycle-consistency、
 * confirm-completeness、case-consistency、worktree、config 五类只读检查；
 * 空槽提示行已随五类就位退役。
 *
 * 设计意图：
 * - 全部检查只读，不写任何 `.workloom/` 文件；
 * - 单类检查规则实现见 doctor-check-rules.ts（本文件只做收集与汇总）；
 * - 任务级三类检查共享一次任务扫描（loadTaskNodes）；
 * - buildReport 负责把 checks[] 汇总为 DoctorReport（summary + manual[]）；
 * - 运行时 issue/message 文案英文；注释中文。
 */

import { findWorkloomRoot } from './locate.js'
import { CHECK_META } from './doctor-types.ts'
import type {
  DoctorCheck,
  DoctorIssue,
  DoctorIssueCode,
  DoctorReport,
} from './doctor-types.ts'
import {
  checkCaseConsistency,
  checkConfig,
  checkConfirmCompleteness,
  checkLifecycleConsistency,
  checkWorktree,
  loadTaskNodes,
} from './doctor-check-rules.ts'
import { allIssues, makeIssue, pushIssues } from './doctor-tasks.ts'

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
      info: [],
    }))
  }
  const projectRoot = found.root
  const issueMap = new Map<DoctorIssueCode, DoctorIssue[]>()
  const infoMap = new Map<DoctorIssueCode, string[]>()
  for (const meta of CHECK_META) {
    issueMap.set(meta.code, [])
    infoMap.set(meta.code, [])
  }
  // 任务级三类检查共享一次扫描（活跃区 + 归档区）。
  const nodes = loadTaskNodes(projectRoot)
  const lifecycle = checkLifecycleConsistency(nodes)
  pushIssues(issueMap, 'lifecycle-consistency', lifecycle.issues)
  infoMap.get('lifecycle-consistency')?.push(...lifecycle.info)
  pushIssues(issueMap, 'confirm-completeness', checkConfirmCompleteness(nodes))
  pushIssues(issueMap, 'case-consistency', checkCaseConsistency(projectRoot, nodes))
  pushIssues(issueMap, 'worktree', checkWorktree(projectRoot))
  pushIssues(issueMap, 'config', checkConfig(projectRoot))
  return CHECK_META.map((meta) => ({
    ...meta,
    issues: issueMap.get(meta.code) ?? [],
    info: infoMap.get(meta.code) ?? [],
  }))
}

/** 组装报告：summary 取自当前 checks（空槽提示行已随五类检查集就位退役）。 */
export function buildReport(checks: DoctorCheck[]): DoctorReport {
  const issues = allIssues(checks)
  return {
    checks,
    summary: {
      total: issues.length,
      fixable: issues.filter((issue) => issue.fixable).length,
      manual: issues.filter((issue) => !issue.fixable).length,
    },
    manual: issues,
  }
}
