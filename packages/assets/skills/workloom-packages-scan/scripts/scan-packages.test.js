/**
 * scan-packages.mjs 单测：覆盖各生态检测、排除规则、scoped 命名、重名消歧。
 * git 相关检测（.gitmodules / 嵌套 .git）见 scan-packages-git.test.js。
 *
 * 测试策略：在临时目录中构建 fixture 结构，扫描后断言候选清单。
 * 每个测试独立创建 / 清理临时目录，避免相互污染。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { scanPackages } from './scan-packages.mjs'
import { makeNestedGitRepo, makePackageDir, makeTempDir } from './test-helpers.mjs'

// ---------------------------------------------------------------------------
// pnpm-workspace.yaml
// ---------------------------------------------------------------------------

test('pnpm-workspace.yaml 扫描 packages/* 与 apps/*', () => {
  const root = makeTempDir('scan-pnpm-')
  try {
    makePackageDir(join(root, 'packages', 'core'), 'core')
    makePackageDir(join(root, 'packages', 'utils'), 'utils')
    makePackageDir(join(root, 'apps', 'web'), 'web')
    writeFileSync(
      join(root, 'pnpm-workspace.yaml'),
      "packages:\n  - 'packages/*'\n  - 'apps/*'\n",
    )

    const result = scanPackages(root)
    assert.equal(result.core.path, 'packages/core')
    assert.equal(result.core.type, 'workspace')
    assert.equal(result.utils.path, 'packages/utils')
    assert.equal(result.web.path, 'apps/web')
    assert.ok(result.repo, '应包含 repo 根条目')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('pnpm-workspace.yaml 排除否定模式与注释', () => {
  const root = makeTempDir('scan-pnpm-excl-')
  try {
    makePackageDir(join(root, 'packages', 'a'), 'a')
    makePackageDir(join(root, 'packages', 'b'), 'b')
    writeFileSync(
      join(root, 'pnpm-workspace.yaml'),
      "packages:\n  - 'packages/*'\n  - '!**/test/**'\n  # 注释行\n",
    )

    const result = scanPackages(root)
    assert.ok(result.a)
    assert.ok(result.b)
    assert.equal(Object.keys(result).filter((k) => k !== 'repo').length, 2)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

// ---------------------------------------------------------------------------
// packages/** 递归模式
// ---------------------------------------------------------------------------

test('pnpm-workspace.yaml packages/** 递归匹配含 package.json 的后代目录', () => {
  const root = makeTempDir('scan-pnpm-recursive-')
  try {
    // 一级包
    makePackageDir(join(root, 'packages', 'a'), 'a')
    // 无 package.json 的目录 → 过滤
    mkdirSync(join(root, 'packages', 'b'), { recursive: true })
    // scoped 嵌套包
    makePackageDir(join(root, 'packages', '@org', 'core'), '@org/core')
    // 深层嵌套包
    makePackageDir(join(root, 'packages', 'group', 'sub', 'deep'), 'deep')
    // node_modules 子树整体排除
    mkdirSync(join(root, 'packages', 'c', 'node_modules', 'd'), { recursive: true })
    writeFileSync(
      join(root, 'packages', 'c', 'node_modules', 'd', 'package.json'),
      JSON.stringify({ name: 'd' }),
    )

    writeFileSync(
      join(root, 'pnpm-workspace.yaml'),
      "packages:\n  - 'packages/**'\n",
    )

    const result = scanPackages(root)
    assert.equal(result.a.path, 'packages/a', '一级包应收录')
    assert.equal(result.b, undefined, '无 package.json 应过滤')
    assert.equal(result.core.path, 'packages/@org/core', 'scoped 嵌套包应收录')
    assert.equal(result.deep.path, 'packages/group/sub/deep', '深层嵌套包应收录')
    assert.equal(result.d, undefined, 'node_modules 子树应排除')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('packages/* 匹配 @org scope 目录（无 package.json）不产生假候选，但 ** 可穿透', () => {
  const root = makeTempDir('scan-pnpm-scoped-deep-')
  try {
    // packages/@myorg 本身无 package.json → packages/* 不收录
    makePackageDir(join(root, 'packages', '@myorg', 'core'), '@myorg/core')
    // 普通包
    makePackageDir(join(root, 'packages', 'regular'), 'regular')

    // 用 packages/* → @myorg 被过滤
    writeFileSync(
      join(root, 'pnpm-workspace.yaml'),
      "packages:\n  - 'packages/*'\n",
    )
    const resultStar = scanPackages(root)
    assert.equal(resultStar['@myorg'], undefined, 'packages/* 不收录无 package.json 的 @org')
    assert.ok(resultStar.regular, 'packages/* 收录普通包')

    // 用 packages/** → @org/core 被收录
    writeFileSync(
      join(root, 'pnpm-workspace.yaml'),
      "packages:\n  - 'packages/**'\n",
    )
    const resultRecursive = scanPackages(root)
    assert.equal(resultRecursive.core.path, 'packages/@myorg/core', 'packages/** 穿透 @org 收录 core')
    assert.ok(resultRecursive.regular, 'packages/** 收录普通包')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

// ---------------------------------------------------------------------------
// package.json workspaces
// ---------------------------------------------------------------------------

test('package.json workspaces 数组形态', () => {
  const root = makeTempDir('scan-npm-ws-')
  try {
    makePackageDir(join(root, 'packages', 'foo'), 'foo')
    makePackageDir(join(root, 'packages', 'bar'), 'bar')
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({ workspaces: ['packages/*'] }),
    )

    const result = scanPackages(root)
    assert.equal(result.foo.type, 'workspace')
    assert.equal(result.bar.type, 'workspace')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('package.json workspaces.packages 对象形态', () => {
  const root = makeTempDir('scan-npm-ws-obj-')
  try {
    makePackageDir(join(root, 'libs', 'core'), 'core')
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({ workspaces: { packages: ['libs/*'] } }),
    )

    const result = scanPackages(root)
    assert.equal(result.core.path, 'libs/core')
    assert.equal(result.core.type, 'workspace')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

// ---------------------------------------------------------------------------
// lerna
// ---------------------------------------------------------------------------

test('lerna.json 扫描 packages 字段', () => {
  const root = makeTempDir('scan-lerna-')
  try {
    makePackageDir(join(root, 'packages', 'a'), 'a')
    makePackageDir(join(root, 'packages', 'b'), 'b')
    writeFileSync(
      join(root, 'lerna.json'),
      JSON.stringify({ packages: ['packages/*'] }),
    )

    const result = scanPackages(root)
    assert.equal(result.a.type, 'workspace')
    assert.equal(result.b.type, 'workspace')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

// ---------------------------------------------------------------------------
// nx
// ---------------------------------------------------------------------------

test('nx.json 默认 apps/libs 目录扫描', () => {
  const root = makeTempDir('scan-nx-')
  try {
    mkdirSync(join(root, 'apps', 'web'), { recursive: true })
    mkdirSync(join(root, 'libs', 'shared'), { recursive: true })
    writeFileSync(join(root, 'nx.json'), JSON.stringify({}))

    const result = scanPackages(root)
    assert.equal(result.web.path, 'apps/web')
    assert.equal(result.shared.path, 'libs/shared')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('nx.json 自定义 workspaceLayout', () => {
  const root = makeTempDir('scan-nx-layout-')
  try {
    mkdirSync(join(root, 'projects', 'x'), { recursive: true })
    writeFileSync(
      join(root, 'nx.json'),
      JSON.stringify({ workspaceLayout: { appsDir: 'projects', libsDir: 'tools' } }),
    )

    const result = scanPackages(root)
    assert.equal(result.x.path, 'projects/x')
    assert.equal(result.tools, undefined, '空 libs 目录不应产生候选')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

// ---------------------------------------------------------------------------
// turbo
// ---------------------------------------------------------------------------

test('turbo.json packages 字段', () => {
  const root = makeTempDir('scan-turbo-')
  try {
    mkdirSync(join(root, 'packages', 'a'), { recursive: true })
    mkdirSync(join(root, 'apps', 'web'), { recursive: true })
    writeFileSync(
      join(root, 'turbo.json'),
      JSON.stringify({ packages: ['packages/a', 'apps/web'] }),
    )

    const result = scanPackages(root)
    assert.equal(result.a.path, 'packages/a')
    assert.equal(result.web.path, 'apps/web')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('turbo.json 无 packages 字段时不产生候选', () => {
  const root = makeTempDir('scan-turbo-nopkg-')
  try {
    mkdirSync(join(root, 'packages', 'a'), { recursive: true })
    writeFileSync(join(root, 'turbo.json'), JSON.stringify({ pipeline: {} }))

    const result = scanPackages(root)
    assert.equal(result.a, undefined)
    assert.ok(result.repo)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

// ---------------------------------------------------------------------------
// go.work
// ---------------------------------------------------------------------------

test('go.work use 指令扫描', () => {
  const root = makeTempDir('scan-go-')
  try {
    mkdirSync(join(root, 'api'), { recursive: true })
    mkdirSync(join(root, 'web'), { recursive: true })
    writeFileSync(join(root, 'go.work'), 'go 1.22\n\nuse (\n  ./api\n  ./web\n)\n')

    const result = scanPackages(root)
    assert.equal(result.api.path, 'api')
    assert.equal(result.web.path, 'web')
    assert.equal(result.api.type, 'workspace')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('go.work 单行 use 指令扫描', () => {
  const root = makeTempDir('scan-go-inline-')
  try {
    mkdirSync(join(root, 'api'), { recursive: true })
    mkdirSync(join(root, 'web'), { recursive: true })
    writeFileSync(join(root, 'go.work'), 'go 1.22\n\nuse ./api ./web\n')

    const result = scanPackages(root)
    assert.equal(result.api.path, 'api')
    assert.equal(result.web.path, 'web')
    assert.equal(result.api.type, 'workspace')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

// ---------------------------------------------------------------------------
// Cargo workspace
// ---------------------------------------------------------------------------

test('Cargo.toml workspace members 内联数组', () => {
  const root = makeTempDir('scan-cargo-')
  try {
    mkdirSync(join(root, 'crates', 'a'), { recursive: true })
    mkdirSync(join(root, 'cli'), { recursive: true })
    writeFileSync(
      join(root, 'Cargo.toml'),
      '[workspace]\nmembers = ["crates/a", "cli"]\n',
    )

    const result = scanPackages(root)
    assert.equal(result.a.path, 'crates/a')
    assert.equal(result.cli.path, 'cli')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('Cargo.toml workspace members 通配符', () => {
  const root = makeTempDir('scan-cargo-glob-')
  try {
    mkdirSync(join(root, 'crates', 'alpha'), { recursive: true })
    mkdirSync(join(root, 'crates', 'beta'), { recursive: true })
    writeFileSync(
      join(root, 'Cargo.toml'),
      '[workspace]\nmembers = ["crates/*"]\n',
    )

    const result = scanPackages(root)
    assert.equal(result.alpha.path, 'crates/alpha')
    assert.equal(result.beta.path, 'crates/beta')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

// ---------------------------------------------------------------------------
// 排除规则
// ---------------------------------------------------------------------------

test('排除 node_modules / dist / vendor / 隐藏目录', () => {
  const root = makeTempDir('scan-excl-')
  try {
    makePackageDir(join(root, 'packages', 'real'), 'real')
    mkdirSync(join(root, 'packages', 'node_modules'), { recursive: true })
    mkdirSync(join(root, 'packages', 'dist'), { recursive: true })
    mkdirSync(join(root, 'packages', 'vendor'), { recursive: true })
    mkdirSync(join(root, 'packages', '.hidden'), { recursive: true })
    writeFileSync(
      join(root, 'pnpm-workspace.yaml'),
      "packages:\n  - 'packages/*'\n",
    )

    const result = scanPackages(root)
    assert.ok(result.real, '应包含 real')
    assert.equal(result.node_modules, undefined, '应排除 node_modules')
    assert.equal(result.dist, undefined, '应排除 dist')
    assert.equal(result.vendor, undefined, '应排除 vendor')
    assert.equal(result.hidden, undefined, '应排除隐藏目录')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

// ---------------------------------------------------------------------------
// scoped 包命名
// ---------------------------------------------------------------------------

test('glob 一级匹配到 scope 目录（无 package.json）时不产生假候选', () => {
  const root = makeTempDir('scan-scoped-')
  try {
    // @org 目录本身不含 package.json → 不是 workspace 成员。
    mkdirSync(join(root, 'packages', '@myorg', 'core'), { recursive: true })
    mkdirSync(join(root, 'packages', '@myorg', 'utils'), { recursive: true })
    writeFileSync(
      join(root, 'pnpm-workspace.yaml'),
      "packages:\n  - 'packages/*'\n",
    )

    const result = scanPackages(root)
    assert.equal(result['@myorg'], undefined, 'scope 目录无 package.json 应被过滤')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('scoped 清单 packages/@org/* 候选 key 取包名尾部（去 org 前缀）', () => {
  const root = makeTempDir('scan-scoped-tail-')
  try {
    makePackageDir(join(root, 'packages', '@myorg', 'core'), '@myorg/core')
    makePackageDir(join(root, 'packages', '@myorg', 'utils'), '@myorg/utils')
    writeFileSync(
      join(root, 'pnpm-workspace.yaml'),
      "packages:\n  - 'packages/@myorg/*'\n",
    )

    const result = scanPackages(root)
    assert.equal(result.core.path, 'packages/@myorg/core')
    assert.equal(result.utils.path, 'packages/@myorg/utils')
    assert.equal(result['@myorg'], undefined, 'org 目录本身不产生候选')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

// ---------------------------------------------------------------------------
// 重名消歧
// ---------------------------------------------------------------------------

test('重名时以相对路径消歧', () => {
  const root = makeTempDir('scan-dedup-')
  try {
    makePackageDir(join(root, 'apps', 'web'), 'web')
    makePackageDir(join(root, 'packages', 'web'), 'web')
    writeFileSync(
      join(root, 'pnpm-workspace.yaml'),
      "packages:\n  - 'apps/*'\n  - 'packages/*'\n",
    )

    const result = scanPackages(root)
    // 先声明者保留 basename，后到者以相对路径消歧。
    assert.equal(result.web.path, 'apps/web', '先声明者保留 basename key')
    assert.equal(result['packages-web'].path, 'packages/web', '重名者以相对路径消歧')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('消歧 key 再冲突时追加序号，不静默覆盖', () => {
  const root = makeTempDir('scan-dedup-clash-')
  try {
    // 根级 packages-web 目录（嵌套 git）会在消歧 key 已被占用时触发序号兜底。
    makeNestedGitRepo(root, 'packages-web')
    makePackageDir(join(root, 'apps', 'web'), 'web')
    makePackageDir(join(root, 'packages', 'web'), 'web')
    writeFileSync(
      join(root, 'pnpm-workspace.yaml'),
      "packages:\n  - 'apps/*'\n  - 'packages/*'\n",
    )

    const result = scanPackages(root)
    assert.equal(result.web.path, 'apps/web')
    assert.equal(result['packages-web'].path, 'packages/web', '消歧 key 归属先到的 workspace 候选')
    assert.equal(result['packages-web-2'].path, 'packages-web', '再冲突时追加序号而非覆盖')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

// ---------------------------------------------------------------------------
// 根条目
// ---------------------------------------------------------------------------

test('默认追加 repo 根条目', () => {
  const root = makeTempDir('scan-root-')
  try {
    const result = scanPackages(root)
    assert.deepEqual(result.repo, { path: '.' })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('候选 key 与 repo 同名时不覆盖候选', () => {
  const root = makeTempDir('scan-root-clash-')
  try {
    makePackageDir(join(root, 'packages', 'repo'), 'repo')
    writeFileSync(
      join(root, 'pnpm-workspace.yaml'),
      "packages:\n  - 'packages/*'\n",
    )

    const result = scanPackages(root)
    assert.equal(result.repo.path, 'packages/repo', '真实候选不被根条目覆盖')
    assert.equal(result.repo.type, 'workspace')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

// ---------------------------------------------------------------------------
// 空仓
// ---------------------------------------------------------------------------

test('空仓仅返回 repo 根条目', () => {
  const root = makeTempDir('scan-empty-')
  try {
    const result = scanPackages(root)
    assert.deepEqual(result, { repo: { path: '.' } })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

// ---------------------------------------------------------------------------
// CLI 直跑
// ---------------------------------------------------------------------------

test('CLI 直跑：输出 JSON 候选清单', () => {
  const root = makeTempDir('scan-cli-')
  try {
    makePackageDir(join(root, 'packages', 'cli-pkg'), 'cli-pkg')
    writeFileSync(
      join(root, 'pnpm-workspace.yaml'),
      "packages:\n  - 'packages/*'\n",
    )
    const scriptPath = join(dirname(fileURLToPath(import.meta.url)), 'scan-packages.mjs')
    const stdout = execFileSync(process.execPath, [scriptPath, root], { encoding: 'utf8' })

    const parsed = JSON.parse(stdout)
    assert.equal(parsed['cli-pkg'].path, 'packages/cli-pkg')
    assert.deepEqual(parsed.repo, { path: '.' })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
