/**
 * adapter-pi 的 executor 工具（workloom_execute）：把 workloom 任务上下文
 * 组装成子代理首条 prompt，spawn RPC 常驻 child pi 派发（架构 R，见 design）。
 *
 * 设计意图：
 * - 按 kind 用 core 的 buildExecutorPrompt 组装上下文，spawn RPC child pi 派发；
 * - 默认后台派发（R1）：prompt 命令接受后立即返回 childId + receipt；
 *   完成报告经 customType `workloom-executor-report` 回投主会话；
 * - foreground: true 走前台阻塞链路，等 agent_end 直接返回终文（不回投）；
 * - 派发留痕（R4）：派发时刻写 dispatches（running + childId + 绑定）；
 *   settle 监听回填 completed/failed + 一行错误摘要；
 * - 子会话标题（R5）：child 以 `--name "[<KindLabel>] <title>"` 启动；
 * - 会话存储与孤儿回收（R6）：child 会话落 `<root>/.workloom/sessions/pi/`，
 *   主会话结束联动 SIGTERM 全部存活 child 并把未完成派发回填 failed；
 * - ctx.signal aborted 时发 `abort` 命令 + SIGTERM，settle 回填 failed；
 * - 不设 timeout（与 DSH 对齐）；child 用 --no-extensions，无 workloom_execute
 *   工具，天然禁止再派发（零再派发保证）；
 * - model/effort 未显式传入时回退到 subagents 配置（按 executor kind 取值）；
 *   返回文本尾部追加 receipt 行（生效 model/effort 及来源，可观测性）；
 * - 显式 model/effort 与 subagents 配置冲突时中断派发并返回提示文本（不派发）；
 *   force: true + reason 放行，覆盖记录写 task.json overrides、receipt 来源标注
 *   追加 (forced)（审计留痕，与 adapter-dsh 同口径）。
 *
 * 模块边界：本文件负责工具注册、上下文组装、冲突门、receipt 渲染；
 * 派发时序（spawn → get_state → prompt → settle）在 executor-dispatch.ts。
 */

import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import { Type, type Static } from 'typebox'

import {
  assertEffort,
  assertForceReason,
  assertKind,
  buildAllowList,
  buildConflictNotice,
  buildExecutorPrompt,
  buildExecutorReceipt,
  composeLocalDirectivesText,
  detectExecutorConflicts,
  ERR_PREFIX,
  evaluateStaleAlignmentGate,
  findWorkloomRoot,
  GATES,
  loadConfig,
  PARAM_DESCRIPTIONS,
  readTask,
  recordExecutorDispatch,
  recordExecutorOverride,
  recordGateOverride,
  resolveSubagentDefaults,
  resolveTaskRelPath,
  TOOL_DESCRIPTIONS,
  TOOL_NAMES,
  TOOL_SNIPPETS,
} from '@workloom-ai/core'
import type {
  DispatchRecordInput,
  ExecutorInjectionStats,
  ExecutorPromptResult,
  SubagentTools,
  WorkloomConfig,
} from '@workloom-ai/core'

import { contextKeyOf } from './constants.ts'
import { readMainModel } from './main-model.ts'
import { sessionsDir } from './pi-child-registry.ts'
import { dispatchChildPi } from './executor-dispatch.ts'
import {
  CONTINUE_REBIND_REJECT_TEXT,
  continueExecutor,
  locateContinueChildId,
} from './executor-continuation.ts'
import {
  buildTheoreticalTools,
  hasLspCapability,
  hasLspTools,
  PI_LSP_SOURCE,
} from './pi-tools.ts'

/** 工具参数 TypeBox schema（与 DSH 的参数语义一致）。 */
export const EXECUTOR_PARAMS = Type.Object({
  kind: Type.String({ description: PARAM_DESCRIPTIONS.kind }),
  taskPath: Type.Optional(Type.String({ description: PARAM_DESCRIPTIONS.taskPathExecutor })),
  model: Type.Optional(Type.String({ description: PARAM_DESCRIPTIONS.model })),
  effort: Type.Optional(Type.String({ description: PARAM_DESCRIPTIONS.effort })),
  // 语义标题必填（schema 拦截缺失/空白），Pi 子会话经 --name 生效。
  title: Type.String({ minLength: 1, description: PARAM_DESCRIPTIONS.titleExecutor }),
  prompt: Type.String({ description: PARAM_DESCRIPTIONS.prompt }),
  force: Type.Optional(Type.Boolean({ description: PARAM_DESCRIPTIONS.forceExecutor })),
  reason: Type.Optional(Type.String({ description: PARAM_DESCRIPTIONS.reasonExecutor })),
  // 前台阻塞开关（默认 false = 后台派发；true = 阻塞等 agent_end 终文）。
  foreground: Type.Optional(Type.Boolean({ description: PARAM_DESCRIPTIONS.foregroundExecutor })),
  // 续用同一 executor 会话（M2）：'latest' 或显式 childId；跨 kind 拒绝。
  continue_executor: Type.Optional(Type.String({ description: PARAM_DESCRIPTIONS.continueExecutor })),
  // 续接全量重注入开关（M2 默认关：续接只发增量指令；true = 恢复全量上下文注入）。
  reinject: Type.Optional(Type.Boolean({ description: PARAM_DESCRIPTIONS.reinjectExecutor })),
})

/** 当前 runtime 名（subagents.model map 形式的取值 key，与 core 的 runtime 参数对齐）。 */
const PI_RUNTIME = 'pi'

/** research 子代理的 write/edit 范围限定扩展（随包发布，-e 显式加载用绝对路径）。 */
const RESEARCH_SCOPE_EXTENSION = fileURLToPath(
  new URL('../assets/research-scope.ts', import.meta.url),
)

/** force 覆盖记录失败告警前缀（记录失败只 WARNING，不阻塞派发）。 */
const RECORD_WARN_PREFIX = `${ERR_PREFIX.executor}: WARNING: failed to record forced override:`

/** 来源标注追加 forced 标记的匹配模式（param/config/default 及 config 的 whenMain/fallback/legacy 细分）。 */
const FORCED_SOURCE_PATTERN = / \((param|config|default)(?:: [^)]*)?\)/g

/**
 * appendExecutorReceipt 的可选配置（入参收敛为对象，避免第 4 个位置参数）。
 */
export interface AppendExecutorReceiptOptions {
  /** force 放行时 true：来源标注追加 (forced) 标记（审计留痕）。 */
  forced?: boolean
  /** 注入统计（KB 一位小数 + 内联/截断/索引计数，同行追加；未传不渲染）。 */
  injection?: ExecutorInjectionStats
}

/**
 * 在子代理输出文本尾部追加 executor receipt 行（可观测性）。
 * 空输出时只返回 receipt 行本身。
 */
export function appendExecutorReceipt(
  text: string,
  effective: {
    model?: string
    effort?: string
    sources: { model?: 'param' | 'config'; effort?: 'param' | 'config' }
    configSources?: {
      model?: 'whenMain' | 'fallback' | 'legacy'
      effort?: 'whenMain' | 'fallback' | 'legacy'
    }
    whenMainValue?: string
  },
  options: AppendExecutorReceiptOptions = {},
): string {
  let receipt = buildExecutorReceipt({
    model: effective.model,
    modelSource: effective.sources.model,
    modelConfigSource: effective.configSources?.model,
    modelWhenMainValue: effective.whenMainValue,
    effort: effective.effort,
    effortSource: effective.sources.effort,
    effortConfigSource: effective.configSources?.effort,
    effortWhenMainValue: effective.whenMainValue,
    injection: options.injection,
  })
  if (options.forced === true) {
    receipt = receipt.replace(FORCED_SOURCE_PATTERN, (match) => match.replace(')', ', forced)'))
  }
  return text === '' ? receipt : `${text}\n\n${receipt}`
}

/** 冲突门判定结果：notice 非空表示中断派发；forced 表示 force 放行。 */
export interface ConflictGateResult {
  notice?: string
  forced: boolean
}

/**
 * 冲突门（纯函数）：显式 model/effort 与 subagents 配置冲突时判定放行路径。
 */
export function resolveConflictGate(
  config: WorkloomConfig,
  params: {
    kind: string
    model?: string
    effort?: string
    force?: boolean
    reason?: string
  },
  mainModel?: string,
): ConflictGateResult {
  const conflicts = detectExecutorConflicts(
    config,
    params.kind,
    { model: params.model, effort: params.effort },
    PI_RUNTIME,
    mainModel,
  )
  if (conflicts.length === 0) return { forced: false }
  if (params.force === true) {
    assertForceReason(params.force, params.reason)
    return { forced: true }
  }
  return { notice: buildConflictNotice(params.kind, conflicts), forced: false }
}

/**
 * 记录 force 放行的覆盖（副作用）：写入 task.json overrides；失败只 WARNING
 * 不阻塞派发。
 */
export function recordForcedOverride(
  root: string,
  taskRelPath: string,
  reason: string | undefined,
): void {
  const [recordErr] = recordExecutorOverride(root, taskRelPath, reason)
  if (recordErr !== null) {
    console.warn(`${RECORD_WARN_PREFIX} ${recordErr}`)
  }
}

/**
 * 记录一次派发调用实际绕过的全部 gate 覆盖（R14：每个实际绕过的 gate 独立留痕）。
 */
export function recordForceOverrides(
  root: string,
  taskRelPath: string,
  input: { conflictForced: boolean; staleMissing: boolean; reason: string },
): void {
  if (input.conflictForced) {
    recordForcedOverride(root, taskRelPath, input.reason)
  }
  if (input.staleMissing) {
    const [recordErr] = recordGateOverride(root, taskRelPath, GATES.STALE_ALIGN, input.reason)
    if (recordErr !== null) {
      console.warn(`${RECORD_WARN_PREFIX} ${recordErr}`)
    }
  }
}

/**
 * 注册 workloom_execute 工具。
 * @param pi Extension API
 */
export function registerExecutorTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: TOOL_NAMES.executor,
    label: 'Workloom Execute',
    description: TOOL_DESCRIPTIONS.executor,
    promptSnippet: TOOL_SNIPPETS.executor,
    parameters: EXECUTOR_PARAMS,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      return executeTool(pi, params, ctx)
    },
  })
}

/** 派发审计记录失败告警前缀（记录失败只 WARNING，不阻塞派发）。 */
const DISPATCH_WARN_PREFIX = `${ERR_PREFIX.executor}: WARNING: failed to record executor dispatch:`

/**
 * 记录一次 executor 派发（副作用）：写入 task.json dispatches；失败只 WARNING
 * 不阻塞派发（与 recordForcedOverride 同口径，审计增强不该拖垮执行链路）。
 * 派发时序已下沉到 executor-dispatch.ts，本函数保留供测试与 dispatch 模块共用。
 */
export function recordExecutorDispatchEntry(
  root: string,
  taskRelPath: string,
  entry: DispatchRecordInput,
): void {
  const [recordErr] = recordExecutorDispatch(root, taskRelPath, entry)
  if (recordErr !== null) {
    console.warn(`${DISPATCH_WARN_PREFIX} ${recordErr}`)
  }
}

/** 工具执行上下文最小形状（读 cwd/会话 id/取消信号/当前模型）。 */
interface ExecutorContextLike {
  cwd: string
  sessionManager: { getSessionId(): string }
  signal?: AbortSignal
  model?: { provider?: string; id?: string }
}

/** buildExecutorPromptWithPi 入参（executor 首条 prompt 组装所需上下文）。 */
export interface ExecutorPromptAssemblyParams {
  root: string
  taskRelPath: string
  kind: string
  userPrompt: string
}

/** buildExecutorPromptWithPi 结果（组装与工具面探测共用一次 hasLsp 结论）。 */
export interface PiExecutorPromptResult {
  hasLsp: boolean
  result: ExecutorPromptResult
}

/**
 * 组装 executor 首条 prompt（Pi 接线：本机片段 → core 组装）。
 */
export function buildExecutorPromptWithPi(
  params: ExecutorPromptAssemblyParams,
  hasLsp: boolean,
): [Error | null, PiExecutorPromptResult | null] {
  const [localErr, localDirectives] = composeLocalDirectivesText(params.root, params.kind)
  if (localErr !== null) return [localErr, null]
  const [promptErr, built] = buildExecutorPrompt({
    ...params,
    localDirectives,
    hasLsp,
  })
  if (promptErr || built === null) {
    return [
      promptErr ?? new Error(`${ERR_PREFIX.executor}: prompt assembly returned no result`),
      null,
    ]
  }
  return [null, { hasLsp, result: built }]
}

/**
 * 组装 Pi 的最终 allow 清单与 child LSP 结论（纯函数，可单测）。
 */
export function buildPiToolAllow(
  toolsConfig: SubagentTools | undefined,
  parentHasLsp: boolean,
): { allow: string[]; childHasLsp: boolean } {
  const allow = buildAllowList({
    runtime: 'pi',
    toolsConfig,
    visibleNames: buildTheoreticalTools(parentHasLsp),
  })
  return { allow, childHasLsp: hasLspTools(allow) }
}

/**
 * 工具执行入口。
 */
async function executeTool(
  pi: ExtensionAPI,
  params: Static<typeof EXECUTOR_PARAMS>,
  ctx: ExecutorContextLike,
): Promise<{ content: [{ type: 'text'; text: string }]; details: Record<string, unknown> }> {
  const cwd = ctx.cwd
  if (cwd === '') {
    throw new Error(
      `${ERR_PREFIX.executor}: cannot determine the working directory of this session`,
    )
  }
  const found = findWorkloomRoot(cwd)
  if (found === null) {
    throw new Error(
      `${ERR_PREFIX.executor}: no .workloom directory found (searched up from ${cwd})`,
    )
  }
  const root = found.root
  // 初始化会话存储目录。
  mkdirSync(sessionsDir(root), { recursive: true })
  // 合并子代理默认值。
  const config = loadConfig(root)
  const mainModel = readMainModel(ctx)
  const effective = resolveSubagentDefaults(
    config,
    params.kind,
    { model: params.model, effort: params.effort },
    PI_RUNTIME,
    mainModel,
  )
  assertEffort(effective.effort)
  assertKind(params.kind)
  // 冲突门。
  const gate = resolveConflictGate(config, params, mainModel)
  if (gate.notice !== undefined) {
    return {
      content: [{ type: 'text', text: gate.notice }],
      details: { kind: 'conflict', status: 'blocked' },
    }
  }
  const taskRelPath = resolveTaskRelPath(
    root,
    contextKeyOf(ctx.sessionManager.getSessionId()),
    params.taskPath,
    ERR_PREFIX.executor,
  )
  // stale alignment 门禁（R13）。
  const [staleTaskErr, staleTask] = readTask(root, taskRelPath)
  let staleMissing: string[] = []
  if (staleTaskErr !== null || staleTask === null) {
    console.warn(
      `${RECORD_WARN_PREFIX} ${staleTaskErr?.message ?? 'readTask returned no task'}`,
    )
  } else {
    staleMissing = evaluateStaleAlignmentGate(root, taskRelPath, staleTask)
    if (staleMissing.length > 0) {
      if (params.force !== true) {
        return {
          content: [
            {
              type: 'text',
              text: `${staleMissing.join('; ')} ` +
                '(pass force: true with a non-empty reason to bypass; the override is recorded in task.json overrides)',
            },
          ],
          details: { kind: 'stale_alignment', status: 'blocked' },
        }
      }
      assertForceReason(params.force, params.reason)
    }
  }
  recordForceOverrides(root, taskRelPath, {
    conflictForced: gate.forced,
    staleMissing: staleMissing.length > 0,
    reason: params.reason ?? '',
  })
  // 续用治理（design §8.1）：continue_executor 与 model/effort 同传一律 fail loud
  // ——子会话 model/effort 在派发时刻已绑定，续用无重绑接缝，静默丢弃会让回执谎报生效。
  if (
    params.continue_executor !== undefined &&
    (params.model !== undefined || params.effort !== undefined)
  ) {
    return {
      content: [{ type: 'text', text: `${ERR_PREFIX.executor}: ${CONTINUE_REBIND_REJECT_TEXT}` }],
      details: { kind: 'rebind', status: 'blocked' },
    }
  }
  // 工具面白名单链路。
  const parentHasLsp = hasLspCapability(pi)
  const allowInfo = buildPiToolAllow(effective.tools, parentHasLsp)
  // 组装 prompt。
  const [promptErr, piBuilt] = buildExecutorPromptWithPi(
    {
      root,
      taskRelPath,
      kind: params.kind,
      userPrompt: params.prompt,
    },
    allowInfo.childHasLsp,
  )
  if (promptErr || piBuilt === null) {
    throw promptErr ?? new Error(`${ERR_PREFIX.executor}: prompt assembly returned no result`)
  }
  const loadExtensions: string[] = []
  if (allowInfo.childHasLsp) loadExtensions.push(PI_LSP_SOURCE)
  if (params.kind === 'research') loadExtensions.push(RESEARCH_SCOPE_EXTENSION)
  // 续用（M2 continue_executor）：定位 → 三分支投递（存活 idle→prompt；存活
  // streaming→steer；不存活→--session 重启续接后 prompt）。
  if (params.continue_executor !== undefined) {
    const [locateErr, childId] = locateContinueChildId(
      root,
      taskRelPath,
      params.kind,
      params.continue_executor,
    )
    if (locateErr !== null) {
      return {
        content: [{ type: 'text', text: locateErr }],
        details: { kind: 'continue', status: 'blocked' },
      }
    }
    const reinject = params.reinject === true
    const result = await continueExecutor({
      pi,
      kind: params.kind,
      title: params.title,
      root,
      taskRelPath,
      model: effective.model,
      effort: effective.effort,
      tools: allowInfo.allow,
      loadExtensions,
      parentSessionId: ctx.sessionManager.getSessionId(),
      effective,
      gate,
      allowInfo,
      piBuilt,
      childId,
      incrementalPrompt: params.prompt,
      reinject,
      signal: ctx.signal,
    })
    return {
      content: [{ type: 'text', text: result.text }],
      details: { kind: 'background', childId: result.childId, status: 'running' },
    }
  }
  // 派发（委托 executor-dispatch.ts）。
  // rawModel/rawEffort = 用户显式传入的原始参数（审计来源判定）；
  // model/effort = 生效值（spawn --model/--thinking 用）。
  const foreground = params.foreground === true
  const result = await dispatchChildPi({
    pi,
    cwd,
    prompt: piBuilt.result.text,
    kind: params.kind,
    title: params.title,
    root,
    taskRelPath,
    rawModel: params.model,
    rawEffort: params.effort,
    model: effective.model,
    effort: effective.effort,
    tools: allowInfo.allow,
    loadExtensions,
    parentSessionId: ctx.sessionManager.getSessionId(),
    effective,
    gate,
    allowInfo,
    mainModel,
    piBuilt,
    signal: ctx.signal,
    foreground,
  })
  if (result.kind === 'background') {
    return {
      content: [{ type: 'text', text: result.text }],
      details: { kind: 'background', childId: result.childId, status: 'running' },
    }
  }
  return {
    content: [{ type: 'text', text: result.text }],
    details: { kind: 'foreground', status: 'completed' },
  }
}

// 导出供测试使用。
export const __test = {
  appendExecutorReceipt,
  resolveConflictGate,
  buildExecutorPromptWithPi,
  buildPiToolAllow,
}
