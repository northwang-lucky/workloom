/**
 * doctor：workloom 工作流健康检查命令的 core 引擎入口（编排层，TypeScript）。
 *
 * 设计意图：
 * - 本文件只做编排：runDoctor 收口异常 → doctorInternal 出「检查报告」；
 *   具体只读检查见 doctor-checks.ts，类型与元信息见 doctor-types.ts；
 * - --fix 修复能力已随 doctor-fixes 退役：本命令只出报告，检查集的重建归
 *   子任务三的状态机（期间检查项变少属预期行为）；
 * - 复用 domain task-store/active-task/task-gates/config API；仅在必要时补充极薄只读辅助；
 * - 运行时 issue/message 文案英文；注释中文。
 */
import type { DoctorReport } from './doctor-types.ts';
export type { DoctorIssue, DoctorReport, DoctorCheck, DoctorSummary, DoctorIssueCode, DoctorSeverity, } from './doctor-types.ts';
/** 执行 doctor 引擎：返回 [err, report]（内部异常统一转 err）。 */
export declare function runDoctor(root: string): [Error | null, DoctorReport | null];
/**
 * 拼装 doctor 命令的 followup 注入文本：JSON 报告原文 + 引导 Agent 输出人类可读
 * 报告并给出修复指引（运行时文案英文）。
 * @param report doctor 报告
 * @returns 注入文本
 */
export declare function buildDoctorRelayText(report: DoctorReport): string;
