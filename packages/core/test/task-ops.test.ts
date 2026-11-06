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

import { markTaskLegacy } from './fixtures/task-artifacts.js'

import { archiveTask } from '../src/task/task-store.js'
import {
  executeAlignTask,
  executeArchiveTask,
  executeCheckTask,
  executeCreateTask,
  executeFinishTask,
  executeListTasks,
  executeStartTask,
  readTask,
  recordAlignmentCredential,
  recordPlanConfirmation,
  requireWorkloomCwd,
  resolveTaskRelPath,
} from '../src/index.ts'
import { initWorkloom } from '../src/workspace/init.ts'

// 测试隔离：core 三层配置的全局层读 $HOME/.workloom/config（调用链无 homeDir 注入
// 缝时吃 os.homedir 实时值）；本机真实全局配置会泄漏进单测。重定向 HOME 到临时目录
// 使全局层恒为空（与 config.test.ts 的 homeDir 注入、executor.test.ts 的重定向同口径）。
const isolatedHome = mkdtempSync(join(tmpdir(), 'workloom-core-home-'))
// TMPDIR 一并指向隔离目录：夹具临时目录随之落在 HOME 之内，findWorkloomRoot 的
// 上溯在 HOME 边界停下（与真实环境“家目录为上溯边界”的语义一致），不会误发现
// 本机真实家目录的 .workloom。
process.env.HOME = isolatedHome
process.env.TMPDIR = isolatedHome


/** 创建临时项目根（含 .workloom 骨架）。 */
function makeRoot() {
  const root = mkdtempSync(join(tmpdir(), 'workloom-taskops-'))
  initWorkloom(root)
  // 非 git fixture：关闭 worktree（enabled=false 全链路零行为变化，本文件聚焦任务工具编排）。
  writeFileSync(join(root, '.workloom', 'config.local.json'), JSON.stringify({ worktree: { enabled: false } }))
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
    '# Filled\n\n## Context\n\nThe gate harness needs a filled sample.\n\n## Goal\n\nDo the thing.\n\n## Scope\n\nIn scope: the thing itself. Non-goals: none.\n\n## Assumptions, Constraints and Dependencies\n\nNo new dependencies beyond the gate harness.\n\n## Requirements\n\n- R1: the thing happens by default\n\n## Acceptance Criteria\n\n- AC1（覆盖 R1）: the thing is observable. Verification: run the gate tests.\n\n## Edge Cases and Failure Paths\n\nNone: no boundary conditions beyond the gate itself.\n\n## Risks and Open Questions\n\nNone: no open questions remain.\n\n## Alignment Decisions\n\n- design tree converged\n\n## References\n\nNone.\n\n## Notes\n\n- note\n',
  )
  // 完整实施任务 start 还要求 PLAN（夹具 prd 无 AC 编号，最小 plan 即可通过）。
  writeFileSync(
    join(taskDir, 'plan.md'),
    '# Plan\n\n## Steps\n\n#### 步骤 1.1 implement\n\n- Covers: AC1\n- Target: src/a.js\n- Edit:\n  Input: adjust src/a.js behavior.\n  Output: function returns updated result.\n  Preconditions: none\n  Procedure: edit the guarded branch per anchors.\n  Failure: none\n- Verify: pnpm lint\n',
  )
  writeFileSync(join(taskDir, 'implement.jsonl'), '{"file": "AGENTS.md", "reason": "spec"}\n')
  writeFileSync(join(taskDir, 'check.jsonl'), '{"file": "AGENTS.md", "reason": "spec"}\n')
}

/** 记录 PRD 内容确认（窄写口直落，模拟 confirm 后状态）。 */
function alignTask(root, taskRelPath) {
  const [err] = recordAlignmentCredential(root, taskRelPath, {
    summary: 'frontier empty, all decisions settled',
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
      package: 'repo',
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

test('executeCreateTask mode：仅接受 light（缺省 full），非法取值 fail loud', async () => {
  const root = makeRoot()
  try {
    const [lightErr, light] = await executeCreateTask(root, 'dsh_mode_light', {
      title: 'Light Ops',
      package: 'repo',
      mode: 'light',
    })
    assert.equal(lightErr, null)
    assert.equal(light.task.mode, 'light')
    // light 任务的下一步指引走轻量轨（免对齐/免 jsonl），不引导 Phase 1.1。
    assert.match(light.nextStepNote, /Light task created/)
    assert.match(light.nextStepNote, /skip Phase 1\.1 alignment/)
    const [fullErr, full] = await executeCreateTask(root, 'dsh_mode_full', {
      title: 'Full Ops',
      package: 'repo',
    })
    assert.equal(fullErr, null)
    assert.equal(full.task.mode, 'full')
    assert.match(full.nextStepNote, /Phase 1\.1 alignment runs automatically/)
    for (const mode of ['full', 'fast']) {
      const [err, result] = await executeCreateTask(root, `dsh_mode_bad_${mode}`, {
        title: `Bad ${mode}`,
        package: 'repo',
        mode,
      })
      assert.ok(err, `${mode} must be rejected`)
      assert.match(err.message, /invalid mode/)
      assert.equal(result, null)
    }
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
    const [, created] = await executeCreateTask(root, contextKey, { title: 'Chain Task', package: 'repo' })
    assert.ok(created.taskRelPath.startsWith('tasks/'))
    assert.equal(created.task.status, 'planning')
    // start 门禁：骨架 prd 与 seed jsonl 被拒绝。
    const [gateErr] = await executeStartTask(root, contextKey, {})
    assert.ok(gateErr)
    assert.match(gateErr.message, /start gate failed/)
    // 填满 prd 与两个 jsonl、记录 PRD/PLAN 两份内容确认后放行。
    satisfyStartGate(root, created.taskRelPath)
    alignTask(root, created.taskRelPath)
    recordPlanConfirmation(root, created.taskRelPath, {
      summary: 'plan covers every AC, steps verified',
    })
    const [, started] = await executeStartTask(root, contextKey, {})
    assert.equal(started.taskRelPath, created.taskRelPath)
    assert.equal(started.status, 'in_progress')
    // 旧任务形态（case=null）：本测试聚焦编排链路，CASE 链路在 case.test.js。
    markTaskLegacy(root, created.taskRelPath)
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
    const [, created] = await executeCreateTask(root, contextKey, { title: 'Check Ops', package: 'repo' })
    // force 越过 start 门禁（本用例聚焦 check 编排）。
    const [, started] = await executeStartTask(root, contextKey, {
      force: true,
      reason: 'test bypass',
    })
    assert.equal(started.status, 'in_progress')
    // 旧任务形态（case=null）：本测试聚焦 check/archive 编排与 force 留痕。
    markTaskLegacy(root, created.taskRelPath)
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
    const [, created] = await executeCreateTask(root, contextKey, { title: 'Required Path', package: 'repo' })
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
    await executeCreateTask(root, 'dsh_l1', { title: 'Planning Only', package: 'repo' })
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
    const [, parent] = await executeCreateTask(root, 'dsh_parent', { title: 'Parent Ops', package: 'repo' })
    const [err, child] = await executeCreateTask(root, 'dsh_child', {
      title: 'Child Ops',
      package: 'repo',
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
      package: 'repo',
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
    const [err, result] = await executeCreateTask(root, 'dsh_note', { title: 'Note Task', package: 'repo' })
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
    const [, created] = await executeCreateTask(root, 'dsh_ap', { title: 'Align Start', package: 'repo' })
    satisfyStartGate(root, created.taskRelPath)
    // 未 alignment：planning start 被拦（指引 workloom_task_align）
    const [gateErr] = await executeStartTask(root, 'dsh_ap', {})
    assert.ok(gateErr)
    assert.match(gateErr.message, /alignment credential/)
    alignTask(root, created.taskRelPath)
    recordPlanConfirmation(root, created.taskRelPath, {
      summary: 'plan covers every AC, steps verified',
    })
    const [, started] = await executeStartTask(root, 'dsh_ap', {})
    assert.equal(started.status, 'in_progress')
    // 返回记录不再带 grilling 软提醒字段
    assert.equal(started.grillingPending, undefined)
    assert.equal(started.grillingNote, undefined)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

/** 完整可确认 prd（H1 + 十一小节实填 + R/AC 追踪 + 收敛 marker）。 */
const CONVERGED_ALIGN_PRD = `# Filled

## Context

The gate harness needs a filled sample.

## Goal

Do the thing.

## Scope

In scope: the thing itself. Non-goals: none.

## Assumptions, Constraints and Dependencies

No new dependencies beyond the gate harness.

## Requirements

- R1: the thing happens by default

## Acceptance Criteria

- AC1（覆盖 R1）: the thing is observable. Verification: run the gate tests.

## Edge Cases and Failure Paths

None: no boundary conditions beyond the gate itself.

## Risks and Open Questions

None: no open questions remain.

## Alignment Decisions

- design tree converged

## References

None.

## Notes

- note
`

/** 创建任务并写入指定 prd 内容，返回 prd.md 绝对路径（骨架 prd 由 create 生成）。 */
async function makeAlignTask(root, contextKey, prdContent) {
  const [, created] = await executeCreateTask(root, contextKey, { title: 'Align Ops', package: 'repo' })
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
    assert.equal(review.target, 'prd')
    assert.equal(review.taskRelPath, taskRelPath)
    assert.equal(review.status, 'planning')
    assert.equal(review.prd, null)
    assert.equal(review.plan, null)
    assert.deepEqual(review.structureIssues, [
      { code: 'prd_missing', message: 'prd.md is missing' },
    ])
    assert.deepEqual(review.confirmBlockers, ['prd.md is missing'])
    assert.equal(review.readyToConfirm, false)
    assert.equal(review.alignment, null)
    assert.equal(review.planConfirmation, null)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('align review：缺 ## Notes 标题报 section missing（不误报 placeholder）', async () => {
  const root = makeRoot()
  try {
    const contextKey = 'dsh_review_section'
    const missingNotes = CONVERGED_ALIGN_PRD.replace('## Notes\n\n- note\n', '')
    await makeAlignTask(root, contextKey, missingNotes)
    const [err, review] = executeAlignTask(root, contextKey, { action: 'review' })
    assert.equal(err, null)
    // review 只读：返回内容快照（无哈希字段）
    assert.equal(review.prd, missingNotes)
    assert.equal('prdHash' in review, false)
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

test('align review：小节正文仍为 placeholder → placeholder blocker', async () => {
  const root = makeRoot()
  try {
    const contextKey = 'dsh_review_placeholder'
    // References 正文整体替换为骨架占位文案（收敛 marker 在 Notes 节内，不影响本断言）
    const notesPlaceholder = CONVERGED_ALIGN_PRD.replace(
      'None.',
      '(placeholder: link the research reports, specs, and external sources this PRD relies on; write none when there are none)',
    )
    await makeAlignTask(root, contextKey, notesPlaceholder)
    const [err, review] = executeAlignTask(root, contextKey, { action: 'review' })
    assert.equal(err, null)
    assert.deepEqual(review.structureIssues, [
      {
        code: 'prd_section_placeholder',
        message: 'prd.md section "References" is still a placeholder',
        section: 'References',
      },
    ])
    assert.equal(review.readyToConfirm, false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('align review：H1 缺失返回可机器消费的 code；无标记与旧标记文本均不参与判断', async () => {
  const root = makeRoot()
  try {
    const contextKey = 'dsh_review_multi'
    const noTitle = CONVERGED_ALIGN_PRD.replace('# Filled\n\n', '')
    await makeAlignTask(root, contextKey, noTitle)
    const [, noTitleReview] = executeAlignTask(root, contextKey, { action: 'review' })
    assert.deepEqual(noTitleReview.structureIssues, [
      { code: 'prd_title_missing', message: 'prd.md missing H1 title' },
    ])
    // 无标记的合法 prd：review 零结构问题（开放节点标记已删除）
    writeFileSync(join(root, '.workloom', noTitleReview.taskRelPath, 'prd.md'), CONVERGED_ALIGN_PRD)
    const [, cleanReview] = executeAlignTask(root, contextKey, { action: 'review' })
    assert.deepEqual(cleanReview.structureIssues, [])
    assert.equal(cleanReview.readyToConfirm, true)
    // 历史文件中的旧 pending 标记只作为普通文本保留，不参与任何逻辑
    const legacy = `${CONVERGED_ALIGN_PRD}\n<!-- workloom:open-nodes=pending -->\n`
    writeFileSync(join(root, '.workloom', noTitleReview.taskRelPath, 'prd.md'), legacy)
    const [, legacyReview] = executeAlignTask(root, contextKey, { action: 'review' })
    assert.deepEqual(legacyReview.structureIssues, [])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('align review：内容完整的 prd → 无结构问题且 readyToConfirm', async () => {
  const root = makeRoot()
  try {
    const contextKey = 'dsh_review_ready'
    await makeAlignTask(root, contextKey, CONVERGED_ALIGN_PRD)
    // 未确认不影响内容级就绪判定
    const [err, review] = executeAlignTask(root, contextKey, { action: 'review' })
    assert.equal(err, null)
    assert.deepEqual(review.structureIssues, [])
    assert.deepEqual(review.confirmBlockers, [])
    assert.equal(review.readyToConfirm, true)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('align confirm：多个内容问题只抛一个 Error，消息按固定顺序聚合全部 blocker', async () => {
  const root = makeRoot()
  try {
    const contextKey = 'dsh_confirm_multi'
    const broken = `## Requirements

(placeholder: group requirements by capability or behavior as numbered items R1, R2, ...; each item is one necessary, decidable statement; do not transcribe Q&A rounds)

## Acceptance Criteria

- ac

## Notes

- note
`
    const { taskRelPath } = await makeAlignTask(root, contextKey, broken)
    const [err] = executeAlignTask(root, contextKey, {
      action: 'confirm',
      summary: 's',
    })
    assert.ok(err)
    assert.match(err.message, /confirm rejected: prd\.md content blockers:/)
    assert.deepEqual(
      err.message.split('\n').filter((line) => line.startsWith('- ')),
      [
        '- prd.md missing H1 title',
        '- prd.md section "Context" is missing',
        '- prd.md section "Goal" is missing',
        '- prd.md section "Scope" is missing',
        '- prd.md section "Assumptions, Constraints and Dependencies" is missing',
        '- prd.md section "Requirements" is still a placeholder',
        '- prd.md section "Edge Cases and Failure Paths" is missing',
        '- prd.md section "Risks and Open Questions" is missing',
        '- prd.md section "Alignment Decisions" is missing',
        '- prd.md section "References" is missing',
      ],
    )
    // 失败零写入
    const [, after] = readTask(root, taskRelPath)
    assert.equal(after.alignment, null)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('align confirm：校验失败零写入、结构通过即落确认记录（无哈希入参）', async () => {
  const root = makeRoot()
  try {
    const contextKey = 'dsh_align'
    const [, created] = await executeCreateTask(root, contextKey, { title: 'Align Ops', package: 'repo' })
    const taskDir = join(root, '.workloom', created.taskRelPath)
    // 骨架 prd（占位符未填）→ confirm 拒绝且零写入（文案区分 missing 与 placeholder）
    const [rej1] = executeAlignTask(root, contextKey, {
      action: 'confirm',
      summary: 's',
    })
    assert.ok(rej1)
    assert.match(rej1.message, /content blockers/)
    assert.match(rej1.message, /section "Notes" is still a placeholder/)
    const [, before] = readTask(root, created.taskRelPath)
    assert.equal(before.alignment, null)
    // 写入完整收敛 prd（无开放节点标记）与 jsonl
    const converged = CONVERGED_ALIGN_PRD
    writeFileSync(join(taskDir, 'prd.md'), converged)
    writeFileSync(join(taskDir, 'implement.jsonl'), '{"file": "AGENTS.md", "reason": "spec"}\n')
    writeFileSync(join(taskDir, 'check.jsonl'), '{"file": "AGENTS.md", "reason": "spec"}\n')
    // review 只读：返回快照（零写盘，无哈希字段）
    const [revErr, review] = executeAlignTask(root, contextKey, { action: 'review' })
    assert.equal(revErr, null)
    assert.equal(review.prd, converged)
    assert.equal(review.prdHash, undefined)
    assert.equal(review.readyToConfirm, true)
    // confirm 缺 summary：结构通过后显式拒绝
    const [noSummaryErr] = executeAlignTask(root, contextKey, {
      action: 'confirm',
    })
    assert.ok(noSummaryErr)
    assert.match(noSummaryErr.message, /non-empty summary is required/)
    const [, midway] = readTask(root, created.taskRelPath)
    assert.equal(midway.alignment, null)
    // 结构通过 + summary 非空 → confirm 成功并落确认记录（只含 passedAt/summary）
    const [err2, confirmed] = executeAlignTask(root, contextKey, {
      action: 'confirm',
      summary: 'converged',
    })
    assert.equal(err2, null)
    assert.equal(confirmed.target, 'prd')
    assert.deepEqual(Object.keys(confirmed.alignment).sort(), ['passedAt', 'summary'])
    assert.equal(confirmed.alignment.summary, 'converged')
    const [, taskAfter] = readTask(root, created.taskRelPath)
    assert.ok(taskAfter.alignment !== null)
    // 重复 confirm：每次都刷新 passedAt 与 summary（无哈希，不做幂等早退）
    const [err3, again] = executeAlignTask(root, contextKey, {
      action: 'confirm',
      summary: 'converged again',
    })
    assert.equal(err3, null)
    assert.equal(again.alignment.summary, 'converged again')
    assert.ok(again.alignment.passedAt >= confirmed.alignment.passedAt)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

/** 满足 PLAN 结构门禁的最小 plan（外层四要素 + 五字段伪代码协议，AC1 覆盖夹具 prd 的 AC 编号）。 */
const MIN_PLAN = `# Plan

## Steps

#### 步骤 1 implement

- Covers: AC1
- Target: src/a.js
- Edit:
  Input: adjust src/a.js behavior.
  Output: function returns updated result.
  Preconditions: none
  Procedure: edit the guarded branch per anchors.
  Failure: none
- Verify: pnpm lint
`

/** 夹具 prd：带 AC 编号，供 PLAN 的 Covers 覆盖校验消费。 */
const PRD_WITH_AC = `# Filled

## Goal

Do the thing.

## Requirements

- req

## Acceptance Criteria

- AC1 is verified

## Notes

- note
`

/** PLAN 确认夹具：写带 AC 的 prd + plan，可选先记录 PRD 确认。 */
async function makePlanConfirmTask(root, contextKey, { confirmPrd = true } = {}) {
  const { taskRelPath } = await makeAlignTask(root, contextKey, PRD_WITH_AC)
  writeFileSync(join(root, '.workloom', taskRelPath, 'plan.md'), MIN_PLAN)
  if (confirmPrd) alignTask(root, taskRelPath)
  return { taskRelPath }
}

test('align review target=plan：返回 PLAN 快照、结构问题与现有确认记录（无哈希）', async () => {
  const root = makeRoot()
  try {
    const contextKey = 'dsh_plan_review'
    const { taskRelPath } = await makePlanConfirmTask(root, contextKey)
    const [err, review] = executeAlignTask(root, contextKey, {
      action: 'review',
      target: 'plan',
    })
    assert.equal(err, null)
    assert.equal(review.action, 'review')
    assert.equal(review.target, 'plan')
    assert.equal(review.taskRelPath, taskRelPath)
    assert.equal(review.plan, MIN_PLAN)
    assert.equal(review.prd, PRD_WITH_AC)
    assert.deepEqual(review.structureIssues, [])
    assert.equal(review.readyToConfirm, true)
    assert.ok(review.alignment !== null)
    assert.equal(review.planConfirmation, null)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('align review target=plan：PLAN 缺失或结构不完整时返回全部结构问题', async () => {
  const root = makeRoot()
  try {
    const contextKey = 'dsh_plan_review_missing'
    const { taskRelPath } = await makeAlignTask(root, contextKey, PRD_WITH_AC)
    const [err, review] = executeAlignTask(root, contextKey, {
      action: 'review',
      target: 'plan',
    })
    assert.equal(err, null)
    assert.equal(review.plan, null)
    assert.deepEqual(review.structureIssues, [
      { code: 'plan_missing', message: 'plan.md is missing' },
    ])
    assert.equal(review.readyToConfirm, false)
    // 结构不完整：缺 Covers/Verify 外层字段 + Edit 无五字段协议 + AC 未覆盖，一次性全部返回
    writeFileSync(
      join(root, '.workloom', taskRelPath, 'plan.md'),
      '# Plan\n\n## Steps\n\n#### 步骤 1 implement\n\n- Target: src/a.js\n- Edit: add implementation\n',
    )
    const [, partial] = executeAlignTask(root, contextKey, { action: 'review', target: 'plan' })
    assert.deepEqual(
      partial.structureIssues.map((issue) => issue.message).sort(),
      [
        'AC1 is not covered by any plan step',
        'plan.md step 1 missing Covers',
        'plan.md step 1 missing Verify',
        'plan.md step 1 protocol field "Input" is missing or empty',
        'plan.md step 1 protocol field "Output" is missing or empty',
        'plan.md step 1 protocol field "Preconditions" is missing or empty',
        'plan.md step 1 protocol field "Procedure" is missing or empty',
        'plan.md step 1 protocol field "Failure" is missing or empty',
      ].sort(),
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('align confirm target=plan：PRD 未确认时拒绝并提示先确认 PRD（顺序前置）', async () => {
  const root = makeRoot()
  try {
    const contextKey = 'dsh_plan_order'
    const { taskRelPath } = await makePlanConfirmTask(root, contextKey, { confirmPrd: false })
    const [err] = executeAlignTask(root, contextKey, {
      action: 'confirm',
      target: 'plan',
      summary: 'plan looks right',
    })
    assert.ok(err)
    assert.match(err.message, /plan confirmation requires a confirmed PRD/)
    assert.match(err.message, /target=prd/)
    // 失败零写入
    const [, task] = readTask(root, taskRelPath)
    assert.equal(task.planConfirmation, null)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('align confirm target=plan：PRD 已确认后写入 planConfirmation（只含 passedAt/summary）', async () => {
  const root = makeRoot()
  try {
    const contextKey = 'dsh_plan_confirm'
    const { taskRelPath } = await makePlanConfirmTask(root, contextKey)
    // 缺 summary 拒绝
    const [noSummaryErr] = executeAlignTask(root, contextKey, {
      action: 'confirm',
      target: 'plan',
    })
    assert.ok(noSummaryErr)
    assert.match(noSummaryErr.message, /non-empty summary is required/)
    // 确认成功：记录只含两个键
    const [err, confirmed] = executeAlignTask(root, contextKey, {
      action: 'confirm',
      target: 'plan',
      summary: 'plan covers AC1, steps verified',
    })
    assert.equal(err, null)
    assert.equal(confirmed.target, 'plan')
    assert.equal(confirmed.alignment, null)
    assert.deepEqual(Object.keys(confirmed.planConfirmation).sort(), ['passedAt', 'summary'])
    assert.match(confirmed.planConfirmation.summary, /covers AC1/)
    // 重复 confirm：刷新 passedAt 与 summary
    const [err2, again] = executeAlignTask(root, contextKey, {
      action: 'confirm',
      target: 'plan',
      summary: 're-confirmed after step reorder',
    })
    assert.equal(err2, null)
    assert.equal(again.planConfirmation.summary, 're-confirmed after step reorder')
    assert.ok(again.planConfirmation.passedAt >= confirmed.planConfirmation.passedAt)
    // PLAN 结构不完整时拒绝且零写入
    writeFileSync(
      join(root, '.workloom', taskRelPath, 'plan.md'),
      MIN_PLAN.replace('- Verify: pnpm lint\n', ''),
    )
    const [structErr] = executeAlignTask(root, contextKey, {
      action: 'confirm',
      target: 'plan',
      summary: 's',
    })
    assert.ok(structErr)
    assert.match(structErr.message, /plan\.md content blockers:/)
    const [, task] = readTask(root, taskRelPath)
    assert.match(task.planConfirmation.summary, /re-confirmed/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('recordPlanConfirmation：completed 拒绝；直接调用同样受 PRD 顺序前置约束', async () => {
  const root = makeRoot()
  try {
    const contextKey = 'dsh_plan_write'
    const { taskRelPath } = await makePlanConfirmTask(root, contextKey)
    // completed 任务拒绝写入
    const [, archived] = await archiveTask(root, {
      taskRelPath,
      autoCommit: false,
      force: true,
      reason: 'test archive for completed rejection',
    })
    assert.ok(archived)
    const [completedErr] = recordPlanConfirmation(root, archived.taskRelPath, { summary: 'late' })
    assert.ok(completedErr)
    assert.match(completedErr.message, /only planning\/in_progress/)
    // 未确认 PRD 的任务直接调用窄写口同样拒绝
    const [, fresh] = await executeCreateTask(root, 'dsh_plan_write_fresh', {
      title: 'Plan Write Fresh',
      package: 'repo',
    })
    const [noPrdErr] = recordPlanConfirmation(root, fresh.taskRelPath, { summary: 's' })
    assert.ok(noPrdErr)
    assert.match(noPrdErr.message, /requires a confirmed PRD/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('executeCreateTask package 校验：缺失/未知 fail loud，合法值落 task.json', async () => {
  const root = makeRoot()
  try {
    // 缺失 → execute 层拒绝（文案指引 packages 配置）。
    const [missingErr] = await executeCreateTask(root, 'dsh_pkg_missing', { title: 'No Package' })
    assert.ok(missingErr)
    assert.match(missingErr.message, /package is required/)
    // 未知值 → core 拒绝（列已声明包 + 指引 workloom-packages-scan）。
    const [unknownErr] = await executeCreateTask(root, 'dsh_pkg_unknown', {
      title: 'Unknown Package',
      package: 'ghost',
    })
    assert.ok(unknownErr)
    assert.match(unknownErr.message, /unknown package "ghost"/)
    assert.match(unknownErr.message, /repo/)
    assert.match(unknownErr.message, /workloom-packages-scan/)
    // 合法值 → 落 task.json package。
    const [okErr, ok] = await executeCreateTask(root, 'dsh_pkg_ok', {
      title: 'With Package',
      package: 'repo',
    })
    assert.equal(okErr, null, okErr?.message)
    const saved = JSON.parse(
      readFileSync(join(root, '.workloom', ok.taskRelPath, 'task.json'), 'utf8'),
    )
    assert.equal(saved.package, 'repo')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
