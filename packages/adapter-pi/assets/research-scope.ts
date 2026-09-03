/**
 * research executor 的 write/edit 范围限定扩展（随 adapter-pi 包发布）。
 *
 * 设计意图：
 * - 同名覆盖（实证 2026-09-03：child pi 带 `-t write,edit` 时
 *   registerTool({name: 'write'}) 完整替换内置 write，allow 未含时完全不可见）：
 *   research 派发时经 `-e` 加载本扩展，write/edit 被本扩展的路径受限副本覆盖，
 *   越界（<cwd>/.workloom/ 外）抛英文错误，域内落盘/替换行为与内置一致；
 * - 与 DSH 侧 executor-guard 的 researchWriteGuard 同语义：write/edit 只允许
 *   落在子会话 cwd 的 .workloom/ 目录内；bash 路径绕过记为已知边界，不根治；
 * - 只注册 write/edit 两个副本（同名覆盖内置），read/bash 等其余工具保持内置；
 *   -t allow 未含 write/edit 时本扩展注册的工具同样不可见（allow 清单治理）。
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import { Type } from 'typebox'

/** 项目资产目录名（允许域：<cwd>/.workloom/）。 */
const WORKLOOM_DIR = '.workloom'

/** 拒绝消息错误前缀（运行时文案英文，与 DSH 守卫 ERR_PREFIX.executor 对齐）。 */
const ERR_PREFIX = 'workloom executor'

/**
 * 判定目标路径是否落在 cwd 的 .workloom/ 内（resolve 后前缀判定，防止 `..` 逃逸）。
 * @param cwd 子会话工作目录
 * @param target 目标路径（相对或绝对）
 * @returns 落在 <cwd>/.workloom/ 内为 true
 */
function insideWorkloom(cwd: string, target: string): boolean {
  const resolved = resolve(cwd, target)
  const domain = join(cwd, WORKLOOM_DIR)
  return resolved === domain || resolved.startsWith(domain + sep)
}

/**
 * 组装越界拒绝错误（英文，含路径与允许域）。
 * @param toolName 工具名（write/edit）
 * @param cwd 子会话工作目录
 * @param target 目标路径
 * @returns 拒绝错误
 */
function denialError(toolName: string, cwd: string, target: string): Error {
  return new Error(
    `${ERR_PREFIX}: ${toolName} denied for the research executor: ${resolve(cwd, target)} is outside the allowed ${join(cwd, WORKLOOM_DIR)}/ directory`,
  )
}

/** write 副本的参数 schema（与内置 write 一致：path + content）。 */
const writeSchema = Type.Object({
  path: Type.String({ description: 'Path to the file to write (relative or absolute)' }),
  content: Type.String({ description: 'Content to write to the file' }),
})

/** edit 副本的参数 schema（与内置 edit 一致：path + edits 精确替换）。 */
const editSchema = Type.Object({
  path: Type.String({ description: 'Path to the file to edit (relative or absolute)' }),
  edits: Type.Array(
    Type.Object({
      oldText: Type.String({ description: 'Exact text to replace (must be unique)' }),
      newText: Type.String({ description: 'Replacement text' }),
    }),
  ),
})

/** 扩展默认导出（pi 扩展工厂：注册受限的 write/edit 副本）。 */
export default function researchScope(pi: ExtensionAPI): void {
  pi.registerTool({
    name: 'write',
    label: 'Write',
    description:
      'Write content to a file. Restricted to the project .workloom/ directory for the research executor; paths outside it are denied.',
    promptSnippet: 'write(path, content)',
    parameters: writeSchema,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      if (!insideWorkloom(ctx.cwd, params.path)) {
        throw denialError('write', ctx.cwd, params.path)
      }
      const absolute = resolve(ctx.cwd, params.path)
      await mkdir(dirname(absolute), { recursive: true })
      await writeFile(absolute, params.content, 'utf-8')
      return { content: [{ type: 'text', text: `Wrote ${absolute}` }], details: { path: absolute } }
    },
  })
  pi.registerTool({
    name: 'edit',
    label: 'Edit',
    description:
      'Edit a file using exact text replacement. Restricted to the project .workloom/ directory for the research executor; paths outside it are denied.',
    promptSnippet: 'edit(path, edits)',
    parameters: editSchema,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      if (!insideWorkloom(ctx.cwd, params.path)) {
        throw denialError('edit', ctx.cwd, params.path)
      }
      const absolute = resolve(ctx.cwd, params.path)
      const original = await readFile(absolute, 'utf-8')
      let updated = original
      for (const edit of params.edits) {
        const count = updated.split(edit.oldText).length - 1
        if (count === 0) {
          throw new Error(`${ERR_PREFIX}: edit failed: oldText not found in ${params.path}`)
        }
        if (count > 1) {
          throw new Error(`${ERR_PREFIX}: edit failed: oldText is not unique in ${params.path}`)
        }
        updated = updated.replace(edit.oldText, edit.newText)
      }
      await writeFile(absolute, updated, 'utf-8')
      return { content: [{ type: 'text', text: `Edited ${absolute}` }], details: { path: absolute } }
    },
  })
}
