/**
 * 执行器工具白名单组装（runtime 无关单一事实源，纯函数，TypeScript）。
 *
 * 设计意图：
 * - 默认候选名单显式枚举（非模式）：DSH 为原生工具全集 − 全部 LSP 前缀模式；交互类
 *   （ask_user_question）、编排类（subagent 族 / workflow / ralph 族 /
 *   send_message / list_agents / interrupt_agent / create_goal / update_goal /
 *   exit_plan_mode）与任务工具（插件注册）均不入默认，机制层断根；
 * - LSP 前缀模式 默认不授，经 subagent_profiles 的 tools.includes 前缀模式补回；
 *   插件工具不入默认，同样经 includes 补入；
 * - buildAllowList 与运行时可见集求交：未知名/前缀静默忽略（restrict 传未知名
 *   会 fail），去重、保序（基集按原生声明顺序，includes 追加在后）。
 */

/** DSH 原生工具候选名单（显式枚举，非模式；顺序即保序基准）。 */
export const NATIVE_TOOLS_DSH: readonly string[] = Object.freeze([
  'read',
  'write',
  'edit',
  'bash',
  'glob',
  'grep',
  'read_image',
  'view_image',
  'todo_write',
  'job_output',
  'job_list',
  'job_kill',
  'web_search',
  'web_fetch',
  'skill',
])

/** 尾缀 `*` 前缀模式标记（仅前缀匹配，如 `LSP 前缀模式`）。 */
const PREFIX_SUFFIX = '*'

/** tools 配置的最小形状（config 的 SubagentTools 投影）。 */
export interface AllowToolsConfig {
  /** 在默认白名单上额外补入的工具名（含尾缀 `*` 前缀模式）。 */
  includes?: string[]
  /** 从默认白名单上移除的工具名（含尾缀 `*` 前缀模式）。 */
  excludes?: string[]
}

/** buildAllowList 入参。 */
export interface BuildAllowListParams {
  /** 该 kind 的 tools 配置（includes/excludes；缺省零行为）。 */
  toolsConfig?: AllowToolsConfig
  /** 运行时可见工具名集合（DSH schemas 父代理作用域视图）。 */
  visibleNames: Iterable<string>
}

/**
 * 组装执行器工具 allow 清单：基集 = DSH 原生候选 ∩ 可见集；includes 扩充 /
 * excludes 移除（均支持尾缀 `*` 前缀模式，仅前缀匹配）；与可见集求交（未知名/
 * 前缀静默忽略）；去重、保序（基集按原生声明顺序，includes 追加在后）。
 */
export function buildAllowList({ toolsConfig, visibleNames }: BuildAllowListParams): string[] {
  const visible = new Set(visibleNames)
  const includes = toolsConfig?.includes ?? []
  const excludes = toolsConfig?.excludes ?? []
  const result: string[] = []
  /** 去重追加工具名（已存在则跳过）。 */
  const add = (name: string): void => {
    if (!result.includes(name)) result.push(name)
  }
  // 基集：原生候选 ∩ 可见集（保持原生声明顺序；不可见候选静默忽略）。
  for (const name of NATIVE_TOOLS_DSH) {
    if (visible.has(name)) add(name)
  }
  // includes 扩充：精确名或前缀模式展开（均须落在可见集内；未知名静默忽略）。
  for (const pattern of includes) {
    if (pattern.endsWith(PREFIX_SUFFIX)) {
      const prefix = pattern.slice(0, -1)
      for (const name of visible) {
        if (name.startsWith(prefix)) add(name)
      }
    } else if (visible.has(pattern)) {
      add(pattern)
    }
  }
  // excludes 移除：精确名或前缀模式展开（未知名静默忽略）。
  if (excludes.length > 0) {
    const removed = new Set<string>()
    for (const pattern of excludes) {
      if (pattern.endsWith(PREFIX_SUFFIX)) {
        const prefix = pattern.slice(0, -1)
        for (const name of visible) {
          if (name.startsWith(prefix)) removed.add(name)
        }
      } else if (visible.has(pattern)) {
        removed.add(pattern)
      }
    }
    return result.filter((name) => !removed.has(name))
  }
  return result
}
