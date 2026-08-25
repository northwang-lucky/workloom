/**
 * adapter-pi 的 Extension 入口（jiti 直载，无需构建）。
 *
 * 组装顺序：命令、任务工具、executor 工具、步骤详情工具、会话注入。
 */

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'

import { registerCommands } from './commands.ts'
import { registerExecutorTool } from './executor.ts'
import { registerInjections } from './inject.ts'
import { registerJournalTool } from './journal-tool.ts'
import { registerStepsTool } from './skills-tool.ts'
import { registerTaskTools } from './tasks.ts'

/**
 * workloom Pi Package 工厂：注册命令、任务工具、executor 工具、步骤详情
 * 工具与会话注入。
 * @param pi Extension API
 */
export default function workloomExtension(pi: ExtensionAPI): void {
  registerCommands(pi)
  registerTaskTools(pi)
  registerExecutorTool(pi)
  registerStepsTool(pi)
  registerJournalTool(pi)
  registerInjections(pi)
}
