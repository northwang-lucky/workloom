/**
 * task-ops：六个任务管理工具（create/start/check/finish/archive/list）的 runtime 无关
 * 编排（新增抽象，TypeScript）。
 *
 * 设计意图：
 * - 把两个 adapter 逐行对应的任务工具序列（cwd 校验 → 显式 taskPath 优先 →
 *   活跃任务 fallback → core 任务调用 → null 结果兜底报错）下沉为单一调用，
 *   adapter 只负责从执行上下文提取 cwd/contextKey 并投影返回值；
 * - create 的入参过滤（空串 slug/priority/description 不传）照 DSH 现状；
 * - archive 的 taskPath 必填（requireTaskRelPath，缺参即报错不回退活跃任务），
 *   归档必须显式绑定目标任务；start/check/finish/align 保持活跃任务回退；
 * - 所有错误消息使用 surface.ERR_PREFIX.taskTool 前缀，与下沉前逐字一致。
 */
import type { StartedTaskRecord, TaskRecord, TaskRecordWithPath, TaskSummary } from '../legacy/task-store.d.ts';
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
 * @param errPrefix 「无活跃任务」错误消息的前缀（任务工具传 taskTool，
 *   executor 传 executor，保持与下沉前各消费方的文案一致）
 * @returns 任务目录相对 .workloom 的路径
 */
export declare function resolveTaskRelPath(cwd: string, contextKey: string, taskPath: string | undefined, errPrefix: string): string;
/**
 * 解析必填任务相对路径：taskPath 缺失或空串直接抛错，不回退活跃任务
 * （archive/journal 等必须显式绑定任务的消费方用；权威校验在 core，
 * adapter schema 的 required 只是投影）。
 * @param taskPath 显式任务路径（必填）
 * @param errPrefix 错误消息前缀（任务工具传 taskTool，journal 传 command）
 * @returns 任务目录相对 .workloom 的路径
 */
export declare function requireTaskRelPath(taskPath: string | undefined, errPrefix: string): string;
/** executeCreateTask 入参（title 必填；slug/priority/description/parent 可选）。 */
export interface ExecuteCreateTaskParams {
    title: string;
    slug?: string;
    priority?: string;
    description?: string;
    /** 父任务相对路径（tasks/<id> 或 <id>）；空串视同未传。 */
    parent?: string;
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
/** start 工具编排入参（force 豁免 start 门禁并留痕）。 */
export interface ExecuteStartTaskParams {
    taskPath?: string;
    force?: boolean;
    reason?: string;
}
/**
 * start 工具编排：把任务从 planning 移到 in_progress。
 * 默认硬阻断：prd 小节未填、jsonl 无有效记录、alignment 门禁未过（无凭据或
 * 凭据 stale）时拒绝；force 豁免需非空 reason 并按实际绕过的 gate 留痕。
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
export declare function executeCheckTask(cwd: string, contextKey: string, params: ExecuteCheckTaskParams): Promise<[Error | null, TaskRecordWithPath | null]>;
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
/** archive 工具成功结果（note 为收尾提示文案）。 */
export interface ExecuteArchiveTaskResult {
    taskRelPath: string;
    task: TaskRecord;
    note: string;
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
