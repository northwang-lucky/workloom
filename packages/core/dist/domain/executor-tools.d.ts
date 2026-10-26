/** 执行器工具白名单组装（core 单一事实源，双 runtime 共用）。 */

/** DSH 原生工具候选名单（显式枚举，非模式；lsp_* 不入默认）。 */
export const NATIVE_TOOLS_DSH: readonly string[]

/** Pi 内置工具候选名单（read/bash/edit/write）。 */
export const NATIVE_TOOLS_PI: readonly string[]

/** tools 配置的最小形状（config 的 SubagentTools 投影）。 */
export interface AllowToolsConfig {
  /** 在默认白名单上额外补入的工具名（含尾缀 `*` 前缀模式）。 */
  includes?: string[]
  /** 从默认白名单上移除的工具名（含尾缀 `*` 前缀模式）。 */
  excludes?: string[]
}

/** buildAllowList 入参。 */
export interface BuildAllowListParams {
  /** runtime 名（dsh/pi；决定默认候选名单）。 */
  runtime: 'dsh' | 'pi'
  /** 该 kind 的 tools 配置（includes/excludes；缺省零行为）。 */
  toolsConfig?: AllowToolsConfig
  /** 运行时可见工具名集合（DSH schemas 全局视图 / Pi 理论工具集）。 */
  visibleNames: Iterable<string>
}

/**
 * 组装工具 allow 清单：默认候选名单 ± includes/excludes（支持尾缀 `*` 前缀
 * 模式，仅前缀匹配），与可见集求交（未知名/前缀静默忽略），去重、保序。
 */
export function buildAllowList(params: BuildAllowListParams): string[]
