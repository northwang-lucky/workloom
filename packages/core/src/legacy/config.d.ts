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
}

/** 内置默认配置。 */
export const DEFAULT_CONFIG: WorkloomConfig

/** 配置解析错误：携带字段路径。 */
export class WorkloomConfigError extends Error {
  constructor(field: string, reason: string)
  field: string
}

/** 从项目根加载 .workloom/config.yaml；缺失时返回全默认。 */
export function loadConfig(root: string): WorkloomConfig
