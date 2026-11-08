/**
 * state/view：任务视图与兼容读单点。
 *
 * 设计意图：
 * - readTaskView 是旧任务记录的兼容读单点：full 读作 standard、children 非空且
 *   mode 缺省或旧值兜底推断为 parent、stage 旧值按模式映射新枚举、completed 与
 *   归档路径读作 archived 视图（status 与 stage 双字段呈现一致）、planning 按
 *   确认记录推导 aligning 或 planning；未映射值报可判定错误，不静默默认；
 * - toTaskView 是纯函数映射（零 IO），供已解析记录的下游组装器复用；对视图入参
 *   幂等（isTaskView 判别后原样返回），防止扁平化轨道字段被二次映射；
 * - 物理读写在 task/storage（本文件只经其读取口做兼容映射）。
 */
import type { TaskRecordWithPath, TaskStatusValue } from '../storage/index.ts';
import type { AutonomyValue, CasePhaseValue, PlanReviewPhaseValue, TaskModeValue, TaskStageValue } from './values.ts';
/**
 * 任务视图（兼容读产物）：原始记录字段 + 映射后的模式/阶段/轨道/自治度。
 * status 由 stage 反推（archived ⇔ completed），保证归档态双字段呈现一致。
 */
export type TaskView = Omit<TaskRecordWithPath, 'mode' | 'stage' | 'status'> & {
    /** 呈现状态（由 stage 反推：planning/in_progress/completed）。 */
    status: TaskStatusValue;
    /** 兼容映射后的任务模式。 */
    mode: TaskModeValue;
    /** 兼容映射后的主线阶段。 */
    stage: TaskStageValue;
    /** CASE 轨道阶段（缺省 none）。 */
    casePhase: CasePhaseValue;
    /** PLAN 评审轨道阶段（缺省 none）。 */
    planReview: PlanReviewPhaseValue;
    /** PLAN 评审 revising 轮数（只记录不判定；缺省 0）。 */
    planReviewRevisions: number;
    /** 自治度（缺省 manual）。 */
    autonomy: AutonomyValue;
};
/**
 * 读取任务视图（兼容读单点）：task.json 缺失或损坏返回 err；
 * 未映射的 mode/stage/status/轨道/自治度值报可判定错误。
 * @param root 项目根
 * @param taskRelPath 任务目录相对 .workloom 的路径
 * @returns [err, view]
 */
export declare function readTaskView(root: string, taskRelPath: string): [Error | null, TaskView | null];
/**
 * 判定记录是否已是任务视图（兼容读产物）：下游组装器（回合缓存、注入链）会把
 * 视图再次喂给 toTaskView，判别后幂等返回，防止扁平化轨道字段被二次映射。
 * @param value 原始记录或视图
 * @returns 是否为任务视图
 */
export declare function isTaskView(value: TaskRecordWithPath): value is TaskView;
/**
 * 把原始记录映射为任务视图（纯函数，兼容读规则单点；零 IO，
 * 供已解析记录的下游组装器复用，不产生额外读盘；对视图入参幂等）。
 * @param record 结构化归一后的原始记录（或已映射的视图）
 * @param taskRelPath 任务目录相对 .workloom 的路径
 * @returns 任务视图
 */
export declare function toTaskView(record: TaskRecordWithPath, taskRelPath: string): TaskView;
/**
 * 由主线阶段反推呈现状态（归档态双字段一致：archived ⇔ completed）。
 * @param stage 主线阶段
 * @returns 呈现状态
 */
export declare function statusOfStage(stage: TaskStageValue): TaskStatusValue;
/** 判定任务相对路径是否位于归档区（tasks/archive/<YYYY-MM>/<name>）。 */
export declare function isArchivePath(taskRelPath: string): boolean;
