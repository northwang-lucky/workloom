/**
 * git worktree 兼容性集成测试：以真实 git 仓库（git init + git worktree add）
 * 验证 workloom 工具链在人工创建的 worktree 中的定位与隔离语义。
 *
 * 场景与验收映射（design.md §3）：
 * 1. linked worktree 根 cwd 下 create→start 全链路（AC1）；
 * 2. worktree 深层子目录 cwd 解析活跃任务：resolveTaskRelPath 定位修复的回归
 *    （AC2，先红后绿——本文件唯一 test-first 接缝）；
 * 3. 脏工作区下 git 状态读取（AC3）；
 * 4. .workloom/.runtime/ 在两个 worktree 间互不可见（AC4）；
 * 5. task 数据随分支隔离（AC5，显式语义固化）。
 *
 * fixture：每测试 mkdtemp 独立临时基目录（主仓 + linked worktree 都在其内，
 * 整树清理）；git 不可用时全部用例 skip。测试依赖 dist（core test 先 build）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import {
  countDirtyLines,
  executeCreateTask,
  executeStartTask,
  gitCurrentBranchSync,
  gitStatusSync,
  initWorkloom,
  listTasks,
  recordAlignmentCredential,
  recordPlanConfirmation,
  resolveActiveTask,
  setActiveTask,
} from '../src/index.ts'

// 测试隔离：core 三层配置的全局层读 $HOME/.workloom/config（调用链无 homeDir 注入
// 缝时吃 os.homedir 实时值）；本机真实全局配置会泄漏进单测。重定向 HOME 到临时目录
// 使全局层恒为空（与 config.test.ts 的 homeDir 注入、executor.test.ts 的重定向同口径）。
const isolatedHome = mkdtempSync(join(tmpdir(), 'workloom-core-home-'))
// TMPDIR 一并指向隔离目录：夹具临时目录随之落在 HOME 之内，findWorkloomRoot 的
// 上溯在 HOME 边界停下（与真实环境“家目录为上溯边界”的语义一致），不会误发现
// 本机真实家目录的 .workloom。
process.env.HOME = isolatedHome
process.env.TMPDIR = isolatedHome


/** .workloom 资产目录名。 */
const WORKLOOM_REL = '.workloom'

/** 提交用固定身份（-c 逐命令注入，不依赖全局 gitconfig）。 */
const GIT_USER = 'workloom-test'
const GIT_EMAIL = 'workloom-test@example.com'

/** git 可用性探测：git --version 失败则全部用例 skip（兜底无 git 的 CI 镜像）。 */
let gitAvailable = true
try {
  execFileSync('git', ['--version'], { stdio: 'pipe' })
} catch {
  gitAvailable = false
}

/** node:test 选项：git 不可用时跳过用例。 */
const gitSkip = gitAvailable ? {} : { skip: 'git unavailable: git --version failed' }

/** 在 cwd 下执行 git 命令并返回 stdout。 */
function runGit(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' }).trim()
}

/** 创建本测试独立临时基目录（主仓与 worktree 皆置于其内，整树清理）。 */
function makeBase() {
  return mkdtempSync(join(tmpdir(), 'workloom-wt-'))
}

/**
 * 建真实 git 仓库：init（显式分支名）→ .workloom 初始骨架（initWorkloom）→
 * 首次提交（git add + commit）。worktree add 需要仓库至少一个 commit。
 */
function makeGitRepo(base) {
  const repo = join(base, 'repo')
  mkdirSync(repo)
  runGit(repo, ['init', '-b', 'main'])
  const [err] = initWorkloom(repo, { developer: 'alice' })
  assert.equal(err, null)
  runGit(repo, ['add', '--', WORKLOOM_REL])
  gitCommit(repo, 'chore: init workloom')
  return repo
}

/** 以固定身份提交（主仓与 worktree 侧共用）。 */
function gitCommit(cwd, message) {
  runGit(cwd, [
    '-c',
    `user.name=${GIT_USER}`,
    '-c',
    `user.email=${GIT_EMAIL}`,
    'commit',
    '-m',
    message,
  ])
}

/**
 * 添加 linked worktree：独立分支（规避同分支独占限制）；startPoint 给定分支起点
 * 提交（模拟"分支上还没有该任务提交"的隔离场景）。路径位于基目录内，随整树清理。
 */
function addWorktree(repo, name, branch, startPoint) {
  const wt = join(dirname(repo), name)
  const args = ['worktree', 'add', wt, '-b', branch]
  if (startPoint !== undefined) args.push(startPoint)
  runGit(repo, args)
  return wt
}

/** 满足 start 门禁：填 prd（含 H1）十一小节 + R/AC 追踪 + 收敛 marker + 最小 PLAN + 两个 jsonl 各一条有效记录。 */
function satisfyStartGate(root, taskRelPath) {
  const taskDir = join(root, WORKLOOM_REL, taskRelPath)
  writeFileSync(
    join(taskDir, 'prd.md'),
    '# Filled\n\n## Context\n\nThe gate harness needs a filled sample.\n\n## Goal\n\nDo the thing.\n\n## Scope\n\nIn scope: the thing itself. Non-goals: none.\n\n## Assumptions, Constraints and Dependencies\n\nNo new dependencies beyond the gate harness.\n\n## Requirements\n\n- R1: the thing happens by default\n\n## Acceptance Criteria\n\n- AC1（覆盖 R1）: the thing is observable. Verification: run the gate tests.\n\n## Edge Cases and Failure Paths\n\nNone: no boundary conditions beyond the gate itself.\n\n## Risks and Open Questions\n\nNone: no open questions remain.\n\n## Alignment Decisions\n\n- design tree converged\n\n## References\n\nNone.\n\n## Notes\n\n- note\n\n<!-- workloom:open-nodes=none -->\n',
  )
  // 完整实施任务 start 还要求 PLAN（夹具 prd 无 AC 编号，最小 plan 即可通过）。
  writeFileSync(
    join(taskDir, 'plan.md'),
    '# Plan\n\n## Steps\n\n#### 步骤 1.1 implement\n\n- Covers: AC1\n- Target: src/a.js\n- Edit:\n  Input: adjust src/a.js behavior.\n  Output: function returns updated result.\n  Preconditions: none\n  Procedure: edit the guarded branch per anchors.\n  Failure: none\n- Verify: pnpm lint\n',
  )
  writeFileSync(join(taskDir, 'implement.jsonl'), '{"file": "AGENTS.md", "reason": "spec"}\n')
  writeFileSync(join(taskDir, 'check.jsonl'), '{"file": "AGENTS.md", "reason": "spec"}\n')
}

/** 记录 PRD 与 PLAN 内容确认（模拟两次 confirm 后状态）。 */
function alignTask(root, taskRelPath) {
  const [err] = recordAlignmentCredential(root, taskRelPath, {
    summary: 'frontier empty, all decisions settled',
  })
  assert.equal(err, null)
  const [planErr] = recordPlanConfirmation(root, taskRelPath, {
    summary: 'plan covers every AC, steps verified',
  })
  assert.equal(planErr, null)
}

/**
 * 场景 2：worktree 深层子目录 cwd 下解析活跃任务。
 * 指针写在 wt 根 .workloom/.runtime/sessions/，而 cwd 是 wt 根下 a/b/c；
 * 修复前 resolveTaskRelPath 把原始 cwd 当根去找指针（ENOENT）→ 误报
 * "no active task"，修复后向上定位到 wt 根正常解析（AC2 回归）。
 */
test('worktree 深层子目录 cwd 解析活跃任务（回归）', gitSkip, async (t) => {
  const base = makeBase()
  t.after(() => rmSync(base, { recursive: true, force: true }))
  const repo = makeGitRepo(base)
  const wt = addWorktree(repo, 'wt-deep', 'feature/deep-cwd')
  const contextKey = 'dsh_deep_cwd'
  // 任务从深层子目录创建（create 内部自行向上定位，指针落在 wt 根）。
  const deep = join(wt, 'a', 'b', 'c')
  mkdirSync(deep, { recursive: true })
  const [createErr, created] = await executeCreateTask(deep, contextKey, {
    title: 'Deep Cwd Task',
    package: 'repo',
  })
  assert.equal(createErr, null)
  assert.ok(created)
  // 门禁前置满足后，无 taskPath 的 start 必须从深层 cwd 解析出活跃任务。
  satisfyStartGate(wt, created.taskRelPath)
  alignTask(wt, created.taskRelPath)
  const [startErr, started] = await executeStartTask(deep, contextKey, {})
  assert.equal(startErr, null, startErr?.message)
  assert.ok(started)
  assert.equal(started.taskRelPath, created.taskRelPath)
  assert.equal(started.status, 'in_progress')
})

/**
 * 场景 1：linked worktree 根 cwd 下 create→start 全链路（AC1）。
 * 任务创建于该 worktree 自己的 .workloom/tasks/，活跃指针可解析、无 taskPath
 * 的 start 可经活跃 fallback 启动。
 */
test('linked worktree 根 cwd 下 create→start 全链路', gitSkip, async (t) => {
  const base = makeBase()
  t.after(() => rmSync(base, { recursive: true, force: true }))
  const repo = makeGitRepo(base)
  const wt = addWorktree(repo, 'wt-chain', 'feature/chain')
  const contextKey = 'dsh_wt_chain'
  const [createErr, created] = await executeCreateTask(wt, contextKey, {
    title: 'Worktree Chain Task',
    package: 'repo',
  })
  assert.equal(createErr, null)
  assert.ok(created)
  // 任务目录落在该 worktree 的 .workloom/tasks/ 下（而非主仓）。
  assert.equal(existsSync(join(wt, WORKLOOM_REL, created.taskRelPath)), true)
  // 活跃指针写入该 worktree 的 .runtime，可解析到同一任务。
  const [ptrErr, active] = resolveActiveTask(wt, contextKey)
  assert.equal(ptrErr, null)
  assert.equal(active, created.taskRelPath)
  // 门禁前置满足后，无 taskPath 的 start 走活跃 fallback 启动成功。
  satisfyStartGate(wt, created.taskRelPath)
  alignTask(wt, created.taskRelPath)
  const [startErr, started] = await executeStartTask(wt, contextKey, {})
  assert.equal(startErr, null, startErr?.message)
  assert.ok(started)
  assert.equal(started.taskRelPath, created.taskRelPath)
  assert.equal(started.status, 'in_progress')
})

/**
 * 场景 3：脏工作区下 git 状态读取（AC3）。gitStatusSync 以 worktree 根为 cwd
 * 跑 git status --porcelain：脏文件行数正确、当前分支名正确（.runtime 等已被
 * .workloom/.gitignore 忽略，不污染脏计数）。
 */
test('worktree 脏工作区 git 状态读取正确', gitSkip, async (t) => {
  const base = makeBase()
  t.after(() => rmSync(base, { recursive: true, force: true }))
  const repo = makeGitRepo(base)
  const wt = addWorktree(repo, 'wt-dirty', 'feature/dirty')
  writeFileSync(join(wt, 'untracked-a.txt'), 'a')
  writeFileSync(join(wt, 'untracked-b.txt'), 'b')
  const [statusErr, status] = gitStatusSync(wt)
  assert.equal(statusErr, null)
  assert.equal(countDirtyLines(status), 2)
  const [branchErr, branch] = gitCurrentBranchSync(wt)
  assert.equal(branchErr, null)
  assert.equal(branch, 'feature/dirty')
})

/**
 * 场景 4：.workloom/.runtime/ 在两个 worktree 间互不可见（AC4）。
 * .runtime/ 被 .workloom/.gitignore 忽略、不随提交分发：主仓写入的会话指针不会
 * 出现在 linked worktree 侧，反向同理。
 */
test('.runtime 会话指针在两个 worktree 间互不可见', gitSkip, async (t) => {
  const base = makeBase()
  t.after(() => rmSync(base, { recursive: true, force: true }))
  const repo = makeGitRepo(base)
  // 主仓先建任务并落会话指针（executeCreateTask 内部 setActiveTask）。
  const mainKey = 'dsh_main_rt'
  const [createErr, created] = await executeCreateTask(repo, mainKey, { title: 'Main Runtime Task', package: 'repo' })
  assert.equal(createErr, null)
  assert.ok(created)
  // linked worktree 从当前 HEAD 切新分支（任务与指针都未提交，不会带过去）。
  const wt = addWorktree(repo, 'wt-rt', 'feature/rt')
  const mainPointer = join(repo, WORKLOOM_REL, '.runtime', 'sessions', `${mainKey}.json`)
  const wtPointer = join(wt, WORKLOOM_REL, '.runtime', 'sessions', `${mainKey}.json`)
  assert.equal(existsSync(mainPointer), true)
  assert.equal(existsSync(wtPointer), false)
  // 反向：worktree 侧落指针，主仓侧不可见。
  const wtKey = 'dsh_wt_rt'
  setActiveTask(wt, wtKey, created.taskRelPath)
  const wtPointerFile = join(wt, WORKLOOM_REL, '.runtime', 'sessions', `${wtKey}.json`)
  const mainPointerFile = join(repo, WORKLOOM_REL, '.runtime', 'sessions', `${wtKey}.json`)
  assert.equal(existsSync(wtPointerFile), true)
  assert.equal(existsSync(mainPointerFile), false)
})

/**
 * 场景 5：task 数据随分支隔离，测试固化为显式语义（AC5）。
 * .workloom/tasks/ 被 git 跟踪：主分支提交任务后，从任务提交之前的提交切出的
 * 新分支 worktree 不含该任务——listTasks 只反映当前分支内容。
 */
test('task 数据随分支隔离（worktree 不含其他分支的任务）', gitSkip, async (t) => {
  const base = makeBase()
  t.after(() => rmSync(base, { recursive: true, force: true }))
  const repo = makeGitRepo(base)
  const initHead = runGit(repo, ['rev-parse', 'HEAD'])
  // 主分支建任务并提交（.workloom/tasks 随分支前进）。
  await executeCreateTask(repo, 'dsh_branch_iso', { title: 'Branch Iso Task', package: 'repo' })
  runGit(repo, ['add', '--', WORKLOOM_REL])
  gitCommit(repo, 'feat(task): branch isolation task')
  // 从任务提交之前的 HEAD 切新分支 worktree：该分支内容不含本任务。
  const wt = addWorktree(repo, 'wt-iso', 'feature/iso', initHead)
  const [mainErr, mainList] = listTasks(repo)
  assert.equal(mainErr, null)
  assert.ok(mainList.some((task) => task.title === 'Branch Iso Task'))
  const [wtErr, wtList] = listTasks(wt)
  assert.equal(wtErr, null)
  assert.equal(wtList.some((task) => task.title === 'Branch Iso Task'), false)
})
