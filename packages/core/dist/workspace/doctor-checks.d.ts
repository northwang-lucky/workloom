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
import type { DoctorCheck, DoctorReport } from './doctor-types.ts';
/** 收集全部检查：无 .workloom 时只出 config issue，其余检查为空。 */
export declare function collectChecks(root: string): DoctorCheck[];
/** 组装报告：summary 取自当前 checks（空槽提示行已随五类检查集就位退役）。 */
export declare function buildReport(checks: DoctorCheck[]): DoctorReport;
