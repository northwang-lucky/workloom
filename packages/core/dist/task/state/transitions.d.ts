/**
 * state/transitions：三模式主线迁移表（唯一事实源）与守卫键值域。
 *
 * 设计意图：
 * - TRANSITIONS 是三模式主线允许迁移与守卫条件的冻结迁移表，条目为
 *   {mode, from, to, guards}；轨道值（casePhase/planReview）不入主线表，由
 *   tracks 的 recordCasePhase/recordPlanReview 各自携带合法边表；
 * - GUARD_KEYS 是守卫注册表（guards.ts）与迁移表共用的键值域单源；
 * - 本文件只持表与键，不持守卫实现（实现在 guards.ts）。
 */
import type { TaskModeValue, TaskStageValue } from './values.ts';
/** 守卫注册表键值域（守卫函数注册表在 guards.ts）。 */
export declare const GUARD_KEYS: readonly ["prd-confirmed", "plan-confirmed", "plan-review-clean", "start-ready", "check-ready", "archive-ready", "light-dispatch", "ui-dispatch-ready", "case-approved", "case-execution-ready", "case-outcome-ready", "children-archived", "integration-case-passed"];
/** 守卫键类型。 */
export type GuardKey = (typeof GUARD_KEYS)[number];
/** 主线迁移表条目：{mode, from, to, guards}（冻结数组，唯一事实源）。 */
export interface TaskTransition {
    mode: TaskModeValue;
    from: TaskStageValue;
    to: TaskStageValue;
    guards: readonly GuardKey[];
}
/**
 * 三模式主线迁移表：
 * - standard：aligning→planning→implementing→checking→archived；
 * - light：无 CASE 轨道，implementing 直达 archived（无 checking 边）；
 * - parent：aligning→planning→orchestrating→integrating→archived。
 * 归档出口边（每模式归档前各阶段直达 archived）：保留旧 archiveTask 的逃生
 * 语义——任意在档阶段可归档（archive-ready 拦截无 check 凭据，force 豁免留痕；
 * case-outcome-ready 硬拦 RESULT 不成立），任务做大的出口是做完或归档重建。
 * 轨道值不入本表；守卫实现在 GUARDS 注册表。
 */
export declare const TRANSITIONS: readonly TaskTransition[];
