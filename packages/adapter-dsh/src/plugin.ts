/**
 * adapter-dsh 的 Cordis 插件：点 7 起填充——自激活检测、命令注册、
 * systemPrompt 注入、skills 注册、executor 工具。点 1 仅提供可组合骨架。
 * 注意：ctx 类型在接入真实 @deepseek-ai/cordis（devDependencies）前先用占位。
 */
export const name = 'workloom-dsh'

export const inject = [] as const

export function apply(_ctx: unknown): void {
  // 点 7 起实现
}
