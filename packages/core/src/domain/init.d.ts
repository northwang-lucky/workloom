/** workloom 初始化：init 模块的公共类型（供 JSDoc 引用，快照字段）。 */
export interface InitWorkloomParams {
  /** 开发者标识（写入 .workloom/.developer）。 */
  developer?: string
  /** 已存在 .workloom 时是否强制补建缺失项（不覆盖已有文件）。 */
  force?: boolean
}

/** 初始化结果。 */
export interface InitWorkloomResult {
  /** 项目根绝对路径。 */
  root: string
  /** 本次新创建的文件/目录相对路径（相对 root，按创建顺序）。 */
  created: string[]
  /** 开发者标识（.workloom/.developer 内容）。 */
  developer: string
  /** 向上检测到的旧 .trellis 项目根；无则 null。 */
  legacyTrellisRoot: string | null
}

/** 初始化 .workloom 骨架；已存在且非 force 时返回 err。 */
export function initWorkloom(
  root: string,
  params?: InitWorkloomParams,
): [Error | null, InitWorkloomResult | null]
