/** workloom 迁移：migrate 模块的公共类型（供 JSDoc 引用，快照字段）。 */
export interface MigrateLegacyTrellisParams {
  /** 迁移完成后是否删除旧 .trellis 目录（默认 false 保留）。 */
  deleteLegacy?: boolean
}

/** 迁移结果。 */
export interface MigrateLegacyTrellisResult {
  /** 成功迁移的顶层区域（相对项目根的目标路径，如 .workloom/tasks）。 */
  migrated: string[]
  /** 目标已存在而被跳过的条目（相对项目根的目标路径）。 */
  skipped: string[]
  /** 符号链接等无法迁移的条目（相对项目根的目标路径）。 */
  unsupported: string[]
  /** 旧 config.yaml 中被丢弃的未知字段名（如 channel/codex）。 */
  droppedConfigFields: string[]
  /** 存档的旧 workflow.md 相对路径；旧文件不存在时为 null。 */
  archivedWorkflow: string | null
  /** 是否已删除旧 .trellis 目录。 */
  legacyRemoved: boolean
  /** 旧 .trellis 所在项目根绝对路径。 */
  legacyRoot: string
}

/** 迁移旧 .trellis 项目到 .workloom；未检测到旧目录或未初始化时返回 err。 */
export function migrateLegacyTrellis(
  root: string,
  params?: MigrateLegacyTrellisParams,
): [Error | null, MigrateLegacyTrellisResult | null]
