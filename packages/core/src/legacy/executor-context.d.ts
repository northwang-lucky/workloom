/** executor 上下文注入组装：buildExecutorPrompt 的入参、统计与结果类型。 */

/** effort 合法档位（low/medium/high/xhigh/max）。 */
export const EFFORT_LEVELS: readonly string[]

/** executor 类型枚举（research/implement/check/frontend）。 */
export const EXECUTOR_KINDS: Readonly<
  Record<'research' | 'implement' | 'check' | 'frontend', string>
>

/** 按 kind 的执行器纪律段正文（硬指令，注入于 userPrompt 之后、叶子契约段之前）。 */
export const EXECUTOR_CONTRACT_BY_KIND: Readonly<
  Record<'research' | 'implement' | 'check' | 'frontend', string>
>

/** 校验 effort 档位；undefined 通过；非法值抛 Error。 */
export function assertEffort(effort: string | undefined): void

/** 校验 executor kind；undefined 通过；非法值抛 Error。 */
export function assertKind(kind: string | undefined): void

/** jsonl 单条有效记录（有 file 字段的行）。 */
export interface JsonlEntry {
  file: string
  reason: string | undefined
  type: string | undefined
}

/** 解析 jsonl 全文为有效条目列表；坏行/无 file 非 seed 行抛错。 */
export function parseJsonlEntries(content: string, jsonlName: string): JsonlEntry[]

/** buildExecutorPrompt 入参。 */
export interface BuildExecutorPromptParams {
  /** 项目根（必须已是 findWorkloomRoot 的结果，不再向上查找）。 */
  root: string
  /** 任务目录相对 .workloom 的路径（如 tasks/08-24-demo）。 */
  taskRelPath: string
  /** executor 类型（research/implement/check/frontend）。 */
  kind: string
  /** 用户任务正文（拼在 prompt 末尾的 ## Task prompt 节）。 */
  userPrompt: string
}

/** 组装统计：内联/索引/截断计数。 */
export interface ExecutorPromptStats {
  /** 成功内联的文件块数（artifact 与 jsonl 引用文件合计）。 */
  filesInlined: number
  /** 以索引形式提供的条目数（目录条目与超总量预算降级条目）。 */
  filesIndexed: number
  /** 发生内容截断的次数（artifact 或文件按预算截断）。 */
  truncated: number
}

/** buildExecutorPrompt 成功结果。 */
export interface ExecutorPromptResult {
  /** 组装好的 prompt 全文。 */
  text: string
  /** 组装统计。 */
  stats: ExecutorPromptStats
}

/** 组装 executor 首条 prompt；jsonl 坏行等结构性故障返回 err。 */
export function buildExecutorPrompt(
  params: BuildExecutorPromptParams,
): [Error | null, ExecutorPromptResult | null]
