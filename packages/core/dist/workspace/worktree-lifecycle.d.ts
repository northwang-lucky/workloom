/**
 * worktree 生命周期编排（TypeScript）：任务 worktree 的创建（含幂等复用）、
 * 归档清理（merge/rebase 整合 + gitlink 联动 + 注册删除）与仓解析、分支名渲染。
 *
 * 设计意图：
 * - 与整合原语（worktree-integrate）和 setup 配置执行器（setup-executor）拆分：
 *   本模块只编排「何时做」，原语层的「怎么做」在 integrate，命令执行在 setup 执行器；
 * - start 侧任一步失败即中止（零部分状态）；archive 清理失败即阻断归档，
 *   中段失败容忍（已 rebase 跳过 rebase、已 merged 跳过合并，幂等续做）；
 * - 运行时文案英文；注释中文。
 */
import type { WorkloomConfig } from './config.d.ts';
import type { BranchNameContext, CleanupTaskWorktreeResult, CreateTaskWorktreeResult, TaskRepoResolution } from './worktree.d.ts';
import type { TaskRecord } from '../task/storage/index.ts';
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
export declare function resolveTaskRepo(root: string, config: WorkloomConfig, pkg: string): Promise<[Error | null, TaskRepoResolution | null]>;
/**
 * 渲染分支名并校验（design §3.2）：占位符白名单替换（`<task-id>` /
 * `<task-slug>` / `<date>`，加载期已在 config 校验模板本身）后过
 * `git check-ref-format --branch`；非法 → err（文案含渲染结果与模板）。
 * @param {string} template 分支名模板（config.worktree.branchTemplate）
 * @param {import('./worktree.d.ts').BranchNameContext} ctx 渲染上下文
 * @param {string} [root] check-ref-format 执行目录（命令本身 cwd 无关）
 * @returns {Promise<[Error | null, string | null]>}
 */
export declare function renderBranchName(template: string, ctx: BranchNameContext, root?: string): Promise<[Error | null, string | null]>;
/**
 * start 侧创建任务 worktree（design §3.3）：任一失败返回 err，调用方在 status
 * 写盘前中止（零部分状态）；成功结果的 worktreePath 为项目根相对路径（S1-Q1）。
 * worktree 创建或幂等复用成功后执行 packages.<name>.setup（PRD R3-R6），失败即
 * 中止 start 并保留现场；重跑 start 走复用路径重新准备以自愈。
 * @param {string} root 项目根
 * @param {import('../task/storage/index.ts').TaskRecord} task 任务记录（package/parent/createdAt/name）
 * @param {string} taskRelPath 任务目录相对 .workloom 的路径
 * @param {import('./config.d.ts').WorkloomConfig} config 项目配置
 * @returns {Promise<[Error | null, import('./worktree.d.ts').CreateTaskWorktreeResult | null]>}
 */
export declare function createTaskWorktree(root: string, task: TaskRecord, taskRelPath: string, config: WorkloomConfig): Promise<[Error | null, CreateTaskWorktreeResult | null]>;
/**
 * archive 侧清理任务 worktree（design §3.4）：失败即阻断归档（调用方不落档）；
 * 结果并入 archive 回执（rebased/merged/gitlinkCommitted/worktreeRemoved/branchDeleted/skipped）。
 * 中段失败容忍（R5-Q2）：本函数成功后的 rename 失败接受为中间态，重跑时
 * 已 rebase 跳过 rebase、已 merged 跳过合并、gitlink 无 diff 跳过提交、无注册
 * 跳过 remove（幂等续做）。
 * @param {string} root 项目根
 * @param {import('../task/storage/index.ts').TaskRecord} task 任务记录
 * @param {import('./config.d.ts').WorkloomConfig} config 项目配置
 * @returns {Promise<[Error | null, import('./worktree.d.ts').CleanupTaskWorktreeResult | null]>}
 */
export declare function cleanupTaskWorktree(root: string, task: TaskRecord, config: WorkloomConfig): Promise<[Error | null, CleanupTaskWorktreeResult | null]>;
