/**
 * 构建产物单测（R8/AC9）：手写 src/domain/*.d.ts 必须原样分发进 dist/domain/。
 * dist/index.d.ts 的类型重导出（CleanupTaskWorktreeResult 等接口）依赖这份
 * 一致性；tsc 只从 JSDoc 生成函数签名，不拷贝手写锚点，缺失时 dist 类型面
 * 丢接口，仅被 skipLibCheck 掩盖。core 的 test 脚本先 build 后测，时序天然满足。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC_DOMAIN = join(PACKAGE_ROOT, 'src', 'domain')
const DIST_DOMAIN = join(PACKAGE_ROOT, 'dist', 'domain')

test('手写 src/domain/*.d.ts 与 dist/domain/ 同名文件内容一致', () => {
  const names = readdirSync(SRC_DOMAIN).filter((name) => name.endsWith('.d.ts'))
  assert.ok(names.length > 0, '未找到手写 d.ts，目录布局假设被破坏')
  for (const name of names) {
    const distPath = join(DIST_DOMAIN, name)
    assert.ok(existsSync(distPath), `dist/domain/${name} 缺失（拷贝步骤未执行或未覆盖）`)
    const srcText = readFileSync(join(SRC_DOMAIN, name), 'utf8')
    assert.equal(readFileSync(distPath, 'utf8'), srcText, `dist/domain/${name} 与手写源不一致`)
  }
})
