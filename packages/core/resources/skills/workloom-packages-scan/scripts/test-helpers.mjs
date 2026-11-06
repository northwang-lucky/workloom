/**
 * test-helpers.mjs - 扫描脚本单测共享的 fixture 构建工具。
 */

import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** git 提交所需的最小身份环境变量。 */
export const GIT_IDENTITY_ENV = {
  GIT_AUTHOR_NAME: 'test',
  GIT_AUTHOR_EMAIL: 'test@test.local',
  GIT_COMMITTER_NAME: 'test',
  GIT_COMMITTER_EMAIL: 'test@test.local',
}

/** 创建临时目录。 */
export function makeTempDir(prefix) {
  return mkdtempSync(join(tmpdir(), prefix))
}

/** 在指定目录初始化 git 仓库并做一次提交。 */
export function initGitRepo(absPath) {
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: absPath })
  writeFileSync(join(absPath, 'README.md'), '# init')
  execFileSync('git', ['add', '--', 'README.md'], { cwd: absPath })
  execFileSync('git', ['commit', '-q', '-m', 'init'], {
    cwd: absPath,
    env: { ...process.env, ...GIT_IDENTITY_ENV },
  })
}

/** 创建嵌套 git 仓库（子目录内含 .git）。 */
export function makeNestedGitRepo(parentPath, name) {
  const childPath = join(parentPath, name)
  mkdirSync(childPath, { recursive: true })
  initGitRepo(childPath)
  return childPath
}

/**
 * 创建含 package.json 的包目录（workspace glob 仅收录含 package.json 的目录）。
 * @param {string} absPath 目录绝对路径
 * @param {string} name 包名（写入 package.json 的 name 字段）
 */
export function makePackageDir(absPath, name) {
  mkdirSync(absPath, { recursive: true })
  writeFileSync(join(absPath, 'package.json'), JSON.stringify({ name }))
}
