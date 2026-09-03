/**
 * Pi runtime 的扩展能力探测与理论工具集（纯函数 + 实例探测封装，executor 与
 * inject 共用）。
 *
 * 设计意图：
 * - 事实依据（research 01/02）：--no-extensions 只关扩展自动发现，-e 显式加载
 *   仍生效；child pi 无 -e 时 LLM 工具严格为默认激活的 4 个内置工具；pi-lsp
 *   只注册 lsp_diagnostics / lsp_fix 两个工具（不注册 workloom 工具，不破坏
 *   child 零派发保证）；
 * - 探测时机在事件处理器/工具执行时（ExtensionAPI 的 action 在加载期是
 *   throwing stub，工厂顶层直接调用会抛错，research 03）；
 * - 理论工具集 = child 真实可见工具集的静态投影：命中时内置 4 ∪ pi-lsp 2，
 *   供派发工具面（-t allow 交集）消费；requiresTools 片段过滤机制已移除，
 *   本机片段三层注入不再依赖工具面（与 DSH 侧语义同步收敛）。
 */

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'

/** 关键探测工具名（pi-lsp 注册的其中一个工具；可见工具面含它即能力命中）。 */
const LSP_DIAGNOSTICS_TOOL = 'lsp_diagnostics'

/** child pi 内置激活工具（research 实证：--no-extensions 且无 -e 时默认激活 4 个）。 */
export const BUILTIN_CHILD_TOOLS = ['read', 'bash', 'edit', 'write'] as const

/** pi-lsp 注册的工具名（源码 registerTool 实证；lsp_diagnostics 与 DSH 侧同名）。 */
export const PI_LSP_TOOLS = [LSP_DIAGNOSTICS_TOOL, 'lsp_fix'] as const

/** pi-lsp 的 -e 加载源（npm spec；与 --no-extensions 并存合法，官方 CLI 语义）。 */
export const PI_LSP_SOURCE = 'npm:@narumitw/pi-lsp'

/**
 * 计算 executor child 的理论工具集（纯函数）：命中时内置 4 ∪ pi-lsp 2，
 * 未命中时只有内置 4（遗漏零行为）。
 * @param hasLsp 是否探测到 pi-lsp 的 lsp_diagnostics 能力
 * @returns 理论工具名列表（child 真实可见工具集的静态投影）
 */
export function buildTheoreticalTools(hasLsp: boolean): string[] {
  return hasLsp ? [...BUILTIN_CHILD_TOOLS, ...PI_LSP_TOOLS] : [...BUILTIN_CHILD_TOOLS]
}

/**
 * 判定 allow 清单是否含 pi-lsp 工具（lsp_diagnostics / lsp_fix 任一命中）：
 * child 是否实际具备 LSP 工具面，驱动 pi-lsp 的 -e 按需加载与纪律段 LSP 句过滤。
 * @param allow 最终下发的 allow 工具名清单
 * @returns allow 含任一 pi-lsp 工具时为 true
 */
export function hasLspTools(allow: readonly string[]): boolean {
  return allow.some((name) => (PI_LSP_TOOLS as readonly string[]).includes(name))
}

/**
 * 探测当前会话是否具备 pi-lsp 诊断能力（实例封装）。必须在事件处理器/工具
 * 执行时调用（扩展加载期 getActiveTools 是 throwing stub）。
 * @param pi Extension API
 * @returns 可见工具面含 lsp_diagnostics 时为 true
 */
export function hasLspCapability(pi: ExtensionAPI): boolean {
  return pi.getActiveTools().includes(LSP_DIAGNOSTICS_TOOL)
}