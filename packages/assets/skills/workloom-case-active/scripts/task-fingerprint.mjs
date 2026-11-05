import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const GIT_BIN = 'git'
const ENCODING = 'utf8'
const DIFF_ARGS = Object.freeze(['diff', '--binary', '--no-renames', 'HEAD', '--', '.', ':(exclude).workloom/**', ':(exclude).pi/**'])
const UNTRACKED_ARGS = Object.freeze(['ls-files', '--others', '--exclude-standard', '--', '.', ':(exclude).workloom/**', ':(exclude).pi/**'])

function git(root, args) {
  return execFileSync(GIT_BIN, args, { cwd: root, encoding: ENCODING, stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

/** 计算任务代码指纹：HEAD、全部 tracked diff 与排序后的 untracked 内容共同参与。 */
export function computeTaskFingerprint(root) {
  const head = git(root, ['rev-parse', 'HEAD'])
  const diff = git(root, [...DIFF_ARGS])
  const untracked = git(root, [...UNTRACKED_ARGS]).split('\n').filter(Boolean).sort()
  const hash = createHash('sha256')
  hash.update(`HEAD\0${head}\0DIFF\0${diff}\0UNTRACKED\0`)
  for (const file of untracked) {
    hash.update(`${file}\0`)
    hash.update(readFileSync(join(root, file)))
    hash.update('\0')
  }
  return hash.digest('hex')
}

const entry = process.argv[1] === undefined ? null : pathToFileURL(resolve(process.argv[1])).href
if (entry !== null && entry === import.meta.url) {
  const root = process.argv[2]
  if (root === undefined) throw new Error('usage: node task-fingerprint.mjs <git-worktree-root>')
  console.log(`codeFingerprint=${computeTaskFingerprint(root)}`)
}
