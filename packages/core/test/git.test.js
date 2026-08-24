/**
 * git 模块单测：gitStatus 工作区状态与错误返回。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { gitCurrentBranchSync, gitStatus, gitStatusSync } from '../dist/legacy/git.js'

/** git 提交所需的最小身份环境变量（不依赖全局 git config）。 */
const GIT_IDENTITY_ENV = {
  GIT_AUTHOR_NAME: 'workloom test',
  GIT_AUTHOR_EMAIL: 'test@workloom.local',
  GIT_COMMITTER_NAME: 'workloom test',
  GIT_COMMITTER_EMAIL: 'test@workloom.local',
}

function makeGitRepo() {
  const root = mkdtempSync(join(tmpdir(), 'workloom-git-'))
  execFileSync('git', ['init', '-q'], { cwd: root })
  return root
}

function gitCommit(root, message) {
  execFileSync('git', ['commit', '-q', '-m', message], {
    cwd: root,
    env: { ...process.env, ...GIT_IDENTITY_ENV },
  })
}

test('gitStatus 报告未提交的脏文件', async () => {
  const root = makeGitRepo()
  try {
    writeFileSync(join(root, 'a.txt'), 'hello')
    const [err, status] = await gitStatus(root)
    assert.equal(err, null)
    assert.match(status, /a\.txt/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('gitStatus 在干净工作区返回空串', async () => {
  const root = makeGitRepo()
  try {
    writeFileSync(join(root, 'a.txt'), 'hello')
    execFileSync('git', ['add', '--', 'a.txt'], { cwd: root })
    gitCommit(root, 'init')
    const [err, status] = await gitStatus(root)
    assert.equal(err, null)
    assert.equal(status, '')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('非 git 目录返回 err', async () => {
  const root = mkdtempSync(join(tmpdir(), 'workloom-git-'))
  try {
    const [err, status] = await gitStatus(root)
    assert.ok(err)
    assert.equal(status, null)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('gitCurrentBranchSync 返回当前分支名', () => {
  const root = mkdtempSync(join(tmpdir(), 'workloom-git-'))
  try {
    execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: root })
    writeFileSync(join(root, 'a.txt'), 'hello')
    execFileSync('git', ['add', '--', 'a.txt'], { cwd: root })
    gitCommit(root, 'init')
    const [err, branch] = gitCurrentBranchSync(root)
    assert.equal(err, null)
    assert.equal(branch, 'main')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('gitStatusSync 报告未提交的脏文件', () => {
  const root = makeGitRepo()
  try {
    writeFileSync(join(root, 'a.txt'), 'hello')
    const [err, status] = gitStatusSync(root)
    assert.equal(err, null)
    assert.match(status, /a\.txt/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('非 git 目录两个同步函数都返回 err', () => {
  const root = mkdtempSync(join(tmpdir(), 'workloom-git-'))
  try {
    const [statusErr, status] = gitStatusSync(root)
    assert.ok(statusErr)
    assert.equal(status, null)
    const [branchErr, branch] = gitCurrentBranchSync(root)
    assert.ok(branchErr)
    assert.equal(branch, null)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('干净仓库 gitStatusSync 返回空串', () => {
  const root = mkdtempSync(join(tmpdir(), 'workloom-git-clean-'))
  try {
    execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: root })
    const [err, status] = gitStatusSync(root)
    assert.equal(err, null)
    assert.equal(status, '')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('detached HEAD 时分支查询返回空串', () => {
  const root = mkdtempSync(join(tmpdir(), 'workloom-git-detached-'))
  try {
    execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: root })
    writeFileSync(join(root, 'a.txt'), 'a')
    execFileSync('git', ['add', '--', 'a.txt'], { cwd: root })
    execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd: root, env: GIT_IDENTITY_ENV })
    // 切到 detached HEAD（直接 checkout 提交哈希）
    const hash = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
    execFileSync('git', ['checkout', '-q', hash], { cwd: root })
    const [err, branch] = gitCurrentBranchSync(root)
    assert.equal(err, null)
    assert.equal(branch, '')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
