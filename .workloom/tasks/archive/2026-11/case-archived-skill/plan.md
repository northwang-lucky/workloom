# 新增 workloom-case-archived 技能 — plan

按 test-first 红绿推进。需求以 [prd.md](prd.md) 的 R1–R16 / AC1–AC12 为准。实现前读取 implement.jsonl 的规范与两份研究。代码命令在任务 worktree 执行，任务材料、真实评测与证据写主仓 `.workloom`。改前片段必须唯一命中，失配即停止并上报。

## Design decisions

1. **不改 core 生命周期**：归档选择、原件清单、package、Source 元数据和 ref 处理全部放在技能资源脚本；指定 ref 先建本地分支，再按正常流程创建 worktree。
2. **原件只读**：清单对原始字节计算 SHA-256，不归一换行；Source 元数据同时写 `task.json.meta` 与 CASE `Source task`，但不传 parent。
3. **材料分流明确**：PLAN 优先；成对 design+implement 在新任务内重写；单侧材料按仅 PRD 处理并注明缺失文件；历史 CASE/RESULT 只读参考。
4. **两个独立批准轮次**：新任务 1.4 启动批准与 CASE hash 批准都必须来自新的用户消息，初始请求或 continue 不算批准。
5. **五组只带技能验收**：PLAN 默认 HEAD、legacy 指定 ref、仅 PRD、候选选择、无效输入快速失败。每个场景一次，提示明确独立批准，评分与静态页不使用无技能材料。
6. **普通文件归档**：评测项目运行时需要临时 git 仓库，finalizer 在保留 HEAD 后移除嵌套 `.git`，避免主仓只记录子仓库引用。
7. **复用既有机制**：真实 CASE、结果门、指纹脚本、双 adapter 注册、aggregate 和静态 viewer 均复用，不新增 core 工具或命令。

## Steps

### 阶段 0：基线与并行 CASE 设计

#### 步骤 0.1 基线验证

- Covers: (internal)
- Target: 无文件改动（验证步骤）
- Edit: 无
- Verify: 依次运行，全部 exit 0；既有失败先停止上报：
  1. `pnpm lint && pnpm -r typecheck && pnpm -r build`
  2. `cd packages/core && node --test test/*.test.js`
  3. `cd packages/adapter-dsh && node --test test/*.test.js`
  4. `cd packages/adapter-pi && bun test test/*.test.ts`
  5. `cd packages/assets && node --test test/*.test.js`

#### 步骤 0.2 当前任务 CASE 并行设计

- Covers: AC2, AC5, AC6
- Target: 当前任务 `case.md`（由 check executor 生成）
- Edit: 主会话在首个实施派发同时派发 `kind=check`、`purpose=case-design`。check 按 PRD、PLAN 与固定模板设计 CASE，主会话审核并继续原会话修订；用户确认前不执行。当前 profile 未加载新 purpose 时记录部署限制，并用新源码和真机结果证明行为。
- Verify: 当前任务 CASE review 返回 readyToConfirm=true，确认前没有 case-result.md。

#### 步骤 0.3 PLAN 独立审查与启动审阅包

- Covers: AC12
- Target: 当前任务 `plan.md`、`plan-review.md`
- Edit: 主会话派发 review executor，逐项核对 AC 映射、真实锚点、新文件完整内容与验证命令；所有 P0/P1/P2 修复后，向用户提交 PRD、PLAN、研究、上下文和审查处置记录。
- Verify: 三轮内没有未处置 P0/P1/P2；AC1–AC12 在 Covers 中均出现，用户确认后任务才启动。

### 阶段 1（红→绿）：归档辅助脚本

#### 步骤 1.1 先写公开行为测试

- Covers: AC1, AC2, AC3, AC7, AC11
- Target: `packages/assets/skills/workloom-case-archived/scripts/archived-tasks.test.mjs`（新文件）
- Edit: 创建完整测试文件：

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  activateRef,
  listArchivedTasks,
  prepareRef,
  readArchivedTask,
  restoreRef,
  resolvePackage,
  resolveSourceCommit,
  snapshotArchivedTask,
} from './archived-tasks.mjs'

function git(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

function write(root, path, content) {
  const file = join(root, path)
  mkdirSync(join(file, '..'), { recursive: true })
  writeFileSync(file, content)
}

function makeRoot() {
  const root = mkdtempSync(join(tmpdir(), 'workloom-archived-skill-'))
  write(root, '.workloom/config.json', '{"packages":{"repo":{"path":"."}}}\n')
  write(root, '.workloom/tasks/archive/a-full/task.json', JSON.stringify({ title: 'A', status: 'completed', mode: 'full', package: 'repo', commit: '', completedAt: '2026-01-01T00:00:00Z' }))
  write(root, '.workloom/tasks/archive/b-legacy/task.json', JSON.stringify({ title: 'B', status: 'completed', package: 'missing', completedAt: '2026-02-01T00:00:00Z' }))
  write(root, '.workloom/tasks/archive/c-light/task.json', JSON.stringify({ title: 'C', status: 'completed', mode: 'light', completedAt: '2026-03-01T00:00:00Z' }))
  git(root, ['init'])
  git(root, ['add', '.'])
  git(root, ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'archive fixtures'])
  return root
}

test('枚举只含 completed full/legacy full，按 completedAt 倒序，拒绝 light 与越界路径', () => {
  const root = makeRoot()
  try {
    const items = listArchivedTasks(root)
    assert.deepEqual(items.map((item) => item.taskPath), ['tasks/archive/b-legacy', 'tasks/archive/a-full'])
    assert.equal(items[1].package, 'repo')
    assert.equal(readArchivedTask(root, 'tasks/archive/a-full').status, 'completed')
    assert.throws(() => readArchivedTask(root, 'tasks/archive/c-light'), /light/)
    assert.throws(() => readArchivedTask(root, '../outside'), /invalid archived task path/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('package、来源提交和指定 ref 均按确定规则处理', () => {
  const root = makeRoot()
  try {
    assert.equal(resolvePackage(root, 'repo'), 'repo')
    assert.equal(resolvePackage(root, 'missing'), 'repo')
    write(root, '.workloom/config.json', '{"packages":{"repo":{"path":"."},"other":{"path":"other"}}}\n')
    assert.equal(resolvePackage(root, 'missing'), null)
    const source = resolveSourceCommit(root, 'tasks/archive/a-full', { commit: '' })
    assert.match(source.commit, /^[a-f0-9]{40}$/)
    assert.equal(source.type, 'archive-bookkeeping')
    const head = git(root, ['rev-parse', 'HEAD'])
    const prepared = prepareRef(root, head, 'validation-demo')
    assert.equal(prepared.commit, head)
    assert.equal(prepared.branch, 'workloom/validation-validation-demo')
    assert.match(prepared.reason, /User-selected ref/)
    assert.equal(git(root, ['rev-parse', prepared.branch]), head)
    const activation = activateRef(root, prepared)
    assert.equal(git(root, ['branch', '--show-current']), prepared.branch)
    assert.equal(git(root, ['rev-parse', 'HEAD']), head)
    restoreRef(root, activation.previousBranch)
    assert.equal(git(root, ['branch', '--show-current']), activation.previousBranch)
    const current = prepareRef(root, undefined, 'validation-demo')
    assert.equal(current.branch, null)
    assert.equal(current.type, 'current-head')
    assert.equal(current.reason, 'Default current target branch')
    assert.equal(activateRef(root, current).changed, false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('原件清单对原始字节敏感，修改任一文件都会被发现', () => {
  const root = makeRoot()
  try {
    const before = snapshotArchivedTask(root, 'tasks/archive/a-full')
    assert.deepEqual(snapshotArchivedTask(root, 'tasks/archive/a-full'), before)
    const path = '.workloom/tasks/archive/a-full/task.json'
    writeFileSync(join(root, path), `${readFileSync(join(root, path), 'utf8')}\n`)
    assert.notDeepEqual(snapshotArchivedTask(root, 'tasks/archive/a-full'), before)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
```

- Verify: `cd packages/assets && node --test skills/workloom-case-archived/scripts/archived-tasks.test.mjs`；预期因 archived-tasks.mjs 不存在而失败。

#### 步骤 1.2 实现归档辅助脚本

- Covers: AC1, AC2, AC3, AC7, AC11
- Target: `packages/assets/skills/workloom-case-archived/scripts/archived-tasks.mjs`（新文件）
- Edit: 创建完整文件：

```js
import { createHash } from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import { readdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'

const ARCHIVE_PREFIX = 'tasks/archive/'
const FULL_MODE = 'full'

function git(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

function archiveRoot(root) {
  return join(root, '.workloom', 'tasks', 'archive')
}

function safeTaskPath(taskPath) {
  if (typeof taskPath !== 'string' || taskPath === '' || isAbsolute(taskPath) || taskPath.includes('\0')) {
    throw new Error(`invalid archived task path: ${String(taskPath)}`)
  }
  const normalized = taskPath.replaceAll('\\', '/').replace(/\/+$/, '')
  if (!normalized.startsWith(ARCHIVE_PREFIX) || normalized.split('/').includes('..')) {
    throw new Error(`invalid archived task path: ${taskPath}`)
  }
  return normalized
}

function taskDirectory(root, taskPath) {
  const rel = safeTaskPath(taskPath)
  const base = realpathSync(join(root, '.workloom'))
  const directory = realpathSync(join(root, '.workloom', rel))
  const relFromBase = relative(base, directory)
  if (relFromBase.startsWith('..') || isAbsolute(relFromBase)) throw new Error(`invalid archived task path: ${taskPath}`)
  if (!statSync(directory).isDirectory()) throw new Error(`archived task is not a directory: ${taskPath}`)
  return { rel, directory }
}

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'))
}

function readTask(root, taskPath) {
  const { rel, directory } = taskDirectory(root, taskPath)
  const task = readJson(join(directory, 'task.json'))
  if (task.status !== 'completed') throw new Error(`archived task is not completed: ${rel}`)
  if (task.mode === 'light') throw new Error(`light task is not supported: ${rel}`)
  return { task, rel, directory }
}

export function listArchivedTasks(root) {
  const result = []
  const base = archiveRoot(root)
  function walk(dir, rel) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const nextRel = `${rel}/${entry.name}`
      const next = join(dir, entry.name)
      if (!entry.isDirectory()) continue
      const taskFile = join(next, 'task.json')
      try {
        const task = readJson(taskFile)
        if (task.status === 'completed' && task.mode !== 'light') {
          result.push({
            taskPath: nextRel,
            title: String(task.title ?? task.name ?? nextRel),
            completedAt: String(task.completedAt ?? ''),
            package: typeof task.package === 'string' ? task.package : '',
          })
        }
        continue
      } catch (error) {
        // 只有不存在的 task.json 表示年月层级目录；损坏文件必须显式失败。
        if (error?.code !== 'ENOENT') throw error
      }
      walk(next, nextRel)
    }
  }
  if (statSync(base, { throwIfNoEntry: false })?.isDirectory()) walk(base, ARCHIVE_PREFIX.replace(/\/$/, ''))
  return result.sort((a, b) => b.completedAt.localeCompare(a.completedAt) || a.taskPath.localeCompare(b.taskPath))
}

export function readArchivedTask(root, taskPath) {
  return readTask(root, taskPath).task
}

export function snapshotArchivedTask(root, taskPath) {
  const { directory } = taskDirectory(root, taskPath)
  const files = []
  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const file = join(dir, entry.name)
      if (entry.isDirectory()) walk(file)
      else if (entry.isFile()) files.push(file)
    }
  }
  walk(directory)
  return Object.fromEntries(files.sort().map((file) => [relative(directory, file), createHash('sha256').update(readFileSync(file)).digest('hex')]))
}

export function resolvePackage(root, historicalPackage) {
  const config = readJson(join(root, '.workloom', 'config.json'))
  const packages = config.packages ?? {}
  if (typeof historicalPackage === 'string' && Object.hasOwn(packages, historicalPackage)) return historicalPackage
  const names = Object.keys(packages)
  return names.length === 1 ? names[0] : null
}

export function resolveSourceCommit(root, taskPath, task) {
  if (typeof task.commit === 'string' && /^[a-f0-9]{40}$/.test(task.commit)) return { commit: task.commit, type: 'task-commit' }
  const { rel } = taskDirectory(root, taskPath)
  const commit = git(root, ['log', '-1', '--format=%H', '--', join('.workloom', rel)])
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error(`cannot resolve source commit for ${rel}`)
  return { commit, type: 'archive-bookkeeping' }
}

export function prepareRef(root, ref, slug) {
  if (!/^[a-z0-9-]+$/.test(slug)) throw new Error(`invalid validation slug: ${slug}`)
  if (ref === undefined || ref === '') {
    return {
      commit: git(root, ['rev-parse', 'HEAD']),
      branch: null,
      ref: git(root, ['branch', '--show-current']),
      type: 'current-head',
      reason: 'Default current target branch',
    }
  }
  const commit = git(root, ['rev-parse', '--verify', `${ref}^{commit}`])
  const branch = `workloom/validation-${slug}`
  const existing = execFileSync('git', ['branch', '--list', branch], { cwd: root, encoding: 'utf8' }).trim()
  if (existing !== '') {
    if (git(root, ['rev-parse', branch]) !== commit) throw new Error(`validation branch exists at another commit: ${branch}`)
  } else {
    git(root, ['branch', branch, commit])
  }
  return { commit, branch, ref, type: 'user-ref', reason: `User-selected ref ${ref}` }
}

function codeWorktreeClean(root) {
  const diff = spawnSync('git', ['diff', '--quiet', '--', '.', ':(exclude).workloom/**', ':(exclude).pi/**'], { cwd: root, stdio: 'ignore' })
  if (diff.status !== 0) return false
  return git(root, ['ls-files', '--others', '--exclude-standard', '--', '.', ':(exclude).workloom/**', ':(exclude).pi/**']) === ''
}

/** 启动前切到验证分支；代码脏树直接拒绝，任务文档不影响切换。 */
export function activateRef(root, prepared) {
  const previousBranch = git(root, ['branch', '--show-current'])
  if (previousBranch === '') throw new Error('cannot activate ref from detached HEAD')
  if (prepared.branch === null) return { previousBranch, changed: false }
  if (!codeWorktreeClean(root)) throw new Error('code worktree must be clean before activating validation ref')
  git(root, ['checkout', prepared.branch])
  return { previousBranch, changed: true }
}

/** worktree 创建后立即恢复主分支，避免长期改变用户检出。 */
export function restoreRef(root, previousBranch) {
  if (!codeWorktreeClean(root)) throw new Error('code worktree must be clean before restoring original branch')
  git(root, ['checkout', previousBranch])
}

if (process.argv[1]?.endsWith('archived-tasks.mjs')) {
  const [command, ...args] = process.argv.slice(2)
  const root = process.cwd()
  if (command === 'list') console.log(JSON.stringify(listArchivedTasks(root), null, 2))
  else if (command === 'snapshot' && args[0]) console.log(JSON.stringify(snapshotArchivedTask(root, args[0]), null, 2))
  else throw new Error('usage: node archived-tasks.mjs list | snapshot <tasks/archive/...>')
}
```

- Verify: 重跑步骤 1.1；3 个测试全绿，临时目录均清理。

### 阶段 2（红→绿）：双 adapter 注册与内容保护

#### 步骤 2.1 先更新清单与内容测试

- Covers: AC1, AC8, AC9, AC11
- Target: `packages/adapter-dsh/test/skills.test.js` —— 名单与新增内容测试；`packages/adapter-pi/test/skills.test.ts` —— 名单、文件头注释与测试标题
- Edit 改前（DSH 名单）：`'workloom-case-active',` 后接 `'workloom-continue',`；改后在两者之间插入 `'workloom-case-archived',`。Pi 名单同样插入。
- Edit 改前（DSH 清单测试标题）：`skill 清单契约：注册 case-active/continue/finish/alignment/update-spec/packages-scan/migrate-plan + generic tdd/grilling/writing-for-agents，不含旧两个 workloom skill`
- Edit 改后：`skill 清单契约：注册 case-active/case-archived/continue/finish/alignment/update-spec/packages-scan/migrate-plan + generic tdd/grilling/writing-for-agents，不含旧两个 workloom skill`
- Edit（Pi 文件头注释与清单测试标题同步）：把 `workloom-case-active/continue/finish/alignment/update-spec/packages-scan/migrate-plan` 改为 `workloom-case-active/case-archived/continue/finish/alignment/update-spec/packages-scan/migrate-plan`，与新增名单一致。
- Edit: 在 `test('workloom-migrate-plan 资产可解析...` 前插入以下测试。文件缺失时先红：

```js
test('workloom-case-archived 资产与五组 eval：只读原件、独立任务、ref 和独立批准', () => {
  const doc = readFileSync(
    new URL('../../assets/skills/workloom-case-archived/SKILL.md', import.meta.url),
    'utf8',
  )
  const [err, parsed] = parseSkillFrontmatter(doc)
  assert.equal(err, null)
  assert.equal(parsed.name, 'workloom-case-archived')
  assert.match(parsed.body, /tasks\/archive\//)
  assert.match(parsed.body, /snapshotArchivedTask/)
  assert.match(parsed.body, /sourceTask/)
  assert.match(parsed.body, /sourceCommit/)
  assert.match(parsed.body, /prepareRef/)
  assert.match(parsed.body, /workloom_task_create/)
  assert.match(parsed.body, /Never pass `parent`/)
  assert.match(parsed.body, /is never an approval/)
  assert.match(parsed.body, /new user message/)
  const evals = JSON.parse(readFileSync(
    new URL('../../assets/skills/workloom-case-archived/evals/evals.json', import.meta.url),
    'utf8',
  ))
  assert.equal(evals.skill_name, 'workloom-case-archived')
  assert.deepEqual(evals.evals.map((item) => item.id), [
    'archived-plan-default-head',
    'archived-legacy-explicit-ref',
    'archived-prd-only-rebuild',
    'archived-select-candidate',
    'archived-invalid-input-fast-fail',
  ])
  for (const item of evals.evals) {
    assert.equal(typeof item.name, 'string')
    assert.ok(item.assertions.length > 0)
    assert.ok(!/[\u3400-\u9fff]/.test(item.prompt))
    assert.ok(!/[\u3400-\u9fff]/.test(item.assertions.join('\n')))
  }
  for (const id of evals.evals.slice(0, 3).map((item) => item.id)) {
    const item = evals.evals.find((entry) => entry.id === id)
    assert.match(item.prompt, /The initial request is not an approval/)
    assert.match(item.prompt, /new user message/)
    assert.ok(item.assertions.some((line) => /independent user approval/.test(line)))
  }
})
```

- Verify: DSH/Pi 清单测试因缺少 workloom-case-archived 而失败，新增内容测试因 SKILL.md 与 evals.json 缺失而失败。

#### 步骤 2.2 注册并同步技能目录

- Covers: AC1, AC8, AC11
- Target: `packages/adapter-dsh/src/skills.ts` —— `SKILL_ASSETS`；`packages/adapter-pi/scripts/sync-skills.mjs` —— `SKILL_SOURCES`
- Edit 改前（DSH）：

```ts
  'skills/workloom-case-active/SKILL.md',
  'skills/workloom-update-spec/SKILL.md',
```

- Edit 改后（DSH）：

```ts
  'skills/workloom-case-active/SKILL.md',
  'skills/workloom-case-archived/SKILL.md',
  'skills/workloom-update-spec/SKILL.md',
```

- Edit 改前（Pi）：

```js
  '../assets/skills/workloom-case-active',
  '../assets/skills/workloom-update-spec',
```

- Edit 改后（Pi）：

```js
  '../assets/skills/workloom-case-active',
  '../assets/skills/workloom-case-archived',
  '../assets/skills/workloom-update-spec',
```

- Edit: 两处头部注释补充 case-archived（归档任务只读重建与独立验证）；不增加硬编码总数，不新增命令，workflow version 25 不变。
- Verify: `pnpm -r build` 后重跑清单测试；Pi 产物目录包含新技能。

### 阶段 3：技能正文

#### 步骤 3.1 创建 workloom-case-archived SKILL.md

- Covers: AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC9
- Target: `packages/assets/skills/workloom-case-archived/SKILL.md`（新文件）
- Edit: 创建以下完整英文资产：

```markdown
---
name: workloom-case-archived
description: Rebuild CASE verification for a completed archived full task without modifying the original. Use when the user asks to validate, supplement, or re-run CASE for an archived task, including PLAN, legacy design/implement, PRD-only material, and a selected commit or branch. Creates one independent full task, never edits the archive original, and completes real cases and coverage.
whenToUse: Use only for completed full tasks under tasks/archive/; list candidates when no archived task path is provided. Do not use for active, unarchived, or light tasks.
---

# Workloom Case Archived

Rebuild CASE verification for one archived full task. The original is read-only. Create one independent full task against a recorded current code baseline and complete its normal lifecycle. Never describe the new result as proof of historical execution.

## Boundaries

- Accept only `status: completed` full or legacy-full tasks under `tasks/archive/`. Route active or unarchived work to the normal workflow or `workloom-case-active`; light tasks keep their light self-check flow.
- Handle one archived task per invocation. Without a path, run `node <skill-resource>/scripts/archived-tasks.mjs list` and present title, path, and completedAt; wait for the user to select one. Do not auto-select or batch.
- The original request, a generic continue, or the archived task's old approval is never an approval for the new task. Both Phase 1.4 startup and CASE confirmation require a new user message approving the exact current content or caseHash.
- Never pass `parent` when creating the validation task; it could mutate the archived original. Never invoke workloom-migrate-plan on the archive itself.
- Do not add commands, change workflow versions, or duplicate core CASE gates.

## Step 1: Select and freeze the source

1. Resolve the archived task with `readArchivedTask`. Reject missing, light, non-completed, and outside paths before doing any write.
2. Compute `snapshotArchivedTask(root, taskPath)` and save the raw-byte SHA-256 manifest outside the archived directory. Repeat this manifest at the end and require exact equality.
3. Read the source PRD and materials. Classify them as `plan`, `legacy-pair`, or `prd-only`. Only design.md or only implement.md is `prd-only` with the missing file named explicitly. Existing CASE/RESULT is reference material only, never a current result.

## Step 2: Resolve package, source commit, and validation ref

1. Call `resolvePackage`. Inherit a package that exists in current config, otherwise use the current default or sole package. If it returns null, ask the user which current package to use.
2. Call `resolveSourceCommit`: use a valid task.commit, otherwise the latest commit touching the archived path, with the source type recorded.
3. Without a user ref, call `prepareRef(root, undefined, slug)` for current HEAD. With a branch or commit ref, resolve it and create a unique local branch via `prepareRef`. Create the validation branch via `prepareRef`; Step 3.4 owns the later activation and restore actions. Never use detached HEAD and never change core worktree rules. Map `prepareRef.type` to `validationRefSource=default-current-branch` for `current-head` or `user-specified` for `user-ref`, and preserve `prepareRef.reason` as `validationReason`.
4. Stop on missing paths, unresolvable refs, malformed task.json, or invalid package/worktree conditions. Make no task or archive writes in that case.

## Step 3: Create the independent task

1. Call `workloom_task_create` with the resolved package, an explicit English slug, and no parent. At creation, record in `task.json.meta`: `sourceTask`, `sourceCommit`, `sourceCommitType`, `validationRef`, `validationRefSource`, `validationReason`, `validationCommit`, `validationBranch`, `materialMode`, and the current validation purpose. Only after `restoreRef` succeeds, append `previousBranch` and `activationRestored: true`; do not write placeholder values for those two fields.
2. Write a new PRD from the historical requirements and the current validation goal. Do not reuse the old alignment hash or pretend the old implementation is current.
3. With a source PLAN, use it as the reference for a new prescriptive plan. With a legacy pair, apply the migration method only inside the new task directory. With PRD-only or single-sided material, explicitly record what is missing and author the new PLAN from the PRD.
4. Run normal alignment and present the 1.4 package, including any branch switch and restore. Stop until a new user message approves it, then confirm alignment, call `activateRef`, and start the task. Immediately call `restoreRef` after the validation worktree exists; on a start failure, restore before reporting.

## Step 4: Design and confirm CASE

1. Dispatch implementation and `kind: check`, `purpose: case-design` concurrently when implementation is needed. If the new plan needs no code change, only the CASE design dispatch is required.
2. Main-session review covers the new PRD, PLAN, current code, source metadata, and all changed files. Revisions continue the same design session with `purpose: case-design`.
3. Historical CASE/RESULT is read-only reference. The new CASE has its own Source task, current validation commit, and current acceptance scope.
4. After review, stop and wait for a new user message approving the current caseHash. Confirm only that hash. A generic continue is not approval.

## Step 5: Execute, record, and archive

1. Continue the design session with `purpose: execution` only after implementation readiness and CASE confirmation. Run all SR/C items in order, real coverage, and standard verification.
2. RESULT codeBaseline records the validation commit, validationRefSource, validationReason, sourceCommit and `codeFingerprint=<hex>` from `../workloom-case-active/scripts/task-fingerprint.mjs`. RESULT Source task is the archived original path; checkSession equals designSession or a valid fallbackOf chain.
3. Record a passing result with `workloom_task_check`. Never force a core CASE failure or copy a historical pass.
4. Commit on the new task branch, archive it independently, and record its journal. Recompute the original raw-byte manifest and require no change before reporting completion.
5. On failure, stop without mutating the original. Do not silently lower acceptance or archive a failed validation task.

## Completion criteria

The independent full task has a user-approved PRD/PLAN and CASE, real SR/C and coverage evidence tied to the recorded current baseline, its own check/commit/archive/journal, and an unchanged original SHA-256 manifest.
```

- Verify: DSH 新增内容测试通过；front-matter 可解析，正文没有 CJK，不包含模板章节复制。

### 阶段 4：五组真实评测定义

#### 步骤 4.1 创建 evals.json

- Covers: AC10
- Target: `packages/assets/skills/workloom-case-archived/evals/evals.json`（新文件）
- Edit: 创建以下完整定义。前三个场景都包含独立的 1.4 与 CASE 批准轮次；`<fixture-project>` 与 `<base-ref>` 由 runner 替换。

```json
{
  "skill_name": "workloom-case-archived",
  "description": "Five with-skill-only archived CASE reconstruction scenarios.",
  "evals": [
    {
      "id": "archived-plan-default-head",
      "name": "Archived PLAN uses current HEAD",
      "prompt": "Work in <fixture-project>. Rebuild CASE verification for the archived full task with an existing PLAN, using the default current target branch. The initial request is not an approval: stop for a new user message before Phase 1.4 startup, and stop again for a new user message approving the current caseHash before confirm/execution. Complete real CASE execution and coverage, then archive only the new task.",
      "expected_output": "An independent full task validates current HEAD, historical CASE/RESULT is only a reference, and the original archive is unchanged.",
      "assertions": [
        "The new task has no parent and records matching sourceTask/sourceCommit/current validation metadata in task.json.meta and CASE.",
        "The default validation commit equals the fixture's initial HEAD, not a guessed historical commit.",
        "Metadata records validationRefSource=default-current-branch and a reason explaining the default target branch.",
        "Historical CASE/RESULT remains unchanged and is not reused as the current result.",
        "Real SR/C execution and coverage or a justified not_applicable result exist.",
        "Both startup and CASE confirmation wait for independent user approval messages.",
        "The original archive manifest is byte-identical before and after the new task archive."
      ],
      "files": []
    },
    {
      "id": "archived-legacy-explicit-ref",
      "name": "Legacy materials use an explicit ref",
      "prompt": "Work in <fixture-project>. Rebuild CASE verification for the archived full task with design.md + implement.md using ref <base-ref>. The initial request is not an approval: wait for a new user message before startup and another new user message approving the current caseHash. Migrate only inside the new task, execute real cases, and keep the original archive unchanged.",
      "expected_output": "A unique local branch points to the requested commit, the new task migrates legacy materials internally, and the original is untouched.",
      "assertions": [
        "The requested ref resolves to a unique local branch at the exact commit; the validation worktree is not detached.",
        "The created validation worktree HEAD equals the requested 40-character commit, proving the code baseline is not current HEAD.",
        "Evidence contains the ref-side src/current.txt content 'base' and not the current-HEAD content 'current'.",
        "RESULT codeFingerprint equals an independent task-fingerprint.mjs run on the requested ref worktree.",
        "design.md + implement.md are handled only inside the new task and produce a valid plan.md.",
        "Source metadata distinguishes the requested validation commit from the archive bookkeeping commit.",
        "Real execution records a passing RESULT with a current code fingerprint.",
        "Startup and CASE confirmation wait for independent user approval messages.",
        "The original archive manifest is byte-identical after completion."
      ],
      "files": []
    },
    {
      "id": "archived-prd-only-rebuild",
      "name": "PRD-only archive is explicitly rebuilt",
      "prompt": "Work in <fixture-project>. Rebuild CASE verification for the archived full task that has only PRD material. Mark the missing PLAN explicitly and create a new PRD/PLAN. The initial request is not an approval: stop for a new user message before Phase 1.4 startup, and stop again for a new user message approving the current caseHash before confirm/execution. Execute the real CASE and preserve the original archive bytes.",
      "expected_output": "The new task explicitly documents PRD-only input, authors a new PLAN, and completes real verification without changing the original.",
      "assertions": [
        "The new PRD explicitly records PRD-only material and does not claim an existing implementation plan.",
        "A structurally valid new plan.md is created before startup.",
        "No historical CASE/RESULT hash is reused as current confirmation or result evidence.",
        "The new CASE executes with real evidence and coverage status.",
        "Startup and CASE confirmation wait for independent user approval messages.",
        "The original archive manifest is byte-identical after completion."
      ],
      "files": []
    },
    {
      "id": "archived-select-candidate",
      "name": "No path requires candidate selection",
      "prompt": "Work in <fixture-project>. Ask for archived CASE verification without naming a task. List the eligible archived full tasks with titles, paths, and completedAt values, then stop for my selection. Do not create a task before I choose. After I select, only confirm the selection and stop; do not create a task in this selection-only scenario.",
      "expected_output": "The skill lists only eligible archived full tasks and creates nothing before selection; after selection, this selection-only run stops without creating a task.",
      "assertions": [
        "The candidate list contains the expected archived full tasks sorted by completedAt descending.",
        "Light and non-completed tasks are excluded.",
        "No new task directory or local validation branch is created before selection, and the selection-only run stops without creating one afterward.",
        "The original archive manifests remain unchanged."
      ],
      "files": []
    },
    {
      "id": "archived-invalid-input-fast-fail",
      "name": "Invalid input fails without writes",
      "prompt": "Work in <fixture-project>. Attempt archived CASE verification first with an outside task path and then with a nonexistent ref. Both must fail before creating a new task or modifying the archive. Report the exact errors.",
      "expected_output": "Both invalid inputs fail explicitly with no task creation, no validation branch, and no archive changes.",
      "assertions": [
        "The outside archived path is rejected before any write.",
        "The nonexistent ref is rejected before any write.",
        "No new task directory or validation branch is created.",
        "The original archive manifest is byte-identical after both failures."
      ],
      "files": []
    }
  ]
}
```

- Verify: `node -e "const e=require('./packages/assets/skills/workloom-case-archived/evals/evals.json'); console.log(e.evals.length)"` 输出 5；id 唯一，提示与检查项无 CJK，前三个包含独立批准措辞。

### 阶段 5：可重复的归档评测夹具

#### 步骤 5.1 创建 build-fixtures.mjs

- Covers: AC1–AC7, AC10
- Target: `packages/assets/skills/workloom-case-archived/evals/build-fixtures.mjs`（新文件）
- Edit: 创建以下完整脚本。目标目录必须不存在，不删除任何既有目录。

```js
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const [scenario, target, sessionId] = process.argv.slice(2)
const SCENARIOS = new Set([
  'archived-plan-default-head',
  'archived-legacy-explicit-ref',
  'archived-prd-only-rebuild',
  'archived-select-candidate',
  'archived-invalid-input-fast-fail',
])
if (!SCENARIOS.has(scenario) || target === undefined || typeof sessionId !== 'string' || !/^[A-Za-z0-9_-]+$/.test(sessionId)) {
  throw new Error('usage: node build-fixtures.mjs <scenario> <new-target-dir> <session-id>')
}

function write(root, path, content) {
  const file = join(root, path)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, content)
}

function git(root, args) {
  execFileSync('git', args, { cwd: root, stdio: 'ignore' })
}

function prd(title) {
  return `# ${title}\n\n## Goal\n\nRebuild deterministic verification from archived material.\n\n## Requirements\n\n- R1: Keep the source materials readable and preserve their original semantics.\n- R2: Verify a deterministic local condition without external services.\n\n## Acceptance Criteria\n\n- AC1: Source material and alignment are readable. Verification: inspect task documents and hashes. Covers R1.\n- AC2: A local runtime check passes deterministically. Verification: execute the documented command. Covers R2.\n\n## Notes\n\n- Historical material is a reference for a new independent validation task.\n\n## Alignment Decisions\n\n- This archived fixture is complete and approved as historical input only.\n\n<!-- workloom:open-nodes=none -->\n`
}

function plan() {
  return '# Historical plan\n\n## Steps\n\n#### 步骤 1.1 verify\n\n- Covers: AC1, AC2\n- Target: archived task documents\n- Edit: no product code\n- Verify: run a deterministic local check and retain evidence\n'
}

function addArchive(root, slug, material, completedAt) {
  const rel = `tasks/archive/${slug}`
  write(root, `.workloom/${rel}/prd.md`, prd(slug))
  if (material === 'plan') write(root, `.workloom/${rel}/plan.md`, plan())
  if (material === 'legacy') {
    write(root, `.workloom/${rel}/design.md`, '# Legacy design\n\nVerify archived requirements with deterministic local checks.\n')
    write(root, `.workloom/${rel}/implement.md`, '# Legacy implementation\n\nNo implementation work remains.\n')
  }
  for (const name of ['implement.jsonl', 'check.jsonl']) {
    write(root, `.workloom/${rel}/${name}`, '{"file":".workloom/spec/README.md","reason":"archived fixture"}\n')
  }
  if (slug === 'plan-source') {
    write(root, `.workloom/${rel}/case.md`, '---\nversion: 1\ntask: tasks/archive/plan-source\n---\n\n# Historical CASE reference\n')
    write(root, `.workloom/${rel}/case-result.md`, '---\nversion: 1\ntask: tasks/archive/plan-source\nstatus: passed\n---\n\n# Historical RESULT reference\n')
  }
  const record = {
    id: `${slug}-id`,
    name: slug,
    title: slug,
    description: 'archived CASE reconstruction fixture',
    status: 'completed',
    priority: 'P2',
    mode: 'full',
    creator: 'eval',
    assignee: '',
    package: 'repo',
    branch: '',
    base_branch: '',
    createdAt: completedAt,
    completedAt,
    parent: null,
    children: [],
    subtasks: [],
    scope: '',
    commit: '',
    pr_url: '',
    worktree_path: '',
    relatedFiles: [],
    notes: '',
    meta: {},
    check: { passedAt: completedAt, summary: 'Historical result; not reusable as current evidence.' },
    alignment: null,
    overrides: [],
    stage: 'check',
    dispatches: [],
    hooks: { after_create: [], after_start: [], after_finish: [], after_archive: [] },
  }
  write(root, `.workloom/${rel}/task.json`, `${JSON.stringify(record, null, 2)}\n`)
  return rel
}

mkdirSync(target)
write(target, '.workloom/config.json', '{"packages":{"repo":{"path":"."}},"worktree":{"enabled":true,"base_dir":".workloom/worktree","copy_node_modules":true},"subagent_profiles":[],"subagents":{"check":{"model":"minimax-cn/MiniMax-M3.1-Flash","effort":"max","rotate_on_busy":false},"implement":{"model":"minimax-cn/MiniMax-M3.1-Flash","effort":"max","rotate_on_busy":false}}}\n')
write(target, '.workloom/spec/README.md', '# Archived fixture spec\n\nUse deterministic local verification.\n')
write(target, '.gitignore', '.pi/\n.workloom/.runtime/\n.workloom/worktree/\n')
write(target, 'src/current.txt', 'base\n')
if (scenario === 'archived-plan-default-head') addArchive(target, 'plan-source', 'plan', '2026-01-03T00:00:00.000Z')
if (scenario === 'archived-legacy-explicit-ref') addArchive(target, 'legacy-source', 'legacy', '2026-01-02T00:00:00.000Z')
if (scenario === 'archived-prd-only-rebuild') addArchive(target, 'prd-source', 'prd-only', '2026-01-01T00:00:00.000Z')
if (scenario === 'archived-select-candidate') {
  addArchive(target, 'older-plan', 'plan', '2026-01-01T00:00:00.000Z')
  addArchive(target, 'newer-legacy', 'legacy', '2026-02-01T00:00:00.000Z')
  const light = addArchive(target, 'light-archive', 'plan', '2026-03-01T00:00:00.000Z')
  const file = join(target, '.workloom', light, 'task.json')
  const task = JSON.parse(readFileSync(file, 'utf8'))
  task.mode = 'light'
  writeFileSync(file, `${JSON.stringify(task, null, 2)}\n`)
}
if (scenario === 'archived-invalid-input-fast-fail') addArchive(target, 'valid-source', 'plan', '2026-01-04T00:00:00.000Z')
git(target, ['init'])
git(target, ['add', '.'])
git(target, ['-c', 'user.name=Eval', '-c', 'user.email=eval@example.com', 'commit', '-m', 'archived fixture base'])
writeFileSync(join(target, 'src/current.txt'), 'current\n')
git(target, ['add', 'src/current.txt'])
git(target, ['-c', 'user.name=Eval', '-c', 'user.email=eval@example.com', 'commit', '-m', 'current validation target'])
console.log(target)
```

- Verify: `node --check packages/assets/skills/workloom-case-archived/evals/build-fixtures.mjs`；分别生成五个临时项目，确认材料类型、两个真实提交、light 排除和默认/指定 ref 输入可用，目标已存在时直接失败。

### 阶段 6：顶层 Pi 运行器与收尾

#### 步骤 6.1 创建 run-scenario.sh

- Covers: AC10
- Target: `packages/assets/skills/workloom-case-archived/evals/run-scenario.sh`（新文件）
- Edit: 创建以下完整脚本：

```bash
#!/bin/bash
set -euo pipefail

SCENARIO=${1:?scenario required}
CONFIG=${2:?with_skill required}
ITERATION=${3:-1}
if [[ "$CONFIG" != 'with_skill' ]]; then
  echo 'only with_skill is accepted for archived-skill acceptance' >&2
  exit 2
fi
EVAL_DIR=$(cd "$(dirname "$0")" && pwd)
SKILL_DIR=$(dirname "$EVAL_DIR")
REPO_ROOT=$(git -C "$SKILL_DIR" rev-parse --show-toplevel)
WORKTREE_ROOT=${WORKTREE_ROOT:-$REPO_ROOT}
TASK_ROOT=${TASK_ROOT:-"$REPO_ROOT/.workloom/tasks/11-03-case-archived-skill"}
case "$SCENARIO" in
  archived-plan-default-head) EVAL_INDEX=0 ;;
  archived-legacy-explicit-ref) EVAL_INDEX=1 ;;
  archived-prd-only-rebuild) EVAL_INDEX=2 ;;
  archived-select-candidate) EVAL_INDEX=3 ;;
  archived-invalid-input-fast-fail) EVAL_INDEX=4 ;;
  *) echo "unknown scenario: $SCENARIO" >&2; exit 2 ;;
esac
EVAL_NAME="eval-${EVAL_INDEX}-${SCENARIO}"
RUN_DIR="$TASK_ROOT/evals/skill-eval/iteration-$ITERATION/$EVAL_NAME/with_skill/run-1"
PROJECT="$RUN_DIR/project"
SESSION_ID="case-eval-${SCENARIO}-with_skill-${ITERATION}"
if tmux has-session -t "$SESSION_ID" 2>/dev/null; then
  echo "tmux session already exists: $SESSION_ID" >&2
  exit 2
fi
if [[ -e "$RUN_DIR" ]]; then
  echo "run directory already exists: $RUN_DIR" >&2
  exit 2
fi
mkdir -p "$RUN_DIR"
node "$EVAL_DIR/build-fixtures.mjs" "$SCENARIO" "$PROJECT" "$SESSION_ID"
BASE_REF=$(git -C "$PROJECT" rev-parse HEAD~1)
ARGS=(
  --session-id "$SESSION_ID"
  --session-dir "$PROJECT/.pi/sessions"
  --no-context-files
  -e "$WORKTREE_ROOT/packages/adapter-pi/src/index.ts"
  --model minimax-cn/MiniMax-M3.1-Flash
  --skill "$SKILL_DIR"
)
PI_PATH=$(command -v pi)
printf -v PI_ARGS '%q ' "${ARGS[@]}"
tmux new-session -d -s "$SESSION_ID" -c "$PROJECT" "PI_BIN=$PI_PATH pi $PI_ARGS"
ready=false
for _ in {1..60}; do
  pane=$(tmux capture-pane -p -t "$SESSION_ID")
  if [[ "$pane" == *'MiniMax-M3.1-Flash'* ]]; then ready=true; break; fi
  sleep 1
done
if [[ "$ready" != 'true' ]]; then
  echo 'Pi TUI did not become ready' >&2
  exit 1
fi
mkdir -p "$RUN_DIR/outputs"
previous=''
for _ in {1..60}; do
  current=$(tmux capture-pane -p -t "$SESSION_ID")
  if [[ -n "$current" && "$current" == "$previous" ]]; then
    printf '%s\n' "$current" > "$RUN_DIR/outputs/initial.txt"
    break
  fi
  previous="$current"
  sleep 2
done
if [[ ! -s "$RUN_DIR/outputs/initial.txt" ]]; then
  echo 'no stable initial pane output' >&2
  exit 1
fi
export EVALS="$EVAL_DIR/evals.json" SCENARIO="$SCENARIO" PROJECT="$PROJECT" BASE_REF
PROMPT=$(node -e '
  const fs = require("fs")
  const doc = JSON.parse(fs.readFileSync(process.env.EVALS, "utf8"))
  const item = doc.evals.find((entry) => entry.id === process.env.SCENARIO)
  if (!item) throw new Error("unknown scenario")
  process.stdout.write(item.prompt.replaceAll("<fixture-project>", process.env.PROJECT).replaceAll("<base-ref>", process.env.BASE_REF))
')
if [[ -z "$PROMPT" ]]; then
  echo 'empty evaluation prompt' >&2
  exit 2
fi
tmux send-keys -t "$SESSION_ID" "$PROMPT" Enter
export RUN_DIR SESSION_ID SCENARIO CONFIG WORKTREE_ROOT EVAL_INDEX EVAL_NAME BASE_REF
node -e '
  const fs = require("fs")
  fs.writeFileSync(`${process.env.RUN_DIR}/run.json`, `${JSON.stringify({
    scenario: process.env.SCENARIO,
    evalId: Number(process.env.EVAL_INDEX),
    evalName: process.env.EVAL_NAME,
    configuration: process.env.CONFIG,
    sessionId: process.env.SESSION_ID,
    model: "minimax-cn/MiniMax-M3.1-Flash",
    worktree: process.env.WORKTREE_ROOT,
    requestedRef: process.env.SCENARIO === "archived-legacy-explicit-ref" ? process.env.BASE_REF : null,
    status: "running",
    startedAt: new Date().toISOString(),
  }, null, 2)}\n`)
'
printf 'session=%s\nrun_dir=%s\n' "$SESSION_ID" "$RUN_DIR"
```

- Verify: `bash -n packages/assets/skills/workloom-case-archived/evals/run-scenario.sh`；without_skill 与未知场景 exit 2，run 目录已存在时不覆盖。

#### 步骤 6.2 创建 finalize-run.mjs

- Covers: AC10
- Target: `packages/assets/skills/workloom-case-archived/evals/finalize-run.mjs`（新文件）
- Edit: 创建以下完整脚本：

```js
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const runDir = process.argv[2]
if (!runDir) throw new Error('usage: node finalize-run.mjs <run-dir>')
const runFile = path.join(runDir, 'run.json')
const run = JSON.parse(fs.readFileSync(runFile, 'utf8'))
const project = path.join(runDir, 'project')

function listJsonl(dir) {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name)
    if (entry.isDirectory()) return listJsonl(file)
    return entry.isFile() && entry.name.endsWith('.jsonl') ? [file] : []
  })
}

const sessionFiles = listJsonl(path.join(project, '.pi', 'sessions')).concat(
  listJsonl(path.join(project, '.workloom', 'sessions', 'pi')),
)
let totalTokens = 0
let latest = 0
for (const file of sessionFiles) {
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue
    const entry = JSON.parse(line)
    const usage = entry.message?.usage
    if (usage && Number.isFinite(usage.totalTokens)) totalTokens += usage.totalTokens
    const timestamp = Date.parse(entry.timestamp ?? entry.message?.timestamp ?? '')
    if (Number.isFinite(timestamp)) latest = Math.max(latest, timestamp)
  }
}
run.projectHead = execFileSync('git', ['-C', project, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
run.status = 'completed'
run.completedAt = new Date().toISOString()
fs.writeFileSync(runFile, `${JSON.stringify(run, null, 2)}\n`)
const timing = {
  total_duration_seconds: Math.max(0, (latest - Date.parse(run.startedAt)) / 1000),
  total_tokens: totalTokens,
  token_note: 'Sum of per-response usage values; not unique content tokens and not a pass/fail metric.',
  session_files: sessionFiles,
}
fs.writeFileSync(path.join(runDir, 'timing.json'), `${JSON.stringify(timing, null, 2)}\n`)
const gitDir = fs.realpathSync(path.join(project, '.git'))
if (gitDir !== path.join(fs.realpathSync(project), '.git')) throw new Error(`unexpected nested git dir: ${gitDir}`)
console.log(`removing generated git metadata: ${gitDir}`)
fs.rmSync(gitDir, { recursive: true, force: true })
console.log(JSON.stringify({ status: run.status, projectHead: run.projectHead, timing }, null, 2))
```

- Verify: `node --check packages/assets/skills/workloom-case-archived/evals/finalize-run.mjs`；run.json 保留 projectHead，timing 为真实正数，嵌套 `.git` 被移除而普通证据文件保留。

### 阶段 7：真实五场景验收与审阅

#### 步骤 7.1 MiniMax 与独立批准预检

- Covers: AC10
- Target: 当前任务 `case-evidence/eval-preflight.txt`（验证证据）
- Edit: 使用顶层 Pi TUI、MiniMax 与当前任务 worktree extension。新建专用 tmux 会话和显式 session-dir，发送 `Reply with exactly: OK`；轮询 JSONL，只接受 `role=assistant` 且 trim 后恰为 `OK` 的消息，不匹配用户输入。预检失败时停止，不启动正式 run。

```bash
PREFLIGHT=case-archived-preflight
REPO=/data00/home/wangyubo.1219/workbench/code-src/github/workloom
SESSION_ROOT=/tmp/workloom-archived-preflight
mkdir -p "$SESSION_ROOT/sessions" .workloom/tasks/11-03-case-archived-skill/case-evidence
WT="$REPO/.workloom/worktree/11-03-case-archived-skill"
tmux new-session -d -s "$PREFLIGHT" -c /tmp "PI_BIN=$(command -v pi) pi --session-id case-archived-preflight --session-dir $SESSION_ROOT/sessions --no-context-files --no-skills -e $WT/packages/adapter-pi/src/index.ts --model minimax-cn/MiniMax-M3.1-Flash"
# 等 TUI 模型栏出现后发送提示，再读取 SESSION_ROOT/sessions/*.jsonl 验证 assistant OK。
```

- Verify: 证据含真实 assistant OK 与 MiniMax 模型，不含 MISSING_CREDENTIAL/503；预检会话关闭。

#### 步骤 7.2 串行执行五个带技能场景

- Covers: AC1–AC7, AC10
- Target: `.workloom/tasks/11-03-case-archived-skill/evals/skill-eval/iteration-1/`（真实运行产物）
- Edit: 对每个场景执行一次。先定义 `REPO=/data00/home/wangyubo.1219/workbench/code-src/github/workloom`、`WT="$REPO/.workloom/worktree/11-03-case-archived-skill"`、`TASK="$REPO/.workloom/tasks/11-03-case-archived-skill"`，再运行：

```bash
WORKTREE_ROOT="$WT" TASK_ROOT="$TASK" \
  bash packages/assets/skills/workloom-case-archived/evals/run-scenario.sh <scenario> with_skill 1
```

| 顺序 | scenario | 用户交互 |
| --- | --- | --- |
| 1 | archived-plan-default-head | 独立批准新 PRD/PLAN 后启动；独立批准当前 caseHash 后执行；只归档新任务。 |
| 2 | archived-legacy-explicit-ref | 批准指定 ref 的本地分支与新 PLAN；批准后执行；不归档原件。 |
| 3 | archived-prd-only-rebuild | 批准明确标注 PRD-only 的新 PRD/PLAN；批准后执行。 |
| 4 | archived-select-candidate | 只验证候选列表；发送选择消息后仅记录选择并结束本场景，不进入重建，不创建任务或分支。 |
| 5 | archived-invalid-input-fast-fail | 外部路径与不存在 ref 均失败，不发送批准，不创建任务。 |

- Edit: 每个 run 结束后用稳定非空捕获写 outputs/final.txt，再运行 `node packages/assets/skills/workloom-case-archived/evals/finalize-run.mjs <run-dir>` 并关闭对应 tmux 会话。前三个场景保存 startup-approval.txt 与 case-approval.txt；D 保存 candidates.txt；E 保存 invalid-input.txt。
- Verify: 五个 run 均为 completed 或 E 的预期失败记录；无 without_skill，无 run-2；原件清单逐字节一致，新增任务只在批准后启动。

#### 步骤 7.3 元数据、评分、benchmark 与静态页

- Covers: AC10
- Target: 当前任务 `evals/skill-eval/iteration-1/` 下的 eval_metadata、grading、benchmark、reviewer.html 与 feedback.json
- Edit: 为每个 run 的 eval 目录与 with_skill 配置目录写相同 eval_metadata.json：整数 eval_id、eval_name、当前 evals.json 的 prompt/assertions、skill_path、MiniMax executor、主会话 analyzer、runs_per_configuration=1、真实 run_1 与 notes。notes 说明只验收带技能、每个场景一次、token 是各次响应用量之和且不作为通过指标。
- Edit: 主会话先按检查项评分，再让 review executor 复核。每个 grading.json 使用 `expectations: [{text, passed, evidence}]` 与 `summary: {passed, failed, total, pass_rate}`；证据必须指向真实文件或原始 transcript，不能用自述代替。评分未通过项如实保留，不隐藏。
- Verify: 运行：

```bash
python3 /data00/home/wangyubo.1219/.agents/skills/skill-creator/scripts/aggregate_benchmark.py \
  .workloom/tasks/11-03-case-archived-skill/evals/skill-eval/iteration-1 \
  --skill-name workloom-case-archived \
  --skill-path packages/assets/skills/workloom-case-archived
python3 /data00/home/wangyubo.1219/.agents/skills/skill-creator/eval-viewer/generate_review.py \
  .workloom/tasks/11-03-case-archived-skill/evals/skill-eval/iteration-1 \
  --skill-name workloom-case-archived \
  --benchmark .workloom/tasks/11-03-case-archived-skill/evals/skill-eval/iteration-1/benchmark.json \
  --static .workloom/tasks/11-03-case-archived-skill/evals/skill-eval/iteration-1/reviewer.html
```

- Edit: 把聚合默认值改为真实模型、runs_per_configuration=1 和 notes；页面只含五个 with_skill。提交用户审阅；用户要求时用 live-server 监听 0.0.0.0 并提供主机 IP URL，审阅后关闭。feedback.json 记录用户原文与处置。
- Verify: benchmark 恰 5 条 with_skill，页面无占位模型/runs=3/without_skill 评分项；反馈已处理或记录，未处理反馈不得进入最终检查。

### 阶段 8：最终验证与归档

#### 步骤 8.1 全量验证

- Covers: AC8, AC11
- Target: 本任务修改的技能、脚本、测试与构建产物
- Edit: 无；依次运行：

```bash
pnpm lint
pnpm -r typecheck
pnpm -r build
cd packages/core && node --test test/*.test.js
cd packages/adapter-dsh && node --test test/*.test.js
cd packages/adapter-pi && bun test test/*.test.ts
cd packages/assets && node --test test/*.test.js
cd packages/assets && node --test skills/workloom-case-archived/scripts/archived-tasks.test.mjs
```

- Edit: 对修改过的 TS 文件使用 LSP diagnostics；worktree 不支持时用 tsc 命令行兜底。重建两次并比较 dist 清单，DSH dist 与 src 同提交，Pi skills 构建副本不入库。
- Verify: 全部 exit 0；没有新增 lint/TS 问题，五个真实场景与 reviewer.html 不受构建影响。

#### 步骤 8.2 提交、独立归档与日志

- Covers: AC2, AC11
- Target: 本任务代码、技能资产、测试、dist 与真实评测材料
- Edit: 主会话提交 `feat(skill): 增加归档任务 CASE 重建技能`，再按 workloom-finish 归档并记录日志。原件清单必须再次逐字节一致；禁止 push。
- Verify: `git status` 无本任务遗留代码，归档目录包含技能、五组验收、CASE/RESULT、覆盖率、反馈和普通文件证据，不包含嵌套 `.git` 子仓库。




