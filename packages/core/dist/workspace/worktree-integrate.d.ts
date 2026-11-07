/**
 * worktree 整合面（TypeScript）：merge/rebase 整合共用门禁与 gitlink 联动、
 * 目录与注册一致性扫描，以及三个 worktree 模块共用的错误辅助。
 *
 * 设计意图：
 * - 与生命周期编排（worktree-lifecycle）、setup 配置执行器（setup-executor）
 *   拆分：本模块承载 archive 整合的原语层与 doctor 只读扫描；
 * - 共享错误辅助（wtErr/errText/errCode）置于此叶子模块，供 lifecycle 与
 *   setup-executor 单向引用，不产生循环；
 * - 一致性扫描只读：不 prune、不删除任何路径，非 git 项目返回空结果。
 */
import type { TaskRepoResolution } from './worktree.d.ts';
import type { TaskRecord } from '../task/task-storage.ts';
/** 错误消息前缀（运行时文案英文）。 */
export declare const ERR_PREFIX = "workloom worktree";
/** worktree 根目录（相对 .workloom，布局定版收敛进运行时状态目录 `.runtime/worktrees/…`）。 */
export declare const WORKTREE_DIR = ".runtime/worktrees";
/** archive 清理中的合并模式（no-edit 合并回 base）。 */
export declare const MERGE_MODES: Set<string>;
/** archive 清理中的 rebase 整合模式（rebase 到 base 之上再 ff 合入，线性历史）。 */
export declare const REBASE_MODES: Set<string>;
/**
 * archive 清理中的整合模式（把任务分支整合进 base）：merge 与 rebase 共用
 * 主检出 HEAD==base 门禁与 submodule gitlink 联动。
 */
export declare const INTEGRATE_MODES: Set<string>;
/** archive 清理中的分支删除模式（delete 语义集合；删除顺序在 worktree remove 之后）。 */
export declare const DELETE_BRANCH_MODES: Set<string>;
/**
 * 组装 worktree 错误（共享辅助）。
 * @param message 英文文案（不含前缀）
 */
export declare function wtErr(message: string): Error;
/**
 * 提取 git 失败的可读文案（共享辅助）：优先 stderr（git 原始 fatal 文案），
 * 否则回退 Error.message。
 */
export declare function errText(error: Error & {
    stderr?: string | Buffer;
}): string;
/**
 * 提取 git 失败的退出码（共享辅助）：spawn 失败（如 ENOENT）时无数字码。
 */
export declare function errCode(error: Error & {
    code?: unknown;
}): string;
/**
 * 校验主检出 HEAD == base_branch（merge 与 rebase 整合路径共用）：
 * git 自身不拦 detached，显式比对是唯一防线。
 * @param repoRoot 仓根（主检出所在目录）
 * @param task 任务记录（base_branch）
 * @returns 不一致或探测失败时返回 err（含对齐指引）
 */
export declare function assertMainHeadOnBaseBranch(repoRoot: string, task: TaskRecord): Promise<Error | null>;
/**
 * submodule gitlink 幂等联动（design §3.4 步 4d）：根仓记录的 gitlink sha
 * 与 submodule 主检出 HEAD 不等 → 窄暂存 submodule 路径一条并提交（复用
 * gitAddCommit 纪律）；提交失败 fail loud（不复用「失败只 WARNING」的自动提交契约）。
 * @param root 项目根（= 根仓工作目录）
 * @param repo 仓解析结果（submodule）
 * @param task 任务记录
 * @returns true = 本次提交了 gitlink 更新
 */
export declare function syncGitlink(root: string, repo: TaskRepoResolution, task: TaskRecord): Promise<[Error | null, boolean | null]>;
/**
 * worktree 目录与 git 注册一致性探测（doctor 只读消费，design §7/§1）：
 * 扫描 `.workloom/.runtime/worktrees/` 两层布局（`<task-id>/` 与 `<task-id>/<pkg>/`），
 * 与根仓及配置声明 git 子仓的 `git worktree list --porcelain` 注册集比对。
 * 同步（doctor 收集链同步）；非 git 项目返回空结果（worktree 生命周期不可用，
 * 由 config/start 检查负责）。只读：不 prune、不删除任何路径。
 * @param root 项目根
 * @param config 项目配置（声明 git 子仓）
 * @returns unregistered = 目录在但未注册（项目根相对路径）；
 *   missing = 注册在但目录失或 prunable（项目根相对路径）
 */
export declare function scanWorktreeConsistencySync(root: string, config: import('./config.d.ts').WorkloomConfig): [Error | null, {
    unregistered: string[];
    missing: string[];
} | null];
