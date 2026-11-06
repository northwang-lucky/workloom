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
import { findWorkloomRoot } from './locate.js';
import { CHECK_META, DOCTOR_SLOTS_NOTE } from "./doctor-types.js";
import { checkConfig, checkWorktree } from "./doctor-check-rules.js";
import { allIssues, makeIssue, pushIssues } from "./doctor-tasks.js";
/** 收集全部检查：无 .workloom 时只出 config issue，其余检查为空。 */
export function collectChecks(root) {
    const found = findWorkloomRoot(root);
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
        });
        return CHECK_META.map((meta) => ({
            ...meta,
            issues: meta.code === 'config' ? [configIssue] : [],
            info: [],
        }));
    }
    const projectRoot = found.root;
    /** @type {Map<DoctorIssueCode, DoctorIssue[]>} */
    const issueMap = new Map();
    for (const meta of CHECK_META) {
        issueMap.set(meta.code, []);
    }
    pushIssues(issueMap, 'config', checkConfig(projectRoot));
    pushIssues(issueMap, 'worktree', checkWorktree(projectRoot));
    return CHECK_META.map((meta) => ({
        ...meta,
        issues: issueMap.get(meta.code) ?? [],
        info: [],
    }));
}
/** 组装报告：summary 取自当前 checks；slotsNote 携带空槽提示（不静默返回空）。 */
export function buildReport(checks) {
    const issues = allIssues(checks);
    return {
        checks,
        summary: {
            total: issues.length,
            fixable: issues.filter((issue) => issue.fixable).length,
            manual: issues.filter((issue) => !issue.fixable).length,
        },
        slotsNote: DOCTOR_SLOTS_NOTE,
        manual: issues,
    };
}
//# sourceMappingURL=doctor-checks.js.map