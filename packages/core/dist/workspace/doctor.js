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
import { buildReport, collectChecks } from "./doctor-checks.js";
/** 执行 doctor 引擎：返回 [err, report]（内部异常统一转 err）。 */
export function runDoctor(root) {
    try {
        return [null, doctorInternal(root)];
    }
    catch (error) {
        return [toError(error), null];
    }
}
/** doctor 编排（内部）：只读检查并出报告（无修复路径）。 */
function doctorInternal(root) {
    const checks = collectChecks(root);
    return buildReport(checks);
}
/** @param {unknown} value @returns {Error} */
function toError(value) {
    return value instanceof Error ? value : new Error(String(value));
}
/**
 * 拼装 doctor 命令的 followup 注入文本：JSON 报告原文 + 引导 Agent 输出人类可读
 * 报告并给出修复指引（运行时文案英文）。
 * @param report doctor 报告
 * @returns 注入文本
 */
export function buildDoctorRelayText(report) {
    return [
        'The /workloom-doctor command produced the following workflow health report:',
        '',
        JSON.stringify(report, null, 2),
        '',
        'Note: the check set is being rebuilt by the state machine; only the worktree and config checks remain.',
        "Based on this JSON, report the workflow health to the user in the user's language:",
        '- Summarize the total issues and their distribution across the checks.',
        '- For each issue, explain what is wrong, its severity, and the affected task/path.',
        '- For fixable: true issues, give the concrete repair steps from the hint field.',
        '- For fixable: false (manual) issues, give the concrete repair steps from the hint field.',
    ].join('\n');
}
//# sourceMappingURL=doctor.js.map