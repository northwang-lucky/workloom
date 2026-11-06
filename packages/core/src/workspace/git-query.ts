/**
 * git 查询面（只读原语，TypeScript）：状态/分支/变更文件/worktree 清单/ref 与
 * config 查询。
 *
 * 设计意图：
 * - 查询面与集成操作面（git-ops）拆分：本模块只读，git-ops 承载 add/commit、
 *   merge/rebase、worktree 增删等集成操作；
 * - 同步查询变体（gitStatusSync/gitCurrentBranchSync）供 systemPrompt 的同步
 *   text provider 直接调用，输出经 trim；非 git 目录静默失败（stderr 忽略）；
 * - 每步失败显式返回 err；execFile（无 shell 解释）避免命令注入；
 * - 新原语统一 async，失败 err 沿用 Node ExecFileException 的结构化字段——
 *   `err.code`（数字 = git 退出码；字符串如 'ENOENT' = spawn 失败）与
 *   `err.stderr`（git 的 stderr 文案），调用方按此判别业务结果（merge-base
 *   --is-ancestor 的 exit 1 是「非祖先」而非错误）。
 */

import { execFile, execFileSync } from 'node:child_process'

/** git 可执行文件名（两 Git 模块共用）。 */
export const GIT_BIN = 'git'

/**
 * git 子进程环境：LC_ALL=C 使 git 输出（含错误文案）恒为英文——透传给调用方的
 * stderr 按英文原文假定，运行时文案不随宿主 locale 变化。
 */
export const GIT_ENV: NodeJS.ProcessEnv = { ...process.env, LC_ALL: 'C', LANG: 'C' }

/** status 固定参数：porcelain 格式，无未跟踪/未提交项时输出为空。 */
const GIT_STATUS_ARGS = ['status', '--porcelain']

/** branch 固定参数：输出当前分支名（未检出分支时输出为空串）。 */
const GIT_BRANCH_ARGS = ['branch', '--show-current']

/** diff 固定参数：相对 HEAD 的变更文件名（--diff-filter=d 排除删除项）。 */
const GIT_DIFF_CHANGED_ARGS = Object.freeze([
  'diff',
  '--name-only',
  '--no-renames',
  '--diff-filter=d',
  'HEAD',
  '--',
])

/** ls-files 固定参数：未跟踪文件（不读 .gitignore 排除规则之外的文件）。 */
const GIT_UNTRACKED_ARGS = Object.freeze(['ls-files', '--others', '--exclude-standard'])

/**
 * 同步查询的 stdio 配置：stdout 仍 pipe 取输出；stdin/stderr ignore，
 * 默认 stdio 下 execFileSync 失败会把子进程 stderr 打到宿主 stderr，
 * 置 ignore 后 git 报错（如「不是 git 仓库」）完全静默。
 */
const GIT_SYNC_STDIO: import('node:child_process').StdioOptions = ['ignore', 'pipe', 'ignore']

/** linked worktree 注册项（`worktree list --porcelain` 解析结果）。 */
export interface GitWorktreeEntry {
  /** worktree 绝对路径。 */
  path: string
  /** HEAD sha。 */
  head: string
  /** 分支名（detached HEAD 为 null）。 */
  branch: string | null
  /** 是否待 prune（gitdir 指向已消失路径）。 */
  prunable: boolean
}

/**
 * git 命令失败错误（Node ExecFileException 归一）：`code` 为数字 git 退出码
 * （或 spawn 失败的错误码字符串），`stderr` 携带 git 原始文案——调用方按此
 * 判别业务结果与失败原因。
 */
export type GitCommandError = Error & { code?: number | string | null; stderr?: string | Buffer }

/**
 * 统计 --porcelain 输出中的脏行数（空输出为 0）；session-context 与 adapter 共用。
 */
export function countDirtyLines(status: string): number {
  return status.split('\n').filter((line) => line.trim() !== '').length
}

/**
 * 同步读取工作区状态（git status --porcelain 的 stdout）。
 * 输出非空即存在未提交/未跟踪的脏文件；非 git 目录静默返回 err。
 */
export function gitStatusSync(root: string): [Error | null, string | null] {
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
 * 同步列出工作区相对 HEAD 的变更文件（排除删除）与未跟踪文件。
 * CASE 文件范围计算用（实施任务的实际变更事实源）；非 git 目录静默返回 err。
 * @returns 排序去重后的 repo 相对路径
 */
export function gitChangedFilesSync(root: string): [Error | null, string[] | null] {
  try {
    const changed = execFileSync(GIT_BIN, [...GIT_DIFF_CHANGED_ARGS], {
      cwd: root,
      encoding: 'utf8',
      stdio: GIT_SYNC_STDIO,
    }).trim()
    const untracked = execFileSync(GIT_BIN, [...GIT_UNTRACKED_ARGS], {
      cwd: root,
      encoding: 'utf8',
      stdio: GIT_SYNC_STDIO,
    }).trim()
    const files = [...changed.split('\n'), ...untracked.split('\n')].filter((file) => file !== '')
    return [null, [...new Set(files)].sort()]
  } catch (error) {
    return [toError(error), null]
  }
}

/**
 * 同步读取当前分支名（git branch --show-current 的 stdout）。
 * 非 git 目录静默返回 err；仓库存在但未检出分支时输出为空串（value 为 ''）。
 */
export function gitCurrentBranchSync(root: string): [Error | null, string | null] {
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
 * doctor 收集链的同步只读变体（gitStatusSync 同款纪律）：stderr 走管道捕获。
 */
export function gitWorktreeListSync(root: string): [Error | null, GitWorktreeEntry[] | null] {
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
 * 执行一次 git 命令（查询面内部，git-ops 共用）：失败返回 [err, null]，
 * 成功返回 [null, stdout]。子进程固定 `LC_ALL=C`（文案恒为英文）。
 */
export function runGit(root: string, args: string[]): Promise<[GitCommandError | null, string | null]> {
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

/** 把任意异常归一为 Error（内部）。 */
function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value))
}

/**
 * rev-parse 通用查询（`root` 即 cwd，`git -C` 等价）。
 * 用途：`--verify HEAD`（unborn 探测，exit 128）、`--abbrev-ref HEAD`
 * （detached 探测，输出 HEAD）、`HEAD:<path>`（gitlink sha）、`--is-inside-work-tree`。
 * @returns stdout 为 trim 后输出；exit≠0 → err（含 code）
 */
export async function gitRevParse(
  root: string,
  args: readonly string[],
): Promise<[GitCommandError | null, string | null]> {
  const [err, stdout] = await runGit(root, ['rev-parse', ...args])
  if (err !== null) return [err, null]
  return [null, (stdout ?? '').trim()]
}

/**
 * 祖先关系判定（`merge-base --is-ancestor a b`）：a 是 b 的祖先（含相等）→ true。
 * exit 1 是「非祖先」的业务结果，不是错误。
 * @returns 0→true、1→false、其余→err
 */
export async function gitIsAncestor(
  root: string,
  a: string,
  b: string,
): Promise<[GitCommandError | null, boolean | null]> {
  const [err] = await runGit(root, ['merge-base', '--is-ancestor', a, b])
  if (err === null) return [null, true]
  if (err.code === 1) return [null, false]
  return [err, null]
}

/**
 * 合并进行中判定（`rev-parse -q --verify MERGE_HEAD`）：abort 的唯一可靠判据
 * （exit 1 = 无合并中，是业务结果；无条件 abort 会 exit 128）。
 * @returns 0→true、1→false、其余→err
 */
export async function gitHasMergeHead(root: string): Promise<[GitCommandError | null, boolean | null]> {
  const [err] = await runGit(root, ['rev-parse', '-q', '--verify', 'MERGE_HEAD'])
  if (err === null) return [null, true]
  if (err.code === 1) return [null, false]
  return [err, null]
}

/**
 * rebase 中断态判定（`rev-parse -q --verify REBASE_HEAD`）：abort 的唯一可靠判据
 * （exit 1 = 无中断，是业务结果）。REBASE_HEAD 在 linked worktree 内按 worktree
 * 隔离生效（主检出不受任务 worktree 中断态牵连）。
 * @returns 0→true、1→false、其余→err
 */
export async function gitHasRebaseHead(root: string): Promise<[GitCommandError | null, boolean | null]> {
  const [err] = await runGit(root, ['rev-parse', '-q', '--verify', 'REBASE_HEAD'])
  if (err === null) return [null, true]
  if (err.code === 1) return [null, false]
  return [err, null]
}

/**
 * 列出全部 worktree（`worktree list --porcelain`，按空行分组解析）。
 * @returns 每项 {path 绝对路径, head sha, branch 分支名（detached 为 null）, prunable 是否待 prune}
 */
export async function gitWorktreeList(root: string): Promise<[GitCommandError | null, GitWorktreeEntry[] | null]> {
  const [err, stdout] = await runGit(root, ['worktree', 'list', '--porcelain'])
  if (err !== null) return [err, null]
  return [null, parseWorktreePorcelain(stdout ?? '')]
}

/**
 * 解析 porcelain 输出（内部）：`worktree <abs>` / `HEAD <sha>` /
 * `branch refs/heads/<name>` / `prunable <reason>` 四类行，空行分组。
 */
function parseWorktreePorcelain(stdout: string): GitWorktreeEntry[] {
  const entries: GitWorktreeEntry[] = []
  let current: GitWorktreeEntry | null = null
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
 * 分支是否存在（`show-ref --verify --quiet refs/heads/<branch>`）。
 * @returns 0→true、1→false、其余→err
 */
export async function gitBranchExists(
  root: string,
  branch: string,
): Promise<[GitCommandError | null, boolean | null]> {
  const [err] = await runGit(root, ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`])
  if (err === null) return [null, true]
  if (err.code === 1) return [null, false]
  return [err, null]
}

/**
 * 校验分支名（`check-ref-format --branch <name>`）：cwd 无关（不依赖仓状态，
 * root 仅作执行目录），非法名 err 透出（exit 128 + stderr 文案）。
 * @returns 0→true、非法→err
 */
export async function gitCheckRefFormat(
  root: string,
  name: string,
): Promise<[GitCommandError | null, boolean | null]> {
  const [err] = await runGit(root, ['check-ref-format', '--branch', name])
  if (err === null) return [null, true]
  return [err, null]
}

/**
 * git config 查询（submodule 注册检测：`config -f .gitmodules --get-regexp '\.path$'`）。
 * exit 1 = 无匹配/文件缺失，是业务结果（返回空串而非 err）。
 * @returns stdout 为 trim 后输出
 */
export async function gitConfig(
  root: string,
  args: readonly string[],
): Promise<[GitCommandError | null, string | null]> {
  const [err, stdout] = await runGit(root, ['config', ...args])
  if (err === null) return [null, (stdout ?? '').trim()]
  if (err.code === 1) return [null, '']
  return [err, null]
}
