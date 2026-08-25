/**
 * adapter-pi 的 executor 工具（workloom_execute）：把 workloom 任务上下文
 * 组装成子代理首条 prompt，spawn 独立 child pi 前台派发（不依赖
 * pi-subagents，见 ADR-0006）。
 *
 * 设计意图：
 * - 按 kind（research/implement/check）用 core 的 buildExecutorPrompt 组装
 *   上下文，spawn child pi（--mode json，参数组装见 pi-args）派发；
 * - stdout 逐行 JSONL 解析（pi-events 纯函数），收集 assistant 的 text 块，
 *   agent_end 判定完成；stderr 只留尾部（上限 4KB）供错误报告；
 * - ctx.signal aborted 时 kill('SIGTERM') 并以 AbortError 立即结束工具，
 *   不等待子进程退出；spawn 前已 aborted 直接抛（不发请求）；
 * - 不设 timeout（与 DSH 对齐）；child 用 --no-extensions，无 workloom_execute
 *   工具，天然禁止再派发。
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { createInterface } from 'node:readline'

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import { Type, type Static } from 'typebox'

import {
  assertEffort,
  assertKind,
  buildExecutorPrompt,
  ERR_PREFIX,
  findWorkloomRoot,
  PARAM_DESCRIPTIONS,
  resolveTaskRelPath,
  TOOL_DESCRIPTIONS,
  TOOL_NAMES,
} from '@workloom/core'

import { contextKeyOf } from './constants.ts'
import { buildChildPiArgs } from './pi-args.ts'
import { extractExecutorText, parsePiEventLine, type PiEventState } from './pi-events.ts'

/** 工具参数 TypeBox schema（与 DSH 的参数语义一致）。 */
const EXECUTOR_PARAMS = Type.Object({
  kind: Type.String({ description: PARAM_DESCRIPTIONS.kind }),
  taskPath: Type.Optional(Type.String({ description: PARAM_DESCRIPTIONS.taskPathExecutor })),
  model: Type.Optional(Type.String({ description: PARAM_DESCRIPTIONS.model })),
  effort: Type.Optional(Type.String({ description: PARAM_DESCRIPTIONS.effort })),
  prompt: Type.String({ description: PARAM_DESCRIPTIONS.prompt }),
})

/** stderr 尾部摘要上限（错误报告用，超限截断）。 */
const STDERR_TAIL_LIMIT = 4096

/** 取消时向 child pi 发送的终止信号。 */
const KILL_SIGNAL = 'SIGTERM'

/**
 * 注册 workloom_execute 工具。
 * @param pi Extension API
 */
export function registerExecutorTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: TOOL_NAMES.executor,
    label: 'Workloom Execute',
    description: TOOL_DESCRIPTIONS.executor,
    parameters: EXECUTOR_PARAMS,
    // 工具级 signal 与 ctx.signal 同源（工具执行期间 agent 处于 streaming），
    // 按 spec 统一走 ctx.signal 的 abort 通道。
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      return executeTool(params, ctx)
    },
  })
}

/** 工具执行上下文最小形状（读 cwd/会话 id/取消信号）。 */
interface ExecutorContextLike {
  cwd: string
  sessionManager: { getSessionId(): string }
  signal?: AbortSignal
}

/** 派发结果（最终文本 + 子进程 pid 作为 runId）。 */
interface DispatchResult {
  text: string
  runId: string
}

/**
 * 前台派发 executor 子代理并返回其输出文本。
 * @param params 工具参数（TypeBox 已校验）
 * @param ctx 工具执行上下文（cwd/会话 id/取消信号）
 * @returns AgentToolResult（content 文本 + details 运行信息）
 */
async function executeTool(
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
  // effort/kind 非法值 fail loud（core 校验），与 DSH 语义一致。
  assertEffort(params.effort)
  assertKind(params.kind)
  const taskRelPath = resolveTaskRelPath(
    root,
    contextKeyOf(ctx.sessionManager.getSessionId()),
    params.taskPath,
    ERR_PREFIX.executor,
  )
  const [promptErr, built] = buildExecutorPrompt({
    root,
    taskRelPath,
    kind: params.kind,
    userPrompt: params.prompt,
  })
  if (promptErr || built === null) {
    throw promptErr ?? new Error(`${ERR_PREFIX.executor}: prompt assembly returned no result`)
  }
  const result = await dispatchChildPi(
    { cwd, prompt: built.text, kind: params.kind, model: params.model, effort: params.effort },
    ctx.signal,
  )
  return {
    content: [{ type: 'text', text: result.text }],
    details: { kind: 'foreground', runId: result.runId, status: 'completed' },
  }
}

/**
 * spawn child pi 并等待其 JSONL 事件流完成，提取最终文本。
 * @param params 派发参数（prompt 为 buildExecutorPrompt 产物）
 * @param signal 取消信号（可选）
 * @returns 派发结果
 */
async function dispatchChildPi(
  params: { cwd: string; prompt: string; kind: string; model?: string; effort?: string },
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
