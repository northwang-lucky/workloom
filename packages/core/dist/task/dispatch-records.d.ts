/**
 * dispatch-records：executor 派发记录、结算回填与 override 留痕（TypeScript，
 * 自旧 task-store 拆分）。
 *
 * 设计意图：
 * - 派发审计面（task.json dispatches 与 overrides）的写入口全部收敛在本模块：
 *   初写（running）、终态回填（completed/failed）、失败链后缀、force 豁免留痕
 *   与 executor 参数覆盖审计；记录失败只返回 err（调用方 WARNING 不阻塞派发）；
 * - EXECUTOR_MODEL_EFFORT 是审计门不入状态机守卫：在 recordExecutorOverride
 *   记录时校验（gate 值域防脏数据进审计面）；
 * - CASE 设计轮的 designSession 与 fallbackOf 链校验在初写口执行（防无链漂移）；
 * - CASE 轨道推进单点在本模块：case-design 派发置 designing、case-design 结算置
 *   reviewing、执行派发经合法边推进 approved 与 executing、执行结算且 RESULT
 *   passed 置 done（合法边表在 state-machine，dsh 侧无感知）；
 * - 模型 effort/model 绑定字段在记录时校验（审计不可留空、modelSource 值域封闭）；
 * - 任务读写经 task-storage 物理口，值域解释归 state-machine。
 */
import type { DispatchModelSource, DispatchRecord, DispatchStatus, GateValue } from './task-storage.ts';
/**
 * 派发记录 model 绑定来源枚举值（dispatches[].modelSource 合法值域）。
 * 新派轮：param/whenMain/fallback/legacy/inherit/rotate（rotate = 同类并发轮换
 * 选中链条目起步）；转移跳：fallback；续派轮：spawn。
 */
export declare const DISPATCH_MODEL_SOURCES: Readonly<Record<string, DispatchModelSource>>;
/** recordExecutorDispatch 入参（at 由函数生成；绑定字段可选，续派轮传 spawn 语义值；
 *  status 可选，默认 'running'，失败派发留痕时传 'failed' + error）。 */
export type DispatchRecordInput = Pick<DispatchRecord, 'kind' | 'title' | 'purpose' | 'childId' | 'model' | 'effort' | 'modelSource' | 'status' | 'toolsAllow' | 'fallbackOf' | 'fallbackAttempt'> & {
    error?: string;
};
/** settleExecutorDispatch 回填入参（只改 status/error，不动 stage、不新增记录）。 */
export interface DispatchSettleInput {
    /** 关联的 continuable 子代理 id（与 dispatches 记录的 childId 匹配）。 */
    childId: string;
    /** 终态：completed 或 failed。 */
    status: Exclude<DispatchStatus, 'running'>;
    /** 失败一行摘要（仅 status=failed 时提供）。 */
    error?: string;
}
/**
 * 记录一次 executor 派发（初写，派发时刻调用）：向 task.json dispatches 追加
 * { kind, at, title, childId?, status: 'running' } 条目（at 自动生成；childId 为
 * continuable 子代理的 durable session id，续用定位与终态回填关联的依据，旧记录缺省）。
 * 初写即记 running——即使后续未结算（子代理未回填）也留痕可见（失败派发在
 * task.json 可见）。终态由 settleExecutorDispatch 按 childId 回填 completed/failed，
 * 主会话不参与。记录失败只返回 err（调用方 WARNING 不阻塞派发）。
 * @param root 项目根
 * @param taskRelPath 任务目录相对 .workloom 的路径
 * @param entry 派发条目（kind/title/childId?，at 由函数生成）
 * @returns [err]
 */
export declare function recordExecutorDispatch(root: string, taskRelPath: string, entry: DispatchRecordInput): [Error | null];
/**
 * 回填一次 executor 派发的终态（adapter 监听 subagent/end 后调用）：按 childId
 * 关联 dispatches 中最近一条仍为 running 的记录，只改 status/error——不动 stage、
 * 不新增记录（不重复计数）。无匹配 running 记录时 no-op（返回成功，不报错：
 * 监听对非 workloom 子代理也会触发，未知 childId 静默跳过）。记录失败只返回 err。
 * @param root 项目根
 * @param taskRelPath 任务目录相对 .workloom 的路径
 * @param entry 回填条目（childId + status + error?）
 * @returns [err]
 */
export declare function settleExecutorDispatch(root: string, taskRelPath: string, entry: DispatchSettleInput): [Error | null];
/**
 * 向该 childId 最近一条 failed 记录的 error 行追加后缀（失败转移链穷尽留痕用）：
 * 只改 error 文本，不动 status/stage、不新增记录；无匹配 failed 记录时 no-op
 * （未知 childId / 已归档任务静默跳过）。后缀由调用方渲染，含前导空格（如
 * ` (fallback chain exhausted: m1 → m2)`），本函数原样拼接。读写失败返回 err
 * 元组，调用方只告警（与 settle 同一口径）。
 * @param root 项目根
 * @param taskRelPath 任务目录相对 .workloom 的路径
 * @param childId 关联的子代理会话 id
 * @param suffix 追加到 error 行的后缀（含前导空格）
 * @returns [err]
 */
export declare function appendDispatchErrorSuffix(root: string, taskRelPath: string, childId: string, suffix: string): [Error | null];
/**
 * 记录 executor 参数覆盖（adapter 在 force 放行后调用）：向 task.json overrides
 * 追加 EXECUTOR_MODEL_EFFORT 条目（gate/tool/at/reason?，空串不记）。
 * 记录失败只返回 err（调用方 WARNING 不阻塞派发），不涉及状态迁移与 hooks。
 * @param root 项目根
 * @param taskRelPath 任务目录相对 .workloom 的路径
 * @param reason 覆盖原因（审计用）
 * @returns [err]
 */
export declare function recordExecutorOverride(root: string, taskRelPath: string, reason?: string): [Error | null];
/**
 * 记录指定 gate 的 force 豁免（每个实际绕过的 gate 独立留痕；reason 必填非空）。
 * light_dispatch 等非 executor_model_effort 门禁的 force 审计由适配层调用。
 * @param root 项目根
 * @param taskRelPath 任务目录相对 .workloom 的路径
 * @param gate 被绕过的 gate
 * @param reason 覆盖原因（审计用）
 * @returns [err]
 */
export declare function recordGateOverride(root: string, taskRelPath: string, gate: GateValue, reason?: string): [Error | null];
