/**
 * adapter-dsh 的 skills 注册与步骤详情工具（新增抽象，TypeScript）。
 *
 * 设计意图：
 * - parseSkillFrontmatter：极简 front-matter 解析器（本地纯函数，不引 yaml），
 *   只认 name/description/whenToUse 三个键（未知键如 license/source 忽略，
 *   兼容 vendored skills），name/description 必填，缺任一返回 err；
 * - registerSkills：把 assets 包内的 4 个 SKILL.md（自有 brainstorm + 三个
 *   vendored mattpocock skills）注册进 ctx.skills；任一 skill 缺失/解析失败/
 *   注册抛错都只 console.warn 跳过，skill 注册失败不阻塞插件；
 * - registerStepsTool：暴露 workloom_step 工具，按 stepId 从工作流契约返回
 *   步骤详情（未找到抛英文 Error，由 DSH 工具管线转失败结果）；
 * - skills/tools 服务按注册面做局部结构化声明（参考 executor.ts 风格），
 *   运行时由宿主注入（plugin.ts 的 inject 已声明硬依赖）。
 */

import { dirname, join } from 'node:path'

import type { Context } from '@deepseek-ai/cordis'

import {
  ERR_PREFIX as SURFACE_ERR_PREFIX,
  lookupWorkflowStep,
  PARAM_DESCRIPTIONS,
  TOOL_DESCRIPTIONS,
  TOOL_NAMES,
} from '@workloom-ai/core'
import { ASSETS_ROOT, loadWorkflowContractText, readAssetText } from '@workloom-ai/assets'

/** 错误消息前缀（运行时文案英文）。 */
const ERR_PREFIX = 'workloom skill'

/** front-matter 分隔行（与工作流契约解析一致）。 */
const FRONT_MATTER_DELIMITER = '---'

/** 允许的 front-matter 键（其余键忽略，兼容 vendored skills 的 license/source）。 */
const ALLOWED_KEYS = new Set(['name', 'description', 'whenToUse'])

/** 必填键（缺失任一 → 解析失败）。 */
const REQUIRED_KEYS = ['name', 'description'] as const

/** 注册的 skill 资源（相对 assets 包根；resourceBase 取其所在目录）。 */
const SKILL_ASSETS = [
  'skills/workloom-brainstorm/SKILL.md',
  'third-party/mattpocock-skills/tdd/SKILL.md',
  'third-party/mattpocock-skills/grilling/SKILL.md',
  'third-party/mattpocock-skills/writing-for-agents/SKILL.md',
] as const

/** skill 注册跳过告警前缀（运行时文案英文）。 */
const SKILL_WARN_PREFIX = `${ERR_PREFIX}: registration skipped:`

/** 纯文本块最小形状（render 与返回值共用）。 */
interface TextBlockLike {
  type: 'text'
  text: string
}

/** 解析出的 skill front-matter（body 为分隔符后正文，trim 后）。 */
export interface ParsedSkillFrontmatter {
  name: string
  description: string
  whenToUse?: string
  body: string
}

/** SkillRegistration 最小形状（与 @deepseek-ai/dsh-skill 注册面兼容的子集）。 */
interface SkillRegistration {
  name: string
  description: string
  whenToUse?: string
  content: string
  source: 'runtime'
  path?: string
  resourceBase?: { kind: 'directory'; path: string }
}

/** skills 服务的最小接口（register 即可；返回 fiber 生命周期 disposer）。 */
interface SkillsService {
  register(skill: SkillRegistration): () => void
}

/** tools 服务的最小接口（register 即可）。 */
interface ToolsService {
  register(definition: MinimalToolDefinition): () => void
}

/** 工具定义的最小形状（与 DSH 工具注册面兼容的子集，参考 executor.ts）。 */
interface MinimalToolDefinition {
  name: string
  description: string
  parameters: Record<string, unknown>
  output: {
    schema: { type: 'object' }
    render(args: unknown, value: unknown): TextBlockLike[]
  }
  isConcurrencySafe(): boolean
  execute(args: unknown): StepToolValue
}

/** 步骤详情工具成功返回的 canonical 值形状（与 executor.ts 对齐）。 */
interface StepToolValue {
  kind: 'foreground'
  output: TextBlockLike[]
}

/** skills 注册依赖的服务注入面（运行时由宿主注入）。 */
export interface SkillsServices {
  skills: SkillsService
}

/** workloom_step 工具依赖的服务注入面（仅消费 tools）。 */
export interface StepsToolServices {
  tools: ToolsService
}

/** 把任意异常归一为 Error（内部）。 */
function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value))
}

/**
 * 解析 skill 文档的极简 front-matter（本地纯函数，不引 yaml 依赖）。
 * 文档必须以 --- 开头、第二个 --- 结束；逐行 key: value，只认
 * name/description/whenToUse（未知键忽略，兼容 vendored 的 license/source），
 * name/description 必填，缺任一返回 err。
 * @param markdownText 文档全文
 * @returns [err, parsed]：坏文档返回 err，parsed 为 null
 */
export function parseSkillFrontmatter(
  markdownText: string,
): [Error | null, ParsedSkillFrontmatter | null] {
  try {
    return [null, parseSkillFrontmatterInternal(markdownText)]
  } catch (error) {
    return [toError(error), null]
  }
}

/**
 * 解析实现（内部）：任一环节失败抛错，由外层转元组。
 * @param markdownText 文档全文
 * @returns 解析结果
 */
function parseSkillFrontmatterInternal(markdownText: string): ParsedSkillFrontmatter {
  const lines = markdownText.split(/\r?\n/)
  if ((lines[0] ?? '').trim() !== FRONT_MATTER_DELIMITER) {
    throw new Error(`${ERR_PREFIX}: document must start with a ${FRONT_MATTER_DELIMITER} delimiter`)
  }
  const endIndex = lines.findIndex(
    (line, index) => index > 0 && line.trim() === FRONT_MATTER_DELIMITER,
  )
  if (endIndex === -1) {
    throw new Error(`${ERR_PREFIX}: missing closing ${FRONT_MATTER_DELIMITER} delimiter`)
  }
  const record: Record<string, string> = {}
  for (const line of lines.slice(1, endIndex)) {
    const trimmed = line.trim()
    if (trimmed === '' || trimmed.startsWith('#')) continue
    const colonIndex = trimmed.indexOf(':')
    if (colonIndex === -1) {
      throw new Error(`${ERR_PREFIX}: expected "key: value" but got: ${trimmed}`)
    }
    const key = trimmed.slice(0, colonIndex).trim()
    if (!ALLOWED_KEYS.has(key)) continue
    record[key] = trimmed.slice(colonIndex + 1).trim()
  }
  for (const key of REQUIRED_KEYS) {
    if ((record[key] ?? '') === '') {
      throw new Error(`${ERR_PREFIX}: missing required key ${key}`)
    }
  }
  const whenToUse = record['whenToUse']
  return {
    name: record['name'] ?? '',
    description: record['description'] ?? '',
    ...(whenToUse !== undefined && whenToUse !== '' ? { whenToUse } : {}),
    body: lines
      .slice(endIndex + 1)
      .join('\n')
      .trim(),
  }
}

/**
 * 注册 assets 包内的 4 个 SKILL.md 到 ctx.skills（register 自绑定 fiber 生命周期，
 * 插件卸载自动注销）。任一 skill 缺失/解析失败/注册抛错都只告警跳过，不阻塞插件。
 * @param ctx 插件上下文（skills 由宿主注入）
 */
export function registerSkills(ctx: Context & SkillsServices): void {
  for (const rel of SKILL_ASSETS) {
    const text = readAssetText(rel)
    if (text === null) {
      console.warn(`${SKILL_WARN_PREFIX} missing asset: ${rel}`)
      continue
    }
    const [err, parsed] = parseSkillFrontmatter(text)
    if (err !== null || parsed === null) {
      console.warn(`${SKILL_WARN_PREFIX} ${rel}: ${err?.message ?? 'parse returned no result'}`)
      continue
    }
    // resourceBase 指向 SKILL.md 所在目录，让正文的相对资源引用
    // （如 tdd 的 tests.md/mocking.md）可解析；注册抛错只告警跳过。
    try {
      ctx.skills.register({
        name: parsed.name,
        description: parsed.description,
        ...(parsed.whenToUse !== undefined ? { whenToUse: parsed.whenToUse } : {}),
        content: parsed.body,
        source: 'runtime',
        resourceBase: { kind: 'directory', path: dirname(join(ASSETS_ROOT, rel)) },
      })
    } catch (error) {
      console.warn(`${SKILL_WARN_PREFIX} ${rel}: ${String(error)}`)
    }
  }
}

/**
 * 注册 workloom_step 工具：按 stepId 返回工作流契约中的步骤详情。
 * @param ctx 插件上下文（tools 由宿主注入）
 */
export function registerStepsTool(ctx: Context & StepsToolServices): void {
  const { tools } = ctx
  tools.register({
    name: TOOL_NAMES.step,
    description: TOOL_DESCRIPTIONS.step,
    parameters: {
      type: 'object',
      properties: {
        stepId: {
          type: 'string',
          description: PARAM_DESCRIPTIONS.stepId,
        },
      },
      required: ['stepId'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object' },
      render: (_args, value) => [renderOutput(value)],
    },
    isConcurrencySafe: () => true,
    execute: (args) => executeStepTool(args),
  })
}

/**
 * 从契约中查找步骤并组装详情文本；缺失/解析失败/未找到都 fail loud
 * （抛错由 DSH 工具管线转失败结果）。契约资产缺失检查留在 adapter，
 * 查找与解析编排下沉 core 的 lookupWorkflowStep。
 * @param args 工具参数
 * @returns canonical 结果 {kind, output}
 */
function executeStepTool(args: unknown): StepToolValue {
  const params = args as { stepId?: string }
  if (params.stepId === undefined) {
    throw new Error(`${SURFACE_ERR_PREFIX.stepTool}: stepId parameter is required`)
  }
  const contractText = loadWorkflowContractText()
  if (contractText === null) {
    throw new Error(`${SURFACE_ERR_PREFIX.stepTool}: workflow contract asset is missing`)
  }
  const [err, step] = lookupWorkflowStep(params.stepId, contractText)
  if (err !== null || step === null) {
    throw err ?? new Error(`${SURFACE_ERR_PREFIX.stepTool}: step lookup returned no step`)
  }
  return {
    kind: 'foreground',
    output: [{ type: 'text', text: `## ${step.id} ${step.title}\n\n${step.body}` }],
  }
}

/**
 * 从 canonical 值投影模型可见文本（纯函数，仅提取 output 首块文本）。
 * @param value canonical 结果
 * @returns 文本块
 */
function renderOutput(value: unknown): TextBlockLike {
  const result = value as { output?: readonly { text?: string }[] }
  const text = result.output?.[0]?.text ?? ''
  return { type: 'text', text }
}
