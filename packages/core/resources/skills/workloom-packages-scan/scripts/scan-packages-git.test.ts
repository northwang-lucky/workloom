/**
 * scan-packages.mjs 单测：git 相关检测（.gitmodules 与嵌套 .git）。
 *
 * 测试策略：在临时目录中构建 fixture 结构，扫描后断言候选清单。
 * 每个测试独立创建 / 清理临时目录，避免相互污染。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { scanPackages } from './scan-packages.mjs'
import { initGitRepo, makeNestedGitRepo, makePackageDir, makeTempDir } from './test-helpers.mjs'

// ---------------------------------------------------------------------------
// .gitmodules
// ---------------------------------------------------------------------------

test('.gitmodules 标注 submodule 与 git: true', () => {
  const root = makeTempDir('scan-gitmodules-')
  try {
    // 创建 externals/lib-a 并初始化为 git 仓库。
    const subPath = join(root, 'externals', 'lib-a')
    mkdirSync(subPath, { recursive: true })
    initGitRepo(subPath)
    writeFileSync(
      join(root, '.gitmodules'),
      '[submodule "lib-a"]\n\tpath = externals/lib-a\n\turl = https://example.com/lib-a.git\n',
    )

    const result = scanPackages(root)
    assert.equal(result['lib-a'].path, 'externals/lib-a')
    assert.equal(result['lib-a'].type, 'submodule')
    assert.equal(result['lib-a'].git, true)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

// ---------------------------------------------------------------------------
// 嵌套 .git
// ---------------------------------------------------------------------------

test('嵌套 .git 标注 nested-git 与 git: true', () => {
  const root = makeTempDir('scan-nested-git-')
  try {
    makeNestedGitRepo(root, 'vendor-lib')
    // 无 workspace 清单，嵌套 git 应被探测。
    const result = scanPackages(root)
    assert.equal(result['vendor-lib'].path, 'vendor-lib')
    assert.equal(result['vendor-lib'].type, 'nested-git')
    assert.equal(result['vendor-lib'].git, true)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('workspace 已覆盖的路径不再标注为 nested-git', () => {
  const root = makeTempDir('scan-nested-covered-')
  try {
    // 创建既是 workspace 成员又是 git 仓库的目录。
    const pkgPath = join(root, 'packages', 'shared')
    makePackageDir(pkgPath, 'shared')
    initGitRepo(pkgPath)
    writeFileSync(
      join(root, 'pnpm-workspace.yaml'),
      "packages:\n  - 'packages/*'\n",
    )

    const result = scanPackages(root)
    assert.equal(result.shared.type, 'workspace', '应优先标注为 workspace')
    assert.equal(result.shared.git, undefined, 'workspace 不标注 git')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
