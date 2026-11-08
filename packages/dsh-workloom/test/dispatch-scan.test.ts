/**
 * dispatch-scan 共享扫描模块直测：归档排除、坏 JSON 与缺字段防御、多任务聚合、
 * 非对象条目剔除（guard/toolface 两个重建消费方的公共底座）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { scanDispatchRecords } from '../src/dispatch/dispatch-scan.ts'

// 测试隔离：沿 HOME 加 TMPDIR 隔离惯例（防全局配置残留污染，与 core 侧同口径）。
const isolatedHome = mkdtempSync(join(tmpdir(), 'workloom-dsh-scan-home-'))
process.env.HOME = isolatedHome
process.env.TMPDIR = isolatedHome

/** 构造仅含 .workloom 的项目根。 */
function makeRoot() {
  const root = mkdtempSync(join(tmpdir(), 'workloom-dsh-scan-'))
  mkdirSync(join(root, '.workloom'), { recursive: true })
  return root
}

/** 写任务 task.json（tasks/<name>/task.json）。 */
function writeTask(root, name, doc) {
  const dir = join(root, '.workloom', 'tasks', name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'task.json'), typeof doc === 'string' ? doc : JSON.stringify(doc))
}

test('scanDispatchRecords：多任务聚合，记录带任务归属', () => {
  const root = makeRoot()
  try {
    writeTask(root, 't1', {
      dispatches: [
        { kind: 'researcher', childId: 'res-1' },
        { kind: 'developer', childId: 'dev-1' },
      ],
    })
    writeTask(root, 't2', { dispatches: [{ kind: 'judger', childId: 'jud-1' }] })
    const scanned = scanDispatchRecords(root)
    assert.equal(scanned.length, 3)
    const byChild = new Map(scanned.map((item) => [item.dispatch.childId, item.taskRelPath]))
    assert.equal(byChild.get('res-1'), join('tasks', 't1'))
    assert.equal(byChild.get('dev-1'), join('tasks', 't1'))
    assert.equal(byChild.get('jud-1'), join('tasks', 't2'))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('scanDispatchRecords：archive 目录排除（归档任务不入扫描）', () => {
  const root = makeRoot()
  try {
    writeTask(root, 'active-1', { dispatches: [{ kind: 'developer', childId: 'c-active' }] })
    // 归档区任务：tasks/archive/<月>/<名>——扫描排除 archive 顶层目录。
    const archiveDir = join(root, '.workloom', 'tasks', 'archive', '2026-09', 'old-1')
    mkdirSync(archiveDir, { recursive: true })
    writeFileSync(
      join(archiveDir, 'task.json'),
      JSON.stringify({ dispatches: [{ kind: 'research', childId: 'c-archived' }] }),
    )
    const scanned = scanDispatchRecords(root)
    assert.deepEqual(
      scanned.map((item) => item.dispatch.childId),
      ['c-active'],
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('scanDispatchRecords：坏 JSON、缺 task.json、缺 dispatches、非对象条目全部防御跳过', () => {
  const root = makeRoot()
  try {
    writeTask(root, 'bad-json', '{ not json')
    writeTask(root, 'no-dispatches', { title: 'x' })
    writeTask(root, 'dispatches-not-array', { dispatches: 'nope' })
    writeTask(root, 'mixed', {
      dispatches: [null, 42, { kind: 'checker', childId: 'c-ok' }],
    })
    // 无 task.json 的任务目录：静默跳过。
    mkdirSync(join(root, '.workloom', 'tasks', 'empty-dir'), { recursive: true })
    const scanned = scanDispatchRecords(root)
    assert.equal(scanned.length, 1, 'only the well-formed object entry survives')
    assert.equal(scanned[0].dispatch.childId, 'c-ok')
    assert.equal(scanned[0].taskRelPath, join('tasks', 'mixed'))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('scanDispatchRecords：tasks 目录缺失返回空集（不抛错）', () => {
  const root = makeRoot()
  try {
    assert.deepEqual(scanDispatchRecords(root), [])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
