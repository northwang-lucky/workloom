/**
 * 构建产物单测：手写 src/<子包>/*.d.ts 必须原样分发进 dist/<子包>/。
 * dist/index.d.ts 的类型重导出（CleanupTaskWorktreeResult 等接口）依赖这份
 * 一致性；tsc 不拷贝手写锚点，缺失时 dist 类型面丢接口，仅被 skipLibCheck 掩盖。
 * task 子包的手写锚点已随状态机重构清零（类型内联进 task-storage 与
 * state-machine）；实余锚点是 workspace/dispatch/injection 过渡期 JS 模块的
 * 手写声明。core 的 test 脚本先 build 后测，时序天然满足；src 与 dist 的
 * 文件清单镜像由 dist-mirror.test.ts 单独守卫。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
// src 按功能划分的四个子包（与 copy-domain-dts 分发脚本一致）。
const SRC_SUBDIRS = ['task', 'dispatch', 'injection', 'workspace']

test('手写 src/<子包>/*.d.ts 与 dist/<子包>/ 同名文件内容一致', () => {
  let total = 0
  for (const sub of SRC_SUBDIRS) {
    const srcDir = join(PACKAGE_ROOT, 'src', sub)
    const distDir = join(PACKAGE_ROOT, 'dist', sub)
    const names = readdirSync(srcDir).filter((name) => name.endsWith('.d.ts'))
    for (const name of names) {
      total += 1
      const distPath = join(distDir, name)
      assert.ok(existsSync(distPath), `dist/${sub}/${name} 缺失（拷贝步骤未执行或未覆盖）`)
      const srcText = readFileSync(join(srcDir, name), 'utf8')
      assert.equal(readFileSync(distPath, 'utf8'), srcText, `dist/${sub}/${name} 与手写源不一致`)
    }
  }
  assert.ok(total > 0, '未找到手写 d.ts，目录布局假设被破坏')
})
