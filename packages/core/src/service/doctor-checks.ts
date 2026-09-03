/**
 * doctor 检查引擎的检查收集与报告组装（11 类检查 + collectChecks + buildReport）。
 *
 * 设计意图：
 * - 全部检查只读，不写任何 `.workloom/` 文件；写入逻辑在 doctor-fixes.ts；
 * - 单类检查规则实现见 doctor-check-rules.ts / doctor-local-prompts.ts（本文件只做
 *   收集与汇总）；
 * - 任务扫描（collectTasks）与 issue 辅助（makeIssue 等）见 doctor-tasks.ts，按需引用；
 * - buildReport 负责把 checks[] 汇总为 DoctorReport（summary + manual[]）；
 * - local-prompts 检查的正向状态（已加载片段）经 check.info 收集，随报告 JSON 输出；
 * - 运行时 issue/message 文案英文；注释中文。
 */

import { findWorkloomRoot } from '../legacy/locate.js'
import { CHECK_META } from './doctor-types.js'
import type {
  DoctorCheck,
  DoctorIssue,
  DoctorIssueCode,
  DoctorReport,
  TaskNode,
} from './doctor-types.js'
import {
  checkActivePointer,
  checkArchive,
  checkConfig,
  checkDispatchAudit,
  checkDocCompleteness,
  checkParentChild,
  checkSpecRef,
  checkStageConsistency,
  checkTaskLifecycle,
  checkWorkflowOverlay,
} from './doctor-check-rules.js'
import { checkLocalPrompts } from './doctor-local-prompts.js'
import {
  allIssues,
  collectTasks,
  makeIssue,
  pushIssues,
} from './doctor-tasks.js'

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
  const nodes = collectTasks(projectRoot)
  const byName = new Map<string, TaskNode>(nodes.map((node) => [node.name, node]))
  /** @type {Map<DoctorIssueCode, DoctorIssue[]>} */
  const issueMap = new Map<DoctorIssueCode, DoctorIssue[]>()
  const infoMap = new Map<DoctorIssueCode, string[]>()
  for (const meta of CHECK_META) {
    issueMap.set(meta.code, [])
    infoMap.set(meta.code, [])
  }
  pushIssues(issueMap, 'task-lifecycle', checkTaskLifecycle(projectRoot, nodes))
  pushIssues(issueMap, 'parent-child', checkParentChild(nodes, byName))
  pushIssues(issueMap, 'archive', checkArchive(nodes, byName))
  pushIssues(issueMap, 'dispatch-audit', checkDispatchAudit(nodes))
  pushIssues(issueMap, 'stage-consistency', checkStageConsistency(nodes))
  pushIssues(issueMap, 'active-pointer', checkActivePointer(projectRoot, byName))
  pushIssues(issueMap, 'doc-completeness', checkDocCompleteness(projectRoot, nodes))
  pushIssues(issueMap, 'spec-ref', checkSpecRef(projectRoot, nodes))
  pushIssues(issueMap, 'config', checkConfig(projectRoot))
  const local = checkLocalPrompts(projectRoot)
  pushIssues(issueMap, 'local-prompts', local.issues)
  infoMap.set('local-prompts', local.info)
  pushIssues(issueMap, 'workflow-overlay', checkWorkflowOverlay(projectRoot))
  return CHECK_META.map((meta) => ({
    ...meta,
    issues: issueMap.get(meta.code) ?? [],
    info: infoMap.get(meta.code) ?? [],
  }))
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
