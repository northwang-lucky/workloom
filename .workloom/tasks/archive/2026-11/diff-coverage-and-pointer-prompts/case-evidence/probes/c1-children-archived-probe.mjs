// C1 探针：核对四个子任务归档态与容器合并基线（只读，不写任何生产文件）。
// 场景与期望见 case.md C1：status/stage completed、check.passedAt、case.phase done、
// RESULT status passed、四个 feature 提交是 main HEAD 祖先、7997e50^ 为 4b5454f。
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

const MAIN = '/data00/home/wangyubo.1219/workbench/code-src/github/workloom'
const CONTAINER = join(MAIN, '.workloom/tasks/11-24-diff-coverage-and-pointer-prompts')
const CHILDREN = [
  'subtasks/11-24-incremental-coverage-gate',
  'subtasks/11-24-pointer-injection-and-template-init',
  'subtasks/11-24-config-edit-skill',
  'subtasks/11-24-coverage-config',
]

const failures = []
const rows = []
for (const child of CHILDREN) {
  const dir = join(CONTAINER, child)
  const task = JSON.parse(readFileSync(join(dir, 'task.json'), 'utf8'))
  const resultHead = readFileSync(join(dir, 'case-result.md'), 'utf8').split('---')[1] ?? ''
  const resultStatus = /^status:\s*(\S+)/m.exec(resultHead)?.[1] ?? '(missing)'
  const okStatus = task.status === 'completed' && task.stage === 'completed'
  const okPassed = typeof task.check?.passedAt === 'string' && task.check.passedAt !== ''
  const okPhase = task.case?.phase === 'done'
  const okResult = resultStatus === 'passed'
  if (!okStatus || !okPassed || !okPhase || !okResult) failures.push(`${child}: state checks failed`)
  rows.push(
    `${child} | status=${task.status} stage=${task.stage} | passedAt=${task.check?.passedAt} | phase=${task.case?.phase} | RESULT=${resultStatus} | commit=${String(task.commit).slice(0, 7)}`,
  )
}

// 四个 feature 提交是 HEAD 祖先（以 task.json 的 commit 字段为准）。
for (const child of CHILDREN) {
  const task = JSON.parse(readFileSync(join(CONTAINER, child, 'task.json'), 'utf8'))
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', String(task.commit), 'HEAD'], { cwd: MAIN, stdio: 'ignore' })
    rows.push(`ancestor ok: ${String(task.commit).slice(0, 7)} (${child})`)
  } catch {
    failures.push(`${child}: commit ${String(task.commit).slice(0, 7)} is not an ancestor of HEAD`)
  }
}

// 合并基线钉死：7997e50^ 必须是 4b5454f。
const parent = execFileSync('git', ['rev-parse', '7997e50^'], { cwd: MAIN, encoding: 'utf8' }).trim()
if (!parent.startsWith('4b5454f')) failures.push(`merge base mismatch: 7997e50^ = ${parent}`)
rows.push(`merge-base 7997e50^ = ${parent.slice(0, 7)}`)

console.log(rows.join('\n'))
console.log(`C1 RESULT: ${failures.length === 0 ? 'PASS' : 'FAIL'}`)
if (failures.length > 0) {
  console.log(failures.join('\n'))
  process.exitCode = 1
}
