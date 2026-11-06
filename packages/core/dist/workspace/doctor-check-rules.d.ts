/**
 * doctor 检查规则（瘦身后最小集，TypeScript）：仅保留不依赖旧工作流语义的
 * config 与 worktree 两类只读检查，worktree 已改接 .runtime/worktrees 新路径；
 * 其余检查项的空位以空槽提示行显式标注（doctor-types 的 DOCTOR_SLOTS_NOTE），
 * 由子任务三状态机重建承接。
 *
 * 设计意图：
 * - 全部检查只读，不写任何 `.workloom/` 文件；
 * - config：缺配置 / packages 空配置 / 配置非法三类提示；
 * - worktree：`.gitignore` 缺 `.runtime/` 条目 + 目录与 git 注册一致性
 *   （经 worktree-integrate 的 scanWorktreeConsistencySync 只读探测）；
 * - 运行时 issue/message 文案英文；注释中文。
 */
import type { DoctorIssue } from './doctor-types.ts';
export declare function checkConfig(root: string): DoctorIssue[];
/**
 * 检查⑩：worktree 一致性（design §7，第 12 类）：
 * - `.workloom/.gitignore` 缺 `.runtime/` 条目（worktree 状态收敛在
 *   `.runtime/worktrees/`，存量项目不自动迁移 → 提示补条目，
 *   迁移前主仓脏计数上升的副作用写入文案）；
 * - `.workloom/.runtime/worktrees/` 目录与 git 注册不一致（目录在但未注册 / 注册在但目录失
 *   或 prunable）→ 指引 `git worktree prune` + 人工检查（不自动破坏性修复）。
 * 非 git 项目跳过注册比对（start 侧已 fail loud）；config 非法跳过（config 检查报告）。
 * @param root 项目根
 * @returns 检查出的 issue 列表
 */
export declare function checkWorktree(root: string): DoctorIssue[];
