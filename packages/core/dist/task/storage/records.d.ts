/**
 * storage/records：task.json 记录类型与目录/文件名常量（storage 子包共享基底）。
 *
 * 设计意图：
 * - 承载存储层的数据布局类型与冻结常量（DIR_NAMES/FILE_NAMES、TaskRecord、
 *   DispatchRecord 等）；字段名与既有 task.json 数据保持兼容，值域解释与兼容读
 *   归 task/state 的 readTaskView 单点，本文件只持落盘原始形状；
 * - 数据布局约定：.workloom/tasks/{MM-DD-slug}/task.json（snake_case 字段）；
 * - 全 storage 共享的私有件（ERR_PREFIX、toError、isEnoent）落在本文件，由兄弟
 *   文件相对导入——本文件对 storage 内部零依赖，避免分文件间形成循环导入面；
 * - 仅供 storage 内部消费的符号（ERR_PREFIX/toError/isEnoent/DEFAULT_PRIORITY/
 *   PRIORITY_SET）不进 index.ts 的对外重导出面。
 */
import type { TaskCaseRecord } from '../case-structure.ts';
import type { AutonomyValue, TaskModeValue } from '../state/index.ts';
/** 错误消息前缀（storage 子包共享）。 */
export declare const ERR_PREFIX = "workloom task";
/** 目录名常量。 */
export declare const DIR_NAMES: Readonly<{
    tasks: "tasks";
    archive: "archive";
}>;
/** 文件名常量。 */
export declare const FILE_NAMES: Readonly<{
    taskJson: "task.json";
    prd: "prd.md";
    plan: "plan.md";
    implementLog: "implement.jsonl";
    checkLog: "check.jsonl";
}>;
/** 任务状态枚举键。 */
export type TaskStatusKey = 'PLANNING' | 'IN_PROGRESS' | 'COMPLETED';
/** 任务状态取值（task.json.status）。 */
export type TaskStatusValue = 'planning' | 'in_progress' | 'completed';
/** 优先级枚举键。 */
export type TaskPriorityKey = 'P0' | 'P1' | 'P2' | 'P3';
/** 优先级取值（task.json.priority）。 */
export type TaskPriorityValue = 'P0' | 'P1' | 'P2' | 'P3';
/** 卡点取值（task.json overrides[].gate；字面量与历史审计记录保持稳定）。 */
export type GateValue = 'start' | 'check' | 'archive' | 'executor_model_effort' | 'light_dispatch';
/**
 * 任务状态枚举（task.json.status 取值）。
 */
export declare const TaskStatus: Readonly<Record<TaskStatusKey, TaskStatusValue>>;
/**
 * 优先级枚举（task.json.priority 取值）。
 */
export declare const TaskPriority: Readonly<Record<TaskPriorityKey, TaskPriorityValue>>;
/** 默认优先级（storage 内部：create 的组装缺省值）。 */
export declare const DEFAULT_PRIORITY: TaskPriorityValue;
/** 合法优先级集合（storage 内部：create 的入参校验用）。 */
export declare const PRIORITY_SET: Set<string>;
/** 任务 hooks（task.json.hooks，snake_case 字段）。 */
export interface TaskHooks {
    after_create: string[];
    after_start: string[];
    after_finish: string[];
    after_archive: string[];
}
/** 2.2 check 通过凭据（workloom_task_check 写入 task.json.check）。 */
export interface TaskCheckRecord {
    passedAt: string;
    summary: string;
}
/**
 * PRD 内容确认记录（workloom_task_align action=confirm 原子写入 task.json.alignment）。
 * 无 alignment 字段 = 未确认（planning 任务 start 前必须完成确认；旧任务读 null）。
 */
export interface TaskAlignmentRecord {
    /** 用户明确确认 PRD 内容的时间（无哈希；重复确认刷新为最近一次）。 */
    passedAt: string;
    /** 确认摘要（覆盖节点、关键决策与确认结果；自动记录注明 autonomy 与自动来源）。 */
    summary: string;
    /** 确认来源：user 人工确认 / auto 自治度自动记录；旧记录缺省读作 user。 */
    source?: 'user' | 'auto';
    /** 记录时的自治度快照（manual/semi/auto）；旧记录缺省读作 manual。 */
    autonomy?: string;
}
/** PLAN 内容确认记录（workloom_task_align target=plan action=confirm 写入 task.json.planConfirmation）。 */
export interface TaskPlanConfirmationRecord {
    /** 用户明确确认 PLAN 内容的时间（无哈希；重复确认刷新为最近一次）。 */
    passedAt: string;
    /** PLAN 确认摘要（覆盖的 AC、关键步骤与复核结论；自动记录注明 autonomy 与自动来源）。 */
    summary: string;
    /** 确认来源：user 人工确认 / auto 自治度自动记录；旧记录缺省读作 user。 */
    source?: 'user' | 'auto';
    /** 记录时的自治度快照（manual/semi/auto）；旧记录缺省读作 manual。 */
    autonomy?: string;
}
/** force 豁免留痕（task.json.overrides 元素）。 */
export interface GateOverride {
    gate: GateValue;
    tool: string;
    at: string;
    reason?: string;
}
/** executor 派发记录的生命周期状态（派发初写 running；终态由回填 API 写 completed/failed）。 */
export type DispatchStatus = 'running' | 'completed' | 'failed';
/**
 * 派发记录的 model 绑定来源（dispatches[].modelSource）。
 * 新派轮：param（显式参数）/ whenMain / fallback / legacy（配置命中，fallback =
 * 无 whenMain 的 profile 兜底条目命中）/ inherit（继承主会话模型）/ rotate（同类
 * 并发轮换选中链条目起步）；失败转移跳：fallback；续派轮：spawn（沿用 childId
 * 首次派发记录的绑定，审计可查）。
 */
export type DispatchModelSource = 'param' | 'whenMain' | 'fallback' | 'legacy' | 'inherit' | 'rotate' | 'spawn';
/** plan 评审派发目的值（judger 专用；派发成功自动置 planReview.phase=reviewing）。 */
export declare const PLAN_REVIEW_PURPOSE = "plan-review";
/**
 * 派发目的：checker 收 case-design/execution（与 case-structure 的 CasePurpose
 * 同值域），judger 收 plan-review（PLAN 评审派发）；其余角色不接受 purpose。
 */
export type DispatchPurpose = import('../case-structure.ts').CasePurpose | typeof PLAN_REVIEW_PURPOSE;
/** executor 派发审计条目（task.json.dispatches 元素）。 */
export interface DispatchRecord {
    kind: string;
    at: string;
    title: string;
    /**
     * 派发目的（仅 checker 与 judger 落此字段）：checker 收 case-design/execution（缺省
     * execution，兼容旧记录），judger 收 plan-review（PLAN 评审派发）；其余角色不写。
     */
    purpose?: DispatchPurpose;
    /** continuable 子代理的 durable session id（旧记录缺省；续用定位与同角色校验的依据）。 */
    childId?: string;
    /**
     * 派发生命周期状态：初写（recordExecutorDispatch）写 running；终态由
     * settleExecutorDispatch 回填 completed/failed。存量无 status 字段的记录
     * 读取时视为 completed（不迁移落盘）。
     */
    status?: DispatchStatus;
    /** 失败一行摘要（终态原因 stopReason 的一行映射；仅 status=failed 时由回填写入）。 */
    error?: string;
    /** 派发时刻实际生效（解析后）的 model。旧记录缺省读取为 undefined。 */
    model?: string;
    /** 派发时刻实际生效的 effort（同上；未配置/未显式传参时缺省）。 */
    effort?: string;
    /** model 绑定来源。旧记录缺省读取为 undefined。 */
    modelSource?: DispatchModelSource;
    /** 派发时刻施加给子代理的工具白名单（冷恢复时据此重建限制）。 */
    toolsAllow?: string[];
    /** 失败转移链式关联：前一跳 childId（首跳无字段，旧记录缺省）。 */
    fallbackOf?: string;
    /** 失败转移本跳序号（首跳无字段；>= 2 的整数）。旧记录缺省。 */
    fallbackAttempt?: number;
}
/**
 * task.json 单条原始记录（存储层形状）：mode/stage/status 保持落盘原值（含旧值
 * 与缺省），值域解释归 readTaskView 兼容读单点；planReview/autonomy 为状态机
 * 新增字段，旧记录缺省。
 */
export interface TaskRecord {
    id: string;
    name: string;
    title: string;
    description: string;
    /** 存储原值：planning/in_progress/completed（未映射值由兼容读报错）。 */
    status: string;
    /** 存储原值（P0-P3；创建入参已校验）。 */
    priority: string;
    /** 存储原值：新值 light/standard/parent，旧值 full，或缺省（兼容读映射）。 */
    mode?: string;
    creator: string;
    assignee: string;
    package: string | null;
    branch: string;
    base_branch: string;
    createdAt: string;
    completedAt: string | null;
    parent: string | null;
    children: string[];
    subtasks: string[];
    scope: string;
    commit: string;
    pr_url: string;
    worktree_path: string;
    relatedFiles: string[];
    notes: string;
    meta: Record<string, unknown>;
    check: TaskCheckRecord | null;
    /**
     * CASE 生命周期记录（required/designSession/phase）：旧任务读取为 null；
     * start 完整任务转换 required=true；phase 为 CASE 轨道阶段（缺省读作 none）。
     */
    case: TaskCaseRecord | null;
    /** Phase 1.1 PRD 内容确认（确认后非空；旧 grilling 字段为惰性历史数据，不参与语义）。 */
    alignment: TaskAlignmentRecord | null;
    /** PLAN 内容确认（PLAN 复核通过后、start 之前写入；旧任务读 null）。 */
    planConfirmation: TaskPlanConfirmationRecord | null;
    overrides: GateOverride[];
    /** 存储原值：新枚举值或旧值 implement/check，或缺省（兼容读映射）。 */
    stage?: string;
    dispatches: DispatchRecord[];
    hooks: TaskHooks;
    /** PLAN 评审轨道存储形态 {phase, revisions}；旧记录缺省读作 none。 */
    planReview?: unknown;
    /** 自治度存储原值；旧记录缺省读作 manual。 */
    autonomy?: unknown;
    /** 自治度切换留痕（带时间戳；旧记录缺省补空数组）。 */
    autonomyLog?: AutonomySwitchRecord[];
}
/** 附带 taskRelPath 的任务记录（readTaskRecord 返回）。 */
export type TaskRecordWithPath = TaskRecord & {
    taskRelPath: string;
};
/** 任务摘要（listTasks 返回）。 */
export interface TaskSummary {
    name: string;
    title: string;
    status: TaskStatusValue;
    priority: TaskPriorityValue;
    createdAt: string;
    parent: string | null;
    /** 任务目录相对 .workloom 的路径（如 tasks/10-28-demo）；name 是 slug，定位任务目录用本字段。 */
    taskRelPath: string;
}
/** 自治度切换留痕条目（task.json autonomyLog 元素；带时间戳，只增不改）。 */
export interface AutonomySwitchRecord {
    /** 切换时间（ISO）。 */
    at: string;
    /** 切换前自治度。 */
    from: string;
    /** 切换后自治度。 */
    to: string;
}
/** createTask 参数（会话指针绑定归编排层，存储层不消费 contextKey）。 */
export interface CreateTaskParams {
    title: string;
    /** 任务模式（缺省 standard）；light 标记轻量任务，parent 标记容器任务。 */
    mode?: TaskModeValue;
    /** 任务自治度（缺省 manual）：manual/semi/auto，非法值 fail loud。 */
    autonomy?: AutonomyValue;
    /**
     * package 归属（config.packages 的键；可选——直调面不下沉必填，成员校验在
     * createTaskInternal 传入即查；executeCreateTask 层强制非空）。缺省落 null。
     */
    package?: string | null;
    /**
     * 显式 slug（缺省由标题 slugify 派生）：kebab-case、不超过 40 字符，且不得自带
     * MM-DD 日期前缀——目录名的日期段由 createTask 生成，违反任一条即返回 err。
     */
    slug?: string;
    parent?: string | null;
    priority?: TaskPriorityValue;
    description?: string;
}
/** createTask 结果。 */
export interface CreateTaskResult {
    taskRelPath: string;
    task: TaskRecord;
}
/** listTasks 参数。 */
export interface ListTasksParams {
    status?: TaskStatusValue;
    /** 是否追加枚举 archive/ 下的归档任务（缺省 false，只列活跃区）。 */
    includeArchived?: boolean;
}
/** @param value 未知异常 @returns 归一化 Error */
export declare function toError(value: unknown): Error;
/** @param error 未知异常 @returns 是否文件不存在 */
export declare function isEnoent(error: unknown): boolean;
