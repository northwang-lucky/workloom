/**
 * task/state 状态机单测：五个冻结枚举、readTaskView 兼容读（含归档样本与
 * parent 参数/兜底两路）与 TRANSITIONS 迁移表骨架。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  AUTONOMY,
  CASE_PHASES,
  GUARD_KEYS,
  MODES,
  PLAN_REVIEW_PHASES,
  STAGES,
  TRANSITIONS,
  readTaskView,
} from '../src/task/state/index.ts'

// 测试隔离：core 三层配置的全局层读 $HOME/.workloom/config；重定向 HOME 与 TMPDIR
// 到隔离目录，防止本机真实配置泄漏进单测（与 task-store.test.ts 同口径）。
const isolatedHome = mkdtempSync(join(tmpdir(), 'workloom-core-home-'))
process.env.HOME = isolatedHome
process.env.TMPDIR = isolatedHome

/** 创建临时项目根（含 .workloom；生命周期写口经 findWorkloomRoot 定位）。 */
function makeRoot() {
  const root = mkdtempSync(join(tmpdir(), 'workloom-sm-'))
  mkdirSync(join(root, '.workloom'), { recursive: true })
  return root
}

/** 一份最小合法的 task.json 原始记录（字段可覆写）。 */
function baseRecord(overrides = {}) {
  return {
    id: 'task-id-1',
    name: '11-01-demo',
    title: 'Demo task',
    description: '',
    status: 'planning',
    priority: 'P2',
    creator: '',
    assignee: '',
    package: null,
    branch: '',
    base_branch: '',
    createdAt: '2026-11-01T00:00:00.000Z',
    completedAt: null,
    parent: null,
    children: [],
    scope: '',
    commit: '',
    pr_url: '',
    worktree_path: '',
    relatedFiles: [],
    notes: '',
    meta: {},
    ...overrides,
  }
}

/** 在临时根写入一个任务目录与 task.json，返回 {root, rel}。 */
function writeTask(root, rel, record) {
  const dir = join(root, '.workloom', rel)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'task.json'), `${JSON.stringify(record, null, 2)}\n`)
  return { root, rel }
}

/** 写入并读取视图（断言成功），返回 TaskView。 */
function readViewOf(root, rel, record) {
  writeTask(root, rel, record)
  const [err, view] = readTaskView(root, rel)
  assert.equal(err, null, `readTaskView failed: ${err?.message ?? ''}`)
  assert.ok(view)
  return view
}

/** 读取视图并断言失败，返回错误消息。 */
function readViewError(root, rel, record) {
  writeTask(root, rel, record)
  const [err, view] = readTaskView(root, rel)
  assert.equal(view, null)
  assert.ok(err instanceof Error)
  return err.message
}

// ---------- 枚举形态 ----------

test('五个枚举冻结且值域符合 SOP（禁用 TS enum，as const + Object.freeze）', () => {
  assert.deepEqual({ ...MODES }, { LIGHT: 'light', STANDARD: 'standard', PARENT: 'parent' })
  assert.deepEqual(
    { ...STAGES },
    {
      ALIGNING: 'aligning',
      PLANNING: 'planning',
      IMPLEMENTING: 'implementing',
      CHECKING: 'checking',
      COMPLETED: 'completed',
      ORCHESTRATING: 'orchestrating',
      INTEGRATING: 'integrating',
      ARCHIVED: 'archived',
    },
  )
  assert.deepEqual(
    { ...CASE_PHASES },
    {
      NONE: 'none',
      DESIGNING: 'designing',
      REVIEWING: 'reviewing',
      APPROVED: 'approved',
      EXECUTING: 'executing',
      DONE: 'done',
    },
  )
  assert.deepEqual(
    { ...PLAN_REVIEW_PHASES },
    { NONE: 'none', REVIEWING: 'reviewing', REVISING: 'revising', CLEAN: 'clean' },
  )
  assert.deepEqual({ ...AUTONOMY }, { MANUAL: 'manual', SEMI: 'semi', AUTO: 'auto' })
  for (const enumObject of [MODES, STAGES, CASE_PHASES, PLAN_REVIEW_PHASES, AUTONOMY]) {
    assert.ok(Object.isFrozen(enumObject), 'enum object must be frozen')
  }
})

// ---------- 迁移表骨架 ----------

test('TRANSITIONS 冻结且三模式条目齐（主线链 + 归档出口边）', () => {
  assert.ok(Object.isFrozen(TRANSITIONS))
  const edges = TRANSITIONS.map((entry) => `${entry.mode}:${entry.from}->${entry.to}`)
  assert.deepEqual(edges, [
    'standard:aligning->planning',
    'standard:planning->implementing',
    'standard:implementing->checking',
    'standard:checking->completed',
    'standard:checking->archived',
    'standard:completed->archived',
    'standard:completed->implementing',
    'standard:aligning->archived',
    'standard:planning->archived',
    'standard:implementing->archived',
    'light:aligning->planning',
    'light:planning->implementing',
    'light:implementing->completed',
    'light:implementing->archived',
    'light:completed->archived',
    'light:completed->implementing',
    'light:aligning->archived',
    'light:planning->archived',
    'parent:aligning->planning',
    'parent:planning->orchestrating',
    'parent:orchestrating->integrating',
    'parent:integrating->archived',
    'parent:aligning->archived',
    'parent:planning->archived',
    'parent:orchestrating->archived',
  ])
})

test('TRANSITIONS 守卫键全部在 GUARD_KEYS 值域内，轨道值不入主线表', () => {
  for (const entry of TRANSITIONS) {
    for (const guard of entry.guards) {
      assert.ok(GUARD_KEYS.includes(guard), `unknown guard key: ${guard}`)
    }
  }
  // 主线表的起止阶段只取 STAGES 值域（casePhase/planReview 轨道值不入主线表，
  // 由各记录入口自带合法边表）。
  const stageValues = Object.values(STAGES)
  for (const entry of TRANSITIONS) {
    assert.ok(stageValues.includes(entry.from), `mainline from must be a stage: ${entry.from}`)
    assert.ok(stageValues.includes(entry.to), `mainline to must be a stage: ${entry.to}`)
  }
  // light 无 checking 边（implementing 直达 archived）。
  assert.equal(
    TRANSITIONS.some((entry) => entry.mode === MODES.LIGHT && entry.to === STAGES.CHECKING),
    false,
  )
})

// ---------- 模式兼容读 ----------

test('兼容读：旧 full 记录读作 standard，缺省 mode 无 children 读作 standard', () => {
  const root = makeRoot()
  try {
    assert.equal(readViewOf(root, 'tasks/a', baseRecord({ mode: 'full' })).mode, MODES.STANDARD)
    assert.equal(readViewOf(root, 'tasks/b', baseRecord()).mode, MODES.STANDARD)
    assert.equal(readViewOf(root, 'tasks/c', baseRecord({ mode: 'light' })).mode, MODES.LIGHT)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('兼容读 parent 两路：显式 parent 值直读；children 非空且 mode 缺省或旧值兜底推断', () => {
  const root = makeRoot()
  try {
    // 路径一（写路径落盘值）：mode=parent 直读。
    assert.equal(readViewOf(root, 'tasks/a', baseRecord({ mode: 'parent' })).mode, MODES.PARENT)
    // 路径二（兜底推断）：children 非空且 mode 缺省 → parent。
    const children = ['tasks/08-29-child']
    assert.equal(readViewOf(root, 'tasks/b', baseRecord({ children })).mode, MODES.PARENT)
    // 路径二（兜底推断）：children 非空且 mode 为旧值 full → parent。
    assert.equal(
      readViewOf(root, 'tasks/c', baseRecord({ mode: 'full', children })).mode,
      MODES.PARENT,
    )
    // 显式新值优先于推断：mode=standard 且 children 非空仍读 standard。
    assert.equal(
      readViewOf(root, 'tasks/d', baseRecord({ mode: 'standard', children })).mode,
      MODES.STANDARD,
    )
    // light 显式值不参与推断。
    assert.equal(readViewOf(root, 'tasks/e', baseRecord({ mode: 'light', children })).mode, MODES.LIGHT)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('兼容读：未映射 mode 值报可判定错误（消息含字段与任务路径）', () => {
  const root = makeRoot()
  try {
    const message = readViewError(root, 'tasks/a', baseRecord({ mode: 'weird' }))
    assert.match(message, /unmapped mode value/)
    assert.match(message, /tasks\/a/)
    assert.match(message, /weird/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

// ---------- 阶段兼容读 ----------

test('兼容读：planning 按确认记录推导 aligning 或 planning（旧 stage 落盘值不参与）', () => {
  const root = makeRoot()
  try {
    // 无 PRD 确认 → aligning（即使旧数据落盘 stage=implement）。
    assert.equal(
      readViewOf(root, 'tasks/a', baseRecord({ stage: 'implement' })).stage,
      STAGES.ALIGNING,
    )
    // 已有 PRD 确认 → planning。
    const confirmed = readViewOf(
      root,
      'tasks/b',
      baseRecord({ alignment: { passedAt: '2026-11-01T00:00:00Z', summary: 's' } }),
    )
    assert.equal(confirmed.stage, STAGES.PLANNING)
    assert.equal(confirmed.status, 'planning')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('兼容读：in_progress 旧 stage 值按模式映射新枚举', () => {
  const root = makeRoot()
  try {
    const standard = (overrides) =>
      readViewOf(root, `tasks/${Math.random().toString(36).slice(2)}`, baseRecord({ status: 'in_progress', ...overrides }))
    assert.equal(standard({ stage: 'implement' }).stage, STAGES.IMPLEMENTING)
    assert.equal(standard({ stage: 'check' }).stage, STAGES.CHECKING)
    assert.equal(standard({}).stage, STAGES.IMPLEMENTING)
    // parent（children 兜底推断）：implement/缺省 → orchestrating，check → integrating。
    const children = ['tasks/08-29-child']
    assert.equal(standard({ children, stage: 'implement' }).stage, STAGES.ORCHESTRATING)
    assert.equal(standard({ children }).stage, STAGES.ORCHESTRATING)
    assert.equal(standard({ children, stage: 'check' }).stage, STAGES.INTEGRATING)
    // 新枚举值原样采用。
    assert.equal(standard({ mode: 'standard', stage: 'checking' }).stage, STAGES.CHECKING)
    assert.equal(standard({ mode: 'parent', stage: 'integrating' }).stage, STAGES.INTEGRATING)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('兼容读：completed 与归档路径记录读作 archived 视图，status 与 stage 双字段一致', () => {
  const root = makeRoot()
  try {
    // status=completed（活动目录）→ archived。
    const completed = readViewOf(
      root,
      'tasks/a',
      baseRecord({ status: 'completed', stage: 'implement', completedAt: '2026-11-02T00:00:00Z' }),
    )
    assert.equal(completed.stage, STAGES.ARCHIVED)
    assert.equal(completed.status, 'completed')
    // 归档路径样本（tasks/archive/<YYYY-MM>/<name>）→ archived。
    const archived = readViewOf(
      root,
      join('tasks', 'archive', '2026-11', 'demo'),
      baseRecord({ status: 'completed', stage: 'check' }),
    )
    assert.equal(archived.stage, STAGES.ARCHIVED)
    assert.equal(archived.status, 'completed')
    // 归档路径但 status 未置 completed 的手改样本：仍读作 archived 且双字段一致。
    const inconsistent = readViewOf(
      root,
      join('tasks', 'archive', '2026-11', 'broken'),
      baseRecord({ status: 'in_progress' }),
    )
    assert.equal(inconsistent.stage, STAGES.ARCHIVED)
    assert.equal(inconsistent.status, 'completed')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('兼容读：未映射 stage 与 status 值报可判定错误', () => {
  const root = makeRoot()
  try {
    const stageMessage = readViewError(
      root,
      'tasks/a',
      baseRecord({ status: 'in_progress', stage: 'weird' }),
    )
    assert.match(stageMessage, /unmapped stage value/)
    assert.match(stageMessage, /weird/)
    const statusMessage = readViewError(root, 'tasks/b', baseRecord({ status: 'weird' }))
    assert.match(statusMessage, /unmapped status value/)
    assert.match(statusMessage, /weird/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

// ---------- 轨道与自治度兼容读 ----------

test('兼容读：casePhase 缺省 none，case.phase 直读，非法值报可判定错误', () => {
  const root = makeRoot()
  try {
    assert.equal(readViewOf(root, 'tasks/a', baseRecord()).casePhase, CASE_PHASES.NONE)
    assert.equal(
      readViewOf(root, 'tasks/b', baseRecord({ case: { required: true, designSession: null } }))
        .casePhase,
      CASE_PHASES.NONE,
    )
    assert.equal(
      readViewOf(
        root,
        'tasks/c',
        baseRecord({ case: { required: true, designSession: 'child-1', phase: 'reviewing' } }),
      ).casePhase,
      CASE_PHASES.REVIEWING,
    )
    const message = readViewError(
      root,
      'tasks/d',
      baseRecord({ case: { required: true, designSession: null, phase: 'weird' } }),
    )
    assert.match(message, /unmapped case phase value/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('兼容读：planReview 缺省 none/0 轮，对象形态直读，非法形状报可判定错误', () => {
  const root = makeRoot()
  try {
    const missing = readViewOf(root, 'tasks/a', baseRecord())
    assert.equal(missing.planReview, PLAN_REVIEW_PHASES.NONE)
    assert.equal(missing.planReviewRevisions, 0)
    const revising = readViewOf(
      root,
      'tasks/b',
      baseRecord({ planReview: { phase: 'revising', revisions: 2 } }),
    )
    assert.equal(revising.planReview, PLAN_REVIEW_PHASES.REVISING)
    assert.equal(revising.planReviewRevisions, 2)
    assert.match(readViewError(root, 'tasks/c', baseRecord({ planReview: 'clean' })), /unmapped planReview value/)
    assert.match(
      readViewError(root, 'tasks/d', baseRecord({ planReview: { phase: 'weird' } })),
      /unmapped planReview phase value/,
    )
    assert.match(
      readViewError(root, 'tasks/e', baseRecord({ planReview: { phase: 'clean', revisions: -1 } })),
      /invalid planReview revisions/,
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('兼容读：autonomy 缺省 manual，合法值直读，非法值报可判定错误', () => {
  const root = makeRoot()
  try {
    assert.equal(readViewOf(root, 'tasks/a', baseRecord()).autonomy, AUTONOMY.MANUAL)
    assert.equal(readViewOf(root, 'tasks/b', baseRecord({ autonomy: 'auto' })).autonomy, AUTONOMY.AUTO)
    assert.equal(readViewOf(root, 'tasks/c', baseRecord({ autonomy: 'semi' })).autonomy, AUTONOMY.SEMI)
    assert.match(readViewError(root, 'tasks/d', baseRecord({ autonomy: 'weird' })), /unmapped autonomy value/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

// ---------- 结构化归一与错误路径 ----------

test('兼容读：结构默认值补齐（hooks/overrides/dispatches/children），旧派发记录无 status 读作 completed', () => {
  const root = makeRoot()
  try {
    const view = readViewOf(
      root,
      'tasks/a',
      baseRecord({
        dispatches: [{ kind: 'implement', at: '2026-11-01T00:00:00Z', title: 'impl' }],
      }),
    )
    assert.deepEqual(view.hooks, {
      after_create: [],
      after_start: [],
      after_finish: [],
      after_archive: [],
    })
    assert.deepEqual(view.overrides, [])
    assert.deepEqual(view.children, [])
    assert.equal(view.dispatches[0]?.status, 'completed')
    assert.equal(view.taskRelPath, 'tasks/a')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('兼容读：task.json 缺失、损坏与非对象均报可判定错误', () => {
  const root = makeRoot()
  try {
    mkdirSync(join(root, '.workloom', 'tasks', 'missing'), { recursive: true })
    const [missingErr, missingView] = readTaskView(root, 'tasks/missing')
    assert.equal(missingView, null)
    assert.match(missingErr?.message ?? '', /task\.json missing/)
    mkdirSync(join(root, '.workloom', 'tasks', 'broken'), { recursive: true })
    writeFileSync(join(root, '.workloom', 'tasks', 'broken', 'task.json'), '{oops')
    const [parseErr] = readTaskView(root, 'tasks/broken')
    assert.match(parseErr?.message ?? '', /failed to parse task\.json/)
    mkdirSync(join(root, '.workloom', 'tasks', 'array'), { recursive: true })
    writeFileSync(join(root, '.workloom', 'tasks', 'array', 'task.json'), '[]')
    const [arrayErr] = readTaskView(root, 'tasks/array')
    assert.match(arrayErr?.message ?? '', /task\.json is not an object/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

/* ---------------- 步骤 3：守卫、迁移入口、轨道写入口与确认迁移 ---------------- */

import {
  confirmPlan,
  confirmPrd,
  evaluateGuard,
  migrateTask,
  recordCasePhase,
  recordPlanReview,
} from '../src/task/state/index.ts'
import { createTask, writeTaskRecord, requireTaskRecord } from '../src/task/storage/index.ts'

/** 创建任务并把 task.json 手改为指定状态/阶段（守卫序列夹具）。 */
async function makeTaskAt(root, overrides, title = 'Guard Probe') {
  const [, created] = await createTask(root, { title, ...overrides.create })
  const [err, record] = requireTaskRecordOrThrow(root, created.taskRelPath)
  assert.equal(err, null)
  Object.assign(record, overrides.record)
  writeTaskRecord(root, created.taskRelPath, record)
  return created.taskRelPath
}

/** requireTaskRecord 的元组包装（夹具用）。 */
function requireTaskRecordOrThrow(root, rel) {
  try {
    return [null, requireTaskRecord(root, rel)]
  } catch (error) {
    return [error, null]
  }
}

/** 写入 check.jsonl 有效记录（check-ready 守卫前置）。 */
function writeEffectiveCheckLog(root, rel) {
  writeFileSync(
    join(root, '.workloom', rel, 'check.jsonl'),
    '{"file": "AGENTS.md", "reason": "spec"}\n',
  )
}

/** 把 CASE 轨道沿合法边链推进到目标阶段（已越过的位置跳过，幂等）。 */
function advanceCaseTrackTo(root, rel, target) {
  const order = ['none', 'designing', 'reviewing', 'approved', 'executing', 'done']
  const [, start] = readTaskView(root, rel)
  const fromIdx = order.indexOf(start.casePhase)
  const toIdx = order.indexOf(target)
  for (let i = fromIdx + 1; i <= toIdx; i++) {
    const [err] = recordCasePhase(root, rel, order[i])
    assert.equal(err, null, err?.message)
  }
}

test('序列守卫：standard 未批 CASE 进 checking 失败，批准后通过', async () => {
  const root = makeRoot()
  try {
    const rel = await makeTaskAt(root, {
      record: { status: 'in_progress', stage: 'implementing' },
    })
    writeEffectiveCheckLog(root, rel)
    // casePhase=none：case-approved 硬拦（force 也不豁免）。
    const [err] = migrateTask(root, { taskRelPath: rel, to: 'checking' })
    assert.ok(err)
    assert.match(err.message, /transition rejected/)
    assert.match(err.message, /case-approved/)
    assert.match(err.message, /CASE is not approved \(casePhase: none\)/)
    const [forceErr] = migrateTask(root, {
      taskRelPath: rel,
      to: 'checking',
      force: true,
      reason: 'try bypass hard guard',
    })
    assert.ok(forceErr)
    assert.match(forceErr.message, /hard guards cannot be bypassed/)
    // 轨道批准后通过（checking 进入守卫要求 casePhase 至少 approved）。
    advanceCaseTrackTo(root, rel, 'approved')
    const [okErr, result] = migrateTask(root, { taskRelPath: rel, to: 'checking' })
    assert.equal(okErr, null)
    assert.equal(result.view.stage, 'checking')
    assert.equal(result.view.status, 'in_progress')
    // 迁移写口同点持久化 casePhase（case 记录补 phase 字段）。
    const [, after] = readTaskView(root, rel)
    assert.equal(after.casePhase, 'approved')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('序列守卫：light 无 CASE 轨道，进 checking 被表拒绝，implementing 直达 archived', async () => {
  const root = makeRoot()
  try {
    const rel = await makeTaskAt(root, {
      create: { mode: 'light' },
      record: { status: 'in_progress', stage: 'implementing' },
    })
    // light 无 checking 边：无路径可判定拒绝。
    const [err] = migrateTask(root, { taskRelPath: rel, to: 'checking' })
    assert.ok(err)
    assert.match(err.message, /no transition path in the table/)
    // archive-ready：无 check 凭据拒绝；写凭据后直达 archived。
    const [noCheckErr] = migrateTask(root, { taskRelPath: rel, to: 'archived' })
    assert.ok(noCheckErr)
    assert.match(noCheckErr.message, /no recorded check in task\.json/)
    const [recordErr, record] = requireTaskRecordOrThrow(root, rel)
    assert.equal(recordErr, null)
    record.check = { passedAt: new Date().toISOString(), summary: 'light self-check' }
    writeTaskRecord(root, rel, record)
    const [okErr, result] = migrateTask(root, { taskRelPath: rel, to: 'archived' })
    assert.equal(okErr, null)
    assert.equal(result.view.stage, 'archived')
    assert.equal(result.view.status, 'completed')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('序列守卫：parent 子任务未全归档进 integrating 失败，全归档后通过', async () => {
  const root = makeRoot()
  try {
    const rel = await makeTaskAt(root, {
      create: { mode: 'parent' },
      record: { status: 'in_progress', stage: 'orchestrating' },
      title: 'Parent Probe',
    })
    // 子任务（未归档）。
    const [, child] = await createTask(root, { title: 'Child One' })
    const [recErr, parentRecord] = requireTaskRecordOrThrow(root, rel)
    assert.equal(recErr, null)
    parentRecord.children = [child.taskRelPath]
    writeTaskRecord(root, rel, parentRecord)
    const [err] = migrateTask(root, { taskRelPath: rel, to: 'integrating' })
    assert.ok(err)
    assert.match(err.message, /children not archived yet/)
    assert.ok(err.message.includes(child.taskRelPath))
    // 子任务归档（status=completed）后放行。
    const [childErr, childRecord] = requireTaskRecordOrThrow(root, child.taskRelPath)
    assert.equal(childErr, null)
    childRecord.status = 'completed'
    writeTaskRecord(root, child.taskRelPath, childRecord)
    const [okErr, result] = migrateTask(root, { taskRelPath: rel, to: 'integrating' })
    assert.equal(okErr, null)
    assert.equal(result.view.stage, 'integrating')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('序列守卫：跳过确认进 implementing 被拒且带理由；force 豁免留痕 start 审计值', async () => {
  const root = makeRoot()
  try {
    const [, created] = await createTask(root, { title: 'Skip Confirm' })
    const rel = created.taskRelPath
    const [err] = migrateTask(root, { taskRelPath: rel, to: 'implementing' })
    assert.ok(err)
    assert.match(err.message, /transition rejected/)
    assert.match(err.message, /from stage "aligning" to "implementing" \(mode standard\)/)
    assert.match(err.message, /no alignment credential recorded/)
    assert.match(err.message, /pass force: true/)
    // force 豁免：可 force 守卫全部绕过，overrides 单条 start 留痕（审计值字面稳定）。
    const [okErr, result] = migrateTask(root, {
      taskRelPath: rel,
      to: 'implementing',
      force: true,
      reason: 'emergency hotfix',
    })
    assert.equal(okErr, null)
    assert.equal(result.view.stage, 'implementing')
    const [, saved] = readTaskView(root, rel)
    assert.equal(saved.overrides.length, 1)
    assert.equal(saved.overrides[0].gate, 'start')
    assert.equal(saved.overrides[0].tool, 'workloom_task_start')
    assert.equal(saved.overrides[0].reason, 'emergency hotfix')
    // force 缺 reason：可判定拒绝且零写入。
    const [, created2] = await createTask(root, { title: 'Force No Reason' })
    const [reasonErr] = migrateTask(root, {
      taskRelPath: created2.taskRelPath,
      to: 'implementing',
      force: true,
    })
    assert.ok(reasonErr)
    assert.match(reasonErr.message, /force: true requires a non-empty reason/)
    const [, untouched] = readTaskView(root, created2.taskRelPath)
    assert.equal(untouched.stage, 'aligning')
    assert.deepEqual(untouched.overrides, [])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('planReview 守卫：非 clean 时 confirmPlan 失败，clean 后通过', async () => {
  const root = makeRoot()
  try {
    const [, created] = await createTask(root, { title: 'Plan Review Gate' })
    const rel = created.taskRelPath
    const [prdErr] = confirmPrd(root, rel, { summary: 'converged' })
    assert.equal(prdErr, null)
    // 轨道 none：plan-review-clean 拒绝。
    const [err1] = confirmPlan(root, rel, { summary: 'plan ok' })
    assert.ok(err1)
    assert.match(err1.message, /plan review is not clean \(current phase: none\)/)
    // reviewing 仍拒绝；revising 轮数只记录不判定。
    recordPlanReview(root, rel, 'reviewing')
    const [err2] = confirmPlan(root, rel, { summary: 'plan ok' })
    assert.match(err2?.message ?? '', /current phase: reviewing/)
    recordPlanReview(root, rel, 'revising')
    const [, revisingView] = readTaskView(root, rel)
    assert.equal(revisingView.planReviewRevisions, 1)
    recordPlanReview(root, rel, 'reviewing')
    recordPlanReview(root, rel, 'revising')
    const [, revising2] = readTaskView(root, rel)
    assert.equal(revising2.planReviewRevisions, 2)
    recordPlanReview(root, rel, 'reviewing')
    // clean 后通过（manual 人工确认，source=user + autonomy 快照）。
    recordPlanReview(root, rel, 'clean')
    const [okErr, view] = confirmPlan(root, rel, { summary: 'plan ok' })
    assert.equal(okErr, null)
    assert.equal(view.planConfirmation.source, 'user')
    assert.equal(view.planConfirmation.autonomy, 'manual')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('planReview 守卫：auto 与 semi 同样要求 clean（Judger 评审与 autonomy 无关）', async () => {
  const root = makeRoot()
  try {
    for (const autonomy of ['auto', 'semi']) {
      const [, created] = await createTask(root, { title: `Autonomy ${autonomy}` })
      const rel = created.taskRelPath
      const [, record] = requireTaskRecordOrThrow(root, rel)
      record.autonomy = autonomy
      writeTaskRecord(root, rel, record)
      // semi 的 PRD 确认仍人工（summary 必填）；auto 的 PRD 确认自动记录。
      const [prdErr] = confirmPrd(root, rel, autonomy === 'auto' ? {} : { summary: 'converged' })
      assert.equal(prdErr, null)
      // 轨道非 clean：auto/semi 的自动记录同样被 plan-review-clean 硬拦。
      const [err] = confirmPlan(root, rel, {})
      assert.ok(err)
      assert.match(err.message, /plan review is not clean/)
      // clean 后自动记录（summary 注明 autonomy 与自动来源，source=auto）。
      recordPlanReview(root, rel, 'reviewing')
      recordPlanReview(root, rel, 'clean')
      const [okErr, view] = confirmPlan(root, rel, {})
      assert.equal(okErr, null)
      assert.equal(view.planConfirmation.source, 'auto')
      assert.equal(view.planConfirmation.autonomy, autonomy)
      assert.match(view.planConfirmation.summary, /auto-recorded/)
      assert.ok(view.planConfirmation.summary.includes(`autonomy: ${autonomy}`))
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('确认迁移：auto 的 PRD 确认自动记录；manual/semi 的 PRD 确认要求人工 summary', async () => {
  const root = makeRoot()
  try {
    // manual：缺 summary 拒绝（现状不变）。
    const [, manual] = await createTask(root, { title: 'Manual Prd' })
    const [manualErr] = confirmPrd(root, manual.taskRelPath, {})
    assert.ok(manualErr)
    assert.match(manualErr.message, /non-empty summary/)
    // semi：PRD 确认仍人工（Scope 6：semi 仅 PLAN 确认自动）。
    const [, semi] = await createTask(root, { title: 'Semi Prd' })
    const [, semiRecord] = requireTaskRecordOrThrow(root, semi.taskRelPath)
    semiRecord.autonomy = 'semi'
    writeTaskRecord(root, semi.taskRelPath, semiRecord)
    const [semiErr] = confirmPrd(root, semi.taskRelPath, {})
    assert.ok(semiErr)
    assert.match(semiErr.message, /non-empty summary/)
    // auto：PRD 确认自动记录（summary 注明 autonomy 与自动来源）。
    const [, auto] = await createTask(root, { title: 'Auto Prd' })
    const [, autoRecord] = requireTaskRecordOrThrow(root, auto.taskRelPath)
    autoRecord.autonomy = 'auto'
    writeTaskRecord(root, auto.taskRelPath, autoRecord)
    const [autoErr, view] = confirmPrd(root, auto.taskRelPath, {})
    assert.equal(autoErr, null)
    assert.equal(view.alignment.source, 'auto')
    assert.equal(view.alignment.autonomy, 'auto')
    assert.match(view.alignment.summary, /auto-recorded/)
    assert.match(view.alignment.summary, /autonomy: auto/)
    // aligning → planning 经迁移表推进。
    assert.equal(view.stage, 'planning')
    assert.equal(view.status, 'planning')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('轨道写入口：非法边拒绝且可判定（CASE 单链、planReview 回环）', async () => {
  const root = makeRoot()
  try {
    const [, created] = await createTask(root, { title: 'Track Edges' })
    const rel = created.taskRelPath
    // CASE 轨道：none 直跳 approved 拒绝。
    const [caseErr] = recordCasePhase(root, rel, 'approved')
    assert.ok(caseErr)
    assert.match(caseErr.message, /illegal case phase transition/)
    assert.match(caseErr.message, /none -> approved/)
    // 合法边推进并自动建 case 记录（required=false 兼容旧任务补轨道）。
    const [designErr, designView] = recordCasePhase(root, rel, 'designing')
    assert.equal(designErr, null)
    assert.equal(designView.casePhase, 'designing')
    assert.equal(designView.case.required, false)
    // done 之后无出边：拒绝。
    advanceCaseTrackTo(root, rel, 'done')
    const [doneErr] = recordCasePhase(root, rel, 'designing')
    assert.ok(doneErr)
    assert.match(doneErr.message, /illegal case phase transition/)
    // planReview 轨道：none 直跳 clean 拒绝；reviewing→revising→reviewing 回环合法。
    const [reviewErr] = recordPlanReview(root, rel, 'clean')
    assert.ok(reviewErr)
    assert.match(reviewErr.message, /illegal plan review transition/)
    recordPlanReview(root, rel, 'reviewing')
    recordPlanReview(root, rel, 'revising')
    const [loopErr, loopView] = recordPlanReview(root, rel, 'reviewing')
    assert.equal(loopErr, null)
    assert.equal(loopView.planReview, 'reviewing')
    assert.equal(loopView.planReviewRevisions, 1)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('守卫单查口：evaluateGuard 的 light-dispatch 拒绝文案与旧审计字面量一致', async () => {
  const root = makeRoot()
  try {
    const [, created] = await createTask(root, { title: 'Light Dispatch', mode: 'light' })
    const [, view] = readTaskView(root, created.taskRelPath)
    const [err, reason] = evaluateGuard('light-dispatch', view, {
      root,
      taskRelPath: created.taskRelPath,
    })
    assert.ok(err)
    assert.match(reason, /light task: executor dispatch is not available/)
    assert.match(reason, /main session handles light tasks end to end/)
    const [, std] = await createTask(root, { title: 'Std Dispatch' })
    const [, stdView] = readTaskView(root, std.taskRelPath)
    assert.deepEqual(evaluateGuard('light-dispatch', stdView, { root, taskRelPath: std.taskRelPath }), [null, null])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

/* ---------------- 步骤 4：旧门禁求值用例改写为守卫用例 ---------------- */

import { toTaskView } from '../src/task/state/index.ts'

/** 一份已收敛的最小 prd（H1 + 十一小节，R/AC 追踪合法；原 task-gates.test 夹具）。 */
const FILLED_PRD = `# Ship the gate

## Context

The gate needs a filled prd sample.

## Goal

Do the thing.

## Scope

In scope: the thing itself. Non-goals: none.

## Assumptions, Constraints and Dependencies

Runs on the existing gate harness without new dependencies.

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

/** 轻量任务的最低 prd：H1 + Goal 实填，其余小节仍是骨架 placeholder。 */
const LIGHT_MIN_PRD = `# Light fix

## Goal

Repair the shell file.

## Requirements

(placeholder: group requirements by capability or behavior as numbered items R1, R2, ...; each item is one necessary, decidable statement; do not transcribe Q&A rounds)

## Acceptance Criteria

(placeholder: list acceptance criteria as numbered items AC1, AC2, ...; each item cites the R numbers it covers and states its verification method)

## Notes

(placeholder: add notes that do not belong to any section above)
`

/** 最小合法 PLAN（外层四要素 + Edit 五字段伪代码协议齐全）。 */
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

/**
 * 守卫求值夹具：落 task.json（baseRecord 覆写）与可选文档文件，返回兼容读视图。
 */
function makeGuardView(root, rel, recordOverrides = {}, files = {}) {
  const dir = join(root, '.workloom', rel)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'task.json'), JSON.stringify(baseRecord({ name: rel, ...recordOverrides })))
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(dir, name), content)
  }
  const [err, view] = readTaskView(root, rel)
  assert.equal(err, null, err?.message)
  return view
}

/** 单守卫求值（返回 reason，null = 通过）。 */
function guardReason(key, root, rel, view) {
  const [err, reason] = evaluateGuard(key, view, { root, taskRelPath: rel })
  assert.equal(err === null, reason === null)
  return reason
}

test('ui-dispatch-ready 守卫：prd 含 UI Design 小节且无 frontend-developer 派发 → 拒绝', () => {
  const root = makeRoot()
  try {
    const prd = '# Task\n\n## UI Design\n\n- pages and IA\n'
    const view = makeGuardView(root, 'tasks/ui-1', {
      status: 'in_progress',
      stage: 'implementing',
      dispatches: [{ kind: 'developer', at: '2026-08-29T00:00:00Z', title: 'impl' }],
    }, { 'prd.md': prd })
    assert.equal(
      guardReason('ui-dispatch-ready', root, 'tasks/ui-1', view),
      'no frontend-developer dispatch recorded for a task with UI requirements',
    )
    // 已有 frontend-developer 派发（新值主用例）→ 通过。
    const dispatched = makeGuardView(root, 'tasks/ui-2', {
      status: 'in_progress',
      stage: 'implementing',
      dispatches: [
        { kind: 'developer', at: '2026-08-29T00:00:00Z', title: 'impl' },
        { kind: 'frontend-developer', at: '2026-08-29T01:00:00Z', title: 'ui' },
      ],
    }, { 'prd.md': prd })
    assert.equal(guardReason('ui-dispatch-ready', root, 'tasks/ui-2', dispatched), null)
    // 旧 frontend 历史记录经兼容读归一后同样满足门禁（旧值兼容用例，AC7）。
    const legacyDispatched = makeGuardView(root, 'tasks/ui-2-legacy', {
      status: 'in_progress',
      stage: 'implementing',
      dispatches: [
        { kind: 'implement', at: '2026-08-29T00:00:00Z', title: 'impl' },
        { kind: 'frontend', at: '2026-08-29T01:00:00Z', title: 'ui' },
      ],
    }, { 'prd.md': prd })
    assert.equal(guardReason('ui-dispatch-ready', root, 'tasks/ui-2-legacy', legacyDispatched), null)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('ui-dispatch-ready 守卫：小节缺失/prd 缺失/不适用声明/空正文口径与旧前端门一致', () => {
  const root = makeRoot()
  try {
    // 无 UI Design 小节 → 通过（不涉及前端展示零影响）。
    const noSection = makeGuardView(root, 'tasks/ui-3', {}, { 'prd.md': '# Task\n\n## Requirements\n\n- no ui\n' })
    assert.equal(guardReason('ui-dispatch-ready', root, 'tasks/ui-3', noSection), null)
    // prd 缺失 → 通过（缺失不判前端展示）。
    const noPrd = makeGuardView(root, 'tasks/ui-4', {})
    assert.equal(guardReason('ui-dispatch-ready', root, 'tasks/ui-4', noPrd), null)
    // 首行不适用声明（中英词表）→ 通过。
    const declarations = [
      '不适用：本任务无前端界面改动，仅工具回执文本增加标注。',
      'N/A',
      'n/a: backend only',
      'Not applicable — 无前端触点',
      'NOT APPLICABLE',
      'None',
      '  不适用  ',
    ]
    for (const [index, declaration] of declarations.entries()) {
      const view = makeGuardView(root, `tasks/ui-decl-${index}`, {}, {
        'prd.md': `# Task\n\n## UI Design\n\n${declaration}\n`,
      })
      assert.equal(
        guardReason('ui-dispatch-ready', root, `tasks/ui-decl-${index}`, view),
        null,
        `declaration should pass: ${declaration}`,
      )
    }
    // 声明带后续说明段 → 仍按首行认定通过。
    const withNote = makeGuardView(root, 'tasks/ui-5', {}, {
      'prd.md': '# Task\n\n## UI Design\n\n不适用：无前端界面。\n\n仅回执文本变化，属 runtime 文案。\n',
    })
    assert.equal(guardReason('ui-dispatch-ready', root, 'tasks/ui-5', withNote), null)
    // 声明词只出现在正文中部 → 不认定声明，仍拦截。
    const midText = makeGuardView(root, 'tasks/ui-6', {}, {
      'prd.md': '# Task\n\n## UI Design\n\n- 新增设置页\n- 旧布局说明：不适用\n',
    })
    assert.equal(
      guardReason('ui-dispatch-ready', root, 'tasks/ui-6', midText),
      'no frontend-developer dispatch recorded for a task with UI requirements',
    )
    // 小节正文为空 → 维持现状拦截（空正文不是声明）。
    const emptyBody = makeGuardView(root, 'tasks/ui-7', {}, { 'prd.md': '# Task\n\n## UI Design\n\n## Notes\n\n- x\n' })
    assert.equal(
      guardReason('ui-dispatch-ready', root, 'tasks/ui-7', emptyBody),
      'no frontend-developer dispatch recorded for a task with UI requirements',
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('start-ready 守卫 light：H1 + Goal 填写即放行（免确认记录、双 jsonl 与 PLAN）', () => {
  const root = makeRoot()
  try {
    const view = makeGuardView(root, 'tasks/light-1', { mode: 'light' }, { 'prd.md': LIGHT_MIN_PRD })
    assert.equal(guardReason('start-ready', root, 'tasks/light-1', view), null)
    // R/AC 追踪问题（空需求/空验收）也不拦截轻量任务。
    const noNumbering = makeGuardView(root, 'tasks/light-2', { mode: 'light' }, {
      'prd.md': '# Light fix\n\n## Goal\n\nRepair the shell file.\n\n## Requirements\n\n- req without numbering\n\n## Acceptance Criteria\n\n- ac without numbering\n',
    })
    assert.equal(guardReason('start-ready', root, 'tasks/light-2', noNumbering), null)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('start-ready 守卫 light：缺 H1 / Goal placeholder / Goal 缺失 / prd 缺失逐项拦截', () => {
  const root = makeRoot()
  try {
    const noH1 = makeGuardView(root, 'tasks/light-3', { mode: 'light' }, {
      'prd.md': LIGHT_MIN_PRD.replace('# Light fix\n\n', ''),
    })
    assert.equal(guardReason('start-ready', root, 'tasks/light-3', noH1), 'prd.md missing H1 title')
    const placeholderGoal = makeGuardView(root, 'tasks/light-4', { mode: 'light' }, {
      'prd.md': LIGHT_MIN_PRD.replace(
        'Repair the shell file.',
        '(placeholder: describe the outcome this task achieves and how it will be observed; the goal must follow from the context above)',
      ),
    })
    assert.equal(
      guardReason('start-ready', root, 'tasks/light-4', placeholderGoal),
      'prd.md section "Goal" is still a placeholder',
    )
    const missingGoal = makeGuardView(root, 'tasks/light-5', { mode: 'light' }, {
      'prd.md': LIGHT_MIN_PRD.replace('## Goal\n\nRepair the shell file.\n\n', ''),
    })
    assert.equal(
      guardReason('start-ready', root, 'tasks/light-5', missingGoal),
      'prd.md section "Goal" is missing',
    )
    const noPrd = makeGuardView(root, 'tasks/light-6', { mode: 'light' })
    assert.equal(guardReason('start-ready', root, 'tasks/light-6', noPrd), 'prd.md is missing')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('start-ready 守卫 standard：同一份最低 prd 按完整门禁拦截（结构/PLAN/jsonl 一次列全）', () => {
  const root = makeRoot()
  try {
    // 旧 full 记录经兼容读作 standard，走完整门禁分支。
    const view = makeGuardView(root, 'tasks/std-1', { mode: 'full' }, { 'prd.md': LIGHT_MIN_PRD })
    const reason = guardReason('start-ready', root, 'tasks/std-1', view)
    assert.ok(reason !== null)
    for (const expected of [
      '"Requirements"',
      '"Acceptance Criteria"',
      '"Notes"',
      'implement.jsonl has no effective records',
      'check.jsonl has no effective records',
      'plan.md is missing',
    ]) {
      assert.ok(reason.includes(expected), `reason must include: ${expected}`)
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('start-ready 与 plan-confirmed 守卫分工：PLAN 结构缺失与内容未确认各自报告', () => {
  const root = makeRoot()
  try {
    const files = {
      'prd.md': FILLED_PRD,
      'implement.jsonl': '{"file": "AGENTS.md", "reason": "spec"}\n',
      'check.jsonl': '{"file": "AGENTS.md", "reason": "spec"}\n',
    }
    // PLAN 缺失：start-ready 报结构缺失；plan-confirmed 报未确认（两守卫各自报告，
    // 迁移拒绝时聚合为一条可判定错误）。
    const noPlan = makeGuardView(root, 'tasks/plan-1', {
      alignment: { passedAt: 'x', summary: 's' },
    }, files)
    assert.ok(guardReason('start-ready', root, 'tasks/plan-1', noPlan).includes('plan.md is missing'))
    assert.equal(
      guardReason('plan-confirmed', root, 'tasks/plan-1', noPlan),
      'plan.md content has not been confirmed (run workloom_task_align with target=plan after reviewing plan.md)',
    )
    // PLAN 结构合格但未确认：start-ready 通过，plan-confirmed 单独拦截。
    const withPlan = makeGuardView(root, 'tasks/plan-2', {
      alignment: { passedAt: 'x', summary: 's' },
    }, { ...files, 'plan.md': MIN_PLAN })
    assert.equal(guardReason('start-ready', root, 'tasks/plan-2', withPlan), null)
    assert.ok(guardReason('plan-confirmed', root, 'tasks/plan-2', withPlan) !== null)
    // 补上 PLAN 确认后两守卫都放行（确认只判记录有无，不比对哈希）。
    const confirmed = makeGuardView(root, 'tasks/plan-3', {
      alignment: { passedAt: 'x', summary: 's' },
      planConfirmation: { passedAt: 'y', summary: 'p' },
    }, { ...files, 'plan.md': MIN_PLAN })
    assert.equal(guardReason('start-ready', root, 'tasks/plan-3', confirmed), null)
    assert.equal(guardReason('plan-confirmed', root, 'tasks/plan-3', confirmed), null)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('plan-confirmed 守卫：容器任务（children 非空）豁免；light 豁免', () => {
  const root = makeRoot()
  try {
    const container = makeGuardView(root, 'tasks/container-1', {
      mode: 'full',
      children: ['tasks/xx-01-child'],
      alignment: { passedAt: 'x', summary: 's' },
    }, { 'prd.md': FILLED_PRD, 'implement.jsonl': '{"file": "AGENTS.md"}\n', 'check.jsonl': '{"file": "AGENTS.md"}\n' })
    assert.equal(guardReason('plan-confirmed', root, 'tasks/container-1', container), null)
    // 容器任务同时豁免 PLAN 结构检查（children 的 PLAN 在 CASE 校验中消费）。
    assert.equal(guardReason('start-ready', root, 'tasks/container-1', container), null)
    const light = makeGuardView(root, 'tasks/light-plan', { mode: 'light' }, { 'prd.md': LIGHT_MIN_PRD })
    assert.equal(guardReason('plan-confirmed', root, 'tasks/light-plan', light), null)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('prd-confirmed 守卫：无凭据拦截（文案点名 workloom_task_align 与 Phase 1.1），旧 prdHash 凭据容忍，light 豁免', () => {
  const root = makeRoot()
  try {
    const missing = makeGuardView(root, 'tasks/prd-1', {}, { 'prd.md': FILLED_PRD })
    const reason = guardReason('prd-confirmed', root, 'tasks/prd-1', missing)
    assert.equal(
      reason,
      'no alignment credential recorded (run workloom_task_align with action=confirm after Phase 1.1 converges)',
    )
    // 凭据只判有无（无哈希）：旧数据遗留 prdHash 字段不参与判断。
    const legacy = makeGuardView(root, 'tasks/prd-2', {
      alignment: { passedAt: '2026-09-01T00:00:00Z', summary: 'converged', prdHash: 'deadbeef' },
    }, { 'prd.md': FILLED_PRD })
    assert.equal(guardReason('prd-confirmed', root, 'tasks/prd-2', legacy), null)
    // light 免对齐（轻量轨跳过 Phase 1.1）。
    const light = makeGuardView(root, 'tasks/prd-3', { mode: 'light' }, { 'prd.md': LIGHT_MIN_PRD })
    assert.equal(guardReason('prd-confirmed', root, 'tasks/prd-3', light), null)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('start-ready 守卫：确认后修改 prd/plan 不产生 stale 拒绝（无哈希失效判定）', () => {
  const root = makeRoot()
  try {
    const rel = 'tasks/stale-1'
    const files = {
      'prd.md': FILLED_PRD,
      'plan.md': MIN_PLAN,
      'implement.jsonl': '{"file": "AGENTS.md", "reason": "spec"}\n',
      'check.jsonl': '{"file": "AGENTS.md", "reason": "spec"}\n',
    }
    const confirmed = makeGuardView(root, rel, {
      status: 'in_progress',
      stage: 'implementing',
      alignment: { passedAt: 'x', summary: 's' },
      planConfirmation: { passedAt: 'y', summary: 'p' },
    }, files)
    assert.equal(guardReason('start-ready', root, rel, confirmed), null)
    // 确认后文档被修改：守卫只认记录有无，不再比对哈希，仍然放行。
    writeFileSync(join(root, '.workloom', rel, 'prd.md'), `${FILLED_PRD}\n- edited after confirm\n`)
    writeFileSync(join(root, '.workloom', rel, 'plan.md'), `${MIN_PLAN}\n<!-- edited -->\n`)
    const [err, edited] = readTaskView(root, rel)
    assert.equal(err, null)
    assert.equal(guardReason('start-ready', root, rel, edited), null)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('light-dispatch 守卫：light 拒绝（主会话包办文案），standard/parent 与旧记录缺 mode 放行', () => {
  const root = makeRoot()
  try {
    const light = makeGuardView(root, 'tasks/ld-1', { mode: 'light' })
    const reason = guardReason('light-dispatch', root, 'tasks/ld-1', light)
    assert.match(reason, /light task/)
    assert.match(reason, /main session/)
    const std = makeGuardView(root, 'tasks/ld-2', { mode: 'standard' })
    assert.equal(guardReason('light-dispatch', root, 'tasks/ld-2', std), null)
    const parent = makeGuardView(root, 'tasks/ld-3', { mode: 'parent' })
    assert.equal(guardReason('light-dispatch', root, 'tasks/ld-3', parent), null)
    // 旧记录缺 mode 的读取归一化由兼容读负责（standard）；守卫只认显式 light。
    const legacy = makeGuardView(root, 'tasks/ld-4', {})
    assert.equal(legacy.mode, 'standard')
    assert.equal(guardReason('light-dispatch', root, 'tasks/ld-4', legacy), null)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('toTaskView 纯函数口径：部分记录（回合缓存夹具形态）兼容映射不炸', () => {
  // 注入链下游（session-context/workflow-service）会把视图或部分记录再次喂给
  // toTaskView：幂等返回且缺失数组字段防御读取。
  const partial = { title: 'Partial', status: 'in_progress', mode: 'full', taskRelPath: 'tasks/p' }
  const view = toTaskView(partial, 'tasks/p')
  assert.equal(view.mode, 'standard')
  assert.equal(view.stage, 'implementing')
  assert.equal(toTaskView(view, 'tasks/p').mode, 'standard')
})

/* ---------------- 步骤 8：三模式合法链与 parent 写路径探针 ---------------- */

import { requireTaskRecord as requireRecord, writeTaskRecord as writeRecord } from '../src/task/storage/index.ts'

/** 写 start-ready 守卫所需的最小文档集（prd/plan/双 jsonl）。 */
function satisfyStartDocs(root, rel) {
  writeFileSync(join(root, '.workloom', rel, 'prd.md'), FILLED_PRD)
  writeFileSync(join(root, '.workloom', rel, 'plan.md'), MIN_PLAN)
  writeFileSync(join(root, '.workloom', rel, 'implement.jsonl'), '{"file": "AGENTS.md"}\n')
  writeFileSync(join(root, '.workloom', rel, 'check.jsonl'), '{"file": "AGENTS.md"}\n')
}

/** 直接落 check 凭据（探针聚焦主线迁移，凭据物理写不经编排层）。 */
function seedCheckCredential(root, rel) {
  const record = requireRecord(root, rel)
  record.check = { passedAt: new Date().toISOString(), summary: 'probe check' }
  writeRecord(root, rel, record)
}

test('合法链：standard 全程 aligning→planning→implementing→checking→archived', async () => {
  const root = makeRoot()
  try {
    const [, created] = await createTask(root, { title: 'Standard Chain' })
    const rel = created.taskRelPath
    satisfyStartDocs(root, rel)
    // aligning→planning：PRD 确认迁移。
    const [prdErr, prdView] = confirmPrd(root, rel, { summary: 'converged' })
    assert.equal(prdErr, null)
    assert.equal(prdView.stage, 'planning')
    // Judger 评审轨道到 clean 后 PLAN 确认。
    recordPlanReview(root, rel, 'reviewing')
    recordPlanReview(root, rel, 'clean')
    const [planErr] = confirmPlan(root, rel, { summary: 'plan ok' })
    assert.equal(planErr, null)
    // planning→implementing：守卫全满足，查表通过。
    const [startErr, started] = migrateTask(root, { taskRelPath: rel, to: 'implementing' })
    assert.equal(startErr, null)
    assert.equal(started.view.stage, 'implementing')
    assert.equal(started.view.status, 'in_progress')
    // CASE 轨道推进到 approved（旧任务形态：case 记录置空后补轨道，结果门禁平凡通过）。
    const record = requireRecord(root, rel)
    record.case = null
    writeRecord(root, rel, record)
    advanceCaseTrackTo(root, rel, 'approved')
    // implementing→checking：case-approved/check-ready/ui-dispatch-ready/case-outcome 全过。
    const [checkErr, checked] = migrateTask(root, { taskRelPath: rel, to: 'checking' })
    assert.equal(checkErr, null)
    assert.equal(checked.view.stage, 'checking')
    // checking→archived：archive-ready 要 check 凭据；落凭据后通过，completedAt 同点写入。
    seedCheckCredential(root, rel)
    const [archErr, archived] = migrateTask(root, { taskRelPath: rel, to: 'archived' })
    assert.equal(archErr, null)
    assert.equal(archived.view.stage, 'archived')
    assert.equal(archived.view.status, 'completed')
    assert.ok(archived.view.completedAt !== null)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('合法链：light 全程 aligning→planning→implementing→archived（无 CASE 轨道、无 checking）', async () => {
  const root = makeRoot()
  try {
    const [, created] = await createTask(root, { title: 'Light Chain', mode: 'light' })
    const rel = created.taskRelPath
    writeFileSync(join(root, '.workloom', rel, 'prd.md'), LIGHT_MIN_PRD)
    // light 免对齐：aligning→planning 无需 PRD 确认（prd-confirmed 守卫对 light 恒过）。
    const [planErr, planned] = migrateTask(root, { taskRelPath: rel, to: 'planning' })
    assert.equal(planErr, null)
    assert.equal(planned.view.stage, 'planning')
    // planning→implementing：start-ready 只查 H1 + Goal。
    const [startErr] = migrateTask(root, { taskRelPath: rel, to: 'implementing' })
    assert.equal(startErr, null)
    // implementing→archived：落自查凭据后直达（不经过 checking）。
    seedCheckCredential(root, rel)
    const [archErr, archived] = migrateTask(root, { taskRelPath: rel, to: 'archived' })
    assert.equal(archErr, null)
    assert.equal(archived.view.stage, 'archived')
    assert.equal(archived.view.casePhase, 'none')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('合法链：parent 全程 aligning→planning→orchestrating→integrating→archived', async () => {
  const root = makeRoot()
  try {
    const [, created] = await createTask(root, { title: 'Parent Chain', mode: 'parent' })
    const rel = created.taskRelPath
    satisfyStartDocs(root, rel)
    const [prdErr] = confirmPrd(root, rel, { summary: 'converged' })
    assert.equal(prdErr, null)
    // 容器任务豁免 PLAN 确认与结构检查（children 的 PLAN 在 CASE 校验中消费）。
    const [, child] = await createTask(root, { title: 'Chain Child', parent: rel })
    // parent 写路径认定：被指向的父任务 mode 归一为 parent（createTask 联动）。
    const [, parentAfter] = readTaskView(root, rel)
    assert.equal(parentAfter.mode, 'parent')
    const [orchErr, orch] = migrateTask(root, { taskRelPath: rel, to: 'orchestrating' })
    assert.equal(orchErr, null)
    assert.equal(orch.view.stage, 'orchestrating')
    // 子任务未归档：integrating 被 children-archived 拒绝。
    const [blockedErr] = migrateTask(root, { taskRelPath: rel, to: 'integrating' })
    assert.ok(blockedErr)
    assert.match(blockedErr.message, /children not archived yet/)
    // 子任务归档后放行。
    const childRecord = requireRecord(root, child.taskRelPath)
    childRecord.status = 'completed'
    writeRecord(root, child.taskRelPath, childRecord)
    const [intErr, integrating] = migrateTask(root, { taskRelPath: rel, to: 'integrating' })
    assert.equal(intErr, null)
    assert.equal(integrating.view.stage, 'integrating')
    // integrating→archived：archive-ready + integration-case-passed（case 缺省平凡通过）。
    seedCheckCredential(root, rel)
    const [archErr, archived] = migrateTask(root, { taskRelPath: rel, to: 'archived' })
    assert.equal(archErr, null)
    assert.equal(archived.view.stage, 'archived')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('非法迁移抽样：归档后不可再迁移，parent 不得进 checking，standard 不得进 orchestrating', async () => {
  const root = makeRoot()
  try {
    const [, created] = await createTask(root, { title: 'Illegal Samples', mode: 'light' })
    const rel = created.taskRelPath
    writeFileSync(join(root, '.workloom', rel, 'prd.md'), LIGHT_MIN_PRD)
    seedCheckCredential(root, rel)
    const [archErr] = migrateTask(root, { taskRelPath: rel, to: 'archived' })
    assert.equal(archErr, null)
    // 归档是终态：任何再迁移都无路径。
    const [postErr] = migrateTask(root, { taskRelPath: rel, to: 'implementing' })
    assert.ok(postErr)
    assert.match(postErr.message, /no transition path in the table/)
    // parent 无 checking 边。
    const [, parent] = await createTask(root, { title: 'Parent Illegal', mode: 'parent' })
    const [parentErr] = migrateTask(root, { taskRelPath: parent.taskRelPath, to: 'checking' })
    assert.ok(parentErr)
    assert.match(parentErr.message, /no transition path in the table/)
    // standard 无 orchestrating 边。
    const [, std] = await createTask(root, { title: 'Std Illegal' })
    const [stdErr] = migrateTask(root, { taskRelPath: std.taskRelPath, to: 'orchestrating' })
    assert.ok(stdErr)
    assert.match(stdErr.message, /no transition path in the table/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

/* ---------------- S13：completed-not-archived 新阶段 ---------------- */

test('completed 六边可达：standard checking→completed→archived 与 light implementing→completed→archived', async () => {
  const root = makeRoot()
  try {
    // standard：checking→completed 与归档边同守卫（archive-ready + case-outcome-ready）。
    const [, std] = await createTask(root, { title: 'Std Completed' })
    const stdRel = std.taskRelPath
    satisfyStartDocs(root, stdRel)
    const [prdErr] = confirmPrd(root, stdRel, { summary: 'converged' })
    assert.equal(prdErr, null)
    recordPlanReview(root, stdRel, 'reviewing')
    recordPlanReview(root, stdRel, 'clean')
    const [planErr] = confirmPlan(root, stdRel, { summary: 'plan ok' })
    assert.equal(planErr, null)
    const [startErr] = migrateTask(root, { taskRelPath: stdRel, to: 'implementing' })
    assert.equal(startErr, null)
    // 旧任务形态（case=null）补轨道：本探针聚焦主线迁移，CASE 结构链在 case.test。
    const record = requireRecord(root, stdRel)
    record.case = null
    writeRecord(root, stdRel, record)
    advanceCaseTrackTo(root, stdRel, 'approved')
    const [checkErr] = migrateTask(root, { taskRelPath: stdRel, to: 'checking' })
    assert.equal(checkErr, null)
    seedCheckCredential(root, stdRel)
    const [compErr, completed] = migrateTask(root, { taskRelPath: stdRel, to: 'completed' })
    assert.equal(compErr, null)
    assert.equal(completed.view.stage, 'completed')
    assert.equal(completed.view.status, 'completed')
    // completedAt 随 completed 迁移落盘（完成未归档即有完成时刻）。
    const completedAt = completed.view.completedAt
    assert.ok(completedAt !== null)
    // completed→archived 放行，归档不覆盖完成时刻。
    const [archErr, archived] = migrateTask(root, { taskRelPath: stdRel, to: 'archived' })
    assert.equal(archErr, null)
    assert.equal(archived.view.stage, 'archived')
    assert.equal(archived.view.completedAt, completedAt)
    // light：implementing→completed→archived（守卫集对称，case-outcome 对 light 恒真）。
    const [, light] = await createTask(root, { title: 'Light Completed', mode: 'light' })
    const lightRel = light.taskRelPath
    writeFileSync(join(root, '.workloom', lightRel, 'prd.md'), LIGHT_MIN_PRD)
    const [lPlanErr] = migrateTask(root, { taskRelPath: lightRel, to: 'planning' })
    assert.equal(lPlanErr, null)
    const [lStartErr] = migrateTask(root, { taskRelPath: lightRel, to: 'implementing' })
    assert.equal(lStartErr, null)
    seedCheckCredential(root, lightRel)
    const [lCompErr, lCompleted] = migrateTask(root, { taskRelPath: lightRel, to: 'completed' })
    assert.equal(lCompErr, null)
    assert.equal(lCompleted.view.stage, 'completed')
    assert.ok(lCompleted.view.completedAt !== null)
    const [lArchErr] = migrateTask(root, { taskRelPath: lightRel, to: 'archived' })
    assert.equal(lArchErr, null)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('completed→implementing 回边无守卫（集成期打回返工，完成后可再完成）', async () => {
  const root = makeRoot()
  try {
    const [, created] = await createTask(root, { title: 'Reopen Loop', mode: 'light' })
    const rel = created.taskRelPath
    writeFileSync(join(root, '.workloom', rel, 'prd.md'), LIGHT_MIN_PRD)
    const [planErr] = migrateTask(root, { taskRelPath: rel, to: 'planning' })
    assert.equal(planErr, null)
    const [startErr] = migrateTask(root, { taskRelPath: rel, to: 'implementing' })
    assert.equal(startErr, null)
    seedCheckCredential(root, rel)
    const [compErr, completed] = migrateTask(root, { taskRelPath: rel, to: 'completed' })
    assert.equal(compErr, null)
    const firstCompletedAt = completed.view.completedAt
    // 回边无守卫：无 force、无 reason 也放行，status 同步回 in_progress。
    const [backErr, back] = migrateTask(root, { taskRelPath: rel, to: 'implementing' })
    assert.equal(backErr, null)
    assert.equal(back.view.stage, 'implementing')
    assert.equal(back.view.status, 'in_progress')
    // 返工后再次完成；completedAt 空值守卫保住首次完成时刻。
    const [againErr, again] = migrateTask(root, { taskRelPath: rel, to: 'completed' })
    assert.equal(againErr, null)
    assert.equal(again.view.stage, 'completed')
    assert.equal(again.view.completedAt, firstCompletedAt)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('deriveStage 新枚举优先：落盘 stage 命中即直读，completed 不被 status 兜底误读为 archived', () => {
  const root = makeRoot()
  try {
    // 新代码 stage/status 恒成对落盘：stage=completed 直读 completed（not archived）。
    const newDone = baseRecord({ status: 'completed', stage: 'completed' })
    const doneView = readViewOf(root, 'tasks/10-30-pair-completed', newDone)
    assert.equal(doneView.stage, 'completed')
    assert.equal(doneView.status, 'completed')
    // 其余新枚举 stage 直读抽查（orchestrating）。
    const orch = baseRecord({ status: 'in_progress', stage: 'orchestrating', children: ['tasks/10-30-c'] })
    const orchView = readViewOf(root, 'tasks/10-30-pair-orch', orch)
    assert.equal(orchView.stage, 'orchestrating')
    // 旧数据兜底回归：status=completed 且无 stage 字段仍读 archived。
    const legacy = baseRecord({ status: 'completed' })
    delete legacy.stage
    const legacyView = readViewOf(root, 'tasks/10-30-legacy-completed', legacy)
    assert.equal(legacyView.stage, 'archived')
    assert.equal(legacyView.status, 'completed')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('parent 模式无 completed 边：查表拒绝，消息含 from/to/mode', async () => {
  const root = makeRoot()
  try {
    const [, created] = await createTask(root, { title: 'Parent No Complete', mode: 'parent' })
    const rel = created.taskRelPath
    satisfyStartDocs(root, rel)
    const [prdErr] = confirmPrd(root, rel, { summary: 'converged' })
    assert.equal(prdErr, null)
    // 容器任务豁免 PLAN 确认（children 非空才豁免，挂一个子任务）。
    await createTask(root, { title: 'No Complete Child', parent: rel })
    const [orchErr] = migrateTask(root, { taskRelPath: rel, to: 'orchestrating' })
    assert.equal(orchErr, null)
    const [compErr] = migrateTask(root, { taskRelPath: rel, to: 'completed' })
    assert.ok(compErr)
    assert.match(compErr.message, /no transition path in the table/)
    assert.match(compErr.message, /"orchestrating" to "completed"/)
    assert.match(compErr.message, /mode parent/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
