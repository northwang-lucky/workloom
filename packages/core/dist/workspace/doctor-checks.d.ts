/**
 * doctor 检查引擎（瘦身后最小集，TypeScript）：只收集 config 与 worktree 两类
 * 只读检查，报告携带空槽提示行「检查集待状态机重建」；旧工作流语义检查的空位
 * 由子任务三状态机重建承接，期间检查项变少属预期行为。
 *
 * 设计意图：
 * - 全部检查只读，不写任何 `.workloom/` 文件；
 * - 单类检查规则实现见 doctor-check-rules.ts（本文件只做收集与汇总）；
 * - 任务扫描（loadTaskNodes）与 issue 辅助（makeIssue 等）见 doctor-tasks.ts，按需引用；
 * - buildReport 负责把 checks[] 汇总为 DoctorReport（summary + slotsNote + manual[]）；
 * - 运行时 issue/message 文案英文；注释中文。
 */
import type { DoctorCheck, DoctorReport } from './doctor-types.ts';
/** 收集全部检查：无 .workloom 时只出 config issue，其余检查为空。 */
export declare function collectChecks(root: string): DoctorCheck[];
/** 组装报告：summary 取自当前 checks；slotsNote 携带空槽提示（不静默返回空）。 */
export declare function buildReport(checks: DoctorCheck[]): DoctorReport;
