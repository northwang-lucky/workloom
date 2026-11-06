/**
 * git 集成操作面（写原语，TypeScript）：add+commit、merge/rebase 及其 abort、
 * worktree 增删清理、分支删除。
 *
 * 设计意图：
 * - 与查询面（git-query）拆分：本模块只承载集成操作；暂存范围由调用方枚举
 *   路径收窄，绝不整目录暂存；
 * - 失败 err 沿用 Node ExecFileException 的结构化字段——`err.code`（数字 = git
 *   退出码）与 `err.stderr`（git 文案），exit code 不可靠处（冲突判定）以
 *   MERGE_HEAD/REBASE_HEAD 探测判别；
 * - 共享子进程管线（runGit/GIT_ENV）自 git-query 导入，单一实现。
 */
import type { GitCommandError } from './git-query.ts';
/** 暂存调用方枚举的路径并提交（cwd 为 root）。
 * 收窄暂存范围：paths 为相对项目根的路径列表，只提交本次操作相关路径，
 * 其他在途任务的脏文件零接触；paths 为空直接报错（fail loud，防误提交空集）。
 * @returns err 为 null 表示成功
 */
export declare function gitAddCommit(root: string, message: string, paths: readonly string[]): Promise<[GitCommandError | null]>;
/**
 * 合并分支（`merge --no-edit <branch>`，cwd = 仓主检出 root）。
 * 失败时 err.code 透出 git 退出码（1=冲突或 untracked 拒绝、2=脏拒绝、
 * 128=身份缺失等）；exit code 不可靠，冲突与否以 MERGE_HEAD 判别。
 * @param root 工作目录（目标仓主检出）
 * @param branch 要合并的分支
 * @param opts 前置透传参数（fixture `-c k=v` 用）
 */
export declare function gitMerge(root: string, branch: string, opts?: {
    extraArgs?: string[];
}): Promise<[GitCommandError | null, string | null]>;
/**
 * 中止进行中的合并（`merge --abort`）：调用前必须先经 gitHasMergeHead 确认
 * 存在合并中状态（无 MERGE_HEAD 时 abort exit 128）。
 */
export declare function gitMergeAbort(root: string): Promise<[GitCommandError | null, string | null]>;
/**
 * rebase 分支到上游之上（`rebase <upstream>`，cwd = 任务 worktree 根：任务分支
 * 检出于此，git 不允许跨检出 rebase）。失败 err.code 透出 git 退出码——1 = 冲突
 * 中断或拒绝、128 = 身份缺失等；exit code 不可靠，冲突与否以 rebase 中断态
 * 探测（gitHasRebaseHead）判别，不以 exit code 定性。
 * @param root 任务 worktree 根（工作目录）
 * @param upstream 上游 ref（base 分支）
 */
export declare function gitRebase(root: string, upstream: string): Promise<[GitCommandError | null, string | null]>;
/**
 * 中止进行中的 rebase（`rebase --abort`）：调用前必须先经 gitHasRebaseHead 确认
 * 存在中断态（无中断态时 abort 语义不可靠）。
 */
export declare function gitRebaseAbort(root: string): Promise<[GitCommandError | null, string | null]>;
/**
 * 快进合并（`merge --ff-only --no-edit <branch>`，cwd = 仓主检出）。失败 err.code
 * 透出 git 退出码（128 = 非 fast-forward 拒绝；1 = 冲突/untracked 拒绝等）。
 * ff 拒绝不建 MERGE_HEAD（无合并态），失败直接以 err 透出 git 原始文案（竞态
 * 场景：rebase 完成后 base 又被推进；重跑归档会重判祖先关系并再次 rebase，天然自愈）。
 */
export declare function gitMergeFfOnly(root: string, branch: string): Promise<[GitCommandError | null, string | null]>;
/**
 * 创建 linked worktree：base 提供 → `worktree add -b <branch> <path> <base>`
 * （新分支）；否则 `worktree add <path> <branch>`（复用已存在分支）。
 * path 必须为绝对路径（相对路径按各自仓工作目录解析，跨仓调用有歧义）。
 * 失败 err.code 透出（255=分支已存在、128=路径占用/分支被检出/前导目录不可建）；
 * `-b` 路径失败会遗留游离分支，回滚由调用方负责。
 */
export declare function gitWorktreeAdd(root: string, path: string, branch: string, base?: string): Promise<[GitCommandError | null, string | null]>;
/**
 * 删除 linked worktree（目录一并删除；不删分支）。
 * 128=脏/非 worktree/locked（locked 需 unlock 或 -f -f，本原语不带 force——
 * 破坏性强制不自动化，调用方透传 err 文案）。
 */
export declare function gitWorktreeRemove(root: string, path: string): Promise<[GitCommandError | null, string | null]>;
/**
 * 清理失效 worktree 元数据（`worktree prune`）：只清元数据，从不删残留目录、
 * 不删分支——残留目录的处置由调用方 fail loud 交给人。
 */
export declare function gitWorktreePrune(root: string): Promise<[GitCommandError | null, string | null]>;
/**
 * 强删分支（`branch -D`）：回滚与 merge-delete-branch 清理用。
 * 分支被任一 worktree 检出时 exit 1（与 worktree remove 互锁，顺序必须先
 * remove 再删分支）。
 */
export declare function gitBranchDelete(root: string, branch: string): Promise<[GitCommandError | null, string | null]>;
