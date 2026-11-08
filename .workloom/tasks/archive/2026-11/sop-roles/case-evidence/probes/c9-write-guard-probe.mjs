// C9 写守卫探针：域内外判定、旧 kind 历史身份懒重建、脏值防御、归档排除、共享扫描
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { rebuildWriteGuardChildIds, confinedWriteGuard, createWriteGuardState, registerWriteGuardChild, WRITE_GUARDED_ROLES } from '/data00/home/wangyubo.1219/workbench/code-src/github/workloom/.workloom/worktree/11-06-sop-roles/packages/dsh-workloom/src/dispatch/executor-guard.ts'
import { scanDispatchRecords } from '/data00/home/wangyubo.1219/workbench/code-src/github/workloom/.workloom/worktree/11-06-sop-roles/packages/dsh-workloom/src/dispatch/dispatch-scan.ts'

const baseHome = mkdtempSync(join(tmpdir(), 'workloom-case-c9-'))
process.env.HOME = baseHome
process.env.TMPDIR = baseHome
let failures = 0
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`)
  if (!cond) failures++
}
const baseRecord = (o = {}) => ({
  id: 'task-id-1', name: 't1', title: 'Guard probe', description: '', status: 'in_progress',
  priority: 'P2', creator: '', assignee: '', package: null, branch: '', base_branch: '',
  createdAt: '2026-11-01T00:00:00.000Z', completedAt: null, parent: null, children: [],
  subtasks: [], scope: '', commit: '', pr_url: '', worktree_path: '', relatedFiles: [],
  notes: '', meta: {}, ...o,
})
const root = join(baseHome, 'proj')
mkdirSync(join(root, '.workloom', 'tasks', 't1'), { recursive: true })
writeFileSync(join(root, '.workloom', 'tasks', 't1', 'task.json'), JSON.stringify(baseRecord({
  dispatches: [
    { kind: 'research', at: '2026-09-01T00:00:00Z', title: 'r', status: 'completed', childId: 'c-r' },
    { kind: 'review', at: '2026-09-01T01:00:00Z', title: 'v', status: 'completed', childId: 'c-j' },
    { kind: 'bogus', at: '2026-09-01T02:00:00Z', title: 'b', status: 'completed', childId: 'c-x' },
    { kind: 'implement', at: '2026-09-01T03:00:00Z', title: 'i', status: 'completed', childId: 'c-i' },
    { kind: 'researcher', at: '2026-09-01T04:00:00Z', title: 'n', status: 'completed', childId: 'c-n' },
  ],
}), null, 2))
mkdirSync(join(root, '.workloom', 'tasks', 't2'), { recursive: true })
writeFileSync(join(root, '.workloom', 'tasks', 't2', 'task.json'), '{broken json')
mkdirSync(join(root, '.workloom', 'tasks', 'archive', '2026-01', 'old'), { recursive: true })
writeFileSync(join(root, '.workloom', 'tasks', 'archive', '2026-01', 'old', 'task.json'), JSON.stringify(baseRecord({
  dispatches: [{ kind: 'research', at: '2026-01-01T00:00:00Z', title: 'a', status: 'completed', childId: 'c-arch' }],
}), null, 2))

const warns = []
const origWarn = console.warn
console.warn = (m) => warns.push(String(m))
check('WRITE_GUARDED_ROLES 恰为 [researcher, judger]', JSON.stringify([...WRITE_GUARDED_ROLES]) === JSON.stringify(['researcher', 'judger']))

const scanned = scanDispatchRecords(root)
check('共享扫描聚合 t1 五条记录', scanned.length === 5, `实际 ${scanned.length}`)
check('归档任务记录不入扫描', !scanned.some((s) => s.dispatch.childId === 'c-arch'))
check('坏 JSON 任务防御跳过不中断', !warns.some((w) => /t2/.test(w) && /fatal/i.test(w)))

const ids = rebuildWriteGuardChildIds(root)
console.warn = origWarn
check('旧 research 记录识别为受守卫身份（c-r）', ids.has('c-r'))
check('旧 review 记录识别为受守卫身份（c-j）', ids.has('c-j'))
check('新值 researcher 记录入集（c-n）', ids.has('c-n'))
check('脏值 c-x 不入集（跳过）', !ids.has('c-x'))
check('非受守卫 implement（c-i）不入集', !ids.has('c-i'))
check('归档身份 c-arch 不入集', !ids.has('c-arch'))
check('脏值跳过输出 WARNING', warns.some((w) => /c-x|bogus/i.test(w)), JSON.stringify(warns.slice(0, 3)))

// 守卫判定（懒重建路径：state 未登记，首次判定触发重建——模拟 dsh 重启）
const state = createWriteGuardState()
const guardFn = confinedWriteGuard(state)
const exec = (id, fp, name = 'write', cwd = root) => ({ name, agent: { id, session: { header: { cwd } } }, arguments: { file_path: fp } })
const out1 = guardFn(exec('c-r', join(root, 'packages', 'x.ts')))
check('旧 research 身份写 .workloom/ 外路径被拒', typeof out1 === 'string' && out1.includes('denied'), String(out1))
const out2 = guardFn(exec('c-r', '.workloom/tasks/t1/research/out.md'))
check('同一身份写 .workloom/ 内路径放行', out2 === undefined, String(out2))
const out3 = guardFn(exec('c-j', join(root, 'out.md')))
check('旧 review 身份（judger 语义）越界被拒', typeof out3 === 'string' && out3.includes('denied'), String(out3))
const out4 = guardFn(exec('c-i', join(root, 'packages', 'y.ts')))
check('非受守卫身份（developer 语义）放行', out4 === undefined, String(out4))
const out5 = guardFn(exec('c-r', 'anything', 'bash'))
check('非 write/edit 工具不判定（bash 边界维持现状）', out5 === undefined, String(out5))

// 派发登记接线面（state 参数变体；生产单例接线由 executor.test 派发登记用例覆盖）+ 空项目不误拒
registerWriteGuardChild(state, root, 'c-manual')
const out6 = guardFn(exec('c-manual', join(root, 'z.ts')))
check('registerWriteGuardChild 登记身份越界被拒', typeof out6 === 'string' && out6.includes('denied'), String(out6))
const root2 = join(baseHome, 'proj-empty')
mkdirSync(join(root2, '.workloom', 'tasks'), { recursive: true })
const out7 = guardFn(exec('c-any', join(root2, 'w.ts'), 'write', root2))
check('无记录项目懒重建空集不误拒', out7 === undefined, String(out7))

rmSync(baseHome, { recursive: true, force: true })
console.log(failures === 0 ? 'C9 RESULT: ALL PASS' : `C9 RESULT: ${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
