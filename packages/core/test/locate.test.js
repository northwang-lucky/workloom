/**
 * locate 模块单测：向上查找与路径防越界。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { findWorkloomRoot, detectLegacyTrellis, insideWorkloom } from '../src/legacy/locate.js'

function makeTree() {
  const base = mkdtempSync(join(tmpdir(), 'workloom-locate-'))
  mkdirSync(join(base, 'a', 'b', 'c'), { recursive: true })
  return base
}

test('向上查找 .workloom 根', () => {
  const base = makeTree()
  try {
    mkdirSync(join(base, 'a', '.workloom'))
    const hit = findWorkloomRoot(join(base, 'a', 'b', 'c'))
    assert.ok(hit)
    assert.equal(hit.root, join(base, 'a'))
  } finally {
    rmSync(base, { recursive: true, force: true })
  }
})

test('无 .workloom 时返回 null', () => {
  const base = makeTree()
  try {
    assert.equal(findWorkloomRoot(join(base, 'a', 'b', 'c')), null)
  } finally {
    rmSync(base, { recursive: true, force: true })
  }
})

test('检测旧 .trellis 目录', () => {
  const base = makeTree()
  try {
    mkdirSync(join(base, '.trellis'))
    const hit = detectLegacyTrellis(join(base, 'a', 'b'))
    assert.ok(hit)
    assert.equal(hit.root, base)
  } finally {
    rmSync(base, { recursive: true, force: true })
  }
})

test('insideWorkloom 拦截越界路径', () => {
  const base = makeTree()
  try {
    assert.equal(insideWorkloom(base, 'tasks/x'), join(base, '.workloom', 'tasks', 'x'))
    assert.throws(() => insideWorkloom(base, '../evil'), /escapes/)
  } finally {
    rmSync(base, { recursive: true, force: true })
  }
})

// AC1：home 存在 .workloom，cwd 在家目录之下且链路中无项目 .workloom → 返回 null
test('findWorkloomRoot 到家目录边界停止（home 有 .workloom 也不命中）', () => {
  const base = makeTree()
  try {
    mkdirSync(join(base, '.workloom'))
    const result = findWorkloomRoot(join(base, 'a', 'b', 'c'), { homeDir: base })
    assert.equal(result, null)
  } finally {
    rmSync(base, { recursive: true, force: true })
  }
})

// AC2：cwd == home → 返回 null
test('findWorkloomRoot cwd 等于家目录时返回 null', () => {
  const base = makeTree()
  try {
    mkdirSync(join(base, '.workloom'))
    const result = findWorkloomRoot(base, { homeDir: base })
    assert.equal(result, null)
  } finally {
    rmSync(base, { recursive: true, force: true })
  }
})

// AC3：homeDir 为 symlink 路径、startDir 为真实路径 → 边界仍生效
test('findWorkloomRoot symlink 家目录边界仍生效', () => {
  const base = makeTree()
  try {
    const realHome = join(base, 'real', 'home')
    mkdirSync(realHome, { recursive: true })
    const linkHome = join(base, 'link-home')
    symlinkSync(realHome, linkHome)
    mkdirSync(join(realHome, '.workloom'))
    const cwd = join(realHome, 'sub', 'cwd')
    mkdirSync(cwd, { recursive: true })
    // homeDir 传 symlink 路径，cwd 为真实路径 → 归一后应识别为边界
    const result = findWorkloomRoot(cwd, { homeDir: linkHome })
    assert.equal(result, null)
  } finally {
    rmSync(base, { recursive: true, force: true })
  }
})

// AC3 反向：homeDir 为真实路径、startDir 为 symlink 路径（指向家目录内）→ 边界仍生效
test('findWorkloomRoot symlink 起始目录边界仍生效', () => {
  const base = makeTree()
  try {
    const realHome = join(base, 'real', 'home')
    mkdirSync(realHome, { recursive: true })
    const linkHome = join(base, 'link-home')
    symlinkSync(realHome, linkHome)
    mkdirSync(join(realHome, '.workloom'))
    mkdirSync(join(realHome, 'sub', 'cwd'), { recursive: true })
    const cwd = join(linkHome, 'sub', 'cwd')
    // startDir 经 symlink 进入家目录，候选目录须归一后才可比对边界
    const result = findWorkloomRoot(cwd, { homeDir: realHome })
    assert.equal(result, null)
  } finally {
    rmSync(base, { recursive: true, force: true })
  }
})

// AC4：项目 .workloom 位于家目录之下 → 正常命中（回归保护）
test('findWorkloomRoot 家目录之下有项目 .workloom 仍正常命中', () => {
  const base = makeTree()
  try {
    mkdirSync(join(base, 'a', '.workloom'))
    const result = findWorkloomRoot(join(base, 'a', 'b', 'c'), { homeDir: base })
    assert.ok(result)
    assert.equal(result.root, join(base, 'a'))
  } finally {
    rmSync(base, { recursive: true, force: true })
  }
})

// AC5：detectLegacyTrellis 同样在家目录边界停止
test('detectLegacyTrellis 到家目录边界停止（home 有 .trellis 也不命中）', () => {
  const base = makeTree()
  try {
    mkdirSync(join(base, '.trellis'))
    const result = detectLegacyTrellis(join(base, 'a', 'b', 'c'), { homeDir: base })
    assert.equal(result, null)
  } finally {
    rmSync(base, { recursive: true, force: true })
  }
})
