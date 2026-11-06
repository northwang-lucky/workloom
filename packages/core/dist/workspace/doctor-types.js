/**
 * workloom-doctor 检查引擎的类型、检查元信息与共享常量（新增抽象，TypeScript）。
 *
 * 设计意图：
 * - 集中定义 DoctorReport 相关类型、最小检查集元信息（CHECK_META）与跨模块常量；
 * - doctor-checks.ts / doctor.ts 各自从此处引用类型与常量，避免循环依赖；
 * - 运行时 issue/message 文案英文；注释中文。
 */
/** 目录常量。 */
export const TASK_DIR = 'tasks';
export const ARCHIVE_DIR = 'archive';
/** task.json 写回缩进（保持 2 空格 + 尾换行）。 */
export const JSON_INDENT = 2;
/**
 * 最小检查集元信息（顺序即输出顺序；每类必出现）。
 * 空槽提示：旧检查项的空位由 buildReport 以 slotsNote 显式标注（不静默返回空）。
 */
export const CHECK_META = [
    { code: 'config', title: 'Configuration', severity: 'warn' },
    { code: 'worktree', title: 'Worktree consistency', severity: 'warn' },
];
/** 检查集空槽提示行文案（doctor 报告显式携带，不静默返回空）。 */
export const DOCTOR_SLOTS_NOTE = '检查集待状态机重建';
//# sourceMappingURL=doctor-types.js.map