import type { WorkloomConfig } from './config.d.ts'

/** guidelines 段累计字节上限。 */
export declare const MAX_GUIDELINES_BYTES: number

/** spec 索引收集结果（.workloom/spec/ 两级布局的折叠）。 */
export interface SpecIndexResult {
  /** 索引路径列表（.workloom 相对，按 (package, layer) 字典序）。 */
  indexes: string[]
  /** 因字节预算（MAX_GUIDELINES_BYTES）被截断的条数。 */
  truncated: number
}

/** 收集 spec 索引路径列表（同步）。 */
export declare function collectSpecIndexes(
  root: string,
  config: WorkloomConfig,
): [Error | null, SpecIndexResult | null]
