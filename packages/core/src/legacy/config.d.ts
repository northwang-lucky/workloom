/** workloom 配置对象：loadConfig 的返回类型（快照字段，供 JSDoc 引用）。 */
export interface WorkloomConfig {
  sessionCommitMessage: string
  maxJournalLines: number
  sessionAutoCommit: boolean
  contextInjection: {
    maxFileBytes: number
    maxArtifactBytes: number
    maxTotalBytes: number
  }
  promptInjection: {
    skipKeyword: string
  }
  hooks: {
    afterCreate: string[]
    afterStart: string[]
    afterFinish: string[]
    afterArchive: string[]
  }
  packages: Record<string, { path: string; type?: string; git?: boolean }>
  defaultPackage: string | null
  subagents: Record<string, SubagentConfigEntry>
  executor: {
    /** 主会话直接写文件硬门禁（adapter-dsh tools/pre-execute），默认开启。 */
    gate: boolean
  }
}

/**
 * subagents 配置条目：model 支持 string（所有 runtime 同值）或按 runtime 取值的
 * map（如 `{ dsh: 'a/x', pi: 'b/y' }`）；map 的 key 为 runtime 名，不白名单。
 */
export interface SubagentConfigEntry {
  model?: string | Record<string, string>
  effort?: string
}

/** resolveSubagentDefaults 返回值中字段来源的标记。 */
export type SubagentDefaultSource = 'param' | 'config'

/** resolveSubagentDefaults 的返回形状：合并后的 effective 值与各字段来源。 */
export interface ResolveSubagentDefaultsResult {
  model?: string
  effort?: string
  sources: {
    model?: SubagentDefaultSource
    effort?: SubagentDefaultSource
  }
}

/** 内置默认配置。 */
export const DEFAULT_CONFIG: WorkloomConfig

/** 配置解析错误：携带字段路径。 */
export class WorkloomConfigError extends Error {
  constructor(field: string, reason: string)
  field: string
}

/**
 * 从项目根加载配置：config.yaml 起底，config.local.yaml 存在时深合并覆盖；
 * 两者均缺失时返回全默认。
 */
export function loadConfig(root: string): WorkloomConfig

/**
 * 合并 executor 子代理默认 model/effort：参数优先，未出现回退 subagents 配置；
 * model 的 map 形式按 runtime 取值，缺当前 runtime 的 key 抛 WorkloomConfigError。
 */
export function resolveSubagentDefaults(
  config: WorkloomConfig,
  kind: string,
  overrides: { model?: string; effort?: string },
  runtime?: string,
): ResolveSubagentDefaultsResult

/**
 * 拆分 model 字符串的 provider 前缀（按首个 `/`）；裸 id 返回不含 provider 的结果
 * （语义 = 按父会话 provider 解析）。
 */
export function splitProviderModel(model: string): { provider?: string; model: string }
