/**
 * task-ops 模块单测：五个任务工具编排（create/start/finish/archive/list）。
 * 测试依赖 dist（test 脚本先 build 再跑 node --test），临时目录 setup 照
 * init.test.js 先例（mkdtemp + finally rmSync）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  computePrdHash,
  executeAlignTask,
  executeArchiveTask,
  executeCheckTask,
  executeCreateTask,
  executeFinishTask,
  executeListTasks,
  executeStartTask,
  readTask,
  recordAlignmentCredential,
  requireWorkloomCwd,
  resolveTaskRelPath,
} from '../dist/index.js'
import { initWorkloom } from '../dist/legacy/init.js'

/** 创建临时项目根（含 .workloom 骨架）。 */
function makeRoot() {
  const root = mkdtempSync(join(tmpdir(), 'workloom-taskops-'))
  initWorkloom(root)
  return root
}

/**
 * 满足 start 门禁：填 prd（含 H1）四小节 + 收敛 marker + 两个 jsonl 各一条有效记录。
 * start 与 review/confirm 共用同一结构分类器，因此 marker 也是放行条件之一。
 */
function satisfyStartGate(root, taskRelPath) {
  const taskDir = join(root, '.workloom', taskRelPath)
  writeFileSync(
    join(taskDir, 'prd.md'),
    '# Filled\n\n## Goal\n\nDo the thing.\n\n## Requirements\n\n- req\n\n## Acceptance Criteria\n\n- ac\n\n## Notes\n\n- note\n\n<!-- workloom:open-nodes=none -->\n',
  )
  writeFileSync(join(taskDir, 'implement.jsonl'), '{"file": "AGENTS.md", "reason": "spec"}\n')
  writeFileSync(join(taskDir, 'check.jsonl'), '{"file": "AGENTS.md", "reason": "spec"}\n')
}

/** 记录 alignment 凭据（hash 取当前 prd.md；窄写口直落，模拟 confirm 后状态）。 */
function alignTask(root, taskRelPath) {
  const prd = readFileSync(join(root, '.workloom', taskRelPath, 'prd.md'), 'utf8')
  const [err] = recordAlignmentCredential(root, taskRelPath, {
    summary: 'frontier empty, all decisions settled',
    prdHash: computePrdHash(prd),
  })
  assert.equal(err, null)
}

test('requireWorkloomCwd 空串抛错（消息含前缀）', () => {
  assert.throws(
    () => requireWorkloomCwd(''),
    /workloom task tool: cannot determine the working directory/,
  )
})

test('executeCreateTask 空串 slug/priority/description 不传（默认值兜底）', async () => {
  const root = makeRoot()
  try {
    const [err, result] = await executeCreateTask(root, 'dsh_t1', {
      title: 'Filter Empty',
      slug: '',
      priority: '',
      description: '',
    })
    assert.equal(err, null)
    // slug 不入记录字段：任务 name 由标题 slugify 兜底（空串 slug 未覆盖）。
    assert.equal(result.task.name, 'filter-empty')
    assert.equal(result.task.priority, 'P2')
    assert.equal(result.task.description, '')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('无活跃任务且无 taskPath 时报错', async () => {
  const root = makeRoot()
  try {
    const [err, task] = await executeStartTask(root, 'dsh_none', {})
    assert.ok(err)
    assert.match(err.message, /no active task and no taskPath given/)
    assert.equal(task, null)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('resolveTaskRelPath 无活跃任务错误携带调用方传入的前缀', () => {
  const root = makeRoot()
  try {
    assert.throws(
      () => resolveTaskRelPath(root, 'dsh_prefix', undefined, 'workloom task tool'),
      /workloom task tool: no active task and no taskPath given/,
    )
    assert.throws(
      () => resolveTaskRelPath(root, 'dsh_prefix', undefined, 'workloom executor'),
      /workloom executor: no active task and no taskPath given/,
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('create→start→check→finish→list→archive 全链（活跃任务 fallback）', async () => {
  const root = makeRoot()
  try {
    const contextKey = 'dsh_chain'
    // create：任务创建并设为活跃。
    const [, created] = await executeCreateTask(root, contextKey, { title: 'Chain Task' })
    assert.ok(created.taskRelPath.startsWith('tasks/'))
    assert.equal(created.task.status, 'planning')
    // start 门禁：骨架 prd 与 seed jsonl 被拒绝。
    const [gateErr] = await executeStartTask(root, contextKey, {})
    assert.ok(gateErr)
    assert.match(gateErr.message, /start gate failed/)
    // 填满 prd 与两个 jsonl、完成 alignment 后放行。
    satisfyStartGate(root, created.taskRelPath)
    alignTask(root, created.taskRelPath)
    const [, started] = await executeStartTask(root, contextKey, {})
    assert.equal(started.taskRelPath, created.taskRelPath)
    assert.equal(started.status, 'in_progress')
    // check：写 check 凭据（archive 门禁的前提）。
    const [checkErr, checked] = await executeCheckTask(root, contextKey, {
      summary: 'chain check passed',
    })
    assert.equal(checkErr, null)
    assert.equal(checked.check.summary, 'chain check passed')
    // finish：无 taskPath，fallback 到活跃任务（清指针）。
    const [, finished] = await executeFinishTask(root, contextKey, undefined)
    assert.equal(finished.taskRelPath, created.taskRelPath)
    assert.equal(finished.finished, true)
    // list：列出全部任务。
    const [, list] = await executeListTasks(root, undefined)
    assert.ok(list.tasks.some((task) => task.title === 'Chain Task'))
    // archive：显式必填 taskPath（finish 已清指针），note 引导加载 finish skill。
    const [, archived] = await executeArchiveTask(root, {
      taskPath: created.taskRelPath,
    })
    assert.equal(archived.task.status, 'completed')
    assert.match(archived.note, /load the workloom-finish skill to record the session journal/)
    assert.notEqual(archived.taskRelPath, created.taskRelPath)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('executeCheckTask 无 check.jsonl 有效记录被拒绝，force 放行', async () => {
  const root = makeRoot()
  try {
    const contextKey = 'dsh_check'
    const [, created] = await executeCreateTask(root, contextKey, { title: 'Check Ops' })
    // force 越过 start 门禁（本用例聚焦 check 编排）。
    const [, started] = await executeStartTask(root, contextKey, {
      force: true,
      reason: 'test bypass',
    })
    assert.equal(started.status, 'in_progress')
    const saved = JSON.parse(
      readFileSync(join(root, '.workloom', created.taskRelPath, 'task.json'), 'utf8'),
    )
    assert.equal(saved.overrides.length, 1)
    assert.equal(saved.overrides[0].gate, 'start')
    const [err1] = await executeCheckTask(root, contextKey, { summary: 'premature' })
    assert.ok(err1)
    assert.match(err1.message, /check gate failed/)
    const [err2, checked] = await executeCheckTask(root, contextKey, {
      summary: 'forced check',
      force: true,
      reason: 'test bypass',
    })
    assert.equal(err2, null)
    assert.equal(checked.check.summary, 'forced check')
    // archive 门禁：有 check 凭据后放行（taskPath 必填，显式绑定目标任务）。
    const [archErr, archived] = await executeArchiveTask(root, {
      taskPath: created.taskRelPath,
    })
    assert.equal(archErr, null)
    assert.equal(archived.task.status, 'completed')
    // 两次 force 豁免均留痕于归档后的 task.json。
    const finalJson = JSON.parse(
      readFileSync(join(root, '.workloom', archived.taskRelPath, 'task.json'), 'utf8'),
    )
    assert.deepEqual(
      finalJson.overrides.map((o) => o.gate),
      ['start', 'check'],
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('executeArchiveTask 缺 taskPath 拒绝（必填，不回退活跃任务）', async () => {
  const root = makeRoot()
  try {
    const contextKey = 'dsh_archive_required'
    const [, created] = await executeCreateTask(root, contextKey, { title: 'Required Path' })
    const [err, archived] = await executeArchiveTask(root, {})
    assert.ok(err)
    assert.match(err.message, /taskPath is required/)
    assert.equal(archived, null)
    // 任务保持原位，未被误归档。
    assert.ok(
      JSON.parse(readFileSync(join(root, '.workloom', created.taskRelPath, 'task.json'), 'utf8')),
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('executeListTasks 按 status 过滤', async () => {
  const root = makeRoot()
  try {
    await executeCreateTask(root, 'dsh_l1', { title: 'Planning Only' })
    const [, planning] = await executeListTasks(root, 'planning')
    assert.equal(planning.tasks.length, 1)
    const [, completed] = await executeListTasks(root, 'completed')
    assert.equal(completed.tasks.length, 0)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('executeCreateTask 透传 parent 并写回父 children', async () => {
  const root = makeRoot()
  try {
    const [, parent] = await executeCreateTask(root, 'dsh_parent', { title: 'Parent Ops' })
    const [err, child] = await executeCreateTask(root, 'dsh_child', {
      title: 'Child Ops',
      parent: parent.taskRelPath,
    })
    assert.equal(err, null)
    assert.equal(child.task.parent, parent.taskRelPath)
    const parentJson = JSON.parse(
      readFileSync(join(root, '.workloom', parent.taskRelPath, 'task.json'), 'utf8'),
    )
    assert.ok(parentJson.children.includes(child.taskRelPath))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('executeCreateTask 空串 parent 视同未传', async () => {
  const root = makeRoot()
  try {
    const [err, child] = await executeCreateTask(root, 'dsh_empty', {
      title: 'Empty Parent',
      parent: '',
    })
    assert.equal(err, null)
    assert.equal(child.task.parent, null)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('executeCreateTask 返回 nextStepNote（Phase 1.1 行动指引）', async () => {
  const root = makeRoot()
  try {
    const [err, result] = await executeCreateTask(root, 'dsh_note', { title: 'Note Task' })
    assert.equal(err, null)
    assert.ok(
      typeof result.nextStepNote === 'string' && result.nextStepNote !== '',
      'nextStepNote must be a non-empty string',
    )
    assert.match(result.nextStepNote, /workloom-alignment/)
    assert.match(result.nextStepNote, /workloom_task_align/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('executeStartTask 返回记录无 grillingPending/grillingNote（alignment 凭据语义）', async () => {
  const root = makeRoot()
  try {
    const [, created] = await executeCreateTask(root, 'dsh_ap', { title: 'Align Start' })
    satisfyStartGate(root, created.taskRelPath)
    // 未 alignment：planning start 被拦（指引 workloom_task_align）
    const [gateErr] = await executeStartTask(root, 'dsh_ap', {})
    assert.ok(gateErr)
    assert.match(gateErr.message, /alignment credential/)
    alignTask(root, created.taskRelPath)
    const [, started] = await executeStartTask(root, 'dsh_ap', {})
    assert.equal(started.status, 'in_progress')
    // 返回记录不再带 grilling 软提醒字段
    assert.equal(started.grillingPending, undefined)
    assert.equal(started.grillingNote, undefined)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

/** 完整可确认 prd（H1 + 四小节实填 + 收敛 marker，含 Alignment Decisions）。 */
const CONVERGED_ALIGN_PRD = `# Filled

## Goal

Do the thing.

## Requirements

- req

## Acceptance Criteria

- ac

## Notes

- note

## Alignment Decisions

- design tree converged

<!-- workloom:open-nodes=none -->
`

/** 创建任务并写入指定 prd 内容，返回 prd.md 绝对路径（骨架 prd 由 create 生成）。 */
async function makeAlignTask(root, contextKey, prdContent) {
  const [, created] = await executeCreateTask(root, contextKey, { title: 'Align Ops' })
  const prdPath = join(root, '.workloom', created.taskRelPath, 'prd.md')
  if (prdContent !== null) writeFileSync(prdPath, prdContent)
  return { taskRelPath: created.taskRelPath, prdPath }
}

test('align review：prd 文件缺失仍成功返回快照字段，并报 prd_missing blocker', async () => {
  const root = makeRoot()
  try {
    const contextKey = 'dsh_review_missing'
    const { prdPath, taskRelPath } = await makeAlignTask(root, contextKey, null)
    rmSync(prdPath, { force: true })
    const [err, review] = executeAlignTask(root, contextKey, { action: 'review' })
    assert.equal(err, null)
    assert.equal(review.action, 'review')
    assert.equal(review.taskRelPath, taskRelPath)
    assert.equal(review.status, 'planning')
    assert.equal(review.prd, null)
    assert.equal(review.prdHash, null)
    assert.equal(review.openNodeState, null)
    assert.deepEqual(review.structureIssues, [
      { code: 'prd_missing', message: 'prd.md is missing' },
    ])
    assert.deepEqual(review.confirmBlockers, ['prd.md is missing'])
    assert.equal(review.readyToConfirm, false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('align review：缺 ## Notes 标题报 section missing（不误报 placeholder）', async () => {
  const root = makeRoot()
  try {
    const contextKey = 'dsh_review_section'
    const missingNotes = CONVERGED_ALIGN_PRD.replace('## Notes\n\n- note\n\n', '')
    const { prdPath } = await makeAlignTask(root, contextKey, missingNotes)
    const [err, review] = executeAlignTask(root, contextKey, { action: 'review' })
    assert.equal(err, null)
    // review 只读：仍返回快照与 hash
    assert.equal(review.prd, missingNotes)
    assert.equal(review.prdHash, computePrdHash(readFileSync(prdPath, 'utf8')))
    assert.equal(review.openNodeState, 'none')
    assert.deepEqual(review.structureIssues, [
      {
        code: 'prd_section_missing',
        message: 'prd.md section "Notes" is missing',
        section: 'Notes',
      },
    ])
    assert.ok(!review.structureIssues.some((issue) => issue.message.includes('placeholder')))
    assert.deepEqual(review.confirmBlockers, ['prd.md section "Notes" is missing'])
    assert.equal(review.readyToConfirm, false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('align review：## Notes 保留但正文仍为 placeholder → placeholder blocker', async () => {
  const root = makeRoot()
  try {
    const contextKey = 'dsh_review_placeholder'
    const notesPlaceholder = CONVERGED_ALIGN_PRD.replace(
      '- note',
      '(placeholder: add notes and constraints)',
    )
    await makeAlignTask(root, contextKey, notesPlaceholder)
    const [err, review] = executeAlignTask(root, contextKey, { action: 'review' })
    assert.equal(err, null)
    assert.deepEqual(review.structureIssues, [
      {
        code: 'prd_section_placeholder',
        message: 'prd.md section "Notes" is still a placeholder',
        section: 'Notes',
      },
    ])
    assert.equal(review.readyToConfirm, false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('align review：H1 缺失与 open-nodes 非 none 各自返回可机器消费的 code', async () => {
  const root = makeRoot()
  try {
    const contextKey = 'dsh_review_multi'
    const noTitle = CONVERGED_ALIGN_PRD.replace('# Filled\n\n', '')
    await makeAlignTask(root, contextKey, noTitle)
    const [, noTitleReview] = executeAlignTask(root, contextKey, { action: 'review' })
    assert.deepEqual(noTitleReview.structureIssues, [
      { code: 'prd_title_missing', message: 'prd.md missing H1 title' },
    ])
    const pending = CONVERGED_ALIGN_PRD.replace('open-nodes=none', 'open-nodes=pending')
    writeFileSync(join(root, '.workloom', noTitleReview.taskRelPath, 'prd.md'), pending)
    const [, pendingReview] = executeAlignTask(root, contextKey, { action: 'review' })
    assert.equal(pendingReview.openNodeState, 'pending')
    assert.deepEqual(pendingReview.structureIssues, [
      {
        code: 'prd_open_nodes_not_none',
        message: 'prd.md open nodes are not converged (marker state: "pending")',
      },
    ])
    const noMarker = CONVERGED_ALIGN_PRD.replace('<!-- workloom:open-nodes=none -->\n', '')
    writeFileSync(join(root, '.workloom', noTitleReview.taskRelPath, 'prd.md'), noMarker)
    const [, noMarkerReview] = executeAlignTask(root, contextKey, { action: 'review' })
    assert.equal(noMarkerReview.openNodeState, null)
    assert.deepEqual(noMarkerReview.structureIssues, [
      { code: 'prd_open_nodes_missing', message: 'prd.md open-nodes marker is missing' },
    ])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('align review：内容完整的 prd → 无结构问题且 readyToConfirm', async () => {
  const root = makeRoot()
  try {
    const contextKey = 'dsh_review_ready'
    const { prdPath } = await makeAlignTask(root, contextKey, CONVERGED_ALIGN_PRD)
    // 未 alignment 不影响内容级就绪判定
    const [err, review] = executeAlignTask(root, contextKey, { action: 'review' })
    assert.equal(err, null)
    assert.deepEqual(review.structureIssues, [])
    assert.deepEqual(review.confirmBlockers, [])
    assert.equal(review.readyToConfirm, true)
    assert.equal(review.prdHash, computePrdHash(readFileSync(prdPath, 'utf8')))
    assert.equal(review.openNodeState, 'none')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('align confirm：多个内容问题只抛一个 Error，消息按固定顺序聚合全部 blocker', async () => {
  const root = makeRoot()
  try {
    const contextKey = 'dsh_confirm_multi'
    const broken = `## Requirements

(placeholder: list the functional requirements)

## Acceptance Criteria

- ac

## Notes

- note

<!-- workloom:open-nodes=pending -->
`
    const { taskRelPath } = await makeAlignTask(root, contextKey, broken)
    const [err] = executeAlignTask(root, contextKey, {
      action: 'confirm',
      expectedPrdHash: computePrdHash(broken),
      summary: 's',
    })
    assert.ok(err)
    assert.match(err.message, /confirm rejected: prd\.md content blockers:/)
    assert.deepEqual(
      err.message.split('\n').filter((line) => line.startsWith('- ')),
      [
        '- prd.md missing H1 title',
        '- prd.md section "Goal" is missing',
        '- prd.md section "Requirements" is still a placeholder',
        '- prd.md open nodes are not converged (marker state: "pending")',
      ],
    )
    // 失败零写入
    const [, after] = readTask(root, taskRelPath)
    assert.equal(after.alignment, null)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('align review/confirm：校验失败零写入、hash 冲突拒绝、同 hash 幂等不刷新', async () => {
  const root = makeRoot()
  try {
    const contextKey = 'dsh_align'
    const [, created] = await executeCreateTask(root, contextKey, { title: 'Align Ops' })
    const taskDir = join(root, '.workloom', created.taskRelPath)
    // 骨架 prd（占位符未填）→ confirm 拒绝且零写入（文案区分 missing 与 placeholder）
    const [rej1] = executeAlignTask(root, contextKey, {
      action: 'confirm',
      expectedPrdHash: 'x',
      summary: 's',
    })
    assert.ok(rej1)
    assert.match(rej1.message, /content blockers/)
    assert.match(rej1.message, /section "Notes" is still a placeholder/)
    const [, before] = readTask(root, created.taskRelPath)
    assert.equal(before.alignment, null)
    // confirm 缺 expectedPrdHash：显式拒绝（不落入 hash 失配的歧义文案）
    const [noHashErr] = executeAlignTask(root, contextKey, {
      action: 'confirm',
      summary: 's',
    })
    assert.ok(noHashErr)
    assert.match(noHashErr.message, /expectedPrdHash is required/)
    // 写入完整收敛 prd（含 Alignment Decisions + open-nodes=none）与 jsonl
    const converged = CONVERGED_ALIGN_PRD
    writeFileSync(join(taskDir, 'prd.md'), converged)
    writeFileSync(join(taskDir, 'implement.jsonl'), '{"file": "AGENTS.md", "reason": "spec"}\n')
    writeFileSync(join(taskDir, 'check.jsonl'), '{"file": "AGENTS.md", "reason": "spec"}\n')
    // review 只读：返回快照 + hash（零写盘）
    const [revErr, review] = executeAlignTask(root, contextKey, { action: 'review' })
    assert.equal(revErr, null)
    assert.equal(review.prd, converged)
    assert.equal(review.prdHash, computePrdHash(converged))
    // 开放节点 pending → confirm 拒绝
    writeFileSync(
      join(taskDir, 'prd.md'),
      converged.replace('workloom:open-nodes=none', 'workloom:open-nodes=pending'),
    )
    const [openErr] = executeAlignTask(root, contextKey, {
      action: 'confirm',
      expectedPrdHash: computePrdHash(converged.replace('workloom:open-nodes=none', 'workloom:open-nodes=pending')),
      summary: 's',
    })
    assert.ok(openErr)
    assert.match(openErr.message, /open nodes are not converged/)
    writeFileSync(join(taskDir, 'prd.md'), converged)
    // hash 冲突拒绝（expected 与当前 prd 不一致，零写入）
    const [conflictErr] = executeAlignTask(root, contextKey, {
      action: 'confirm',
      expectedPrdHash: 'deadbeef',
      summary: 'converged',
    })
    assert.ok(conflictErr)
    assert.match(conflictErr.message, /prd hash mismatch/)
    // 正确 hash confirm 成功并落凭据
    const [err2, confirmed] = executeAlignTask(root, contextKey, {
      action: 'confirm',
      expectedPrdHash: review.prdHash,
      summary: 'converged',
    })
    assert.equal(err2, null)
    assert.equal(confirmed.idempotent, false)
    assert.equal(confirmed.alignment.prdHash, review.prdHash)
    const [, taskAfter] = readTask(root, created.taskRelPath)
    assert.ok(taskAfter.alignment !== null)
    const passedAt = taskAfter.alignment.passedAt
    // 同 hash 重复 confirm 幂等：不刷新 passedAt、不覆盖 summary
    const [err3, again] = executeAlignTask(root, contextKey, {
      action: 'confirm',
      expectedPrdHash: review.prdHash,
      summary: 'converged again',
    })
    assert.equal(err3, null)
    assert.equal(again.idempotent, true)
    const [, taskFinal] = readTask(root, created.taskRelPath)
    assert.equal(taskFinal.alignment.passedAt, passedAt)
    assert.equal(taskFinal.alignment.summary, 'converged')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
