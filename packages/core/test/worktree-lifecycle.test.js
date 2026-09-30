/**
 * worktree 生命周期集成测试（先红后绿，design §8 映射表 ①-⑨ + 补充组）：
 * 以真实 git 临时仓在 core 公开导出接缝上验证 start 创建任务 worktree、
 * archive 清理四模式、submodule gitlink 联动与各项 fail-loud 纪律。
 *
 * 红绿约定（S1 R2/R3）：
 * - 新导出（design §9：worktree 生命周期 4 个 + git 新原语 12 个）经命名空间
 *   导入取用：R3 落盘前，导出面用例红因 = 导出缺失、其余用例红因 = 行为未实现；
 * - 行为断言一律以 git 事实（worktree list --porcelain / show-ref / rev-parse 对）
 *   为独立真值源，不复用被测实现自身的输出。
 *
 * fixture 要点（research §A 一手事实）：身份逐命令 `-c` 注入 + 进程级 GIT_* env
 * （真合并需要 committer identity，§A7.5）；submodule fixture 带
 * `-c protocol.file.allow=always`（§A5）；`.workloom/.gitignore` 随首次提交入库
 * 才生效（§A5）；git 不可用时全部用例 skip。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { execFileSync, spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import * as workloom from '../dist/index.js'

const {
  computePrdHash,
  createTask,
  executeArchiveTask,
  executeCheckTask,
  executeCreateTask,
  executeStartTask,
  initWorkloom,
  loadConfig,
  readTask,
  recordAlignmentCredential,
} = workloom

/** 提交用固定身份（-c 逐命令注入，不依赖全局 gitconfig）。 */
const GIT_USER = 'workloom-test'
const GIT_EMAIL = 'workloom-test@example.com'

/** 逐命令身份前缀（须置于子命令之前）。 */
const ID_ARGS = ['-c', `user.name=${GIT_USER}`, '-c', `user.email=${GIT_EMAIL}`]

// 真合并（非 ff / 冲突场景）需要 committer identity：进程级注入，git.js 的
// execFile 子进程继承本进程环境（§A7.5；node --test 每测试文件独立进程）。
process.env.GIT_AUTHOR_NAME = GIT_USER
process.env.GIT_AUTHOR_EMAIL = GIT_EMAIL
process.env.GIT_COMMITTER_NAME = GIT_USER
process.env.GIT_COMMITTER_EMAIL = GIT_EMAIL

/** git 可用性探测：git --version 失败则全部用例 skip（兜底无 git 的 CI 镜像）。 */
let gitAvailable = true
try {
  execFileSync('git', ['--version'], { stdio: 'pipe' })
} catch {
  gitAvailable = false
}

/** node:test 选项：git 不可用时跳过用例。 */
const gitSkip = gitAvailable ? {} : { skip: 'git unavailable: git --version failed' }

/** git 子进程环境：LC_ALL=C 保证 git 文案为英文（断言按英文原文，§A0）。 */
const GIT_ENV = { ...process.env, LC_ALL: 'C', LANG: 'C' }

/**
 * 执行 git 命令并返回 stdout（trim；失败抛错）：身份与可选 -c 前缀逐命令注入。
 * @param {string} cwd 执行目录
 * @param {string[]} args git 参数（子命令起）
 * @param {string[]} [extraC] 额外 `-c k=v` 前缀（如 protocol.file.allow）
 * @returns {string}
 */
function runGit(cwd, args, extraC = []) {
  return execFileSync('git', [...extraC, ...ID_ARGS, ...args], {
    cwd,
    encoding: 'utf8',
    stdio: 'pipe',
    env: GIT_ENV,
  }).trim()
}

/**
 * 执行 git 命令并返回结果（不抛错；merge 冲突等预期失败场景用）。
 * @param {string} cwd 执行目录
 * @param {string[]} args git 参数（子命令起）
 * @param {string[]} [extraC] 额外 `-c k=v` 前缀
 * @returns {{status: number, stdout: string, stderr: string}}
 */
function runGitTry(cwd, args, extraC = []) {
  const r = spawnSync('git', [...extraC, ...ID_ARGS, ...args], {
    cwd,
    encoding: 'utf8',
    env: GIT_ENV,
  })
  return {
    status: r.status ?? -1,
    stdout: (r.stdout ?? '').trim(),
    stderr: (r.stderr ?? '').trim(),
  }
}

/**
 * 只读 git 探针（无身份前缀，失败不抛错）。
 * @param {string} cwd 执行目录
 * @param {string[]} args git 参数
 * @returns {{status: number, stdout: string, stderr: string}}
 */
function gitProbe(cwd, args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: GIT_ENV })
  return {
    status: r.status ?? -1,
    stdout: (r.stdout ?? '').trim(),
    stderr: (r.stderr ?? '').trim(),
  }
}

/**
 * 分支是否存在（refs/heads/<branch>）。
 * @param {string} cwd 仓根
 * @param {string} branch 分支名
 * @returns {boolean}
 */
function branchExists(cwd, branch) {
  return gitProbe(cwd, ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`]).status === 0
}

/**
 * MERGE_HEAD 是否存在（abort 唯一可靠判据，§A7.2）。
 * @param {string} cwd 仓根
 * @returns {boolean}
 */
function hasMergeHead(cwd) {
  return gitProbe(cwd, ['rev-parse', '-q', '--verify', 'MERGE_HEAD']).status === 0
}

/**
 * 解析 `worktree list --porcelain` 的 worktree 绝对路径集合（git 事实真值源）。
 * @param {string} cwd 仓根（主检出或 linked 均可）
 * @returns {string[]}
 */
function listWorktreePaths(cwd) {
  const out = gitProbe(cwd, ['worktree', 'list', '--porcelain']).stdout
  return out
    .split('\n')
    .filter((line) => line.startsWith('worktree '))
    .map((line) => line.slice('worktree '.length))
}

/**
 * 路径是否为已注册 worktree。
 * @param {string} cwd 仓根
 * @param {string} absPath 绝对路径
 * @returns {boolean}
 */
function isRegisteredWorktree(cwd, absPath) {
  return listWorktreePaths(cwd).includes(absPath)
}

/** 创建本测试独立临时基目录（整树清理）。 */
function makeBase() {
  return mkdtempSync(join(tmpdir(), 'workloom-wtl-'))
}

/**
 * 建根仓项目：initWorkloom 骨架（种子根包）→ 可选自定义 config.json →
 * git init -b main → 首次提交（.workloom + c.txt；.gitignore 入库才生效 §A5）。
 * @param {string} base 基目录
 * @param {string} name 项目目录名
 * @param {Record<string, unknown> | null} config 覆盖 .workloom/config.json 的完整文档
 * @returns {string} 项目根绝对路径
 */
function makeGitProject(base, name = 'project', config = null) {
  const root = join(base, name)
  mkdirSync(root, { recursive: true })
  const [initErr] = initWorkloom(root, { developer: 'alice' })
  assert.equal(initErr, null)
  if (config !== null) {
    writeFileSync(join(root, '.workloom', 'config.json'), JSON.stringify(config, null, 2))
  }
  runGit(root, ['init', '-b', 'main'])
  writeFileSync(join(root, 'c.txt'), 'line1\nline2\n')
  runGit(root, ['add', '--', '.workloom', 'c.txt'])
  runGit(root, ['commit', '-m', 'chore: init'])
  return root
}

/**
 * 建非 git 项目（initWorkloom 骨架，无 .git）：② 非 git 拒绝与 disabled 回归用。
 * @param {string} base 基目录
 * @returns {string} 项目根绝对路径
 */
function makePlainProject(base) {
  const root = join(base, 'project')
  mkdirSync(root, { recursive: true })
  const [initErr] = initWorkloom(root, { developer: 'alice' })
  assert.equal(initErr, null)
  return root
}

/** 满足 start 门禁：填 prd（含 H1）四小节 + 收敛 marker + 两个 jsonl 各一条有效记录。 */
function satisfyStartGate(root, taskRelPath) {
  const taskDir = join(root, '.workloom', taskRelPath)
  writeFileSync(
    join(taskDir, 'prd.md'),
    '# Filled\n\n## Goal\n\nDo the thing.\n\n## Requirements\n\n- req\n\n## Acceptance Criteria\n\n- ac\n\n## Notes\n\n- note\n\n<!-- workloom:open-nodes=none -->\n',
  )
  writeFileSync(join(taskDir, 'implement.jsonl'), '{"file": "AGENTS.md", "reason": "spec"}\n')
  writeFileSync(join(taskDir, 'check.jsonl'), '{"file": "AGENTS.md", "reason": "spec"}\n')
}

/** 记录 alignment 凭据（hash 取当前 prd.md；模拟 confirm 后状态）。 */
function alignTask(root, taskRelPath) {
  const prd = readFileSync(join(root, '.workloom', taskRelPath, 'prd.md'), 'utf8')
  const [err] = recordAlignmentCredential(root, taskRelPath, {
    summary: 'frontier empty, all decisions settled',
    prdHash: computePrdHash(prd),
  })
  assert.equal(err, null)
}

/**
 * create + 满足 start 门禁（含 alignment 凭据）：返回任务相对路径与任务目录名
 * （`<task-id>` 占位符值 = basename(taskRelPath)）。
 * @param {string} root 项目根
 * @param {string} contextKey 会话标识
 * @param {string} title 任务标题
 * @param {string} [pkg] package 名（init 种子根包缺省 repo）
 * @returns {Promise<{taskRelPath: string, dirName: string}>}
 */
async function createGated(root, contextKey, title, pkg = 'repo') {
  const [createErr, created] = await executeCreateTask(root, contextKey, {
    title,
    package: pkg,
  })
  assert.equal(createErr, null, createErr?.message)
  assert.ok(created)
  satisfyStartGate(root, created.taskRelPath)
  alignTask(root, created.taskRelPath)
  return { taskRelPath: created.taskRelPath, dirName: created.taskRelPath.split('/').pop() }
}

/**
 * 读 task.json 原文。
 * @param {string} root 项目根
 * @param {string} taskRelPath 任务相对路径
 * @returns {Record<string, unknown>}
 */
function readTaskJson(root, taskRelPath) {
  return JSON.parse(
    readFileSync(join(root, '.workloom', taskRelPath, 'task.json'), 'utf8'),
  )
}

// ---------- 0. 导出面（design §9；R3 前红因 = 导出缺失） ----------

test('design §9 导出面：worktree 生命周期 4 个 + git 新原语 12 个', () => {
  const expected = [
    'createTaskWorktree',
    'cleanupTaskWorktree',
    'resolveTaskRepo',
    'renderBranchName',
    'gitRevParse',
    'gitIsAncestor',
    'gitHasMergeHead',
    'gitMerge',
    'gitMergeAbort',
    'gitWorktreeAdd',
    'gitWorktreeRemove',
    'gitWorktreeList',
    'gitWorktreePrune',
    'gitBranchDelete',
    'gitBranchExists',
    'gitCheckRefFormat',
  ]
  const missing = expected.filter((name) => typeof workloom[name] !== 'function')
  assert.deepEqual(missing, [], `missing exports: ${missing.join(', ')}`)
})

// ---------- ① start 成功 ----------

test('① start 成功：worktree 目录 + 模板分支 + task.json 三字段回填', gitSkip, async (t) => {
  const base = makeBase()
  t.after(() => rmSync(base, { recursive: true, force: true }))
  const root = makeGitProject(base)
  const contextKey = 'dsh_wtl_ok'
  const { taskRelPath, dirName } = await createGated(root, contextKey, 'Lifecycle Ok')

  const [startErr, started] = await executeStartTask(root, contextKey, {})
  assert.equal(startErr, null, startErr?.message)
  assert.equal(started.status, 'in_progress')

  const branch = `workloom/${dirName}`
  const relWorktreePath = `.workloom/worktree/${dirName}`
  assert.equal(started.branch, branch)
  assert.equal(started.base_branch, 'main')
  assert.equal(started.worktree_path, relWorktreePath)

  // worktree 目录真实存在且被 git 注册（独立真值源）。
  const wtAbs = join(root, '.workloom', 'worktree', dirName)
  assert.equal(existsSync(join(wtAbs, '.git')), true, 'worktree .git pointer missing')
  assert.equal(isRegisteredWorktree(root, wtAbs), true, 'worktree not registered')
  assert.equal(branchExists(root, branch), true, 'task branch missing')

  // task.json 三字段与 start 返回一致（项目根相对路径格式，S1-Q1）。
  const saved = readTaskJson(root, taskRelPath)
  assert.equal(saved.branch, branch)
  assert.equal(saved.base_branch, 'main')
  assert.equal(saved.worktree_path, relWorktreePath)
})

// ---------- ② 非 git 拒绝 / disabled 回归 ----------

test('② 非 git 仓库：enabled 拒绝 start（零部分状态）；disabled 回归成功', async (t) => {
  const base = makeBase()
  t.after(() => rmSync(base, { recursive: true, force: true }))
  const root = makePlainProject(base)
  const contextKey = 'dsh_wtl_nongit'
  const { taskRelPath } = await createGated(root, contextKey, 'Non Git Task')

  const [err1] = await executeStartTask(root, contextKey, {})
  assert.ok(err1, 'start must reject non-git project when worktree enabled')
  assert.match(err1.message, /workloom worktree/)
  // 零部分状态：未落 in_progress。
  assert.equal(readTaskJson(root, taskRelPath).status, 'planning')

  // disabled 回归：显式关闭后同 fixture start 成功（零行为变化）。
  writeFileSync(
    join(root, '.workloom', 'config.json'),
    JSON.stringify(
      { packages: { repo: { path: '.' } }, worktree: { enabled: false } },
      null,
      2,
    ),
  )
  const [err2, started] = await executeStartTask(root, contextKey, {})
  assert.equal(err2, null, err2?.message)
  assert.equal(started.status, 'in_progress')
  const saved = readTaskJson(root, taskRelPath)
  assert.equal(saved.worktree_path, '')
  assert.equal(saved.branch, '')
})

// ---------- ③ detached / unborn 拒绝 ----------

test('③ detached HEAD 与无提交仓拒绝 start', gitSkip, async (t) => {
  const base = makeBase()
  t.after(() => rmSync(base, { recursive: true, force: true }))

  // detached：checkout --detach 后 start 拒绝（§A8：不能只用 branch --show-current）。
  const root = makeGitProject(base)
  const key1 = 'dsh_wtl_detached'
  const first = await createGated(root, key1, 'Detached Task')
  runGit(root, ['checkout', '--detach'])
  const [detErr] = await executeStartTask(root, key1, {})
  assert.ok(detErr, 'start must reject detached HEAD')
  assert.match(detErr.message, /detached/i)
  assert.equal(readTaskJson(root, first.taskRelPath).status, 'planning')

  // unborn：git init 但零 commit → start 拒绝（rev-parse --verify HEAD exit 128，§A8）。
  const unbornRoot = makePlainProject(join(base, 'unborn'))
  runGit(unbornRoot, ['init', '-b', 'main'])
  const key2 = 'dsh_wtl_unborn'
  const second = await createGated(unbornRoot, key2, 'Unborn Task')
  const [unbornErr] = await executeStartTask(unbornRoot, key2, {})
  assert.ok(unbornErr, 'start must reject repository without commits')
  assert.match(unbornErr.message, /no commits/i)
  assert.equal(readTaskJson(unbornRoot, second.taskRelPath).status, 'planning')
})

// ---------- ④ 分支处置（复用 / 占用拒绝 / 失败回滚） ----------

test('④a 分支已存在且未被占用：start 复用（不新建分支）', gitSkip, async (t) => {
  const base = makeBase()
  t.after(() => rmSync(base, { recursive: true, force: true }))
  const root = makeGitProject(base)
  const contextKey = 'dsh_wtl_reuse'
  const { dirName } = await createGated(root, contextKey, 'Reuse Branch Task')
  const branch = `workloom/${dirName}`
  runGit(root, ['branch', branch]) // 预建同名分支（HEAD 起点）

  const [startErr, started] = await executeStartTask(root, contextKey, {})
  assert.equal(startErr, null, startErr?.message)
  assert.equal(started.branch, branch)
  const wtAbs = join(root, '.workloom', 'worktree', dirName)
  assert.equal(isRegisteredWorktree(root, wtAbs), true)
  // 复用分支（无 -b）：worktree HEAD 与主检出同起点。
  assert.equal(
    runGit(wtAbs, ['rev-parse', 'HEAD']),
    runGit(root, ['rev-parse', 'HEAD']),
  )
})

test('④b 分支被另一 worktree 占用：start 拒绝（git 文案透传）', gitSkip, async (t) => {
  const base = makeBase()
  t.after(() => rmSync(base, { recursive: true, force: true }))
  const root = makeGitProject(base)
  const contextKey = 'dsh_wtl_occupied'
  const { dirName } = await createGated(root, contextKey, 'Occupied Branch Task')
  const branch = `workloom/${dirName}`
  runGit(root, ['branch', branch])
  runGit(root, ['worktree', 'add', join(base, 'occupied-wt'), branch])

  const [startErr] = await executeStartTask(root, contextKey, {})
  assert.ok(startErr, 'start must reject branch checked out elsewhere')
  assert.match(startErr.message, /already checked out/)
  assert.equal(
    existsSync(join(root, '.workloom', 'worktree', dirName)),
    false,
    'target worktree must not be created',
  )
  assert.equal(readTaskJson(root, join('tasks', dirName)).status, 'planning')
})

test('④c add 失败回滚（占用路径 + -b）：游离分支被删、err 附回滚说明', gitSkip, async (t) => {
  const base = makeBase()
  t.after(() => rmSync(base, { recursive: true, force: true }))
  const root = makeGitProject(base)
  const contextKey = 'dsh_wtl_rollback'
  const { taskRelPath, dirName } = await createGated(root, contextKey, 'Rollback Task')
  const branch = `workloom/${dirName}`
  // 占用父路径：`.workloom/worktree` 放置普通文件 → add -b 会先建分支再失败（§A1）。
  writeFileSync(join(root, '.workloom', 'worktree'), 'not-a-directory\n')

  const [startErr] = await executeStartTask(root, contextKey, {})
  assert.ok(startErr, 'start must fail when worktree add fails')
  assert.match(startErr.message, /rollback/i)
  // 游离分支回滚删除（§A1 硬事实）。
  assert.equal(branchExists(root, branch), false, 'residual branch must be rolled back')
  assert.equal(readTaskJson(root, taskRelPath).status, 'planning')
  // 占用的文件原样保留（破坏性删除不自动化）。
  assert.equal(existsSync(join(root, '.workloom', 'worktree')), true)
})

// ---------- ⑤ archive 缺省策略（merge-keep-branch） ----------

test('⑤ archive merge-keep-branch：合并回 base + 删 worktree + 保留分支', gitSkip, async (t) => {
  const base = makeBase()
  t.after(() => rmSync(base, { recursive: true, force: true }))
  const root = makeGitProject(base)
  const contextKey = 'dsh_wtl_keep'
  const { taskRelPath, dirName } = await createGated(root, contextKey, 'Keep Branch Task')
  const branch = `workloom/${dirName}`

  const [startErr] = await executeStartTask(root, contextKey, {})
  assert.equal(startErr, null, startErr?.message)
  const wtAbs = join(root, '.workloom', 'worktree', dirName)
  assert.ok(existsSync(wtAbs), 'worktree must exist after start')

  // 任务侧提交（在任务 worktree 内推进任务分支）。
  writeFileSync(join(wtAbs, 'c.txt'), 'line1\nline2\ntask-work\n')
  runGit(wtAbs, ['add', 'c.txt'])
  runGit(wtAbs, ['commit', '-m', 'feat: task work'])

  const [checkErr] = await executeCheckTask(root, contextKey, { summary: 'ok' })
  assert.equal(checkErr, null, checkErr?.message)
  const [archErr, archived] = await executeArchiveTask(root, {
    taskPath: taskRelPath,
    autoCommit: false,
  })
  assert.equal(archErr, null, archErr?.message)
  assert.equal(archived.task.status, 'completed')

  // base 含任务提交（祖先判定与 ff 无关，S1-Q2）。
  assert.equal(
    gitProbe(root, ['merge-base', '--is-ancestor', branch, 'HEAD']).status,
    0,
    'task branch must be merged into base',
  )
  assert.match(readFileSync(join(root, 'c.txt'), 'utf8'), /task-work/)
  // worktree 目录消失、分支保留、任务移入 archive。
  assert.equal(existsSync(wtAbs), false, 'worktree must be removed')
  assert.equal(branchExists(root, branch), true, 'branch must be kept')
  assert.equal(existsSync(join(root, '.workloom', taskRelPath)), false)
  assert.equal(existsSync(join(root, '.workloom', archived.taskRelPath)), true)
})

// ---------- ⑥ 冲突路径 ----------

test('⑥ archive 冲突：abort + 冲突通知 + 不落档；手工合并后续做清理', gitSkip, async (t) => {
  const base = makeBase()
  t.after(() => rmSync(base, { recursive: true, force: true }))
  const root = makeGitProject(base)
  const contextKey = 'dsh_wtl_conflict'
  const { taskRelPath, dirName } = await createGated(root, contextKey, 'Conflict Task')
  const branch = `workloom/${dirName}`

  const [startErr] = await executeStartTask(root, contextKey, {})
  assert.equal(startErr, null, startErr?.message)
  const wtAbs = join(root, '.workloom', 'worktree', dirName)
  assert.ok(existsSync(wtAbs), 'worktree must exist after start')

  // 双侧改同一行 → 真冲突（非 ff，identity 由进程级 env 提供，§A7.5）。
  writeFileSync(join(root, 'c.txt'), 'line1\nMAIN-side\n')
  runGit(root, ['add', 'c.txt'])
  runGit(root, ['commit', '-m', 'main side'])
  writeFileSync(join(wtAbs, 'c.txt'), 'line1\nTASK-side\n')
  runGit(wtAbs, ['add', 'c.txt'])
  runGit(wtAbs, ['commit', '-m', 'task side'])

  const [checkErr] = await executeCheckTask(root, contextKey, { summary: 'ok' })
  assert.equal(checkErr, null, checkErr?.message)
  const [archErr] = await executeArchiveTask(root, { taskPath: taskRelPath, autoCommit: false })
  assert.ok(archErr, 'archive must fail on merge conflict')
  assert.match(archErr.message, /conflict/i)
  assert.match(archErr.message, /re-run archive/)

  // 现场已 abort：无 MERGE_HEAD、无冲突标记、HEAD 复原（§A7.2/A7.4）。
  assert.equal(hasMergeHead(root), false, 'MERGE_HEAD must be absent after abort')
  const mainText = readFileSync(join(root, 'c.txt'), 'utf8')
  assert.doesNotMatch(mainText, /<<<<<<</)
  assert.match(mainText, /MAIN-side/)
  // 任务未归档（不落档）+ worktree 原样保留。
  assert.equal(readTaskJson(root, taskRelPath).status, 'in_progress')
  assert.equal(existsSync(join(root, '.workloom', taskRelPath)), true)
  assert.equal(existsSync(wtAbs), true)

  // 手工合并解冲突后重跑 archive → 幂等续做清理（已 merged 跳 merge）。
  const mergeTry = runGitTry(root, ['merge', '--no-edit', branch])
  assert.equal(mergeTry.status, 1, 'manual merge must reproduce the conflict')
  writeFileSync(join(root, 'c.txt'), 'line1\nresolved\n')
  runGit(root, ['add', 'c.txt'])
  runGit(root, ['commit', '-m', 'merge: resolve manually'])

  const [archErr2, archived] = await executeArchiveTask(root, {
    taskPath: taskRelPath,
    autoCommit: false,
  })
  assert.equal(archErr2, null, archErr2?.message)
  assert.equal(archived.task.status, 'completed')
  assert.equal(existsSync(wtAbs), false, 'worktree must be removed after rerun')
  assert.match(readFileSync(join(root, 'c.txt'), 'utf8'), /resolved/)
})

// ---------- ⑦ HEAD ≠ base_branch ----------

test('⑦ archive：主检出 HEAD ≠ base_branch 拒绝清理', gitSkip, async (t) => {
  const base = makeBase()
  t.after(() => rmSync(base, { recursive: true, force: true }))
  const root = makeGitProject(base)
  const contextKey = 'dsh_wtl_head'
  const { taskRelPath, dirName } = await createGated(root, contextKey, 'Head Mismatch Task')

  const [startErr] = await executeStartTask(root, contextKey, {})
  assert.equal(startErr, null, startErr?.message)
  const wtAbs = join(root, '.workloom', 'worktree', dirName)
  assert.ok(existsSync(wtAbs), 'worktree must exist after start')

  // 主检出切走（base_branch=main，HEAD=dev）。
  runGit(root, ['checkout', '-b', 'dev'])
  const [checkErr] = await executeCheckTask(root, contextKey, { summary: 'ok' })
  assert.equal(checkErr, null, checkErr?.message)
  const [archErr] = await executeArchiveTask(root, { taskPath: taskRelPath, autoCommit: false })
  assert.ok(archErr, 'archive must reject HEAD != base_branch')
  assert.match(archErr.message, /base branch/i)
  // 不落档、不删 worktree。
  assert.equal(readTaskJson(root, taskRelPath).status, 'in_progress')
  assert.equal(existsSync(wtAbs), true)
})

// ---------- ⑧ manual / no-op ----------

test('⑧a cleanup=manual：archive 归档但不动 worktree 与分支', gitSkip, async (t) => {
  const base = makeBase()
  t.after(() => rmSync(base, { recursive: true, force: true }))
  const root = makeGitProject(base, 'project', {
    packages: { repo: { path: '.' } },
    worktree: { cleanup: 'manual' },
  })
  const contextKey = 'dsh_wtl_manual'
  const { taskRelPath, dirName } = await createGated(root, contextKey, 'Manual Cleanup Task')
  const branch = `workloom/${dirName}`

  const [startErr] = await executeStartTask(root, contextKey, {})
  assert.equal(startErr, null, startErr?.message)
  const wtAbs = join(root, '.workloom', 'worktree', dirName)
  assert.ok(existsSync(wtAbs), 'worktree must exist after start')

  const [checkErr] = await executeCheckTask(root, contextKey, { summary: 'ok' })
  assert.equal(checkErr, null, checkErr?.message)
  const [archErr, archived] = await executeArchiveTask(root, {
    taskPath: taskRelPath,
    autoCommit: false,
  })
  assert.equal(archErr, null, archErr?.message)
  assert.equal(archived.task.status, 'completed')
  // manual：worktree 与分支原样保留。
  assert.equal(existsSync(wtAbs), true, 'manual must keep the worktree')
  assert.equal(branchExists(root, branch), true, 'manual must keep the branch')
})

test('⑧b 无 worktree 任务清理 no-op（worktree_path 空）', gitSkip, async (t) => {
  const base = makeBase()
  t.after(() => rmSync(base, { recursive: true, force: true }))
  const root = makeGitProject(base, 'project', {
    packages: { repo: { path: '.' } },
    worktree: { enabled: false },
  })
  const contextKey = 'dsh_wtl_nowt'
  const { taskRelPath } = await createGated(root, contextKey, 'No Worktree Task')

  // 直接调接缝：cleanup 对 worktree_path 空任务返回 skipped:no-worktree（design 3.4 步 1）。
  const [, task] = readTask(root, taskRelPath)
  const [cleanErr, cleanRes] = await workloom.cleanupTaskWorktree(root, task, loadConfig(root))
  assert.equal(cleanErr, null, cleanErr?.message)
  assert.equal(cleanRes.skipped, 'no-worktree')

  const [startErr] = await executeStartTask(root, contextKey, {})
  assert.equal(startErr, null, startErr?.message)
  assert.equal(readTaskJson(root, taskRelPath).worktree_path, '')
  const [checkErr] = await executeCheckTask(root, contextKey, { summary: 'ok' })
  assert.equal(checkErr, null, checkErr?.message)
  const [archErr, archived] = await executeArchiveTask(root, {
    taskPath: taskRelPath,
    autoCommit: false,
  })
  assert.equal(archErr, null, archErr?.message)
  assert.equal(archived.task.status, 'completed')
  assert.equal(existsSync(join(root, '.workloom', 'worktree')), false)
})

// ---------- ⑨ submodule gitlink 联动 ----------

/**
 * 建 submodule 项目：upstream 源仓 → super 根仓（骨架 + 自定义 packages）→
 * `submodule add`（file 协议需显式放开，§A5）→ 提交。
 * @param {string} base 基目录
 * @returns {string} super 项目根绝对路径
 */
function makeSubmoduleProject(base) {
  const upstream = join(base, 'upstream')
  mkdirSync(upstream, { recursive: true })
  runGit(upstream, ['init', '-b', 'main'])
  writeFileSync(join(upstream, 's.txt'), 'base\n')
  runGit(upstream, ['add', 's.txt'])
  runGit(upstream, ['commit', '-m', 'sub init'])

  const root = makeGitProject(base, 'project', {
    packages: { repo: { path: '.' }, sub: { path: 'libs/mymod', git: true } },
  })
  runGit(root, ['submodule', 'add', upstream, 'libs/mymod'], [
    '-c',
    'protocol.file.allow=always',
  ])
  runGit(root, ['commit', '-m', 'chore: add submodule'])
  return root
}

/**
 * 建 nested repo 项目（git:true 但未注册 .gitmodules → 对照组，天然无 gitlink）。
 * @param {string} base 基目录
 * @returns {string} 项目根绝对路径
 */
function makeNestedProject(base) {
  const root = makeGitProject(base, 'project', {
    packages: { repo: { path: '.' }, nested: { path: 'nested', git: true } },
  })
  const nested = join(root, 'nested')
  mkdirSync(nested, { recursive: true })
  runGit(nested, ['init', '-b', 'main'])
  writeFileSync(join(nested, 'n.txt'), 'nested base\n')
  runGit(nested, ['add', 'n.txt'])
  runGit(nested, ['commit', '-m', 'nested init'])
  return root
}

test('⑨a submodule：start 在 submodule 建 worktree；archive 合并后 gitlink 窄提交', gitSkip, async (t) => {
  const base = makeBase()
  t.after(() => rmSync(base, { recursive: true, force: true }))
  const root = makeSubmoduleProject(base)
  const subAbs = join(root, 'libs', 'mymod')
  const contextKey = 'dsh_wtl_sub'
  const { taskRelPath, dirName } = await createGated(root, contextKey, 'Submodule Task', 'sub')
  const branch = `workloom/${dirName}`

  const [startErr] = await executeStartTask(root, contextKey, {})
  assert.equal(startErr, null, startErr?.message)
  const wtAbs = join(root, '.workloom', 'worktree', dirName, 'sub')
  assert.ok(existsSync(wtAbs), 'submodule worktree must exist after start')
  assert.equal(isRegisteredWorktree(subAbs, wtAbs), true, 'registered in submodule repo')
  // 元数据落 `.git/modules/<path>/worktrees/`（§A5）。
  const metaDir = join(root, '.git', 'modules', 'libs', 'mymod', 'worktrees')
  assert.ok(existsSync(metaDir), 'submodule worktree metadata dir missing')
  assert.ok(readdirSync(metaDir).length > 0, 'submodule worktree metadata empty')
  // base = submodule 主检出当前分支。
  assert.equal(readTaskJson(root, taskRelPath).base_branch, 'main')

  // 任务侧提交（在 submodule 的 linked worktree 内推进任务分支）。
  writeFileSync(join(wtAbs, 's.txt'), 'base\ntask-work\n')
  runGit(wtAbs, ['add', 's.txt'])
  runGit(wtAbs, ['commit', '-m', 'feat: sub task work'])

  const [checkErr] = await executeCheckTask(root, contextKey, { summary: 'ok' })
  assert.equal(checkErr, null, checkErr?.message)
  const [archErr, archived] = await executeArchiveTask(root, {
    taskPath: taskRelPath,
    autoCommit: false,
  })
  assert.equal(archErr, null, archErr?.message)
  assert.equal(archived.task.status, 'completed')

  // 合并发生在 submodule 主检出（§A6 硬约束）。
  assert.equal(
    gitProbe(subAbs, ['merge-base', '--is-ancestor', branch, 'HEAD']).status,
    0,
    'task branch must be merged into submodule main checkout',
  )
  // 根仓 gitlink 提交：只含 submodule 路径（窄暂存纪律）。
  const headFiles = runGit(root, ['diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD'])
    .split('\n')
    .filter(Boolean)
  assert.deepEqual(headFiles, ['libs/mymod'])
  // 权威探针对：根仓记录的 gitlink sha == submodule 主检出 HEAD（§A6，禁用 rev-parse <path>）。
  assert.equal(runGit(root, ['rev-parse', 'HEAD:libs/mymod']), runGit(subAbs, ['rev-parse', 'HEAD']))
  // worktree 删除、submodule 内任务分支保留。
  assert.equal(existsSync(wtAbs), false, 'worktree must be removed')
  assert.equal(branchExists(subAbs, branch), true, 'submodule task branch must be kept')
})

test('⑨b 中段失败容忍：清理成功 + 归档移动失败 → 重跑幂等（无 diff 跳提交）', gitSkip, async (t) => {
  const base = makeBase()
  t.after(() => rmSync(base, { recursive: true, force: true }))
  const root = makeSubmoduleProject(base)
  const subAbs = join(root, 'libs', 'mymod')
  const contextKey = 'dsh_wtl_mid'
  const { taskRelPath, dirName } = await createGated(root, contextKey, 'Mid State Task', 'sub')

  const [startErr] = await executeStartTask(root, contextKey, {})
  assert.equal(startErr, null, startErr?.message)
  const wtAbs = join(root, '.workloom', 'worktree', dirName, 'sub')
  assert.ok(existsSync(wtAbs), 'worktree must exist after start')
  writeFileSync(join(wtAbs, 's.txt'), 'base\ntask-work\n')
  runGit(wtAbs, ['add', 's.txt'])
  runGit(wtAbs, ['commit', '-m', 'feat: sub task work'])
  const [checkErr] = await executeCheckTask(root, contextKey, { summary: 'ok' })
  assert.equal(checkErr, null, checkErr?.message)

  // 中段失败注入：archive 目标父路径占位为文件 → cleanup 成功后 mkdir/rename 失败
  // （design 3.5 的「worktree 已删、任务未归档」中间态，renameSync 不可逆点之前）。
  const gitlinkCommitsBefore = runGit(root, ['log', '--format=%h', '--', 'libs/mymod'])
    .split('\n')
    .filter(Boolean).length
  writeFileSync(join(root, '.workloom', 'tasks', 'archive'), 'blocker\n')
  const [failErr] = await executeArchiveTask(root, { taskPath: taskRelPath, autoCommit: false })
  assert.ok(failErr, 'archive must fail at the rename stage')
  // 中间态：worktree 已删、gitlink 已提交、任务原位且未 completed。
  assert.equal(existsSync(wtAbs), false, 'worktree removed before rename failure')
  const gitlinkCommitsAfterFirst = runGit(root, ['log', '--format=%h', '--', 'libs/mymod'])
    .split('\n')
    .filter(Boolean).length
  assert.equal(gitlinkCommitsAfterFirst, gitlinkCommitsBefore + 1, 'gitlink committed once')
  assert.equal(existsSync(join(root, '.workloom', taskRelPath)), true, 'task not moved')
  assert.equal(readTaskJson(root, taskRelPath).status, 'in_progress')

  // 移除阻塞 → 重跑 archive 幂等续做（已 merged 跳 merge、无 diff 跳提交）。
  rmSync(join(root, '.workloom', 'tasks', 'archive'))
  const [archErr, archived] = await executeArchiveTask(root, {
    taskPath: taskRelPath,
    autoCommit: false,
  })
  assert.equal(archErr, null, archErr?.message)
  assert.equal(archived.task.status, 'completed')
  const gitlinkCommitsAfterRerun = runGit(root, ['log', '--format=%h', '--', 'libs/mymod'])
    .split('\n')
    .filter(Boolean).length
  assert.equal(
    gitlinkCommitsAfterRerun,
    gitlinkCommitsAfterFirst,
    'rerun must skip the gitlink commit (no diff)',
  )
  assert.equal(runGit(root, ['rev-parse', 'HEAD:libs/mymod']), runGit(subAbs, ['rev-parse', 'HEAD']))
})

test('⑨c nested repo 对照：未注册 submodule 无 gitlink 联动', gitSkip, async (t) => {
  const base = makeBase()
  t.after(() => rmSync(base, { recursive: true, force: true }))
  const root = makeNestedProject(base)
  const contextKey = 'dsh_wtl_nested'
  const { taskRelPath, dirName } = await createGated(root, contextKey, 'Nested Task', 'nested')

  const [startErr] = await executeStartTask(root, contextKey, {})
  assert.equal(startErr, null, startErr?.message)
  const wtAbs = join(root, '.workloom', 'worktree', dirName, 'nested')
  assert.ok(existsSync(wtAbs), 'nested worktree must exist after start')

  writeFileSync(join(wtAbs, 'n.txt'), 'nested base\ntask-work\n')
  runGit(wtAbs, ['add', 'n.txt'])
  runGit(wtAbs, ['commit', '-m', 'feat: nested task work'])
  const [checkErr] = await executeCheckTask(root, contextKey, { summary: 'ok' })
  assert.equal(checkErr, null, checkErr?.message)
  const [archErr, archived] = await executeArchiveTask(root, {
    taskPath: taskRelPath,
    autoCommit: false,
  })
  assert.equal(archErr, null, archErr?.message)
  assert.equal(archived.task.status, 'completed')
  assert.equal(existsSync(wtAbs), false, 'worktree must be removed')

  // 对照断言：根仓零 gitlink 提交（nested 未注册，天然跳过 §A6）。
  assert.equal(
    runGit(root, ['log', '--format=%h', '--', 'nested']).split('\n').filter(Boolean).length,
    0,
    'no gitlink commit for unregistered nested repo',
  )
  assert.match(gitProbe(root, ['status', '--porcelain']).stdout, /\?\? nested\//)
})

// ---------- 补充组（脏 / 残留目录 / 非法 ref） ----------

test('补a 脏 worktree archive 无条件拒绝（force 不豁免）', gitSkip, async (t) => {
  const base = makeBase()
  t.after(() => rmSync(base, { recursive: true, force: true }))
  const root = makeGitProject(base)
  const contextKey = 'dsh_wtl_dirty'
  const { taskRelPath, dirName } = await createGated(root, contextKey, 'Dirty Task')

  const [startErr] = await executeStartTask(root, contextKey, {})
  assert.equal(startErr, null, startErr?.message)
  const wtAbs = join(root, '.workloom', 'worktree', dirName)
  assert.ok(existsSync(wtAbs), 'worktree must exist after start')
  writeFileSync(join(wtAbs, 'scratch.txt'), 'uncommitted\n')

  const [checkErr] = await executeCheckTask(root, contextKey, { summary: 'ok' })
  assert.equal(checkErr, null, checkErr?.message)
  const [archErr] = await archiveExpectingDirty(root, taskRelPath, undefined)
  assert.ok(archErr, 'archive must reject a dirty worktree')
  assert.match(archErr.message, /commit or discard/)
  // force 不豁免（结构上无旁路）。
  const [forceErr] = await archiveExpectingDirty(root, taskRelPath, {
    force: true,
    reason: 'attempt bypass',
  })
  assert.ok(forceErr, 'force must not bypass the dirty-worktree rule')
  assert.match(forceErr.message, /commit or discard/)
  // 现场保留：worktree 原样、任务未归档。
  assert.equal(existsSync(wtAbs), true)
  assert.equal(readTaskJson(root, taskRelPath).status, 'in_progress')
  assert.equal(hasMergeHead(root), false, 'no merge must have been attempted')
})

/** archive 调用（补a 两段式；extra 为 force 等可选参数）。 */
async function archiveExpectingDirty(root, taskRelPath, extra) {
  return executeArchiveTask(root, {
    taskPath: taskRelPath,
    autoCommit: false,
    ...(extra ?? {}),
  })
}

test('补b 残留非法目录（含空目录）start 拒绝，不自动删除', gitSkip, async (t) => {
  const base = makeBase()
  t.after(() => rmSync(base, { recursive: true, force: true }))
  const root = makeGitProject(base)
  const contextKey = 'dsh_wtl_residual'
  const { taskRelPath, dirName } = await createGated(root, contextKey, 'Residual Task')
  // 空目录残留：add 会静默复用（§A1），必须前置探测拒绝。
  const wtTarget = join(root, '.workloom', 'worktree', dirName)
  mkdirSync(wtTarget, { recursive: true })

  const [startErr] = await executeStartTask(root, contextKey, {})
  assert.ok(startErr, 'start must reject a residual directory')
  assert.match(startErr.message, /inspect and remove it manually/)
  // 不自动删除残留目录（破坏性操作不自动化）。
  assert.equal(existsSync(wtTarget), true)
  assert.equal(readTaskJson(root, taskRelPath).status, 'planning')
})

test('补c 渲染后非法 ref 拒绝 start（模板 bad..<task-id>）', gitSkip, async (t) => {
  const base = makeBase()
  t.after(() => rmSync(base, { recursive: true, force: true }))
  const root = makeGitProject(base, 'project', {
    packages: { repo: { path: '.' } },
    worktree: { branch_template: 'bad..<task-id>' },
  })
  const contextKey = 'dsh_wtl_badref'
  const { taskRelPath } = await createGated(root, contextKey, 'Bad Ref Task')

  const [startErr] = await executeStartTask(root, contextKey, {})
  assert.ok(startErr, 'start must reject a branch name failing check-ref-format')
  assert.match(startErr.message, /bad\.\./, 'error must carry the rendered result')
  assert.equal(readTaskJson(root, taskRelPath).status, 'planning')
})

// ---------- ⑩ 存量语义（PRD AC9 / design §8 常规） ----------

test('⑩ 存量 package=null 任务 start fail loud（提示手工编辑 task.json）', async (t) => {
  const base = makeBase()
  t.after(() => rmSync(base, { recursive: true, force: true }))
  const root = makePlainProject(base) // 非 git 也可：package 门禁先于仓解析
  const contextKey = 'dsh_wtl_nopkg'
  // 直调 createTask（存量语义：不经 execute 层 package 必填）→ package=null。
  const [createErr, created] = await createTask(root, {
    title: 'Legacy Null Package',
    contextKey,
  })
  assert.equal(createErr, null, createErr?.message)
  assert.ok(created)
  satisfyStartGate(root, created.taskRelPath)
  alignTask(root, created.taskRelPath)

  const [startErr] = await executeStartTask(root, contextKey, {})
  assert.ok(startErr, 'start must fail loud for package=null tasks')
  assert.match(startErr.message, /task has no package/)
  assert.match(startErr.message, /task\.json/)
  assert.equal(readTaskJson(root, created.taskRelPath).status, 'planning')
})
