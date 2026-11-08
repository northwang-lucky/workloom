// C4 兼容读映射探针：旧五值归一、未知值报错、历史文件零改写（夹具 + 真实归档只读回放）
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, rmSync, copyFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { readTaskView, normalizeExecutorRole, tryNormalizeExecutorRole } from '/data00/home/wangyubo.1219/workbench/code-src/github/workloom/.workloom/worktree/11-06-sop-roles/packages/core/src/index.ts'

const baseHome = mkdtempSync(join(tmpdir(), 'workloom-case-c4-'))
process.env.HOME = baseHome
process.env.TMPDIR = baseHome
let failures = 0
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`)
  if (!cond) failures++
}
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex')
const baseRecord = (o = {}) => ({
  id: 'task-id-1', name: '11-01-demo', title: 'Demo task', description: '', status: 'planning',
  priority: 'P2', creator: '', assignee: '', package: null, branch: '', base_branch: '',
  createdAt: '2026-11-01T00:00:00.000Z', completedAt: null, parent: null, children: [],
  subtasks: [], scope: '', commit: '', pr_url: '', worktree_path: '', relatedFiles: [],
  notes: '', meta: {}, ...o,
})

const root = join(baseHome, 'proj')
mkdirSync(join(root, '.workloom', 'tasks', 't1'), { recursive: true })
const legacy = [
  { kind: 'research', at: '2026-09-30T00:00:00.000Z', title: 'r', status: 'completed', childId: 'c-r' },
  { kind: 'implement', at: '2026-09-30T01:00:00.000Z', title: 'i', status: 'completed', childId: 'c-i' },
  { kind: 'check', at: '2026-09-30T02:00:00.000Z', title: 'c', status: 'completed', childId: 'c-c', purpose: 'execution' },
  { kind: 'review', at: '2026-09-30T03:00:00.000Z', title: 'v', status: 'completed', childId: 'c-v' },
  { kind: 'frontend', at: '2026-09-30T04:00:00.000Z', title: 'f', status: 'completed', childId: 'c-f' },
]
const t1 = join(root, '.workloom', 'tasks', 't1', 'task.json')
writeFileSync(t1, JSON.stringify(baseRecord({ dispatches: legacy }), null, 2) + '\n')
const before = sha(t1)
const [err, view] = readTaskView(root, 'tasks/t1')
check('readTaskView 旧五值夹具无错', err === null, err?.message ?? '')
const expected = ['researcher', 'developer', 'checker', 'judger', 'frontend-developer']
const got = view?.dispatches ?? []
got.forEach((d, i) => check(`兼容归一 ${legacy[i].kind} → ${expected[i]}`, d.kind === expected[i], `实际 ${d.kind}`))
check('读取后夹具文件字节不变（sha256）', sha(t1) === before)

check('normalize 新值原样', normalizeExecutorRole('checker') === 'checker')
for (const [o, n] of Object.entries({ research: 'researcher', implement: 'developer', check: 'checker', review: 'judger', frontend: 'frontend-developer' })) {
  check(`normalize 映射 ${o}→${n}`, normalizeExecutorRole(o) === n)
}
let threw = null
try { normalizeExecutorRole('bogus') } catch (e) { threw = e }
check('未知值抛可判定错误且含未知值字面', threw !== null && /bogus/.test(threw.message), threw?.message ?? '未抛错')
check('tryNormalize 未知值返回 null', tryNormalizeExecutorRole('bogus') === null)

// 真实归档只读回放（frontend 旧值全仓零条真实记录，归档样本为 research/implement/check/review）
const ARCH = '/data00/home/wangyubo.1219/workbench/code-src/github/workloom/.workloom/tasks/archive/2026-09/s1-core-worktree-lifecycle/task.json'
const archBefore = sha(ARCH)
mkdirSync(join(root, '.workloom', 'tasks', 'arch'), { recursive: true })
copyFileSync(ARCH, join(root, '.workloom', 'tasks', 'arch', 'task.json'))
const [aErr, aView] = readTaskView(root, 'tasks/arch')
check('真实归档记录 readTaskView 无错', aErr === null, aErr?.message ?? '')
const newSet = new Set(expected)
const dispatches = aView?.dispatches ?? []
const bad = dispatches.filter((d) => !newSet.has(d.kind)).map((d) => d.kind)
check('归档视图 dispatches 全部为新角色值', dispatches.length > 0 && bad.length === 0, `共 ${dispatches.length} 条，残留 ${JSON.stringify([...new Set(bad)])}`)
check('主检出归档文件零写入（sha256 一致）', sha(ARCH) === archBefore)

rmSync(baseHome, { recursive: true, force: true })
console.log(failures === 0 ? 'C4 RESULT: ALL PASS' : `C4 RESULT: ${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
