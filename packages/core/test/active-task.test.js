/**
 * active-task 模块单测：指针写入、解析、幂等清理与悬挂清理。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  setActiveTask,
  clearActiveTask,
  resolveActiveTask,
  clearPointersToTask,
} from '../src/legacy/active-task.js'

/** 创建临时项目根（含 .workloom）。 */
function makeRoot() {
  const root = mkdtempSync(join(tmpdir(), 'workloom-session-'))
  mkdirSync(join(root, '.workloom'))
  return root
}

/** 指针文件绝对路径。 */
function pointerFile(root, contextKey) {
  return join(root, '.workloom', '.runtime', 'sessions', `${contextKey}.json`)
}

/** 建一个任务目录（相对 .workloom）。 */
function makeTaskDir(root, taskRelPath) {
  mkdirSync(join(root, '.workloom', taskRelPath), { recursive: true })
}

test('setActiveTask 写入指针并自动建目录', () => {
  const root = makeRoot()
  try {
    const [err] = setActiveTask(root, 'dsh_abc-1', 'tasks/08-24-foo')
    assert.equal(err, null)
    const file = pointerFile(root, 'dsh_abc-1')
    assert.equal(existsSync(file), true)
    const pointer = JSON.parse(readFileSync(file, 'utf8'))
    assert.equal(pointer.current_task, 'tasks/08-24-foo')
    assert.ok(!Number.isNaN(Date.parse(pointer.last_seen_at)))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('resolveActiveTask 返回当前任务路径', () => {
  const root = makeRoot()
  try {
    makeTaskDir(root, 'tasks/08-24-foo')
    setActiveTask(root, 'dsh_abc-1', 'tasks/08-24-foo')
    const [err, current] = resolveActiveTask(root, 'dsh_abc-1')
    assert.equal(err, null)
    assert.equal(current, 'tasks/08-24-foo')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('resolveActiveTask 无指针时返回 null', () => {
  const root = makeRoot()
  try {
    const [err, current] = resolveActiveTask(root, 'dsh_none')
    assert.equal(err, null)
    assert.equal(current, null)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('resolveActiveTask 悬挂指针自动清理', () => {
  const root = makeRoot()
  try {
    makeTaskDir(root, 'tasks/08-24-foo')
    setActiveTask(root, 'dsh_stale', 'tasks/08-24-foo')
    rmSync(join(root, '.workloom', 'tasks', '08-24-foo'), { recursive: true })
    const [err, current] = resolveActiveTask(root, 'dsh_stale')
    assert.equal(err, null)
    assert.equal(current, null)
    assert.equal(existsSync(pointerFile(root, 'dsh_stale')), false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('clearActiveTask 幂等删除', () => {
  const root = makeRoot()
  try {
    setActiveTask(root, 'dsh_x', 'tasks/08-24-foo')
    assert.equal(clearActiveTask(root, 'dsh_x')[0], null)
    assert.equal(existsSync(pointerFile(root, 'dsh_x')), false)
    assert.equal(clearActiveTask(root, 'dsh_x')[0], null) // 再次删除仍成功
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('clearPointersToTask 只清理指向指定任务的指针', () => {
  const root = makeRoot()
  try {
    makeTaskDir(root, 'tasks/08-24-a')
    makeTaskDir(root, 'tasks/08-24-b')
    setActiveTask(root, 'dsh_1', 'tasks/08-24-a')
    setActiveTask(root, 'dsh_2', 'tasks/08-24-a')
    setActiveTask(root, 'dsh_3', 'tasks/08-24-b')
    assert.equal(clearPointersToTask(root, 'tasks/08-24-a')[0], null)
    assert.equal(existsSync(pointerFile(root, 'dsh_1')), false)
    assert.equal(existsSync(pointerFile(root, 'dsh_2')), false)
    assert.equal(existsSync(pointerFile(root, 'dsh_3')), true)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
