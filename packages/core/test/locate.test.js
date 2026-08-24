/**
 * locate 模块单测：向上查找与路径防越界。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
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
