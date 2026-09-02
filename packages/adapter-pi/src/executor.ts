/**
 * adapter-pi 的 executor 工具（workloom_execute）：把 workloom 任务上下文
 * 组装成子代理首条 prompt，spawn 独立 child pi 前台派发（不依赖
 * pi-subagents，见 ADR-0006）。
 *
 * 设计意图：
 * - 按 kind（research/implement/check/frontend）用 core 的 buildExecutorPrompt 组装
 *   上下文，spawn child pi（--mode json，参数组装见 pi-args）派发；
 * - stdout 逐行 JSONL 解析（pi-events 纯函数），收集 assistant 的 text 块，
 *   agent_end 判定完成；stderr 只留尾部（上限 4KB）供错误报告；
 * - ctx.signal aborted 时 kill('SIGTERM') 并以 AbortError 立即结束工具，
 *   不等待子进程退出；spawn 前已 aborted 直接抛（不发请求）；
 * - 不设 timeout（与 DSH 对齐）；child 用 --no-extensions，无 workloom_execute
 *   工具，天然禁止再派发；
 * - model/effort 未显式传入时回退到 .workloom/config.yaml 的 subagents 配置
 *   （按 executor kind 取值，字段独立合并；model 支持 map 形式按 runtime 取值）；
 *   配置支持 subagent_profiles 按主会话当前模型（工具 ctx.model 的 provider/id）
 *   分档匹配，命中的条目优先于旧 subagents，经 --model / --thinking 透传；
 *   返回文本尾部追加 receipt 行（生效 model/effort 及来源，可观测性）；
 * - 显式 model/effort 与 subagents 配置冲突时中断派发并返回提示文本（不派发）；
 *   force: true + reason 放行，覆盖记录写 task.json overrides、receipt 来源标注
 *   追加 (forced)（审计留痕，与 adapter-dsh 同口径）。
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { createInterface } from 'node:readline'

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import { Type, type Static } from 'typebox'

import {
  assertEffort,
  assertForceReason,
  assertKind,
  buildConflictNotice,
  buildExecutorPrompt,
  buildExecutorReceipt,
  composeLocalDirectivesText,
  detectExecutorConflicts,
  ERR_PREFIX,
  findWorkloomRoot,
  loadConfig,
  PARAM_DESCRIPTIONS,
  recordExecutorDispatch,
  recordExecutorOverride,
  resolveSubagentDefaults,
  resolveTaskRelPath,
  TOOL_DESCRIPTIONS,
  TOOL_NAMES,
  TOOL_SNIPPETS,
} from '@workloom-ai/core'
import type { DispatchRecordInput, ExecutorPromptResult, WorkloomConfig } from '@workloom-ai/core'

import { contextKeyOf } from './constants.ts'
import { buildChildPiArgs } from './pi-args.ts'
import { extractExecutorText, parsePiEventLine, type PiEventState } from './pi-events.ts'
import { buildTheoreticalTools, hasLspCapability, PI_LSP_SOURCE } from './pi-tools.ts'

/** 工具参数 TypeBox schema（与 DSH 的参数语义一致）。 */
export const EXECUTOR_PARAMS = Type.Object({
  kind: Type.String({ description: PARAM_DESCRIPTIONS.kind }),
  taskPath: Type.Optional(Type.String({ description: PARAM_DESCRIPTIONS.taskPathExecutor })),
  model: Type.Optional(Type.String({ description: PARAM_DESCRIPTIONS.model })),
  effort: Type.Optional(Type.String({ description: PARAM_DESCRIPTIONS.effort })),
  // 语义标题必填（schema 拦截缺失/空白），仅 DSH 子会话生效：child pi 是 --no-session
  // 进程、无标题概念，接收但不消费。
  title: Type.String({ minLength: 1, description: PARAM_DESCRIPTIONS.titleExecutor }),
  prompt: Type.String({ description: PARAM_DESCRIPTIONS.prompt }),
  force: Type.Optional(Type.Boolean({ description: PARAM_DESCRIPTIONS.forceExecutor })),
  reason: Type.Optional(Type.String({ description: PARAM_DESCRIPTIONS.reasonExecutor })),
})

/** stderr 尾部摘要上限（错误报告用，超限截断）。 */
const STDERR_TAIL_LIMIT = 4096

/** 取消时向 child pi 发送的终止信号。 */
const KILL_SIGNAL = 'SIGTERM'

/** 当前 runtime 名（subagents.model map 形式的取值 key，与 core 的 runtime 参数对齐）。 */
const PI_RUNTIME = 'pi'

/** force 覆盖记录失败告警前缀（记录失败只 WARNING，不阻塞派发）。 */
const RECORD_WARN_PREFIX = `${ERR_PREFIX.executor}: WARNING: failed to record forced override:`

/** 派发审计记录失败告警前缀（记录失败只 WARNING，不阻塞派发）。 */
const DISPATCH_WARN_PREFIX = `${ERR_PREFIX.executor}: WARNING: failed to record executor dispatch:`

/** 来源标注追加 forced 标记的匹配模式（param/config/default 及 config 的 whenMain/fallback/legacy 细分）。 */
const FORCED_SOURCE_PATTERN = / \((param|config|default)(?:: [^)]*)?\)/g

/**
 * 在子代理输出文本尾部追加 executor receipt 行（可观测性）。
 * 空输出时只返回 receipt 行本身。
 * @param text 子代理原始输出文本
 * @param effective resolveSubagentDefaults 的返回值（含 sources 与配置来源细分）
 * @param forced force 放行时 true：来源标注追加 (forced) 标记（审计留痕）
 * @returns 带 receipt 的完整文本
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
  forced = false,
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
  })
  if (forced) {
    // 来源标注追加 (forced)：覆盖事实与来源（含 whenMain/fallback/legacy 细分）
    // 并存，审计一眼可辨（替换函数保留括号内原有内容）。
    receipt = receipt.replace(FORCED_SOURCE_PATTERN, (match) => match.replace(')', ', forced)'))
  }
  return text === '' ? receipt : `${text}\n\n${receipt}`
}

/** 冲突门判定结果：notice 非空表示中断派发；forced 表示 force 放行。 */
export interface ConflictGateResult {
  /** 中断提示文本（含配置值/传入值与 force+reason 用法）。 */
  notice?: string
  /** 是否 force 放行（调用方须记录覆盖并标注 receipt）。 */
  forced: boolean
}

/**
 * 冲突门（纯函数）：显式 model/effort 与 subagents 配置冲突时判定放行路径。
 * 配置侧生效值按合并链解析（subagent_profiles 命中条目 > 旧 subagents，按
 * 主会话模型匹配）。无冲突 → { forced: false }（现状路径）；冲突且未 force →
 * { notice }（不派发）；冲突且 force → 校验 reason（缺失抛错 fail loud）并
 * 放行。覆盖记录是副作用，由调用方在拿到 taskRelPath 后执行。
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
 * 不阻塞派发（留痕是审计增强，不该拖垮执行链路）。
 * @param root 项目根
 * @param taskRelPath 任务目录相对 .workloom 的路径
 * @param reason 覆盖原因（force 放行时必填，此处仅透传）
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
 * 记录一次 executor 派发成功（副作用）：写入 task.json dispatches；失败只 WARNING
 * 不阻塞派发（与 recordForcedOverride 同口径，审计增强不该拖垮执行链路）。
 * @param root 项目根
 * @param taskRelPath 任务目录相对 .workloom 的路径
 * @param entry 派发条目（kind/title，at 由 core 生成）
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
    // 工具级 signal 与 ctx.signal 同源（工具执行期间 agent 处于 streaming），
    // 按 spec 统一走 ctx.signal 的 abort 通道；pi 句柄传入执行路径供
    // 能力探测（getActiveTools 在工具执行期可安全调用）。
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      return executeTool(pi, params, ctx)
    },
  })
}

/** 工具执行上下文最小形状（读 cwd/会话 id/取消信号/当前模型）。 */
interface ExecutorContextLike {
  cwd: string
  sessionManager: { getSessionId(): string }
  signal?: AbortSignal
  /**
   * 当前会话模型（主模型来源；Pi ExtensionAPI 工具 ctx 的窄化形状，
   * 不引入 @earendil-works/pi-ai 的运行时类型依赖）。
   */
  model?: { provider?: string; id?: string }
}

/** 派发结果（最终文本 + 子进程 pid 作为 runId）。 */
interface DispatchResult {
  text: string
  runId: string
}

/** buildExecutorPromptWithPi 入参（executor 首条 prompt 组装所需上下文）。 */
export interface ExecutorPromptAssemblyParams {
  root: string
  taskRelPath: string
  kind: string
  userPrompt: string
}

/** buildExecutorPromptWithPi 结果（探测与组装共用一次探测）。 */
export interface PiExecutorPromptResult {
  /** 探测结论：能力命中时调用方应以 PI_LSP_SOURCE 追加 -e 加载。 */
  hasLsp: boolean
  /** core 组装结果（text + stats）。 */
  result: ExecutorPromptResult
}

/**
 * 组装 executor 首条 prompt（Pi 接线：探测 → 理论工具集 → 本机片段 → core
 * 组装）。探测在工具执行期进行（pi.getActiveTools 加载期是 throwing stub）；
 * 理论工具集命中时含 pi-lsp 两工具、requiresTools 片段注入，未命中时只有
 * 内置 4、片段被过滤（零行为）；本机片段组装失败 fail loud（本机片段是有意
 * 增强，静默失效最难排查），与 DSH executor 同口径。
 * @param pi Extension API（registerExecutorTool 持句柄，工具执行时传入）
 * @param params 组装入参
 * @returns [err, result]：与 core buildExecutorPrompt 同形，result 附带探测结论
 */
export function buildExecutorPromptWithPi(
  pi: ExtensionAPI,
  params: ExecutorPromptAssemblyParams,
): [Error | null, PiExecutorPromptResult | null] {
  const hasLsp = hasLspCapability(pi)
  const theoreticalTools = buildTheoreticalTools(hasLsp)
  const [localErr, localDirectives] = composeLocalDirectivesText(
    params.root,
    params.kind,
    theoreticalTools,
  )
  if (localErr !== null) return [localErr, null]
  const [promptErr, built] = buildExecutorPrompt({
    ...params,
    localDirectives,
  })
  if (promptErr || built === null) {
    return [promptErr ?? new Error(`${ERR_PREFIX.executor}: prompt assembly returned no result`), null]
  }
  return [null, { hasLsp, result: built }]
}

/**
 * 前台派发 executor 子代理并返回其输出文本。
 * @param pi Extension API（持句柄供能力探测，工具执行期传入）
 * @param params 工具参数（TypeBox 已校验）
 * @param ctx 工具执行上下文（cwd/会话 id/取消信号）
 * @returns AgentToolResult（content 文本 + details 运行信息）
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
  // 合并子代理默认值：工具参数优先，未出现回退到 subagent_profiles 命中条目
  // （按主会话当前模型匹配），再回退到 subagents 配置（字段独立合并）。
  // runtime=PI_RUNTIME 使 model 的 map 形式按 pi 取值（core 负责解析与缺 key 报错）。
  const config = loadConfig(root)
  const mainModel = readMainModel(ctx)
  const effective = resolveSubagentDefaults(
    config,
    params.kind,
    {
      model: params.model,
      effort: params.effort,
    },
    PI_RUNTIME,
    mainModel,
  )
  // effort/kind 非法值 fail loud（core 校验），与 DSH 语义一致。
  assertEffort(effective.effort)
  assertKind(params.kind)
  // 冲突门：显式参数与配置（按主模型合并后的生效值）不一致且未 force 时中断
  // 派发（返回提示文本，模型可附 force+reason 重试）；force 放行在拿到
  // taskRelPath 后记录覆盖。
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
  // force 放行留痕：记录失败只 WARNING 不阻塞派发（审计增强）。
  if (gate.forced) {
    recordForcedOverride(root, taskRelPath, params.reason)
  }
  // 探测 → 组装一次完成（buildExecutorPromptWithPi 内部先 hasLspCapability
  // 再以理论工具集组装本机片段）；结果同时驱动 -e 加载（命中时 child 携带
  // pi-lsp，使 requiresTools: [lsp_diagnostics] 片段在 child 真正可用）。
  const [promptErr, piBuilt] = buildExecutorPromptWithPi(pi, {
    root,
    taskRelPath,
    kind: params.kind,
    userPrompt: params.prompt,
  })
  if (promptErr || piBuilt === null) {
    throw promptErr ?? new Error(`${ERR_PREFIX.executor}: prompt assembly returned no result`)
  }
  const result = await dispatchChildPi(
    {
      cwd,
      prompt: piBuilt.result.text,
      kind: params.kind,
      model: effective.model,
      effort: effective.effort,
      loadExtensions: piBuilt.hasLsp ? [PI_LSP_SOURCE] : undefined,
    },
    ctx.signal,
  )
  // 派发成功（dispatchChildPi 正常返回）：记录派发审计（+1 条 dispatches）。
  // 记录失败仅告警不阻塞结果（审计增强，不留痕不拖垮执行链路）。
  recordExecutorDispatchEntry(root, taskRelPath, { kind: params.kind, title: params.title })
  // 尾部追加 receipt 行：生效 model/effort 及来源（force 放行时标注 (forced)）。
  const textWithReceipt = appendExecutorReceipt(result.text, effective, gate.forced)
  return {
    content: [{ type: 'text', text: textWithReceipt }],
    details: { kind: 'foreground', runId: result.runId, status: 'completed' },
  }
}

/**
 * 读取主会话当前模型（"provider/model" 字符串）：取自工具上下文 ctx.model；
 * provider/id 任一缺失或为空串时返回 undefined（视为取不到：subagent_profiles
 * 的全部 whenMain 条目跳过，走兜底/旧 subagents，不 fail loud）。
 * @param ctx 工具执行上下文（model 为可选字段，旧宿主缺失时 undefined）
 * @returns 主模型标识或 undefined
 */
function readMainModel(ctx: ExecutorContextLike): string | undefined {
  const provider = ctx.model?.provider
  const id = ctx.model?.id
  // provider/id 缺失或为空串均按「无值」处理：空串拼出的 "/" 会在 core 的
  // whenMain 匹配（splitProviderModel）时抛错，必须排除（设计口径：取不到
  // 主模型时 whenMain 全部跳过，不 fail loud）。
  if (provider === undefined || provider === '' || id === undefined || id === '') {
    return undefined
  }
  return `${provider}/${id}`
}

/**
 * spawn child pi 并等待其 JSONL 事件流完成，提取最终文本。
 * @param params 派发参数（prompt 为 buildExecutorPrompt 产物；loadExtensions
 *   为能力命中时显式加载的扩展源，缺省不加载）
 * @param signal 取消信号（可选）
 * @returns 派发结果
 */
async function dispatchChildPi(
  params: {
    cwd: string
    prompt: string
    kind: string
    model?: string
    effort?: string
    loadExtensions?: string[]
  },
  signal: AbortSignal | undefined,
): Promise<DispatchResult> {
  if (signal?.aborted === true) {
    throw new Error(`${ERR_PREFIX.executor}: executor dispatch aborted before start`)
  }
  // params 含多余的 cwd 字段，TS 结构类型允许整体传入（buildChildPiArgs 只消费其声明字段）。
  const args = buildChildPiArgs(params)
  // PI_BIN 便于测试/自定位 pi 路径；默认取 PATH 上的 pi。
  const child = spawn(process.env.PI_BIN ?? 'pi', args, {
    cwd: params.cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  return await waitForChildOutput(child, signal)
}

/**
 * 等待子进程结束并解析其输出：stdout 逐行喂解析器，stderr 只留尾部；
 * child close（stdio 全部关闭）后按 done 判定成功/失败；signal aborted
 * 时 kill('SIGTERM') 并以 AbortError 立即结束（不等待 exit）。
 * @param child 已 spawn 的 child pi
 * @param signal 取消信号（可选）
 * @returns 派发结果
 */
function waitForChildOutput(
  child: ChildProcess,
  signal: AbortSignal | undefined,
): Promise<DispatchResult> {
  return new Promise((resolve, reject) => {
    const state: PiEventState = { textParts: [], done: false }
    const stderrParts: string[] = []
    let settled = false
    const settle = (finish: () => void): void => {
      if (settled) return
      settled = true
      signal?.removeEventListener('abort', onAbort)
      finish()
    }
    const onAbort = () => {
      child.kill(KILL_SIGNAL)
      settle(() => reject(abortError()))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    // stdio 明确为 pipe，null 分支仅为类型收窄（防御）。
    const stdout = child.stdout
    const stderr = child.stderr
    if (stdout === null || stderr === null) {
      child.kill(KILL_SIGNAL)
      settle(() =>
        reject(new Error(`${ERR_PREFIX.executor}: child pi stdio pipes are unavailable`)),
      )
      return
    }
    stderr.on('data', (chunk: Buffer | string) => {
      stderrParts.push(typeof chunk === 'string' ? chunk : chunk.toString('utf8'))
    })
    // 'line' 逐行同步回调；close（stdio 关闭）时全部行已喂完，state 完整。
    createInterface({ input: stdout }).on('line', (line) => parsePiEventLine(line, state))
    child.on('error', (error) => {
      settle(() =>
        reject(
          new Error(`${ERR_PREFIX.executor}: failed to spawn child pi: ${error.message}`, {
            cause: error,
          }),
        ),
      )
    })
    child.on('close', (code, signalCode) => {
      const runId = String(child.pid ?? 0)
      if (state.done) {
        settle(() => resolve({ text: extractExecutorText(state.textParts), runId }))
      } else {
        settle(() => reject(exitError(code, signalCode, stderrParts.join(''))))
      }
    })
  })
}

/**
 * 组装「child pi 异常退出」错误：退出状态 + stderr 尾部摘要（无 stderr 时
 * 省略摘要）。
 * @param code 退出码（null 表示被信号终止）
 * @param signalCode 终止信号（可能为 null）
 * @param stderrTail stderr 全文（join 后截尾）
 * @returns 错误对象
 */
function exitError(
  code: number | null,
  signalCode: NodeJS.Signals | null,
  stderrTail: string,
): Error {
  const status = code !== null ? `code ${code}` : `signal ${signalCode ?? 'unknown'}`
  const head = `${ERR_PREFIX.executor}: child pi exited with ${status}`
  const tail = stderrTail.slice(-STDERR_TAIL_LIMIT)
  return new Error(tail === '' ? head : `${head}: ${tail}`)
}

/**
 * 组装取消错误（AbortError 命名，工具管线按 name 识别取消）。
 * @returns 取消错误
 */
function abortError(): Error {
  const error = new Error(`${ERR_PREFIX.executor}: executor dispatch aborted`)
  error.name = 'AbortError'
  return error
}
