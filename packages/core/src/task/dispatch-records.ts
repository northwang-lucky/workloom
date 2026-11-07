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

import { join } from 'node:path'

import { EXECUTOR_KINDS, isExecutorKind } from '../dispatch/executor-kinds.ts'
import { insideWorkloom } from '../workspace/locate.js'
import {
  CASE_FILES,
  CASE_PURPOSES,
  createCaseRecord,
  parseDocument,
  readIfExists,
} from './case-structure.ts'
import { CASE_PHASES, GATE_TOOL_NAMES, OVERRIDE_GATES, isLegalCasePhaseEdge } from './state-machine.ts'
import {
  requireProjectRoot,
  requireTaskRecord,
  writeTaskRecord,
} from './task-storage.ts'

import type {
  DispatchModelSource,
  DispatchRecord,
  DispatchStatus,
  GateOverride,
  GateValue,
  TaskRecord,
} from './task-storage.ts'
import type { CaseStructureIssue } from './case-structure.ts'
import type { CasePhaseValue } from './state-machine.ts'

/** 错误消息前缀。 */
const ERR_PREFIX = 'workloom task'

/**
 * 派发记录 model 绑定来源枚举值（dispatches[].modelSource 合法值域）。
 * 新派轮：param/whenMain/fallback/legacy/inherit/rotate（rotate = 同类并发轮换
 * 选中链条目起步）；转移跳：fallback；续派轮：spawn。
 */
export const DISPATCH_MODEL_SOURCES: Readonly<Record<string, DispatchModelSource>> = Object.freeze({
  PARAM: 'param',
  WHEN_MAIN: 'whenMain',
  FALLBACK: 'fallback',
  LEGACY: 'legacy',
  INHERIT: 'inherit',
  ROTATE: 'rotate',
  SPAWN: 'spawn',
})

/** DISPATCH_MODEL_SOURCES 取值集合（buildDispatchRecord 校验用）。 */
const DISPATCH_MODEL_SOURCE_SET = new Set<string>(Object.values(DISPATCH_MODEL_SOURCES))

/** 链式留痕 fallbackAttempt 的最小合法值（跳序号 1 = 首跳，不落字段故从 2 起）。 */
const MIN_FALLBACK_ATTEMPT = 2

/** recordExecutorDispatch 入参（at 由函数生成；绑定字段可选，续派轮传 spawn 语义值；
 *  status 可选，默认 'running'，失败派发留痕时传 'failed' + error）。 */
export type DispatchRecordInput = Pick<
  DispatchRecord,
  | 'kind'
  | 'title'
  | 'purpose'
  | 'childId'
  | 'model'
  | 'effort'
  | 'modelSource'
  | 'status'
  | 'toolsAllow'
  | 'fallbackOf'
  | 'fallbackAttempt'
> & { error?: string }

/** settleExecutorDispatch 回填入参（只改 status/error，不动 stage、不新增记录）。 */
export interface DispatchSettleInput {
  /** 关联的 continuable 子代理 id（与 dispatches 记录的 childId 匹配）。 */
  childId: string
  /** 终态：completed 或 failed。 */
  status: Exclude<DispatchStatus, 'running'>
  /** 失败一行摘要（仅 status=failed 时提供）。 */
  error?: string
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
export function recordExecutorDispatch(
  root: string,
  taskRelPath: string,
  entry: DispatchRecordInput,
): [Error | null] {
  try {
    recordExecutorDispatchInternal(root, taskRelPath, entry)
    return [null]
  } catch (error) {
    return [toError(error)]
  }
}

/**
 * 记录 executor 派发（初写，内部实现，失败抛错由外层转元组）。
 * @param root 项目根
 * @param taskRelPath 任务目录相对 .workloom 的路径
 * @param entry 派发条目
 */
function recordExecutorDispatchInternal(
  root: string,
  taskRelPath: string,
  entry: DispatchRecordInput,
): void {
  const projectRoot = requireProjectRoot(root)
  const task = requireTaskRecord(projectRoot, taskRelPath)
  task.dispatches.push(buildDispatchRecord(entry))
  // CASE 设计轮：首次派发创建 required=false 的记录并落 designSession；换新会话
  // 必须经 fallbackOf 链关联旧会话（防无链漂移），同 child 续用只覆盖为同值。
  if (entry.kind === EXECUTOR_KINDS.check && entry.purpose === CASE_PURPOSES.DESIGN) {
    task.case = createCaseRecord(task.case?.required === true, task.case)
    if (entry.childId !== undefined) {
      const previous = task.case.designSession
      if (previous !== null && previous !== entry.childId && entry.fallbackOf !== previous) {
        throw new Error(`${ERR_PREFIX}: a new CASE design session requires a fallbackOf link`)
      }
      task.case.designSession = entry.childId
    }
    // 轨道单点推进：首次设计派发 none→designing；返工重派保持原阶段（非合法边不动）。
    advanceCasePhase(task, CASE_PHASES.DESIGNING)
  } else if (entry.kind === EXECUTOR_KINDS.check) {
    // 执行派发（purpose 缺省 execution）单点推进：reviewing 经 approved 到 executing
    // （两条合法边一次跨过），approved 直达 executing；executing/done 保持不动
    // （失败转移与复跑不回退轨道）；none/designing 不推进（轨道须先经设计与复核，
    // checking 迁移的 case-approved 守卫负责拦截）。
    const phase = casePhaseOf(task)
    const reviewed = phase === CASE_PHASES.REVIEWING && isLegalCasePhaseEdge(phase, CASE_PHASES.APPROVED)
      ? CASE_PHASES.APPROVED
      : phase
    advanceCasePhase(task, CASE_PHASES.EXECUTING, reviewed)
  }
  writeTaskRecord(projectRoot, taskRelPath, task)
}

/** 读取记录的 CASE 轨道阶段（存储原值；缺失或非法值按 none 语义处理，不做推进）。 */
function casePhaseOf(task: TaskRecord): CasePhaseValue | string {
  const phase = task.case?.phase
  return typeof phase === 'string' && phase !== '' ? phase : CASE_PHASES.NONE
}

/**
 * 沿合法边把 case.phase 推进到目标阶段（内部单点）：from 缺省取记录当前阶段；
 * 边非法（含旧任务 none 直跳 executing）时不动轨道——派发审计仍落盘，
 * 主线拦截由 checking 迁移的 case-approved 守卫承担。
 */
function advanceCasePhase(task: TaskRecord, to: CasePhaseValue, from?: CasePhaseValue | string): void {
  const current = (from ?? casePhaseOf(task)) as CasePhaseValue
  if (!isLegalCasePhaseEdge(current, to)) return
  if (task.case === null) task.case = createCaseRecord(false, null)
  task.case = { ...task.case, phase: to }
}

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
export function settleExecutorDispatch(
  root: string,
  taskRelPath: string,
  entry: DispatchSettleInput,
): [Error | null] {
  try {
    settleExecutorDispatchInternal(root, taskRelPath, entry)
    return [null]
  } catch (error) {
    return [toError(error)]
  }
}

/**
 * 回填 executor 派发终态（内部实现，失败抛错由外层转元组）。
 * @param root 项目根
 * @param taskRelPath 任务目录相对 .workloom 的路径
 * @param entry 回填条目
 */
function settleExecutorDispatchInternal(
  root: string,
  taskRelPath: string,
  entry: DispatchSettleInput,
): void {
  const projectRoot = requireProjectRoot(root)
  const task = requireTaskRecord(projectRoot, taskRelPath)
  const settle = assertSettleEntry(entry)
  // 按 childId 关联最近一条 running 记录（同 childId 多轮派发时回填最新一轮）。
  for (let i = task.dispatches.length - 1; i >= 0; i--) {
    const record = task.dispatches[i]
    if (record === undefined || record === null || typeof record !== 'object') continue
    if (record.childId !== settle.childId) continue
    if (record.status !== 'running') continue
    record.status = settle.status
    if (settle.error !== undefined) {
      record.error = settle.error
    }
    // 结算推进 CASE 轨道（单点，dsh 无感知）：case-design 结算（completed）置
    // reviewing（设计产出交主会话复核）；执行轮结算且 RESULT 已 passed 置 done
    // （非合法边不动，RESULT 未成立时轨道停在 executing，由结果门禁拦截后续迁移）。
    if (settle.status === 'completed' && record.kind === EXECUTOR_KINDS.check) {
      const purpose = record.purpose ?? CASE_PURPOSES.EXECUTION
      if (purpose === CASE_PURPOSES.DESIGN) {
        advanceCasePhase(task, CASE_PHASES.REVIEWING)
      } else if (isResultPassed(projectRoot, taskRelPath)) {
        advanceCasePhase(task, CASE_PHASES.DONE)
      }
    }
    writeTaskRecord(projectRoot, taskRelPath, task)
    return
  }
  // 无匹配 running 记录：no-op（未知 childId / 已结算，静默跳过）。
}

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
export function appendDispatchErrorSuffix(
  root: string,
  taskRelPath: string,
  childId: string,
  suffix: string,
): [Error | null] {
  try {
    appendDispatchErrorSuffixInternal(root, taskRelPath, childId, suffix)
    return [null]
  } catch (error) {
    return [toError(error)]
  }
}

/**
 * 追加 failed 记录错误后缀（内部实现，失败抛错由外层转元组）。
 * @param root 项目根
 * @param taskRelPath 任务目录相对 .workloom 的路径
 * @param childId 关联的子代理会话 id
 * @param suffix 追加后缀
 */
function appendDispatchErrorSuffixInternal(
  root: string,
  taskRelPath: string,
  childId: string,
  suffix: string,
): void {
  if (typeof childId !== 'string' || childId.trim() === '') {
    throw new Error(`${ERR_PREFIX}: append error suffix requires a non-empty childId`)
  }
  if (typeof suffix !== 'string' || suffix.trim() === '') {
    throw new Error(`${ERR_PREFIX}: append error suffix requires a non-empty suffix`)
  }
  const projectRoot = requireProjectRoot(root)
  const task = requireTaskRecord(projectRoot, taskRelPath)
  // 从尾部向前找该 childId 最近一条 failed 记录（同 childId 可能多轮派发）。
  for (let i = task.dispatches.length - 1; i >= 0; i--) {
    const record = task.dispatches[i]
    if (record === undefined || record === null || typeof record !== 'object') continue
    if (record.childId !== childId) continue
    if (record.status !== 'failed') continue
    const current = typeof record.error === 'string' ? record.error : ''
    record.error = `${current}${suffix}`
    writeTaskRecord(projectRoot, taskRelPath, task)
    return
  }
  // 无匹配 failed 记录：no-op（任务已归档等场景由调用方只告警）。
}

/**
 * 校验并归一化回填条目（内部，fail loud）：childId 非空 string、status 为
 * completed/failed（拒绝 running——终态不回退到运行中）、error 可选非空 string。
 * @param entry 回填条目
 * @returns 校验后的条目
 */
function assertSettleEntry(entry: DispatchSettleInput): DispatchSettleInput {
  if (typeof entry !== 'object' || entry === null) {
    throw new Error(`${ERR_PREFIX}: settle entry must be an object`)
  }
  if (typeof entry.childId !== 'string' || entry.childId.trim() === '') {
    throw new Error(`${ERR_PREFIX}: settle entry childId must be a non-empty string`)
  }
  if (entry.status !== 'completed' && entry.status !== 'failed') {
    throw new Error(
      `${ERR_PREFIX}: settle entry status must be completed or failed (got ${String(entry.status)})`,
    )
  }
  const error = entry.error
  if (error !== undefined && (typeof error !== 'string' || error.trim() === '')) {
    throw new Error(`${ERR_PREFIX}: settle entry error must be a non-empty string when provided`)
  }
  return { childId: entry.childId, status: entry.status, ...(error !== undefined ? { error } : {}) }
}

/**
 * 组装派发审计记录（内部）：补 at（ISO 时间）与 status（默认 'running'），并校验
 * kind/title/childId/绑定字段（防御，fail loud）。绑定字段（model/effort/
 * modelSource）可选：新派轮由 adapter 传解析后生效值；续派轮传 spawn 语义值；
 * 不传时记录不带绑定字段（旧记录读取 undefined，不迁移）。status 可选，默认
 * 'running'；失败派发留痕时传 'failed' + error（spawn/get_state/prompt 失败路径）。
 * @param entry 输入
 * @returns 派发审计记录
 */
function buildDispatchRecord(entry: DispatchRecordInput): DispatchRecord {
  if (typeof entry !== 'object' || entry === null) {
    throw new Error(`${ERR_PREFIX}: dispatch entry must be an object`)
  }
  if (typeof entry.title !== 'string' || entry.title.trim() === '') {
    throw new Error(`${ERR_PREFIX}: dispatch entry title must be a non-empty string`)
  }
  if (!isExecutorKind(entry.kind)) {
    throw new Error(
      `${ERR_PREFIX}: invalid dispatch kind: ${String(entry.kind)} (must be one of ${Object.values(
        EXECUTOR_KINDS,
      ).join('/')})`,
    )
  }
  // purpose 可选（仅 check）：CASE 设计轮记录设计会话，最终执行轮运行已确认 CASE；
  // 其他 kind 携带 purpose 视为脏入参，fail loud。
  if (entry.purpose !== undefined) {
    if (entry.kind !== EXECUTOR_KINDS.check) {
      throw new Error(`${ERR_PREFIX}: dispatch purpose is only valid for check`)
    }
    if (!Object.values(CASE_PURPOSES).includes(entry.purpose)) {
      throw new Error(`${ERR_PREFIX}: invalid check purpose: ${String(entry.purpose)}`)
    }
  }
  // childId 可选：提供时必须是可用的 session id 形状（非空 string），否则 fail loud
  // （错误 childId 会污染续用定位依据，宁可拒绝记录）。
  if (entry.childId !== undefined) {
    if (typeof entry.childId !== 'string' || entry.childId.trim() === '') {
      throw new Error(`${ERR_PREFIX}: dispatch entry childId must be a non-empty string when provided`)
    }
  }
  // status 可选：提供时必须为 running/completed/failed 之一（终态不回退到 running）。
  if (entry.status !== undefined) {
    if (entry.status !== 'running' && entry.status !== 'completed' && entry.status !== 'failed') {
      throw new Error(
        `${ERR_PREFIX}: invalid dispatch status: ${String(entry.status)} ` +
          `(must be running/completed/failed)`,
      )
    }
  }
  // error 可选：提供时须为非空 string（仅 status=failed 时有意义）。
  if (entry.error !== undefined && (typeof entry.error !== 'string' || entry.error.trim() === '')) {
    throw new Error(`${ERR_PREFIX}: dispatch entry error must be a non-empty string when provided`)
  }
  // 绑定字段可选：model/effort 提供时须为非空 string（空值拒绝，审计不可留空）；
  // modelSource 提供时必须在枚举值域内（新派来源 + spawn），防止脏数据进审计面。
  if (entry.model !== undefined && (typeof entry.model !== 'string' || entry.model.trim() === '')) {
    throw new Error(`${ERR_PREFIX}: dispatch entry model must be a non-empty string when provided`)
  }
  if (entry.effort !== undefined && (typeof entry.effort !== 'string' || entry.effort.trim() === '')) {
    throw new Error(`${ERR_PREFIX}: dispatch entry effort must be a non-empty string when provided`)
  }
  if (entry.modelSource !== undefined && !DISPATCH_MODEL_SOURCE_SET.has(entry.modelSource)) {
    throw new Error(
      `${ERR_PREFIX}: invalid dispatch modelSource: ${String(entry.modelSource)} ` +
        `(must be one of ${Object.values(DISPATCH_MODEL_SOURCES).join('/')})`,
    )
  }
  // 链式留痕字段可选：fallbackOf 指向前一跳 childId（非空 string）；fallbackAttempt
  // 为本跳序号（首跳无字段，故提供时必须 >= 2 的整数）。
  if (
    entry.fallbackOf !== undefined &&
    (typeof entry.fallbackOf !== 'string' || entry.fallbackOf.trim() === '')
  ) {
    throw new Error(`${ERR_PREFIX}: dispatch entry fallbackOf must be a non-empty string when provided`)
  }
  if (
    entry.fallbackAttempt !== undefined &&
    (typeof entry.fallbackAttempt !== 'number' ||
      !Number.isInteger(entry.fallbackAttempt) ||
      entry.fallbackAttempt < MIN_FALLBACK_ATTEMPT)
  ) {
    throw new Error(
      `${ERR_PREFIX}: dispatch entry fallbackAttempt must be an integer >= ${MIN_FALLBACK_ATTEMPT} ` +
        'when provided (the first hop carries no field)',
    )
  }
  // toolsAllow 可选：提供时须为非空字符串数组（空数组合法但无意义，拒绝）；
  // 它决定冷恢复时重新施加的工具面，形状错误会让限制静默失效。
  if (entry.toolsAllow !== undefined) {
    if (!Array.isArray(entry.toolsAllow) || entry.toolsAllow.length === 0
      || entry.toolsAllow.some((name) => typeof name !== 'string' || name === '')) {
      throw new Error(`${ERR_PREFIX}: dispatch entry toolsAllow must be a non-empty array of tool names when provided`)
    }
  }
  const record: DispatchRecord = {
    kind: entry.kind,
    at: new Date().toISOString(),
    title: entry.title,
    // status 默认 running；失败派发留痕时显式传 'failed' + error。
    status: entry.status ?? 'running',
    // purpose 仅 check 记录（缺省 execution，兼容旧调用方）。
    ...(entry.kind === EXECUTOR_KINDS.check
      ? { purpose: entry.purpose ?? CASE_PURPOSES.EXECUTION }
      : {}),
    ...(entry.childId !== undefined ? { childId: entry.childId } : {}),
    ...(entry.model !== undefined ? { model: entry.model } : {}),
    ...(entry.effort !== undefined ? { effort: entry.effort } : {}),
    ...(entry.modelSource !== undefined ? { modelSource: entry.modelSource } : {}),
    ...(entry.fallbackOf !== undefined ? { fallbackOf: entry.fallbackOf } : {}),
    ...(entry.fallbackAttempt !== undefined ? { fallbackAttempt: entry.fallbackAttempt } : {}),
    ...(entry.toolsAllow !== undefined ? { toolsAllow: [...entry.toolsAllow] } : {}),
    ...(entry.error !== undefined ? { error: entry.error } : {}),
  }
  return record
}

/**
 * 记录 executor 参数覆盖（adapter 在 force 放行后调用）：向 task.json overrides
 * 追加 EXECUTOR_MODEL_EFFORT 条目（gate/tool/at/reason?，空串不记）。
 * 记录失败只返回 err（调用方 WARNING 不阻塞派发），不涉及状态迁移与 hooks。
 * @param root 项目根
 * @param taskRelPath 任务目录相对 .workloom 的路径
 * @param reason 覆盖原因（审计用）
 * @returns [err]
 */
export function recordExecutorOverride(
  root: string,
  taskRelPath: string,
  reason?: string,
): [Error | null] {
  return recordGateOverride(root, taskRelPath, OVERRIDE_GATES.EXECUTOR_MODEL_EFFORT, reason ?? '')
}

/**
 * 记录指定 gate 的 force 豁免（每个实际绕过的 gate 独立留痕；reason 必填非空）。
 * light_dispatch 等非 executor_model_effort 门禁的 force 审计由适配层调用。
 * @param root 项目根
 * @param taskRelPath 任务目录相对 .workloom 的路径
 * @param gate 被绕过的 gate
 * @param reason 覆盖原因（审计用）
 * @returns [err]
 */
export function recordGateOverride(
  root: string,
  taskRelPath: string,
  gate: GateValue,
  reason?: string,
): [Error | null] {
  try {
    // EXECUTOR_MODEL_EFFORT 等审计门在记录时校验：gate 值域外拒绝（防脏数据进审计面）。
    if (!Object.values(OVERRIDE_GATES).includes(gate)) {
      throw new Error(`${ERR_PREFIX}: invalid gate override: ${String(gate)}`)
    }
    const projectRoot = requireProjectRoot(root)
    const task = requireTaskRecord(projectRoot, taskRelPath)
    task.overrides.push(makeOverride(gate, reason))
    writeTaskRecord(projectRoot, taskRelPath, task)
    return [null]
  } catch (error) {
    return [toError(error)]
  }
}

/**
 * 组装一条 force 豁免记录（gate/tool/at/reason?，reason 空串不记；模块内函数
 * 不再导出，审计字面量单源在 state-machine 的 OVERRIDE_GATES 与 GATE_TOOL_NAMES）。
 * @param gate 卡点
 * @param reason 豁免原因（审计用）
 * @returns 豁免留痕条目
 */
function makeOverride(gate: GateValue, reason: string | undefined): GateOverride {
  return {
    gate,
    tool: GATE_TOOL_NAMES[gate],
    at: new Date().toISOString(),
    ...(typeof reason === 'string' && reason !== '' ? { reason } : {}),
  }
}

/**
 * 判定 case-result.md 的 front-matter status 是否 passed（内部；缺失或解析
 * 失败一律按未通过处理，只影响轨道推进不影响结算本身）。
 */
function isResultPassed(root: string, taskRelPath: string): boolean {
  const content = readIfExists(join(insideWorkloom(root, taskRelPath), CASE_FILES.result))
  if (content === null) return false
  const issues: CaseStructureIssue[] = []
  const parsed = parseDocument(content, 'result_probe', 'case-result.md is unreadable', issues)
  return parsed.meta !== null && parsed.meta.status === 'passed'
}

/** @param value 未知异常 @returns 归一化 Error */
function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value))
}
