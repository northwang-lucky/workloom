/**
 * adapter-pi 的 Extension 入口（jiti 直载，无需构建）。
 *
 * 组装顺序：命令、任务工具、executor 工具、executor agents（严格依赖，
 * 抛错直接向上抛）、步骤详情工具、会话注入。
 */

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'

import { registerExecutorAgents } from './agents.ts'
import { registerCommands } from './commands.ts'
import { registerExecutorTool } from './executor.ts'
import { registerInjections } from './inject.ts'
import { registerStepsTool } from './skills-tool.ts'
import { registerTaskTools } from './tasks.ts'

/**
 * workloom Pi Package 工厂：注册注入、命令、任务工具、executor 工具与
 * pi-subagents executor agents、步骤详情工具。
 * @param pi Extension API
 */
export default function workloomExtension(pi: ExtensionAPI): void {
  registerCommands(pi)
  registerTaskTools(pi)
  registerExecutorTool(pi)
  // 严格依赖 pi-subagents：registerAgent 抛错（重名/非法定义）直接向上抛，不静默降级。
  registerExecutorAgents(pi)
  registerStepsTool(pi)
  registerInjections(pi)
}
