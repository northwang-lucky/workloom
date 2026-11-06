/**
 * command-ops 模块单测：init 参数解析与 init 命令编排。
 * 临时目录 setup 照 init.test.js 先例（mkdtemp + finally rmSync）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { executeInitCommand, parseInitArgs } from '../src/index.ts'

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

/** 在 root 下构造一个含旧 .trellis 的 legacy 项目（tasks + config）。 */
function seedLegacy(root) {
  mkdirSync(join(root, '.trellis', 'tasks', '09-01-demo'), { recursive: true })
  writeFileSync(join(root, '.trellis', 'tasks', '09-01-demo', 'task.json'), '{}\n')
}

test('parseInitArgs 精确 --purge 进入 purge 模式（含 trim）', () => {
  assert.deepEqual(parseInitArgs('--purge'), { purge: true })
  assert.deepEqual(parseInitArgs('  --purge  '), { purge: true })
})

test('parseInitArgs --purge 后带空格也进入 purge 模式', () => {
  assert.deepEqual(parseInitArgs('--purge now'), { purge: true })
})

test('parseInitArgs 类似前缀不误判为 purge', () => {
  assert.deepEqual(parseInitArgs('--purge-x'), { purge: false })
  assert.deepEqual(parseInitArgs('--purgex'), { purge: false })
})

test('parseInitArgs 非 purge 自由输入同样返回非 purge', () => {
  assert.deepEqual(parseInitArgs('alice'), { purge: false })
  assert.deepEqual(parseInitArgs(''), { purge: false })
})

test('executeInitCommand 干净目录 init 生成骨架文本', () => {
  const root = makeRoot()
  try {
    const [err, text] = executeInitCommand(root, 'alice')
    assert.equal(err, null)
    assert.ok(text.includes(`Workloom initialized at ${root}.`))
    assert.ok(text.includes('Created: .workloom'))
    assert.ok(text.includes('.runtime/worktrees'))
    assert.ok(!text.includes('.developer'), 'skeleton must not mention .developer')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('executeInitCommand 二次 init（force 补建）报 nothing was created', () => {
  const root = makeRoot()
  try {
    seedLegacy(root)
    // 首次 init 已建好骨架；带旧 .trellis 再跑 --purge：force 补建且无新增。
    const [, firstText] = executeInitCommand(root, '')
    assert.ok(firstText.includes('Workloom initialized'))
    const [err, text] = executeInitCommand(root, '--purge')
    assert.equal(err, null)
    assert.ok(text.includes('The skeleton is already complete; nothing was created.'))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('executeInitCommand purge 且无旧项目先报错', () => {
  const root = makeRoot()
  try {
    const [err, text] = executeInitCommand(root, '--purge')
    assert.ok(err)
    assert.match(err.message, /nothing to purge \(no legacy \.trellis project found\)/)
    assert.equal(text, null)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('executeInitCommand 带旧 .trellis 时骨架照常落盘且不动旧目录', () => {
  const root = makeRoot()
  try {
    seedLegacy(root)
    const [err, text] = executeInitCommand(root, '')
    assert.equal(err, null)
    assert.ok(text.includes('Workloom initialized'))
    assert.ok(existsSync(join(root, '.trellis')), 'legacy .trellis must stay untouched')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
