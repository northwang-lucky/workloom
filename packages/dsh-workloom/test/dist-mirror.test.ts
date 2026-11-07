/**
 * dist 镜像守卫（追溯评审意见 4）：src 的 .js 与 .ts 源文件去扩展名集合必须与
 * dist 的 .js 集合镜像相等——每次 src 改动同 commit 重建 dist 的纪律靠本测试
 * 兜底，防止已删模块在 dist 残留（github 子目录安装直接消费 dist，过期产物即
 * 过期行为）。集合只计 .js 与 .ts 源文件、排除 .d.ts（手写锚点的一致性由
 * dist-dts.test.ts 单独守卫）；core 的 test 脚本先 build 后测，时序天然满足。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * 递归收集目录内文件的相对路径（相对 base）。
 * @param dir 当前目录
 * @param base 相对路径基准目录
 * @returns 相对路径列表
 */
function walk(dir: string, base: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...walk(abs, base))
      continue
    }
    files.push(relative(base, abs))
  }
  return files
}

test('src 源文件集合与 dist 的 .js 集合镜像相等（排除 .d.ts）', () => {
  const srcSet = walk(join(PACKAGE_ROOT, 'src'), join(PACKAGE_ROOT, 'src'))
    .filter((name) => /\.(js|ts)$/.test(name) && !name.endsWith('.d.ts'))
    .map((name) => name.replace(/\.(js|ts)$/, ''))
    .sort()
  const distSet = walk(join(PACKAGE_ROOT, 'dist'), join(PACKAGE_ROOT, 'dist'))
    .filter((name) => name.endsWith('.js'))
    .map((name) => name.replace(/\.js$/, ''))
    .sort()
  assert.ok(srcSet.length > 0, 'src 源文件集合不得为空（目录布局假设被破坏）')
  // 双向差集一次报全：dist 缺失 = 构建未覆盖；dist 多出 = 已删模块残留。
  const missingInDist = srcSet.filter((name) => !distSet.includes(name))
  const staleInDist = distSet.filter((name) => !srcSet.includes(name))
  assert.deepEqual(missingInDist, [], 'dist 缺少 src 对应产物（重建 dist）')
  assert.deepEqual(staleInDist, [], 'dist 残留已删模块（清理后重建 dist）')
})
