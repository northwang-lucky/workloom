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
import type { DoctorCheck, DoctorIssue, DoctorReport } from './doctor-types.js';
/** 收集全部检查：无 .workloom 时只出 config issue，其余检查为空。 */
export declare function collectChecks(root: string): DoctorCheck[];
/** 组装报告：summary 取自当前 checks（fix 后即复核残留）。 */
export declare function buildReport(checks: DoctorCheck[], fixed: DoctorIssue[]): DoctorReport;
