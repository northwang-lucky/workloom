/**
 * doctor 检查引擎的确定性机械修复器（3 类）+ 修复度量。
 *
 * 设计意图：
 * - 只修复「确定性机械问题」，且全部幂等（修一次后条件恒满足）：
 *   ① parent-child 双向补全；② active-pointer 清理；③ completed 归档迁移（无 check 拒绝）；
 * - 只写 `.workloom/` 内文件（task.json / 指针 / 目录）；
 * - applyFixesAndMeasure 在 applyFixes 后做一次 collectChecks 复核，返回 fixed（修复前快照）
 *   与 post（复核残留）交回编排层，避免 doctor 编排再重复收集。
 * - 运行时 issue/message 文案英文；注释中文。
 */
import type { DoctorCheck, DoctorIssue } from './doctor-types.js';
/**
 * 应用全部确定性机械修复并度量：返回 fixed（修复前快照）与 post（修复后复核）。
 * @param root 项目根
 * @param fixableSnapshot 修复前 issue 中可修复项的快照
 */
export declare function applyFixesAndMeasure(root: string, fixableSnapshot: DoctorIssue[]): {
    fixed: DoctorIssue[];
    post: DoctorCheck[];
};
