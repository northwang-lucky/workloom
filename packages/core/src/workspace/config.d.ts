/** workloom 配置对象：loadConfig 的返回类型（快照字段，供 JSDoc 引用）。 */
export interface WorkloomConfig {
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
  packages: Record<string, { path: string; type?: string; git?: boolean; setup: string[] }>
  /** 全局 executor 并发闸：max_concurrent 为全局上限（0 = 不限，缺省 = 0；按角色分闸缺省 3，全局闸保留作可选总量保险）。 */
  executor: {
    maxConcurrent: number
  }
  /** worktree 生命周期（仅项目层）：start 建独立 worktree，archive 按 cleanup 模式清理。 */
  worktree: WorktreeConfig
  /** 按主会话模型分档的子代理配置（顺序即匹配顺序；空数组 = 不启用，角色键缺失继承宿主默认）。 */
  subagentProfiles: SubagentProfile[]
  /**
   * subagent_profiles 顶层 key 最后写入层（对象层看本层原始导出文档、工厂层看返回
   * 文档）；全程未出现时属性不定义、读取为 undefined（只读字段，loadConfig 挂载）。
   */
  readonly subagentProfilesSource?: ConfigSourceLayer
}

/** 配置来源层（subagent_profiles 顶层 key 最后写入层）。 */
export type ConfigSourceLayer = 'global' | 'project' | 'local'

/**
 * worktree 清理模式（archive 六模式）：merge-keep-branch 合并回 base + 删 worktree +
 * 保留分支；merge-delete-branch 再删分支；keep-branch 不合并只删 worktree；
 * manual 不动 worktree/分支；rebase-keep-branch 先把任务分支 rebase 到 base 之上
 * 再 ff 合入（线性历史）+ 删 worktree + 保留分支；rebase-delete-branch 再删分支。
 * 缺省 rebase-keep-branch。
 */
export type WorktreeCleanupMode =
  | 'merge-keep-branch'
  | 'merge-delete-branch'
  | 'keep-branch'
  | 'manual'
  | 'rebase-keep-branch'
  | 'rebase-delete-branch'

/** worktree 配置节（仅项目层，全局层出现报项目字段错误）。 */
export interface WorktreeConfig {
  /** start 是否为任务创建独立 git worktree（false = 全链路零行为变化）。 */
  enabled: boolean
  /** 分支名模板（占位符白名单 <task-id>/<task-slug>/<date>；渲染结果在 start 期校验）。 */
  branchTemplate: string
  /** archive 清理模式。 */
  cleanup: WorktreeCleanupMode
}

/**
 * subagent_profiles 条目：whenMain 为命中条件（完整 provider/model 字符串，
 * 归一化比较），缺省 = 兜底条目（无条件命中，最多一条）；
 * roles 为 角色键 → SubagentConfigEntry 的条目映射（用户 2026-11-08 裁定改名，
 * 原内层字段名 subagents 出现即抛错给 roles 迁移指引，不做兼容读；条目键命中
 * 旧 kind 五值时加载期一次性 WARNING）。
 */
export interface SubagentProfile {
  whenMain?: string
  roles: Record<string, SubagentConfigEntry>
}

/**
 * tools 字段（仅 subagent_profiles 内层支持）：在默认工具白名单上扩充 / 移除；
 * 成员为工具名或 `*` 尾缀前缀模式（如 `LSP 前缀模式`，仅前缀匹配），空数组合法、重复去重。
 */
export interface SubagentTools {
  /** 在默认白名单上额外补入的工具名（含前缀模式）。 */
  includes: string[]
  /** 从默认白名单上移除的工具名（含前缀模式）。 */
  excludes: string[]
}

/**
 * 失败转移链条目（配置字段 `fallback_models[]`，内存形态 camelCase）：
 * 主模型不可访问时按链顺序尝试；effort 省略即不传（用目标模型默认档位，
 * 避开 effort-compat 坑）。
 */
export interface SubagentFallbackModel {
  /** 模型字符串（provider/model 或裸 id；仅 string，不支持 runtime map）。 */
  model: string
  /** 该跳的 reasoning effort（可选；省略不传给子代理）。 */
  effort?: string
}

/**
 * subagent 配置条目（subagent_profiles 内层）：model 为 model 字符串
 * （provider/model 或裸 id）。
 */
export interface SubagentConfigEntry {
  model?: string
  effort?: string
  tools?: SubagentTools
  /**
   * 该角色的并发上限（0 = 不限；条目未配置时由 resolveSubagentDefaults 兜底缺省 3）。
   */
  maxConcurrent?: number
  /**
   * 失败转移链（配置字段 `fallback_models`）：空数组等价缺省（不落字段）。
   */
  fallbackModels?: SubagentFallbackModel[]
}

/** resolveSubagentDefaults 返回值中字段来源的标记。 */
export type SubagentDefaultSource = 'param' | 'config'

/** 配置侧字段来源细分：命中 subagent_profiles 的 whenMain 条目 / 兜底条目。 */
export type SubagentConfigSource = 'whenMain' | 'fallback'

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
    /** 失败转移链来源（未配置链时属性不定义）。 */
    fallbackModels?: SubagentConfigSource
  }
  /** configSources 为 whenMain 时的匹配值（receipt 展示用，如 kimi-coding/k3）。 */
  whenMainValue?: string
  /** 命中 subagent_profiles 条目该角色的 tools 字段（includes/excludes；未命中时 undefined）。 */
  tools?: SubagentTools
  /**
   * 该角色的并发上限：命中 subagent_profiles 条目时为该条目值（0 = 不限；
   * 未配置时兜底缺省 3），> 0 = 该角色上限。仅全局闸生效的场景不再出现。
   */
  maxConcurrent?: number
  /**
   * 生效的失败转移链（解析后的模型字符串 + 可选 effort）：subagent_profiles
   * 命中条目的 fallback_models；未配置时属性不定义。
   */
  fallbackModels?: SubagentFallbackModel[]
}

/** 内置默认配置。 */
export const DEFAULT_CONFIG: WorkloomConfig

/** 配置解析错误：携带字段路径。 */
export class WorkloomConfigError extends Error {
  constructor(field: string, reason: string)
  field: string
}

/**
 * 从项目根加载配置（三层流水线：全局 $HOME/.workloom/config → 项目
 * .workloom/config → 本地 .workloom/config.local）：对象层顶层 key 覆盖、
 * 函数工厂逐层传递、全局层白名单校验；根层级 subagents 已退役（任一层出现
 * 即抛 WorkloomConfigError 迁移指引）。options.homeDir 可覆盖全局层基准目录
 * （缺省 os.homedir()）。
 */
export function loadConfig(root: string, options?: { homeDir?: string }): WorkloomConfig

/**
 * 合并 executor 子代理默认 model/effort：显式参数优先，未出现回退
 * subagent_profiles 命中条目（按主会话模型匹配），全部缺失时 undefined
 * （继承宿主默认）。
 */
export function resolveSubagentDefaults(
  config: WorkloomConfig,
  role: string,
  overrides: { model?: string; effort?: string },
  mainModel?: string,
): ResolveSubagentDefaultsResult

/**
 * 拆分 model 字符串的 provider 前缀（按首个 `/`）；裸 id 返回不含 provider 的结果
 * （语义 = 按父会话 provider 解析）。
 */
export function splitProviderModel(model: string): { provider?: string; model: string }

/** executor 参数与 subagent_profiles 配置的冲突条目（detectExecutorConflicts 返回元素）。 */
export interface ExecutorConflict {
  /** 冲突字段（model/effort，独立判定）。 */
  field: 'model' | 'effort'
  /** 配置侧生效值。 */
  configured: string
  /** 工具显式传入值。 */
  passed: string
  /** 配置侧来源细分（whenMain 命中 / 兜底条目）。 */
  configuredSource?: SubagentConfigSource
  /** configuredSource 为 whenMain 时的匹配值（提示文案展示用）。 */
  whenMainValue?: string
}

/**
 * 检测显式 executor 参数与 subagent_profiles 配置的冲突：配置侧生效值按合并链
 * 解析（subagent_profiles 命中条目）；model 归一化（provider/model 各自相等）
 * 比较；无冲突返回空数组。
 */
export function detectExecutorConflicts(
  config: WorkloomConfig,
  role: string,
  overrides: { model?: string; effort?: string },
  mainModel?: string,
): ExecutorConflict[]

/** 组装冲突中断提示（英文运行时文案，含配置值/传入值与 force+reason 引导）。 */
export function buildConflictNotice(role: string, conflicts: ExecutorConflict[]): string

/** 校验 force 覆盖参数：force 为 true 时 reason 必须是非空字符串，否则抛错。 */
export function assertForceReason(force: unknown, reason: unknown): void

/** setup 占位符渲染值：worktree = worktree 根，sourceCheckout = package 所属仓主检出。 */
export interface SetupPlaceholderValues {
  worktree: string
  sourceCheckout: string
}

/** 按白名单渲染 setup 命令中的占位符（纯函数，token 之外原样保留）。 */
export function renderSetupCommand(command: string, values: SetupPlaceholderValues): string
