#!/usr/bin/env node
/**
 * P3 端到端验证脚本（core API 级，直接调用构建产物）。
 *
 * 设计意图：
 * - 在 /tmp 临时项目根（.workloom 最小骨架）内，用 packages/core/dist 的
 *   构建产物实测子任务机制：parent 两种形式归一、children 反向联动、去重、
 *   listTasks 摘要 parent 字段、四类校验拒绝分支（不存在/自引用/状态/逃逸）。
 * - 每个断言打印 PASS/FAIL；任一 FAIL 立即置失败标志，全部通过才删除临时根。
 * - 输出逐用例记录，供 2.2 check 复用。
 *
 * @module verify-e2e.mjs
 */

import { mkdirSync, mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  createTask,
  listTasks,
  readTask,
  archiveTask,
} from '../../../packages/core/dist/legacy/task-store.js'
import { executeCreateTask } from '../../../packages/core/dist/service/task-ops.js'

const results = []
let failed = false

function check(name, cond, detail = '') {
  const pass = Boolean(cond)
  if (!pass) failed = true
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  [${detail}]` : ''}`)
}

function readTaskJson(root, rel) {
  return JSON.parse(readFileSync(join(root, '.workloom', rel, 'task.json'), 'utf8'))
}

function writeTaskJson(root, rel, record) {
  writeFileSync(join(root, '.workloom', rel, 'task.json'), `${JSON.stringify(record, null, 2)}\n`)
}

/** 由 slug 计算今天的子任务相对路径（tasks/<MM-DD>-<slug>）。 */
function childRelFor(slug) {
  const now = new Date()
  const mmdd = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  return join('tasks', `${mmdd}-${slug}`)
}

const root = mkdtempSync(join(tmpdir(), 'stm-e2e-'))
mkdirSync(join(root, '.workloom'))
console.log(`[setup] 临时项目根：${root}`)

try {
  // TC01 创建主任务（planning）
  const [parentErr, parent] = await createTask(root, {
    title: 'E2E Parent',
    slug: 'e2e-parent',
    priority: 'P1',
    description: 'P3 e2e parent',
  })
  check('TC01 创建主任务成功', parentErr === null, parentErr?.message ?? '')
  check('TC01 主任务状态为 planning', parent?.task?.status === 'planning', parent?.task?.status ?? '')
  check('TC01 主任务 parent 为空', parent?.task?.parent === null, String(parent?.task?.parent))
  check('TC01 主任务 children 为空数组', Array.isArray(parent?.task?.children) && parent.task.children.length === 0)
  const parentRelPath = parent.taskRelPath

  // TC02 两种 parent 形式创建两个子任务 → 归一为规范形
  const [errA, childA] = await createTask(root, {
    title: 'E2E Child A', slug: 'e2e-child-a', parent: parentRelPath,
  })
  const [errB, childB] = await createTask(root, {
    title: 'E2E Child B', slug: 'e2e-child-b', parent: parentRelPath.slice('tasks/'.length),
  })
  check('TC02 子任务 A 创建成功', errA === null, errA?.message ?? '')
  check('TC02 子任务 B 创建成功', errB === null, errB?.message ?? '')
  check('TC02 子任务 A parent 为规范形', childA?.task?.parent === parentRelPath, childA?.task?.parent ?? '')
  check('TC02 子任务 B parent 为规范形', childB?.task?.parent === parentRelPath, childB?.task?.parent ?? '')

  // TC03 主任务 children 联动追加两个 relPath
  const [, parentAfter] = readTask(root, parentRelPath)
  const childrenSerialized = JSON.stringify(parentAfter.children)
  check(
    'TC03 主任务 children 含两个子任务 relPath',
    childrenSerialized === JSON.stringify([childA.taskRelPath, childB.taskRelPath]),
    childrenSerialized,
  )

  // TC04 children 去重（预置父 children 含待创建路径，创建同路径子任务不重复追加）
  const [dedupParentErr, dedupParent] = await createTask(root, {
    title: 'E2E Dedup Parent', slug: 'e2e-dedup-parent', priority: 'P2',
  })
  check('TC04 去重父任务创建成功', dedupParentErr === null, dedupParentErr?.message ?? '')
  const dedupRel = childRelFor('e2e-dup-child')
  const dedupRecord = readTaskJson(root, dedupParent.taskRelPath)
  dedupRecord.children = [dedupRel]
  writeTaskJson(root, dedupParent.taskRelPath, dedupRecord)
  const [dupErr] = await createTask(root, {
    title: 'Dedup Child', slug: 'e2e-dup-child', parent: dedupParent.taskRelPath,
  })
  check('TC04 去重子任务创建成功', dupErr === null, dupErr?.message ?? '')
  const [, dedupAfter] = readTask(root, dedupParent.taskRelPath)
  check('TC04 children 去重不产生重复条目', JSON.stringify(dedupAfter.children) === JSON.stringify([dedupRel]), JSON.stringify(dedupAfter.children))

  // TC05 listTasks 摘要含 parent 字段且值正确
  const [listErr, list] = listTasks(root)
  check('TC05 listTasks 无错误', listErr === null, listErr?.message ?? '')
  const summaryA = list.find((t) => t.title === 'E2E Child A')
  const summaryB = list.find((t) => t.title === 'E2E Child B')
  const summaryP = list.find((t) => t.title === 'E2E Parent')
  check('TC05 摘要包含 parent 键', 'parent' in summaryA, summaryA ? `parent=${summaryA.parent}` : 'missing')
  check('TC05 子任务 A 摘要 parent 正确', summaryA?.parent === parentRelPath, summaryA?.parent ?? '')
  check('TC05 子任务 B 摘要 parent 正确', summaryB?.parent === parentRelPath, summaryB?.parent ?? '')
  check('TC05 主任务摘要 parent 为 null', summaryP?.parent === null, summaryP?.parent ?? '')

  // TC06 校验拒绝：parent 不存在（不产生写入）
  const [ghostErr, ghostResult] = await createTask(root, {
    title: 'Ghost Child', slug: 'e2e-ghost', parent: 'tasks/99-99-ghost',
  })
  check('TC06 parent 不存在被拒', ghostErr !== null && ghostResult === null, ghostErr?.message ?? '')
  check('TC06 拒绝消息为 parent task not found', /parent task not found/.test(ghostErr?.message ?? ''), ghostErr?.message ?? '')
  check('TC06 未创建子任务目录', !existsSync(join(root, '.workloom', childRelFor('e2e-ghost'))))

  // TC07 校验拒绝：自引用（即将创建的同 slug 路径）
  const [selfParentErr, selfParent] = await createTask(root, {
    title: 'E2E Self', slug: 'e2e-self', priority: 'P2',
  })
  check('TC07 自引用父任务创建成功', selfParentErr === null, selfParentErr?.message ?? '')
  const [selfErr] = await createTask(root, {
    title: 'E2E Self', parent: selfParent.taskRelPath,
  })
  check('TC07 自引用被拒', selfErr !== null, selfErr?.message ?? '')
  check('TC07 拒绝消息为 cannot be its own parent', /cannot be its own parent/.test(selfErr?.message ?? ''), selfErr?.message ?? '')

  // TC08 校验拒绝：parent 状态 archived/completed（归档后目录移入 archive/）
  const [archParentErr, archParent] = await createTask(root, {
    title: 'E2E Archived Parent', slug: 'e2e-archived', priority: 'P2',
  })
  check('TC08 归档父任务创建成功', archParentErr === null, archParentErr?.message ?? '')
  const [archErr, archived] = await archiveTask(root, {
    taskRelPath: archParent.taskRelPath, autoCommit: false, force: true, reason: 'e2e',
  })
  check('TC08 归档执行成功', archErr === null, archErr?.message ?? '')
  check('TC08 归档后路径迁入 archive/', /^tasks\/archive\//.test(archived?.taskRelPath ?? ''), archived?.taskRelPath ?? '')
  check('TC08 归档后状态 completed', archived?.status === 'completed', archived?.status ?? '')
  const [archivedChildErr] = await createTask(root, {
    title: 'Child Archived', slug: 'e2e-child-archived', parent: archived.taskRelPath,
  })
  check('TC08 archived parent 建子任务被拒', archivedChildErr !== null, archivedChildErr?.message ?? '')
  check('TC08 拒绝消息为 planning or in_progress', /planning or in_progress/.test(archivedChildErr?.message ?? ''), archivedChildErr?.message ?? '')

  // TC09 校验拒绝：就地置 completed（不归档）同样拒绝
  const [compParentErr, compParent] = await createTask(root, {
    title: 'E2E Completed Parent', slug: 'e2e-completed', priority: 'P2',
  })
  check('TC09 completed 父任务创建成功', compParentErr === null, compParentErr?.message ?? '')
  const compRecord = readTaskJson(root, compParent.taskRelPath)
  compRecord.status = 'completed'
  writeTaskJson(root, compParent.taskRelPath, compRecord)
  const [compChildErr] = await createTask(root, {
    title: 'Child Completed', slug: 'e2e-child-completed', parent: compParent.taskRelPath,
  })
  check('TC09 completed parent 建子任务被拒', compChildErr !== null, compChildErr?.message ?? '')
  check('TC09 拒绝消息为 planning or in_progress', /planning or in_progress/.test(compChildErr?.message ?? ''), compChildErr?.message ?? '')

  // TC10 校验拒绝：逃逸（../outside 被 normalize 后经 not-found 拒；../../outside 触发 insideWorkloom）
  const [escapeErr1] = await createTask(root, {
    title: 'Escape Child', slug: 'e2e-escape', parent: '../../outside',
  })
  check('TC10 parent=../../outside 被拒', escapeErr1 !== null, escapeErr1?.message ?? '')
  check('TC10 拒绝消息为 escapes .workloom directory', /escapes \.workloom directory/.test(escapeErr1?.message ?? ''), escapeErr1?.message ?? '')
  const [escapeErr2] = await createTask(root, {
    title: 'Escape Bare Child', slug: 'e2e-escape-bare', parent: '../outside',
  })
  check('TC10 parent=../outside 被拒', escapeErr2 !== null, escapeErr2?.message ?? '')

  // TC11 service 层透传（executeCreateTask 含 parent）
  const [srvParentErr, srvParent] = await executeCreateTask(root, 'dsh-e2e-session', {
    title: 'Service Parent', slug: 'e2e-srv-parent', priority: 'P2',
  })
  check('TC11 service 创建父任务成功', srvParentErr === null, srvParentErr?.message ?? '')
  const [srvChildErr, srvChild] = await executeCreateTask(root, 'dsh-e2e-session', {
    title: 'Service Child', slug: 'e2e-srv-child', parent: srvParent.taskRelPath,
  })
  check('TC11 service 创建子任务成功', srvChildErr === null, srvChildErr?.message ?? '')
  check('TC11 service 透传 parent 落盘规范形', srvChild?.task?.parent === srvParent.taskRelPath, srvChild?.task?.parent ?? '')
  check('TC11 service 父任务 children 联动', (readTaskJson(root, srvParent.taskRelPath).children ?? []).includes(srvChild.taskRelPath))
} catch (error) {
  failed = true
  console.error(`${error?.stack ?? error}`)
}

if (failed) {
  console.log(`\n[FAIL] 存在失败用例，保留临时根便于排查：${root}`)
  process.exit(1)
}
rmSync(root, { recursive: true, force: true })
console.log(`\n[PASS] 全部验证通过，已清理临时根：${root}`)
