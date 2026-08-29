/** workloom 任务数据：task-store 模块的公共类型（供 JSDoc 引用，快照字段）。 */
import type { GateValue } from './task-gates.d.ts'

export type TaskStatusKey = 'PLANNING' | 'IN_PROGRESS' | 'COMPLETED'

/** 任务状态取值（task.json.status）。 */
export type TaskStatusValue = 'planning' | 'in_progress' | 'completed'

/** 优先级枚举键。 */
export type TaskPriorityKey = 'P0' | 'P1' | 'P2' | 'P3'

/** 优先级取值（task.json.priority）。 */
export type TaskPriorityValue = 'P0' | 'P1' | 'P2' | 'P3'

/** 状态枚举常量对象（键为枚举名）。 */
export const TaskStatus: Readonly<Record<TaskStatusKey, TaskStatusValue>>

/** 优先级枚举常量对象。 */
export const TaskPriority: Readonly<Record<TaskPriorityKey, TaskPriorityValue>>

/** 任务 hooks（task.json.hooks，snake_case 字段）。 */
export interface TaskHooks {
  after_create: string[]
  after_start: string[]
  after_finish: string[]
  after_archive: string[]
}

/** 2.2 check 通过凭据（workloom_task_check 写入 task.json.check）。 */
export interface TaskCheckRecord {
  passedAt: string
  summary: string
}

/** force 豁免留痕（task.json.overrides 元素）。 */
export interface GateOverride {
  gate: GateValue
  tool: string
  at: string
  reason?: string
}

/** executor 派发审计条目（task.json.dispatches 元素）。 */
export interface DispatchRecord {
  kind: string
  at: string
  title: string
}

/** recordExecutorDispatch 入参（at 由函数生成）。 */
export type DispatchRecordInput = Pick<DispatchRecord, 'kind' | 'title'>

/** task.json 单条记录（快照字段，与数据布局一致）。 */
export interface TaskRecord {
  id: string
  name: string
  title: string
  description: string
  status: TaskStatusValue
  priority: TaskPriorityValue
  creator: string
  assignee: string
  package: string | null
  branch: string
  base_branch: string
  createdAt: string
  completedAt: string | null
  parent: string | null
  children: string[]
  subtasks: string[]
  scope: string
  commit: string
  pr_url: string
  worktree_path: string
  relatedFiles: string[]
  notes: string
  meta: Record<string, unknown>
  check: TaskCheckRecord | null
  overrides: GateOverride[]
  dispatches: DispatchRecord[]
  hooks: TaskHooks
}

/** 附带 taskRelPath 的任务记录（readTask 返回）。 */
export type TaskRecordWithPath = TaskRecord & { taskRelPath: string }

/** 任务摘要（listTasks 返回）。 */
export interface TaskSummary {
  name: string
  title: string
  status: TaskStatusValue
  priority: TaskPriorityValue
  createdAt: string
  parent: string | null
}

/** createTask 参数。 */
export interface CreateTaskParams {
  title: string
  slug?: string
  parent?: string | null
  priority?: TaskPriorityValue
  description?: string
  contextKey?: string
}

/** createTask 结果。 */
export interface CreateTaskResult {
  taskRelPath: string
  task: TaskRecord
}

/** startTask 参数。 */
export interface StartTaskParams {
  taskRelPath: string
  contextKey?: string
  /** 豁免 start 门禁（留痕 overrides）。 */
  force?: boolean
  /** force 豁免原因（审计用）。 */
  reason?: string
}

/** checkTask 参数。 */
export interface CheckTaskParams {
  taskRelPath: string
  /** check 通过摘要（必填，非空）。 */
  summary: string
  /** 豁免 check 门禁（留痕 overrides）。 */
  force?: boolean
  /** force 豁免原因（审计用）。 */
  reason?: string
}

/** finishTask 参数。 */
export interface FinishTaskParams {
  taskRelPath: string
  contextKey?: string
}

/** archiveTask 参数。 */
export interface ArchiveTaskParams {
  taskRelPath: string
  autoCommit?: boolean
  /** 豁免 archive 门禁（留痕 overrides）。 */
  force?: boolean
  /** force 豁免原因（审计用）。 */
  reason?: string
}

/** listTasks 参数。 */
export interface ListTasksParams {
  status?: TaskStatusValue
}

/** 由标题生成 kebab-case slug。 */
export function slugify(title: string): string

/** 创建任务并返回任务目录相对路径与记录。 */
export function createTask(
  root: string,
  params: CreateTaskParams,
): Promise<[Error | null, CreateTaskResult | null]>

/** 启动任务：planning → in_progress。 */
export function startTask(
  root: string,
  params: StartTaskParams,
): Promise<[Error | null, TaskRecordWithPath | null]>

/** 记录 2.2 check 通过凭据（写 task.json check 字段）。 */
export function checkTask(
  root: string,
  params: CheckTaskParams,
): [Error | null, TaskRecordWithPath | null]

/** 记录 executor 参数覆盖（force 放行后调用）：向 overrides 追加 EXECUTOR_MODEL_EFFORT 条目。 */
export function recordExecutorOverride(
  root: string,
  taskRelPath: string,
  reason?: string,
): [Error | null]

/** 记录一次 executor 派发成功：向 dispatches 追加 { kind, at, title }（at 自动生成）。 */
export function recordExecutorDispatch(
  root: string,
  taskRelPath: string,
  entry: DispatchRecordInput,
): [Error | null]

/** 结束任务会话（清指针，不改状态）。 */
export function finishTask(root: string, params: FinishTaskParams): Promise<[Error | null]>

/** 归档任务（置 completed、移动目录、可选 git 提交）；返回记录的 taskRelPath 为归档后新路径。 */
export function archiveTask(
  root: string,
  params: ArchiveTaskParams,
): Promise<[Error | null, TaskRecordWithPath | null]>

/** 列出任务摘要（可按状态过滤）。 */
export function listTasks(
  root: string,
  params?: ListTasksParams,
): [Error | null, TaskSummary[] | null]

/** 执行 hooks：注入 TASK_JSON_PATH，失败收集为 WARNING。 */
export function runTaskHooks(
  root: string,
  taskJsonPath: string,
  commands: string[],
): Promise<string[]>

/** 读取任务记录；成功时对象附带 taskRelPath。 */
export function readTask(
  root: string,
  taskRelPath: string,
): [Error | null, TaskRecordWithPath | null]
