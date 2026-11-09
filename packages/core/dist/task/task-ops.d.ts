/**
 * task-ops：任务生命周期编排（TypeScript）。
 *
 * 设计意图：
 * - 两层职责：① 七个任务管理工具（create/start/check/complete/finish/archive/list）的
 *   runtime 无关编排（cwd 校验 → 显式 taskPath 优先 → 活跃任务 fallback →
 *   生命周期调用 → null 结果兜底报错），adapter 只负责从执行上下文提取
 *   cwd/contextKey 并投影返回值；② start/check/complete/finish/archive 五个生命周期
 *   编排（守卫判断 + task-storage 物理写 + 指针联动 + hooks），状态迁移判断
 *   经 task/state 的 migrateTask/evaluateTransition 单一入口；
 * - create 的入参过滤（空串 slug/priority/description 不传）照 DSH 现状；
 *   mode 三值（light/standard/parent，缺省 standard），会话指针绑定在本层
 *   （存储层不消费 contextKey）；带 parent 创建不抢会话指针（指针分流）；
 * - archive 的 taskPath 必填（requireTaskRelPath，缺参即报错不回退活跃任务），
 *   归档必须显式绑定目标任务；start/check/finish/align 保持活跃任务回退；
 * - 生命周期错误消息沿用旧 task-store 的 `workloom task` 前缀（行为移植，
 *   测试钉住字面量）；工具编排错误消息使用 surface.ERR_PREFIX.taskTool 前缀。
 */
import type { AutonomyValue, TaskView } from './state/index.ts';
import type { TaskRecord, TaskSummary } from './storage/index.ts';
import type { CleanupTaskWorktreeResult } from '../workspace/worktree.d.ts';
/**
 * 校验工具 cwd：空串直接抛错（消息含前缀，与下沉前 adapter 文案逐字一致）。
 * @param cwd 工具执行上下文的工作目录
 * @returns cwd（非空）
 */
export declare function requireWorkloomCwd(cwd: string): string;
/**
 * 解析任务相对路径：显式 taskPath 优先，缺省取活跃任务（无则抛错）。
 * @param cwd 会话工作目录（项目根或其任意子目录）
 * @param contextKey 会话标识（adapter 组装）
 * @param taskPath 显式任务路径（可选）
 * @param errPrefix 「无活跃任务」错误消息的前缀（任务工具与 executor 各按自身
 *   消费方文案传入；权威校验在 core，adapter schema 只是投影）
 * @returns 任务目录相对 .workloom 的路径
 */
export declare function resolveTaskRelPath(cwd: string, contextKey: string, taskPath: string | undefined, errPrefix: string): string;
/**
 * 解析必填任务相对路径：taskPath 缺失或空串直接抛错，不回退活跃任务
 * （archive 等必须显式绑定任务的消费方用；权威校验在 core，
 * adapter schema 的 required 只是投影）。
 * @param taskPath 显式任务路径（必填）
 * @param errPrefix 错误消息前缀（任务工具传 taskTool，其余消费方按自身文案传入）
 * @returns 任务目录相对 .workloom 的路径
 */
export declare function requireTaskRelPath(taskPath: string | undefined, errPrefix: string): string;
/** executeCreateTask 入参（title/package 必填；slug/priority/description/parent/mode 可选）。 */
export interface ExecuteCreateTaskParams {
    title: string;
    /**
     * package 归属（必填，与 worktree 开关无关）：必须是 config.packages 的键，
     * 缺失/未知值 fail loud（错误文案指引补配置 / workloom-packages-scan）。
     */
    package: string;
    slug?: string;
    priority?: string;
    description?: string;
    /** 父任务相对路径（tasks/<id> 或 <id>）；空串视同未传。 */
    parent?: string;
    /**
     * 任务模式：light（轻量任务，主会话包办实现与自查）、standard（完整任务）、
     * parent（容器任务）；缺省/空串视为 standard，其他取值 fail loud。
     */
    mode?: string;
    /** 任务自治度（manual/semi/auto）；缺省/空串视为 manual，其他取值 fail loud。 */
    autonomy?: string;
}
/** create 工具成功结果（task 为无 taskRelPath 的原始记录；nextStepNote 为下一步行动指引）。 */
export interface ExecuteCreateTaskResult {
    taskRelPath: string;
    task: TaskRecord;
    nextStepNote: string;
}
/**
 * create 工具编排：创建任务并设为当前会话活跃任务。
 * @param cwd 会话工作目录
 * @param contextKey 会话标识（adapter 组装）
 * @param params 工具参数（空串 slug/priority/description 不传，照 DSH 现状）
 * @returns [err, result]：err 为任一失败（消息含前缀）
 */
export declare function executeCreateTask(cwd: string, contextKey: string, params: ExecuteCreateTaskParams): Promise<[Error | null, ExecuteCreateTaskResult | null]>;
/** workloom_task_autonomy 工具编排入参（taskPath 缺省取活跃任务）。 */
export interface ExecuteSetAutonomyParams {
    taskPath?: string;
    /** 目标自治度（manual/semi/auto，必填）。 */
    autonomy: string;
}
/** autonomy 切换成功结果。 */
export interface ExecuteSetAutonomyResult {
    taskRelPath: string;
    task: TaskView;
}
/**
 * autonomy 切换工具编排：三值互切均允许，切换记录带时间戳（autonomyLog 留痕）；
 * 只影响未发生的确认迁移（已记录的确认不追溯改变）。
 * @param cwd 会话工作目录
 * @param contextKey 会话标识（adapter 组装）
 * @param params 工具参数
 * @returns [err, result]：err 为任一失败（消息含前缀）
 */
export declare function executeSetAutonomy(cwd: string, contextKey: string, params: ExecuteSetAutonomyParams): [Error | null, ExecuteSetAutonomyResult | null];
/**
 * 切换任务自治度（生命周期口）：写入 task.json autonomy 并向 autonomyLog 追加
 * 带时间戳的切换记录；同值切换幂等成功（不追加留痕）。
 * @param root 项目根
 * @param taskRelPath 任务目录相对 .workloom 的路径
 * @param autonomy 目标自治度
 * @returns [err, view]
 */
export declare function setAutonomy(root: string, taskRelPath: string, autonomy: AutonomyValue): [Error | null, TaskView | null];
/** startTask 参数（生命周期口）。 */
export interface StartTaskParams {
    taskRelPath: string;
    contextKey?: string;
    /** 豁免 start 门禁（留痕 overrides）。 */
    force?: boolean;
    /** force 豁免原因（审计用）。 */
    reason?: string;
}
/** startTask 返回的任务视图（planning → in_progress）。 */
export type StartedTaskRecord = TaskView;
/**
 * 启动任务：planning → in_progress，可选激活会话并执行 after_start hooks。
 * @param root 项目根
 * @param params 启动参数
 * @returns [err, view]
 */
export declare function startTask(root: string, params: StartTaskParams): Promise<[Error | null, StartedTaskRecord | null]>;
/** checkTask 参数（生命周期口）。 */
export interface CheckTaskParams {
    taskRelPath: string;
    /** 2.2 check 通过摘要（必填非空）。 */
    summary?: string;
    /** 豁免 check 门禁（留痕 overrides；仅在实际绕过 gate 时记录）。 */
    force?: boolean;
    /** force 豁免原因（force=true 时必填非空，审计用）。 */
    reason?: string;
}
/**
 * 记录 2.2 check 通过凭据（task.json check 字段，同步）。
 * 前置：in_progress、summary 非空；force 豁免见 checkTaskInternal。
 * @param root 项目根
 * @param params check 参数
 * @returns [err, view]
 */
export declare function checkTask(root: string, params: CheckTaskParams): [Error | null, TaskView | null];
/** complete 工具编排入参（taskPath/force/reason 可选，取样同 check）。 */
export interface ExecuteCompleteTaskParams {
    taskPath?: string;
    /** 豁免迁移守卫（留痕 overrides；仅在实际绕过 gate 时记录）。 */
    force?: boolean;
    /** force 豁免原因（force=true 时必填非空，审计用）。 */
    reason?: string;
}
/**
 * complete 工具编排：标记任务 completed（完成未归档）。目录与 worktree 不动，
 * 子任务在此等待父任务级联归档；顶层任务可再走 completed→archived 单独归档。
 * 迁移守卫复用迁移表 completed 边（archive-ready + case-outcome-ready），
 * parent 模式无 completed 边，查表自动拒绝。
 * @param cwd 会话工作目录
 * @param contextKey 会话标识（adapter 组装）
 * @param params 工具参数（taskPath 缺省取活跃任务）
 * @returns [err, task]：err 为任一失败（消息含前缀）
 */
export declare function executeCompleteTask(cwd: string, contextKey: string, params: ExecuteCompleteTaskParams): [Error | null, TaskView | null];
/** finishTask 参数（生命周期口）。 */
export interface FinishTaskParams {
    taskRelPath: string;
    contextKey?: string;
}
/**
 * 结束任务会话：清指针（若该 contextKey 指向本任务）并执行 after_finish hooks；不改状态。
 * @param root 项目根
 * @param params finish 参数
 * @returns [err]
 */
export declare function finishTask(root: string, params: FinishTaskParams): Promise<[Error | null]>;
/** archiveTask 参数（生命周期口）。 */
export interface ArchiveTaskParams {
    taskRelPath: string;
    autoCommit?: boolean;
    /** 豁免 archive 门禁（留痕 overrides）。 */
    force?: boolean;
    /** force 豁免原因（审计用）。 */
    reason?: string;
}
/**
 * 归档任务结果（四元组）：第三元素为 worktree 清理摘要（cleanup 内的
 * rebased/merged/gitlinkCommitted/worktreeRemoved/branchDeleted/skipped，供
 * archive 回执展示）；第四元素为级联清理的子任务计数（父任务归档随树级联，
 * 供回执展示）；失败时后两元素缺省。
 */
export type ArchiveTaskResult = [
    Error | null,
    TaskView | null,
    CleanupTaskWorktreeResult?,
    number?
];
/**
 * 归档任务：父任务归档时先级联清理各子任务 worktree（子先于父，任一失败即阻断）、
 * 清理自身 worktree（失败即阻断）、置 completed、整树移动目录、清理会话指针、
 * 执行 after_archive hooks，可选 git 自动提交。
 * @param root 项目根
 * @param params 归档参数
 * @returns 四元组 [err, 归档后视图, worktree 清理摘要, 级联清理子任务计数]
 */
export declare function archiveTask(root: string, params: ArchiveTaskParams): Promise<ArchiveTaskResult>;
/** start 工具编排入参（force 豁免 start 门禁并留痕）。 */
export interface ExecuteStartTaskParams {
    taskPath?: string;
    force?: boolean;
    reason?: string;
}
/**
 * start 工具编排：把任务从 planning 移到 in_progress。
 * 默认硬阻断：prd 小节未填、PLAN 结构/确认缺失、jsonl 无有效记录、PRD 内容
 * 未确认时拒绝；force 豁免需非空 reason 并按实际绕过的 gate 留痕。
 * @param cwd 会话工作目录
 * @param contextKey 会话标识（adapter 组装）
 * @param params 工具参数（taskPath 缺省取活跃任务）
 * @returns [err, task]：err 为任一失败（消息含前缀）
 */
export declare function executeStartTask(cwd: string, contextKey: string, params: ExecuteStartTaskParams): Promise<[Error | null, StartedTaskRecord | null]>;
/** check 工具编排入参（summary 为 2.2 通过摘要）。 */
export interface ExecuteCheckTaskParams {
    taskPath?: string;
    /** 2.2 check 通过摘要。 */
    summary?: string;
    force?: boolean;
    reason?: string;
}
/**
 * check 工具编排：记录 2.2 check 通过凭据（task.json check）。
 * @param cwd 会话工作目录
 * @param contextKey 会话标识（adapter 组装）
 * @param params 工具参数（taskPath 缺省取活跃任务）
 * @returns [err, task]：err 为任一失败（消息含前缀）
 */
export declare function executeCheckTask(cwd: string, contextKey: string, params: ExecuteCheckTaskParams): [Error | null, TaskView | null];
/** finish 工具成功结果（finished 恒 true，供 adapter 投影）。 */
export interface ExecuteFinishTaskResult {
    taskRelPath: string;
    finished: boolean;
}
/**
 * finish 工具编排：清除会话活跃任务指针（任务状态不变）。
 * @param cwd 会话工作目录
 * @param contextKey 会话标识（adapter 组装）
 * @param taskPath 显式任务路径（可选，缺省取活跃任务）
 * @returns [err, result]：err 为任一失败（消息含前缀）
 */
export declare function executeFinishTask(cwd: string, contextKey: string, taskPath: string | undefined): Promise<[Error | null, ExecuteFinishTaskResult | null]>;
/** archive 工具成功结果（note 为收尾提示文案；worktreeCleanup 为 worktree 清理摘要）。 */
export interface ExecuteArchiveTaskResult {
    taskRelPath: string;
    task: TaskView;
    note: string;
    /** 本次归档的 worktree 清理摘要（rebased/merged/gitlinkCommitted/worktreeRemoved/branchDeleted/skipped）。 */
    worktreeCleanup?: CleanupTaskWorktreeResult;
    /** 父任务归档级联清理的子任务计数（0 表示无子任务或无级联动作）。 */
    cascadedCleanups?: number;
}
/** archive 工具编排入参（taskPath 必填；force 豁免 archive 门禁并留痕）。 */
export interface ExecuteArchiveTaskParams {
    /** 任务目录相对 .workloom 的路径（必填，不回退活跃任务）。 */
    taskPath: string;
    autoCommit?: boolean;
    force?: boolean;
    reason?: string;
}
/**
 * archive 工具编排：归档任务（completed + 移入 archive/，可选 git 自动提交）。
 * 默认硬阻断：task.json 无 check 凭据时拒绝；force 豁免并留痕。
 * @param cwd 会话工作目录
 * @param params 工具参数（taskPath 必填）
 * @returns [err, result]：err 为任一失败（消息含前缀）
 */
export declare function executeArchiveTask(cwd: string, params: ExecuteArchiveTaskParams): Promise<[Error | null, ExecuteArchiveTaskResult | null]>;
/** list 工具成功结果（tasks 为摘要数组）。 */
export interface ExecuteListTasksResult {
    tasks: TaskSummary[];
}
/**
 * list 工具编排：列出任务摘要（可选 status 过滤，空串视为未指定）。
 * @param cwd 会话工作目录
 * @param status 状态过滤（可选）
 * @returns [err, result]：err 为任一失败（消息含前缀）
 */
export declare function executeListTasks(cwd: string, status: string | undefined): Promise<[Error | null, ExecuteListTasksResult | null]>;
