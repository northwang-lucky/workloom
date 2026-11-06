/**
 * workloom-doctor 检查引擎的类型、检查元信息与共享常量（新增抽象，TypeScript）。
 *
 * 设计意图：
 * - 集中定义 DoctorReport 相关类型、最小检查集元信息（CHECK_META）与跨模块常量；
 * - doctor-checks.ts / doctor.ts 各自从此处引用类型与常量，避免循环依赖；
 * - 运行时 issue/message 文案英文；注释中文。
 */
import type { TaskRecordWithPath } from '../task/task-store.d.ts';
/**
 * 检查项 code 枚举（瘦身期最小集）：旧工作流语义检查全部随状态机重建退役，
 * 仅保留不依赖旧工作流语义的 worktree 与 config 两类（对齐决策 4）；
 * 检查集留空槽，由子任务三状态机重建承接。
 */
export type DoctorIssueCode = 'config' | 'worktree';
/** 严重级别。 */
export type DoctorSeverity = 'error' | 'warn';
/** 单条 issue（schema 固定字段）。 */
export interface DoctorIssue {
    code: DoctorIssueCode;
    title: string;
    severity: DoctorSeverity;
    /** 任务目录相对 .workloom 的路径；项目级 issue 为 null。 */
    task: string | null;
    message: string;
    /** 问题所在文件路径（相对项目根）或 null。 */
    path: string | null;
    fixable: boolean;
    hint: string | null;
}
/** 单类检查（code/title/severity + issues + 正向状态行）。 */
export interface DoctorCheck {
    code: DoctorIssueCode;
    title: string;
    severity: DoctorSeverity;
    issues: DoctorIssue[];
    /**
     * 正向状态行（非问题信息，供可观测性展示）：如 local-prompts 检查列出每个已
     * 加载片段（target、来源层、来源文件）。无正向信息为空数组。
     */
    info: string[];
}
/** 汇总统计。 */
export interface DoctorSummary {
    total: number;
    fixable: number;
    /**
     * 需要人工处理（即非 fixable）的 issue 计数。
     * 与报告字段 manual[] 口径不同：manual[] 是 --fix 后仍存留的全部 issue（含未修成的
     * fixable），而本字段只在全部 issue 中统计那些无法自动修复的项。
     */
    manual: number;
}
/** doctor 报告。 */
export interface DoctorReport {
    checks: DoctorCheck[];
    summary: DoctorSummary;
    /** 空槽提示行：检查集待状态机重建（瘦身期显式标注，不静默返回空）。 */
    slotsNote: string;
    /** 当前全部 issue（两检查产出）。 */
    manual: DoctorIssue[];
}
/** runDoctor 入参。 */
/** 任务节点（当前实际位置 + 记录）。 */
export interface TaskNode {
    name: string;
    relPath: string;
    archived: boolean;
    record: TaskRecordWithPath;
}
/** 目录常量。 */
export declare const TASK_DIR = "tasks";
export declare const ARCHIVE_DIR = "archive";
/** task.json 写回缩进（保持 2 空格 + 尾换行）。 */
export declare const JSON_INDENT = 2;
/**
 * 最小检查集元信息（顺序即输出顺序；每类必出现）。
 * 空槽提示：旧检查项的空位由 buildReport 以 slotsNote 显式标注（不静默返回空）。
 */
export declare const CHECK_META: ReadonlyArray<{
    code: DoctorIssueCode;
    title: string;
    severity: DoctorSeverity;
}>;
/** 检查集空槽提示行文案（doctor 报告显式携带，不静默返回空）。 */
export declare const DOCTOR_SLOTS_NOTE = "\u68C0\u67E5\u96C6\u5F85\u72B6\u6001\u673A\u91CD\u5EFA";
