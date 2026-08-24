/** workloom 任务数据：task-store 模块的公共类型（供 JSDoc 引用，快照字段）。 */
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
