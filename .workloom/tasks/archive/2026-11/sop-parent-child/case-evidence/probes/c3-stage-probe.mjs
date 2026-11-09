// C3 探针：completed 新阶段边表、完成迁移、兼容读与新枚举优先级、返工回边。
// 只读 worktree 代码；夹具与 HOME/TMPDIR 隔离并自清理。
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const WORKTREE = '/data00/home/wangyubo.1219/workbench/code-src/github/workloom/.workloom/worktree/11-06-sop-parent-child'
const base = mkdtempSync(join(tmpdir(), 'workloom-case-c3-'))
process.env.HOME = base
process.env.TMPDIR = base
const core = await import(`${WORKTREE}/packages/core/src/index.ts`)
const { TRANSITIONS, STAGES, statusOfStage } = core

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

const edges = TRANSITIONS.map((e) => `${e.mode}:${e.from}->${e.to}:${e.guards.join(',')}`)
const hasEdge = (mode, from, to, guards) =>
  edges.includes(`${mode}:${from}->${to}:${guards.join(',')}`)

try {
  // 1. 六条新边与守卫。
  check('standard checking->completed', hasEdge('standard', 'checking', 'completed', ['archive-ready', 'case-outcome-ready']))
  check('standard completed->archived', hasEdge('standard', 'completed', 'archived', ['archive-ready', 'case-outcome-ready']))
  check('standard completed->implementing 无守卫', hasEdge('standard', 'completed', 'implementing', []))
  check('light implementing->completed', hasEdge('light', 'implementing', 'completed', ['archive-ready', 'case-outcome-ready']))
  check('light completed->archived', hasEdge('light', 'completed', 'archived', ['archive-ready', 'case-outcome-ready']))
  check('light completed->implementing 无守卫', hasEdge('light', 'completed', 'implementing', []))
  check('parent 无 completed 边', !TRANSITIONS.some((e) => e.mode === 'parent' && (e.from === 'completed' || e.to === 'completed')))
  check('迁移表 25 条', TRANSITIONS.length === 25, String(TRANSITIONS.length))

  // 2. statusOfStage 映射。
  check('statusOfStage(completed)=completed', statusOfStage(STAGES.COMPLETED) === 'completed')
  check('statusOfStage(archived)=completed', statusOfStage(STAGES.ARCHIVED) === 'completed')
  check('statusOfStage(planning)=planning', statusOfStage(STAGES.PLANNING) === 'planning')
  check('statusOfStage(implementing)=in_progress', statusOfStage(STAGES.IMPLEMENTING) === 'in_progress')

  // 3. standard 任务 checking → completed。
  const created = mustOk('create T', await core.createTask(root, { title: 'Stage Task' }))
  const tRel = created.taskRelPath
  const tDir = join(root, '.workloom', tRel)
  const tJsonPath = join(tDir, 'task.json')
  const tRecord = JSON.parse(readFileSync(tJsonPath, 'utf8'))
  tRecord.status = 'in_progress'
  tRecord.stage = 'checking'
  tRecord.check = { passedAt: new Date().toISOString(), summary: 'check ok' }
  delete tRecord.case
  writeFileSync(tJsonPath, `${JSON.stringify(tRecord, null, 2)}\n`)

  const completedView = mustOk('complete T', core.executeCompleteTask(root, 'c3_ctx', { taskPath: tRel }))
  check('完成视图 stage=completed', completedView.stage === 'completed', completedView.stage)
  check('完成视图 status=completed', completedView.status === 'completed', completedView.status)
  const rawAfterComplete = JSON.parse(readFileSync(tJsonPath, 'utf8'))
  check('raw stage=completed', rawAfterComplete.stage === 'completed', String(rawAfterComplete.stage))
  check('raw status=completed', rawAfterComplete.status === 'completed', String(rawAfterComplete.status))
  check('completedAt 非空', typeof rawAfterComplete.completedAt === 'string' && rawAfterComplete.completedAt !== '')
  check('目录未动', existsSync(tDir) && !existsSync(join(root, '.workloom', 'tasks', 'archive')))
  const reread = mustOk('reread T', core.readTaskView(root, tRel))
  check('重读仍 completed（不误读 archived）', reread.stage === 'completed' && reread.status === 'completed', `${reread.stage}/${reread.status}`)

  // 4. completed→archived 边干跑（legacy case 下平凡通过）。
  const [archErr, archEval] = core.evaluateTransition(root, tRel, 'archived')
  check('completed->archived 干跑通过', archErr === null && archEval !== null, archErr?.message ?? '')

  // 5. 返工回边 completed→implementing 无守卫。
  const rework = mustOk('rework', core.migrateTask(root, { taskRelPath: tRel, to: 'implementing' }))
  check('回边视图 implementing/in_progress', rework.view.stage === 'implementing' && rework.view.status === 'in_progress', `${rework.view.stage}/${rework.view.status}`)
  check('回边无 bypass 守卫', rework.bypassedGuards.length === 0, JSON.stringify(rework.bypassedGuards))

  // 6. 兼容读：旧数据 status=completed 无 stage 兜底 archived；新枚举优先。
  const writeTask = (name, record) => {
    const dir = join(root, '.workloom', 'tasks', name)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'task.json'), `${JSON.stringify(record)}\n`)
    return `tasks/${name}`
  }
  const d1 = writeTask('01-01-legacy-done', { title: 'Legacy Done', status: 'completed' })
  const d1View = mustOk('read D1', core.readTaskView(root, d1))
  check('旧数据 status=completed 无 stage 读 archived', d1View.stage === 'archived' && d1View.status === 'completed', `${d1View.stage}/${d1View.status}`)
  const d2 = writeTask('01-01-new-done', { title: 'New Done', status: 'in_progress', stage: 'completed' })
  const d2View = mustOk('read D2', core.readTaskView(root, d2))
  check('新枚举 stage=completed 优先读 completed', d2View.stage === 'completed' && d2View.status === 'completed', `${d2View.stage}/${d2View.status}`)
} finally {
  rmSync(base, { recursive: true, force: true })
}

console.log(failures === 0 ? 'C3 RESULT: PASS' : `C3 RESULT: FAIL (${failures})`)
process.exit(failures === 0 ? 0 : 1)
