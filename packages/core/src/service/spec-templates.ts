/**
 * spec-templates：把 spec 模板资产幂等写入项目 .workloom/spec/.templates/
 * （新增抽象，TypeScript）。
 *
 * 设计意图：
 * - 依赖方向：模板文本由 adapter 从 assets 读入装配（内容资源在 assets），
 *   本模块只做「定位 .workloom + 幂等写两个固定文件名」的最小编排；
 * - 目标目录 .templates 首字符非字母数字，spec-index 收集器的目录名
 *   字符校验天然排除，不会进 guidelines 索引（见 spec-knowledge-base-spec §10.3）；
 * - 幂等语义与 init 一致：文件已存在不覆盖，用户可改项目内拷贝；
 * - 入参 root 可为项目根或根下任意目录，内部经 findWorkloomRoot 定位。
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { findWorkloomRoot } from '../legacy/locate.js'

/** 错误消息前缀（运行时文案英文）。 */
const ERR_PREFIX = 'workloom spec templates'

/** 模板目录相对 .workloom/spec 的路径（隐藏目录，收集器排除）。 */
const TEMPLATES_REL_PATH = '.templates'

/** 模板文件名（assets/templates/ 同名资产，与 TEMPLATE_TEXT_KEYS 顺序无关）。 */
const INDEX_TEMPLATE_NAME = 'spec-index.md'
const DETAIL_TEMPLATE_NAME = 'spec-detail.md'

/** ensureSpecTemplates 入参。 */
export interface SpecTemplatesParams {
  /** 项目根（或根下任意目录）。 */
  root: string
  /** spec-index.md 模板全文（adapter 从 assets 读入）。 */
  indexTemplate: string
  /** spec-detail.md 模板全文（adapter 从 assets 读入）。 */
  detailTemplate: string
}

/** ensureSpecTemplates 结果。 */
export interface SpecTemplatesResult {
  /** 项目根（定位结果）。 */
  root: string
  /** 本次新建的文件（.workloom 相对路径）。 */
  created: string[]
}

/**
 * 幂等写入 spec 模板到项目 .workloom/spec/.templates/。
 * @param params 入参
 * @returns [err, result]：项目不在 .workloom 内或写盘失败时 err 非空
 */
export function ensureSpecTemplates(
  params: SpecTemplatesParams,
): [Error | null, SpecTemplatesResult | null] {
  try {
    return [null, ensureInternal(params)]
  } catch (error) {
    return [toError(error), null]
  }
}

/**
 * 写盘实现（内部）：定位 .workloom → 建 .templates → 逐文件幂等写。
 * @param params 入参
 * @returns 结果
 */
function ensureInternal(params: SpecTemplatesParams): SpecTemplatesResult {
  const found = findWorkloomRoot(params.root)
  if (found === null) {
    throw new Error(`${ERR_PREFIX}: no .workloom found at or above ${params.root}`)
  }
  const templatesDir = join(found.root, '.workloom', 'spec', TEMPLATES_REL_PATH)
  const created = []
  const files = new Map<string, string>([
    [INDEX_TEMPLATE_NAME, params.indexTemplate],
    [DETAIL_TEMPLATE_NAME, params.detailTemplate],
  ])
  for (const [name, content] of files) {
    const target = join(templatesDir, name)
    if (!existsSync(target)) {
      mkdirSync(templatesDir, { recursive: true })
      writeFileSync(target, content)
      // 相对路径固定前向斜杠（与 spec-index.js 的路径常量风格一致）。
      created.push(`.workloom/spec/${TEMPLATES_REL_PATH}/${name}`)
    }
  }
  return { root: found.root, created }
}

/** 把任意异常归一为 Error（内部）。 */
function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value))
}
