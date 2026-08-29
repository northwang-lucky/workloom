/**
 * adapter-dsh 的 executor 硬门禁：任务 in_progress 期间主会话禁止直接写业务文件。
 *
 * 设计意图：
 * - 契约层（workflow.md）约束「实现改走 workloom_execute」，此处提供第二道防线：
 *   DSH 工具管线 tools/pre-execute 是官方一级能力（deny 时工具 body 不执行，
 *   模型收到 isError 结果），全局订阅拦截主会话（delegationDepthOf === 0）的
 *   write/edit 调用，把「实现走子代理」从约定变成可靠行为；
 * - workloom_execute 派发的子代理（executor）在派发期间被登记为豁免（放行），
 *   subagent_fork/continuable 复用的子代理不被豁免，与主会话走同种约束，
 *   从而堵住「fork 子代理绕过主会话门禁」的通道（进程内 Set，按 child session id 索引）；
 * - 判定链任一环节不满足即放行：非写工具、无项目根、executor.gate 关闭、
 *   无活动任务或任务非 in_progress、目标路径不在工作目录（项目根）内、
 *   目标路径在 .workloom/ 内（任务自身录放行）；
 * - 判定基础设施故障（config/task 读取抛错等）只 console.warn 并放行：
 *   门禁是约束不是锁死，绝不能因拦截器自身故障阻塞会话；
 * - 已知边界：bash 工具内的写文件命令（cat >、sed -i 等）无法拦截，仍靠契约约束。
 */
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { delegationDepthOf } from '@deepseek-ai/dsh-subagent'
import type { PreToolDecision, ToolExecution } from '@deepseek-ai/dsh-tools'
import { isAbsolute, join, relative, resolve } from 'node:path'

import {
  findWorkloomRoot,
  listTasks,
  loadConfig,
  readTask,
  resolveActiveTask,
  TaskStatus,
  WORKLOOM_DIR,
} from '@workloom-ai/core'

import { CONTEXT_KEY_PREFIX } from './constants.js'

/** 拦截的写文件工具名（dsh-tool-fs 注册面：write/edit 是仅有的两个文件写面）。 */
const WRITE_TOOL_NAMES: ReadonlySet<string> = new Set(['write', 'edit'])

/** 拒绝文案（发给模型的运行时文案，英文）：说明拦截原因并给出两条出路。 */
const DENY_REASON =
  'This task is in_progress and the main session is not allowed to write files directly. ' +
  'Dispatch an implement subagent via the workloom_execute tool instead, ' +
  'or disable this gate by setting `executor.gate: false` in .workloom/config.yaml.'

/** 判定故障告警前缀（运行时文案，英文）。 */
const GATE_WARN_PREFIX = 'workloom: write gate skipped:'

/** 放行决策（判定链任一环节未命中时的公共返回值）。 */
const ALLOW: PreToolDecision = { kind: 'allow' }

/** 写门禁豁免注册表：键 = 子代理 session id（workloom_execute 派发期间有效）。 */
const EXEMPTIONS = new Set<string>()

/**
 * 登记一个可绕过写门禁的子代理（workloom_execute 派发者）。
 * 进程内注册表按子代理 session id 索引，幂等；start resolve 后立即调用，run 结算注销。
 * @param childSessionId 子代理 session id（run.id）
 */
export function registerWriteGateExemption(childSessionId: string): void {
  EXEMPTIONS.add(childSessionId)
}

/**
 * 注销一个写门禁豁免（子代理 run 结算后调用，成功失败均注销；幂等）。
 * @param childSessionId 子代理 session id（run.id）
 */
export function unregisterWriteGateExemption(childSessionId: string): void {
  EXEMPTIONS.delete(childSessionId)
}

/** write/edit 的最小参数形状（消费 dsh-tool-fs 的 file_path 参数）。 */
interface FileToolArgs {
  [key: string]: unknown
  file_path?: unknown
}

/** 硬门禁判定输入（工具调用中消费的子集）。 */
export interface WriteGateInput {
  /** 工具调用名（exec.name）。 */
  name: string
  /** 调用方 agent（exec.agent；缺失时防御放行）。 */
  agent?: Agent
  /** 目标路径参数（exec.arguments.file_path；缺失或类型异常时防御放行）。 */
  filePath?: unknown
}

/**
 * 判定一次工具调用是否应被门禁拒绝（判定链任一环节不满足即放行）：
 * 1. 工具名属于 {write, edit}（其余工具不拦）；
 * 2. 主会话（depth === 0）走独立判定链；子代理（depth >= 1）先查豁免
 *    （executor 派发者放行），未命中的 fork 绕行者走同种约束的变体判定链；
 * 3. agent cwd 能向上解析出 workloom 项目根；
 * 4. 配置 executor.gate === true（用户可显式关闭）；
 * 5. 存在 in_progress 任务（主会话跟随会话指针，子代理以项目内活动任务为准）；
 * 6. 目标路径不在工作目录（<root>）内；在 <root>/.workloom/ 内（任务自身录放行）。
 * 全部命中返回 deny；判定抛错由 registerGate 的订阅回调兜底（warn + 放行）。
 * @param input 判定输入
 * @returns 预执行决策（allow 或 deny）
 */
export function decideWriteGate(input: WriteGateInput): PreToolDecision {
  if (!WRITE_TOOL_NAMES.has(input.name)) return ALLOW
  const agent = input.agent
  if (agent === undefined) return ALLOW
  const depth = delegationDepthOf(agent)
  // 子代理（depth >= 1）：executor 派发者已登记豁免放行，非豁免（fork 绕行）走变体判定链。
  if (depth !== 0 && EXEMPTIONS.has(agent.id)) return ALLOW
  if (depth !== 0) return decideSubagentGate(input, agent)
  // 主会话（depth === 0）：沿用原判定链（跟随会话活动任务指针）。
  return decideMainSessionGate(input, agent)
}

/**
 * 主会话（depth === 0）判定链：跟随会话活动任务指针（行为与旧版等价）。
 * @param input 判定输入
 * @param agent 调用方 agent（depth === 0）
 * @returns 预执行决策（allow 或 deny）
 */
function decideMainSessionGate(input: WriteGateInput, agent: Agent): PreToolDecision {
  const cwd = agent.session.header.cwd
  if (cwd === undefined || cwd === '') return ALLOW
  const found = findWorkloomRoot(cwd)
  if (found === null) return ALLOW
  if (loadConfig(found.root).executor.gate !== true) return ALLOW
  const contextKey = `${CONTEXT_KEY_PREFIX}_${agent.id}`
  const [activeErr, taskRelPath] = resolveActiveTask(found.root, contextKey)
  if (activeErr !== null || taskRelPath === null) return ALLOW
  const [taskErr, task] = readTask(found.root, taskRelPath)
  if (taskErr !== null || task === null) return ALLOW
  if (task.status !== TaskStatus.IN_PROGRESS) return ALLOW
  return decideTarget(input, cwd, found.root)
}

/**
 * 非豁免子代理（depth >= 1，fork 绕行）判定链：以项目内 in_progress 任务为准，
 * 不依赖子代理自身的会话活动指针（fork 子代理可能不携带有效指针）。
 * @param input 判定输入
 * @param agent 调用方 agent（depth >= 1）
 * @returns 预执行决策（allow 或 deny）
 */
function decideSubagentGate(input: WriteGateInput, agent: Agent): PreToolDecision {
  const cwd = agent.session.header.cwd
  if (cwd === undefined || cwd === '') return ALLOW
  const found = findWorkloomRoot(cwd)
  if (found === null) return ALLOW
  if (loadConfig(found.root).executor.gate !== true) return ALLOW
  // 项目内存在 in_progress 任务（one-active-task 原则下至多一个；空/异常回收表放行）。
  const [listErr, tasks] = listTasks(found.root, { status: TaskStatus.IN_PROGRESS })
  if (listErr !== null || tasks === null || tasks.length === 0) return ALLOW
  return decideTarget(input, cwd, found.root)
}

/**
 * 目标路径校验（主会话与非豁免子代理共用）：非 string 放行 → 工作目录（root）外放行 →
 * .workloom/ 内放行 → deny。
 * @param input 判定输入
 * @param cwd 调用方 agent cwd（相对路径解析基准）
 * @param root 项目根（findWorkloomRoot 的结果）
 * @returns 预执行决策（allow 或 deny）
 */
function decideTarget(input: WriteGateInput, cwd: string, root: string): PreToolDecision {
  if (typeof input.filePath !== 'string' || input.filePath === '') return ALLOW
  const target = isAbsolute(input.filePath) ? input.filePath : resolve(cwd, input.filePath)
  // 工作目录（<root>）之外的路径一律放行；仅拦截 root 内、且不在 .workloom/ 下的目标。
  if (!isInside(root, target)) return ALLOW
  if (isInside(join(root, WORKLOOM_DIR), target)) return ALLOW
  return { kind: 'deny', reason: DENY_REASON }
}

/**
 * 注册全局硬门禁订阅（ctx 生命周期自动注销）。
 * 回调只做取数（exec.name/agent/arguments.file_path）与转调 decideWriteGate；
 * 判定抛错只告警并放行：门禁是约束不是锁死，绝不因拦截器故障阻塞会话。
 * @param ctx 插件上下文
 */
export function registerGate(ctx: Context): void {
  ctx.on(
    'tools/pre-execute',
    async (exec: ToolExecution, _next: () => Promise<PreToolDecision>) => {
      try {
        return decideWriteGate({
          name: exec.name,
          agent: exec.agent,
          filePath: (exec.arguments as FileToolArgs | undefined)?.file_path,
        })
      } catch (error) {
        console.warn(`${GATE_WARN_PREFIX} ${String(error)}`)
        return { kind: 'allow' }
      }
    },
  )
}

/**
 * 判断归一化后的目标绝对路径是否落在基准目录 base 内（含 base 本身）。
 * @param base 基准绝对路径（项目根或项目根下的目录，resolve 归一化）
 * @param target 目标绝对路径（resolve 归一化）
 * @returns 是否在 base 内
 */
function isInside(base: string, target: string): boolean {
  const rel = relative(base, target)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}
