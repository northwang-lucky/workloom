/**
 * 用 core 的权威校验器复核 case.md 结构：结构问题为空即退出码 0。
 * core 模块位置由 cwd 向上查找 packages/core/dist/domain/case.js 得出。
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

const findCore = () => {
  let dir = process.cwd()
  for (;;) {
    const candidate = join(dir, 'packages', 'core', 'dist', 'domain', 'case.js')
    if (existsSync(candidate)) return candidate
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

const corePath = findCore()
if (corePath === null) {
  console.error('FAIL cannot locate packages/core/dist/domain/case.js')
  process.exit(1)
}

const { inspectCaseStructure, listCaseChangedFiles } = await import(pathToFileURL(corePath).href)

const taskDir = join('.workloom', 'tasks', 'batch-b')
const [gitErr, changedFiles] = listCaseChangedFiles(process.cwd(), { worktree_path: '' })
if (gitErr !== null) {
  console.error(`FAIL cannot list changed files: ${gitErr.message}`)
  process.exit(1)
}

const issues = inspectCaseStructure(
  readFileSync(join(taskDir, 'case.md'), 'utf8'),
  readFileSync(join(taskDir, 'prd.md'), 'utf8'),
  { taskRelPath: 'tasks/batch-b', children: [], changedFiles },
)

console.log(`changed files: ${changedFiles.join(', ')}`)
console.log(`structure issues: ${JSON.stringify(issues)}`)
if (issues.length > 0) process.exit(1)
console.log('PASS case.md passes the core structure review')
