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
  /** 按主会话模型分档的子代理配置（顺序即匹配顺序；空数组 = 不启用，仅旧 subagents 生效）。 */
  subagentProfiles: SubagentProfile[]
}

/**
 * subagent_profiles 条目：whenMain 为命中条件（string 对所有 runtime 同值，
 * 或按 runtime 取值的 map），缺省 = 兜底条目（无条件命中，最多一条）；
 * subagents 沿用 SubagentConfigEntry 的 per-kind 形态。
 */
export interface SubagentProfile {
  whenMain?: string | Record<string, string>
  subagents: Record<string, SubagentConfigEntry>
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

/** 配置侧字段来源细分：命中 subagent_profiles 的 whenMain 条目 / 兜底条目 / 旧 subagents。 */
export type SubagentConfigSource = 'whenMain' | 'fallback' | 'legacy'

/** resolveSubagentDefaults 的返回形状：合并后的 effective 值与各字段来源。 */
export interface ResolveSubagentDefaultsResult {
  model?: string
  effort?: string
  sources: {
    model?: SubagentDefaultSource
    effort?: SubagentDefaultSource
  }
  /** 配置侧字段来源细分（字段级；来自显式参数或未生效时为 undefined）。 */
  configSources: {
    model?: SubagentConfigSource
    effort?: SubagentConfigSource
  }
  /** configSources 为 whenMain 时的匹配值（receipt 展示用，如 kimi-coding/k3）。 */
  whenMainValue?: string
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
 * 合并 executor 子代理默认 model/effort：参数优先，未出现回退 subagent_profiles
 * 命中条目（按主会话模型匹配），再回退旧 subagents 配置；model 的 map 形式按
 * runtime 取值，缺当前 runtime 的 key 抛 WorkloomConfigError。
 */
export function resolveSubagentDefaults(
  config: WorkloomConfig,
  kind: string,
  overrides: { model?: string; effort?: string },
  runtime?: string,
  mainModel?: string,
): ResolveSubagentDefaultsResult

/**
 * 拆分 model 字符串的 provider 前缀（按首个 `/`）；裸 id 返回不含 provider 的结果
 * （语义 = 按父会话 provider 解析）。
 */
export function splitProviderModel(model: string): { provider?: string; model: string }

/** executor 参数与 subagents 配置的冲突条目（detectExecutorConflicts 返回元素）。 */
export interface ExecutorConflict {
  /** 冲突字段（model/effort，独立判定）。 */
  field: 'model' | 'effort'
  /** 配置侧生效值（map 形式已按 runtime 解析）。 */
  configured: string
  /** 工具显式传入值。 */
  passed: string
  /** 配置侧来源细分（whenMain 命中 / 兜底条目 / 旧 subagents）。 */
  configuredSource?: SubagentConfigSource
  /** configuredSource 为 whenMain 时的匹配值（提示文案展示用）。 */
  whenMainValue?: string
}

/**
 * 检测显式 executor 参数与 subagents 配置的冲突：配置侧生效值按合并链解析
 * （profile 命中条目 > 旧 subagents）；model 归一化（provider/model 各自相等）
 * 比较；无冲突返回空数组。
 */
export function detectExecutorConflicts(
  config: WorkloomConfig,
  kind: string,
  overrides: { model?: string; effort?: string },
  runtime?: string,
  mainModel?: string,
): ExecutorConflict[]

/** 组装冲突中断提示（英文运行时文案，含配置值/传入值与 force+reason 引导）。 */
export function buildConflictNotice(kind: string, conflicts: ExecutorConflict[]): string

/** 校验 force 覆盖参数：force 为 true 时 reason 必须是非空字符串，否则抛错。 */
export function assertForceReason(force: unknown, reason: unknown): void
