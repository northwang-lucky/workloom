import { createHash } from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import { readdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { isAbsolute, join, relative } from 'node:path'

const ARCHIVE_PREFIX = 'tasks/archive/'

function git(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

function archiveRoot(root) {
  return join(root, '.workloom', 'tasks', 'archive')
}

function safeTaskPath(taskPath) {
  if (typeof taskPath !== 'string' || taskPath === '' || isAbsolute(taskPath) || taskPath.includes('\0')) {
    throw new Error(`invalid archived task path: ${String(taskPath)}`)
  }
  const normalized = taskPath.replaceAll('\\', '/').replace(/\/+$/, '')
  if (!normalized.startsWith(ARCHIVE_PREFIX) || normalized.split('/').includes('..')) {
    throw new Error(`invalid archived task path: ${taskPath}`)
  }
  return normalized
}

function taskDirectory(root, taskPath) {
  const rel = safeTaskPath(taskPath)
  const base = realpathSync(join(root, '.workloom'))
  const directory = realpathSync(join(root, '.workloom', rel))
  const relFromBase = relative(base, directory)
  if (relFromBase.startsWith('..') || isAbsolute(relFromBase)) throw new Error(`invalid archived task path: ${taskPath}`)
  if (!statSync(directory).isDirectory()) throw new Error(`archived task is not a directory: ${taskPath}`)
  return { rel, directory }
}

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'))
}

function readTask(root, taskPath) {
  const { rel, directory } = taskDirectory(root, taskPath)
  const task = readJson(join(directory, 'task.json'))
  if (task.status !== 'completed') throw new Error(`archived task is not completed: ${rel}`)
  if (task.mode === 'light') throw new Error(`light task is not supported: ${rel}`)
  return { task, rel, directory }
}

export function listArchivedTasks(root) {
  const result = []
  const base = archiveRoot(root)
  function walk(dir, rel) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const nextRel = `${rel}/${entry.name}`
      const next = join(dir, entry.name)
      if (!entry.isDirectory()) continue
      const taskFile = join(next, 'task.json')
      try {
        const task = readJson(taskFile)
        if (task.status === 'completed' && task.mode !== 'light') {
          result.push({
            taskPath: nextRel,
            title: String(task.title ?? task.name ?? nextRel),
            completedAt: String(task.completedAt ?? ''),
            package: typeof task.package === 'string' ? task.package : '',
          })
        }
        continue
      } catch (error) {
        // 只有不存在的 task.json 表示年月层级目录；损坏文件必须显式失败。
        if (error?.code !== 'ENOENT') throw error
      }
      walk(next, nextRel)
    }
  }
  if (statSync(base, { throwIfNoEntry: false })?.isDirectory()) walk(base, ARCHIVE_PREFIX.replace(/\/$/, ''))
  return result.sort((a, b) => b.completedAt.localeCompare(a.completedAt) || a.taskPath.localeCompare(b.taskPath))
}

export function readArchivedTask(root, taskPath) {
  return readTask(root, taskPath).task
}

export function snapshotArchivedTask(root, taskPath) {
  const { directory } = taskDirectory(root, taskPath)
  const files = []
  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const file = join(dir, entry.name)
      if (entry.isDirectory()) walk(file)
      else if (entry.isFile()) files.push(file)
    }
  }
  walk(directory)
  return Object.fromEntries(files.sort().map((file) => [relative(directory, file), createHash('sha256').update(readFileSync(file)).digest('hex')]))
}

export function resolvePackage(root, historicalPackage) {
  const config = readJson(join(root, '.workloom', 'config.json'))
  const packages = config.packages ?? {}
  if (typeof historicalPackage === 'string' && Object.hasOwn(packages, historicalPackage)) return historicalPackage
  const names = Object.keys(packages)
  return names.length === 1 ? names[0] : null
}

export function resolveSourceCommit(root, taskPath, task) {
  if (typeof task.commit === 'string' && /^[a-f0-9]{40}$/.test(task.commit)) return { commit: task.commit, type: 'task-commit' }
  const { rel } = taskDirectory(root, taskPath)
  const commit = git(root, ['log', '-1', '--format=%H', '--', join('.workloom', rel)])
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error(`cannot resolve source commit for ${rel}`)
  return { commit, type: 'archive-bookkeeping' }
}

export function prepareRef(root, ref, slug) {
  if (!/^[a-z0-9-]+$/.test(slug)) throw new Error(`invalid validation slug: ${slug}`)
  if (ref === undefined || ref === '') {
    return {
      commit: git(root, ['rev-parse', 'HEAD']),
      branch: null,
      ref: git(root, ['branch', '--show-current']),
      type: 'current-head',
      reason: 'Default current target branch',
    }
  }
  const commit = git(root, ['rev-parse', '--verify', `${ref}^{commit}`])
  const branch = `workloom/validation-${slug}`
  const existing = execFileSync('git', ['branch', '--list', branch], { cwd: root, encoding: 'utf8' }).trim()
  if (existing !== '') {
    if (git(root, ['rev-parse', branch]) !== commit) throw new Error(`validation branch exists at another commit: ${branch}`)
  } else {
    git(root, ['branch', branch, commit])
  }
  return { commit, branch, ref, type: 'user-ref', reason: `User-selected ref ${ref}` }
}

function codeWorktreeClean(root) {
  const diff = spawnSync('git', ['diff', '--quiet', '--', '.', ':(exclude).workloom/**', ':(exclude).pi/**'], { cwd: root, stdio: 'ignore' })
  if (diff.status !== 0) return false
  return git(root, ['ls-files', '--others', '--exclude-standard', '--', '.', ':(exclude).workloom/**', ':(exclude).pi/**']) === ''
}

/** 启动前切到验证分支；代码脏树直接拒绝，任务文档不影响切换。 */
export function activateRef(root, prepared) {
  const previousBranch = git(root, ['branch', '--show-current'])
  if (previousBranch === '') throw new Error('cannot activate ref from detached HEAD')
  if (prepared.branch === null) return { previousBranch, changed: false }
  if (!codeWorktreeClean(root)) throw new Error('code worktree must be clean before activating validation ref')
  git(root, ['checkout', prepared.branch])
  return { previousBranch, changed: true }
}

/** worktree 创建后立即恢复主分支，避免长期改变用户检出。 */
export function restoreRef(root, previousBranch) {
  if (!codeWorktreeClean(root)) throw new Error('code worktree must be clean before restoring original branch')
  git(root, ['checkout', previousBranch])
}

if (process.argv[1]?.endsWith('archived-tasks.mjs')) {
  const [command, ...args] = process.argv.slice(2)
  const root = process.cwd()
  if (command === 'list') console.log(JSON.stringify(listArchivedTasks(root), null, 2))
  else if (command === 'snapshot' && args[0]) console.log(JSON.stringify(snapshotArchivedTask(root, args[0]), null, 2))
  else throw new Error('usage: node archived-tasks.mjs list | snapshot <tasks/archive/...>')
}
