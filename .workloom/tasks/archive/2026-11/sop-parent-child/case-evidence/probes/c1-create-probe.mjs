// C1 探针：带 parent 创建嵌套落位、父子写回、指针分流与全库 slug 唯一。
// 只读 worktree 代码；夹具与 HOME/TMPDIR 隔离并自清理。
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'

const WORKTREE = '/data00/home/wangyubo.1219/workbench/code-src/github/workloom/.workloom/worktree/11-06-sop-parent-child'
const base = mkdtempSync(join(tmpdir(), 'workloom-case-c1-'))
process.env.HOME = base
process.env.TMPDIR = base
const core = await import(`${WORKTREE}/packages/core/src/index.ts`)

let failures = 0
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra === '' ? '' : ` — ${extra}`}`)
  if (!cond) failures++
}
const pad = (n) => String(n).padStart(2, '0')
const now = new Date()
const mmdd = `${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
const readJson = (rel) => JSON.parse(readFileSync(join(root, '.workloom', rel, 'task.json'), 'utf8'))
const pointerOf = (ctx) => JSON.parse(readFileSync(join(root, '.workloom', '.runtime', 'sessions', `${ctx}.json`), 'utf8')).current_task
const listTree = (dir = join(root, '.workloom', 'tasks'), prefix = '') => {
  const out = []
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`
    out.push(`${rel}${entry.isDirectory() ? '/' : ''}`)
    if (entry.isDirectory()) out.push(...listTree(join(dir, entry.name), rel))
  }
  return out
}
const mustOk = (label, tuple) => {
  const [err, value] = tuple
  if (err !== null) throw new Error(`${label}: ${err.message}`)
  return value
}

const root = join(base, 'project')
mkdirSync(root, { recursive: true })
mustOk('init', core.initWorkloom(root, {}))

try {
  // 1. 父任务（缺省 standard），显式把 c1_ctx 指针置 P1。
  const p1 = mustOk('create P1', await core.executeCreateTask(root, 'c1_ctx', { title: 'Parent One', package: 'repo' }))
  core.setActiveTask(root, 'c1_ctx', p1.taskRelPath)
  check('P1 指针写入', pointerOf('c1_ctx') === p1.taskRelPath, pointerOf('c1_ctx'))

  // 2. 裸 parent 名创建子任务：嵌套落位 + 父子双向写回。
  const c1 = mustOk(
    'create C1',
    await core.executeCreateTask(root, 'c1_ctx', {
      title: 'Child Alpha',
      package: 'repo',
      parent: basename(p1.taskRelPath),
    }),
  )
  const expectedC1 = join(p1.taskRelPath, 'subtasks', `${mmdd}-child-alpha`)
  check('C1 嵌套落位', c1.taskRelPath === expectedC1, `${c1.taskRelPath} vs ${expectedC1}`)
  for (const file of ['task.json', 'prd.md', 'implement.jsonl', 'check.jsonl']) {
    check(`C1 目录含 ${file}`, existsSync(join(root, '.workloom', c1.taskRelPath, file)))
  }
  check('C1 parent 字段为规范路径', readJson(c1.taskRelPath).parent === p1.taskRelPath, String(readJson(c1.taskRelPath).parent))
  const p1After = readJson(p1.taskRelPath)
  check('P1 children 含嵌套规范路径', p1After.children.length === 1 && p1After.children[0] === c1.taskRelPath, JSON.stringify(p1After.children))
  check('P1 mode 归一 parent', p1After.mode === 'parent', String(p1After.mode))
  check('带 parent 创建不抢指针', pointerOf('c1_ctx') === p1.taskRelPath, pointerOf('c1_ctx'))

  // 3. 无 parent 创建维持抢指针。
  const t1 = mustOk('create T1', await core.executeCreateTask(root, 'c1_ctx', { title: 'Top Level', package: 'repo' }))
  check('无 parent 创建切指针', pointerOf('c1_ctx') === t1.taskRelPath, pointerOf('c1_ctx') === t1.taskRelPath ? '' : pointerOf('c1_ctx'))

  // 4. 查重四形态（独立 contextKey，失败后指针不动）。
  core.setActiveTask(root, 'c1_dup', p1.taskRelPath)
  const p2 = mustOk('create P2', await core.executeCreateTask(root, 'c1_dup', { title: 'Parent Two', package: 'repo' }))
  core.setActiveTask(root, 'c1_dup', p1.taskRelPath)

  const expectReject = async (label, params, extra) => {
    const before = listTree()
    const [err, result] = await core.executeCreateTask(root, 'c1_dup', params)
    extra?.(err, result)
    check(`${label} 写盘前拒绝`, err !== null && result === null, err?.message ?? 'no error')
    check(`${label} 零写入`, JSON.stringify(listTree()) === JSON.stringify(before))
    check(`${label} 指针不动`, pointerOf('c1_dup') === p1.taskRelPath, pointerOf('c1_dup'))
  }

  await expectReject('另一父 subtasks 层同名', { title: 'Child Alpha', package: 'repo', parent: p2.taskRelPath }, (err) => {
    check('另一父同名拒绝文案', /slug already exists in active tree: child-alpha/.test(err?.message ?? ''), err?.message ?? '')
    check('P2 children 仍为空', (readJson(p2.taskRelPath).children ?? []).length === 0)
    check('P2 下无目标子目录', !existsSync(join(root, '.workloom', p2.taskRelPath, 'subtasks', `${mmdd}-child-alpha`)))
  })

  mustOk('create top dup-b', await core.executeCreateTask(root, 'c1_ctx', { title: 'Dup B', package: 'repo' }))
  await expectReject('顶层同名', { title: 'Dup B', package: 'repo', parent: p1.taskRelPath }, (err) => {
    check('顶层同名拒绝文案', /slug already exists in active tree: dup-b/.test(err?.message ?? ''), err?.message ?? '')
    check('无嵌套 dup-b 目录', !existsSync(join(root, '.workloom', p1.taskRelPath, 'subtasks', `${mmdd}-dup-b`)))
  })

  mkdirSync(join(root, '.workloom', 'tasks', `02-02-dup-c`), { recursive: true })
  await expectReject('任意日期前缀同名', { title: 'Dup C', package: 'repo', parent: p1.taskRelPath }, (err) => {
    check('日期前缀同名拒绝文案', /slug already exists in active tree: dup-c/.test(err?.message ?? ''), err?.message ?? '')
  })

  // archive 不参与活跃树查重：先建归档区同名目录，再创建同 slug 嵌套子任务应成功。
  mkdirSync(join(root, '.workloom', 'tasks', 'archive', '2026-01', `01-01-dup-d`), { recursive: true })
  const dupD = mustOk(
    'create nested dup-d',
    await core.executeCreateTask(root, 'c1_dup', { title: 'Dup D', package: 'repo', parent: p1.taskRelPath }),
  )
  check('archive 不参与查重（创建成功）', dupD.taskRelPath === join(p1.taskRelPath, 'subtasks', `${mmdd}-dup-d`), dupD.taskRelPath)
  check('dup-d 父 children 追加', readJson(p1.taskRelPath).children.includes(dupD.taskRelPath))
  check('成功带 parent 创建仍不抢指针', pointerOf('c1_dup') === p1.taskRelPath, pointerOf('c1_dup'))

  // 5. 嵌套目标冲突：同父同 slug 再建一次。
  await expectReject('同父重复同名', { title: 'Child Alpha', package: 'repo', parent: p1.taskRelPath }, (err) => {
    check('同父重复拒绝文案', /slug already exists in active tree|task directory already exists/.test(err?.message ?? ''), err?.message ?? '')
    const hits = readJson(p1.taskRelPath).children.filter((p) => p === c1.taskRelPath)
    check('P1 children 仅一条 dup-a', hits.length === 1, JSON.stringify(hits))
  })
} finally {
  rmSync(base, { recursive: true, force: true })
}

console.log(failures === 0 ? 'C1 RESULT: PASS' : `C1 RESULT: FAIL (${failures})`)
process.exit(failures === 0 ? 0 : 1)
