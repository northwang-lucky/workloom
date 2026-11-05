# Plan review — tasks/11-05-archived-prd-only-rebuild-validation

Injection marker: tasks/11-05-archived-prd-only-rebuild-validation:mw3dovsi90py1r1d

## Round 1 — 2026-11-05 (pre-implementation)

Verdict: **not ready**. 3 P0, 9 P1, 10 P2. The plan's structure gate passes and the frozen
manifest is numerically correct, but one static review check asserts a property the target
file does not have, one acceptance criterion (AC4) has no runtime verification at all, and
the after-archive half of AC1/R7 has no owner.

### Anchors that do check out

- Plan structure: H1 present, `## Steps` present, all four steps declare `Covers`, `Target`,
  `Edit`, `Verify`; `AC1`-`AC4` each appear in at least one `Covers` line — this matches
  `inspectPlanStructure` in `packages/core/src/domain/task-gates.js` (`PLAN_REQUIRED_FIELDS`,
  `^####\s+步骤\s+\S+` step split).
- Frozen manifest values are real: `sha256sum` of `.workloom/tasks/archive/prd-source/*`
  equals the four hashes in `.workloom/workspace/case-archived/prd-source.manifest.json`, and
  the same four blobs at `b5a6d81` produce the same hashes, so C2 (worktree copy) will pass.
- Baseline identity is real: `640b400..b5a6d81` differ only in `src/current.txt`, whose content
  is exactly `current\n` — the string `verify-baseline.mjs` expects; the archive blobs are
  identical at both commits.
- `task.json` `meta` is complete (nine keys plus `missingMaterial: ["plan.md"]`,
  `validationPurpose`), `validationBranch` is `null`, `parent` is `null`,
  `git status --porcelain -- .workloom/tasks/archive/prd-source` prints nothing.
- The embedded CASE satisfies `inspectCaseStructure`: `# CASE:` H1, front matter
  `version/task`, all six sections, `References` with PRD/Implementation/Code target/Source
  task, `Scope` with Requirements/Acceptance criteria/Out of scope, `Coverage` with the six
  required fields, sequential `SR1`-`SR5` / `C1`-`C3`, and a Traceability row for every AC.
- Coverage `not_applicable` is consistent with `evaluateCaseOutcomeGate`: every SR `Target`
  is under `.workloom/`, so the coverable file set is empty, the changed-file table is empty,
  and the exclusion reason cells match `tableExclusions`' backtick format.
- `packages/assets/skills/workloom-case-active/scripts/task-fingerprint.mjs` exists, prints
  `codeFingerprint=<64-hex>`, and excludes `.workloom/**`, so task documents cannot disturb
  the fingerprint.

---

## P0 findings

### P0-1 SR2 check 2 asserts a `## Notes` statement that the PRD does not contain

- Anchor: plan.md:98 (`### SR2 ...`, check 2), the CASE embedded in step 3.
- Evidence: the check requires "The `## Notes` section names the material mode `prd-only`".
  Reading `.workloom/tasks/11-05-archived-prd-only-rebuild-validation/prd.md`, `prd-only`
  occurs only in R2 (line 10), AC2 (line 20) and `## Alignment Decisions` (line 39); the
  `## Notes` body has zero occurrences (`grep` over the Notes range returns nothing, exit 1).
  `## Notes` does name `plan.md`. An executor running SR2 honestly must record `failed`, and
  `evaluateCaseOutcomeGate` rejects a RESULT whose items are not all `passed`.
- Fix: retarget check 2 to "`prd.md` names the material mode `prd-only` (in `## Requirements`
  R2 and `## Alignment Decisions`) and names the missing file `plan.md` in `## Notes`".
  Do not "fix" this by editing `prd.md` after the alignment credential is recorded — a
  changed `prd.md` makes the credential stale (`packages/core/src/domain/alignment.js`).

### P0-2 AC4 has no runtime verification; the Traceability row over-claims C1-C3

- Anchor: plan.md:212 (`| AC4 | SR5 | C1, C2, C3 |`), plan.md:136-188 (`## Runtime Cases`),
  plan.md:315 (constraint 8).
- Evidence: AC4 requires `task.json case.caseHash` = hash of `case.md`, `checkSession` =
  `case.designSession`, `codeBaseline codeFingerprint` equal to an independent fingerprint
  run, a recorded coverage status, and existence of every quoted `case-evidence/` file.
  C1 hashes the archive, C2 the worktree copy, C3 the baseline metadata; none of the three
  touches `caseHash`, `designSession`, `codeFingerprint` or evidence existence. Constraint 8
  states the existence requirement but gives no command, and SR5 only re-reads the CASE text
  it is itself part of.
- Fix: add `### C4` "RESULT is bound to the confirmed CASE and the current baseline" with a
  third verifier, e.g. `case-evidence/verify-result-binding.mjs` (full content in the step):
  arguments `<task-dir> <worktree-root>`, asserts (1)
  `computeCaseHash(readFileSync(join(taskDir,'case.md')))` equals `task.case.caseHash`,
  (2) RESULT front matter `caseHash` and `checkSession` equal the same values resp.
  `task.case.designSession`, (3) `codeFingerprint` in `codeBaseline` equals a fresh
  `computeTaskFingerprint(worktreeRoot)`, (4) every backticked `case-evidence/...` path in the
  RESULT exists — prints `BINDING=ok checks=4` and exits 0, log
  `case-evidence/c4-binding.log`; then change Traceability to `| AC4 | SR5 | C4 |`.

### P0-3 The after-archive comparison of R7/AC1 has no owner

- Anchor: plan.md:6 (design decisions: "recomputed in step 4 and again after archiving; all
  three must be exactly equal"), plan.md:16-36 (step 1), no step after step 4.
- Evidence: AC1 and R7 are conditional on "after this task is archived". C1 runs during
  implementation, C2 hashes the worktree copy; nothing runs after `workloom_task_archive`.
  `.workloom/config.json` has no `hooks` block and `task.json hooks.after_archive` was copied
  empty at creation (`packages/core/src/domain/task-store.js` copies
  `config.hooks.afterArchive`), so no task-local hook exists to cover it either.
- Fix: add step 5 "Archive-phase verification" that records the post-archive run with the
  exact command and expected line
  `node .workloom/tasks/11-05-archived-prd-only-rebuild-validation/case-evidence/verify-archive-bytes.mjs .workloom/tasks/archive/prd-source .workloom/workspace/case-archived/prd-source.manifest.json | tee .workloom/tasks/11-05-archived-prd-only-rebuild-validation/case-evidence/c4-post-archive-bytes.log`
  → `ARCHIVE_BYTES=ok files=4`; state explicitly who runs it (check executor re-runs it before
  archive, the main session re-runs it after archive) and where the log is retained, so AC1's
  "after this task is archived" clause stops being an unverified promise.

---

## P1 findings

### P1-4 Step 1's Verify command cannot run: unresolved placeholder plus a skill that does not exist

- Anchor: plan.md:22-35 (manifest `tool` string), plan.md:36 (Verify).
- Evidence: `packages/assets/skills/workloom-case-archived/` does not exist; the repo ships
  `workloom-alignment`, `workloom-case-active`, `workloom-continue`, `workloom-finish`,
  `workloom-migrate-plan`, `workloom-packages-scan`, `workloom-update-spec`. `find packages
  -name "archived-tasks*"` returns nothing, so `archived-tasks.mjs snapshot` cannot print the
  four hashes. `<workloom-skill-root>` is never resolved anywhere in the plan. The manifest
  `tool` field repeats the non-existent provenance, so the frozen record claims a tool that
  was never run.
- Fix: replace the Verify with a runnable comparison, e.g.
  `(cd .workloom/tasks/archive/prd-source && sha256sum check.jsonl implement.jsonl prd.md task.json)`
  compared against the manifest, and rewrite `tool` to name the command actually executed.

### P1-5 Step 2's Verify command is not an invocation

- Anchor: plan.md:47.
- Evidence: `node -e "const {inspectPlanStructure}=require('<workloom-skill-root>/packages/core/dist/domain/task-gates.js');"`
  only binds a variable: it prints nothing, passes no arguments, leaves `<workloom-skill-root>`
  unexpanded and points at `packages/`, which does not exist under this project root (the
  fixture ships `.workloom/`, `src/`, `.pi/`). Under `sh`, `${WORKLOOM_ROOT}` / the placeholder
  makes `require('/packages/...')` throw, so "reports zero plan issues" is unobservable.
- Fix: give the real absolute path of the workloom checkout and a real call, e.g.
  `node -e "const {inspectPlanStructure}=require('<abs-workloom-repo>/packages/core/dist/domain/task-gates.js');const fs=require('node:fs');console.log(JSON.stringify(inspectPlanStructure(fs.readFileSync('.workloom/tasks/11-05-archived-prd-only-rebuild-validation/plan.md','utf8'),fs.readFileSync('.workloom/tasks/11-05-archived-prd-only-rebuild-validation/prd.md','utf8'))))"`
  → expected `[]`.

### P1-6 The fingerprint command in step 4 is a placeholder and never retained to a log

- Anchor: plan.md:309 (constraint 2).
- Evidence: `node <workloom-skill-root>/packages/assets/skills/workloom-case-active/scripts/task-fingerprint.mjs ...`
  leaves the placeholder unresolved, and the retention sentence "the same value is retained in
  `case-evidence/code-fingerprint.log`" has no `tee` or redirection, so the log has no
  producing command. AC4 compares this exact value, so a wrong path or a hand-copied value
  breaks the only binding AC4 cares about.
- Fix: name the concrete script path (`packages/assets/skills/workloom-case-active/scripts/task-fingerprint.mjs`
  inside the workloom checkout) and give the command with
  `| tee .workloom/tasks/11-05-archived-prd-only-rebuild-validation/case-evidence/code-fingerprint.log`,
  plus move the run into a runtime case so it has evidence and a Covers line.

### P1-7 The RESULT binding list omits the required `## Resolved Findings` section

- Anchor: plan.md:307-315 (constraints 1-8).
- Evidence: `CASE_STRUCTURE.resultSections` in `packages/core/src/domain/case.js` is
  `['Summary','Static Review Results','Runtime Results','Coverage','Standard Verification','Resolved Findings','Open issues']`,
  and `packages/assets/templates/case-result.md` contains `## Resolved Findings`. The plan
  enumerates six sections and jumps from `## Standard Verification` (constraint 6) to
  `## Open issues` (constraint 7), so a RESULT that follows the enumeration literally fails
  `evaluateCaseOutcomeGate` with `result_section`.
- Fix: add a constraint "`## Resolved Findings` present between Standard Verification and Open
  issues, containing exactly `- none`".

### P1-8 `case-evidence/sr-checks.log` is required but has no producer

- Anchor: plan.md:219 (Target), plan.md:315 (constraint 8).
- Evidence: no step, no C item and no command writes `sr-checks.log`; C1-C3 write their own
  logs. SR items carry no `Evidence` field in the canonical template, so R5's "retained
  evidence" for SR1-SR5 has nothing behind it; an executor must invent file content or drop
  the reference (which then contradicts constraint 8).
- Fix: either add the producing command (e.g. `case-evidence/verify-docs.mjs` asserting the
  SR1-SR5 properties and printing `SR=ok sr=5`), or delete `sr-checks.log` from the Target and
  constraint list and cite the inspected files in each SR result instead.

### P1-9 CASE lifecycle ownership is undefined (design session, confirmation, executor)

- Anchor: plan.md:49-51 (step 3), plan.md:308 (constraint 1).
- Evidence: `case.designSession` is only written by a check-kind dispatch with
  `purpose: 'case-design'` (`recordExecutorDispatchInternal` in
  `packages/core/src/domain/task-store.js`); `evaluateCaseExecutionGate` rejects an empty
  `designSession`; `sessionChainReaches` requires `checkSession` to equal it. The plan never
  runs `workloom_task_align action=confirm expectedPrdHash=...`, never asks for the new user
  approval R5 requires, never runs `workloom_task_case action=confirm expectedCaseHash=...
  summary=...`, and assigns CASE execution to the same implement step. With `designSession`
  null, `checkSession` cannot be filled and the check/archive gate fails.
- Fix: add explicit handoff substeps: (a) `workloom_task_align action=confirm` with the PRD
  hash; (b) user approval of the reviewed `caseHash`; (c) `workloom_task_case action=confirm`
  with `expectedCaseHash`; (d) the case-design check session executes SR1-SR5 then C1-Cn and
  writes the RESULT — label step 4 as check-executor work, not implement work.

### P1-10 The task worktree every runtime case depends on has no owner

- Anchor: plan.md:4 (design decisions), plan.md:161-163 (C2 preconditions), plan.md:174-176
  (C3 preconditions).
- Evidence: `task.json` currently has `status: planning` and `worktree_path: ""`. The worktree
  `.workloom/worktree/11-05-archived-prd-only-rebuild-validation` is created by
  `createTaskWorktree` at start (`packages/core/src/domain/worktree.js`, path
  `.workloom/worktree/<task-id>`, branch template `workloom/<task-id>`); no step runs
  `workloom_task_start` or asserts the directory exists, so C2, C3 and the fingerprint all
  depend on an unestablished precondition.
- Fix: insert a step after step 2 that runs (or hands off) `workloom_task_start` and then
  verifies `git -C .workloom/worktree/11-05-archived-prd-only-rebuild-validation rev-parse HEAD`
  = `b5a6d81569a4399c20dc4c636b8f5b1cf3ce7b8f` with `git status --porcelain` empty, with that
  output as the step's expected result.

### P1-11 AC2's `workloom_task_align` evidence exists only in step prose

- Anchor: plan.md:47 (step 2 Verify), plan.md:211 (`| AC2 | SR2, SR3, SR5 | - |`).
- Evidence: AC2's verification explicitly includes "`workloom_task_align` action=review returns
  `readyToConfirm: true`", but no SR item checks it and no C item runs it; the traceability row
  has `-` for runtime cases. So the AC is evidenced by nothing inside the CASE.
- Fix: add it as SR3 check 5 with its observed value recorded in `case-evidence/sr-checks.log`
  (see P1-8), and keep the traceability row pointing at SR3.

### P1-12 `tee` pipelines mask the verifier exit code

- Anchor: plan.md:145-150 (C1 steps), plan.md:160-163 (C2), plan.md:176-181 (C3).
- Evidence: `node ... | tee log` returns `tee`'s status, so the C1/C2/C3 expectation "the
  verifier exits 0" and the RESULT's `## Standard Verification` rows (all must read `0`,
  `verification_exit` in `case.js`) are not actually observed by this recipe.
- Fix: use `set -o pipefail`, or `node ... > log 2>&1; echo "exit=$?" | tee -a log`, and
  change the expectations to quote the captured exit line.

---

## P2 findings

### P2-13 Two step headings pre-claim execution and verification

- Anchor: plan.md:16, plan.md:38 (`[executed 2026-11-05 — verified: ...]`).
- Evidence: the plan is under review before implementation, and step 1's claimed verification
  cannot run at all (P1-4). A reviewer or executor cannot distinguish claim from state.
- Fix: move the status note into a separate "Status" line outside the step heading, or drop it
  until the step has actually run.

### P2-14 Step 1 claims AC3

- Anchor: plan.md:20 (`- Covers: AC1, AC3`).
- Evidence: step 1 freezes the manifest and touches no `task.json` metadata; AC3 is fully
  delivered by step 2.
- Fix: `- Covers: AC1`.

### P2-15 Step 2's Edit points at a non-existent "Phase 1.1" section

- Anchor: plan.md:41.
- Evidence: "`prd.md` owns exactly the content ... as written in Phase 1.1" — the plan has no
  such section and does not embed the PRD body, so the executor cannot reproduce it.
- Fix: state that `prd.md` already exists and is unchanged by this step, and give its expected
  `computeContentHash`/`computeCaseHash` value as the acceptance for that part.

### P2-16 `case-result.md` is a new file without full content

- Anchor: plan.md:216-315.
- Evidence: the two scripts get exact content, the RESULT gets only eight constraint sentences;
  the prescriptive bar in the CASE skill wants every new file's full shape fixed in the plan.
- Fix: embed the template skeleton (front matter plus the seven required sections and the
  Changed Files / Exclusions tables) with explicit `<observed>` markers for run-time values.

### P2-17 Neither verifier handles its own failure inputs

- Anchor: plan.md:223-245 (`verify-archive-bytes.mjs`), plan.md:262-300 (`verify-baseline.mjs`).
- Evidence: a missing archive dir throws from `readdirSync`, a missing worktree throws from
  `execFileSync` or from reading `src/current.txt`; both exit non-zero with a stack trace and
  never print the documented `ARCHIVE_BYTES=failed ...` / `BASELINE=failed ...` line, so the
  failure contract the CASE expectations rely on does not hold.
- Fix: wrap the body in `try { ... } catch (error) { console.error('...=failed reason=' + error.message); process.exit(1) }`.

### P2-18 `verify-archive-bytes.mjs` silently ignores non-regular entries

- Anchor: plan.md:237-243.
- Evidence: only `entry.isDirectory()` and `entry.isFile()` are handled; a symlink or FIFO in
  the archived directory is skipped without a diagnostic (only a symlink *replacing* a file
  surfaces, as `missing`).
- Fix: add an `else` branch that reports the unsupported entry as a mismatch.

### P2-19 CASE `## Coverage` `Scope` is self-contradictory

- Anchor: plan.md:196.
- Evidence: `Scope` names `.workloom/tasks/11-05-.../case-evidence/` — the very tree the
  Exclusions list two lines later excludes as task bookkeeping — while the template's `Scope`
  means coverable project source. With `not_applicable` the reader cannot tell what is
  claimed free of coverage.
- Fix: `- Scope: none — no coverable product file in this task`.

### P2-20 Step 2 lists an existing untracked spec as a file it creates, with no content

- Anchor: plan.md:40-42.
- Evidence: `.workloom/spec/repo/validation/index.md` exists and is untracked (`git status`
  shows `?? .workloom/spec/repo/`); step 2 gives no edit instruction or content for it, yet
  both `implement.jsonl` and `check.jsonl` point at it. The plan's claim that the archive is
  the only frozen input is therefore imprecise about repository state.
- Fix: state the spec's provenance and paste its content into the step, or drop it from
  `Target` and note that it is an input authored earlier in the run.

### P2-21 AC4's "SHA-256 of the current `case.md`" is imprecise

- Anchor: prd.md AC4; plan.md:308 (constraint 1).
- Evidence: core compares `task.case.caseHash` with `computeCaseHash(case.md)`, which first
  normalizes CRLF/CR to LF (`alignment.js` `computeContentHash`). An executor verifying with
  `sha256sum case.md` can report a false mismatch after any line-ending change.
- Fix: state the exact command in the plan, e.g.
  `node --input-type=module -e "import {readFileSync} from 'node:fs'; import {computeCaseHash} from '@workloom-ai/core'; console.log(computeCaseHash(readFileSync('.workloom/tasks/11-05-archived-prd-only-rebuild-validation/case.md','utf8')))"`.

### P2-22 The fixture inventory sentence omits `config.json`

- Anchor: plan.md:11 (design decisions).
- Evidence: the sentence enumerates `.workloom/spec/README.md`, `src/current.txt` and the
  archived material; `.workloom/config.json` is also tracked at `b5a6d81` (verified via
  `git ls-tree -r b5a6d81 -- .workloom`).
- Fix: add `.workloom/config.json` to the inventory, or say "the only tracked non-fixture
  documents".

---

## Summary table

| ID | Severity | Anchor |
| --- | --- | --- |
| P0-1 | P0 | plan.md:98 SR2 check 2 |
| P0-2 | P0 | plan.md:212 traceability AC4 / Runtime Cases |
| P0-3 | P0 | plan.md:6 + missing post-archive step |
| P1-4 | P1 | plan.md:22-36 |
| P1-5 | P1 | plan.md:47 |
| P1-6 | P1 | plan.md:309 |
| P1-7 | P1 | plan.md:307-315 |
| P1-8 | P1 | plan.md:219, 315 |
| P1-9 | P1 | plan.md:49-51, 308 |
| P1-10 | P1 | plan.md:4, 161-176 |
| P1-11 | P1 | plan.md:47, 211 |
| P1-12 | P1 | plan.md:145-181 |
| P2-13 | P2 | plan.md:16, 38 |
| P2-14 | P2 | plan.md:20 |
| P2-15 | P2 | plan.md:41 |
| P2-16 | P2 | plan.md:216-315 |
| P2-17 | P2 | plan.md:223-300 |
| P2-18 | P2 | plan.md:237-243 |
| P2-19 | P2 | plan.md:196 |
| P2-20 | P2 | plan.md:40-42 |
| P2-21 | P2 | prd.md AC4 / plan.md:308 |
| P2-22 | P2 | plan.md:11 |

Open blocking questions for the user (cannot be resolved from the artifacts):

1. Who owns the after-archive byte comparison (P0-3): the check executor, the main session, or
   a project-level `hooks.after_archive` registered before this task was created? The plan
   cannot satisfy AC1's "after this task is archived" clause without a named owner.
2. Is the CASE design session (P1-9) created by the main session before step 4, or is the
   implement executor expected to author and execute the CASE alone? The answer decides
   whether `checkSession` can ever equal `case.designSession`.

---

## Round 2 — 2026-11-05 (re-audit of the revised plan)

Verdict: **closer, still not ready**. 20 of the 22 round-1 findings are properly addressed
(two of them only in intent, see P0-R2-2 and P0-R2-3). The rewrite also introduced three new
blocking defects: step 6 targets an archive path the archive tool never creates, the
static-review command passes the wrong argument, and no step records the check credential the
archive gate demands. New: 3 P0, 2 P1, 9 P2.

### Verified by running, not by reading

- `inspectPlanStructure(plan, prd)` → `[]`: 6 steps, each with `Covers`/`Target`/`Edit`/`Verify`,
  `AC1`-`AC4` all covered.
- `inspectCaseStructure(case.md, prd, {taskRelPath, children: [], changedFiles: []})` → `[]` on
  the CASE extracted from step 4 (headings, SR/C fields, sequential ids, traceability, Coverage
  fields all valid).
- `verify-docs.mjs` on the real `plan.md`/`prd.md`/`task.json` plus the extracted `case.md` →
  `SR=ok sr=19`, exit 0 (with the corrected argument; see P0-R2-2).
- Step 2's `Verify` snippet, run verbatim → `Covers=6 Target=6 Edit=6 Verify=6`,
  `AC1=4 AC2=2 AC3=4 AC4=2`, prd hash `a906cffcfb6c8106fca7dfa8d8128f13fd8435cabb93bd30d57fe83d904cc132`
  — exactly the values the step predicts. `prd.md` has no CR bytes, so raw and LF-normalized
  hashes agree.
- `verify-archive-bytes.mjs` against the real archive and manifest → `ARCHIVE_BYTES=ok files=4`,
  exit 0; the four archived hashes still equal the frozen manifest and
  `git status --porcelain -- .workloom/tasks/archive/prd-source` prints nothing.
- `verify-result-binding.mjs` on a synthetic fixture (confirmed caseHash, matching
  `designSession`, fingerprint log) → `BINDING=ok checks=6`, exit 0.
- `verify-baseline.mjs` failure path → `BASELINE=failed reason=ENOENT: …`, exit 1, no stack
  trace.
- All four extracted verifier scripts pass `node --check`.
- The spec text embedded in step 2 is byte-identical to `.workloom/spec/repo/validation/index.md`.

### Disposition of the round-1 findings

| Round-1 | Status | Evidence |
| --- | --- | --- |
| P0-1 | fixed | SR2 check 2 (plan.md:150) now scopes `prd-only` to R2 and `## Alignment Decisions`, and `plan.md` to R2, `## Notes`, `## Alignment Decisions`; all three are true in the unchanged prd.md |
| P0-2 | fixed | C4 (plan.md:243-283) with `verify-result-binding.mjs` (plan.md:455-500) and `| AC4 | SR5 | C4 |` (plan.md:285); verifier green on a fixture |
| P0-3 | **partially** | step 6 exists with an owner and a retained log, but both the command and the Verify line use an archive path the tool never creates (P0-R2-1) |
| P1-4 | fixed | step 1 Verify is `sha256sum`, manifest `tool` rewritten; values match |
| P1-5 | fixed | snippet runs and prints the predicted counts and hash |
| P1-6 | fixed | absolute script path, `> code-fingerprint.log` redirect, `exit=` capture; residual path fragility is P2-R2-1 |
| P1-7 | fixed | constraint 7 (plan.md:518) requires `## Resolved Findings` |
| P1-8 | **partially** | `verify-docs.mjs` is correct and green, but the documented invocation cannot run (P0-R2-2) |
| P1-9 | **partially** | ownership now stated (plan.md:14) and tools named in steps 3-6, but the check credential is never recorded (P0-R2-3) and step 3 invents an unsupported restore (P1-R2-1) |
| P1-10 | fixed | step 3 (plan.md:88-98) start + worktree + HEAD check; matches `createTaskWorktree` and `TaskStatus.IN_PROGRESS` |
| P1-11 | fixed in text | SR3 check 5 (plan.md:164); its automated evidence is weaker (P2-R2-4) |
| P1-12 | fixed | every command captures `exit=<code>` and `test "$code" -eq 0`; no bare `| tee` |
| P2-13 | fixed | `- Status:` lines outside headings (plan.md:18, 40, 173, 198, 297, 526) |
| P2-14 | fixed | step 1 `- Covers: AC1` |
| P2-15 | fixed | prd hash recorded and independently verified |
| P2-16 | fixed | ten binding constraints plus the canonical template |
| P2-17 | fixed | all four verifiers `try/catch`; failure contract reproduced for `verify-baseline.mjs` |
| P2-18 | fixed | non-regular entries reported before hashing (duplicate check is P2-R2-3) |
| P2-19 | fixed | `- Scope: none - … the coverable file scope is empty` (plan.md:271) |
| P2-20 | fixed | embedded spec byte-identical to the file |
| P2-21 | fixed | verifier normalization matches `normalizeContentEol` (`\r\n|\r` → `\n`) |
| P2-22 | fixed | `.workloom/config.json` in the inventory |

---

## New P0 findings

### P0-R2-1 Step 6 targets an archive path the archive tool never creates

- Anchor: plan.md:528 (Target), plan.md:530 (command), plan.md:533 (Verify), plan.md:15.
- Evidence: `archiveTaskInternal` (`packages/core/src/domain/task-store.js`) computes
  `archiveRel = join('tasks', 'archive', formatYearMonth(now), task.name)`; `formatYearMonth`
  yields `YYYY-MM`; `task.name` is `archived-prd-only-rebuild-validation` (no `11-05-` prefix,
  see `task.json`). The real post-archive directory is therefore
  `.workloom/tasks/archive/2026-11/archived-prd-only-rebuild-validation/`, while the plan uses
  `.workloom/tasks/archive/11-05-archived-prd-only-rebuild-validation/` — missing the month
  segment and using the directory basename instead of `task.name`. Both the command and the
  Verify line resolve to a non-existent script and log, so the AC1/R7 after-archive evidence
  cannot be produced. (The fixture's flat `.workloom/tasks/archive/prd-source` is a
  hand-built archive, not the tool's layout, which is presumably where the wrong shape came
  from.)
- Fix: state the archive layout rule in step 6 and use the real path, e.g.
  `archived=$(ls -d .workloom/tasks/archive/*/archived-prd-only-rebuild-validation | tail -1)`
  before running `node "$archived/case-evidence/verify-archive-bytes.mjs"`; or hardcode
  `.workloom/tasks/archive/2026-11/archived-prd-only-rebuild-validation/...` and say why
  (`{{YYYY-MM}}` of `completedAt`, `task.json.name`).

### P0-R2-2 The static-review command passes the wrong task argument

- Anchor: plan.md:521 (constraint 10), which is the only producer of `case-evidence/sr-checks.log`.
- Evidence: `verify-docs.mjs` builds `taskDir = join(projectRoot, '.workloom', taskRelPath)
  (plan.md:407), but constraint 10 passes `.workloom/tasks/11-05-…` as `taskRelPath`. Running
  the documented form yields
  `SR=failed reason=ENOENT: no such file or directory, open '.workloom/.workloom/tasks/11-05-archived-prd-only-rebuild-validation/prd.md'`,
  exit 1, so `test "$code" -eq 0` fails and the SR evidence can never be retained. Passing
  `tasks/11-05-archived-prd-only-rebuild-validation` instead prints `SR=ok sr=19`, exit 0
  (verified).
- Fix: either pass `tasks/11-05-archived-prd-only-rebuild-validation` in constraint 10, or drop
  the leading `.workloom` in the script (`join(projectRoot, taskRelPath)`); pick one contract
  and state it in the constraint.

### P0-R2-3 No step records the check credential the archive gate requires

- Anchor: plan.md:289-522 (step 5), plan.md:524-533 (step 6); `workloom_task_check` appears
  zero times in the plan.
- Evidence: `archiveTaskInternal` refuses when `task.check === null`
  (“run workloom_task_check after 2.2 passes”); `checkTaskInternal` requires
  `status === in_progress`, runs `evaluateCaseOutcomeGate`, then writes `task.check` and
  `task.case.result = {caseHash, resultHash, passedAt}` from `case-result.md`. Without that
  call, step 6's `workloom_task_archive` fails before moving anything, and the post-archive
  comparison never runs.
- Fix: add an execution substep at the end of step 5: after C1-C4 pass and the RESULT is final,
  the main session runs `workloom_task_check` with a summary, then verify in `task.json` that
  `check.passedAt` is set and `case.result.resultHash` equals `computeCaseHash(case-result.md)`;
  state that step 6 runs only after this record exists.

---

## New P1 findings

### P1-R2-1 Step 3 prescribes a restore that does not happen and a manual `task.json` write

- Anchor: plan.md:96 (step 3 item 3).
- Evidence: `git worktree add -b <branch> <path> <base>` (`packages/core/src/domain/git.js:379-380`)
  never switches the main checkout, which is already on `master`, so there is nothing to
  “re-check out”. `TOOL_NAMES` (`packages/core/src/surface.ts`) exposes eight task tools and none
  of them updates `meta`, so appending `previousBranch` and `activationRestored` means hand-editing
  a workloom-owned record outside the tool surface. Neither key appears in AC3's metadata list, so
  they add risk without acceptance value.
- Fix: delete item 3 and both keys; `meta.validationRef: master` plus
  `meta.validationBranch: null` already record that the current branch is the validation ref.

### P1-R2-2 Constraint 1 leaves the `codeBaseline` scalar shape open, and a `: ` inside it breaks the RESULT

- Anchor: plan.md:512 (constraint 1).
- Evidence: core parses the RESULT front matter with `yaml`. Tested with
  `packages/core/node_modules/yaml`: `codeBaseline: ref: master; source: 640b400…; codeFingerprint=…`
  raises “Nested mappings are not allowed in compact mappings”, which `parseDocument` turns into
  `frontmatter_invalid`, so `evaluateCaseOutcomeGate` rejects the whole RESULT before content
  checks. A comma-separated single line without `: ` parses as a string and passes (verified).
- Fix: prescribe the exact value in constraint 1, e.g.
  ``codeBaseline: workloom/11-05-archived-prd-only-rebuild-validation @ b5a6d81569a4399c20dc4c636b8f5b1cf3ce7b8f, ref source default-current-branch, reason "Default current target branch", source 640b4005ac43df5d50e2f761aef563aa4fd8e71e, codeFingerprint=<64-hex>``,
  and add “every front-matter value stays an unquoted single-line scalar; no `: ` inside a
  value”.

---

## New P2 findings

### P2-R2-1 C4 runs the fingerprint script from another task's worktree

- Anchor: plan.md:251 (C4 step 1).
- Evidence: the path
  `/data00/…/workloom/.workloom/worktree/11-03-case-archived-skill/packages/assets/skills/workloom-case-active/scripts/task-fingerprint.mjs`
  exists today and is byte-identical (`f4486081…`) to the main checkout's copy, but a task
  worktree is removed by archive cleanup, so the command is only durable while task 11-03 is
  live.
- Fix: point at the main checkout (`/data00/…/workloom/packages/assets/skills/workloom-case-active/scripts/task-fingerprint.mjs`)
  or resolve it once and record the resolved path in the step.

### P2-R2-2 `verify-result-binding.mjs` takes `worktreeRoot` and never uses it

- Anchor: plan.md:460, plan.md:468, C4 step 2 (plan.md:253).
- Evidence: `worktreeRoot` is only checked for presence; the fingerprint comes solely from the
  log file, so the argument suggests an independence the check does not have.
- Fix: either drop the parameter (and update C4 step 2 and the plan text), or import
  `computeTaskFingerprint` from the canonical script and recompute it from `worktreeRoot`, with
  the log as a cross-check.

### P2-R2-3 `verify-archive-bytes.mjs` repeats the unsupported-entry check

- Anchor: plan.md:322 and plan.md:338.
- Evidence: `unsupported` is computed once and tested before hashing, then tested again after the
  hash loop; the second branch is unreachable.
- Fix: delete the second `if (unsupported.length > 0) fail(...)`.

### P2-R2-4 Two `verify-docs.mjs` checks are weaker than the SR text they evidence

- Anchor: plan.md:429 (`sr2-prd-names-material-mode-and-missing-plan`), plan.md:434
  (`sr3-prd-alignment-condition`).
- Evidence: the first only asserts `prd.includes('prd-only') && prd.includes('plan.md')`, not the
  section-scoped claims of SR2 check 2; the second repeats the four headings already asserted by
  `sr2-prd-shape` and never reads `task.alignment.prdHash`, so SR3 check 5's alignment claim has
  no automated evidence.
- Fix: assert the R2 line and the `## Alignment Decisions` block explicitly, and add
  `task.alignment?.prdHash === computeContentHash(prd)` (or drop the alignment claim from SR3
  check 5 and let step 2's recorded hash carry it).

### P2-R2-5 `verify-result-binding.mjs`'s front-matter parser is not YAML

- Anchor: plan.md:475-487.
- Evidence: the naive `split(':')` parser keeps quotes and stops at `:` inside values, so a quoted
  `caseHash: "…"` or a folded value compares unequal even though core's `yaml` accepts it.
- Fix: strip a matching pair of surrounding quotes in the parser (or state in constraint 1 that
  scalars are unquoted, which also resolves P1-R2-2).

### P2-R2-6 Step 5's own Verify does not cover C4 or the static-review run

- Anchor: plan.md:522 (step 5 Verify).
- Evidence: it re-runs `verify-archive-bytes.mjs`, `verify-baseline.mjs` and one `grep`; the step
  can read green while `verify-docs.mjs` (constraint 10) or C4's binding verifier fails. The SR log
  run exists only inside a RESULT constraint, not as a step action.
- Fix: add the two missing commands to step 5's Verify
  (`grep -q 'SR=ok sr=19' …/sr-checks.log`, `grep -q 'BINDING=ok checks=6' …/c4-binding.log`) and
  move the `verify-docs.mjs` run from constraint 10 into step 5's Steps.

### P2-R2-7 The post-archive log name implies a C5 case that does not exist

- Anchor: plan.md:528-533 (`c5-post-archive-bytes.log`).
- Evidence: the CASE has C1-C4; a `c5-` prefix suggests a fifth runtime case and also sits outside
  constraint 9's evidence set, so a reader cannot tell whether the CASE is incomplete.
- Fix: rename it `post-archive-bytes.log` and note in step 6 that it is archive-phase evidence,
  not a CASE item.

### P2-R2-8 Step 6's evidence has no recorded destination

- Anchor: plan.md:526-533.
- Evidence: the post-archive log is written after `workloom_task_check` and after the RESULT
  (`validateReferencedFiles` cannot see it), and no step says where its outcome is recorded, so a
  later reader of the journal or task record has no pointer to it.
- Fix: state that the check summary and the journal entry cite the post-archive log path, and that
  the RESULT deliberately cannot include it.

### P2-R2-9 Step 4 does not distinguish the design session from the main session

- Anchor: plan.md:100-102 (step 4 Status) versus plan.md:287 (step 4 Verify).
- Evidence: the Status line assigns `case.md` authoring to the design dispatch, but the Verify line
  reads as if the same actor runs `workloom_task_case action=review`, which is main-session only;
  an executor can read the step as either actor.
- Fix: split the two sentences: “the design session writes `case.md`; the main session then runs
  `workloom_task_case` action=review, presents the hash, and confirms after a new user message”.

---

## Round-2 summary

| ID | Severity | Anchor |
| --- | --- | --- |
| P0-R2-1 | P0 | plan.md:528-533 (step 6 archive path) |
| P0-R2-2 | P0 | plan.md:521 (constraint 10 argument) |
| P0-R2-3 | P0 | plan.md:289-533 (missing `workloom_task_check`) |
| P1-R2-1 | P1 | plan.md:96 (step 3 item 3) |
| P1-R2-2 | P1 | plan.md:512 (constraint 1 scalar shape) |
| P2-R2-1 | P2 | plan.md:251 (fingerprint path) |
| P2-R2-2 | P2 | plan.md:460, 468 |
| P2-R2-3 | P2 | plan.md:322, 338 |
| P2-R2-4 | P2 | plan.md:429, 434 |
| P2-R2-5 | P2 | plan.md:475-487 |
| P2-R2-6 | P2 | plan.md:522 |
| P2-R2-7 | P2 | plan.md:528-533 |
| P2-R2-8 | P2 | plan.md:526-533 |
| P2-R2-9 | P2 | plan.md:100-102, 287 |

Blocking items for the next round: P0-R2-1, P0-R2-2, P0-R2-3 must be fixed before
implementation; P1-R2-1 and P1-R2-2 should be fixed in the same pass because each changes the
text of a step the P0 fixes already touch (step 3, step 5 constraints).

---

## Round 3 — 2026-11-05 (re-audit of the second revision)

Verdict: **one blocker left, plus one regression**. 13 of the 14 round-2 findings are fixed and
independently reproduced; P1-R2-1 is still open (the helper it now cites does not exist in any
durable checkout and cannot be invoked the way step 3 describes), and the fix for P2-R2-6
introduced a new P1 (step 5's Verify requires `@workloom-ai/core`, which does not resolve from
the project). New: 1 P0, 1 P1, 5 P2.

### Verified by running

- `inspectPlanStructure(plan, prd)` → `[]`; `inspectCaseStructure(case.md, prd, …)` → `[]` on the
  CASE extracted from step 4.
- `verify-docs.mjs . tasks/11-05-archived-prd-only-rebuild-validation` on a copy of the task with
  an injected `alignment.prdHash` → `SR=ok sr=20`, exit 0; it fails as designed without `case.md`
  or without the alignment credential.
- `verify-archive-bytes.mjs` → `ARCHIVE_BYTES=ok files=4`, exit 0; with a symlink added to a copy
  of the archive → `ARCHIVE_BYTES=failed reason=unsupported-entries=["link.txt"]`, exit 1.
- `verify-result-binding.mjs <taskDir> <fingerprint-log>` → `BINDING=ok checks=6`, exit 0; with a
  log that lacks the fingerprint → `BINDING=failed reason=failed=["result-code-baseline-carries-the-canonical-fingerprint"]`,
  exit 1.
- Constraint 1's exact `codeBaseline` line parses through `yaml` as a string and carries the
  fingerprint.
- A mock RESULT built strictly to constraints 1-9 against the real CASE passes
  `evaluateCaseOutcomeGate` in a committed git fixture with **zero issues** (coverage, exclusions,
  summary, Resolved Findings, Open issues, referenced evidence all agree).
- `node -e "require('@workloom-ai/core')"` from the project root → `MODULE_NOT_FOUND` (see
  P1-R3-1).
- All four scripts pass `node --check`; archived bytes and `git status --porcelain` on
  `.workloom/tasks/archive/prd-source` are unchanged.

### Disposition of the round-2 findings

| Round-2 | Status | Evidence |
| --- | --- | --- |
| P0-R2-1 | fixed | step 6 uses `.workloom/tasks/archive/2026-11/archived-prd-only-rebuild-validation/` (plan.md:549-553) and the layout rule is stated (plan.md:16); matches `archiveTaskInternal`'s `join('tasks','archive',YYYY-MM,task.name)` |
| P0-R2-2 | fixed | the argument contract is stated in the step and constraint 10 passes `tasks/11-05-…`; reproduced `SR=ok sr=20` |
| P0-R2-3 | fixed | constraint 11 (plan.md:541), step 5 Status (plan.md:294) and step 5 Verify (plan.md:542) record and assert the check credential; step 6 gates on it (plan.md:546) |
| P1-R2-1 | **open** | the cited helper is not tracked at HEAD and has no runnable form; the `meta` write still has no tool (P0-R3-1) |
| P1-R2-2 | fixed | constraint 1 (plan.md:527-532) prescribes the exact unquoted line; YAML parse returns a string containing the fingerprint |
| P2-R2-1 | fixed | C4 step 1 now uses `<repo>/packages/assets/skills/workloom-case-active/scripts/task-fingerprint.mjs` (plan.md:254), which exists |
| P2-R2-2 | fixed | `verify-result-binding.mjs` has a two-argument signature (plan.md:455-476) and the unused parameter is gone from C4 |
| P2-R2-3 | fixed | `verify-archive-bytes.mjs` tests `unsupported` once (plan.md:322) |
| P2-R2-4 | fixed | `verify-docs.mjs` asserts the R2 regex, the Alignment Decisions block and `task.alignment.prdHash` (plan.md:42-48); reproduced at 20/20 |
| P2-R2-5 | fixed | the front-matter parser strips matching quotes (plan.md:483-486) |
| P2-R2-6 | fixed, caused P1-R3-1 | step 5 Verify greps `SR=ok sr=20` and `BINDING=ok checks=6` (plan.md:542), but its last command cannot resolve `@workloom-ai/core` |
| P2-R2-7 | fixed | `post-archive-bytes.log` (plan.md:549-552) with the archive-phase explanation |
| P2-R2-8 | fixed | step 6 states that the check summary and the journal entry cite the log path (plan.md:552) |
| P2-R2-9 | fixed | step 4 separates the design session from the main session (plan.md:105, 290) |

---

## New P0 finding

### P0-R3-1 Step 3's validation-ref restore cites a helper that is not tracked, not invocable, and followed by an unsupported `meta` write

- Anchor: plan.md:95 (Target), plan.md:99 (item 3), plan.md:101 (Verify).
- Evidence:
  1. `packages/assets/skills/workloom-case-archived` is not in the repository at the current HEAD:
     `git ls-tree -r e34d111 --name-only | grep -c case-archived` is `0`, and the workloom
     checkout's `packages/assets/skills/` contains only the seven other skills. The only copy on
     disk is **untracked** inside another task's worktree
     (`.workloom/worktree/11-03-case-archived-skill/packages/assets/skills/workloom-case-archived/`,
     `git status` shows `?? packages/assets/skills/workloom-case-archived/`), i.e. exactly the
     non-durable location the plan's own design decision rules out for the fingerprint
     (plan.md:10-14).
  2. The helper is an ES module export, not a CLI subcommand: `archived-tasks.mjs` CLI handles only
     `list` and `snapshot` and otherwise throws
     `usage: node archived-tasks.mjs list | snapshot <tasks/archive/...>`, so “runs the helper
     `restoreRef`” has no runnable form in the plan and none can be derived from the script's CLI.
  3. `previousBranch` and `activationRestored` appear nowhere in workloom code (no hit under
     `packages/*/src` or `packages/*/dist`), and none of the eight task tools writes `meta`, so the
     two keys can only be produced by hand-editing `task.json`. Step 3's Verify (plan.md:101) then
     requires `meta.activationRestored` to be `true`, so the only way to pass the step is an
     unsupported manual write of a workloom-owned record.
- Fix: delete item 3, the two `meta` keys in Target, and the `meta.activationRestored` clause in
  Verify — this is the round-2 recommendation and it costs nothing: `meta.validationRef: master`
  plus `meta.validationBranch: null` already record that the current branch is the validation ref,
  and AC3 with SR4 does not mention either key. If the restore is genuinely wanted, then (a) point
  at a tracked copy with an absolute path, (b) spell the invocation
  `node --input-type=module -e "import {restoreRef} from '<abs>/archived-tasks.mjs'; restoreRef(process.cwd(), 'master')"`,
  and (c) keep the record out of `task.json` (put it in the check summary).

---

## New P1 finding

### P1-R3-1 Step 5's Verify requires `@workloom-ai/core`, which does not resolve from the project

- Anchor: plan.md:542 (last command of step 5 Verify).
- Evidence: `node -e "const {computeCaseHash}=require('@workloom-ai/core'); …"` executed from the
  project root fails with `MODULE_NOT_FOUND`. `@workloom-ai/core` is a pnpm workspace package;
  neither the project root nor the workloom repository root has a `node_modules/@workloom-ai/core`
  entry, so the credential assertion added by P0-R2-3 cannot pass as written.
- Fix: compute the same value with `node:crypto` (LF-normalize, then SHA-256 — the rule
  `computeCaseHash` applies), e.g.
  `node -e "const {createHash}=require('node:crypto'); const fs=require('node:fs'); const n=(s)=>s.replace(/\r\n/g,'\n').replace(/\r/g,'\n'); const d='.workloom/tasks/11-05-archived-prd-only-rebuild-validation'; const t=JSON.parse(fs.readFileSync(d+'/task.json','utf8')); console.log(t.check.passedAt, t.case.result.resultHash === createHash('sha256').update(n(fs.readFileSync(d+'/case-result.md','utf8')),'utf8').digest('hex'))"`,
  or run the existing check from a directory where core resolves and say so explicitly.

---

## New P2 findings

### P2-R3-1 The check-credential action lives only inside a RESULT constraint

- Anchor: plan.md:541 (constraint 11) versus plan.md:292-542 (step 5 Edit/actions).
- Evidence: step 5's action list creates scripts and logs; the `workloom_task_check` call that the
  step's Verify depends on appears only as one item in the RESULT constraint list, and the step
  never says the Verify runs after it. An executor that builds the RESULT and runs the logs in
  order hits the Verify before the credential exists (reading `t.check.passedAt` of `null`).
- Fix: add `workloom_task_check` as an explicit final numbered action of step 5 (“after the RESULT
  is final”), and state that the step's Verify runs last.

### P2-R3-2 Step 6 forwards-references a log that cannot exist when the check summary is written

- Anchor: plan.md:552, plan.md:546.
- Evidence: the check summary is recorded in step 5, before archiving; step 6 says that summary
  “cites the log path” of `post-archive-bytes.log`, which does not exist yet. The journal entry is
  mentioned but no step names `workloom_journal` or who writes it with what content.
- Fix: cite the post-archive log from the journal entry written in step 6 (name the tool and the
  content), and either drop the claim about the step-5 summary or label it a forward reference.

### P2-R3-3 “Committed verifier script” is inaccurate

- Anchor: plan.md:10.
- Evidence: the design decision says each runtime case “runs a committed verifier script”, but the
  scripts live under `.workloom/tasks/11-05-…/case-evidence/`, which is untracked in this fixture
  (`git status` shows the whole task directory as `??`), and no step commits them.
- Fix: say “retained verifier script” (or “a script inside the task evidence directory”).

### P2-R3-4 Worktree cleanliness is defined two ways

- Anchor: plan.md:370 (`--untracked-files=no` in `verify-baseline.mjs`), plan.md:101 (step 3
  Verify uses the same flag), versus the CASE gate.
- Evidence: `gitChangedFilesSync` (used by `evaluateCaseOutcomeGate` and `listCaseChangedFiles`)
  includes untracked files, so any stray untracked file in the worktree passes C3 and step 3 but
  fails the CASE gate with `changed_file_unreviewed`.
- Fix: drop `--untracked-files=no` from `verify-baseline.mjs` and from step 3's Verify, and assert a
  fully clean worktree, which is what the gate actually enforces.

### P2-R3-5 Step 6 hardcodes a month-derived path while stating the layout rule

- Anchor: plan.md:549-553 (`2026-11` in both commands) versus plan.md:16 (rule with `<YYYY-MM>`).
- Evidence: the design decision says the segment is the archive month, but both commands hardcode
  `2026-11`; a run that spans a month boundary, or a re-run in a later month, writes and reads the
  wrong directory while the rule still claims otherwise.
- Fix: resolve it once
  `archived=$(ls -d .workloom/tasks/archive/*/archived-prd-only-rebuild-validation | tail -1)` and
  use `$archived` in the command and in the Verify, or state that the timestamp is frozen by the
  plan's own date and note the assumption.

---

## Round-3 summary

| ID | Severity | Anchor |
| --- | --- | --- |
| P0-R3-1 | P0 | plan.md:95, 99, 101 (step 3 item 3) |
| P1-R3-1 | P1 | plan.md:542 (step 5 Verify) |
| P2-R3-1 | P2 | plan.md:541 versus 292-542 |
| P2-R3-2 | P2 | plan.md:552, 546 |
| P2-R3-3 | P2 | plan.md:10 |
| P2-R3-4 | P2 | plan.md:370, 101 |
| P2-R3-5 | P2 | plan.md:549-553 |

Round-1 and round-2 dispositions are otherwise closed. One blocker remains: P0-R3-1 disappears
entirely if step 3 item 3 is deleted, which is a smaller edit than the one that introduced it. The
CASE, the four runtime cases and the eleven RESULT constraints are now consistent with each other
and with the core gate, as the mock-fixture outcome run shows.

---

## Round 4 — 2026-11-05 (re-audit of the third revision, last planned round)

Verdict: **no P0 left**. One P1 remains: step 6's journal entry cannot run as written (the project
has no `.workloom/.developer`, and the archived `taskPath` argument is never stated). Three P2s
remain, all wording or robustness. Everything the acceptance criteria depend on is executable and
consistent: the CASE, the four runtime cases and the twelve RESULT constraints pass the real gates,
which I re-ran end to end.

### Verified by running

- `inspectPlanStructure(plan, prd)` → `[]`; `inspectCaseStructure(case.md, prd, …)` → `[]` on the
  CASE extracted from step 4.
- `verify-docs.mjs . tasks/11-05-archived-prd-only-rebuild-validation` (with an injected
  `alignment.prdHash`) → `SR=ok sr=20`, exit 0.
- `verify-archive-bytes.mjs` on the real archive → `ARCHIVE_BYTES=ok files=4`, exit 0.
- `verify-result-binding.mjs <taskDir> <fingerprint-log>` → `BINDING=ok checks=6`, exit 0.
- `verify-baseline.mjs` against a **real pristine linked worktree at `b5a6d81`** →
  `BASELINE=ok head=b5a6d81569a4399c20dc4c636b8f5b1cf3ce7b8f checks=9`, exit 0; with one stray
  untracked file → `BASELINE=failed reason=failed=["worktree-is-pristine"] … status="?? stray.txt"`,
  exit 1. Both directions of the new pristine rule work.
- Step 3's clean check `git status --porcelain -- . ':(exclude).workloom/**' ':(exclude).pi/**'`
  prints nothing in this project.
- Step 5's Verify credential command (node:crypto) prints `2026-11-05T10:50:00.000Z true`, exit 0.
- A mock RESULT built from the plan's own constraint-1 `codeBaseline` line against the real CASE
  passes `evaluateCaseOutcomeGate(…, {requireResultRecord: true})` with **zero issues**.
- All four scripts pass `node --check`; archived hashes unchanged; my temporary linked worktree was
  removed (`git worktree list` shows one entry).

### Disposition of the round-3 findings

| Round-3 | Status | Evidence |
| --- | --- | --- |
| P0-R3-1 | fixed | item 3 is plain git (plan.md:102); the clean check prints nothing; the helper is gone from the step. Residual: the two `meta` keys and their justification (P2-R4-1) |
| P1-R3-1 | fixed | the node:crypto command prints the timestamp and `true`, exit 0 |
| P2-R3-1 | fixed | constraint 11 (plan.md:544) lists the eight actions in order and puts the Verify last |
| P2-R3-2 | fixed in text, new precondition gap | constraint 12 (plan.md:545) and step 6 item 3 (plan.md:556) name `workloom_journal`; that tool has two unstated preconditions (P1-R4-1) |
| P2-R3-3 | fixed | “a verifier script retained in this task's `case-evidence/` directory … task evidence artefacts, not committed product source” (plan.md:10) |
| P2-R3-4 | fixed | `worktree-is-pristine` with plain `git status --porcelain`; `BASELINE=ok … checks=9` on a real pristine worktree, `failed=["worktree-is-pristine"]` once a file is added |
| P2-R3-5 | fixed | step 6 resolves `$archived` in the command (plan.md:554) and in the Verify (plan.md:558) |

---

## New P1 finding

### P1-R4-1 Step 6's `workloom_journal` entry cannot be recorded: no developer identity, and the archived `taskPath` is unstated

- Anchor: plan.md:556 (step 6 item 3), plan.md:558 (step 6 Verify), plan.md:548-556 (step 6 body).
- Evidence:
  1. `workloom_journal` refuses to record anything without a local identity: `executeJournalEntry`
     calls `readExistingDeveloper`, which reads `.workloom/.developer`, and throws
     `workloom command: no developer identity found; run the workloom init command first`
     (`packages/core/src/service/command-ops.ts:50-58, 195-207`). This project has no `.developer`:
     `ls -a .workloom` shows only `config.json`, `.runtime`, `sessions`, `spec`, `tasks`, `workspace`.
     I reproduced the exact error by calling `executeJournalEntry(<project>,
     {taskPath:'tasks/11-05-archived-prd-only-rebuild-validation', title:'archive-phase outcome'})`.
     `.developer` is a gitignored per-machine file that `workloom init` creates
     (`packages/core/src/domain/init.js:294-298`), and no step creates or checks it.
  2. The tool also validates that a task exists at `taskPath` (`readTaskOrThrow`), and `taskPath` is
     required. After step 6's archive the task lives at
     `tasks/archive/<YYYY-MM>/archived-prd-only-rebuild-validation` relative to `.workloom`; the step
     only says the entry should “name the archived task path”, never that `taskPath` must be that
     archived relative path, and passing the pre-archive `tasks/11-05-…` would be rejected.
  3. Step 6's Verify requires “the journal entry for this task cites the log path and its result”,
     so the step cannot be completed as written.
  No acceptance criterion depends on the journal entry: AC1's evidence is the post-archive log
  written in item 1, before the journal. The gap blocks step 6's own completion criterion.
- Fix: add to step 6 before item 3: (a) `test -s .workloom/.developer || printf '%s\n' "<developer>" > .workloom/.developer`
  (and say the file is per-machine and gitignored, or that `workloom init` creates it); (b) call
  `workloom_journal` with `taskPath` = the archived path relative to `.workloom`
  (`tasks/archive/<YYYY-MM>/archived-prd-only-rebuild-validation`, i.e. `$archived` minus the
  `.workloom/` prefix), `title`, and a `summary` that names the log path and
  `ARCHIVE_BYTES=ok files=4`; (c) add the identity precondition and the archived `taskPath` to the
  step's Verify. Alternatively drop item 3 and the journal clause of the Verify.

---

## New P2 findings

### P2-R4-1 The two `meta` keys are justified by a contract that no artifact states

- Anchor: plan.md:14 (design decision), plan.md:102 (step 3 item 3), plan.md:104 (step 3 Verify).
- Evidence: the decision says “the archived-CASE contract requires both keys”, but
  `.workloom/spec/repo/validation/index.md` has 0 matches for `previousBranch` or
  `activationRestored`, PRD AC3 and SR4 list nine `meta` keys without them, and the only occurrences
  of `previousBranch` anywhere are internal variables of the untracked archived-skill script. The
  step also asks for “an explicit JSON edit” without giving the command, and its Verify then requires
  `meta.activationRestored`.
- Fix: give the exact one-liner, e.g. `node -e "const fs=require('node:fs');const p='.workloom/tasks/11-05-archived-prd-only-rebuild-validation/task.json';const t=JSON.parse(fs.readFileSync(p,'utf8'));t.meta.previousBranch='master';t.meta.activationRestored=true;fs.writeFileSync(p,JSON.stringify(t,null,2)+'\n')"`,
  and either cite a requirement that exists or drop the keys and the Verify clause — nothing in
  AC1-AC4 needs them.

### P2-R4-2 The archive-path guard does not stop the command chain

- Anchor: plan.md:554 (step 6 item 1).
- Evidence: `archived=$(…); test -n "$archived"; node "$archived/case-evidence/verify-archive-bytes.mjs" …`
  — the separators are `;`, so an empty resolution falls through and runs
  `node "/case-evidence/verify-archive-bytes.mjs"` before the final `test "$code" -eq 0` fails.
- Fix: `archived=$(…) && test -n "$archived" && node …`, or `test -n "$archived" || { echo "archive dir not found" >&2; exit 1; }`.

### P2-R4-3 The check-summary forward reference keeps a literal placeholder

- Anchor: plan.md:545 (constraint 12).
- Evidence: the constraint tells the main session to name
  `.workloom/tasks/archive/<YYYY-MM>/archived-prd-only-rebuild-validation/…` in the recorded check
  summary; `<YYYY-MM>` is a pattern, and the recorded credential would carry it verbatim if copied.
  At check time the archive month is already known.
- Fix: say that the summary carries the concrete path for the current archive month (for this run
  `2026-11`), and keep `<YYYY-MM>` only in the rule statement.

---

## Round-4 summary

| ID | Severity | Anchor |
| --- | --- | --- |
| P1-R4-1 | P1 | plan.md:556, 558 (step 6 journal) |
| P2-R4-1 | P2 | plan.md:14, 102, 104 |
| P2-R4-2 | P2 | plan.md:554 |
| P2-R4-3 | P2 | plan.md:545 |

Final position: **no P0 remains**. AC1-AC4 are satisfiable by the plan as written — the archived
bytes, the baseline identity, the PRD-only documents and the RESULT binding all have runnable
checks whose commands I reproduced. The single P1 blocks only step 6's own journal requirement and
has a two-line fix. Every earlier round-1, round-2 and round-3 finding is closed except P2-R4-1,
which is the residual of the round-3 P0 and is a justification/robustness issue, not a functional
one.
