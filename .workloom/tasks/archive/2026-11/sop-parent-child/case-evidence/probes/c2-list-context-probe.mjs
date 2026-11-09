// C2 探针：顶层列表与活跃父任务 children 快照（标题/状态/路径、截断、损坏跳过）。
// 只读 worktree 代码；夹具与 HOME/TMPDIR 隔离并自清理。
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const WORKTREE = '/data00/home/wangyubo.1219/workbench/code-src/github/workloom/.workloom/worktree/11-06-sop-parent-child'
const base = mkdtempSync(join(tmpdir(), 'workloom-case-c2-'))
process.env.HOME = base
process.env.TMPDIR = base
const core = await import(`${WORKTREE}/packages/core/src/index.ts`)

let failures = 0
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra === '' ? '' : ` — ${extra}`}`)
  if (!cond) failures++
}
const root = join(base, 'project')
mkdirSync(root, { recursive: true })
const mustOk = (label, tuple) => {
  const [err, value] = tuple
  if (err !== null) throw new Error(`${label}: ${err.message}`)
  return value
}
mustOk('init', core.initWorkloom(root, {}))

try {
  const mk = async (title, parent) => {
    const [err, created] = await core.executeCreateTask(root, `c2_${title.replaceAll(' ', '_')}`, {
      title,
      package: 'repo',
      ...(parent !== undefined ? { parent } : {}),
    })
    if (err !== null) throw err
    return created.taskRelPath
  }

  // 父 A：一个 planning 子任务 + 一个 raw completed/stage completed 子任务。
  const a = await mk('Parent A')
  const a1 = await mk('Child A1', a)
  const a2 = await mk('Child A2', a)
  const a2Path = join(root, '.workloom', a2, 'task.json')
  const a2Record = JSON.parse(readFileSync(a2Path, 'utf8'))
  a2Record.status = 'completed'
  a2Record.stage = 'completed'
  writeFileSync(a2Path, `${JSON.stringify(a2Record, null, 2)}\n`)

  // 父 B：九个 planning 子任务。
  const b = await mk('Parent B')
  const bChildren = []
  for (let i = 1; i <= 9; i += 1) bChildren.push(await mk(`Bee Child ${i}`, b))

  // 父 C：一个合法子任务 + 一个 task.json 损坏的子任务。
  const c = await mk('Parent C')
  const c1 = await mk('See Child 1', c)
  const c2 = await mk('See Child 2', c)
  writeFileSync(join(root, '.workloom', c2, 'task.json'), '{ broken json')

  const snap = (rel) => {
    const [err, view] = core.readTaskView(root, rel)
    if (err !== null) throw err
    const [ctxErr, text] = core.assembleSessionContext({ root, turnTask: view, workflowSteps: [] })
    if (ctxErr !== null) throw ctxErr
    return text
  }
  const childLine = (title, status, rel) => `  - "${title}" (${status}) at ${rel}`

  // 1. listTasks 只列顶层。
  const summaries = mustOk('listTasks', core.listTasks(root))
  const paths = summaries.map((s) => s.taskRelPath).sort()
  check('listTasks 仅三个顶层任务', JSON.stringify(paths) === JSON.stringify([a, b, c].sort()), JSON.stringify(paths))
  check('listTasks 无 subtasks 路径', !summaries.some((s) => s.taskRelPath.includes('/subtasks/')))

  // 2. 活跃父 A：两条 children 行（状态派生与顺序）。
  const textA = snap(a)
  check('A children 行 a1 planning', textA.includes(childLine('Child A1', 'planning', a1)), textA)
  check('A children 行 a2 completed', textA.includes(childLine('Child A2', 'completed', a2)), textA)
  const aLines = textA.split('\n').filter((line) => line.startsWith('  - "'))
  check('A children 行恰两条且顺序正确', aLines.length === 2 && aLines[0].includes(a1) && aLines[1].includes(a2), JSON.stringify(aLines))

  // 3. 活跃父 B：8 条 + more 提示，第 9 条不出现。
  const textB = snap(b)
  const bLines = textB.split('\n').filter((line) => line.startsWith('  - "'))
  check('B children 行截断为 8 条', bLines.length === 8, String(bLines.length))
  check('B more 提示剩 1 条', textB.includes('(… 1 more; run workloom_task_list)'), textB)
  check('B 第 9 子任务不出现', !textB.includes(bChildren[8]), bChildren[8])

  // 4. 活跃父 C：损坏子记录跳过、快照成功。
  const textC = snap(c)
  check('C 合法子任务行存在', textC.includes(childLine('See Child 1', 'planning', c1)))
  check('C 损坏子任务不出现', !textC.includes(c2))
  check('C 仅一条 children 行', textC.split('\n').filter((line) => line.startsWith('  - "')).length === 1)

  // 5. 无活跃任务：候选节只列顶层。
  const [ctxErr, noActive] = core.assembleSessionContext({ root, turnTask: null, workflowSteps: [] })
  check('无活跃快照成功', ctxErr === null, ctxErr?.message ?? '')
  check('候选节含三个顶层标题', ['Parent A', 'Parent B', 'Parent C'].every((t) => noActive.includes(t)), noActive)
  check('候选节无 subtasks 路径', !noActive.includes('/subtasks/'))
  check('候选节无子任务标题', !noActive.includes('Child A1') && !noActive.includes('Bee Child 1'))
} finally {
  rmSync(base, { recursive: true, force: true })
}

console.log(failures === 0 ? 'C2 RESULT: PASS' : `C2 RESULT: FAIL (${failures})`)
process.exit(failures === 0 ? 0 : 1)
