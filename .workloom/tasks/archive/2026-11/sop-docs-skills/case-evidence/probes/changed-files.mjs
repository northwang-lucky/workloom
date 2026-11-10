// C13 探针：按 CASE Coverage 的 Exclusions 规则算实际变更集，与 9 文件范围对账。
import { existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const root = process.argv[2]
const dirExclusions = [
  'packages/core/resources/',
  'packages/core/test/',
  'packages/dsh-workloom/test/',
  'packages/core/dist/',
  'packages/dsh-workloom/dist/',
]
const exactExclusions = new Set(['packages/core/package.json', 'README.md', 'AGENTS.md', '.prettierignore'])
const expected = new Set([
  'packages/core/src/injection/prompt-compose.ts',
  'packages/core/src/injection/protocol.js',
  'packages/core/src/injection/session-context.ts',
  'packages/core/src/injection/surface.ts',
  'packages/core/src/resources-manifest.ts',
  'packages/core/src/task/task-ops.ts',
  'packages/dsh-workloom/src/dispatch/executor-dispatch.ts',
  'packages/dsh-workloom/src/plugin.ts',
  'packages/dsh-workloom/src/tooling/tasks.ts',
])
const git = (args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim().split('\n').filter(Boolean)
const changed = [...new Set([...git(['diff', '--name-only', '--no-renames', '--diff-filter=d', 'HEAD']), ...git(['ls-files', '--others', '--exclude-standard'])])].sort()
const excluded = (p) => p.startsWith('.workloom/') || dirExclusions.some((d) => p.startsWith(d)) || exactExclusions.has(p)
const existing = changed.filter((p) => existsSync(`${root}/${p}`))
const coverable = existing.filter((p) => !excluded(p)).sort()
console.log('CHANGED_TOTAL=' + changed.length)
console.log('EXISTING_TOTAL=' + existing.length)
console.log('EXCLUDED_NONCOVERABLE=' + existing.filter(excluded).length)
console.log('COVERABLE=' + coverable.length)
for (const p of coverable) console.log('ROW ' + p)
for (const p of expected) if (!coverable.includes(p)) console.log('MISSING ' + p)
for (const p of coverable) if (!expected.has(p)) console.log('EXTRA ' + p)
console.log('MATCH=' + (coverable.length === expected.size && coverable.every((p) => expected.has(p))))
