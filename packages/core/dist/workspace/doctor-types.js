/**
 * workloom-doctor 检查引擎的类型、检查元信息与共享常量（TypeScript）。
 *
 * 设计意图：
 * - 集中定义 DoctorReport 相关类型、五类检查集元信息（CHECK_META）与跨模块常量；
 * - doctor-checks.ts / doctor.ts / doctor-check-rules.ts 各自从此处引用类型与
 *   常量，避免循环依赖；
 * - 检查集五类（状态机重建后）：生命周期一致性、确认记录完整性（对照
 *   autonomy）、CASE 记录一致性、worktree 一致性、config；空槽提示行已随
 *   五类就位退役；
 * - 运行时 issue/message 文案英文；注释中文。
 */
/** 目录常量。 */
export const TASK_DIR = 'tasks';
export const ARCHIVE_DIR = 'archive';
/** task.json 写回缩进（保持 2 空格 + 尾换行）。 */
export const JSON_INDENT = 2;
/**
 * 五类检查集元信息（顺序即输出顺序；每类必出现）。
 */
export const CHECK_META = [
    { code: 'lifecycle-consistency', title: 'Lifecycle consistency', severity: 'warn' },
    { code: 'confirm-completeness', title: 'Confirmation completeness', severity: 'warn' },
    { code: 'case-consistency', title: 'CASE record consistency', severity: 'warn' },
    { code: 'worktree', title: 'Worktree consistency', severity: 'warn' },
    { code: 'config', title: 'Configuration', severity: 'warn' },
];
//# sourceMappingURL=doctor-types.js.map