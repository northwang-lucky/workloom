/**
 * worktree 生命周期编排模块的类型面（domain 纯 JS + JSDoc 模块的声明补充）。
 * 与 worktree.js 的 JSDoc 保持同步；service 层（task-ops / doctor）经此引用类型。
 */
import type { WorkloomConfig } from './config.d.ts'
import type { TaskRecord } from './task-store.d.ts'

/** 任务所属仓解析结果（resolveTaskRepo 返回值）。 */
export interface TaskRepoResolution {
  /** 仓工作根：root 形态 = 项目根；sub/submodule 形态 = package 目录绝对路径。 */
  repoRoot: string
  /** 仓形态：项目根仓 / `git: true` 子仓 / `.gitmodules` 注册 submodule。 */
  kind: 'root' | 'sub' | 'submodule'
  /** package 相对项目根路径（sub / submodule 形态携带；gitlink 路径同源）。 */
  subPath?: string
}

/** 分支名渲染上下文（renderBranchName 入参）。 */
export interface BranchNameContext {
  /** 任务目录名（`<task-id>` = basename(taskRelPath)，如 09-30-s1-…）。 */
  taskId: string
  /** 任务 slug（`<task-slug>` = task.name）。 */
  taskSlug: string
  /** 任务创建日（`<date>` = task.createdAt 的 UTC 日期 YYYYMMDD）。 */
  dateYYYYMMDD: string
}

/** createTaskWorktree 成功结果（worktreePath 为项目根相对路径，S1-Q1）。 */
export interface CreateTaskWorktreeResult {
  /** 任务分支名（渲染并通过 check-ref-format 校验）。 */
  branch: string
  /** 基准分支（base）。 */
  baseBranch: string
  /** worktree 项目根相对路径（`.workloom/worktree/<task-id>[/<package>]`）。 */
  worktreePath: string
}

/** cleanupTaskWorktree 成功结果（archive 回执展示用）。 */
export interface CleanupTaskWorktreeResult {
  /** 本次是否执行了向 base 的合并。 */
  merged: boolean
  /** 本次是否提交了 submodule gitlink 更新。 */
  gitlinkCommitted: boolean
  /** 本次是否删除了 worktree。 */
  worktreeRemoved: boolean
  /** 本次是否删除了任务分支（merge-delete-branch）。 */
  branchDeleted: boolean
  /** 提前跳过原因（no-worktree / manual；未跳过时不出现）。 */
  skipped?: 'no-worktree' | 'manual'
}

/** 解析任务 package 所属仓（git 仓校验 + submodule 注册判定）。 */
export function resolveTaskRepo(
  root: string,
  config: WorkloomConfig,
  pkg: string,
): Promise<[Error | null, TaskRepoResolution | null]>

/**
 * 渲染分支名并校验（占位符替换 → git check-ref-format --branch）。
 * root 仅作 check-ref-format 的执行目录（该命令 cwd 无关，缺省 process.cwd()）。
 */
export function renderBranchName(
  template: string,
  ctx: BranchNameContext,
  root?: string,
): Promise<[Error | null, string | null]>

/** start 侧：创建（或幂等复用）任务 worktree；任一失败零部分状态。 */
export function createTaskWorktree(
  root: string,
  task: TaskRecord,
  taskRelPath: string,
  config: WorkloomConfig,
): Promise<[Error | null, CreateTaskWorktreeResult | null]>

/** archive 侧：按 cleanup 模式清理任务 worktree（脏检查无条件、失败即阻断归档）。 */
export function cleanupTaskWorktree(
  root: string,
  task: TaskRecord,
  config: WorkloomConfig,
): Promise<[Error | null, CleanupTaskWorktreeResult | null]>

/** worktree 目录/注册一致性探测结果（scanWorktreeConsistencySync）。 */
export interface WorktreeConsistencyScan {
  /** 目录在但未注册（项目根相对路径，如 `.workloom/worktree/<task-id>`）。 */
  unregistered: string[]
  /** 注册在但目录失或 git 标记 prunable（项目根相对路径）。 */
  missing: string[]
}

/**
 * worktree 目录与 git 注册一致性探测（doctor 只读消费，design §7/§1）：
 * 扫描 `.workloom/worktree/` 两层布局与根仓及配置声明 git 子仓的注册集比对。
 * 同步；非 git 项目返回空结果；只读（不 prune、不删除）。
 */
export function scanWorktreeConsistencySync(
  root: string,
  config: WorkloomConfig,
): [Error | null, WorktreeConsistencyScan | null]
