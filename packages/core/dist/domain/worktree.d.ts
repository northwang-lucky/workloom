/**
 * 解析任务 package 所属仓（design §3.1）。
 * - `config.packages[pkg]` 必须存在（调用方已校验，防御性再查，未知值 fail loud）；
 * - `entry.git === true` → 子仓：先校验候选目录确为 git 仓（配置标注与磁盘
 *   不符即 err），再以超级仓根 `.gitmodules` 注册表判定是否 submodule
 *   （`git config -f .gitmodules --get-regexp '\.path$'`，§A5；`submodule status`
 *   无输出不可用作判定）；
 * - 其余（含 `git` 缺省/false）→ 项目根仓，须 `--is-inside-work-tree` 校验
 *   （非 git → err，PRD 7b，附 `worktree.enabled=false` 退出指引）。
 * @param {string} root 项目根
 * @param {import('./config.d.ts').WorkloomConfig} config 项目配置
 * @param {string} pkg package 名（task.package）
 * @returns {Promise<[Error | null, import('./worktree.d.ts').TaskRepoResolution | null]>}
 */
export function resolveTaskRepo(root: string, config: import("./config.d.ts").WorkloomConfig, pkg: string): Promise<[Error | null, import("./worktree.d.ts").TaskRepoResolution | null]>;
/**
 * 渲染分支名并校验（design §3.2）：占位符白名单替换（`<task-id>` /
 * `<task-slug>` / `<date>`，加载期已在 config 校验模板本身）后过
 * `git check-ref-format --branch`；非法 → err（文案含渲染结果与模板）。
 * @param {string} template 分支名模板（config.worktree.branchTemplate）
 * @param {import('./worktree.d.ts').BranchNameContext} ctx 渲染上下文
 * @param {string} [root] check-ref-format 执行目录（命令本身 cwd 无关）
 * @returns {Promise<[Error | null, string | null]>}
 */
export function renderBranchName(template: string, ctx: import("./worktree.d.ts").BranchNameContext, root?: string): Promise<[Error | null, string | null]>;
/**
 * start 侧创建任务 worktree（design §3.3）：任一失败返回 err，调用方在 status
 * 写盘前中止（零部分状态）；成功结果的 worktreePath 为项目根相对路径（S1-Q1）。
 * @param {string} root 项目根
 * @param {import('./task-store.d.ts').TaskRecord} task 任务记录（package/parent/createdAt/name）
 * @param {string} taskRelPath 任务目录相对 .workloom 的路径
 * @param {import('./config.d.ts').WorkloomConfig} config 项目配置
 * @returns {Promise<[Error | null, import('./worktree.d.ts').CreateTaskWorktreeResult | null]>}
 */
export function createTaskWorktree(root: string, task: import("./task-store.d.ts").TaskRecord, taskRelPath: string, config: import("./config.d.ts").WorkloomConfig): Promise<[Error | null, import("./worktree.d.ts").CreateTaskWorktreeResult | null]>;
/**
 * archive 侧清理任务 worktree（design §3.4）：失败即阻断归档（调用方不落档）；
 * 结果并入 archive 回执（merged/gitlinkCommitted/worktreeRemoved/branchDeleted/skipped）。
 * 中段失败容忍（R5-Q2）：本函数成功后的 rename 失败接受为中间态，重跑时
 * 已 merged 跳过合并、gitlink 无 diff 跳过提交、无注册跳过 remove（幂等续做）。
 * @param {string} root 项目根
 * @param {import('./task-store.d.ts').TaskRecord} task 任务记录
 * @param {import('./config.d.ts').WorkloomConfig} config 项目配置
 * @returns {Promise<[Error | null, import('./worktree.d.ts').CleanupTaskWorktreeResult | null]>}
 */
export function cleanupTaskWorktree(root: string, task: import("./task-store.d.ts").TaskRecord, config: import("./config.d.ts").WorkloomConfig): Promise<[Error | null, import("./worktree.d.ts").CleanupTaskWorktreeResult | null]>;
/**
 * worktree 目录与 git 注册一致性探测（doctor 只读消费，design §7/§1）：
 * 扫描 `.workloom/worktree/` 两层布局（`<task-id>/` 与 `<task-id>/<pkg>/`），
 * 与根仓及配置声明 git 子仓的 `git worktree list --porcelain` 注册集比对。
 * 同步（doctor 收集链同步）；非 git 项目返回空结果（worktree 生命周期不可用，
 * 由 config/start 检查负责）。只读：不 prune、不删除任何路径。
 * @param {string} root 项目根
 * @param {import('./config.d.ts').WorkloomConfig} config 项目配置（声明 git 子仓）
 * @returns {[Error | null, {unregistered: string[], missing: string[]} | null]}
 *   unregistered = 目录在但未注册（项目根相对路径）；
 *   missing = 注册在但目录失或 prunable（项目根相对路径）
 */
export function scanWorktreeConsistencySync(root: string, config: import("./config.d.ts").WorkloomConfig): [Error | null, {
    unregistered: string[];
    missing: string[];
} | null];
