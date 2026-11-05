import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  activateRef,
  listArchivedTasks,
  prepareRef,
  readArchivedTask,
  restoreRef,
  resolvePackage,
  resolveSourceCommit,
  snapshotArchivedTask,
} from './archived-tasks.mjs'

function git(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

function write(root, path, content) {
  const file = join(root, path)
  mkdirSync(join(file, '..'), { recursive: true })
  writeFileSync(file, content)
}

function makeRoot() {
  const root = mkdtempSync(join(tmpdir(), 'workloom-archived-skill-'))
  write(root, '.workloom/config.json', '{"packages":{"repo":{"path":"."}}}\n')
  write(root, '.workloom/tasks/archive/a-full/task.json', JSON.stringify({ title: 'A', status: 'completed', mode: 'full', package: 'repo', commit: '', completedAt: '2026-01-01T00:00:00Z' }))
  write(root, '.workloom/tasks/archive/b-legacy/task.json', JSON.stringify({ title: 'B', status: 'completed', package: 'missing', completedAt: '2026-02-01T00:00:00Z' }))
  write(root, '.workloom/tasks/archive/c-light/task.json', JSON.stringify({ title: 'C', status: 'completed', mode: 'light', completedAt: '2026-03-01T00:00:00Z' }))
  git(root, ['init'])
  git(root, ['add', '.'])
  git(root, ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'archive fixtures'])
  return root
}

test('枚举只含 completed full/legacy full，按 completedAt 倒序，拒绝 light 与越界路径', () => {
  const root = makeRoot()
  try {
    const items = listArchivedTasks(root)
    assert.deepEqual(items.map((item) => item.taskPath), ['tasks/archive/b-legacy', 'tasks/archive/a-full'])
    assert.equal(items[1].package, 'repo')
    assert.equal(readArchivedTask(root, 'tasks/archive/a-full').status, 'completed')
    assert.throws(() => readArchivedTask(root, 'tasks/archive/c-light'), /light/)
    assert.throws(() => readArchivedTask(root, '../outside'), /invalid archived task path/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('package、来源提交和指定 ref 均按确定规则处理', () => {
  const root = makeRoot()
  try {
    assert.equal(resolvePackage(root, 'repo'), 'repo')
    assert.equal(resolvePackage(root, 'missing'), 'repo')
    write(root, '.workloom/config.json', '{"packages":{"repo":{"path":"."},"other":{"path":"other"}}}\n')
    assert.equal(resolvePackage(root, 'missing'), null)
    const source = resolveSourceCommit(root, 'tasks/archive/a-full', { commit: '' })
    assert.match(source.commit, /^[a-f0-9]{40}$/)
    assert.equal(source.type, 'archive-bookkeeping')
    const head = git(root, ['rev-parse', 'HEAD'])
    const prepared = prepareRef(root, head, 'validation-demo')
    assert.equal(prepared.commit, head)
    assert.equal(prepared.branch, 'workloom/validation-validation-demo')
    assert.match(prepared.reason, /User-selected ref/)
    assert.equal(git(root, ['rev-parse', prepared.branch]), head)
    const activation = activateRef(root, prepared)
    assert.equal(git(root, ['branch', '--show-current']), prepared.branch)
    assert.equal(git(root, ['rev-parse', 'HEAD']), head)
    restoreRef(root, activation.previousBranch)
    assert.equal(git(root, ['branch', '--show-current']), activation.previousBranch)
    const current = prepareRef(root, undefined, 'validation-demo')
    assert.equal(current.branch, null)
    assert.equal(current.type, 'current-head')
    assert.equal(current.reason, 'Default current target branch')
    assert.equal(activateRef(root, current).changed, false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('原件清单对原始字节敏感，修改任一文件都会被发现', () => {
  const root = makeRoot()
  try {
    const before = snapshotArchivedTask(root, 'tasks/archive/a-full')
    assert.deepEqual(snapshotArchivedTask(root, 'tasks/archive/a-full'), before)
    const path = '.workloom/tasks/archive/a-full/task.json'
    writeFileSync(join(root, path), `${readFileSync(join(root, path), 'utf8')}\n`)
    assert.notDeepEqual(snapshotArchivedTask(root, 'tasks/archive/a-full'), before)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
