/**
 * 统计 --porcelain 输出中的脏行数（空输出为 0）；session-context 与 adapter 共用。
 * @param {string} status porcelain 输出
 * @returns {number} 脏文件行数
 */
export function countDirtyLines(status: string): number;
/**
 * 暂存调用方枚举的路径并提交（cwd 为 root）。
 * 收窄暂存范围：paths 为相对项目根的路径列表，只提交本次操作相关路径，
 * 其他在途任务的脏文件零接触；paths 为空直接报错（fail loud，防误提交空集）。
 * @param {string} root 项目根目录
 * @param {string} message 提交信息
 * @param {string[]} paths 相对项目根的待暂存路径列表
 * @returns {Promise<[GitCommandError | null]>} err 为 null 表示成功
 */
export function gitAddCommit(root: string, message: string, paths: string[]): Promise<[GitCommandError | null]>;
/**
 * 同步读取工作区状态（git status --porcelain 的 stdout）。
 * 输出非空即存在未提交/未跟踪的脏文件；供 systemPrompt 同步 text provider
 * 调用（session-context breadcrumb 消费）；非 git 目录静默返回 err（子进程
 * stderr 忽略，不向宿主 stderr 输出报错）。
 * @param {string} root 工作目录
 * @returns {[Error | null, string | null]}
 */
export function gitStatusSync(root: string): [Error | null, string | null];
/**
 * 同步读取当前分支名（git branch --show-current 的 stdout）。
 * 非 git 目录静默返回 err（子进程 stderr 忽略，不向宿主 stderr 输出报错）；
 * 仓库存在但未检出分支时输出为空串（value 为 ''）。
 * @param {string} root 工作目录
 * @returns {[Error | null, string | null]}
 */
export function gitCurrentBranchSync(root: string): [Error | null, string | null];
/**
 * 同步列出全部 worktree（`worktree list --porcelain`，按空行分组解析）。
 * doctor 收集链的同步只读变体（gitStatusSync 同款纪律）：stderr 走管道捕获
 * （不落宿主 stderr，err.stderr 可判别「非 git 仓库」），LC_ALL=C 英文文案。
 * @param {string} root 工作目录
 * @returns {[Error | null, GitWorktreeEntry[] | null]}
 */
export function gitWorktreeListSync(root: string): [Error | null, GitWorktreeEntry[] | null];
/**
 * rev-parse 通用查询（`root` 即 cwd，`git -C` 等价）。
 * 用途：`--verify HEAD`（unborn 探测，exit 128）、`--abbrev-ref HEAD`
 * （detached 探测，输出 HEAD）、`HEAD:<path>`（gitlink sha）、`--is-inside-work-tree`。
 * @param {string} root 工作目录
 * @param {string[]} args rev-parse 参数（不含子命令）
 * @returns {Promise<[GitCommandError | null, string | null]>} stdout 为 trim 后输出；exit≠0 → err（含 code）
 */
export function gitRevParse(root: string, args: string[]): Promise<[GitCommandError | null, string | null]>;
/**
 * 祖先关系判定（`merge-base --is-ancestor a b`）：a 是 b 的祖先（含相等）→ true。
 * exit 1 是「非祖先」的业务结果，不是错误（research B9-3）。
 * @param {string} root 工作目录
 * @param {string} a 可能的祖先 ref
 * @param {string} b 后代 ref
 * @returns {Promise<[GitCommandError | null, boolean | null]>} 0→true、1→false、其余→err
 */
export function gitIsAncestor(root: string, a: string, b: string): Promise<[GitCommandError | null, boolean | null]>;
/**
 * 合并进行中判定（`rev-parse -q --verify MERGE_HEAD`）：abort 的唯一可靠判据
 * （exit 1 = 无合并中，是业务结果；无条件 abort 会 exit 128，§A7.2）。
 * @param {string} root 工作目录
 * @returns {Promise<[GitCommandError | null, boolean | null]>} 0→true、1→false、其余→err
 */
export function gitHasMergeHead(root: string): Promise<[GitCommandError | null, boolean | null]>;
/**
 * 合并分支（`merge --no-edit <branch>`，cwd = 仓主检出 root）。
 * 失败时 err.code 透出 git 退出码（1=冲突或 untracked 拒绝、2=脏拒绝、
 * 128=身份缺失等，§A7.1/A7.5）；exit code 不可靠，冲突与否以 MERGE_HEAD 判别。
 * @param {string} root 工作目录（目标仓主检出）
 * @param {string} branch 要合并的分支
 * @param {{extraArgs?: string[]}} [opts] 前置透传参数（fixture `-c k=v` 用）
 * @returns {Promise<[GitCommandError | null, string | null]>}
 */
export function gitMerge(root: string, branch: string, opts?: {
    extraArgs?: string[];
}): Promise<[GitCommandError | null, string | null]>;
/**
 * 中止进行中的合并（`merge --abort`）：调用前必须先经 gitHasMergeHead 确认
 * 存在合并中状态（无 MERGE_HEAD 时 abort exit 128，§A7.2）。
 * @param {string} root 工作目录
 * @returns {Promise<[GitCommandError | null, string | null]>}
 */
export function gitMergeAbort(root: string): Promise<[GitCommandError | null, string | null]>;
/**
 * 创建 linked worktree：base 提供 → `worktree add -b <branch> <path> <base>`
 * （新分支）；否则 `worktree add <path> <branch>`（复用已存在分支）。
 * path 必须为绝对路径（相对路径按各自仓工作目录解析，跨仓调用有歧义，§A5）。
 * 失败 err.code 透出（255=分支已存在、128=路径占用/分支被检出/前导目录不可建，§A1）；
 * `-b` 路径失败会遗留游离分支，回滚由调用方负责（§A1）。
 * @param {string} root 目标仓工作目录
 * @param {string} path worktree 绝对路径
 * @param {string} branch 分支名
 * @param {string} [base] 起点（分支不存在时必传）
 * @returns {Promise<[GitCommandError | null, string | null]>}
 */
export function gitWorktreeAdd(root: string, path: string, branch: string, base?: string): Promise<[GitCommandError | null, string | null]>;
/**
 * 删除 linked worktree（目录一并删除；不删分支）。
 * 128=脏/非 worktree/locked（locked 需 unlock 或 -f -f，本原语不带 force——
 * 破坏性强制不自动化，调用方透传 err 文案，§A2）。
 * @param {string} root 目标仓工作目录
 * @param {string} path worktree 绝对路径
 * @returns {Promise<[GitCommandError | null, string | null]>}
 */
export function gitWorktreeRemove(root: string, path: string): Promise<[GitCommandError | null, string | null]>;
/**
 * 列出全部 worktree（`worktree list --porcelain`，按空行分组解析）。
 * @param {string} root 目标仓工作目录
 * @returns {Promise<[GitCommandError | null, GitWorktreeEntry[] | null]>}
 *   每项 {path 绝对路径, head sha, branch 分支名（detached 为 null）, prunable 是否待 prune}
 */
export function gitWorktreeList(root: string): Promise<[GitCommandError | null, GitWorktreeEntry[] | null]>;
/**
 * 清理失效 worktree 元数据（`worktree prune`）：只清元数据，从不删残留目录、
 * 不删分支（§A3）——残留目录的处置由调用方 fail loud 交给人。
 * @param {string} root 目标仓工作目录
 * @returns {Promise<[GitCommandError | null, string | null]>}
 */
export function gitWorktreePrune(root: string): Promise<[GitCommandError | null, string | null]>;
/**
 * 强删分支（`branch -D`）：回滚与 merge-delete-branch 清理用。
 * 分支被任一 worktree 检出时 exit 1（与 worktree remove 互锁，顺序必须先
 * remove 再删分支，§A2）。
 * @param {string} root 目标仓工作目录
 * @param {string} branch 分支名
 * @returns {Promise<[GitCommandError | null, string | null]>}
 */
export function gitBranchDelete(root: string, branch: string): Promise<[GitCommandError | null, string | null]>;
/**
 * 分支是否存在（`show-ref --verify --quiet refs/heads/<branch>`）。
 * @param {string} root 目标仓工作目录
 * @param {string} branch 分支名
 * @returns {Promise<[GitCommandError | null, boolean | null]>} 0→true、1→false、其余→err
 */
export function gitBranchExists(root: string, branch: string): Promise<[GitCommandError | null, boolean | null]>;
/**
 * 校验分支名（`check-ref-format --branch <name>`）：cwd 无关（不依赖仓状态，
 * root 仅作执行目录），非法名 err 透出（exit 128 + stderr 文案）。
 * @param {string} root 执行目录（传项目根即可）
 * @param {string} name 分支名（渲染结果）
 * @returns {Promise<[GitCommandError | null, boolean | null]>} 0→true、非法→err
 */
export function gitCheckRefFormat(root: string, name: string): Promise<[GitCommandError | null, boolean | null]>;
/**
 * git config 查询（design §3.1 的 submodule 注册检测：
 * `config -f .gitmodules --get-regexp '\.path$'`）。exit 1 = 无匹配/文件缺失，
 * 是业务结果（返回空串而非 err，§A5）。内部供 worktree.js 使用，不经 index.ts 公开。
 * @param {string} root 工作目录
 * @param {string[]} args config 参数（不含子命令）
 * @returns {Promise<[GitCommandError | null, string | null]>} stdout 为 trim 后输出
 */
export function gitConfig(root: string, args: string[]): Promise<[GitCommandError | null, string | null]>;
/**
 * linked worktree 注册项（`worktree list --porcelain` 解析结果）。
 */
export type GitWorktreeEntry = {
    /**
     * worktree 绝对路径
     */
    path: string;
    /**
     * HEAD sha
     */
    head: string;
    /**
     * 分支名（detached HEAD 为 null）
     */
    branch: string | null;
    /**
     * 是否待 prune（gitdir 指向已消失路径）
     */
    prunable: boolean;
};
/**
 * git 命令失败错误（Node ExecFileException 归一）：`code` 为数字 git 退出码
 * （或 spawn 失败的错误码字符串），`stderr` 携带 git 原始文案——新增原语的
 * 调用方按此判别业务结果与失败原因。
 */
export type GitCommandError = Error & {
    code?: number | string | null;
    stderr?: string | Buffer;
};
