// C2 占用取数三级探针：in-flight 登记模型、dispatches 记录模型（含旧 kind 归一）、
// native 无记录留空保守归一。只读 worktree 代码；夹具建在隔离 HOME/TMPDIR 下并自清理。
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const WORKTREE = '/data00/home/wangyubo.1219/workbench/code-src/github/workloom/.workloom/worktree/11-08-rotate-on-busy'
const base = mkdtempSync(join(tmpdir(), 'workloom-case-c2-occ-'))
process.env.HOME = base
process.env.TMPDIR = base

const capacity = await import(`${WORKTREE}/packages/dsh-workloom/src/dispatch/executor-capacity.ts`)

let failures = 0
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra === '' ? '' : ` — ${extra}`}`)
  if (!cond) failures++
}

const root = join(base, 'project')
mkdirSync(join(root, '.workloom', 'tasks', 'test-task'), { recursive: true })
writeFileSync(
  join(root, '.workloom', 'tasks', 'test-task', 'task.json'),
  JSON.stringify(
    {
      status: 'planning',
      title: 'Test',
      slug: 'test-task',
      priority: 'P2',
      dispatches: [
        {
          kind: 'implement', // 旧 kind 值：归一后应计入 developer 占用
          childId: 'child-a',
          title: 'seed legacy',
          status: 'running',
          at: new Date().toISOString(),
          model: 'provider-b/fb1',
        },
        {
          kind: 'developer',
          childId: 'child-b',
          title: 'seed no model',
          status: 'running',
          at: new Date().toISOString(),
        },
      ],
    },
    null,
    2,
  ),
)

const service = {
  async listDescendants() {
    return [
      { kind: 'child', id: 'child-a', parentId: 'parent-1', depth: 1, activity: 'running', mode: 'continuable', label: '[Developer] a' },
      { kind: 'child', id: 'child-b', parentId: 'parent-1', depth: 1, activity: 'running', mode: 'continuable', label: '[Developer] b' },
      { kind: 'child', id: 'child-c', parentId: 'parent-1', depth: 1, activity: 'completed', mode: 'continuable', label: '[Developer] c' },
    ]
  },
}

const parent = { id: 'parent-1' }

try {
  capacity.clearInFlightDispatches()
  // 一级来源：in-flight 登记携带模型。
  capacity.registerInFlightDispatch('dispatch-probe', 'developer', 'provider-a/fb2')
  const inflight = capacity.getInFlightDispatches()
  check('一级: in-flight 记录携带 model', inflight[0]?.model === 'provider-a/fb2', JSON.stringify(inflight))

  const records = await capacity.collectRunningExecutors(
    service,
    parent,
    new AbortController().signal,
    root,
    'tasks/test-task',
  )
  const byId = new Map(records.map((record) => [record.childId, record]))

  // 二级来源：dispatches 记录取 model，旧 kind 值经视图/归一后角色为 developer。
  check('二级: child-a 角色归一为 developer', byId.get('child-a')?.role === 'developer', JSON.stringify(byId.get('child-a')))
  check('二级: child-a 取 dispatches 记录 model', byId.get('child-a')?.model === 'provider-b/fb1', JSON.stringify(byId.get('child-a')))
  // 三级入口：native 无记录项留空（model 字段不出现；completed 不计入）。
  check('三级: child-b 无记录留空 model 字段', byId.has('child-b') && !('model' in byId.get('child-b')), JSON.stringify(byId.get('child-b')))
  check('collect: completed 记录不计入', !byId.has('child-c'))

  const used = capacity.collectUsedModels(records, 'developer', '<parent session>')
  const usedList = [...used].sort()
  check('collectUsedModels: 含旧值记录的模型 provider-b/fb1', used.has('provider-b/fb1'), JSON.stringify(usedList))
  check('collectUsedModels: 含 in-flight 模型 provider-a/fb2', used.has('provider-a/fb2'), JSON.stringify(usedList))
  check('collectUsedModels: 缺模型项保守归一主模型位', used.has('<parent session>'), JSON.stringify(usedList))
  const researcherUsed = capacity.collectUsedModels(records, 'researcher', '<parent session>')
  check('collectUsedModels: 异角色不参与', researcherUsed.size === 0, JSON.stringify([...researcherUsed]))

  // 释放后 in-flight 记录消失，占用集合不再含该模型。
  capacity.releaseInFlightDispatch('dispatch-probe')
  const afterRelease = capacity.collectUsedModels(
    capacity.getInFlightDispatches(),
    'developer',
    '<parent session>',
  )
  check('释放后: in-flight 模型不再计入', !afterRelease.has('provider-a/fb2'), JSON.stringify([...afterRelease]))
} finally {
  capacity.clearInFlightDispatches()
  rmSync(base, { recursive: true, force: true })
}

console.log(failures === 0 ? 'C2 OCCUPANCY PROBE: ALL PASS' : `C2 OCCUPANCY PROBE: ${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
