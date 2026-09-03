/** workloom 任务数据：task-store 模块的公共类型（供 JSDoc 引用，快照字段）。 */
import type { GateValue } from './task-gates.d.ts'

export type TaskStatusKey = 'PLANNING' | 'IN_PROGRESS' | 'COMPLETED'

/** 任务状态取值（task.json.status）。 */
export type TaskStatusValue = 'planning' | 'in_progress' | 'completed'

/** 优先级枚举键。 */
export type TaskPriorityKey = 'P0' | 'P1' | 'P2' | 'P3'

/** 优先级取值（task.json.priority）。 */
export type TaskPriorityValue = 'P0' | 'P1' | 'P2' | 'P3'

/** 任务阶段枚举键。 */
export type TaskStageKey = 'IMPLEMENT' | 'CHECK'

/** 任务阶段取值（task.json.stage；implement/check 二相，旧任务归一化默认 implement）。 */
export type TaskStageValue = 'implement' | 'check'

/** 状态枚举常量对象（键为枚举名）。 */
export const TaskStatus: Readonly<Record<TaskStatusKey, TaskStatusValue>>

/** 优先级枚举常量对象。 */
export const TaskPriority: Readonly<Record<TaskPriorityKey, TaskPriorityValue>>

/** 任务阶段枚举常量对象。 */
export const TaskStage: Readonly<Record<TaskStageKey, TaskStageValue>>

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

/**
 * alignment 凭据（workloom_task_align action=confirm 原子写入 task.json.alignment）。
 * 无 alignment 字段 = 未对齐（planning 任务 start 前必须完成确认；旧任务读 null）。
 */
export interface TaskAlignmentRecord {
  /** 用户明确确认时间（相同 hash 重复 confirm 幂等，不刷新）。 */
  passedAt: string
  /** 收敛摘要（覆盖节点、关键决策及确认结果，由 alignment skill 提供）。 */
  summary: string
  /** 确认时含 Alignment Decisions 的完整 PRD SHA-256（CRLF/CR 归一为 LF）。 */
  prdHash: string
}

/** force 豁免留痕（task.json.overrides 元素）。 */
export interface GateOverride {
  gate: GateValue
  tool: string
  at: string
  reason?: string
}

/** executor 派发记录的生命周期状态（派发初写 running；终态由回填 API 写 completed/failed）。 */
export type DispatchStatus = 'running' | 'completed' | 'failed'

/**
 * 派发记录的 model 绑定来源（dispatches[].modelSource）。
 * 新派轮：param（显式参数）/ whenMain / fallback / legacy（配置命中）/ inherit（继承主会话模型）；
 * 续派轮：spawn（沿用 childId 首次派发记录的绑定，审计可查）。
 */
export type DispatchModelSource = 'param' | 'whenMain' | 'fallback' | 'legacy' | 'inherit' | 'spawn'

/** 派发记录 model 绑定来源枚举常量对象（键为枚举名）。 */
export const DISPATCH_MODEL_SOURCES: Readonly<Record<
  'PARAM' | 'WHEN_MAIN' | 'FALLBACK' | 'LEGACY' | 'INHERIT' | 'SPAWN',
  DispatchModelSource
>>

/** executor 派发审计条目（task.json.dispatches 元素）。 */
export interface DispatchRecord {
  kind: string
  at: string
  title: string
  /** continuable 子代理的 durable session id（旧记录缺省；续用定位与同 kind 校验的依据）。 */
  childId?: string
  /**
   * 派发生命周期状态：初写（recordExecutorDispatch）写 running；终态由
   * settleExecutorDispatch 回填 completed/failed。存量无 status 字段的记录
   * 读取时视为 completed（不迁移落盘）。
   */
  status?: DispatchStatus
  /** 失败一行摘要（终态原因 stopReason 的一行映射；仅 status=failed 时由回填写入）。 */
  error?: string
  /**
   * 派发时刻实际生效（解析后）的 model（新派轮落值；续派轮沿用 childId 首次派发记录；
   * inherit 且主模型可读时落主会话模型快照）。旧记录缺省读取为 undefined。
   */
  model?: string
  /** 派发时刻实际生效的 effort（同上；未配置/未显式传参时缺省）。 */
  effort?: string
  /**
   * model 绑定来源：新派轮 param/whenMain/fallback/legacy/inherit；
   * 续派轮 spawn（沿用首次派发记录）。旧记录缺省读取为 undefined。
   */
  modelSource?: DispatchModelSource
}

/** recordExecutorDispatch 入参（at 由函数生成；绑定字段可选，续派轮传 spawn 语义值）。 */
export type DispatchRecordInput = Pick<
  DispatchRecord,
  'kind' | 'title' | 'childId' | 'model' | 'effort' | 'modelSource'
>

/** settleExecutorDispatch 回填入参（只改 status/error，不动 stage、不新增记录）。 */
export interface DispatchSettleInput {
  /** 关联的 continuable 子代理 id（与 dispatches 记录的 childId 匹配）。 */
  childId: string
  /** 终态：completed 或 failed。 */
  status: Exclude<DispatchStatus, 'running'>
  /** 失败一行摘要（仅 status=failed 时提供）。 */
  error?: string
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
  check: TaskCheckRecord | null
  /** Phase 1.1 alignment 凭据（确认后非空；旧 grilling 字段为惰性历史数据，不参与语义）。 */
  alignment: TaskAlignmentRecord | null
  overrides: GateOverride[]
  /** 任务执行期阶段（implement | check）：派发时与 dispatches 同点写入，旧任务归一化默认 implement。 */
  stage: TaskStageValue
  dispatches: DispatchRecord[]
  hooks: TaskHooks
}

/** 附带 taskRelPath 的任务记录（readTask 返回）。 */
export type TaskRecordWithPath = TaskRecord & { taskRelPath: string }

/** startTask 返回的任务记录（planning → in_progress，无软提醒字段；凭据语义在 alignment）。 */
export type StartedTaskRecord = TaskRecordWithPath

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
  /** 2.2 check 通过摘要（必填非空）。 */
  summary?: string
  /** 豁免 check 门禁（留痕 overrides；仅在实际绕过 gate 时记录）。 */
  force?: boolean
  /** force 豁免原因（force=true 时必填非空，审计用）。 */
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
): Promise<[Error | null, StartedTaskRecord | null]>

/** 记录 2.2 check 通过凭据（task.json check 字段；stale alignment 在 force 外硬拦）。 */
export function checkTask(
  root: string,
  params: CheckTaskParams,
): [Error | null, TaskRecordWithPath | null]

/**
 * 记录 alignment 凭据（workloom_task_align confirm 的窄写口，同步全链路）：
 * 校验 summary/prdHash 非空与任务状态，通过同目录临时文件 + renameSync 原子写
 * task.json.alignment；相同 prdHash 重复 confirm 幂等早退（不刷新 passedAt）。
 */
export function recordAlignmentCredential(
  root: string,
  taskRelPath: string,
  entry: AlignmentCredentialInput,
): [Error | null, TaskRecordWithPath | null]

/** recordAlignmentCredential 入参（passedAt 由函数生成；summary/prdHash 由调用方校验后传入）。 */
export type AlignmentCredentialInput = Pick<TaskAlignmentRecord, 'summary' | 'prdHash'>

/** 记录 executor 参数覆盖（force 放行后调用）：向 overrides 追加 EXECUTOR_MODEL_EFFORT 条目。 */
export function recordExecutorOverride(
  root: string,
  taskRelPath: string,
  reason?: string,
): [Error | null]

/**
 * 记录指定 gate 的 force 豁免（R14：每个实际绕过的 gate 独立留痕；reason 必填非空）。
 * 用于 stale_alignment 等非 executor_model_effort 门禁的 force 审计（适配层调用）。
 */
export function recordGateOverride(
  root: string,
  taskRelPath: string,
  gate: import('./task-gates.d.ts').GateValue,
  reason: string,
): [Error | null]

/** 记录一次 executor 派发（初写，派发时刻调用）：向 dispatches 追加 { kind, at, title, childId?, status: 'running' }（at 自动生成）。 */
export function recordExecutorDispatch(
  root: string,
  taskRelPath: string,
  entry: DispatchRecordInput,
): [Error | null]

/** 回填一次 executor 派发的终态：按 childId 关联最近一条 running 记录，只改 status/error，不动 stage、不新增记录。 */
export function settleExecutorDispatch(
  root: string,
  taskRelPath: string,
  entry: DispatchSettleInput,
): [Error | null]

/**
 * 计算派发后的任务阶段（纯函数）：research 保持 current；implement/frontend → implement；check → check。
 * kind 非法（含 undefined）抛错（fail loud）。
 */
export function computeTaskStage(current: TaskStageValue, kind: string): TaskStageValue

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
