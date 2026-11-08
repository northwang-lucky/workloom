/**
 * state/confirm：PRD 与 PLAN 内容确认迁移（autonomy 决定人工或自动记录）。
 *
 * 设计意图：
 * - confirmPrd/confirmPlan 是 workloom_task_align confirm 的窄写口：只落确认
 *   凭据（passedAt/summary/source/autonomy 快照），PRD/PLAN 结构等前置校验归
 *   服务层（doc-review）；校验失败零写入；
 * - autonomy=auto（PLAN 含 semi）自动记录，summary 注明自动来源与人工可区分；
 *   manual 维持人工确认（summary 必填非空，source=user）；
 * - confirmPrd 在 aligning 阶段经迁移表推进到 planning（prd-confirmed 守卫对
 *   已写凭据的内存视图求值）；confirmPlan 前置 PRD 已确认，并硬拦
 *   plan-review-clean 守卫（与 autonomy 无关，不可 force）。
 */
import type { TaskView } from './view.ts';
/** 确认入口入参（manual 人工确认必填 summary；自动记录路径忽略入参 summary）。 */
export interface ConfirmEntryInput {
    summary?: string;
}
/** 确认记录来源（decision 5 审计字段：user 人工确认 / auto 自治度自动记录）。 */
export type ConfirmSource = 'user' | 'auto';
/**
 * PRD 确认迁移（workloom_task_align target=prd confirm 的窄写口）：
 * - autonomy=auto 自动记录（summary 注明自动来源，source=auto）；manual/semi
 *   维持人工确认（summary 必填非空，source=user）；记录均带 autonomy 快照；
 * - 任务处于 aligning 时经迁移表推进到 planning（prd-confirmed 守卫）；
 *   更晚阶段只刷新凭据不迁移（重复确认语义与旧记录口一致）；
 * - 校验失败零写入；PRD 结构等前置校验归服务层（doc-review）。
 * @param root 项目根
 * @param taskRelPath 任务目录相对 .workloom 的路径
 * @param entry 确认入参
 * @returns [err, view]
 */
export declare function confirmPrd(root: string, taskRelPath: string, entry: ConfirmEntryInput): [Error | null, TaskView | null];
/**
 * PLAN 确认迁移（workloom_task_align target=plan confirm 的窄写口）：
 * - 顺序前置：PRD 已确认；守卫含 plan-review-clean（Judger 评审零意见），
 *   与 autonomy 无关——auto 模式也先跑评审轨道到 clean 才自动记录；
 * - autonomy=semi/auto 自动记录（summary 注明自动来源，source=auto）；manual
 *   维持人工确认（summary 必填非空，source=user）；记录均带 autonomy 快照；
 * - PLAN 结构校验归服务层（doc-review），本口只落凭据；校验失败零写入。
 * @param root 项目根
 * @param taskRelPath 任务目录相对 .workloom 的路径
 * @param entry 确认入参
 * @returns [err, view]
 */
export declare function confirmPlan(root: string, taskRelPath: string, entry: ConfirmEntryInput): [Error | null, TaskView | null];
