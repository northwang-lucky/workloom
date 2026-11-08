// C7 planReview 探针：executePlanReviewMark 轨道写口 + purpose 按 role 分支校验
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { executePlanReviewMark, recordPlanReview, recordExecutorDispatch, readTaskView } from '/data00/home/wangyubo.1219/workbench/code-src/github/workloom/.workloom/worktree/11-06-sop-roles/packages/core/src/index.ts'

const baseHome = mkdtempSync(join(tmpdir(), 'workloom-case-c7-'))
process.env.HOME = baseHome
process.env.TMPDIR = baseHome
let failures = 0
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`)
  if (!cond) failures++
}
const baseRecord = (o = {}) => ({
  id: 'task-id-1', name: 'pr-1', title: 'Plan review probe', description: '', status: 'planning',
  priority: 'P2', creator: '', assignee: '', package: null, branch: '', base_branch: '',
  createdAt: '2026-11-01T00:00:00.000Z', completedAt: null, parent: null, children: [],
  subtasks: [], scope: '', commit: '', pr_url: '', worktree_path: '', relatedFiles: [],
  notes: '', meta: {}, ...o,
})
const root = join(baseHome, 'proj')
const rel = 'tasks/pr-1'
mkdirSync(join(root, '.workloom', rel), { recursive: true })
const taskFile = join(root, '.workloom', rel, 'task.json')
writeFileSync(taskFile, JSON.stringify(baseRecord(), null, 2) + '\n')
const readJson = () => JSON.parse(readFileSync(taskFile, 'utf8'))

// 非法边与非法相位
const [e1, r1] = executePlanReviewMark(root, 'dsh_ctx1', { phase: 'clean', taskPath: rel })
check('none→clean 非法边报可判定错误', e1 !== null && /illegal plan review transition/.test(e1.message) && r1 === null, e1?.message ?? '未报错')
const [e2] = executePlanReviewMark(root, 'dsh_ctx1', { phase: 'bogus', taskPath: rel })
check('非法相位报可判定错误', e2 !== null && /invalid plan review phase/.test(e2.message), e2?.message ?? '未报错')

// reviewing → revising（轮数加一）→ clean（落定）
const [e3] = recordPlanReview(root, rel, 'reviewing')
check('夹具置 reviewing 成功', e3 === null, e3?.message ?? '')
const [e4, r4] = executePlanReviewMark(root, 'dsh_ctx1', { phase: 'revising', taskPath: rel })
check('标记 revising 成功且轮数加一', e4 === null && r4?.planReview === 'revising' && r4?.planReviewRevisions === 1, JSON.stringify(r4))
// revising→clean 直接标记是非法边（clean 仅可从 reviewing 到达——子任务三冻结边表；case.md C7 步骤 1 措辞缺陷，按合法边序列执行）
const [eEdge, rEdge] = executePlanReviewMark(root, 'dsh_ctx1', { phase: 'clean', taskPath: rel })
check('revising→clean 非法边报可判定错误', eEdge !== null && /illegal plan review transition/.test(eEdge.message) && rEdge === null, eEdge?.message ?? '未报错')
// 合法序列：revising → reviewing（修订后重审，等价评审派发自动置位边）→ clean 落定
const [eBack] = recordPlanReview(root, rel, 'reviewing')
check('revising→reviewing 回边成功', eBack === null, eBack?.message ?? '')
const [e5, r5] = executePlanReviewMark(root, 'dsh_ctx1', { phase: 'clean', taskPath: rel })
check('标记 clean 落定（轮数保留）', e5 === null && r5?.planReview === 'clean' && r5?.planReviewRevisions === 1, JSON.stringify(r5))
check('task.json 落盘 planReview 记录', readJson().planReview?.phase === 'clean' && readJson().planReview?.revisions === 1, JSON.stringify(readJson().planReview))

// purpose 按 role 分支校验
const [d1] = recordExecutorDispatch(root, rel, { kind: 'judger', purpose: 'plan-review', title: 'plan 评审', childId: 'c-j1' })
check('judger+plan-review 记录通过', d1 === null, d1?.message ?? '')
check('记录带 purpose=plan-review', readJson().dispatches.at(-1)?.purpose === 'plan-review', JSON.stringify(readJson().dispatches.at(-1)))
const [d2] = recordExecutorDispatch(root, rel, { kind: 'judger', title: '追溯代码评审', childId: 'c-j2' })
check('judger 无 purpose 通过且记录不带 purpose', d2 === null && readJson().dispatches.at(-1)?.purpose === undefined, JSON.stringify(readJson().dispatches.at(-1)))
const [d3] = recordExecutorDispatch(root, rel, { kind: 'developer', purpose: 'plan-review', title: 'x', childId: 'c-d1' })
check('developer 带 purpose 被拒（role 分支校验）', d3 !== null && /only valid for checker or judger/.test(d3.message), d3?.message ?? '未拒绝')
const [d4] = recordExecutorDispatch(root, rel, { kind: 'checker', purpose: 'case-design', title: 'CASE 设计', childId: 'c-c1' })
check('checker+case-design 行为不变（通过）', d4 === null, d4?.message ?? '')
const [d5] = recordExecutorDispatch(root, rel, { kind: 'judger', purpose: 'case-design', title: 'y', childId: 'c-j3' })
check('judger 收 case-design 被拒（judger 只收 plan-review）', d5 !== null && /invalid judger purpose/.test(d5.message), d5?.message ?? '未拒绝')

// core 记录面不触碰 planReview 轨道（自动置位在 dsh 派发层，C7 步骤 3 测试定位）
const [, view] = readTaskView(root, rel)
check('judger 派发记录后 planReview 轨道保持 clean（core 记录面不自动置位）', view?.planReview === 'clean', String(view?.planReview))

rmSync(baseHome, { recursive: true, force: true })
console.log(failures === 0 ? 'C7 RESULT: ALL PASS' : `C7 RESULT: ${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
