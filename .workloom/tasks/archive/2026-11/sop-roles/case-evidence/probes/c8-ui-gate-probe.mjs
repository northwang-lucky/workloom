// C8 UI 门禁探针：拒绝文案、补派发放行、旧 frontend 夹具兼容、light 豁免、口径边界、force 留痕
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readTaskView, evaluateGuard, migrateTask, recordExecutorDispatch, recordCasePhase } from '/data00/home/wangyubo.1219/workbench/code-src/github/workloom/.workloom/worktree/11-06-sop-roles/packages/core/src/index.ts'

const baseHome = mkdtempSync(join(tmpdir(), 'workloom-case-c8-'))
process.env.HOME = baseHome
process.env.TMPDIR = baseHome
let failures = 0
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`)
  if (!cond) failures++
}
const baseRecord = (o = {}) => ({
  id: 'task-id-1', name: 'ui-x', title: 'UI gate probe', description: '', status: 'in_progress',
  priority: 'P2', creator: '', assignee: '', package: null, branch: '', base_branch: '',
  createdAt: '2026-11-01T00:00:00.000Z', completedAt: null, parent: null, children: [],
  subtasks: [], scope: '', commit: '', pr_url: '', worktree_path: '', relatedFiles: [],
  notes: '', meta: {}, stage: 'implementing', ...o,
})
const root = join(baseHome, 'proj')
const REJECT = 'no frontend-developer dispatch recorded for a task with UI requirements'
function makeTask(rel, overrides, files = {}) {
  const dir = join(root, '.workloom', rel)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'task.json'), JSON.stringify(baseRecord({ name: rel, ...overrides }), null, 2) + '\n')
  for (const [n, c] of Object.entries(files)) writeFileSync(join(dir, n), c)
  const [err, view] = readTaskView(root, rel)
  if (err !== null) throw err
  return view
}
const guard = (rel, view) => evaluateGuard('ui-dispatch-ready', view, { root, taskRelPath: rel })
const uiPrd = '# Task\n\n## UI Design\n\n- pages and IA\n'

// 1. 有实质 UI 内容且无 frontend-developer 派发 → 拒绝，文案逐字
makeTask('tasks/ui-1', {}, { 'prd.md': uiPrd })
let v = readTaskView(root, 'tasks/ui-1')[1]
let [gErr, gReason] = guard('tasks/ui-1', v)
check('无 frontend-developer 派发被拒且文案逐字', gReason === REJECT, String(gReason))

// 2. 正规通道补一条 frontend-developer 派发 → 放行
const [recErr] = recordExecutorDispatch(root, 'tasks/ui-1', { kind: 'frontend-developer', title: 'ui impl', childId: 'c-ui', status: 'completed' })
check('recordExecutorDispatch 新值写入无错', recErr === null, recErr?.message ?? '')
v = readTaskView(root, 'tasks/ui-1')[1]
;[gErr, gReason] = guard('tasks/ui-1', v)
check('补派发后守卫放行', gErr === null && gReason === null, String(gReason))

// 3. 旧 frontend 历史记录（直写夹具，全仓零条真实 frontend 历史）经兼容读同样满足门禁
makeTask('tasks/ui-2', { dispatches: [{ kind: 'frontend', at: '2026-08-29T01:00:00Z', title: 'ui', status: 'completed', childId: 'c-f' }] }, { 'prd.md': uiPrd })
v = readTaskView(root, 'tasks/ui-2')[1]
;[gErr, gReason] = guard('tasks/ui-2', v)
check('旧 frontend 夹具经兼容读放行', gErr === null && gReason === null, String(gReason))
check('视图归一后记录值为 frontend-developer', v.dispatches[0].kind === 'frontend-developer', v.dispatches[0].kind)

// 4. light 任务豁免
makeTask('tasks/ui-3', { mode: 'light' }, { 'prd.md': uiPrd })
v = readTaskView(root, 'tasks/ui-3')[1]
;[gErr, gReason] = guard('tasks/ui-3', v)
check('light 任务豁免（有 UI 内容无派发也放行）', gErr === null && gReason === null, String(gReason))

// 5. 口径边界：不适用声明放行；空正文仍拦截（子任务三钉住口径不变）
makeTask('tasks/ui-4', {}, { 'prd.md': '# Task\n\n## UI Design\n\nNot applicable: CLI-only task\n' })
v = readTaskView(root, 'tasks/ui-4')[1]
;[gErr, gReason] = guard('tasks/ui-4', v)
check('不适用声明（英文词表）放行', gErr === null && gReason === null, String(gReason))
makeTask('tasks/ui-5', {}, { 'prd.md': '# Task\n\n## UI Design\n\n不适用：本任务无前端界面改动。\n' })
v = readTaskView(root, 'tasks/ui-5')[1]
;[gErr, gReason] = guard('tasks/ui-5', v)
check('不适用声明（中文词表）放行', gErr === null && gReason === null, String(gReason))
makeTask('tasks/ui-6', {}, { 'prd.md': '# Task\n\n## UI Design\n\n## Notes\n\n- x\n' })
v = readTaskView(root, 'tasks/ui-6')[1]
;[gErr, gReason] = guard('tasks/ui-6', v)
check('空正文仍拦截（空正文不是声明，子任务三口径）', gReason === REJECT, String(gReason))
makeTask('tasks/ui-7', {}, {})
v = readTaskView(root, 'tasks/ui-7')[1]
;[gErr, gReason] = guard('tasks/ui-7', v)
check('prd 缺失放行', gErr === null && gReason === null, String(gReason))

// 6. force 越权留痕：standard 任务，CASE 轨道 approved（满足硬守卫），无 check.jsonl 且无前端派发
makeTask('tasks/ui-8', {}, { 'prd.md': uiPrd })
for (const phase of ['designing', 'reviewing', 'approved']) {
  const [e] = recordCasePhase(root, 'tasks/ui-8', phase)
  if (e !== null) check(`CASE 轨道推进 ${phase}`, false, e.message)
}
const [mErr1] = migrateTask(root, { taskRelPath: 'tasks/ui-8', to: 'checking' })
check('无 force 迁入 checking 被拒且理由含前端派发缺失', mErr1 !== null && mErr1.message.includes(REJECT), mErr1?.message ?? '未拒绝')
const [mErr2] = migrateTask(root, { taskRelPath: 'tasks/ui-8', to: 'checking', force: true, reason: 'ui not applicable (C8 probe)' })
check('force 越权强行通过', mErr2 === null, mErr2?.message ?? '')
const saved = JSON.parse(readFileSync(join(root, '.workloom', 'tasks', 'ui-8', 'task.json'), 'utf8'))
const ov = (saved.overrides ?? []).find((o) => o.gate === 'check' && o.reason === 'ui not applicable (C8 probe)')
check('overrides 留痕（gate=check，tool=workloom_task_check，reason 落档）', ov !== undefined && ov.tool === 'workloom_task_check', JSON.stringify(saved.overrides))
const [vErr, vView] = readTaskView(root, 'tasks/ui-8')
check('迁移后视图 stage=checking', vErr === null && vView.stage === 'checking', String(vView?.stage))

rmSync(baseHome, { recursive: true, force: true })
console.log(failures === 0 ? 'C8 RESULT: ALL PASS' : `C8 RESULT: ${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
