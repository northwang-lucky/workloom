#!/usr/bin/env node
/**
 * scan-packages.mjs - 扫描项目包结构，生成候选 packages 清单。
 *
 * 识别范围：pnpm-workspace.yaml / package.json workspaces / lerna / nx / turbo /
 * go.work / Cargo workspace / .gitmodules / 嵌套 .git。
 *
 * 输出格式：{ name: { path, type?, git? } }
 *   - type: 'workspace' | 'submodule' | 'nested-git'
 *   - git: true（仅 submodule 与嵌套 git）
 *
 * 命名约定：目录 basename 做 key；scoped 包（@org/name）去 org 前缀取尾部；
 * 重名以相对路径消歧。默认追加 `repo: { path: "." }` 根条目。
 */

import { readFileSync } from 'node:fs'
import { join, basename, resolve, relative, isAbsolute } from 'node:path'
import { pathToFileURL } from 'node:url'

import { isDir, isExcludedDir, isFile, listDirNames } from './fs-utils.mjs'
import { expandWorkspaceGlob, expandSimpleGlob } from './glob-expand.mjs'

// ---------------------------------------------------------------------------
// 常量枚举
// ---------------------------------------------------------------------------

/** 包来源类型枚举。 */
const PackageType = Object.freeze({
  WORKSPACE: 'workspace',
  SUBMODULE: 'submodule',
  NESTED_GIT: 'nested-git',
})

/** 默认根条目 key。 */
const ROOT_ENTRY_KEY = 'repo'

// ---------------------------------------------------------------------------
// 工具函数
// ---------------------------------------------------------------------------

/** 安全读取 JSON 文件；失败返回 null。 */
function readJsonSafe(absPath) {
  try {
    return JSON.parse(readFileSync(absPath, 'utf8'))
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// 命名与候选收集
// ---------------------------------------------------------------------------

/**
 * 候选收集器：负责去重、重名消歧、type/git 标注。
 * 同一 path 仅记录首次出现的 type/git（先入为主）。
 *
 * key 命名约定：目录 basename 做 key。scoped 场景（清单声明
 * `packages/@org/*`）的路径 basename 已是包名尾部，天然满足
 * 「去 org 前缀取尾部」约定；glob 一级匹配到 `@org` 目录本身时
 * 按 basename 保留（清单路径直接采信）。
 */
class CandidateCollector {
  /**
   * @param {string} rootDir 扫描根目录（绝对路径），用于计算相对路径。
   */
  constructor(rootDir) {
    this.rootDir = resolve(rootDir)
    /** @type {Map<string, {path: string, type?: string, git?: boolean>} */
    this.byKey = new Map()
    /** 已记录的 path 集合，用于去重。 */
    this.seenPaths = new Set()
  }

  /**
   * 添加候选条目。
   * @param {string} absPath 绝对路径
   * @param {string} type 来源类型
   * @param {boolean} git 是否为 git 仓库
   */
  add(absPath, type, git) {
    const normalized = resolve(absPath)
    if (this.seenPaths.has(normalized)) return
    this.seenPaths.add(normalized)

    const relPath = relative(this.rootDir, normalized)
    let key = basename(normalized)
    // 重名时以相对路径（`/` 替换为 `-`）消歧；仍冲突则追加序号，禁止静默覆盖。
    if (this.byKey.has(key)) key = relPath.replace(/\//g, '-')
    while (this.byKey.has(key)) key = `${key}-2`

    const entry = { path: relPath || '.' }
    entry.type = type
    if (git) entry.git = true

    this.byKey.set(key, entry)
  }

  /** 返回普通对象形式的候选清单。 */
  toObject() {
    return Object.fromEntries(this.byKey)
  }
}

// ---------------------------------------------------------------------------
// 生态检测器
// ---------------------------------------------------------------------------

/**
 * 解析 pnpm-workspace.yaml 的 packages 字段（简单行解析，不依赖 yaml 库）。
 * 仅处理 `packages:\n  - 'xxx'` 列表形式，忽略注释与否定模式（`!` 开头）。
 */
function parsePnpmWorkspacePackages(absPath) {
  const content = readFileSync(absPath, 'utf8')
  const packages = []
  let inPackages = false
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim()
    if (!inPackages) {
      if (line === 'packages:') inPackages = true
      continue
    }
    // 遇到下一个顶级键则退出。
    if (line && !line.startsWith('-') && !line.startsWith('#')) break
    if (line.startsWith('-')) {
      const value = line.slice(1).trim().replace(/^['"]|['"]$/g, '')
      if (value && !value.startsWith('!')) packages.push(value)
    }
  }
  return packages
}

/** 检测 pnpm-workspace.yaml 并收集候选。 */
function detectPnpmWorkspace(cwd, collector) {
  const yamlPath = join(cwd, 'pnpm-workspace.yaml')
  if (!isFile(yamlPath)) return
  for (const pattern of parsePnpmWorkspacePackages(yamlPath)) {
    for (const absPath of expandWorkspaceGlob(cwd, pattern)) {
      collector.add(absPath, PackageType.WORKSPACE, false)
    }
  }
}

/**
 * 从 package.json 的 workspaces 字段提取 glob 列表。
 * 支持 `workspaces: string[]` 与 `workspaces.packages: string[]` 两种形态。
 */
function extractNpmWorkspaces(pkg) {
  const ws = pkg.workspaces
  if (!ws) return []
  if (Array.isArray(ws)) return ws
  if (typeof ws === 'object' && Array.isArray(ws.packages)) return ws.packages
  return []
}

/** 检测 package.json workspaces 并收集候选。 */
function detectNpmWorkspaces(cwd, collector) {
  const pkgPath = join(cwd, 'package.json')
  const pkg = readJsonSafe(pkgPath)
  if (!pkg) return
  for (const pattern of extractNpmWorkspaces(pkg)) {
    for (const absPath of expandWorkspaceGlob(cwd, pattern)) {
      collector.add(absPath, PackageType.WORKSPACE, false)
    }
  }
}

/** 检测 lerna.json 并收集候选。 */
function detectLerna(cwd, collector) {
  const lernaPath = join(cwd, 'lerna.json')
  const lerna = readJsonSafe(lernaPath)
  if (!lerna || !Array.isArray(lerna.packages)) return
  for (const pattern of lerna.packages) {
    for (const absPath of expandWorkspaceGlob(cwd, pattern)) {
      collector.add(absPath, PackageType.WORKSPACE, false)
    }
  }
}

/**
 * 检测 nx：nx.json 存在即视为 workspace，按 `workspaceLayout` 或默认 `apps/libs` 扫描。
 * nx 项目也可能用 pnpm/package.json workspaces，此处仅作兜底。
 */
function detectNx(cwd, collector) {
  const nxPath = join(cwd, 'nx.json')
  if (!isFile(nxPath)) return
  const nx = readJsonSafe(nxPath)
  const layout = nx?.workspaceLayout
  const dirs = layout?.appsDir || 'apps'
  const libs = layout?.libsDir || 'libs'
  for (const dir of [dirs, libs]) {
    const absDir = join(cwd, dir)
    if (!isDir(absDir)) continue
    for (const name of listDirNames(absDir)) {
      if (isExcludedDir(name)) continue
      collector.add(join(absDir, name), PackageType.WORKSPACE, false)
    }
  }
}

/**
 * 检测 turbo.json：存在即视为 workspace，但 turbo 本身不声明包路径，
 * 需配合 pnpm/package.json workspaces；此处仅在有明确 `packages` 字段时收集。
 */
function detectTurbo(cwd, collector) {
  const turboPath = join(cwd, 'turbo.json')
  if (!isFile(turboPath)) return
  const turbo = readJsonSafe(turboPath)
  const packages = turbo?.packages
  if (!Array.isArray(packages)) return
  for (const name of packages) {
    const absPath = join(cwd, name)
    if (isDir(absPath)) collector.add(absPath, PackageType.WORKSPACE, false)
  }
}

/**
 * 解析 go.work 文件的 use 指令（简单行解析）。
 * 支持块形式 `use (\n  ./path1\n  ./path2\n)` 与单行形式 `use ./a ./b`。
 */
function parseGoWorkUses(absPath) {
  const content = readFileSync(absPath, 'utf8')
  const uses = []
  let inUse = false
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim()
    if (!inUse) {
      if (!line.startsWith('use')) continue
      inUse = true
      // 单行形式：提取 use 后的路径字段（块形式同行只有 `(`，被过滤）。
      for (const field of line.slice(3).trim().split(/\s+/)) {
        if (field && field !== '(' && !field.startsWith('//')) uses.push(field)
      }
      continue
    }
    if (line === ')') break
    if (line.startsWith('//')) continue
    if (line.startsWith('.')) uses.push(line)
  }
  return uses
}

/** 检测 go.work 并收集候选。 */
function detectGoWork(cwd, collector) {
  const goWorkPath = join(cwd, 'go.work')
  if (!isFile(goWorkPath)) return
  for (const rel of parseGoWorkUses(goWorkPath)) {
    // use 指令允许绝对路径；相对路径基于 go.work 所在目录解析。
    const absPath = isAbsolute(rel) ? rel : join(cwd, rel)
    if (isDir(absPath)) collector.add(absPath, PackageType.WORKSPACE, false)
  }
}

/**
 * 解析 Cargo.toml 的 [workspace] members 字段（简单行解析）。
 * 仅处理 `members = [...]` 内联数组形式。
 */
function parseCargoWorkspaceMembers(absPath) {
  const content = readFileSync(absPath, 'utf8')
  const members = []
  let inWorkspace = false
  let inMembers = false
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim()
    if (!inWorkspace) {
      if (line === '[workspace]') inWorkspace = true
      continue
    }
    if (line.startsWith('[')) break
    if (line.startsWith('members')) {
      inMembers = true
      // 处理行内数组：`members = ["a", "b"]`
      const inline = line.replace(/^members\s*=\s*/, '')
      if (inline.startsWith('[')) {
        const arr = inline.replace(/^\[|\]$/g, '')
        for (const item of arr.split(',')) {
          const m = item.trim().replace(/^['"]|['"]$/g, '')
          if (m) members.push(m)
        }
        if (inline.includes(']')) inMembers = false
      }
      continue
    }
    if (inMembers) {
      if (line.includes(']')) {
        inMembers = false
        const arrPart = line.replace(/\]$/, '')
        for (const item of arrPart.split(',')) {
          const m = item.trim().replace(/^['"]|['"]$/g, '')
          if (m) members.push(m)
        }
      } else {
        for (const item of line.split(',')) {
          const m = item.trim().replace(/^['"]|['"]$/g, '')
          if (m) members.push(m)
        }
      }
    }
  }
  return members
}

/** 检测 Cargo workspace 并收集候选。 */
function detectCargoWorkspace(cwd, collector) {
  const cargoPath = join(cwd, 'Cargo.toml')
  if (!isFile(cargoPath)) return
  for (const member of parseCargoWorkspaceMembers(cargoPath)) {
    // Cargo members 是显式路径，直接采信；通配符用简单展开（不检查 package.json）。
    const absPaths = member.includes('*')
      ? expandSimpleGlob(cwd, member)
      : [join(cwd, member)]
    for (const absPath of absPaths) {
      if (isDir(absPath)) collector.add(absPath, PackageType.WORKSPACE, false)
    }
  }
}

// ---------------------------------------------------------------------------
// Git 相关检测
// ---------------------------------------------------------------------------

/**
 * 解析 .gitmodules 文件的 submodule 路径（gitconfig 格式简单解析）。
 * 提取每个 `[submodule "name"]` 下的 `path = ...` 值。
 */
function parseGitmodules(absPath) {
  const content = readFileSync(absPath, 'utf8')
  const paths = []
  let currentPath = null
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim()
    if (line.startsWith('[submodule')) {
      if (currentPath) paths.push(currentPath)
      currentPath = null
      continue
    }
    if (line.startsWith('path')) {
      currentPath = line.replace(/^path\s*=\s*/, '').trim()
    }
  }
  if (currentPath) paths.push(currentPath)
  return paths
}

/** 检测 .gitmodules 并收集 submodule 候选。 */
function detectGitmodules(cwd, collector) {
  const modulesPath = join(cwd, '.gitmodules')
  if (!isFile(modulesPath)) return
  for (const rel of parseGitmodules(modulesPath)) {
    const absPath = join(cwd, rel)
    if (isDir(absPath)) collector.add(absPath, PackageType.SUBMODULE, true)
  }
}

/**
 * 探测嵌套 .git：仅扫描 workspace 清单未覆盖的一级子目录。
 * 若子目录包含 `.git`（文件或目录），视为嵌套 git 仓库。
 */
function detectNestedGit(cwd, collector, coveredPaths) {
  for (const name of listDirNames(cwd)) {
    if (isExcludedDir(name)) continue
    const absPath = join(cwd, name)
    // 跳过 workspace 清单已覆盖的路径。
    if (coveredPaths.has(resolve(absPath))) continue
    const gitEntry = join(absPath, '.git')
    if (isDir(gitEntry) || isFile(gitEntry)) {
      collector.add(absPath, PackageType.NESTED_GIT, true)
    }
  }
}

// ---------------------------------------------------------------------------
// 主扫描入口
// ---------------------------------------------------------------------------

/**
 * 扫描指定目录的包结构，返回候选 packages 清单。
 * @param {string} cwd 要扫描的项目根目录（绝对或相对路径）
 * @returns {Record<string, {path: string, type?: string, git?: boolean}>}
 */
export function scanPackages(cwd) {
  const resolved = resolve(cwd)
  const collector = new CandidateCollector(resolved)

  // 1. workspace 清单驱动检测（按优先级顺序）。
  detectPnpmWorkspace(resolved, collector)
  detectNpmWorkspaces(resolved, collector)
  detectLerna(resolved, collector)
  detectNx(resolved, collector)
  detectTurbo(resolved, collector)
  detectGoWork(resolved, collector)
  detectCargoWorkspace(resolved, collector)

  // 2. .gitmodules 检测。
  detectGitmodules(resolved, collector)

  // 3. 嵌套 .git 检测（仅扫描清单未覆盖的一级子目录）。
  detectNestedGit(resolved, collector, collector.seenPaths)

  // 4. 追加根条目（key 已被同名候选占用时不覆盖，避免丢失真实包）。
  const result = collector.toObject()
  if (result[ROOT_ENTRY_KEY] === undefined) {
    result[ROOT_ENTRY_KEY] = { path: '.' }
  }
  return result
}

// ---------------------------------------------------------------------------
// CLI 入口
// ---------------------------------------------------------------------------

/** 判断本模块是否被直接执行（对比入口文件 URL，兼容相对路径与编码差异）。 */
function isDirectInvocation() {
  const entry = process.argv[1]
  if (entry === undefined) return false
  return import.meta.url === pathToFileURL(resolve(entry)).href
}

// 仅当直接运行时执行 CLI（避免被 import 时触发）。
if (isDirectInvocation()) {
  const target = process.argv[2] || '.'
  console.log(JSON.stringify(scanPackages(target), null, 2))
}
