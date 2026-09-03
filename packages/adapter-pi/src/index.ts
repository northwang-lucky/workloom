/**
 * adapter-pi 的 Extension 入口（jiti 直载，无需构建）。
 *
 * 组装顺序：命令、任务工具、executor 工具、步骤详情工具、会话注入。
 */

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'

import {
  assertWorkflowProtocolVersion,
  parseContract,
  WorkflowContractError,
} from '@workloom-ai/core'
import { loadWorkflowContractText } from '@workloom-ai/assets'

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
  // protocol 握手（R21）：任何注册副作用前解析 assets 契约并校验版本一致，不匹配 fail loud。
  assertLoadedWorkflowProtocol()
  registerCommands(pi)
  registerTaskTools(pi)
  registerExecutorTool(pi)
  registerStepsTool(pi)
  registerJournalTool(pi)
  registerInjections(pi)
}

/**
 * 解析 assets 工作流契约并在工厂入口校验 protocol version（fail loud）：
 * 契约缺失/解析失败/版本不匹配都在注册任何命令与工具前抛错。
 */
function assertLoadedWorkflowProtocol(): void {
  const text = loadWorkflowContractText()
  if (text === null) {
    throw new WorkflowContractError('asset', 'workflow contract asset is missing')
  }
  const [err, contract] = parseContract(text)
  if (err !== null || contract === null) {
    throw err ?? new WorkflowContractError('parse', 'workflow contract parse returned no contract')
  }
  assertWorkflowProtocolVersion(contract.version)
}
