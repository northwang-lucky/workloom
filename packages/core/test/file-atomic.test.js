/**
 * file-atomic 模块单测：同目录 temp + renameSync 原子替换、
 * 失败清理（rename 失败不留临时残留、原目标不受影响）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { writeFileAtomic } from '../src/legacy/file-atomic.js'

/** 列出目录中的临时残留文件（点前缀 + .tmp 后缀）。 */
function tmpResidue(dir) {
  return readdirSync(dir).filter((name) => name.startsWith('.') && name.endsWith('.tmp'))
}

test('writeFileAtomic：内容原子替换目标文件（temp + renameSync）', () => {
  const dir = mkdtempSync(join(tmpdir(), 'workloom-atomic-'))
  try {
    const target = join(dir, 'note.txt')
    writeFileSync(target, 'old content\n')
    writeFileAtomic(target, 'new content\n')
    assert.equal(readFileSync(target, 'utf8'), 'new content\n')
    assert.deepEqual(tmpResidue(dir), [], 'success must leave no temp residue')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('writeFileAtomic：rename 失败时清理临时残留并抛错（原目标不受影响）', () => {
  const dir = mkdtempSync(join(tmpdir(), 'workloom-atomic-fail-'))
  try {
    // 目标路径是一个非空目录：rename(临时文件, 目录) 必然失败（EISDIR/ENOTEMPTY）
    const targetDir = join(dir, 'target')
    mkdirSync(targetDir)
    writeFileSync(join(targetDir, 'keep.txt'), 'keep')
    assert.throws(() => writeFileAtomic(targetDir, 'boom'), 'rename to a directory must throw')
    assert.deepEqual(tmpResidue(dir), [], 'failed rename must clean the temp file')
    // 目录原内容不受影响
    assert.equal(readFileSync(join(targetDir, 'keep.txt'), 'utf8'), 'keep')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('writeFileAtomic：目标不存在时直接创建成功', () => {
  const dir = mkdtempSync(join(tmpdir(), 'workloom-atomic-new-'))
  try {
    const target = join(dir, 'fresh.txt')
    writeFileAtomic(target, 'fresh\n')
    assert.equal(existsSync(target), true)
    assert.equal(readFileSync(target, 'utf8'), 'fresh\n')
    assert.deepEqual(tmpResidue(dir), [])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
