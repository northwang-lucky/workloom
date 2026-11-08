/** executor 并发容量判定：evaluateExecutorCapacity 的入参、结果与 receipt 组装。 */

/** 单条 running executor 记录（在途执行器）。 */
export interface RunningExecutorRecord {
  /** 子代理唯一标识（同一 childId 多条记录合并占 1 槽）。 */
  childId: string
  /** executor 角色（researcher/developer/frontend-developer/checker/judger；过渡期兼容旧 kind 值，判定两侧归一）。 */
  role: string
  /**
   * 该 child 绑定的模型 label（同类并发轮换的占用统计用；容量判定不读该字段，
   * 容量语义零变化）。读不到（无登记 / 旧记录无 model）时缺省 undefined。
   */
  model?: string
}

/** evaluateExecutorCapacity 入参。 */
export interface CapacityCheckParams {
  /** 本会话在途 executor 记录集合（不含本次待派发）。 */
  running: RunningExecutorRecord[]
  /** 本次派发的 executor 角色。 */
  role: string
  /** 全局并发上限（0 = 不限）。 */
  globalLimit: number
  /**
   * 本次角色的并发上限（undefined = 该层不限，仅全局层闸生效；
   * 0 = 不限；> 0 = 该角色上限）。
   */
  roleLimit?: number
}

/** evaluateExecutorCapacity 结果。 */
export interface CapacityResult {
  /** 是否放行。 */
  allow: boolean
  /** 全局层在途数（唯一 childId 数）。 */
  globalCount: number
  /** 当前角色在途数（唯一 childId 数）。 */
  roleCount: number
  /** 全局上限（0 = 不限）。 */
  globalLimit: number
  /** 当前角色上限（undefined = 未配置，0 = 不限，> 0 = 上限）。 */
  roleLimit?: number
  /** 撞限层级（allow = true 时为 undefined）。 */
  layer?: 'global' | 'role'
}

/**
 * 判定 executor 派发是否放行（纯函数，无状态）。
 * 先全局闸后角色闸，各自按 childId 去重计数；任一撞限即拒绝。
 */
export function evaluateExecutorCapacity(params: CapacityCheckParams): CapacityResult

/**
 * 组装 at capacity 失败回执文案（英文运行时文案）。
 * 撞角色闸且 globalLimit > 0：`<role> role at capacity (<roleCount>/<roleLimit>), global <globalCount>/<globalLimit>`；
 * 撞角色闸且 globalLimit = 0（全局不限，省略 global 段）：`<role> role at capacity (<roleCount>/<roleLimit>)`；
 * 撞全局闸：`at capacity (<globalCount>/<globalLimit>)`。
 */
export function formatAtCapacityReceipt(role: string, result: CapacityResult): string
