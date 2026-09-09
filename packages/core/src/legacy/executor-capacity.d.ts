/** executor 并发容量判定：evaluateExecutorCapacity 的入参、结果与 receipt 组装。 */

/** 单条 running executor 记录（在途执行器）。 */
export interface RunningExecutorRecord {
  /** 子代理唯一标识（同一 childId 多条记录合并占 1 槽）。 */
  childId: string
  /** executor 类型（research/implement/check/frontend）。 */
  kind: string
}

/** evaluateExecutorCapacity 入参。 */
export interface CapacityCheckParams {
  /** 本会话在途 executor 记录集合（不含本次待派发）。 */
  running: RunningExecutorRecord[]
  /** 本次派发的 executor 类型。 */
  kind: string
  /** 全局并发上限（0 = 不限）。 */
  globalLimit: number
  /**
   * 本次 kind 的并发上限（undefined = 该层不限，仅全局层闸生效；
   * 0 = 不限；> 0 = 该 kind 上限）。
   */
  kindLimit?: number
}

/** evaluateExecutorCapacity 结果。 */
export interface CapacityResult {
  /** 是否放行。 */
  allow: boolean
  /** 全局层在途数（唯一 childId 数）。 */
  globalCount: number
  /** 当前 kind 在途数（唯一 childId 数）。 */
  kindCount: number
  /** 全局上限（0 = 不限）。 */
  globalLimit: number
  /** 当前 kind 上限（undefined = 未配置，0 = 不限，> 0 = 上限）。 */
  kindLimit?: number
  /** 撞限层级（allow = true 时为 undefined）。 */
  layer?: 'global' | 'kind'
}

/**
 * 判定 executor 派发是否放行（纯函数，无状态）。
 * 先全局闸后 kind 闸，各自按 childId 去重计数；任一撞限即拒绝。
 */
export function evaluateExecutorCapacity(params: CapacityCheckParams): CapacityResult

/**
 * 组装 at capacity 失败回执文案（英文运行时文案）。
 * 撞 kind 闸：`<kind> kind at capacity (<kindCount>/<kindLimit>), global <globalCount>/<globalLimit>`；
 * 撞全局闸：`at capacity (<globalCount>/<globalLimit>)`。
 */
export function formatAtCapacityReceipt(kind: string, result: CapacityResult): string
