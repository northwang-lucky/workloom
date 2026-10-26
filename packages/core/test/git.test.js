/**
 * git 模块单测：gitAddCommit 收窄暂存（空 paths 拒绝、未入库路径剔除）、
 * 同步工作区/分支查询与 stderr 静默，以及 rebase / ff-only 合并原语
 * （真 git 夹具，行为断言以 git 事实为独立真值源）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  gitAddCommit,
  gitCurrentBranchSync,
  gitHasRebaseHead,
  gitMergeFfOnly,
  gitRebase,
  gitRebaseAbort,
  gitStatusSync,
} from '../dist/domain/git.js'

/** git 提交所需的最小身份环境变量（不依赖全局 git config）。 */
const GIT_IDENTITY_ENV = {
  GIT_AUTHOR_NAME: 'workloom test',
  GIT_AUTHOR_EMAIL: 'test@workloom.local',
  GIT_COMMITTER_NAME: 'workloom test',
  GIT_COMMITTER_EMAIL: 'test@workloom.local',
}

function makeGitRepo() {
  const root = mkdtempSync(join(tmpdir(), 'workloom-git-'))
  execFileSync('git', ['init', '-q'], { cwd: root })
  return root
}

function gitCommit(root, message) {
  execFileSync('git', ['commit', '-q', '-m', message], {
    cwd: root,
    env: { ...process.env, ...GIT_IDENTITY_ENV },
  })
}

test('gitAddCommit 空 paths 直接报错（fail loud，防误提交空集）', async () => {
  const root = makeGitRepo()
  try {
    const [err] = await gitAddCommit(root, 'chore: nothing', [])
    assert.match(err.message, /at least one path/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('gitAddCommit 剔除从未入库的已删除路径：不阻塞其余路径提交', async () => {
  const root = makeGitRepo()
  try {
    writeFileSync(join(root, 'tracked.txt'), 'a')
    execFileSync('git', ['add', '--', 'tracked.txt'], { cwd: root })
    gitCommit(root, 'init')
    // 旧任务路径从未被提交即被归档删除（磁盘与索引都无）；
    // 归档新路径为磁盘新增，须正常入提交。
    mkdirSync(join(root, 'archive', 'new-task'), { recursive: true })
    writeFileSync(join(root, 'archive', 'new-task', 'task.json'), '{}\n')
    const [err] = await gitAddCommit(root, 'chore(task): archive new-task', [
      'tasks/never-committed',
      'archive/new-task',
    ])
    assert.equal(err, null)
    const show = execFileSync('git', ['show', '--name-only', '--format=%s', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
    })
    assert.match(show, /chore\(task\): archive new-task/)
    assert.match(show, /archive\/new-task\/task\.json/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('gitCurrentBranchSync 返回当前分支名', () => {
  const root = mkdtempSync(join(tmpdir(), 'workloom-git-'))
  try {
    execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: root })
    writeFileSync(join(root, 'a.txt'), 'hello')
    execFileSync('git', ['add', '--', 'a.txt'], { cwd: root })
    gitCommit(root, 'init')
    const [err, branch] = gitCurrentBranchSync(root)
    assert.equal(err, null)
    assert.equal(branch, 'main')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('gitStatusSync 报告未提交的脏文件', () => {
  const root = makeGitRepo()
  try {
    writeFileSync(join(root, 'a.txt'), 'hello')
    const [err, status] = gitStatusSync(root)
    assert.equal(err, null)
    assert.match(status, /a\.txt/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('非 git 目录两个同步函数都返回 err', () => {
  const root = mkdtempSync(join(tmpdir(), 'workloom-git-'))
  try {
    const [statusErr, status] = gitStatusSync(root)
    assert.ok(statusErr)
    assert.equal(status, null)
    const [branchErr, branch] = gitCurrentBranchSync(root)
    assert.ok(branchErr)
    assert.equal(branch, null)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('非 git 目录：同步查询静默失败且无 stderr 泄漏', () => {
  const root = mkdtempSync(join(tmpdir(), 'workloom-git-'))
  // 捕获宿主 stderr：execFileSync 默认 stdio 在命令失败时会直接把子进程
  // stderr 打到宿主 stderr（git 的「不是 git 仓库」报错会泄漏出来）。
  const chunks = []
  const originalWrite = process.stderr.write.bind(process.stderr)
  process.stderr.write = (chunk, ..._args) => {
    chunks.push(String(chunk))
    return true
  }
  try {
    const [statusErr, status] = gitStatusSync(root)
    assert.ok(statusErr)
    assert.equal(status, null)
    const [branchErr, branch] = gitCurrentBranchSync(root)
    assert.ok(branchErr)
    assert.equal(branch, null)
    assert.deepEqual(chunks, [])
  } finally {
    process.stderr.write = originalWrite
    rmSync(root, { recursive: true, force: true })
  }
})

test('干净仓库 gitStatusSync 返回空串', () => {
  const root = mkdtempSync(join(tmpdir(), 'workloom-git-clean-'))
  try {
    execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: root })
    const [err, status] = gitStatusSync(root)
    assert.equal(err, null)
    assert.equal(status, '')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('detached HEAD 时分支查询返回空串', () => {
  const root = mkdtempSync(join(tmpdir(), 'workloom-git-detached-'))
  try {
    execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: root })
    writeFileSync(join(root, 'a.txt'), 'a')
    execFileSync('git', ['add', '--', 'a.txt'], { cwd: root })
    execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd: root, env: GIT_IDENTITY_ENV })
    // 切到 detached HEAD（直接 checkout 提交哈希）
    const hash = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
    execFileSync('git', ['checkout', '-q', hash], { cwd: root })
    const [err, branch] = gitCurrentBranchSync(root)
    assert.equal(err, null)
    assert.equal(branch, '')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

// ---------- rebase / ff-only 原语（真 git 夹具） ----------

/**
 * 建 rebase 夹具：main 仓 + 任务 worktree（task 分支检出于 worktree，镜像
 * workloom 归档的真实布局：任务分支检出在任务 worktree，base 在主检出）。
 * c.txt 初始内容 line1/line2，为双侧改动留出空间。
 * @returns {{root: string, wt: string}}
 */
function makeRebaseFixture() {
  const root = mkdtempSync(join(tmpdir(), 'workloom-git-rebase-'))
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: root })
  writeFileSync(join(root, 'c.txt'), 'line1\nline2\n')
  execFileSync('git', ['add', '--', 'c.txt'], { cwd: root })
  gitCommit(root, 'init')
  const wt = join(root, 'task-wt')
  execFileSync('git', ['worktree', 'add', '-b', 'task', wt, 'main'], { cwd: root })
  return { root, wt }
}

/** 在 cwd 提交一个单文件改动（add + commit）。 */
function commitFile(cwd, file, content, message) {
  writeFileSync(join(cwd, file), content)
  execFileSync('git', ['add', '--', file], { cwd: cwd })
  gitCommit(cwd, message)
}

/** 读取 HEAD 哈希。 */
function headSha(cwd) {
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim()
}

/** 只读 git 探针（失败不抛错）：返回 exit status（git 事实真值源）。 */
function gitStatusOf(cwd, args) {
  return spawnSync('git', args, { cwd, encoding: 'utf8' }).status ?? -1
}

/** 双侧改 c.txt 同一行，构造 rebase 真冲突。 */
function makeConflict(rig) {
  commitFile(rig.root, 'c.txt', 'line1\nMAIN-side\n', 'main side')
  commitFile(rig.wt, 'c.txt', 'line1\nTASK-side\n', 'task side')
}

test('gitHasRebaseHead 三态：无中断 false / 冲突中断 true / abort 后 false', async () => {
  const rig = makeRebaseFixture()
  try {
    // 无中断态：exit 1 是业务结果 → false（与 gitHasMergeHead 三态纪律同构）。
    const [cleanErr, clean] = await gitHasRebaseHead(rig.wt)
    assert.equal(cleanErr, null)
    assert.equal(clean, false)

    makeConflict(rig)
    const [rebaseErr] = await gitRebase(rig.wt, 'main')
    assert.ok(rebaseErr, 'rebase must fail on conflict')

    // 冲突中断态：REBASE_HEAD 存在 → true；主检出不受牵连 → false（worktree 隔离）。
    const [intErr, interrupted] = await gitHasRebaseHead(rig.wt)
    assert.equal(intErr, null)
    assert.equal(interrupted, true)
    const [mainErr, mainState] = await gitHasRebaseHead(rig.root)
    assert.equal(mainErr, null)
    assert.equal(mainState, false)

    // abort 恢复 → 回到无中断态 false。
    const [abortErr] = await gitRebaseAbort(rig.wt)
    assert.equal(abortErr, null)
    const [afterErr, after] = await gitHasRebaseHead(rig.wt)
    assert.equal(afterErr, null)
    assert.equal(after, false)
  } finally {
    rmSync(rig.root, { recursive: true, force: true })
  }
})

test('gitRebase 成功路径：任务提交落在新 base tip 之上且哈希改写', async () => {
  const rig = makeRebaseFixture()
  try {
    // main 推进（新文件），任务侧改另一文件 → 无冲突 rebase。
    commitFile(rig.root, 'main.txt', 'main work\n', 'main advance')
    commitFile(rig.wt, 'task.txt', 'task work\n', 'task work')
    const taskTipBefore = headSha(rig.wt)

    const [err] = await gitRebase(rig.wt, 'main')
    assert.equal(err, null)
    // main 成为任务分支祖先（任务提交挪到 main 新 tip 之上）。
    assert.equal(gitStatusOf(rig.root, ['merge-base', '--is-ancestor', 'main', 'task']), 0)
    // 任务提交哈希被改写（线性历史的外在表现）。
    assert.notEqual(headSha(rig.wt), taskTipBefore)
  } finally {
    rmSync(rig.root, { recursive: true, force: true })
  }
})

test('gitRebase 冲突路径：exit 1 透出、文案携带 CONFLICT', async () => {
  const rig = makeRebaseFixture()
  try {
    makeConflict(rig)
    const [err] = await gitRebase(rig.wt, 'main')
    assert.ok(err, 'rebase must fail on conflict')
    assert.equal(err.code, 1, 'conflict interruption exits 1')
    // Node 24 实测：execFile 的 err 不挂载 stderr 属性（maxBuffer 超限错误同样没有），
    // git 原始文案嵌在 err.message（"Command failed: <cmd>\\n<stderr>"）——与既有
    // merge 冲突链路 errText 的回退通道一致。
    assert.match(String(err.message), /CONFLICT|could not apply/)
  } finally {
    rmSync(rig.root, { recursive: true, force: true })
  }
})

test('gitRebaseAbort 恢复现场：HEAD 复原、无冲突标记残留', async () => {
  const rig = makeRebaseFixture()
  try {
    makeConflict(rig)
    const taskTipBefore = headSha(rig.wt)
    await gitRebase(rig.wt, 'main')
    const [abortErr] = await gitRebaseAbort(rig.wt)
    assert.equal(abortErr, null)
    // HEAD 复原为任务原 tip、分支名不变。
    assert.equal(headSha(rig.wt), taskTipBefore)
    assert.equal(gitStatusOf(rig.wt, ['symbolic-ref', '--short', 'HEAD']), 0)
    assert.equal(
      execFileSync('git', ['symbolic-ref', '--short', 'HEAD'], { cwd: rig.wt, encoding: 'utf8' }).trim(),
      'task',
    )
    // 工作区文件复原：无冲突标记、内容回到任务侧版本。
    const text = execFileSync('git', ['show', 'HEAD:c.txt'], { cwd: rig.wt, encoding: 'utf8' })
    assert.doesNotMatch(text, /<<<<<<<|>>>>>>>/)
    assert.match(text, /TASK-side/)
  } finally {
    rmSync(rig.root, { recursive: true, force: true })
  }
})

test('gitMergeFfOnly 快进成功：主检出推进到任务分支 tip', async () => {
  const rig = makeRebaseFixture()
  try {
    commitFile(rig.wt, 'task.txt', 'task work\n', 'task work')
    const [err] = await gitMergeFfOnly(rig.root, 'task')
    assert.equal(err, null)
    // 主检出 HEAD 推进到任务分支 tip（纯快进，无 merge commit）。
    assert.equal(headSha(rig.root), headSha(rig.wt))
    assert.equal(
      execFileSync('git', ['rev-list', '--merges', 'HEAD'], { cwd: rig.root, encoding: 'utf8' }).trim(),
      '',
      'ff merge must not create a merge commit',
    )
  } finally {
    rmSync(rig.root, { recursive: true, force: true })
  }
})

test('gitMergeFfOnly 非快进拒绝：err 透出 stderr 且无合并态', async () => {
  const rig = makeRebaseFixture()
  try {
    // 双侧各自推进 → ff 不可能。
    commitFile(rig.root, 'main.txt', 'main work\n', 'main advance')
    commitFile(rig.wt, 'task.txt', 'task work\n', 'task work')
    const [err] = await gitMergeFfOnly(rig.root, 'task')
    assert.ok(err, 'ff-only must refuse a diverged base')
    // git 2.39 实测：ff-only 拒绝走 fatal 路径，exit 128（非冲突的 exit 1）。
    assert.equal(err.code, 128, 'ff refusal is a fatal path (exit 128)')
    // git 文案透出通道同上：err.message 嵌原始 stderr（LC_ALL=C 英文）。
    assert.match(String(err.message), /[Nn]ot possible to fast-forward/)
    // ff-only 拒绝不建合并态：MERGE_HEAD 探测 exit 1。
    assert.equal(gitStatusOf(rig.root, ['rev-parse', '-q', '--verify', 'MERGE_HEAD']), 1)
  } finally {
    rmSync(rig.root, { recursive: true, force: true })
  }
})
