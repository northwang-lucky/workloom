/**
 * 构建后置分发步骤（R8）：把手写 src/domain/*.d.ts 覆盖拷贝到 dist/domain/
 * 同名文件。tsc 只从 JSDoc 生成函数签名，手写锚点里的接口与类型别名
 * （CleanupTaskWorktreeResult 等）不会进 dist，而 dist/index.d.ts 又重导出
 * 这些类型，缺失时包使用方无法解析，仅被 skipLibCheck 掩盖。
 *
 * 纪律：
 * - 仅覆盖有手写锚点的文件；无锚点、仅 tsc 生成的 d.ts（git、breadcrumb 等）
 *   保持生成产物不动；
 * - 拷贝前校验生成版导出名是手写版的子集，否则 fail loud——手写锚点漏声明
 *   会让 dist 类型面倒退，必须补锚点而不是放行；
 * - domain 模块无 default 导出（仓库约定），提取只覆盖具名导出两种形态。
 */
import { copyFileSync, existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC_DOMAIN = join(PACKAGE_ROOT, 'src', 'domain')
const DIST_DOMAIN = join(PACKAGE_ROOT, 'dist', 'domain')

/** 声明式具名导出（export function/const/class/interface/type/enum …）。 */
const DECL_EXPORT_RE =
  /^export\s+(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(?:function|const|let|var|class|interface|type|enum)\s+([A-Za-z0-9_$]+)/gm

/** 花括号列表式具名导出（export { a, b as c } / export type { a }），跨行匹配。 */
const LIST_EXPORT_RE = /^export\s+(?:type\s+)?\{([^}]*)\}/gm

/**
 * 提取 d.ts 文本的具名导出集合（内部）。
 * @param {string} text d.ts 文件内容
 * @returns {Set<string>} 导出名集合
 */
function exportNames(text) {
  const names = new Set()
  for (const match of text.matchAll(DECL_EXPORT_RE)) names.add(match[1])
  for (const match of text.matchAll(LIST_EXPORT_RE)) {
    for (const part of match[1].split(',')) {
      // `a as b` 取导出侧名字 b；空片段（尾逗号/空白）跳过。
      const name = part.trim().split(/\s+as\s+/).pop()?.trim()
      if (name !== undefined && name !== '') names.add(name)
    }
  }
  return names
}

const handwritten = readdirSync(SRC_DOMAIN).filter((name) => name.endsWith('.d.ts'))
let copied = 0
for (const name of handwritten) {
  const srcPath = join(SRC_DOMAIN, name)
  const distPath = join(DIST_DOMAIN, name)
  if (existsSync(distPath)) {
    const generated = exportNames(readFileSync(distPath, 'utf8'))
    const anchor = exportNames(readFileSync(srcPath, 'utf8'))
    const missing = [...generated].filter((item) => !anchor.has(item))
    if (missing.length > 0) {
      console.error(
        `copy-domain-dts: ${name} 的手写锚点缺少生成版导出 [${missing.join(', ')}]，请先补全 src/domain/${name}`,
      )
      process.exit(1)
    }
  }
  copyFileSync(srcPath, distPath)
  copied += 1
}
console.log(`copy-domain-dts: 已分发 ${copied} 个手写 d.ts 到 dist/domain/`)
