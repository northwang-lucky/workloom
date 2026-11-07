// C3：模式兼容读与 parent 双路认定探针。
import assert from 'node:assert/strict'
import { rmSync } from 'node:fs'
import { core, makeRoot, baseRecord, writeTask } from './probe-lib.mjs'

const { createTask, readTaskView, MODES } = core
const root = makeRoot('wl-c3-')
try {
  // 1. 旧 full 记录读作 standard，旧 stage 值映射新枚举。
  const rel1 = writeTask(root, 'tasks/c3-legacy-full', baseRecord({
    name: 'c3-legacy-full', status: 'in_progress', mode: 'full', stage: 'implement',
  }))
  const [e1, v1] = readTaskView(root, rel1)
  assert.equal(e1, null, e1?.message)
  assert.equal(v1.mode, 'standard')
  assert.equal(v1.stage, 'implementing')
  console.log(`[c3] legacy full/implement/in_progress -> mode=${v1.mode}, stage=${v1.stage}`)

  // 2. 旧归档记录（completed + 归档路径 + 旧 stage check）读作 archived 视图，双字段一致。
  const rel2 = writeTask(root, 'tasks/archive/2026-10/c3-archived', baseRecord({
    name: 'c3-archived', status: 'completed', mode: 'full', stage: 'check',
    completedAt: '2026-10-30T00:00:00.000Z',
  }))
  const [e2, v2] = readTaskView(root, rel2)
  assert.equal(e2, null, e2?.message)
  assert.equal(v2.stage, 'archived')
  assert.equal(v2.status, 'completed')
  console.log(`[c3] legacy completed archive record -> stage=${v2.stage}, status=${v2.status} (consistent)`)

  // 3. 未映射 stage 值报可判定错误。
  const rel3 = writeTask(root, 'tasks/c3-bad-stage', baseRecord({
    name: 'c3-bad-stage', status: 'in_progress', stage: 'bogus',
  }))
  const [e3, v3] = readTaskView(root, rel3)
  assert.ok(e3)
  assert.equal(v3, null)
  assert.match(e3.message, /unmapped stage value/)
  console.log(`[c3] unmapped stage rejected: ${e3.message}`)

  // 4. 参数路一：createTask mode=parent。
  const [e4, p4] = await createTask(root, { title: 'C3 Parent Param', mode: 'parent' })
  assert.equal(e4, null, e4?.message)
  const [, v4] = readTaskView(root, p4.taskRelPath)
  assert.equal(v4.mode, 'parent')
  console.log(`[c3] createTask mode=parent -> mode=${v4.mode}`)

  // 5. 参数路二：params.parent 把被指向父任务归一为 parent（写路径认定）。
  const [e5h, host] = await createTask(root, { title: 'C3 Host Standard' })
  assert.equal(e5h, null, e5h?.message)
  const [, hv0] = readTaskView(root, host.taskRelPath)
  assert.equal(hv0.mode, 'standard')
  const [e5k, kid] = await createTask(root, { title: 'C3 Kid Light', mode: 'light', parent: host.taskRelPath })
  assert.equal(e5k, null, e5k?.message)
  const [, hv1] = readTaskView(root, host.taskRelPath)
  assert.equal(hv1.mode, 'parent')
  assert.deepEqual(hv1.children, [kid.taskRelPath])
  const [, kv] = readTaskView(root, kid.taskRelPath)
  assert.equal(kv.mode, 'light')
  console.log(`[c3] params.parent normalization: host standard -> ${hv1.mode}, children=${JSON.stringify(hv1.children)}; child keeps param mode=${kv.mode} (param wins over inference)`)

  // 6. 兜底推断路：children 非空且 mode 缺省或旧值 full 读作 parent。
  const rel6 = writeTask(root, 'tasks/c3-infer-default', baseRecord({
    name: 'c3-infer-default', status: 'in_progress', children: ['tasks/c3-phantom'],
  }))
  const [, v6] = readTaskView(root, rel6)
  assert.equal(v6.mode, 'parent')
  const rel7 = writeTask(root, 'tasks/c3-infer-full', baseRecord({
    name: 'c3-infer-full', status: 'in_progress', mode: 'full', children: ['tasks/c3-phantom'],
  }))
  const [, v7] = readTaskView(root, rel7)
  assert.equal(v7.mode, 'parent')
  console.log(`[c3] fallback inference: children non-empty, mode absent -> ${v6.mode}; mode full -> ${v7.mode}`)

  // 7. MODES 值域恰为三值，不含 full。
  assert.deepEqual([...Object.values(MODES)].sort(), ['light', 'parent', 'standard'])
  assert.ok(!Object.values(MODES).includes('full'))
  console.log(`[c3] MODES = ${JSON.stringify(Object.values(MODES))} (no full)`)

  // 8. 旧 full 不再是合法创建入参。
  const [e8] = await createTask(root, { title: 'C3 Full Create', mode: 'full' })
  assert.ok(e8)
  assert.match(e8.message, /invalid mode/)
  console.log(`[c3] createTask mode=full rejected: ${e8.message}`)

  console.log('C3_OK: legacy full reads standard; parent via param and fallback both work; MODES has no full')
} finally {
  rmSync(root, { recursive: true, force: true })
}
