# 新增 workloom-case-active 技能 — plan

按 test-first 红绿推进。需求以 [prd.md](prd.md) 的 R1–R19 / AC1–AC14 为准。实现前读取 implement.jsonl 的规范与两份研究。代码命令在任务 worktree 执行，任务材料、真实评测与证据写主仓 `.workloom`。改前片段必须唯一命中，失配即停止并上报。

## Design decisions

1. **只编排既有能力**：新增一个 SKILL.md、一个任务指纹脚本、评测定义和注册项；不新增 core 工具、命令或 CASE 解析副本。
2. **指纹独立可测**：`task-fingerprint.mjs` 对 HEAD、binary diff 与排序后的 untracked 文件内容取 SHA-256。RESULT 的 codeBaseline 追加 `codeFingerprint=<hex>`；缺指纹或不一致就重新执行。
3. **技能状态机显式化**：入口分流 → 材料检查 → CASE 设计/审核 → 单任务或整批确认 → 按实施状态等待或执行 → check → commit/archive。planning 不经 continue 进入技能。
4. **整批一次确认**：确认包同时聊天展示并写 `.workloom/workspace/case-batches/<batch-id>.md`。同一批次的 confirm 摘要引用该文件；blocked/P0/P1 停止后续执行。
5. **真实对比不伪装**：五个场景均在顶层 Pi TUI 中使用 MiniMax，每配置一次。技能组用 `--skill`，基线组用 `--no-skills`；两阶段批准通过同一 durable session 完成。基线污染按研究记录写入备注，不把两组都受主流程影响的结果宣称为独立功能差异。
6. **产物可审阅**：evals.json 随技能入库；真实运行、评分、计时、benchmark、reviewer.html 和 feedback.json 随任务归档。反馈由主会话根据用户会话回复写入。
7. **测试边界**：指纹脚本测试文件保护 HEAD/tracked/untracked/deleted；adapter 测试保护清单、技能文本和构建副本。真实行为由五组顶层场景覆盖，不为低价值文本格式另建测试文件。

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

- Covers: AC2, AC3
- Target: 当前任务 `case.md`（由 check executor 生成）
- Edit: 主会话在首个实施派发同时派发 `kind=check`、`purpose=case-design`。check 按 PRD、PLAN 与固定模板设计 CASE，主会话审核并继续原会话修订；用户确认前不执行。当前 profile 未加载新 purpose 时，记录该部署限制，并用新源码测试和真机结果证明行为。
- Verify: 当前任务 CASE review 返回 readyToConfirm=true，确认前没有 case-result.md。

#### 步骤 0.3 PLAN 独立审查与启动审阅包

- Covers: AC10
- Target: 当前任务 `plan.md`、`plan-review.md`
- Edit: 主会话派发 review executor，逐项核对 AC 映射、真实锚点、新文件完整内容与验证命令；所有 P0/P1/P2 修复后，向用户提交 PRD、PLAN、研究、上下文和审查处置记录。
- Verify: 三轮内没有未处置 P0/P1/P2；AC1–AC14 在 Covers 中均出现，用户确认后任务才启动。

### 阶段 1（红→绿）：代码指纹脚本

#### 步骤 1.1 先写指纹公开测试

- Covers: AC13
- Target: `packages/assets/skills/workloom-case-active/scripts/task-fingerprint.test.mjs`（新文件）
- Edit: 创建完整测试文件：

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { computeTaskFingerprint } from './task-fingerprint.mjs'

function git(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

function makeRoot() {
  const root = mkdtempSync(join(tmpdir(), 'workloom-case-fingerprint-'))
  git(root, ['init'])
  writeFileSync(join(root, 'tracked.txt'), 'one\n')
  git(root, ['add', 'tracked.txt'])
  git(root, ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'init'])
  return root
}

test('同一 HEAD 与文件内容产生稳定 SHA-256，HEAD/tracked/untracked/deleted 均有影响', () => {
  const root = makeRoot()
  try {
    const initial = computeTaskFingerprint(root)
    assert.match(initial, /^[a-f0-9]{64}$/)
    assert.equal(computeTaskFingerprint(root), initial)

    mkdirSync(join(root, '.workloom/tasks/demo'), { recursive: true })
    writeFileSync(join(root, '.workloom/tasks/demo/case.md'), '# metadata only\n')
    assert.equal(computeTaskFingerprint(root), initial)

    writeFileSync(join(root, 'tracked.txt'), 'two\n')
    assert.notEqual(computeTaskFingerprint(root), initial)
    git(root, ['checkout', '--', 'tracked.txt'])

    writeFileSync(join(root, 'untracked.txt'), 'new\n')
    assert.notEqual(computeTaskFingerprint(root), initial)
    rmSync(join(root, 'untracked.txt'))
    assert.equal(computeTaskFingerprint(root), initial)

    writeFileSync(join(root, 'tracked.txt'), 'two\n')
    git(root, ['add', 'tracked.txt'])
    git(root, ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'second'])
    assert.notEqual(computeTaskFingerprint(root), initial)

    rmSync(join(root, 'tracked.txt'))
    assert.notEqual(computeTaskFingerprint(root), initial)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('CLI 输出 codeFingerprint 与函数值一致', () => {
  const root = makeRoot()
  try {
    const script = fileURLToPath(new URL('task-fingerprint.mjs', import.meta.url))
    const output = execFileSync(process.execPath, [script, root], { encoding: 'utf8' }).trim()
    assert.equal(output, `codeFingerprint=${computeTaskFingerprint(root)}`)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
```

- Edit: 测试顶部导入已包含 mkdirSync 与 fileURLToPath；不得依赖实施者补漏。
- Verify: `cd packages/assets && node --test skills/workloom-case-active/scripts/task-fingerprint.test.mjs`；预期因 task-fingerprint.mjs 不存在而失败。

#### 步骤 1.2 实现指纹脚本

- Covers: AC13
- Target: `packages/assets/skills/workloom-case-active/scripts/task-fingerprint.mjs`（新文件）
- Edit: 创建完整文件：

```js
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const GIT_BIN = 'git'
const ENCODING = 'utf8'
const DIFF_ARGS = Object.freeze(['diff', '--binary', '--no-renames', 'HEAD', '--', '.', ':(exclude).workloom/**', ':(exclude).pi/**'])
const UNTRACKED_ARGS = Object.freeze(['ls-files', '--others', '--exclude-standard', '--', '.', ':(exclude).workloom/**', ':(exclude).pi/**'])

function git(root, args) {
  return execFileSync(GIT_BIN, args, { cwd: root, encoding: ENCODING, stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

/** 计算任务代码指纹：HEAD、全部 tracked diff 与排序后的 untracked 内容共同参与。 */
export function computeTaskFingerprint(root) {
  const head = git(root, ['rev-parse', 'HEAD'])
  const diff = git(root, [...DIFF_ARGS])
  const untracked = git(root, [...UNTRACKED_ARGS]).split('\n').filter(Boolean).sort()
  const hash = createHash('sha256')
  hash.update(`HEAD\0${head}\0DIFF\0${diff}\0UNTRACKED\0`)
  for (const file of untracked) {
    hash.update(`${file}\0`)
    hash.update(readFileSync(join(root, file)))
    hash.update('\0')
  }
  return hash.digest('hex')
}

const entry = process.argv[1] === undefined ? null : pathToFileURL(resolve(process.argv[1])).href
if (entry !== null && entry === import.meta.url) {
  const root = process.argv[2]
  if (root === undefined) throw new Error('usage: node task-fingerprint.mjs <git-worktree-root>')
  console.log(`codeFingerprint=${computeTaskFingerprint(root)}`)
}
```

- Verify: 重跑步骤 1.1 命令；两个测试全绿，且临时目录均清理。

### 阶段 2（红→绿）：双 adapter 注册

#### 步骤 2.1 先把清单测试改为包含 case-active

- Covers: AC1, AC6, AC9
- Target: `packages/adapter-dsh/test/skills.test.js`、`packages/adapter-pi/test/skills.test.ts` —— 技能名单契约
- Edit 改前（DSH）：

```js
  assert.deepEqual(names.sort(), [
    'grilling',
    'tdd',
    'workloom-alignment',
    'workloom-continue',
    'workloom-finish',
    'workloom-migrate-plan',
    'workloom-packages-scan',
    'workloom-update-spec',
    'writing-for-agents',
  ])
```

- Edit 改后（DSH）：

```js
  assert.deepEqual(names.sort(), [
    'grilling',
    'tdd',
    'workloom-alignment',
    'workloom-case-active',
    'workloom-continue',
    'workloom-finish',
    'workloom-migrate-plan',
    'workloom-packages-scan',
    'workloom-update-spec',
    'writing-for-agents',
  ])
```

- Edit 改前（Pi）：

```ts
  assert.deepEqual(entries, [
    'grilling',
    'tdd',
    'workloom-alignment',
    'workloom-continue',
    'workloom-finish',
    'workloom-migrate-plan',
    'workloom-packages-scan',
    'workloom-update-spec',
    'writing-for-agents',
  ])
```

- Edit 改后（Pi）：

```ts
  assert.deepEqual(entries, [
    'grilling',
    'tdd',
    'workloom-alignment',
    'workloom-case-active',
    'workloom-continue',
    'workloom-finish',
    'workloom-migrate-plan',
    'workloom-packages-scan',
    'workloom-update-spec',
    'writing-for-agents',
  ])
```

- Edit: 在 DSH `skills.test.js` 的 `test('workloom-migrate-plan 资产可解析...` 前插入以下测试。该测试在技能资产与 evals 缺失时先红，步骤 3.1/4.1 后转绿：

```js
test('workloom-case-active 资产与五组 eval：状态约束、整批确认、指纹和英文断言', () => {
  const doc = readFileSync(
    new URL('../../assets/skills/workloom-case-active/SKILL.md', import.meta.url),
    'utf8',
  )
  const [err, parsed] = parseSkillFrontmatter(doc)
  assert.equal(err, null)
  assert.equal(parsed.name, 'workloom-case-active')
  assert.match(parsed.description, /planning/)
  assert.match(parsed.body, /mode: "light"/)
  assert.match(parsed.body, /completed/)
  assert.match(parsed.body, /archive/)
  assert.match(parsed.body, /Phase 1\.4/)
  assert.match(parsed.body, /case-batches/)
  assert.match(parsed.body, /codeFingerprint/)
  assert.match(parsed.body, /purpose: case-design/)
  assert.match(parsed.body, /fallbackOf/)
  const evals = JSON.parse(readFileSync(
    new URL('../../assets/skills/workloom-case-active/evals/evals.json', import.meta.url),
    'utf8',
  ))
  assert.equal(evals.skill_name, 'workloom-case-active')
  assert.deepEqual(evals.evals.map((item) => item.id), [
    'planning-defers-execution',
    'ready-executes-and-revalidates-fingerprint',
    'legacy-migrates-and-executes',
    'batch-one-confirmation',
    'blocked-stops-batch',
  ])
  for (const item of evals.evals) {
    assert.equal(typeof item.name, 'string')
    assert.ok(item.assertions.length > 0)
    assert.ok(!/[\u3400-\u9fff]/.test(item.prompt))
    assert.ok(!/[\u3400-\u9fff]/.test(item.assertions.join('\n')))
  }
})
```

- Edit: 同步 DSH 测试标题为「skill 清单契约：注册 case-active/continue/finish/alignment/update-spec/packages-scan/migrate-plan + generic tdd/grilling/writing-for-agents，不含旧两个 workloom skill」；Pi 文件头注释与清单测试标题同步包含 case-active。两处只改文本，不改变测试语义。
- Verify: 未注册时 DSH/Pi 清单测试均失败，差异仅为缺少 workloom-case-active；新增内容与 eval 测试也因文件缺失先红。

#### 步骤 2.2 注册并同步技能目录

- Covers: AC1, AC6, AC9
- Target: `packages/adapter-dsh/src/skills.ts` —— `SKILL_ASSETS`；`packages/adapter-pi/scripts/sync-skills.mjs` —— `SKILL_SOURCES`
- Edit 改前（DSH）：

```ts
  'skills/workloom-alignment/SKILL.md',
  'skills/workloom-update-spec/SKILL.md',
```

- Edit 改后（DSH）：

```ts
  'skills/workloom-alignment/SKILL.md',
  'skills/workloom-case-active/SKILL.md',
  'skills/workloom-update-spec/SKILL.md',
```

- Edit 改前（Pi）：

```js
  '../assets/skills/workloom-alignment',
  '../assets/skills/workloom-update-spec',
```

- Edit 改后（Pi）：

```js
  '../assets/skills/workloom-alignment',
  '../assets/skills/workloom-case-active',
  '../assets/skills/workloom-update-spec',
```

- Edit: 两个文件的头部注释同步补充 case-active（未归档任务 CASE 补写与整批确认）；不增加硬编码总数，不新增命令，workflow version 25 不变。
- Verify: `pnpm -r build` 后重跑步骤 2.1 两组测试；全部通过，Pi 产物目录恰含新增技能。

### 阶段 3：技能正文

#### 步骤 3.1 创建 workloom-case-active SKILL.md

- Covers: AC1, AC2, AC3, AC4, AC5, AC7, AC11, AC12
- Target: `packages/assets/skills/workloom-case-active/SKILL.md`（新文件）
- Edit: 创建以下完整英文资产；front-matter 仅含 name/description/whenToUse，正文不复制固定模板或 core 校验代码。

```markdown
---
name: workloom-case-active
description: Design or complete case.md for an active, planning, or in_progress full task, then execute it after implementation is ready. Use when the user asks to add, rebuild, review, batch-confirm, or execute CASE artifacts for non-archived tasks; also use for legacy in_progress tasks without a case record. Do not use for light, completed, or archived tasks.
whenToUse: Use on planning/in_progress full tasks that need CASE design, completion, confirmation, execution, or batch processing; route archived work to workloom-case-archived instead.
---

# Workloom Case Active

Supplement CASE artifacts for non-archived full tasks without replacing the normal workflow. The main session orchestrates; a check executor designs and executes CASE. Keep one active task at a time and preserve the user's confirmed caseHash.

## Boundaries

- Accept only `planning` or `in_progress` tasks with `mode: "full"`.
- Reject tasks with `mode: "light"`; they keep their normal self-check. A completed task under `tasks/archive/` belongs to `workloom-case-archived`; reject it here.
- A planning task still authors and reviews plan.md through Phase 1.4. If legacy design.md + implement.md exist without plan.md, load `workloom-migrate-plan` first and re-confirm any stale PRD credential. If only PRD exists, stop and return to normal planning; do not invent a PLAN inside this skill.
- Never add a slash command, duplicate the CASE/RESULT templates, or reimplement the core CASE gates.
- Use English for this shipped asset and evaluation assertions. Write task CASE/RESULT content in the project's language.

## Step 1: Select and inspect

1. With an active task, inspect that task. With no active task, call `workloom_task_list` for planning and in_progress, then inspect each full task. Exclude completed/archive/light tasks. Order candidates by `createdAt`, then task path.
2. Read prd.md, plan.md, task.json, check.jsonl, and existing case.md/case-result.md when present. Inspect the current worktree from task.json; do not infer implementation readiness from file presence alone.
3. Run `node <skill-resource>/scripts/task-fingerprint.mjs <worktree-root>` for the code fingerprint. The worktree root is task.worktree_path when set, otherwise the project root.

## Step 2: Reuse valid evidence or design CASE

1. Reuse an existing passed result only when all of these hold: `case.required=true`; the current case.md hash equals `case.caseHash`; the RESULT's caseHash matches it; `case.result.resultHash` equals the current case-result.md hash; check is recorded; and the RESULT codeBaseline contains `codeFingerprint=<64-hex>` equal to the current fingerprint. Compute the current RESULT hash with `node --input-type=module -e "import { readFileSync } from 'node:fs'; import { computeCaseHash } from '@workloom-ai/core'; console.log(computeCaseHash(readFileSync('<case-result-path>', 'utf8')))"`, which uses the same CRLF/CR→LF plus SHA-256 rule as core. Run this from the workloom repository root (or another directory where `@workloom-ai/core` resolves), passing an absolute case-result path when the target is elsewhere. Return the existing evidence and do not create a new session.
2. Otherwise dispatch `workloom_execute` with `kind: check`, `purpose: case-design`, a semantic title, and a prompt to create or revise case.md from the current PRD, PLAN, real code, and canonical assets. Never pass model or effort on a continuation.
3. If `case.designSession` exists, continue that session for review revisions. If it is absent, start the design dispatch and record the resulting child id. For an old task with `case: null`, the design dispatch may create a non-required case record; confirm must promote it to `required: true`.
4. The canonical adapter injection supplies the current CASE and the template bodies on full injection. If they are missing, report an asset defect; do not paste a replacement template into the skill.

## Step 3: Review and confirm

1. Run `workloom_task_case` with `action: review`. The main session reviews the CASE against PRD, PLAN, real code, actual git changes, and the coverage scope.
2. Continue the same design session with concrete changes for every problem. Re-run review until `readyToConfirm=true`.
3. For one task, present the snapshot and hash to the user. Call `action: confirm` only after explicit approval of that exact hash.
4. For a batch, collect every ready task's path, snapshot, and hash into one user review package. Write `.workloom/workspace/case-batches/<batch-id>.md` with the same paths/hashes, the approval time, and initial execution states. One user approval may cover the entire listed package; confirm each task separately with a summary referencing this batch file, and store that exact summary value in the task's batch-file entry. Exclude and report any non-ready CASE instead of adding it to the package.
5. Never treat a CASE confirm call as permission to skip user review. A CASE edit after approval requires a new review and approval.

## Step 4: Wait for readiness or execute

1. Planning tasks and in_progress tasks whose implementation is still running stop after CASE confirmation. Leave the task in its current status and create no execution result.
2. Treat implementation as ready only when the latest implement/frontend dispatches report completion and the main session confirms no implementation work remains. If this cannot be established, defer execution.
3. For a ready task, continue `case.designSession` with `kind: check`, `purpose: execution`, and the confirmed caseHash. The check executor completes every SR item, then C1 through Cn in order, collects real coverage, and writes case-result.md, case-evidence/, and coverage/ without changing the confirmed CASE.
4. The result must use `codeFingerprint=<current-hex>` inside codeBaseline. A missing or mismatched fingerprint makes the result stale; rerun it before reuse or check.
5. P2 fixes follow the existing check discipline and trigger a full SR/C/coverage rerun. Report P0/P1 to the main session. Never force a core CASE failure.

## Step 5: Record and continue

1. Record a valid result with `workloom_task_check`. Every SR/C must be passed, standard verification must pass, coverage must be generated or validly not_applicable, and Open issues must be `- none`.
2. Follow the full task's 2.4 Commit and 3.1 Archive steps after a pass. Keep code commits on the task branch and bookkeeping in the main repository. Do not commit or push unrelated work.
3. For a batch, process tasks serially in the confirmed order and update the batch file after each execution. On the first P0/P1 or blocked result, stop later execution and report completed, failed, and untouched tasks.
4. On a model-access failure, preserve the existing child and purpose records. Use the configured failover mechanism when available; a replacement execution session must have a recorded fallbackOf chain back to case.designSession.

## Completion criteria

The selected full task has a reviewed and user-confirmed CASE, execution is correctly deferred or fully recorded, real coverage and evidence exist for the final code, and the normal check/commit/archive path can continue. Batch tasks also have a persistent confirmation file with final per-task states.
```

- Verify: `cd packages/adapter-dsh && node --test test/skills.test.js`；新增资产可解析，name/description 完整，关键状态与工具约束均命中，旧 continue planning 路由不变。

### 阶段 4：五组真实评测定义

#### 步骤 4.1 创建 evals.json

- Covers: AC8, AC11, AC14
- Target: `packages/assets/skills/workloom-case-active/evals/evals.json`（新文件）
- Edit: 创建以下完整定义。提示词为英文，断言使用可观察状态与真实文件，不把模型自述当作通过依据。`<fixture-project>` 由执行步骤替换为场景夹具绝对路径。

```json
{
  "skill_name": "workloom-case-active",
  "description": "Five real top-level CASE lifecycle scenarios with and without the active-task supplement skill.",
  "evals": [
    {
      "id": "planning-defers-execution",
      "name": "Planning defers execution",
      "prompt": "Work in <fixture-project>. Design, review, and confirm CASE for the planning full task. Produce and review a valid CASE, then stop. Do not implement code. Report the task path, caseHash, status, and whether any result exists.",
      "expected_output": "A valid confirmed CASE for the planning task, no execution result, and status remains planning.",
      "assertions": [
        "case.md passes workloom_task_case review before confirmation.",
        "The confirmed caseHash matches the current CASE bytes.",
        "The task remains planning and no case-result.md exists.",
        "No implementation file is created or modified.",
        "A real check executor is dispatched with purpose=case-design and a recorded case.designSession.",
        "The transcript waits for explicit user approval before calling confirm."
      ],
      "files": []
    },
    {
      "id": "ready-executes-and-revalidates-fingerprint",
      "name": "Ready execution and fingerprint revalidation",
      "prompt": "Work in <fixture-project>. Design, confirm, and execute CASE for the in_progress full task whose implement report is complete. Review, confirm, execute its CASE, and record real coverage. Then repeat the same CASE request without changing code. Finally change an untracked source file and repeat it again. After that, make a small CASE edit without re-confirming and show that execution waits for a new review and approval. Save this phase as outputs/case-edit.txt. Report fingerprints and session ids.",
      "expected_output": "A fully executed CASE, a no-op second run with unchanged fingerprint, a fresh execution after the untracked file changes, and no execution after an unapproved CASE edit.",
      "assertions": [
        "case-result.md records passed SR/C items, real coverage, and codeFingerprint=<64-hex>.",
        "The second run reuses the valid result and creates no new child session.",
        "Changing an untracked source file changes the fingerprint and triggers re-execution.",
        "Editing case.md changes the review hash and prevents a new execution dispatch until fresh approval.",
        "The final check and case.result match the current RESULT bytes."
      ],
      "files": []
    },
    {
      "id": "legacy-migrates-and-executes",
      "name": "Legacy migration and execution",
      "prompt": "Work in <fixture-project>. Design and execute CASE on the in_progress legacy full task with no case field and design.md + implement.md. Migrate the plan first if required, then design, confirm, execute CASE, and record real evidence. Report the old and new case records.",
      "expected_output": "The legacy task gains a valid plan when needed, a confirmed CASE, required=true, and a valid result with a linked execution session.",
      "assertions": [
        "Legacy design.md + implement.md are handled by workloom-migrate-plan before CASE design when plan.md is absent.",
        "Confirm changes case.required to true without deleting legacy audit fields.",
        "case-result.md checkSession equals designSession or is connected by a valid fallbackOf chain.",
        "Real CASE evidence and coverage or a justified not_applicable result exist."
      ],
      "files": []
    },
    {
      "id": "batch-one-confirmation",
      "name": "Batch uses one confirmation",
      "prompt": "Work in <fixture-project>. With no active task, process CASE for every eligible candidate. Review all CASE artifacts, present one batch approval request, then confirm and execute them serially after approval. Report the batch file and per-task states.",
      "expected_output": "One batch file contains both task paths and distinct caseHash values; one user approval covers both, and execution follows the listed order.",
      "assertions": [
        ".workloom/workspace/case-batches/<batch-id>.md contains both task paths, distinct hashes, approval time, and execution states.",
        "One approval covers the listed batch; each confirm uses its own current hash.",
        "Execution is serial and preserves one active task at a time.",
        "Any non-ready CASE is excluded from the batch and reported.",
        "Light, completed, archived, and non-ready candidate directories remain byte-identical."
      ],
      "files": []
    },
    {
      "id": "blocked-stops-batch",
      "name": "Blocked case stops the batch",
      "prompt": "Work in <fixture-project>. Process CASE for the batch whose first task has a blocked runtime case. Review and obtain one batch approval, then execute. Report completed, blocked, and untouched tasks and update the batch file.",
      "expected_output": "The first task is blocked, later tasks are not executed, and the batch file records those exact states without a pass credential.",
      "assertions": [
        "The blocked C item prevents a check pass and cannot be bypassed with force.",
        "No later task starts CASE execution after the blocked first result.",
        "The batch file lists completed, blocked, and untouched states accurately.",
        "The main report identifies the blocked task and all tasks left unexecuted."
      ],
      "files": []
    }
  ]
}
```

- Verify: `node -e "const e=require('./packages/assets/skills/workloom-case-active/evals/evals.json'); console.log(e.evals.length)"` 输出 5；每个 id 唯一且 assertions 非空，没有中文提示或断言。

### 阶段 5：可重复的真实评测夹具

#### 步骤 5.1 创建场景夹具生成器

- Covers: AC2, AC3, AC4, AC5, AC8, AC11, AC14
- Target: `packages/assets/skills/workloom-case-active/evals/build-fixtures.mjs`（新文件）
- Edit: 创建以下完整脚本。它不删除既有目录；目标已存在时直接失败。每个项目都包含真实 git HEAD、完整任务材料与可选活跃指针。

```js
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const [scenario, target, sessionId] = process.argv.slice(2)
const SCENARIOS = new Set(['planning-defers-execution', 'ready-executes-and-revalidates-fingerprint', 'legacy-migrates-and-executes', 'batch-one-confirmation', 'blocked-stops-batch'])
if (!SCENARIOS.has(scenario) || target === undefined || typeof sessionId !== 'string' || !/^[A-Za-z0-9_-]+$/.test(sessionId)) {
  throw new Error('usage: node build-fixtures.mjs <scenario> <new-target-dir> <session-id>')
}

function write(root, path, content) {
  const file = join(root, path)
  mkdirSync(join(file, '..'), { recursive: true })
  writeFileSync(file, content)
}

function prd(title, blocked) {
  const runtime = blocked
    ? 'The runtime case must require /tmp/workloom-case-missing.sock and stop as blocked when it is absent.'
    : 'The runtime case performs a deterministic local verification.'
  return `# ${title}\n\n## Goal\n\nVerify the CASE lifecycle for ${title}.\n\n## Requirements\n\n- R1: PRD and PLAN remain valid and reviewable.\n- R2: ${runtime}\n\n## Acceptance Criteria\n\n- AC1: The task materials pass structural review and retain the current alignment hash. Verification: inspect task.json and documents. Covers R1.\n- AC2: The CASE executes deterministically, or reports blocked when the required socket is absent. Verification: run the C item and inspect evidence. Covers R2.\n\n## Notes\n\n- No product source changes are required.\n\n## Alignment Decisions\n\n- This deterministic fixture is approved for evaluation.\n\n<!-- workloom:open-nodes=none -->\n`
}

function plan() {
  return '# Evaluation plan\n\n## Steps\n\n#### 步骤 1.1 verify\n\n- Covers: AC1, AC2\n- Target: task documents\n- Edit: no product code\n- Verify: execute the confirmed CASE and inspect case-result.md\n'
}

function addTask(root, options) {
  const rel = options.archive === true ? `tasks/archive/${options.slug}` : `tasks/${options.slug}`
  const dir = `.workloom/${rel}`
  const taskPrd = prd(options.slug, options.blocked === true)
  write(root, `${dir}/prd.md`, taskPrd)
  if (options.legacy === true) {
    write(root, `${dir}/design.md`, '# Legacy design\n\nUse the current PRD and preserve its two AC items.\n')
    write(root, `${dir}/implement.md`, '# Legacy implementation\n\nNo product code remains.\n')
  } else if (options.omitPlan !== true) {
    write(root, `${dir}/plan.md`, plan())
  }
  for (const name of ['implement.jsonl', 'check.jsonl']) {
    write(root, `${dir}/${name}`, '{"file":".workloom/spec/README.md","reason":"fixture verification"}\n')
  }
  if (options.ready === true) {
    write(root, `${dir}/implement-report.md`, '# Implement report\n\nCompleted; no implementation work remains.\n')
  }
  const record = {
    id: `${options.slug}-id`,
    name: options.slug,
    title: options.slug,
    description: 'deterministic CASE evaluation fixture',
    status: options.status,
    priority: 'P2',
    mode: options.mode ?? 'full',
    creator: 'eval',
    assignee: '',
    package: 'repo',
    branch: '',
    base_branch: '',
    createdAt: options.createdAt,
    completedAt: options.status === 'completed' ? options.createdAt : null,
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
    check: null,
    alignment: {
      passedAt: options.createdAt,
      summary: 'Deterministic fixture approved for evaluation.',
      prdHash: createHash('sha256').update(taskPrd.replace(/\r\n|\r/g, '\n'), 'utf8').digest('hex'),
    },
    overrides: [],
    stage: 'implement',
    dispatches: options.ready === true ? [{ kind: 'implement', at: options.createdAt, title: 'Completed fixture', status: 'completed', childId: `implement-${options.slug}` }] : [],
    hooks: { after_create: [], after_start: [], after_finish: [], after_archive: [] },
  }
  if (options.legacy !== true) {
    record.case = options.status === 'in_progress'
      ? { required: true, designSession: null, confirmedAt: null, caseHash: null, summary: null, result: null }
      : null
  }
  write(root, `${dir}/task.json`, `${JSON.stringify(record, null, 2)}\n`)
  return rel
}

mkdirSync(target)
write(target, '.workloom/config.json', '{"packages":{"repo":{"path":"."}},"worktree":{"enabled":false},"subagent_profiles":{},"subagents":{"check":{"model":"minimax-cn/MiniMax-M3.1-Flash","effort":"max","rotate_on_busy":false},"implement":{"model":"minimax-cn/MiniMax-M3.1-Flash","effort":"max","rotate_on_busy":false}}}\n')
write(target, '.workloom/spec/README.md', '# Fixture spec\n\nUse deterministic local verification.\n')
write(target, '.gitignore', '.pi/\n.workloom/.runtime/\n')
const at = '2026-01-01T00:00:00.000Z'
let active = null
if (scenario === 'planning-defers-execution') {
  active = addTask(target, { slug: 'planning-case', status: 'planning', createdAt: at })
}
if (scenario === 'ready-executes-and-revalidates-fingerprint') {
  active = addTask(target, { slug: 'ready-case', status: 'in_progress', ready: true, createdAt: at })
}
if (scenario === 'legacy-migrates-and-executes') {
  active = addTask(target, { slug: 'legacy-case', status: 'in_progress', ready: true, legacy: true, createdAt: at })
}
if (scenario === 'batch-one-confirmation') {
  addTask(target, { slug: 'batch-a', status: 'in_progress', ready: true, createdAt: at })
  addTask(target, { slug: 'batch-b', status: 'in_progress', ready: true, createdAt: '2026-01-01T00:01:00.000Z' })
  addTask(target, { slug: 'not-ready', status: 'planning', omitPlan: true, createdAt: '2026-01-01T00:02:00.000Z' })
  addTask(target, { slug: 'light-task', status: 'planning', mode: 'light', createdAt: '2026-01-01T00:03:00.000Z' })
  addTask(target, { slug: 'completed-case', status: 'completed', archive: true, createdAt: '2026-01-01T00:04:00.000Z' })
}
if (scenario === 'blocked-stops-batch') {
  addTask(target, { slug: 'blocked-a', status: 'in_progress', ready: true, blocked: true, createdAt: at })
  addTask(target, { slug: 'untouched-b', status: 'in_progress', ready: true, createdAt: '2026-01-01T00:01:00.000Z' })
  addTask(target, { slug: 'not-ready', status: 'planning', omitPlan: true, createdAt: '2026-01-01T00:02:00.000Z' })
  addTask(target, { slug: 'light-task', status: 'planning', mode: 'light', createdAt: '2026-01-01T00:03:00.000Z' })
  addTask(target, { slug: 'completed-case', status: 'completed', archive: true, createdAt: '2026-01-01T00:04:00.000Z' })
}
if (active !== null) {
  write(target, `.workloom/.runtime/sessions/pi_${sessionId}.json`, `${JSON.stringify({ current_task: active, last_seen_at: at }, null, 2)}\n`)
}
for (const args of [['init'], ['add', '.'], ['-c', 'user.name=Eval', '-c', 'user.email=eval@example.com', 'commit', '-m', 'fixture']]) {
  execFileSync('git', args, { cwd: target, stdio: 'ignore' })
}
console.log(target)
```

- Verify: `node --check packages/assets/skills/workloom-case-active/evals/build-fixtures.mjs`；随后分别生成五个临时项目，读取任务记录和 git HEAD，预期 planning/ready/legacy/batch/blocked 的初始状态与指针均正确，目标目录重复使用时直接失败而不删除。

### 阶段 6：顶层 Pi 场景启动器

#### 步骤 6.1 创建 run-scenario.sh

- Covers: AC8, AC14
- Target: `packages/assets/skills/workloom-case-active/evals/run-scenario.sh`（新文件）
- Edit: 创建以下完整脚本。它只启动一个顶层 TUI 并生成一个全新目录；既有目录或 tmux 会话存在时直接失败。

```bash
#!/bin/bash
set -euo pipefail

SCENARIO=${1:?scenario required}
CONFIG=${2:?with_skill or without_skill required}
ITERATION=${3:-1}
if [[ "$CONFIG" != 'with_skill' && "$CONFIG" != 'without_skill' ]]; then
  echo 'config must be with_skill or without_skill' >&2
  exit 2
fi

EVAL_DIR=$(cd "$(dirname "$0")" && pwd)
SKILL_DIR=$(dirname "$EVAL_DIR")
REPO_ROOT=$(git -C "$SKILL_DIR" rev-parse --show-toplevel)
WORKTREE_ROOT=${WORKTREE_ROOT:-$REPO_ROOT}
TASK_ROOT=${TASK_ROOT:-"$REPO_ROOT/.workloom/tasks/11-03-case-active-skill"}
case "$SCENARIO" in
  planning-defers-execution) EVAL_INDEX=0 ;;
  ready-executes-and-revalidates-fingerprint) EVAL_INDEX=1 ;;
  legacy-migrates-and-executes) EVAL_INDEX=2 ;;
  batch-one-confirmation) EVAL_INDEX=3 ;;
  blocked-stops-batch) EVAL_INDEX=4 ;;
  *) echo "unknown scenario: $SCENARIO" >&2; exit 2 ;;
esac
EVAL_NAME="eval-${EVAL_INDEX}-${SCENARIO}"
RUN_DIR="$TASK_ROOT/evals/skill-eval/iteration-$ITERATION/$EVAL_NAME/$CONFIG/run-1"
PROJECT="$RUN_DIR/project"
SESSION_ID="case-eval-${SCENARIO}-${CONFIG}-${ITERATION}"
if tmux has-session -t "$SESSION_ID" 2>/dev/null; then
  echo "tmux session already exists: $SESSION_ID" >&2
  exit 2
fi
mkdir -p "$RUN_DIR"
node "$EVAL_DIR/build-fixtures.mjs" "$SCENARIO" "$PROJECT" "$SESSION_ID"

ARGS=(
  --session-id "$SESSION_ID"
  --session-dir "$PROJECT/.pi/sessions"
  --no-context-files
  -e "$WORKTREE_ROOT/packages/adapter-pi/src/index.ts"
  --model minimax-cn/MiniMax-M3.1-Flash
)
if [[ "$CONFIG" == 'with_skill' ]]; then
  ARGS+=(--skill "$SKILL_DIR")
else
  ARGS+=(--no-skills)
fi
PI_PATH=$(command -v pi)
printf -v PI_ARGS '%q ' "${ARGS[@]}"
tmux new-session -d -s "$SESSION_ID" -c "$PROJECT" "PI_BIN=$PI_PATH pi $PI_ARGS"

# 等待 TUI 模型栏出现，避免启动期间丢按键。
ready=false
for _ in {1..60}; do
  pane=$(tmux capture-pane -p -t "$SESSION_ID")
  if [[ "$pane" == *'MiniMax-M3.1-Flash'* ]]; then
    ready=true
    break
  fi
  sleep 1
done
if [[ "$ready" != 'true' ]]; then
  echo 'Pi TUI did not become ready' >&2
  exit 1
fi

export EVALS="$EVAL_DIR/evals.json" SCENARIO="$SCENARIO" PROJECT="$PROJECT"
PROMPT=$(node -e '
  const fs = require("fs")
  const doc = JSON.parse(fs.readFileSync(process.env.EVALS, "utf8"))
  const item = doc.evals.find((entry) => entry.id === process.env.SCENARIO)
  if (!item) throw new Error("unknown scenario")
  process.stdout.write(item.prompt.replaceAll("<fixture-project>", process.env.PROJECT))
')
if [[ -z "$PROMPT" ]]; then
  echo 'empty evaluation prompt' >&2
  exit 2
fi
mkdir -p "$RUN_DIR/outputs"
tmux send-keys -t "$SESSION_ID" "$PROMPT" Enter
export RUN_DIR SESSION_ID SCENARIO CONFIG WORKTREE_ROOT EVAL_INDEX EVAL_NAME
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
    status: "running",
    startedAt: new Date().toISOString(),
  }, null, 2)}\n`)
'
# 连续两次相同且非空才保存，避免空屏或启动动画被当作初始证据。
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
printf 'session=%s\nrun_dir=%s\n' "$SESSION_ID" "$RUN_DIR"
```

- Verify: `bash -n packages/assets/skills/workloom-case-active/evals/run-scenario.sh`；随后用 planning 场景启动一个临时 TUI，检查项目创建、模型为 MiniMax、会话 id 与活跃指针一致，再关闭该临时会话。

### 阶段 7：真实五场景对比、评分与审阅

#### 步骤 7.0 MiniMax 真实预检

- Covers: AC8, AC14
- Target: 当前任务 `case-evidence/eval-preflight.txt`（验证证据）
- Edit: 使用与正式评测相同的顶层 Pi TUI 和模型，不采用已知缺凭据的 headless 探针。执行：

```bash
PREFLIGHT=case-eval-preflight
mkdir -p .workloom/tasks/11-03-case-active-skill/case-evidence
PI_PATH=$(command -v pi)
WT=<worktree-absolute-path>
if tmux has-session -t "$PREFLIGHT" 2>/dev/null; then
  echo 'preflight session already exists; stop and inspect it' >&2
  exit 1
fi
tmux new-session -d -s "$PREFLIGHT" -c /tmp "PI_BIN=$PI_PATH pi --no-context-files --no-skills -e $WT/packages/adapter-pi/src/index.ts --model minimax-cn/MiniMax-M3.1-Flash"
ready=false
for _ in {1..60}; do
  pane=$(tmux capture-pane -p -t "$PREFLIGHT")
  if [[ "$pane" == *'MiniMax-M3.1-Flash'* ]]; then
    ready=true
    break
  fi
  sleep 1
done
if [[ "$ready" != 'true' ]]; then
  tmux kill-session -t "$PREFLIGHT"
  echo 'Pi TUI did not become ready' >&2
  exit 1
fi
tmux send-keys -t "$PREFLIGHT" 'Reply with exactly: OK' Enter
ok=false
for _ in {1..60}; do
  pane=$(tmux capture-pane -p -t "$PREFLIGHT")
  if [[ "$pane" =~ (^|[[:space:]])OK([[:space:]]|$) ]]; then
    ok=true
    break
  fi
  sleep 1
done
tmux capture-pane -p -t "$PREFLIGHT" > .workloom/tasks/11-03-case-active-skill/case-evidence/eval-preflight.txt
tmux kill-session -t "$PREFLIGHT"
if [[ "$ok" != 'true' ]]; then
  echo 'MiniMax preflight failed; stop before starting eval runs' >&2
  exit 1
fi
```

- Verify: 预检证据含真实 `OK` 响应且没有 503/MISSING_CREDENTIAL；失败则停止并报告，不启动任何正式 run。

#### 步骤 7.1 串行执行五场景的两组配置

- Covers: AC2, AC3, AC4, AC5, AC8, AC11, AC13, AC14
- Target: `.workloom/tasks/11-03-case-active-skill/evals/skill-eval/iteration-1/`（真实运行产物）
- Edit: 对下表每个场景分别执行 with_skill 与 without_skill，一次只运行一个配置；前一个 durable session 完成并关闭后才启动下一个。命令中的 WORKTREE_ROOT 指向本任务 worktree，TASK_ROOT 指向主仓当前任务目录。

```bash
bash packages/assets/skills/workloom-case-active/evals/run-scenario.sh <scenario> <configuration> 1
```

| 顺序 | scenario | 第二阶段批准原文 |
| --- | --- | --- |
| 1 | planning-defers-execution | `I approve the exact reviewed CASE hash. Keep the task in planning and do not execute implementation.` |
| 2 | ready-executes-and-revalidates-fingerprint | `I approve the exact reviewed CASE hash. Execute all SR/C items now and record the result.` |
| 3 | legacy-migrates-and-executes | `I approve the exact reviewed CASE hash after plan migration. Execute all SR/C items now and record the result.` |
| 4 | batch-one-confirmation | `I approve every listed caseHash in this batch package. Execute serially in the listed order.` |
| 5 | blocked-stops-batch | `I approve every listed caseHash in this batch package. Execute serially and stop on the first blocked or P0/P1 result.` |

- Edit: 第二阶段批准通过同一 `tmux send-keys -t <session-id> ... Enter` 发送；每个会话保存 `outputs/final.txt`、任务目录、真实 Pi session JSONL 和 run.json。ready 场景还需在同一会话执行“不改代码的重复请求”和“修改 untracked 文件后的请求”，分别保存为 outputs/noop.txt 与 outputs/fingerprint-changed.txt；CASE 编辑阶段由主会话按同一稳定捕获规则保存 outputs/case-edit.txt，不依赖被测模型自行写文件。
- Edit: 每个 run 结束后更新 run.json 的 status/completedAt；`outputs/final.txt` 只有在连续两次 capture 相同且非空后才保存，不能只靠固定 sleep。随后关闭对应 tmux 会话；从真实 Pi JSONL 汇总耗时、input/output/total tokens 写 timing.json。`total_duration_seconds` 与 `total_tokens` 必须来自实际记录，不用 output_chars 代替 token。

```bash
previous=''
for _ in {1..60}; do
  current=$(tmux capture-pane -p -t "$SESSION_ID")
  if [[ -n "$current" && "$current" == "$previous" ]]; then
    printf '%s\n' "$current" > "$RUN_DIR/outputs/final.txt"
    break
  fi
  previous="$current"
  sleep 2
done
if [[ ! -s "$RUN_DIR/outputs/final.txt" ]]; then
  echo 'no stable final pane output' >&2
  exit 1
fi
```
- Verify: 十个 run 目录均含 run.json、timing.json、outputs、真实项目与证据；每配置恰 1 次，所有 session id 唯一，blocked 场景后续任务没有执行记录。

#### 步骤 7.2 评分、聚合与静态审阅

- Covers: AC8, AC11, AC14
- Target: 当前任务 `evals/skill-eval/iteration-1/` 下的 grading.json、benchmark、reviewer.html、feedback.json
- Edit: 主会话按 evals.json 的每条断言逐项评分；每个 `grading.json` 使用 `{text, passed, evidence}`，evidence 指向真实文件。主会话先排除自检自述，再把五组语义差异交给 review executor 复核；争议项重新读取原始载荷并修正评分。
- Edit: 在 eval 目录（`dirname(dirname(runDir))`）与配置目录（`dirname(runDir)`）各写同一份 `eval_metadata.json`；不写未被读取的 iteration 根副本。字段固定为：整数 `eval_id`（0–4）、`eval_name`、`prompt`、`assertions`、`skill_path`、executor/analyzer 模型、`runs_per_configuration: 1` 与诚实备注。`prompt` 与 `assertions` 直接读取当前 evals.json，不从目录名猜测。使用以下精确命令：

```bash
export RUN_DIR EVAL_INDEX EVAL_NAME SCENARIO CONFIG EVALS
EVAL_OUTPUT_DIR=$(dirname "$(dirname "$RUN_DIR")")
CONFIG_OUTPUT_DIR=$(dirname "$RUN_DIR")
export EVAL_OUTPUT_DIR CONFIG_OUTPUT_DIR
node -e '
  const fs = require("fs")
  const path = require("path")
  const run = JSON.parse(fs.readFileSync(path.join(process.env.RUN_DIR, "run.json"), "utf8"))
  const doc = JSON.parse(fs.readFileSync(process.env.EVALS, "utf8"))
  const item = doc.evals.find((entry) => entry.id === process.env.SCENARIO)
  const metadata = {
    eval_id: Number(process.env.EVAL_INDEX),
    eval_name: process.env.EVAL_NAME,
    prompt: item.prompt,
    assertions: item.assertions,
    skill_path: "packages/assets/skills/workloom-case-active",
    configuration: process.env.CONFIG,
    executor_model: "minimax-cn/MiniMax-M3.1-Flash",
    analyzer_model: "main-session review with original payload verification",
    runs_per_configuration: 1,
    runs: { run_1: run },
    notes: "Baseline also receives the workloom workflow; score only skill-specific behavior."
  }
  for (const dir of [process.env.EVAL_OUTPUT_DIR, process.env.CONFIG_OUTPUT_DIR]) {
    fs.writeFileSync(path.join(dir, "eval_metadata.json"), `${JSON.stringify(metadata, null, 2)}\n`)
  }
'
```
- Verify: 聚合与生成静态页：

```bash
python3 /data00/home/wangyubo.1219/.agents/skills/skill-creator/scripts/aggregate_benchmark.py \
  .workloom/tasks/11-03-case-active-skill/evals/skill-eval/iteration-1 \
  --skill-name workloom-case-active \
  --skill-path packages/assets/skills/workloom-case-active

python3 /data00/home/wangyubo.1219/.agents/skills/skill-creator/eval-viewer/generate_review.py \
  .workloom/tasks/11-03-case-active-skill/evals/skill-eval/iteration-1 \
  --skill-name workloom-case-active \
  --benchmark .workloom/tasks/11-03-case-active-skill/evals/skill-eval/iteration-1/benchmark.json \
  --static .workloom/tasks/11-03-case-active-skill/evals/skill-eval/iteration-1/reviewer.html
```

- Edit: 将聚合产物的 `metadata.skill_path`、executor/analyzer 模型、runs_per_configuration=1 与 notes 核对到真实记录；把 reviewer.html 链接提交用户。用户在会话中的反馈由主会话原样整理为 `feedback.json`，需要修改技能时新建 iteration-N 并只重跑受影响场景。
- Verify: benchmark.json/benchmark.md/reviewer.html 存在；页面无占位模型或 runs=3 默认值，反馈与处置均有记录，没有隐藏基线污染或无效断言。

### 阶段 8：最终验证与提交

#### 步骤 8.1 全量验证与 dist

- Covers: AC6, AC9, AC13
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
```

- Edit: 对修改过的 TS 文件使用 LSP diagnostics；worktree 不支持时以 tsc 命令行为兜底。重建两次并比较 dist 清单，DSH dist 与 src 同提交，Pi skills 构建副本不入库。
- Verify: 全部 exit 0；没有新增 lint/TS 问题，五个真实场景与 reviewer.html 不受构建影响。

#### 步骤 8.2 提交与归档

- Covers: AC9
- Target: 本任务代码、技能资产、测试、dist 与真实评测材料
- Edit: 主会话提交功能变更，再按 workloom-finish 归档并记录 journal；用户反馈未处理完不得归档。禁止 push。
- Verify: `git status` 无本任务遗留代码，归档目录包含 SKILL、评测、CASE/RESULT、覆盖率与反馈记录。



