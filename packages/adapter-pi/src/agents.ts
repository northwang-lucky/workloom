/**
 * adapter-pi 的 executor agent 文件式运行时注册（pi-subagents 目录发现）。
 *
 * 设计意图（2026-08-26 真机实证修订）：
 * - pi-subagents 的 registerAgent 以 ExtensionAPI 对象身份做 WeakMap key，
 *   而 Pi 0.84.2 为每个扩展各建 API 对象（两扩展 pi 身份不同，已实证），
 *   跨扩展注册必然 miss（派发报 Unknown agent）。改用 pi-subagents 的
 *   user agents 目录（<agentDir>/agents/*.md）做运行时注册：执行器每次
 *   派发都重新扫描目录（懒扫描），写文件即生效；
 * - 文件幂等写入（内容相同跳过），返回 {written, skipped} 供测试与日志；
 * - 写文件失败 fail loud（严格依赖语义：executor 可用性的前提）。
 */

import { homedir } from 'node:os'
import { join } from 'node:path'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

import { EXECUTOR_KINDS } from '@workloom/core'

import { EXECUTOR_AGENT_DEFINITIONS } from './agent-definitions.ts'
import { AGENT_ERR_PREFIX } from './constants.ts'

/** 写文件的目录名（pi-subagents 的 user agents 发现路径）。 */
const AGENTS_DIR_NAME = 'agents'

/** 写文件结果（written 为本次实际写入，skipped 为内容未变跳过）。 */
export interface WriteAgentFilesResult {
  written: string[]
  skipped: string[]
}

/**
 * 解析 Pi 的 agent 目录根（对齐 pi-subagents 的 getAgentDir 语义：
 * PI_CODING_AGENT_DIR 环境变量覆盖，默认 ~/.pi/agent）。
 * @returns agent 目录根
 */
export function resolvePiAgentDir(): string {
  const configured = process.env.PI_CODING_AGENT_DIR
  if (configured === '~') return homedir()
  if (configured !== undefined && configured.startsWith('~/')) {
    return join(homedir(), configured.slice(2))
  }
  return configured || join(homedir(), '.pi', 'agent')
}

/**
 * 注册三个 executor agent：把定义写入 Pi 的 user agents 目录（文件式
 * 运行时注册，见文件头注释）。写失败直接向上抛（fail loud）。
 */
export function registerExecutorAgents(): void {
  writeExecutorAgentFiles(resolvePiAgentDir())
}

/**
 * 把三个 executor agent 定义写入 <agentDir>/agents/workloom-<kind>.md
 * （幂等：内容相同跳过）。
 * @param agentDir agent 目录根（resolvePiAgentDir 的结果，测试传临时目录）
 * @returns 写入结果
 */
export function writeExecutorAgentFiles(agentDir: string): WriteAgentFilesResult {
  const dir = join(agentDir, AGENTS_DIR_NAME)
  mkdirSync(dir, { recursive: true })
  const written: string[] = []
  const skipped: string[] = []
  for (const kind of Object.values(EXECUTOR_KINDS)) {
    const definition = EXECUTOR_AGENT_DEFINITIONS[kind]
    if (definition === undefined) {
      throw new Error(`${AGENT_ERR_PREFIX}: no agent definition for kind ${kind}`)
    }
    const filePath = join(dir, `workloom-${kind}.md`)
    const content = renderAgentFile(kind, definition)
    // 幂等判定：文件不存在（ENOENT）视为需写入；其余读错误 fail loud。
    let existing: string | null
    try {
      existing = readFileSync(filePath, 'utf8')
    } catch (error) {
      if (isEnoent(error)) {
        existing = null
      } else {
        throw new Error(`${AGENT_ERR_PREFIX}: failed to read ${filePath}: ${String(error)}`, {
          cause: error,
        })
      }
    }
    if (existing === content) {
      skipped.push(kind)
      continue
    }
    try {
      writeFileSync(filePath, content)
    } catch (error) {
      throw new Error(`${AGENT_ERR_PREFIX}: failed to write ${filePath}: ${String(error)}`, {
        cause: error,
      })
    }
    written.push(kind)
  }
  return { written, skipped }
}

/**
 * 渲染单个 agent 的 .md 文件：YAML frontmatter（必填 name/description +
 * 公共字段）+ 正文 systemPrompt。
 * @param kind executor 类型（agent 名）
 * @param definition agent 定义
 * @returns 文件全文
 */
function renderAgentFile(
  kind: string,
  definition: (typeof EXECUTOR_AGENT_DEFINITIONS)[string],
): string {
  const lines = ['---']
  lines.push(`name: ${yamlScalar(kind)}`)
  lines.push(`description: ${yamlScalar(definition.description)}`)
  lines.push(`maxSubagentDepth: ${String(definition.maxSubagentDepth ?? 1)}`)
  lines.push(`systemPromptMode: ${yamlScalar(definition.systemPromptMode ?? 'replace')}`)
  lines.push(`inheritProjectContext: ${String(definition.inheritProjectContext === true)}`)
  lines.push('---')
  lines.push('', definition.systemPrompt)
  return `${lines.join('\n')}\n`
}

/**
 * YAML 双引号标量序列化（仅转义双引号与反斜杠；输入均为英文短文本）。
 * @param value 标量值
 * @returns 带引号的 YAML 标量
 */
function yamlScalar(value: string): string {
  return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`
}

/** @param error 任意异常 @returns 是否文件不存在 */
function isEnoent(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | null)?.code === 'ENOENT'
}
