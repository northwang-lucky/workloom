/**
 * git 模块单测：gitStatus 工作区状态与错误返回。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { gitStatus } from '../dist/legacy/git.js'

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
