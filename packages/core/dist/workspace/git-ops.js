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
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { runGit } from "./git-query.js";
/** 暂存调用方枚举的路径并提交（cwd 为 root）。
 * 收窄暂存范围：paths 为相对项目根的路径列表，只提交本次操作相关路径，
 * 其他在途任务的脏文件零接触；paths 为空直接报错（fail loud，防误提交空集）。
 * @returns err 为 null 表示成功
 */
export async function gitAddCommit(root, message, paths) {
    if (!Array.isArray(paths) || paths.length === 0) {
        return [new Error('git add requires at least one path')];
    }
    const stageable = await resolveStageablePaths(root, paths);
    if (stageable.length === 0) {
        return [new Error('git add: none of the given paths exists on disk or in the index')];
    }
    const [addErr] = await runGit(root, ['add', '--', ...stageable]);
    if (addErr)
        return [addErr];
    const [commitErr] = await runGit(root, ['commit', '-m', message]);
    if (commitErr)
        return [commitErr];
    return [null];
}
/**
 * 过滤可暂存路径（内部）：`git add` 的每个 pathspec 必须命中磁盘或索引，否则
 * 整条命令以「未匹配任何文件」失败——归档移动后的旧路径若从未被提交过即属此列，
 * 对提交零贡献。剔除规则：磁盘存在（新增/修改）或索引命中（记录删除）才保留；
 * 索引探测本身失败（非 git 仓库等）不在此吞错，原样交由后续 add 报错。
 * @returns 可暂存子集（保持入参顺序）
 */
async function resolveStageablePaths(root, paths) {
    const missing = paths.filter((path) => !existsSync(join(root, path)));
    if (missing.length === 0)
        return [...paths];
    const [err, stdout] = await runGit(root, ['ls-files', '--', ...missing]);
    if (err !== null || stdout === null)
        return [...paths];
    // ls-files 输出索引内的文件路径：目录路径按「同名或位于其下」匹配。
    const tracked = stdout.split('\n').filter((line) => line !== '');
    return [...paths].filter((path) => existsSync(join(root, path)) ||
        tracked.some((line) => line === path || line.startsWith(`${path}/`)));
}
/**
 * 合并分支（`merge --no-edit <branch>`，cwd = 仓主检出 root）。
 * 失败时 err.code 透出 git 退出码（1=冲突或 untracked 拒绝、2=脏拒绝、
 * 128=身份缺失等）；exit code 不可靠，冲突与否以 MERGE_HEAD 判别。
 * @param root 工作目录（目标仓主检出）
 * @param branch 要合并的分支
 * @param opts 前置透传参数（fixture `-c k=v` 用）
 */
export async function gitMerge(root, branch, opts = {}) {
    const extraArgs = Array.isArray(opts.extraArgs) ? opts.extraArgs : [];
    const [err, stdout] = await runGit(root, [...extraArgs, 'merge', '--no-edit', branch]);
    if (err !== null)
        return [err, null];
    return [null, stdout];
}
/**
 * 中止进行中的合并（`merge --abort`）：调用前必须先经 gitHasMergeHead 确认
 * 存在合并中状态（无 MERGE_HEAD 时 abort exit 128）。
 */
export async function gitMergeAbort(root) {
    const [err, stdout] = await runGit(root, ['merge', '--abort']);
    if (err !== null)
        return [err, null];
    return [null, stdout];
}
/**
 * rebase 分支到上游之上（`rebase <upstream>`，cwd = 任务 worktree 根：任务分支
 * 检出于此，git 不允许跨检出 rebase）。失败 err.code 透出 git 退出码——1 = 冲突
 * 中断或拒绝、128 = 身份缺失等；exit code 不可靠，冲突与否以 rebase 中断态
 * 探测（gitHasRebaseHead）判别，不以 exit code 定性。
 * @param root 任务 worktree 根（工作目录）
 * @param upstream 上游 ref（base 分支）
 */
export async function gitRebase(root, upstream) {
    const [err, stdout] = await runGit(root, ['rebase', upstream]);
    if (err !== null)
        return [err, null];
    return [null, stdout];
}
/**
 * 中止进行中的 rebase（`rebase --abort`）：调用前必须先经 gitHasRebaseHead 确认
 * 存在中断态（无中断态时 abort 语义不可靠）。
 */
export async function gitRebaseAbort(root) {
    const [err, stdout] = await runGit(root, ['rebase', '--abort']);
    if (err !== null)
        return [err, null];
    return [null, stdout];
}
/**
 * 快进合并（`merge --ff-only --no-edit <branch>`，cwd = 仓主检出）。失败 err.code
 * 透出 git 退出码（128 = 非 fast-forward 拒绝；1 = 冲突/untracked 拒绝等）。
 * ff 拒绝不建 MERGE_HEAD（无合并态），失败直接以 err 透出 git 原始文案（竞态
 * 场景：rebase 完成后 base 又被推进；重跑归档会重判祖先关系并再次 rebase，天然自愈）。
 */
export async function gitMergeFfOnly(root, branch) {
    const [err, stdout] = await runGit(root, ['merge', '--ff-only', '--no-edit', branch]);
    if (err !== null)
        return [err, null];
    return [null, stdout];
}
/**
 * 创建 linked worktree：base 提供 → `worktree add -b <branch> <path> <base>`
 * （新分支）；否则 `worktree add <path> <branch>`（复用已存在分支）。
 * path 必须为绝对路径（相对路径按各自仓工作目录解析，跨仓调用有歧义）。
 * 失败 err.code 透出（255=分支已存在、128=路径占用/分支被检出/前导目录不可建）；
 * `-b` 路径失败会遗留游离分支，回滚由调用方负责。
 */
export async function gitWorktreeAdd(root, path, branch, base) {
    const args = base === undefined ? ['worktree', 'add', path, branch] : ['worktree', 'add', '-b', branch, path, base];
    const [err, stdout] = await runGit(root, args);
    if (err !== null)
        return [err, null];
    return [null, stdout];
}
/**
 * 删除 linked worktree（目录一并删除；不删分支）。
 * 128=脏/非 worktree/locked（locked 需 unlock 或 -f -f，本原语不带 force——
 * 破坏性强制不自动化，调用方透传 err 文案）。
 */
export async function gitWorktreeRemove(root, path) {
    const [err, stdout] = await runGit(root, ['worktree', 'remove', path]);
    if (err !== null)
        return [err, null];
    return [null, stdout];
}
/**
 * 清理失效 worktree 元数据（`worktree prune`）：只清元数据，从不删残留目录、
 * 不删分支——残留目录的处置由调用方 fail loud 交给人。
 */
export async function gitWorktreePrune(root) {
    const [err, stdout] = await runGit(root, ['worktree', 'prune']);
    if (err !== null)
        return [err, null];
    return [null, stdout];
}
/**
 * 强删分支（`branch -D`）：回滚与 merge-delete-branch 清理用。
 * 分支被任一 worktree 检出时 exit 1（与 worktree remove 互锁，顺序必须先
 * remove 再删分支）。
 */
export async function gitBranchDelete(root, branch) {
    const [err, stdout] = await runGit(root, ['branch', '-D', branch]);
    if (err !== null)
        return [err, null];
    return [null, stdout];
}
//# sourceMappingURL=git-ops.js.map