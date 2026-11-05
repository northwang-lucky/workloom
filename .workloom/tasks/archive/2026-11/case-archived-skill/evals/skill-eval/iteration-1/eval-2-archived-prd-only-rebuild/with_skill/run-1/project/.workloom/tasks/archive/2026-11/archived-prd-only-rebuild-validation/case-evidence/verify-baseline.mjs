import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const [, , worktreeRoot, taskJsonPath] = process.argv

const fail = (reason, detail = '') => {
  console.error(`BASELINE=failed reason=${reason} ${detail}`.trimEnd())
  process.exit(1)
}

try {
  if (worktreeRoot === undefined || taskJsonPath === undefined) fail('usage')

  const task = JSON.parse(readFileSync(taskJsonPath, 'utf8'))
  const meta = task.meta ?? {}
  const head = execFileSync('git', ['-C', worktreeRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  const status = execFileSync('git', ['-C', worktreeRoot, 'status', '--porcelain'], { encoding: 'utf8' }).trim()
  const baseline = readFileSync(join(worktreeRoot, 'src/current.txt'), 'utf8')

  const checks = [
    ['worktree-head-equals-validation-commit', head === meta.validationCommit],
    ['validation-commit-differs-from-source-commit', meta.validationCommit !== meta.sourceCommit],
    ['source-commit-type-is-archive-bookkeeping', meta.sourceCommitType === 'archive-bookkeeping'],
    ['validation-ref-source-is-default-current-branch', meta.validationRefSource === 'default-current-branch'],
    ['material-mode-is-prd-only', meta.materialMode === 'prd-only'],
    ['source-task-is-the-archived-task', meta.sourceTask === 'tasks/archive/prd-source'],
    ['new-task-has-no-parent', task.parent === null],
    ['worktree-is-pristine', status === ''],
    ['baseline-file-is-the-current-target', baseline === 'current\n'],
  ]

  const failed = checks.filter(([, ok]) => !ok).map(([name]) => name)
  if (failed.length > 0) fail(`failed=${JSON.stringify(failed)} head=${head} status=${JSON.stringify(status)}`)

  console.log(`BASELINE=ok head=${head} checks=${checks.length}`)
  process.exit(0)
} catch (error) {
  fail(String(error?.message ?? error))
}
