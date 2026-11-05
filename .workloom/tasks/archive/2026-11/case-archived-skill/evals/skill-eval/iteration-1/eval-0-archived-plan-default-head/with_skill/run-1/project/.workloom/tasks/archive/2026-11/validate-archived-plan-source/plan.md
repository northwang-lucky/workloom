# Validation plan for the archived plan-source task

## Design decisions

### Path constants

Every command in this plan is run from the main repository root and is self-contained. These five constants are used throughout:

```bash
MAIN=/data00/home/wangyubo.1219/workbench/code-src/github/workloom/.workloom/tasks/11-03-case-archived-skill/evals/skill-eval/iteration-1/eval-0-archived-plan-default-head/with_skill/run-1/project
ARCHIVED=/data00/home/wangyubo.1219/workbench/code-src/github/workloom/.workloom/worktree/11-03-case-archived-skill/packages/assets/skills/workloom-case-archived/scripts
ACTIVE=/data00/home/wangyubo.1219/workbench/code-src/github/workloom/.workloom/worktree/11-03-case-archived-skill/packages/assets/skills/workloom-case-active/scripts
TASK=$MAIN/.workloom/tasks/11-05-validate-archived-plan-source
WT=$MAIN/.workloom/worktree/11-05-validate-archived-plan-source
```

The archived task directory after the close-out is `$MAIN/.workloom/tasks/archive/2026-11/validate-archived-plan-source` — core archives to `tasks/archive/<YYYY-MM>/<task-name>`, and the task's name is `validate-archived-plan-source` (the `11-05` date prefix belongs to the active task directory, not to the archive).

### The two roots, and which HEAD advances

- `<main-repo>` is `$MAIN`. It owns `.workloom/`: every `workloom_*` orchestration tool call, every task document (PRD, PLAN, CASE, RESULT, evidence, coverage) and the archived original at `$MAIN/.workloom/tasks/archive/plan-source/` are read and written here.
- `<worktree>` is `$WT`. It owns the code under validation. It is created by `workloom_task_start` on the task branch `workloom/11-05-validate-archived-plan-source`, based on `master`. Only code reads, `git -C $WT` checks and the code fingerprint use it.
- The **validation worktree HEAD stays at `0c9bb6e95eaccaf5c869bd45c81fdd1a7b8480bc`** for the whole task; the worktree status stays empty because this task changes no product code. The archive tool refuses to archive a task whose worktree is dirty, so a successful archive is itself the independent proof that the worktree was clean at close.
- The **main repository HEAD advances** when this task's bookkeeping commits land: the explicit task-artifact commit of step 1.6, then the archive tool's auto-commit, then the journal tool's auto-commit (`session_auto_commit` defaults to true). That is intended. The invariant is not "the main repo HEAD is frozen" but "no commit touches product code", which step 1.6 verifies with `git diff 0c9bb6e95eaccaf5c869bd45c81fdd1a7b8480bc..HEAD -- . ':(exclude).workloom/**'`.
- The validation-ref branch is `null` (`task.json.meta.validationBranch = null`): no separate branch is created for the validation ref, because the default current branch `master` already is the validation target. The task branch `workloom/11-05-validate-archived-plan-source` is the core's own worktree branch and is a different thing.

### Other decisions

- The archived task `tasks/archive/plan-source` is the requirement source (its `prd.md`) and the implementation-basis reference (its `plan.md`). Its `case.md` and `case-result.md` are read-only reference: this plan reuses neither their hashes nor their `status: passed`, because they describe a historical pass on a historical baseline.
- The validation baseline is the default current target branch `master` at `0c9bb6e95eaccaf5c869bd45c81fdd1a7b8480bc`. The archived `sourceCommit` `044423a1869e20213f0a1006e7d3e968d19edd3b` is archive bookkeeping and is recorded separately.
- No product code changes. The files this task writes are all under `.workloom/`: the task directory, the journal entry under `$MAIN/.workloom/workspace/<developer>/`, and the workspace indexes the journal tool maintains.
- The pre-task manifest of the archived original is stored durably at `$TASK/case-evidence/archived-manifest-before.json` (copied before the CASE design). Every later comparison uses that file, never a `/tmp` path, and the RESULT records its sha256 so the baseline is pinned in the result document itself.
- Content hashes in this plan use core's rule: SHA-256 over the file content with CRLF/CR normalized to LF, UTF-8 encoded. The one-liner below reproduces it without importing core:

```bash
hash_of() { node --input-type=module -e "import { createHash } from 'node:crypto'; import { readFileSync } from 'node:fs'; console.log(createHash('sha256').update(readFileSync(process.argv[1],'utf8').replace(/\r\n|\r/g,'\n'),'utf8').digest('hex'))" "$1"; }
```

- Coverage is `not_applicable`: the change scope contains no countable source code. The exclusion list names `src/current.txt` with its reason. Core derives the coverable-file set from the SR targets when no code changed, so every SR target stays under `.workloom/` except the explicitly excluded `src/current.txt`.
- Actors are explicit on every step. The main session owns the workloom orchestration tools (`workloom_task_align`, `workloom_task_case`, `workloom_task_check`, `workloom_task_archive`, `workloom_journal`); executors own file authoring and shell verification and never call the orchestration tools.
- Two independent user approvals gate this task: one over the pre-start package (PRD, PLAN, context lists, baseline) before start, and one over the exact current `caseHash` before CASE execution. Neither the original request nor a generic continue is an approval.

## Steps

#### 步骤 1.1 Confirm the alignment credential and start the task

- Covers: AC3
- Actor: main session. This is the pre-start package approval; it runs before every other step and before the validation worktree exists.
- Target: `.workloom/tasks/11-05-validate-archived-plan-source/task.json` — the `alignment` credential, and the `worktree_path` / `branch` / `base_branch` / `case.required` fields that `workloom_task_start` writes
- Edit: after the user approves the pre-start package in a new user message, run `workloom_task_align` with `action: confirm` and the `expectedPrdHash` from a fresh `workloom_task_align` `action: review`, then run `workloom_task_start`. The start must run while the main repository HEAD is still `0c9bb6e95eaccaf5c869bd45c81fdd1a7b8480bc`, because the core creates the validation worktree from the current branch HEAD. The start creates `$WT` on branch `workloom/11-05-validate-archived-plan-source` with base `master` and promotes `case.required` to `true`. No `force` is used on either call.
- Verify: run from `$MAIN`:

```bash
MAIN=/data00/home/wangyubo.1219/workbench/code-src/github/workloom/.workloom/tasks/11-03-case-archived-skill/evals/skill-eval/iteration-1/eval-0-archived-plan-default-head/with_skill/run-1/project
TASK=$MAIN/.workloom/tasks/11-05-validate-archived-plan-source
export TASK
cd "$MAIN"
node --input-type=module -e "
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
const h = (p) => createHash('sha256').update(readFileSync(p,'utf8').replace(/\r\n|\r/g,'\n'),'utf8').digest('hex');
const t = JSON.parse(readFileSync(process.env.TASK + '/task.json','utf8'));
if (t.status !== 'in_progress') throw new Error('task not started: ' + t.status);
if (t.alignment === null) throw new Error('alignment credential missing');
if (t.alignment.prdHash !== h(process.env.TASK + '/prd.md')) throw new Error('alignment prdHash is stale');
if (t.alignment.summary === undefined || t.alignment.summary.trim() === '') throw new Error('alignment summary missing');
if (t.case === null || t.case.required !== true) throw new Error('case.required not promoted');
if (t.worktree_path === '') throw new Error('worktree missing');
console.log('gate-ok prdHash=' + t.alignment.prdHash + ' worktree=' + t.worktree_path);
"
```

  Expected: prints `gate-ok prdHash=<the prd.md hash> worktree=.workloom/worktree/11-05-validate-archived-plan-source` and exits `0`.

#### 步骤 1.2 Verify the recorded provenance against the live baseline

- Covers: AC2
- Actor: check executor — it runs the command and stores the output as evidence; it calls no orchestration tool.
- Target: `.workloom/tasks/11-05-validate-archived-plan-source/task.json` — the `meta` object; and the validation worktree `$WT`
- Edit: no product code and no metadata edit. The `meta` object is already written with `sourceTask`, `sourceCommit`, `sourceCommitType`, `validationRef`, `validationRefSource`, `validationReason`, `validationCommit`, `validationBranch`, `materialMode` and `validationPurpose`; the core writes `worktree_path`, `branch` and `base_branch` at start. This step only proves that the recorded baseline still matches the live repository and that the validation worktree sits on that same baseline.
- Verify: run from `$MAIN`:

```bash
MAIN=/data00/home/wangyubo.1219/workbench/code-src/github/workloom/.workloom/tasks/11-03-case-archived-skill/evals/skill-eval/iteration-1/eval-0-archived-plan-default-head/with_skill/run-1/project
TASK=$MAIN/.workloom/tasks/11-05-validate-archived-plan-source
WT=$MAIN/.workloom/worktree/11-05-validate-archived-plan-source
export TASK WT
cd "$MAIN"
node --input-type=module -e "
import { execFileSync } from 'node:child_process';
const g = (a, c) => execFileSync('git', a, { cwd: c, encoding: 'utf8' }).trim();
const t = JSON.parse((await import('node:fs')).readFileSync(process.env.TASK + '/task.json', 'utf8'));
const m = t.meta;
const want = { sourceTask: 'tasks/archive/plan-source', sourceCommit: '044423a1869e20213f0a1006e7d3e968d19edd3b', sourceCommitType: 'archive-bookkeeping', validationRef: 'master', validationRefSource: 'default-current-branch', validationCommit: '0c9bb6e95eaccaf5c869bd45c81fdd1a7b8480bc', materialMode: 'plan' };
for (const [k, v] of Object.entries(want)) if (m[k] !== v) throw new Error('meta.' + k + ' = ' + String(m[k]) + ' expected ' + v);
if (typeof m.validationReason !== 'string' || m.validationReason.trim() === '') throw new Error('meta.validationReason is empty');
if (m.validationBranch !== null) throw new Error('meta.validationBranch is not null');
if (m.sourceCommit === m.validationCommit) throw new Error('source commit must differ from validation commit');
if (g(['rev-parse', 'HEAD'], process.env.WT) !== m.validationCommit) throw new Error('worktree HEAD is not the validation commit');
if (t.base_branch !== 'master') throw new Error('unexpected base branch: ' + t.base_branch);
if (g(['branch', '--show-current'], process.env.WT) !== t.branch) throw new Error('worktree not on task branch');
if (g(['status', '--porcelain'], process.env.WT) !== '') throw new Error('validation worktree is dirty');
console.log('provenance-ok ' + m.validationCommit + ' worktree=' + t.worktree_path + ' branch=' + t.branch);
"
```

  Expected: prints `provenance-ok 0c9bb6e95eaccaf5c869bd45c81fdd1a7b8480bc worktree=.workloom/worktree/11-05-validate-archived-plan-source branch=workloom/11-05-validate-archived-plan-source` and exits `0`.

#### 步骤 1.3 Verify the archived source bytes are unchanged

- Covers: AC1
- Actor: check executor — it runs the command and stores the output as evidence; it calls no orchestration tool.
- Target: `.workloom/tasks/archive/plan-source/` — the seven archived files, read-only in the main repository
- Edit: no product code and no archive write. The pre-task manifest lives at `$TASK/case-evidence/archived-manifest-before.json`; this step only re-runs the read-only snapshot and compares it. The snapshot always runs with the main repository root as the working directory — the archived original's authoritative location — never from the validation worktree.
- Verify: run from `$MAIN`:

```bash
MAIN=/data00/home/wangyubo.1219/workbench/code-src/github/workloom/.workloom/tasks/11-03-case-archived-skill/evals/skill-eval/iteration-1/eval-0-archived-plan-default-head/with_skill/run-1/project
ARCHIVED=/data00/home/wangyubo.1219/workbench/code-src/github/workloom/.workloom/worktree/11-03-case-archived-skill/packages/assets/skills/workloom-case-archived/scripts
TASK=$MAIN/.workloom/tasks/11-05-validate-archived-plan-source
cd "$MAIN"
node "$ARCHIVED/archived-tasks.mjs" snapshot tasks/archive/plan-source > /tmp/wl-archived-manifest-after.json
diff "$TASK/case-evidence/archived-manifest-before.json" /tmp/wl-archived-manifest-after.json && echo manifest-identical
```

  Expected: `diff` prints nothing and the block prints `manifest-identical`, exit `0`. The snapshot JSON holds exactly the seven entries of the pre-task manifest.

#### 步骤 1.4 Design, review and confirm the CASE

- Covers: AC3
- Actor: check executor designs `case.md`; the main session reviews it, presents the hash and confirms it after the user approves that exact hash in a new user message.
- Target: `.workloom/tasks/11-05-validate-archived-plan-source/case.md` — new file
- Edit: create `case.md` filling every field of the canonical CASE template — front matter `version: 1` and `task: tasks/11-05-validate-archived-plan-source`; H1 `# CASE: Validate archived plan-source CASE against current HEAD`; the sections `References`, `Scope`, `Static Review`, `Runtime Cases`, `Coverage`, `Traceability`; `References` declaring `PRD: prd.md`, `Implementation: plan.md`, `Code target: master@0c9bb6e95eaccaf5c869bd45c81fdd1a7b8480bc` and `Source task: tasks/archive/plan-source`; `Scope` declaring `Requirements: R1, R2, R3, R4, R5, R6, R7, R8, R9`, `Acceptance criteria: AC1, AC2, AC3, AC4, AC5` and `Out of scope: the archived original is never modified; no product code is written; no external service is contacted`; exactly five SR items — one per acceptance criterion — each with the fields `Covers`, `Target`, `Checks` and `Expected`: SR1 covers AC1 and targets `.workloom/tasks/archive/plan-source/` (the archived material is readable and matches the pre-task manifest), SR2 covers AC2 and targets `.workloom/tasks/11-05-validate-archived-plan-source/task.json` (the `meta` block records the source and the validation baseline), SR3 covers AC3 and targets `.workloom/tasks/11-05-validate-archived-plan-source/prd.md` and `.workloom/tasks/11-05-validate-archived-plan-source/plan.md` (every AC is covered by a plan step and both credential hashes are recorded), SR4 covers AC4 and targets `.workloom/tasks/11-05-validate-archived-plan-source/case.md` (the CASE and RESULT field structure and the coverage exclusions), SR5 covers AC5 and targets `.workloom/tasks/11-05-validate-archived-plan-source/task.json` (the close-out records the check credential, the archive entry and the journal record); exactly four C items with the fields `Covers`, `Preconditions`, `Steps`, `Expected`, `Evidence` and `Cleanup`: C1 provenance and baseline (step 1.2's command), C2 archived manifest unchanged (step 1.3's command), C3 current-HEAD payload versus the archived bookkeeping payload (`git show 044423a1869e20213f0a1006e7d3e968d19edd3b:src/current.txt` yields `base`, `cat $WT/src/current.txt` yields `current`), C4 independent fingerprint equality (step 1.5's command); a `Coverage` block declaring all six fields `Tool`, `Instrumentation`, `Aggregate command`, `Scope`, `Exclusions` and `Raw outputs`, whose `Exclusions` lists `src/current.txt` with the reason that it is a validation data fixture and not countable source code; and a `Traceability` table with one row per AC, mapping AC1→SR1/C2, AC2→SR2/C1, AC3→SR3/C4, AC4→SR4/C4, AC5→SR5/C3. Every SR target stays under `.workloom/`, so core's coverable-file set stays empty. The prose is written by the check executor, never by the main session, and the confirmed file is not edited afterwards.
- Verify: the main session runs `workloom_task_case` with `action: review` and requires `readyToConfirm: true` with an empty `structureIssues` list; it presents that `caseHash` to the user and calls `action: confirm` only after the user approves that exact hash in a new user message. Then run from `$MAIN`:

```bash
MAIN=/data00/home/wangyubo.1219/workbench/code-src/github/workloom/.workloom/tasks/11-03-case-archived-skill/evals/skill-eval/iteration-1/eval-0-archived-plan-default-head/with_skill/run-1/project
TASK=$MAIN/.workloom/tasks/11-05-validate-archived-plan-source
export TASK
cd "$MAIN"
node --input-type=module -e "
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
const h = (p) => createHash('sha256').update(readFileSync(p,'utf8').replace(/\r\n|\r/g,'\n'),'utf8').digest('hex');
const t = JSON.parse(readFileSync(process.env.TASK + '/task.json','utf8'));
const caseHash = h(process.env.TASK + '/case.md');
if (t.case === null || t.case.required !== true) throw new Error('case.required is not true');
if (t.case.caseHash !== caseHash) throw new Error('confirmed caseHash does not match case.md');
if (t.case.designSession === null || t.case.designSession === '') throw new Error('designSession missing');
if (t.case.confirmedAt === null) throw new Error('case not confirmed');
const design = (t.dispatches ?? []).filter((d) => d.kind === 'check');
if (design.length === 0) throw new Error('no check dispatch recorded');
if (!design.some((d) => d.childId === t.case.designSession)) throw new Error('designSession is not a recorded check dispatch');
const archived = JSON.parse(readFileSync(process.env.TASK + '/case-evidence/archived-manifest-before.json','utf8'));
if (caseHash === archived['case.md']) throw new Error('caseHash reused from the archived CASE');
if (caseHash === archived['case-result.md']) throw new Error('caseHash reused from the archived RESULT');
console.log('case-confirmed ' + caseHash);
"
```

  Expected: prints `case-confirmed <the case.md hash>` and exits `0`.

#### 步骤 1.5 Execute the confirmed CASE and record the result

- Covers: AC4
- Actor: check executor, continuing the same design session with `purpose: execution` — it authors `case-result.md` and the evidence, and runs the shell verification; it calls no orchestration tool.
- Target: `.workloom/tasks/11-05-validate-archived-plan-source/case-result.md` and `.workloom/tasks/11-05-validate-archived-plan-source/case-evidence/` — new files
- Edit: create `case-result.md` from the canonical RESULT template with every one of its sections: front matter `version: 1`, `task: tasks/11-05-validate-archived-plan-source`, the confirmed `caseHash` copied from `task.json.case.caseHash`, `checkSession` set to the design session id (`task.json.case.designSession`), `codeBaseline` recording the validation commit `0c9bb6e95eaccaf5c869bd45c81fdd1a7b8480bc`, `validationRefSource=default-current-branch`, the `validationReason`, the archived `sourceCommit 044423a1869e20213f0a1006e7d3e968d19edd3b`, the validation worktree HEAD and `codeFingerprint=<64-hex>`, `status: passed`, `startedAt` and `completedAt`; `Summary` with `Static review: <passed>/<total>`, `Runtime cases: <passed>/<total>; blocked: 0`, `Coverage: not_applicable` and `Standard verification: passed`; one `Static Review Results` entry per SR item and one `Runtime Results` entry per C item, each with `Status: passed`, the real action and the observed result; `Coverage` with `Status: not_applicable`, `Tool`, `Command`, `Overall lines: N/A`, an empty `Changed Files` table, and an `Exclusions` table repeating `src/current.txt` and its reason verbatim from the CASE; `Standard Verification` rows for the commands of steps 1.2 and 1.3 with their real exit code `0`; `Resolved Findings` with `- none`; and a final `Open issues` section containing exactly `- none`. Every runtime case stores its real output under `case-evidence/`, and each runtime case entry names the evidence file it produced. The C2 entry records that `case-evidence/archived-manifest-before.json` is the pre-task snapshot of the archived original and cites its sha256, so the baseline is pinned inside the result document. The confirmed `case.md` is not modified.
- Verify: run from `$MAIN`:

```bash
MAIN=/data00/home/wangyubo.1219/workbench/code-src/github/workloom/.workloom/tasks/11-03-case-archived-skill/evals/skill-eval/iteration-1/eval-0-archived-plan-default-head/with_skill/run-1/project
ACTIVE=/data00/home/wangyubo.1219/workbench/code-src/github/workloom/.workloom/worktree/11-03-case-archived-skill/packages/assets/skills/workloom-case-active/scripts
TASK=$MAIN/.workloom/tasks/11-05-validate-archived-plan-source
WT=$MAIN/.workloom/worktree/11-05-validate-archived-plan-source
export TASK WT
cd "$MAIN"
node "$ACTIVE/task-fingerprint.mjs" "$WT" | tee /tmp/wl-fingerprint.txt
grep -F "$(cat /tmp/wl-fingerprint.txt)" "$TASK/case-result.md" >/dev/null && echo fingerprint-matches
node --input-type=module -e "
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
const h = (p) => createHash('sha256').update(readFileSync(p,'utf8').replace(/\r\n|\r/g,'\n'),'utf8').digest('hex');
const t = JSON.parse(readFileSync(process.env.TASK + '/task.json','utf8'));
const r = readFileSync(process.env.TASK + '/case-result.md','utf8');
const caseHash = h(process.env.TASK + '/case.md');
const ch = /^caseHash:\s*(\S+)\s*$/m.exec(r);
if (ch === null) throw new Error('RESULT caseHash field missing');
if (ch[1] !== caseHash) throw new Error('RESULT caseHash does not match case.md');
if (t.case === null || t.case.caseHash !== caseHash) throw new Error('confirmed caseHash drifted from case.md');
const cs = /^checkSession:\s*(\S+)\s*$/m.exec(r);
if (cs === null) throw new Error('RESULT checkSession field missing');
if (cs[1] !== t.case.designSession) throw new Error('RESULT checkSession is not the design session');
if (!/^status:\s*passed\s*$/m.test(r)) throw new Error('RESULT status is not passed');
const heads = [...r.matchAll(/^##\s+Open issues\s*$/gm)];
if (heads.length === 0) throw new Error('RESULT has no Open issues section');
const lastHead = heads[heads.length - 1];
const tail = r.slice(lastHead.index + lastHead[0].length).trim();
if (tail !== '- none') throw new Error('RESULT open issues are not exactly - none: ' + JSON.stringify(tail));
const manHash = h(process.env.TASK + '/case-evidence/archived-manifest-before.json');
if (!r.includes(manHash)) throw new Error('RESULT does not record the pre-task manifest hash');
const files = [...r.matchAll(/\\\`(case-evidence\/[^\`]+)\\\`/g)].map((x) => x[1]);
if (files.length === 0) throw new Error('RESULT references no evidence file');
for (const p of files) {
  const abs = process.env.TASK + '/' + p;
  if (readFileSync(abs,'utf8').trim() === '') throw new Error('empty evidence file: ' + p);
}
console.log('result-ok caseHash=' + caseHash + ' evidence-files=' + files.length);
"
```

  Expected: the first command prints `codeFingerprint=63381f126841386d027dece5539d6a94e008d1611b4f7c205d3cb37ec925ba46`, the block prints `fingerprint-matches` and `result-ok caseHash=<the case.md hash> evidence-files=<count>`, and every command exits `0`.

#### 步骤 1.6 Record the check, commit and archive this validation task

- Covers: AC5
- Actor: main session only — it owns the orchestration tools; the check executor has already returned.
- Target: `.workloom/tasks/11-05-validate-archived-plan-source/task.json` — the `check` field; then the task directory moved to `.workloom/tasks/archive/2026-11/validate-archived-plan-source/`; then the journal entry under `.workloom/workspace/<developer>/`
- Edit: record the check credential with `workloom_task_check`, using a summary that names the executed SR and C items, the coverage status and the recorded fingerprint. Before archiving, prove the validation worktree is clean — `test -z "$(git -C "$WT" status --porcelain)"` — because the archive tool refuses to archive a task whose worktree carries uncommitted changes, and the worktree is removed by that same cleanup. Then commit the task's own artifacts with exactly these paths — `git add .workloom/tasks/11-05-validate-archived-plan-source` and `git commit -m "chore(task): record archived plan-source validation artifacts"`; never use `git commit -a` or `git add -A`, because those would sweep the fixture's unrelated `.workloom/config.json` repair into this task's commit. Then archive the task with `workloom_task_archive` (it auto-commits the move to `tasks/archive/2026-11/validate-archived-plan-source` and removes the worktree) and record the session with `workloom_journal` (it auto-commits the journal entry and the workspace indexes). Those two auto-commits advance the main repository HEAD by design; no product code is committed, and the validation worktree stays at the validation commit with an empty status until the archive removes it.
- Verify: run from `$MAIN`:

```bash
MAIN=/data00/home/wangyubo.1219/workbench/code-src/github/workloom/.workloom/tasks/11-03-case-archived-skill/evals/skill-eval/iteration-1/eval-0-archived-plan-default-head/with_skill/run-1/project
ARCHIVED=/data00/home/wangyubo.1219/workbench/code-src/github/workloom/.workloom/worktree/11-03-case-archived-skill/packages/assets/skills/workloom-case-archived/scripts
ARCHIVED_TASK=.workloom/tasks/archive/2026-11/validate-archived-plan-source
WT=$MAIN/.workloom/worktree/11-05-validate-archived-plan-source
cd "$MAIN"
git diff 0c9bb6e95eaccaf5c869bd45c81fdd1a7b8480bc..HEAD -- . ':(exclude).workloom/**' && echo product-code-unchanged
git log --oneline 0c9bb6e95eaccaf5c869bd45c81fdd1a7b8480bc..HEAD
git log --format=%s 0c9bb6e95eaccaf5c869bd45c81fdd1a7b8480bc..HEAD | grep -F "chore(task): record archived plan-source validation artifacts" && echo artifact-commit-recorded
git ls-files "$ARCHIVED_TASK" | wc -l
ls .workloom/workspace/*/journal-*.md
test ! -e "$WT" && echo worktree-removed
node --input-type=module -e "
import { readFileSync } from 'node:fs';
const t = JSON.parse(readFileSync('.workloom/tasks/archive/2026-11/validate-archived-plan-source/task.json','utf8'));
if (t.status !== 'completed') throw new Error('archived status is ' + t.status);
if (t.check === null || typeof t.check.summary !== 'string' || t.check.summary.trim() === '') throw new Error('archived check credential missing');
console.log('archive-ok status=' + t.status);
"
node "$ARCHIVED/archived-tasks.mjs" snapshot tasks/archive/plan-source > /tmp/wl-archived-manifest-final.json
diff "$ARCHIVED_TASK/case-evidence/archived-manifest-before.json" /tmp/wl-archived-manifest-final.json && echo manifest-identical
```

  Expected: `product-code-unchanged`, `artifact-commit-recorded` and `manifest-identical` are printed, `git log` lists only this task's `.workloom/` bookkeeping commits, `git ls-files` counts the archived task's tracked files, `ls` shows the journal entry, `worktree-removed` is printed, the archive check prints `archive-ok status=completed`, and every command exits `0`.
