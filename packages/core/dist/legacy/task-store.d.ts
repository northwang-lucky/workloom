/**
 * 由标题生成 kebab-case slug：非字母数字转连字符、去首尾连字符、全小写、截断 40 字符。
 * @param {string} title 任务标题
 * @returns {string}
 */
export function slugify(title: string): string;
/**
 * 读取任务记录：task.json 缺失或损坏返回 err；成功时对象附带 taskRelPath。
 * 导出供 workflow-service 编排使用（读取只读任务状态）。
 * @param {string} root 项目根
 * @param {string} taskRelPath 任务目录相对 .workloom 的路径
 * @returns {[Error | null, import('./task-store.d.ts').TaskRecordWithPath | null]}
 */
export function readTask(root: string, taskRelPath: string): [Error | null, import("./task-store.d.ts").TaskRecordWithPath | null];
/**
 * 执行 hooks：注入 TASK_JSON_PATH 环境变量；单个失败收集为 WARNING，不抛错。
 * @param {string} root 项目根（作为 hooks 的工作目录）
 * @param {string} taskJsonPath task.json 绝对路径
 * @param {string[]} commands shell 命令列表
 * @returns {Promise<string[]>} WARNING 消息列表（空数组表示全部成功）
 */
export function runTaskHooks(root: string, taskJsonPath: string, commands: string[]): Promise<string[]>;
/**
 * 创建任务：建目录、写 task.json/prd.md/两个 jsonl，可选激活会话并执行 after_create hooks。
 * @param {string} root 项目根（或根下任意目录）
 * @param {import('./task-store.d.ts').CreateTaskParams} params
 * @returns {Promise<[Error | null, import('./task-store.d.ts').CreateTaskResult | null]>}
 */
export function createTask(root: string, params: import("./task-store.d.ts").CreateTaskParams): Promise<[Error | null, import("./task-store.d.ts").CreateTaskResult | null]>;
/**
 * 启动任务：planning → in_progress，可选激活会话并执行 after_start hooks。
 * @param {string} root 项目根
 * @param {import('./task-store.d.ts').StartTaskParams} params
 * @returns {Promise<[Error | null, import('./task-store.d.ts').TaskRecordWithPath | null]>}
 */
export function startTask(root: string, params: import("./task-store.d.ts").StartTaskParams): Promise<[Error | null, import("./task-store.d.ts").TaskRecordWithPath | null]>;
/**
 * 记录 2.2 check 通过凭据（task.json check 字段，同步）。
 * 前置：in_progress、summary 非空；force 豁免见 checkTaskInternal。
 * @param {string} root 项目根
 * @param {import('./task-store.d.ts').CheckTaskParams} params
 * @returns {[Error | null, import('./task-store.d.ts').TaskRecordWithPath | null]}
 */
export function checkTask(root: string, params: import("./task-store.d.ts").CheckTaskParams): [Error | null, import("./task-store.d.ts").TaskRecordWithPath | null];
/**
 * 记录 alignment 凭据（workloom_task_align confirm 的窄写口，同步全链路）：
 * 校验入参与任务状态后，经同目录临时文件 + renameSync 原子写 task.json
 * alignment；相同 prdHash 重复 confirm 幂等早退（不刷新 passedAt，R11）。
 * 校验失败零写入；服务层负责 PRD 结构/hash/开放节点等前置校验，本口只落凭据。
 * @param {string} root 项目根
 * @param {string} taskRelPath 任务目录相对 .workloom 的路径
 * @param {import('./task-store.d.ts').AlignmentCredentialInput} entry 凭据入参（summary/prdHash）
 * @returns {[Error | null, import('./task-store.d.ts').TaskRecordWithPath | null]}
 */
export function recordAlignmentCredential(root: string, taskRelPath: string, entry: import("./task-store.d.ts").AlignmentCredentialInput): [Error | null, import("./task-store.d.ts").TaskRecordWithPath | null];
/**
 * 记录 executor 参数覆盖（adapter 在 force 放行后调用）：向 task.json overrides
 * 追加 EXECUTOR_MODEL_EFFORT 条目（gate/tool/at/reason?，空串不记）。
 * 记录失败只返回 err（调用方 WARNING 不阻塞派发），不涉及状态迁移与 hooks。
 * @param {string} root 项目根
 * @param {string} taskRelPath 任务目录相对 .workloom 的路径
 * @param {string | undefined} reason 覆盖原因（审计用）
 * @returns {[Error | null]}
 */
export function recordExecutorOverride(root: string, taskRelPath: string, reason: string | undefined): [Error | null];
/**
 * 记录指定 gate 的 force 豁免（R14：每个实际绕过的 gate 独立留痕；reason 必填非空）。
 * stale_alignment 等非 executor_model_effort 门禁的 force 审计由适配层调用。
 * @param {string} root 项目根
 * @param {string} taskRelPath 任务目录相对 .workloom 的路径
 * @param {import('./task-gates.d.ts').GateValue} gate 被绕过的 gate
 * @param {string} reason 覆盖原因（审计用）
 * @returns {[Error | null]}
 */
export function recordGateOverride(root: string, taskRelPath: string, gate: import("./task-gates.d.ts").GateValue, reason: string): [Error | null];
/**
 * 记录一次 executor 派发（初写，派发时刻调用）：向 task.json dispatches 追加
 * { kind, at, title, childId?, status: 'running' } 条目（at 自动生成；childId 为
 * continuable 子代理的 durable session id，续用定位与终态回填关联的依据，旧记录缺省）。
 * 初写即记 running——即使后续未结算（子代理未回填）也留痕可见（缺口 A：失败派发在
 * task.json 可见）。终态由 settleExecutorDispatch 按 childId 回填 completed/failed，
 * 主会话不参与。记录失败只返回 err（调用方 WARNING 不阻塞派发），与
 * recordExecutorOverride 同一「元组 + WARNING」口径。
 * @param {string} root 项目根
 * @param {string} taskRelPath 任务目录相对 .workloom 的路径
 * @param {import('./task-store.d.ts').DispatchRecordInput} entry 派发条目（kind/title/childId?，at 由函数生成）
 * @returns {[Error | null]}
 */
export function recordExecutorDispatch(root: string, taskRelPath: string, entry: import("./task-store.d.ts").DispatchRecordInput): [Error | null];
/**
 * 回填一次 executor 派发的终态（adapter 监听 subagent/end 后调用）：按 childId
 * 关联 dispatches 中最近一条仍为 running 的记录，只改 status/error——不动 stage、
 * 不新增记录（不重复计数）。无匹配 running 记录时 no-op（返回成功，不报错：
 * 监听对非 workloom 子代理也会触发，未知 childId 静默跳过）。记录失败只返回 err。
 * @param {string} root 项目根
 * @param {string} taskRelPath 任务目录相对 .workloom 的路径
 * @param {import('./task-store.d.ts').DispatchSettleInput} entry 回填条目（childId + status + error?）
 * @returns {[Error | null]}
 */
export function settleExecutorDispatch(root: string, taskRelPath: string, entry: import("./task-store.d.ts").DispatchSettleInput): [Error | null];
/**
 * 计算派发后的任务阶段（纯函数，独立可测）：research 保持 current；
 * implement/frontend → 'implement'；check → 'check'。
 * kind 非法（含 undefined）抛错（fail loud，与 assertKind 同语义）。
 * @param {import('./task-store.d.ts').TaskStageValue} current 当前阶段（readTask 归一化后必有值）
 * @param {string} kind executor 类型
 * @returns {import('./task-store.d.ts').TaskStageValue}
 */
export function computeTaskStage(current: import("./task-store.d.ts").TaskStageValue, kind: string): import("./task-store.d.ts").TaskStageValue;
/**
 * 结束任务会话：清指针（若该 contextKey 指向本任务）并执行 after_finish hooks；不改状态。
 * @param {string} root 项目根
 * @param {import('./task-store.d.ts').FinishTaskParams} params
 * @returns {Promise<[Error | null]>}
 */
export function finishTask(root: string, params: import("./task-store.d.ts").FinishTaskParams): Promise<[Error | null]>;
/**
 * 归档任务：置 completed、移动目录、清理会话指针、执行 after_archive hooks，可选 git 自动提交。
 * @param {string} root 项目根
 * @param {import('./task-store.d.ts').ArchiveTaskParams} params
 * @returns {Promise<[Error | null, import('./task-store.d.ts').TaskRecordWithPath | null]>}
 */
export function archiveTask(root: string, params: import("./task-store.d.ts").ArchiveTaskParams): Promise<[Error | null, import("./task-store.d.ts").TaskRecordWithPath | null]>;
/**
 * 列出任务摘要（不含 archive/），可按状态过滤；缺失或损坏的目录跳过。
 * @param {string} root 项目根
 * @param {import('./task-store.d.ts').ListTasksParams} [params]
 * @returns {[Error | null, import('./task-store.d.ts').TaskSummary[] | null]}
 */
export function listTasks(root: string, params?: import("./task-store.d.ts").ListTasksParams): [Error | null, import("./task-store.d.ts").TaskSummary[] | null];
/**
 * 任务状态枚举（task.json.status 取值）。
 * @type {Readonly<Record<import('./task-store.d.ts').TaskStatusKey, import('./task-store.d.ts').TaskStatusValue>>}
 */
export const TaskStatus: Readonly<Record<import("./task-store.d.ts").TaskStatusKey, import("./task-store.d.ts").TaskStatusValue>>;
/**
 * 优先级枚举（task.json.priority 取值）。
 * @type {Readonly<Record<import('./task-store.d.ts').TaskPriorityKey, import('./task-store.d.ts').TaskPriorityValue>>}
 */
export const TaskPriority: Readonly<Record<import("./task-store.d.ts").TaskPriorityKey, import("./task-store.d.ts").TaskPriorityValue>>;
/**
 * 任务阶段枚举（task.json.stage 取值；implement/check 二相）。
 * @type {Readonly<Record<import('./task-store.d.ts').TaskStageKey, import('./task-store.d.ts').TaskStageValue>>}
 */
export const TaskStage: Readonly<Record<import("./task-store.d.ts").TaskStageKey, import("./task-store.d.ts").TaskStageValue>>;
/**
 * 派发记录 model 绑定来源枚举值（dispatches[].modelSource 合法值域）。
 * 新派轮：param/whenMain/fallback/legacy/inherit；续派轮：spawn。
 * @type {Readonly<Record<'PARAM' | 'WHEN_MAIN' | 'FALLBACK' | 'LEGACY' | 'INHERIT' | 'SPAWN', import('./task-store.d.ts').DispatchModelSource>>}
 */
export const DISPATCH_MODEL_SOURCES: Readonly<Record<"PARAM" | "WHEN_MAIN" | "FALLBACK" | "LEGACY" | "INHERIT" | "SPAWN", import("./task-store.d.ts").DispatchModelSource>>;
