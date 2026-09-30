/**
 * git 最小封装（行为移植模块，纯 JS + JSDoc）。
 *
 * 设计意图：
 * - 提供归档/journal 自动提交所需的 add+commit 原语（暂存范围由调用方
 *   枚举路径收窄，绝不整目录暂存），以及工作区脏文件检查（gitStatusSync，
 *   session-context 的 breadcrumb 消费）；
 * - 工作区/分支查询只保留同步变体（gitStatusSync/gitCurrentBranchSync），
 *   供 systemPrompt 的同步 text provider 直接调用，输出经 trim；
 *   在非 git 目录静默失败（子进程 stderr 忽略，不向宿主 stderr 输出报错）；
 * - 每一步失败都显式返回 err，由调用方决定是否阻塞；
 * - 使用 execFile（无 shell 解释），避免命令注入。
 *
 * 返回约定（S1 扩展）：既有 4 原语（gitAddCommit/gitStatusSync/
 * gitCurrentBranchSync/countDirtyLines）返回形状不变（兼容面）；新增原语统一
 * async，失败 err 沿用 Node ExecFileException 的结构化字段——`err.code`
 * （数字 = git 退出码；字符串如 'ENOENT' = spawn 失败）与 `err.stderr`
 * （git 的 stderr 文案），调用方按此判别业务结果（如 merge-base --is-ancestor
 * 的 exit 1 是「非祖先」而非错误、MERGE_HEAD 缺失 exit 1 是「无合并中」）。
 */

import { execFile, execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

/**
 * linked worktree 注册项（`worktree list --porcelain` 解析结果）。
 * @typedef {object} GitWorktreeEntry
 * @property {string} path worktree 绝对路径
 * @property {string} head HEAD sha
 * @property {string | null} branch 分支名（detached HEAD 为 null）
 * @property {boolean} prunable 是否待 prune（gitdir 指向已消失路径）
 */

/**
 * git 命令失败错误（Node ExecFileException 归一）：`code` 为数字 git 退出码
 * （或 spawn 失败的错误码字符串），`stderr` 携带 git 原始文案——新增原语的
 * 调用方按此判别业务结果与失败原因。
 * @typedef {Error & {code?: number | string | null, stderr?: string | Buffer}} GitCommandError
 */

/** git 可执行文件名。 */
const GIT_BIN = 'git'

/**
 * git 子进程环境：LC_ALL=C 使 git 输出（含错误文案）恒为英文——透传给调用方的
 * stderr 按英文原文假定（research §A0），运行时文案不随宿主 locale 变化。
 * @type {NodeJS.ProcessEnv}
 */
const GIT_ENV = { ...process.env, LC_ALL: 'C', LANG: 'C' }

/** status 固定参数：porcelain 格式，无未跟踪/未提交项时输出为空。 */
const GIT_STATUS_ARGS = ['status', '--porcelain']

/** branch 固定参数：输出当前分支名（未检出分支时输出为空串）。 */
const GIT_BRANCH_ARGS = ['branch', '--show-current']

/**
 * 同步查询的 stdio 配置：stdout 仍 pipe 取输出；stdin/stderr ignore，
 * 默认 stdio 下 execFileSync 失败会把子进程 stderr 打到宿主 stderr，
 * 置 ignore 后 git 报错（如「不是 git 仓库」）完全静默。
 * @type {import('node:child_process').StdioOptions}
 */
const GIT_SYNC_STDIO = ['ignore', 'pipe', 'ignore']

/**
 * 统计 --porcelain 输出中的脏行数（空输出为 0）；session-context 与 adapter 共用。
 * @param {string} status porcelain 输出
 * @returns {number} 脏文件行数
 */
export function countDirtyLines(status) {
  return status.split('\n').filter((line) => line.trim() !== '').length
}

/**
 * 暂存调用方枚举的路径并提交（cwd 为 root）。
 * 收窄暂存范围：paths 为相对项目根的路径列表，只提交本次操作相关路径，
 * 其他在途任务的脏文件零接触；paths 为空直接报错（fail loud，防误提交空集）。
 * @param {string} root 项目根目录
 * @param {string} message 提交信息
 * @param {string[]} paths 相对项目根的待暂存路径列表
 * @returns {Promise<[GitCommandError | null]>} err 为 null 表示成功
 */
export async function gitAddCommit(root, message, paths) {
  if (!Array.isArray(paths) || paths.length === 0) {
    return [new Error('git add requires at least one path')]
  }
  const stageable = await resolveStageablePaths(root, paths)
  if (stageable.length === 0) {
    return [new Error('git add: none of the given paths exists on disk or in the index')]
  }
  const [addErr] = await runGit(root, ['add', '--', ...stageable])
  if (addErr) return [addErr]
  const [commitErr] = await runGit(root, ['commit', '-m', message])
  if (commitErr) return [commitErr]
  return [null]
}

/**
 * 过滤可暂存路径（内部）：`git add` 的每个 pathspec 必须命中磁盘或索引，否则
 * 整条命令以「未匹配任何文件」失败——归档移动后的旧路径若从未被提交过即属此列，
 * 对提交零贡献。剔除规则：磁盘存在（新增/修改）或索引命中（记录删除）才保留；
 * 索引探测本身失败（非 git 仓库等）不在此吞错，原样交由后续 add 报错。
 * @param {string} root 项目根
 * @param {string[]} paths 相对项目根的路径列表
 * @returns {Promise<string[]>} 可暂存子集（保持入参顺序）
 */
async function resolveStageablePaths(root, paths) {
  const missing = paths.filter((path) => !existsSync(join(root, path)))
  if (missing.length === 0) return paths
  const [err, stdout] = await runGit(root, ['ls-files', '--', ...missing])
  if (err !== null || stdout === null) return paths
  // ls-files 输出索引内的文件路径：目录路径按「同名或位于其下」匹配。
  const tracked = stdout.split('\n').filter((line) => line !== '')
  return paths.filter(
    (path) =>
      existsSync(join(root, path)) ||
      tracked.some((line) => line === path || line.startsWith(`${path}/`)),
  )
}

/**
 * 同步读取工作区状态（git status --porcelain 的 stdout）。
 * 输出非空即存在未提交/未跟踪的脏文件；供 systemPrompt 同步 text provider
 * 调用（session-context breadcrumb 消费）；非 git 目录静默返回 err（子进程
 * stderr 忽略，不向宿主 stderr 输出报错）。
 * @param {string} root 工作目录
 * @returns {[Error | null, string | null]}
 */
export function gitStatusSync(root) {
  try {
    return [
      null,
      execFileSync(GIT_BIN, GIT_STATUS_ARGS, { cwd: root, encoding: 'utf8', stdio: GIT_SYNC_STDIO }).trim(),
    ]
  } catch (error) {
    return [toError(error), null]
  }
}

/**
 * 同步读取当前分支名（git branch --show-current 的 stdout）。
 * 非 git 目录静默返回 err（子进程 stderr 忽略，不向宿主 stderr 输出报错）；
 * 仓库存在但未检出分支时输出为空串（value 为 ''）。
 * @param {string} root 工作目录
 * @returns {[Error | null, string | null]}
 */
export function gitCurrentBranchSync(root) {
  try {
    return [
      null,
      execFileSync(GIT_BIN, GIT_BRANCH_ARGS, { cwd: root, encoding: 'utf8', stdio: GIT_SYNC_STDIO }).trim(),
    ]
  } catch (error) {
    return [toError(error), null]
  }
}

/**
 * 同步列出全部 worktree（`worktree list --porcelain`，按空行分组解析）。
 * doctor 收集链的同步只读变体（gitStatusSync 同款纪律）：stderr 走管道捕获
 * （不落宿主 stderr，err.stderr 可判别「非 git 仓库」），LC_ALL=C 英文文案。
 * @param {string} root 工作目录
 * @returns {[Error | null, GitWorktreeEntry[] | null]}
 */
export function gitWorktreeListSync(root) {
  try {
    const stdout = execFileSync(GIT_BIN, ['worktree', 'list', '--porcelain'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: GIT_ENV,
    })
    return [null, parseWorktreePorcelain(stdout)]
  } catch (error) {
    return [toError(error), null]
  }
}

/**
 * 执行一次 git 命令（内部）：失败返回 [err, null]，成功返回 [null, stdout]。
 * 子进程固定 `LC_ALL=C`：透传给调用方的 git 文案恒为英文（运行时文案英文纪律，
 * research §A0「错误透传应假定英文」），不受宿主 locale 影响。
 * @param {string} root 工作目录
 * @param {string[]} args 命令参数
 * @returns {Promise<[GitCommandError | null, string | null]>}
 */
function runGit(root, args) {
  return new Promise((resolve) => {
    execFile(GIT_BIN, args, { cwd: root, env: GIT_ENV }, (error, stdout) => {
      if (error) {
        resolve([error, null])
        return
      }
      resolve([null, stdout])
    })
  })
}

/** @param {unknown} value @returns {Error} */
function toError(value) {
  return value instanceof Error ? value : new Error(String(value))
}

// ---------- S1 新增原语（统一 async；err.code/err.stderr 消费约定见文件头） ----------

/**
 * rev-parse 通用查询（`root` 即 cwd，`git -C` 等价）。
 * 用途：`--verify HEAD`（unborn 探测，exit 128）、`--abbrev-ref HEAD`
 * （detached 探测，输出 HEAD）、`HEAD:<path>`（gitlink sha）、`--is-inside-work-tree`。
 * @param {string} root 工作目录
 * @param {string[]} args rev-parse 参数（不含子命令）
 * @returns {Promise<[GitCommandError | null, string | null]>} stdout 为 trim 后输出；exit≠0 → err（含 code）
 */
export async function gitRevParse(root, args) {
  const [err, stdout] = await runGit(root, ['rev-parse', ...args])
  if (err !== null) return [err, null]
  return [null, (stdout ?? '').trim()]
}

/**
 * 祖先关系判定（`merge-base --is-ancestor a b`）：a 是 b 的祖先（含相等）→ true。
 * exit 1 是「非祖先」的业务结果，不是错误（research B9-3）。
 * @param {string} root 工作目录
 * @param {string} a 可能的祖先 ref
 * @param {string} b 后代 ref
 * @returns {Promise<[GitCommandError | null, boolean | null]>} 0→true、1→false、其余→err
 */
export async function gitIsAncestor(root, a, b) {
  const [err] = await runGit(root, ['merge-base', '--is-ancestor', a, b])
  if (err === null) return [null, true]
  if (err.code === 1) return [null, false]
  return [err, null]
}

/**
 * 合并进行中判定（`rev-parse -q --verify MERGE_HEAD`）：abort 的唯一可靠判据
 * （exit 1 = 无合并中，是业务结果；无条件 abort 会 exit 128，§A7.2）。
 * @param {string} root 工作目录
 * @returns {Promise<[GitCommandError | null, boolean | null]>} 0→true、1→false、其余→err
 */
export async function gitHasMergeHead(root) {
  const [err] = await runGit(root, ['rev-parse', '-q', '--verify', 'MERGE_HEAD'])
  if (err === null) return [null, true]
  if (err.code === 1) return [null, false]
  return [err, null]
}

/**
 * 合并分支（`merge --no-edit <branch>`，cwd = 仓主检出 root）。
 * 失败时 err.code 透出 git 退出码（1=冲突或 untracked 拒绝、2=脏拒绝、
 * 128=身份缺失等，§A7.1/A7.5）；exit code 不可靠，冲突与否以 MERGE_HEAD 判别。
 * @param {string} root 工作目录（目标仓主检出）
 * @param {string} branch 要合并的分支
 * @param {{extraArgs?: string[]}} [opts] 前置透传参数（fixture `-c k=v` 用）
 * @returns {Promise<[GitCommandError | null, string | null]>}
 */
export async function gitMerge(root, branch, opts = {}) {
  const extraArgs = Array.isArray(opts.extraArgs) ? opts.extraArgs : []
  const [err, stdout] = await runGit(root, [...extraArgs, 'merge', '--no-edit', branch])
  if (err !== null) return [err, null]
  return [null, stdout]
}

/**
 * 中止进行中的合并（`merge --abort`）：调用前必须先经 gitHasMergeHead 确认
 * 存在合并中状态（无 MERGE_HEAD 时 abort exit 128，§A7.2）。
 * @param {string} root 工作目录
 * @returns {Promise<[GitCommandError | null, string | null]>}
 */
export async function gitMergeAbort(root) {
  const [err, stdout] = await runGit(root, ['merge', '--abort'])
  if (err !== null) return [err, null]
  return [null, stdout]
}

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
export async function gitWorktreeAdd(root, path, branch, base) {
  const args =
    base === undefined
      ? ['worktree', 'add', path, branch]
      : ['worktree', 'add', '-b', branch, path, base]
  const [err, stdout] = await runGit(root, args)
  if (err !== null) return [err, null]
  return [null, stdout]
}

/**
 * 删除 linked worktree（目录一并删除；不删分支）。
 * 128=脏/非 worktree/locked（locked 需 unlock 或 -f -f，本原语不带 force——
 * 破坏性强制不自动化，调用方透传 err 文案，§A2）。
 * @param {string} root 目标仓工作目录
 * @param {string} path worktree 绝对路径
 * @returns {Promise<[GitCommandError | null, string | null]>}
 */
export async function gitWorktreeRemove(root, path) {
  const [err, stdout] = await runGit(root, ['worktree', 'remove', path])
  if (err !== null) return [err, null]
  return [null, stdout]
}

/**
 * 列出全部 worktree（`worktree list --porcelain`，按空行分组解析）。
 * @param {string} root 目标仓工作目录
 * @returns {Promise<[GitCommandError | null, GitWorktreeEntry[] | null]>}
 *   每项 {path 绝对路径, head sha, branch 分支名（detached 为 null）, prunable 是否待 prune}
 */
export async function gitWorktreeList(root) {
  const [err, stdout] = await runGit(root, ['worktree', 'list', '--porcelain'])
  if (err !== null) return [err, null]
  return [null, parseWorktreePorcelain(stdout ?? '')]
}

/**
 * 解析 porcelain 输出（内部）：`worktree <abs>` / `HEAD <sha>` /
 * `branch refs/heads/<name>` / `prunable <reason>` 四类行，空行分组（§A9-9）。
 * @param {string} stdout porcelain 输出
 * @returns {GitWorktreeEntry[]}
 */
function parseWorktreePorcelain(stdout) {
  /** @type {GitWorktreeEntry[]} */
  const entries = []
  /** @type {GitWorktreeEntry | null} */
  let current = null
  for (const line of stdout.split('\n')) {
    if (line.trim() === '') {
      if (current !== null) entries.push(current)
      current = null
      continue
    }
    if (line.startsWith('worktree ')) {
      if (current !== null) entries.push(current)
      current = { path: line.slice('worktree '.length), head: '', branch: null, prunable: false }
      continue
    }
    if (current === null) continue
    if (line.startsWith('HEAD ')) {
      current.head = line.slice('HEAD '.length)
    } else if (line.startsWith('branch ')) {
      current.branch = line.slice('branch '.length).replace(/^refs\/heads\//, '')
    } else if (line.startsWith('prunable')) {
      current.prunable = true
    }
  }
  if (current !== null) entries.push(current)
  return entries
}

/**
 * 清理失效 worktree 元数据（`worktree prune`）：只清元数据，从不删残留目录、
 * 不删分支（§A3）——残留目录的处置由调用方 fail loud 交给人。
 * @param {string} root 目标仓工作目录
 * @returns {Promise<[GitCommandError | null, string | null]>}
 */
export async function gitWorktreePrune(root) {
  const [err, stdout] = await runGit(root, ['worktree', 'prune'])
  if (err !== null) return [err, null]
  return [null, stdout]
}

/**
 * 强删分支（`branch -D`）：回滚与 merge-delete-branch 清理用。
 * 分支被任一 worktree 检出时 exit 1（与 worktree remove 互锁，顺序必须先
 * remove 再删分支，§A2）。
 * @param {string} root 目标仓工作目录
 * @param {string} branch 分支名
 * @returns {Promise<[GitCommandError | null, string | null]>}
 */
export async function gitBranchDelete(root, branch) {
  const [err, stdout] = await runGit(root, ['branch', '-D', branch])
  if (err !== null) return [err, null]
  return [null, stdout]
}

/**
 * 分支是否存在（`show-ref --verify --quiet refs/heads/<branch>`）。
 * @param {string} root 目标仓工作目录
 * @param {string} branch 分支名
 * @returns {Promise<[GitCommandError | null, boolean | null]>} 0→true、1→false、其余→err
 */
export async function gitBranchExists(root, branch) {
  const [err] = await runGit(root, ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`])
  if (err === null) return [null, true]
  if (err.code === 1) return [null, false]
  return [err, null]
}

/**
 * 校验分支名（`check-ref-format --branch <name>`）：cwd 无关（不依赖仓状态，
 * root 仅作执行目录），非法名 err 透出（exit 128 + stderr 文案）。
 * @param {string} root 执行目录（传项目根即可）
 * @param {string} name 分支名（渲染结果）
 * @returns {Promise<[GitCommandError | null, boolean | null]>} 0→true、非法→err
 */
export async function gitCheckRefFormat(root, name) {
  const [err] = await runGit(root, ['check-ref-format', '--branch', name])
  if (err === null) return [null, true]
  return [err, null]
}

/**
 * git config 查询（design §3.1 的 submodule 注册检测：
 * `config -f .gitmodules --get-regexp '\.path$'`）。exit 1 = 无匹配/文件缺失，
 * 是业务结果（返回空串而非 err，§A5）。内部供 worktree.js 使用，不经 index.ts 公开。
 * @param {string} root 工作目录
 * @param {string[]} args config 参数（不含子命令）
 * @returns {Promise<[GitCommandError | null, string | null]>} stdout 为 trim 后输出
 */
export async function gitConfig(root, args) {
  const [err, stdout] = await runGit(root, ['config', ...args])
  if (err === null) return [null, (stdout ?? '').trim()]
  if (err.code === 1) return [null, '']
  return [err, null]
}
