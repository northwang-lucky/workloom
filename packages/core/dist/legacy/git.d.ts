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
 * @returns {Promise<[Error | null]>} err 为 null 表示成功
 */
export function gitAddCommit(root: string, message: string, paths: string[]): Promise<[Error | null]>;
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
