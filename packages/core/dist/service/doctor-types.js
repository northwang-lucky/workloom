/**
 * workloom-doctor 检查引擎的类型、检查元信息与共享常量（新增抽象，TypeScript）。
 *
 * 设计意图：
 * - 集中定义 DoctorReport 相关类型、11 类检查元信息（CHECK_META）与跨模块常量；
 * - doctor-checks.ts / doctor-fixes.ts / doctor.ts 各自从此处引用类型与常量，避免循环依赖；
 * - 运行时 issue/message 文案英文；注释中文。
 */
/** 目录常量。 */
export const TASK_DIR = 'tasks';
export const ARCHIVE_DIR = 'archive';
/** task.json 写回缩进（保持 2 空格 + 尾换行）。 */
export const JSON_INDENT = 2;
/** 11 类检查的元信息（顺序即输出顺序；每类必出现）。 */
export const CHECK_META = [
    { code: 'task-lifecycle', title: 'Task state machine', severity: 'warn' },
    { code: 'parent-child', title: 'Parent-child consistency', severity: 'error' },
    { code: 'archive', title: 'Archive integrity', severity: 'error' },
    { code: 'dispatch-audit', title: 'Executor dispatch audit', severity: 'warn' },
    { code: 'stage-consistency', title: 'Task stage consistency', severity: 'warn' },
    { code: 'active-pointer', title: 'Active-task pointer', severity: 'warn' },
    { code: 'doc-completeness', title: 'Documentation completeness', severity: 'warn' },
    { code: 'spec-ref', title: 'Spec reference integrity', severity: 'warn' },
    { code: 'config', title: 'Configuration', severity: 'warn' },
    { code: 'local-prompts', title: 'Local prompts', severity: 'warn' },
    { code: 'workflow-overlay', title: 'Workflow overlay migration', severity: 'warn' },
];
//# sourceMappingURL=doctor-types.js.map