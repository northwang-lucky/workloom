/**
 * command-ops 模块单测：init 命令编排（恒定 force 幂等语义）。
 * 临时目录 setup 照 init.test.js 先例（mkdtemp + finally rmSync）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { executeInitCommand } from '../src/index.ts'

// 测试隔离：core 三层配置的全局层读 $HOME/.workloom/config（调用链无 homeDir 注入
// 缝时吃 os.homedir 实时值）；本机真实全局配置会泄漏进单测。重定向 HOME 到临时目录
// 使全局层恒为空（与 config.test.ts 的 homeDir 注入、executor.test.ts 的重定向同口径）。
const isolatedHome = mkdtempSync(join(tmpdir(), 'workloom-core-home-'))
// TMPDIR 一并指向隔离目录：夹具临时目录随之落在 HOME 之内，findWorkloomRoot 的
// 上溯在 HOME 边界停下（与真实环境“家目录为上溯边界”的语义一致），不会误发现
// 本机真实家目录的 .workloom。
process.env.HOME = isolatedHome
process.env.TMPDIR = isolatedHome

/** 创建临时项目根。 */
function makeRoot() {
  return mkdtempSync(join(tmpdir(), 'workloom-command-'))
}

test('executeInitCommand 干净目录 init 生成骨架文本', () => {
  const root = makeRoot()
  try {
    const [err, text] = executeInitCommand(root)
    assert.equal(err, null)
    assert.ok(text.includes(`Workloom initialized at ${root}.`))
    assert.ok(text.includes('Created: .workloom'))
    assert.ok(text.includes('.runtime/worktrees'))
    assert.ok(!text.includes('.developer'), 'skeleton must not mention .developer')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('executeInitCommand 二次 init 输出 already complete（幂等，无新增）', () => {
  const root = makeRoot()
  try {
    // 首次 init 已建好骨架；二次执行恒定 force：只补缺件，输出 already complete。
    const [, firstText] = executeInitCommand(root)
    assert.ok(firstText.includes('Workloom initialized'))
    const [err, text] = executeInitCommand(root)
    assert.equal(err, null)
    assert.ok(text.includes('The skeleton is already complete; nothing was created.'))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
