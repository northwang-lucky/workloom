/**
 * doctor 检查规则（状态机重建后的五类，TypeScript）：
 * lifecycle-consistency / confirm-completeness / case-consistency / worktree / config。
 *
 * 设计意图：
 * - 全部检查只读，不写任何 `.workloom/` 文件；
 * - 任务级三类检查共享一次任务扫描（loadTaskNodes）：活跃区 + 归档区逐个任务
 *   目录做「物理读取 + 兼容读映射」，读取或值域映射失败本身即生命周期问题；
 * - 生命周期一致性以状态机为唯一事实源：readTaskView 的可判定错误、TRANSITIONS
 *   推导的模式合法阶段集、status 与 stage 双字段一致性；planReview 的 revising
 *   轮数只记录不判定（info 行输出）；
 * - 确认完整性对照 autonomy：manual/semi 过了对齐期必须有 PRD 确认记录，
 *   standard 非容器任务进入实现期必须有 PLAN 确认记录，自动记录必须携带
 *   autonomy 审计快照；
 * - CASE 一致性对照 case.phase 轨道与 dispatches/case-result.md 实况：
 *   light 无 CASE 轨道、designSession 须有 case-design 派发、approved 及之后
 *   须有执行派发、done 须有 RESULT 文档；
 * - worktree 与 config 两类维持原只读检查；
 * - 运行时 issue/message 文案英文；注释中文。
 */
import type { DoctorIssue, DoctorTaskNode } from './doctor-types.ts';
/**
 * 扫描活跃区与归档区的全部任务目录：每个目录一条节点，物理读取或兼容读
 * 映射失败时 record/view 为 null 且 readError 携带可判定原因。
 * @param root 项目根
 * @returns 任务节点列表（活跃区在前、归档区在后）
 */
export declare function loadTaskNodes(root: string): DoctorTaskNode[];
/** 生命周期一致性检查产物（issues + info：revising 轮数只记录不判定）。 */
export interface LifecycleCheckResult {
    issues: DoctorIssue[];
    info: string[];
}
/**
 * 检查①生命周期一致性：任务记录可读且值域可映射、stage 与 mode 组合在迁移表
 * 合法集内、status 与 stage 双字段一致；planReview 的 revising 轮数经 info 行
 * 只记录不判定。
 * @param nodes 任务扫描节点
 * @returns issues 与 info 行
 */
export declare function checkLifecycleConsistency(nodes: DoctorTaskNode[]): LifecycleCheckResult;
/**
 * 检查②确认记录完整性：manual/semi 任务过了对齐期必须有 PRD 确认记录；
 * standard 非容器任务进入实现期必须有 PLAN 确认记录；自动记录的确认必须携带
 * autonomy 审计快照；PLAN 已确认但评审轨道停在 reviewing/revising 属矛盾态。
 * 归档任务不追溯（历史快照）。
 * @param nodes 任务扫描节点
 * @returns issue 列表
 */
export declare function checkConfirmCompleteness(nodes: DoctorTaskNode[]): DoctorIssue[];
/**
 * 检查③CASE 记录一致性：case.phase 轨道与模式、dispatches 与 RESULT 文档实况
 * 对照——light 无 CASE 轨道；designSession 必须有对应 case-design 派发记录；
 * approved 及之后必须有执行派发记录；done 必须有 case-result.md。
 * @param root 项目根
 * @param nodes 任务扫描节点
 * @returns issue 列表
 */
export declare function checkCaseConsistency(root: string, nodes: DoctorTaskNode[]): DoctorIssue[];
/**
 * 检查④worktree 一致性：
 * - `.workloom/.gitignore` 缺 `.runtime/` 条目（worktree 状态收敛在
 *   `.runtime/worktrees/`，存量项目不自动迁移 → 提示补条目）；
 * - `.workloom/.runtime/worktrees/` 目录与 git 注册不一致（目录在但未注册 /
 *   注册在但目录失或 prunable）→ 指引 `git worktree prune` + 人工检查。
 * 非 git 项目跳过注册比对（start 侧已 fail loud）；config 非法跳过（config 检查报告）。
 * @param root 项目根
 * @returns 检查出的 issue 列表
 */
export declare function checkWorktree(root: string): DoctorIssue[];
/**
 * 检查⑤config：缺配置 / packages 空配置 / 配置非法三类提示。
 * @param root 项目根
 * @returns 检查出的 issue 列表
 */
export declare function checkConfig(root: string): DoctorIssue[];
