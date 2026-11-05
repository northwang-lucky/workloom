import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { computeTaskFingerprint } from './task-fingerprint.mjs'

function git(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

function makeRoot() {
  const root = mkdtempSync(join(tmpdir(), 'workloom-case-fingerprint-'))
  git(root, ['init'])
  writeFileSync(join(root, 'tracked.txt'), 'one\n')
  git(root, ['add', 'tracked.txt'])
  git(root, ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'init'])
  return root
}

test('同一 HEAD 与文件内容产生稳定 SHA-256，HEAD/tracked/untracked/deleted 均有影响', () => {
  const root = makeRoot()
  try {
    const initial = computeTaskFingerprint(root)
    assert.match(initial, /^[a-f0-9]{64}$/)
    assert.equal(computeTaskFingerprint(root), initial)

    mkdirSync(join(root, '.workloom/tasks/demo'), { recursive: true })
    writeFileSync(join(root, '.workloom/tasks/demo/case.md'), '# metadata only\n')
    assert.equal(computeTaskFingerprint(root), initial)

    writeFileSync(join(root, 'tracked.txt'), 'two\n')
    assert.notEqual(computeTaskFingerprint(root), initial)
    git(root, ['checkout', '--', 'tracked.txt'])

    writeFileSync(join(root, 'untracked.txt'), 'new\n')
    assert.notEqual(computeTaskFingerprint(root), initial)
    rmSync(join(root, 'untracked.txt'))
    assert.equal(computeTaskFingerprint(root), initial)

    writeFileSync(join(root, 'tracked.txt'), 'two\n')
    git(root, ['add', 'tracked.txt'])
    git(root, ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'second'])
    assert.notEqual(computeTaskFingerprint(root), initial)

    rmSync(join(root, 'tracked.txt'))
    assert.notEqual(computeTaskFingerprint(root), initial)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('CLI 输出 codeFingerprint 与函数值一致', () => {
  const root = makeRoot()
  try {
    const script = fileURLToPath(new URL('task-fingerprint.mjs', import.meta.url))
    const output = execFileSync(process.execPath, [script, root], { encoding: 'utf8' }).trim()
    assert.equal(output, `codeFingerprint=${computeTaskFingerprint(root)}`)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
