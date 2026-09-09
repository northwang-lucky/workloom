/**
 * adapter-dsh executor 的 prompt 组装：全量注入构建、注入统计投影、子会话标题装配。
 *
 * 设计意图：
 * - 与 executor.ts（工具注册与执行编排）分离：本模块只负责 prompt 相关的纯函数
 *   ——buildFullInjection 调 core buildExecutorPrompt 组装全量注入文本，
 *   injectionStats 投影注入统计供 receipt 渲染，buildChildLabel 装配子会话标题；
 * - 均为纯函数或只读副作用（buildChildLabel 的 readTask 回退），便于单测。
 */
import type { ExecutorInjectionStats, ExecutorPromptResult } from '@workloom-ai/core'
import { buildExecutorPrompt, ERR_PREFIX, readTask } from '@workloom-ai/core'

/** executor kind → 子会话标题展示标签（枚举，禁 Magic String）。 */
export const KIND_LABELS = {
  research: 'Research',
  implement: 'Implement',
  check: 'Check',
  frontend: 'Frontend',
} as const

/** KIND_LABELS 的键类型（assertKind 已保证 kind 合法，此处仅防御缺键）。 */
type KindLabelKey = keyof typeof KIND_LABELS

/**
 * 组装全量注入 prompt（新派发/reinject 续接共用）：本机片段已由调用方探测，此处
 * 调用 core buildExecutorPrompt；组装失败 fail loud。hasLsp 由调用方按可见工具集
 * 探测（交付时过滤纪律段 LSP 句）。
 * @param root 项目根
 * @param taskRelPath 任务目录相对 .workloom 的路径
 * @param kind executor 类型
 * @param userPrompt 用户任务正文
 * @param localDirectives 本机片段合成文本（已探测可用工具集）
 * @param hasLsp 目标环境是否具备 LSP 工具面
 * @returns 组装结果（text + stats）
 */
export function buildFullInjection(
  root: string,
  taskRelPath: string,
  kind: string,
  userPrompt: string,
  localDirectives: string,
  hasLsp: boolean,
): ExecutorPromptResult {
  const [promptErr, built] = buildExecutorPrompt({
    root,
    taskRelPath,
    kind,
    userPrompt,
    localDirectives,
    hasLsp,
  })
  if (promptErr !== null || built === null) {
    throw promptErr ?? new Error(`${ERR_PREFIX.executor}: prompt assembly returned no result`)
  }
  return built
}

/**
 * 从 buildExecutorPrompt 结果投影注入统计（receipt 渲染用）：总字节取注入文本长度
 * （KB 一位小数由 core 渲染），计数来自 stats——可见喂给子代理的上下文规模。
 * 指针模式无预算索引降级（indexed 恒 0）；jsonl/research 指针行计入 pointed；
 * toolsAllowed 为实际下发 allow 工具数（K，receipt 同行追加渲染）。
 * @param built buildExecutorPrompt 结果
 * @param toolsAllowed 实际下发 allow 工具数（可选）
 * @returns 注入统计五元组 + toolsAllowed
 */
export function injectionStats(built: ExecutorPromptResult, toolsAllowed?: number): ExecutorInjectionStats {
  return {
    bytes: Buffer.byteLength(built.text, 'utf8'),
    inlined: built.stats.filesInlined,
    truncated: built.stats.truncated,
    indexed: 0,
    pointed: built.stats.filesPointed,
    ...(toolsAllowed !== undefined ? { toolsAllowed } : {}),
  }
}

/**
 * 组装子会话标题：`[<KindLabel>] <title>`（title 为语义部分、不含前缀；缺省回退
 * task title，仍缺失/空白时整体回退 `workloom-<kind>`；标题仅供展示，不因任务
 * 元数据异常阻塞派发）。
 * @param root 项目根
 * @param taskRelPath 任务目录相对 .workloom 的路径
 * @param kind executor 类型（research/implement/check/frontend）
 * @param title 模型传入的语义标题（schema 必填非空；可选类型仅作纯函数防御回退）
 * @returns 子会话标题
 */
export function buildChildLabel(root: string, taskRelPath: string, kind: string, title?: string): string {
  const kindLabel = KIND_LABELS[kind as KindLabelKey]
  const semantic = title?.trim()
  if (kindLabel === undefined) {
    return `workloom-${kind}`
  }
  if (semantic !== undefined && semantic !== '') {
    return `[${kindLabel}] ${semantic}`
  }
  const [taskErr, task] = readTask(root, taskRelPath)
  const taskTitle = task?.title
  if (taskErr !== null || taskTitle === undefined || taskTitle.trim() === '') {
    return `workloom-${kind}`
  }
  return `[${kindLabel}] ${taskTitle}`
}
