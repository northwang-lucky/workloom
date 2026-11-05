tasks/11-05-archived-legacy-validation:mw3c2i7csr1sg0y8

# Plan Review: tasks/11-05-archived-legacy-validation

Round 1 — 2026-11-05. Reviewer: plan-review executor. Scope audited: `plan.md` (4 steps) against `prd.md`, the archived legacy pair, and the real framework code (`packages/core/src/domain/{case,task-gates,worktree}.js`, `packages/assets/skills/workloom-case-{active,archived}/SKILL.md`, `packages/assets/templates/case-result.md`).

Path base note: all paths below are relative to the project root of this task's checkout; the task lives at `.workloom/tasks/11-05-archived-legacy-validation/`.

## Verdict

The plan is structurally sound and satisfies the plan-authoring bar: H1 title, `## Design decisions`, `## Steps`, four `#### 步骤 ` blocks each carrying `Covers`/`Target`/`Edit`/`Verify`, and every AC1–AC5 referenced by at least one `Covers` line (this matches `inspectPlanStructure`, `packages/core/src/domain/task-gates.js:338-380`). The archived manifest values in step 1.1 are correct, and the baseline claims in step 1.2 are true.

Blocking defects are concentrated in step 1.4: it assigns CASE authoring/execution to the plan without producing `case.md` or passing the CASE confirmation gate, its RESULT skeleton is missing fields that the core outcome gate requires, and step 1.1 asserts a byte-identity that is provably unsatisfiable. Three P0 findings follow.

## Findings

### P0-1 Step 1.4 executes CASE without authoring `case.md` or passing the CASE gate

- Severity: P0
- Anchor: `plan.md:74-83` (`#### 步骤 1.4 execute-case-and-record-result`), `Covers: AC2, AC5`; `Edit` at line 78; `Target` at line 77 names `case.md`, but no step in `## Steps` creates it.
- Evidence: the task directory currently holds only `check.jsonl`, `design.md`, `implement.jsonl`, `implement.md`, `plan.md`, `prd.md`, `task.json` — no `case.md`, no `case-result.md`. `prd.md` AC5 requires `workloom_task_case` action=review to return `readyToConfirm: true`, a user-approved `caseHash`, and `task.case.caseHash` equal to the current hash of `case.md`. `task.json` still has `"case": null`. The gate in `packages/core/src/domain/case.js:636` also requires `sessionChainReaches(task, meta.checkSession, task.case.designSession)`, and the archived-validation skill fixes the role split: a check executor designs then executes the CASE (`packages/assets/skills/workloom-case-active/SKILL.md:28,37,45`; `workloom-case-archived/SKILL.md` Step 4-5). An implement-stage executor writing `case-result.md` cannot satisfy the session chain, and `caseHash` has no source value.
- Fix: replace step 1.4 with implement-stage steps that only record baseline facts, and add explicit CASE-gate steps with the executing role named in each: (a) `#### 步骤 1.4 record-baseline-facts` — implement executor writes `case-evidence/baseline-head.txt`, `case-evidence/baseline-branch.txt`, `case-evidence/baseline-src-current-txt.txt`, `case-evidence/code-fingerprint.txt`; (b) `#### 步骤 1.5 author-case` — check executor dispatch `kind: check, purpose: case-design` writes `case.md` with the required sections (`References`, `Scope`, `Static Review`, `Runtime Cases`, `Coverage`, `Traceability`) and SR/C items whose `Covers` cite the current ACs; (c) `#### 步骤 1.6 confirm-case` — main session runs `workloom_task_case` action=review, records `caseHash`, stops for user approval, then action=confirm writes `task.case.caseHash`; (d) `#### 步骤 1.7 execute-case` — check executor continues with `purpose: execution` and writes `case-result.md` with `checkSession` = design session.

### P0-2 Step 1.4's RESULT skeleton fails the core outcome gate

- Severity: P0
- Anchor: `plan.md:78` (`Edit` of step 1.4).
- Evidence: `evaluateCaseOutcomeGate` (`packages/core/src/domain/case.js:601-715`) requires, in addition to `version: 1`, `task`, `caseHash`, a non-empty `codeBaseline`, `status: passed`, `startedAt`, `completedAt`, and `checkSession`; and it requires the body sections `Summary`, `Static Review Results`, `Runtime Results`, `Coverage`, `Standard Verification`, `Resolved Findings`, `Open issues` (last one exactly `- none`). It further requires at least one `Standard Verification` row with exit code `0` (`verification_commands`), `Summary` coverage status equal to `Coverage.Status`, and SR/C result ids equal to the CASE ids. The plan prescribes only `version`, `task`, `caseHash`, `codeBaseline`, item statuses, coverage status and `## Open issues`. Executing it as written produces `result_section`, `result_status`, `result_started`, `result_completed`, `result_session` and `verification_commands` issues, which block `workloom_task_check`.
- Fix: prescribe the full front matter and section skeleton, referencing `packages/assets/templates/case-result.md` by path, and state the standard verification table for this task (the step 1.1 manifest command, the step 1.2 git commands, the step 1.3 `test`/`grep` pair, each with exit code `0`), plus `Resolved Findings: - none` and `Open issues: - none`.

### P0-3 Step 1.1 asserts a byte-identity that cannot hold

- Severity: P0
- Anchor: `plan.md:32` (`Expected` of step 1.1), `edit` target at line 19.
- Evidence: the artifact created by step 1.1 is six `<sha256>  <path>` text lines (verified identical to the real files). The "manifest captured before this task started" is `.workloom/.runtime/case-archived-legacy-source.manifest.json`, a 509-byte JSON object (`{"check.jsonl": "...", ...}`, 6 keys, verified). Byte-for-byte identity between a JSON object and six plain lines is impossible, so a literal reading of the `Expected` sentence fails AC1 even though the hashes match exactly.
- Fix: restate the expectation as two separate comparisons: (1) the recomputed six-line output must be byte-identical to `case-evidence/archive-manifest-after.txt` (`diff` exits 0); (2) every per-file hash must equal the corresponding value in `.workloom/.runtime/case-archived-legacy-source.manifest.json`, compared as a hash map (e.g. a `node -e` that reads both and prints `MANIFEST_EQUAL 6/6`). Keep `prd.md` AC1's "every listed hash unchanged" as the pass criterion.

### P1-1 `codeBaseline` is prescribed as a structure, but the parser requires one string

- Severity: P1
- Anchor: `plan.md:78` — "`codeBaseline` recording `validationCommit=...`, `validationRefSource=...` ...".
- Evidence: `case.js:632` rejects any `codeBaseline` that is not a non-empty string (`result_baseline`), and the template shows a scalar (`codeBaseline: <branch-head-worktree-or-selected-ref>`). A nested YAML mapping is the natural reading of "recording X, Y, Z" and would fail the gate; AC5's `codeFingerprint=<64-hex>` lookup also becomes ambiguous.
- Fix: give the exact single-line value, e.g. `codeBaseline: validationCommit=c36a6fd4dd73132ca8e2b21fe154ecc3ab8fae6d, validationRefSource=user-specified, validationReason=User-selected ref c36a6fd4dd73132ca8e2b21fe154ecc3ab8fae6d, sourceCommit=c36a6fd4dd73132ca8e2b21fe154ecc3ab8fae6d, codeFingerprint=<hex>`, and require the `<hex>` to be copied from the Verify output verbatim.

### P1-2 AC2 says "inside the validation worktree"; every Verify block says "run from the project root"

- Severity: P1
- Anchor: `plan.md:28,46,67,79` (all four `Verify` blocks) versus `prd.md` AC2 ("execute the documented commands ... inside the validation worktree").
- Evidence: the commands are project-root relative: `.workloom/tasks/archive/legacy-source` and `.workloom/tasks/11-05-archived-legacy-validation` do not exist inside the worktree at `c36a6fd` (tree there is `.gitignore`, `.workloom/config.json`, `.workloom/spec/README.md`, `archive/legacy-source/*`, `src/current.txt` — verified via `git ls-tree -r c36a6fd`). Running the step 1.1 command with the worktree as cwd would print `0` lines or throw; step 1.2's `git -C .workloom/worktree/...` would fail. A check executor following AC2 literally reports a false failure.
- Fix: add one line under `## Steps` stating the working directory contract — all commands run from the project root (main checkout); the validation worktree is addressed only via `-C`/path arguments, which is what "inside the validation worktree" means for AC2 — and repeat it as the first line of each `Expected`.

### P1-3 No post-run archive re-verification, and step 1.3 checks existence instead of hashes

- Severity: P1
- Anchor: `plan.md:15-33` (step 1.1 runs before any write) and `plan.md:69-72` (step 1.3 verifies only `test -f`).
- Evidence: `prd.md` R1 requires the archive to stay byte-identical "for the whole validation run", and AC4 requires the archived `design.md`/`implement.md` to be "unchanged" after the migration. Step 1.1 captures the manifest before steps 1.2-1.4 write into the task directory; step 1.3 (the only step that deletes anything) proves existence, not hashes. `workloom-case-archived/SKILL.md` Step 5.4 makes the recomputation before completion mandatory. Nothing in the plan detects an accidental write into the archive after 1.1.
- Fix: add a final step (e.g. `#### 步骤 1.5 recheck-archive-integrity`) that re-runs the step 1.1 command, diffs the output against `case-evidence/archive-manifest-after.txt`, and asserts the two legacy hashes `e5faf3e3...f501` and `d60747d1...b64a`; in step 1.3, replace the two `test -f` clauses with a `sha256sum` comparison against those values.

### P1-4 The fingerprint command depends on another task's worktree staying alive

- Severity: P1
- Anchor: `plan.md:81`.
- Evidence: the command hard-codes `/data00/home/wangyubo.1219/workbench/code-src/github/workloom/.workloom/worktree/11-03-case-archived-skill/packages/assets/skills/workloom-case-active/scripts/task-fingerprint.mjs`. The file exists and runs (verified: prints `codeFingerprint=<64 hex>`, exit 0), and its output format matches AC5. But it lives in a task worktree of the workloom repository, not in this project; worktree cleanup removes those on archive, after which the AC5 verification command fails and the recorded fingerprint cannot be re-derived. The plan also does not say why this canonical path (the one named in `workloom-case-archived/SKILL.md` Step 5.2 as `../workloom-case-active/scripts/task-fingerprint.mjs`) was chosen.
- Fix: make the dependency explicit and guarded — add `test -f <path>/task-fingerprint.mjs || { echo "fingerprint script missing; stop and report"; exit 1; }` as a precondition line, note in `## Design decisions` that this is the skill-shipped script and the only permitted implementation, and state that a missing script stops the run instead of substituting an inline reimplementation.

### P2-1 Two different branches are mentioned without being distinguished

- Severity: P2
- Anchor: `plan.md:8` (`workloom/validation-archived-legacy-validation`) versus `plan.md:37,52` (`workloom/11-05-archived-legacy-validation`).
- Evidence: both names are real and both are correct in their own role. The first is the validation ref branch (`task.json.meta.validationBranch`, currently at `c36a6fd`; verified by `git branch -v`). The second is the worktree branch rendered from the default template `workloom/<task-id>` (`packages/core/src/domain/worktree.js:322`, `packages/core/src/domain/config.js:61`; the project's `.workloom/config.json` sets no `branch_template`). A reader can mistake them for a contradiction and "repair" the wrong one.
- Fix: add one clause to the second Design-decisions bullet: the ref branch is the source of the baseline; `start` creates the task worktree on `workloom/<task-id>` = `workloom/11-05-archived-legacy-validation` at `c36a6fd`, and AC3's branch assertion applies to the worktree branch only.

### P2-2 R3's "provably not the current HEAD" has no inequality assertion

- Severity: P2
- Anchor: `plan.md:46-52` (step 1.2 `Verify`).
- Evidence: `prd.md` R3 says the baseline is "provably *not* the current HEAD (`1058f66...`)". Step 1.2 records the worktree HEAD and `src/current.txt`, and the main checkout HEAD is never captured, so the inequality is only implied by the `base`/`current` payload. AC3's own commands do not require the comparison, so this is a clarity gap rather than a gate failure.
- Fix: append `git rev-parse HEAD` (main checkout) to the step 1.2 command list, record it as `case-evidence/main-head.txt`, and add the assertion "main HEAD = `1058f6641f4d104179d633ec0bc04c499e605002`, worktree HEAD = `c36a6fd...`, the two differ".

### P2-3 Evidence is transcribed by hand instead of captured by the commands

- Severity: P2
- Anchor: `plan.md:38-45` (step 1.2 writes `baseline-head.txt` with a literal sha), `plan.md:58-66` (step 1.3 writes `migration-check.txt` with literal `present`/`removed` lines), `plan.md:19-27` (step 1.1 writes the manifest literally), `plan.md:77` (`coverage/` listed as a target but never populated).
- Evidence: hand-transcribed evidence can disagree with the command output and still look green; the plan cannot distinguish "captured" from "typed". `coverage/` is required only for `generated` coverage, and this task's coverage is `not_applicable`, so the directory stays empty while being advertised as a target.
- Fix: produce each artifact by redirection from its command (`git ... rev-parse HEAD > case-evidence/baseline-head.txt`, `node -e '...' > case-evidence/archive-manifest-after.txt`), then `diff` against the expectation; drop `coverage/` from the step 1.4 `Target` or state that it stays empty because coverage is `not_applicable`.

### P2-4 CASE-side coverage shape and lifecycle completion steps are unspecified

- Severity: P2
- Anchor: `plan.md:78` (coverage clause of step 1.4) and the absent final steps of `## Steps`.
- Evidence: `case.js:679-697` requires the CASE `## Coverage` section to carry the same Exclusions rows (path + reason) as the RESULT, an empty Changed Files table, and `Overall lines: N/A` when status is `not_applicable`; the plan names only "the recorded exclusion reason" (singular) and never mentions the CASE-side table. Separately, the archived-validation skill Step 5.3-5.4 requires a `workloom_task_check` record and a commit on the task branch before archiving, and the plan has no such step.
- Fix: prescribe the exact Coverage blocks for both `case.md` and `case-result.md` (Status `not_applicable`, `Overall lines: N/A`, empty Changed Files table, a single `Exclusions` row with the path `.workloom/**` and the read-only-verification reason), and add a closing step for `workloom_task_check` plus the task-branch commit/archive sequence.

## Dimension summary

| Dimension | Result |
| --- | --- |
| Conformance | Pass on structure and field bar; fails on step 1.4 (no `case.md` authoring step, incomplete RESULT skeleton) — P0-1, P0-2 |
| Fidelity | AC1-AC5 all cited; AC1 comparison wording is unsatisfiable (P0-3); AC2 working-directory mismatch (P1-2); R3 inequality evidence missing (P2-2); R1 whole-run guarantee unverified (P1-3) |
| Feasibility | Manifest, git, `test`/`grep`, and fingerprint commands all verified runnable; worktree branch expectation matches `workloom/<task-id>`; portability risk on the absolute fingerprint script path (P1-4) |
| Quality | Authoring approach is reasonable (evidence-only, no product code, `not_applicable` coverage is legal per `case.js:679-697`); evidence should be captured not typed (P2-3), CASE coverage shape and lifecycle steps missing (P2-4) |

## Verification log (commands run, trimmed)

1. Re-ran the step 1.1 command verbatim: exit 0, six lines; all six hashes equal `.workloom/.runtime/case-archived-legacy-source.manifest.json` (JSON, 6 keys).
2. `git branch -v --all`: `master` = `1058f66` ("current validation target"); `workloom/validation-archived-legacy-validation` = `c36a6fd` ("archived fixture base"). `git rev-parse HEAD` = `1058f6641f4d104179d633ec0bc04c499e605002`; `src/current.txt` = `current`.
3. `git show c36a6fd:src/current.txt` = `base`; `git ls-tree -r c36a6fd` shows 10 paths, root layout under `.workloom/`, so `.workloom/worktree/11-05-archived-legacy-validation` matches `packages/core/src/domain/worktree.js:334`.
4. Branch template: `packages/core/src/domain/config.js:61` default `workloom/<task-id>`; the project `.workloom/config.json` has no override → expected worktree branch `workloom/11-05-archived-legacy-validation` (step 1.2 expectation confirmed).
5. `.workloom/worktree/` does not exist yet (framework-created, expected); `.gitignore` ignores `.workloom/worktree/`, `.workloom/.runtime/`, `.pi/`.
6. Ran the step 1.4 fingerprint command against the project root: exit 0, `codeFingerprint=c9d29b5999070441155d0a4fdd35973db005b8268409776cc21cfe68672423c5`; script path exists and is the canonical `workloom-case-active` script.
7. Read `packages/core/src/domain/case.js` (RESULT/CASE schemas, outcome gate, coverage rules), `packages/core/src/domain/task-gates.js:315-380` (plan structure gate), `packages/assets/templates/case-result.md`, `packages/assets/skills/workloom-case-active/SKILL.md`, `packages/assets/skills/workloom-case-archived/SKILL.md`.
8. `ls .workloom/tasks/11-05-archived-legacy-validation/`: no `case.md`, no `case-result.md`, no `case-evidence/`, no `plan-review.md` before this report; `task.json.case = null`.

## Open questions (blocking items for the main session)

None. Every finding is actionable from the plan text and the verified framework behavior; no plan or PRD content is ambiguous in a way that requires a user decision.

---

## Round 2 — revised plan (2026-11-05)

Scope: revised `plan.md` (127 lines) against the unchanged `prd.md` (hash verified `91d8fcd4e095cc817871e002760dde509e57be8e67c87ed8984c42195808a26d`) and the live framework state. The validation worktree now exists at `.workloom/worktree/11-05-archived-legacy-validation` on branch `workloom/11-05-archived-legacy-validation` at `c36a6fd4dd73132ca8e2b21fe154ecc3ab8fae6d` with a clean status; the main checkout is on `master` at `1058f6641f4d104179d633ec0bc04c499e605002`; `task.json` is `in_progress` with `base_branch = workloom/validation-archived-legacy-validation`, `case.caseHash = null`, a running `purpose: case-design` dispatch. Plan-structure gate re-run on the real code (`inspectPlanStructure(plan, prd)` from `packages/core/src/domain/task-gates.js`) returns `[]`.

### Judgement on the 1.4a–1.4e sub-step device (asked explicitly)

Sound:

1. The framework plan gate is unaffected: `inspectPlanStructure` splits steps on `^####\s+步骤\s+\S+`, and the bold sub-step bullets create no extra step blocks. Re-ran the function against the revised plan and PRD: `[]` — 4 steps, AC1–AC5 all covered.
2. AC2's fixed range is preserved: no new top-level step, so "steps 1.1–1.4" in the confirmed PRD still names exactly the documented commands.
3. The roles match the real constraints: `workloom_task_case` is main-session-only (`packages/adapter-dsh/src/tasks.ts:322`), the confirm is a user decision, and `case.md` / `case-result.md` are authored by the check executor (`packages/assets/skills/workloom-case-active/SKILL.md:28,45`). The revised plan assigns exactly these.
4. Each sub-step carries its own Target/Edit/Verify, so the prescriptive bar is met inside the step rather than lost.

Unsound:

1. 1.4e packs post-check actions (check record, commit, archive, journal) into a plan step. Both readings are broken: if the plan's steps run in order and then the check stage runs, the check executor finds the task archived and the worktree removed; if the main session defers 1.4e past the check stage, the step's own "done when ... archived with `status: completed`" verification cannot be satisfied during implementation.
2. Three of 1.4e's actions have concrete failures (P0-R2-1, P0-R2-2, P1-R2-9 below): the archive precondition is unmet, the commit is infeasible and moves the worktree HEAD, and the `workloom_journal` taskPath no longer resolves after archiving.

Conclusion: keeping 1.4a–1.4d inside 步骤 1.4 is a sound way to dispose of round-1 P0-1 (the lifecycle and role split are now genuinely present, not just described). 1.4e should be reframed as a hand-off executed after the check stage: state the checkout alignment, the preconditions, that AC3/AC5 evidence is captured before archiving, and drop the commit.

### Round-1 closure (verified, not assumed)

| Round-1 finding | Status | Verified by |
| --- | --- | --- |
| P0-1 (CASE lifecycle missing) | Closed as to presence and role split | 1.4a–1.4e at `plan.md:78-111`; role constraints re-read at `adapter-dsh/src/tasks.ts:322` and `workloom-case-active/SKILL.md:28,45`; `task.json` shows the `case-design` dispatch running |
| P0-2 (RESULT skeleton incomplete) | Closed except two literal defects (P0-R2-3, P1-R2-4) | `plan.md:98-102` now lists `checkSession`, `status`, `startedAt`, `completedAt` and the seven required sections |
| P0-3 (unsatisfiable byte-identity) | Closed | Ran both commands: six hashes match the archive and the map comparison prints `MANIFEST_EQUAL 6/6` |
| P1-1 (`codeBaseline` type) | Closed | The single-line scalar parses via the `yaml` package as `typeof string` and matches `/codeFingerprint=[0-9a-f]{64}/` |
| P1-2 (working-directory ambiguity) | Closed | Contract stated once at `plan.md:18` and applied by every Verify block |
| P1-3 (whole-run archive recheck) | Partially closed | 1.3 now compares `sha256sum` (both values verified correct); the recheck itself is unexecutable as ordered — P1-R2-8 |
| P1-4 (unguarded script dependency) | Closed | Guard at `plan.md:82` plus the Design decision at `plan.md:13`; ordering nit remains (P2-R2-13) |
| P2-1 (two confusable branches) | Closed | `plan.md:9` names both and scopes the assertion to the worktree branch |
| P2-2 (no inequality proof) | Closed | `plan.md:48-57` captures the main HEAD; live values `1058f66…` vs `c36a6fd…` differ |
| P2-3 (hand-transcribed evidence) | Partially closed | Redirects used in 1.1/1.2/1.3; `coverage/` is still in the 1.4 Target — P2-R2-10 |
| P2-4 (CASE coverage shape / lifecycle) | Partially closed | CASE exclusions row and the check/archive sequence are present; the RESULT row cannot be parsed — P0-R2-3 |

### Open findings

#### P0-R2-1 The archive step cannot run: the main checkout is not on `task.base_branch`

- Severity: P0
- Anchor: `plan.md:108-111` (sub-step 1.4e, `workloom_task_archive`).
- Evidence: `task.json.base_branch = "workloom/validation-archived-legacy-validation"` while the main checkout is on `master` (verified by `git branch -v --all` and `git worktree list`). The default cleanup mode is `rebase-keep-branch` (`packages/core/src/domain/config.js:64`; the project `.workloom/config.json` sets only `worktree.enabled`), so `cleanupTaskWorktree` takes the `INTEGRATE_MODES` path and calls `assertMainHeadOnBaseBranch` (`packages/core/src/domain/worktree.js:429-444`), which returns `main checkout HEAD is "master", expected base branch "workloom/validation-archived-legacy-validation" at <project root>; align the checkout before re-running archive`. `archiveTask` throws on that error before renaming anything, and no code path switches branches first (`packages/core/src/service/task-ops.ts:409-430`).
- Fix: add the precondition explicitly to 1.4e: switch the main checkout to `task.json.base_branch` (`git switch workloom/validation-archived-legacy-validation`), capture `git rev-parse --abbrev-ref HEAD` as evidence, run the archive, then restore `task.json.meta.previousBranch` (`master`) and capture the restore. Note that after the switch the main checkout's `src/current.txt` becomes `base`, so the `main-head.txt` / `src/current.txt` evidence must stay the pre-switch captures of 步骤 1.2.

#### P0-R2-2 The task-branch commit is infeasible and breaks AC3 and AC5

- Severity: P0
- Anchor: `plan.md:110` ("commit the task's own artifacts on the task branch in the validation worktree with message `chore(validation): record archived CASE verification`").
- Evidence: (a) the task artifacts live in the main checkout at `.workloom/tasks/11-05-archived-legacy-validation/` and are untracked there (`git status --porcelain` = `?? .workloom/tasks/11-05-archived-legacy-validation/`; `git check-ignore` exits 1, so the path is not ignored); the worktree at `c36a6fd` is clean and has nothing staged, so a commit there fails with "nothing to commit" (and an empty commit is prohibited). (b) If the executor copies the artifacts into the worktree and commits, the worktree HEAD moves off `c36a6fd`, so AC3's `git -C <worktree> rev-parse HEAD` no longer prints the baseline, and `task-fingerprint.mjs` hashes the HEAD oid (`hash.update('HEAD\0' + head + ...)`), so the recorded `codeFingerprint` becomes stale — AC5's independent rerun no longer matches. (c) The archive then rebases/ff-merges the task branch into `master`, where the same `.workloom/tasks/11-05-…` paths exist untracked, so git refuses the fast-forward ("untracked working tree files would be overwritten") and the archive is blocked. (d) No commit is needed: `packages/assets/workflow/workflow.md:119` keeps journal and task-metadata bookkeeping in the main repository, and `workflow.md:126` states that archiving and journaling each produce their own auto-commit.
- Fix: delete the commit sentence. Order becomes: 1.4d captures the fingerprint and the RESULT → check stage verifies AC1–AC5 → 1.4e aligns the checkout, records the check, archives (auto-commit of bookkeeping), journals. If a code commit is ever needed for a task that does change product code, it must be made on the task branch and the fingerprint re-recorded afterwards.

#### P0-R2-3 The RESULT Exclusions row cannot be parsed, so `workloom_task_check` fails

- Severity: P0
- Anchor: `plan.md:102` ("an `### Exclusions` table whose single row is `` | `src/**` | fixture payload asserted by content comparison in C2, not coverable product code | ``").
- Evidence: the RESULT side is parsed by `tableExclusions` in `packages/core/src/domain/case.js`, whose regex requires **both** cells in inline code (`/^\|\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|/`). Ran the pattern against the plan's literal row → `null`; the CASE bullet row parses to `{src/**: "fixture payload …"}`. The gate then compares the two maps (`sameExclusions`) and reports `coverage_exclusions` ("RESULT Exclusions must match CASE paths and reasons"), which blocks the check at 1.4e.
- Fix: write the row as `` | `src/**` | `fixture payload asserted by content comparison in C2, not coverable product code` | `` — backticks around the reason cell — or drop the reason from both sides and use a single identical token.

#### P1-R2-4 The RESULT section is named `Runtime Cases`, but the gate requires `Runtime Results`

- Severity: P1
- Anchor: `plan.md:102` ("`Runtime Cases` results (one `### Cn` block per CASE C item …)").
- Evidence: `CASE_STRUCTURE.resultSections` (`packages/core/src/domain/case.js:29-37`) requires `Summary`, `Static Review Results`, `Runtime Results`, `Coverage`, `Standard Verification`, `Resolved Findings`, `Open issues`. A `## Runtime Cases` heading produces `result_section` ("RESULT section "Runtime Results" is missing").
- Fix: name the section `Runtime Results`; keep the `### Cn` blocks inside it.

#### P1-R2-5 步骤 1.3's expected block contradicts the captured output, and the capture's exit code proves nothing

- Severity: P1
- Anchor: `plan.md:65` (capture) versus `plan.md:69` (expected).
- Evidence: ran the exact brace group — it emits `plan.md: present`, `prd.md: present`, `task design.md: removed`, `task implement.md: removed`, `archived design.md: present`, `archived implement.md: present`, i.e. the archived pair last; the Expected block lists the archived pair first. AC2 requires the recorded output to match the expected result, so a literal comparison fails. Additionally `{ …; }` exits with the status of the last `test`, so a failing earlier `test` still yields exit `0`.
- Fix: reorder the Expected lines to the emission order and add a real comparison (`diff` against the literal block, or `test "$(wc -l < …)" = 6 && grep -c …`), instead of relying on the group exit code.

#### P1-R2-6 The template anchors do not resolve in this project

- Severity: P1
- Anchor: `plan.md:88` (`packages/assets/templates/case.md`), `plan.md:98` (`packages/assets/templates/case-result.md`).
- Evidence: `packages/` does not exist under the project root (`ls packages` → "No such file or directory"); the same assets are reachable only at the absolute skill worktree path that the plan already uses for the fingerprint script (`plan.md:82,104`). The plan therefore mixes one correct absolute anchor with two dangling relative ones.
- Fix: state the asset root once (the absolute `…/packages/assets` path used by the fingerprint script) and reference `templates/case.md` and `templates/case-result.md` from it, or mark the two relative paths as "relative to the workloom repository worktree".

#### P1-R2-7 The plan never states that AC3/AC5 can only be verified before 1.4e archives

- Severity: P1
- Anchor: `plan.md:108-111` (1.4e), interacting with `plan.md:44-57` (1.2) and `plan.md:96-106` (1.4d).
- Evidence: archiving removes the validation worktree (`packages/core/src/domain/worktree.js:630-640`, step 6 "worktree 删除") and moves the task directory under `.workloom/tasks/archive/`. After 1.4e, `git -C .workloom/worktree/11-05-archived-legacy-validation rev-parse HEAD` (AC3) and the fingerprint rerun (AC5) can no longer be executed, so the check stage or any later audit can only read the recorded evidence files.
- Fix: state in 1.4e that AC1/AC3/AC5 are verified from the captures of 步骤 1.1/1.2/1.4d before archiving, and that no post-archive command re-derives them; if a post-archive check is wanted, it must read the archived copies explicitly.

#### P1-R2-8 The whole-run archive recheck is unexecutable as ordered

- Severity: P1
- Anchor: `plan.md:42` ("re-run the capture command above into a second file, then `diff` the two captures") and `plan.md:111` (1.4e depends on that diff).
- Evidence: the "second file" has no path, and the recheck is placed after 步骤 1.4, when 1.4e has archived the task: `archiveTaskInternal` renames the directory to `.workloom/tasks/archive/<YYYY-MM>/<task.name>` (`packages/core/src/domain/task-store.js:1505`, `formatYearMonth` → `2026-11`, so `.workloom/tasks/archive/2026-11/archived-legacy-validation`). The first capture's path `.workloom/tasks/11-05-archived-legacy-validation/case-evidence/archive-manifest-after.txt` no longer exists at that point, so the `diff` has no input.
- Fix: name the second file (`case-evidence/archive-manifest-final.txt`), run the recheck at the end of 1.4d (before archiving) and diff there; for a post-archive recheck, use the archived path returned by the archive tool.

#### P1-R2-9 The journal call uses the pre-archive `taskPath` after archiving

- Severity: P1
- Anchor: `plan.md:110` ("archive the task with `workloom_task_archive` (taskPath = `tasks/11-05-archived-legacy-validation`); record the session with `workloom_journal`").
- Evidence: `workloom_journal` → `executeJournalInternal` → `readTaskOrThrow` → `readTask(root, taskRelPath)`, which reads `join(root, taskRelPath, 'task.json')` with no archive lookup (`packages/core/src/domain/task-store.js:305-333`). After archiving, `tasks/11-05-archived-legacy-validation/task.json` is gone, so the call fails with "task.json missing".
- Fix: journal before archiving, or pass the archived path printed by the archive result (`tasks/archive/2026-11/archived-legacy-validation`) and state that the month segment comes from the archive result rather than being hard-coded.

#### P2-R2-10 `coverage/` is still advertised as a 1.4 target, and the disposition overstates its removal

- Severity: P2
- Anchor: `plan.md:74` (`Target` still lists `coverage/`) versus `plan.md:75` ("`coverage/` is deliberately **not** created"); the disposition claims the same at `plan.md:123`.
- Evidence: the Target line still names the directory; the disposition says it is "no longer advertised as a target". Both cannot be true, and AC2/coverage checks read the plan.
- Fix: remove `coverage/` from the Target and correct the disposition sentence.

#### P2-R2-11 步骤 1.3 instructs deleting files that no longer exist

- Severity: P2
- Anchor: `plan.md:62` ("Delete the migrated-from legacy copies `design.md` and `implement.md`").
- Evidence: the task directory no longer contains either file (removed before this round: the listing shows only `case-evidence/`, `check.jsonl`, `implement.jsonl`, `plan.md`, `plan-review.md`, `prd.md`, `task.json`). A literal `rm` fails; the Verify's `test ! -e` passes either way.
- Fix: make the edit idempotent — "delete if present" — and note the files were already removed at migration time.

#### P2-R2-12 `case-evidence/` is never created before the first redirect

- Severity: P2
- Anchor: `plan.md:23` (first capture writes `case-evidence/archive-manifest-after.txt`).
- Evidence: the directory exists now (it holds `code-fingerprint.txt` from a prior capture: `codeFingerprint=c8b55f3bdce3f74f69c34dbc11c5b38702f3d5e94d66bb9d446a4b7fb6fce32c`, matching a fresh run), but nothing in the plan creates it and the first command redirects into it, so on a clean task directory step 1.1 fails.
- Fix: add `mkdir -p .workloom/tasks/11-05-archived-legacy-validation/case-evidence` as the first command of 步骤 1.1.

#### P2-R2-13 1.4a's artifact is produced in 1.4d, so 1.4a cannot be verified at its own end

- Severity: P2
- Anchor: `plan.md:79-84`.
- Evidence: `code-fingerprint.txt` is listed as 1.4a's Target and created "by redirecting the stdout of the fingerprint command in 1.4d", while 1.4a's Verify states "the fingerprint command in 1.4d prints exactly one line". The sub-step is therefore verified by a later sub-step, which breaks the per-sub-step verification claim.
- Fix: either move the fingerprint capture into 1.4a (which is legitimate — the worktree is already at the baseline) or drop `code-fingerprint.txt` from 1.4a's Target.

#### P2-R2-14 "an empty Changed Files table" is ambiguous against the template

- Severity: P2
- Anchor: `plan.md:102`.
- Evidence: `tablePaths` (`packages/core/src/domain/case.js`) treats any row whose first cell is inline code as a changed-file path; the template row `` | `<path>` | `<n>/<n>` | … | `` would be parsed as `<path>` and trigger `coverage_files` ("not_applicable requires an empty Changed Files table").
- Fix: specify "header row only; delete the `<path>` placeholder row".

#### P2-R2-15 The CASE item field sets that the review gate enforces are not enumerated

- Severity: P2
- Anchor: `plan.md:88-89` (1.4b).
- Evidence: `inspectCaseStructure` requires `Scope` fields `Requirements` / `Acceptance criteria` / `Out of scope`, SR fields `Covers` / `Target` / `Checks` / `Expected`, C fields `Covers` / `Preconditions` / `Steps` / `Expected` / `Evidence` / `Cleanup`, and `validateTraceability` requires every AC row to reference at least one existing SR or C id. 1.4b's Verify demands an empty `structureIssues` list, so these field lists are gate-relevant, and the plan only says "SR items" / "C items" / "one row per AC1–AC5".
- Note: the risk is documentation-only in practice — the `case.md` written by the running case-design dispatch (13788 bytes, 17:29) already passes `inspectCaseStructure(…, {taskRelPath, changedFiles: []})` with `0` issues, because the cited template carries the fields.
- Fix: cite the field lists and the traceability rule (the cited `templates/case.md` already shows them; name it as the field source).

#### P2-R2-16 1.4b's Verify attributes the review call to the case-design dispatch

- Severity: P2
- Anchor: `plan.md:89` ("`workloom_task_case` action=review returns `readyToConfirm: true` ..." inside 1.4b, whose role is the check executor).
- Evidence: `workloom_task_case` is main-session-only (`packages/adapter-dsh/src/tasks.ts:322`), so the review in 1.4b's Verify is a main-session action performed after the dispatch returns, not part of the subagent's work.
- Fix: say "after the dispatch returns, the main session runs `workloom_task_case` action=review".

### Verification log (round 2)

1. `inspectPlanStructure(revised plan, prd)` via node against `packages/core/src/domain/task-gates.js` → `[]`.
2. `grep -c '^#### 步骤 '` → `4`; the four sub-steps are bold bullets, not headings.
3. Re-ran the 1.1 capture and map check: six hashes match the archive; `MANIFEST_EQUAL 6/6`.
4. Re-ran the 1.3 brace group to stdout: emission order is plan, prd, task design, task implement, archived design, archived implement; exit `0`; `sha256sum` of the archived pair matches `e5faf3e3…f501` and `d60747d1…b64a`.
5. Worktree state: HEAD `c36a6fd…`, branch `workloom/11-05-archived-legacy-validation`, `src/current.txt` = `base`, `git status --porcelain` empty. Main: `master` at `1058f66…`.
6. Fingerprint of the worktree now: `codeFingerprint=c8b55f3bdce3f74f69c34dbc11c5b38702f3d5e94d66bb9d446a4b7fb6fce32c`; equals the existing `case-evidence/code-fingerprint.txt`.
7. Parsed the plan's `codeBaseline` scalar with the `yaml` package → `typeof string`, fingerprint regex matches.
8. Regex checks against the plan's literal exclusion rows: CASE bullet parses to one entry, RESULT table row → `null`.
9. Code reads: `worktree.js:429-444` (base-branch assertion), `worktree.js:454-640` (clean check, rebase/ff, worktree removal), `task-store.js:305-333` (`readTask`), `task-store.js:1505` (archive path), `config.js:64,69` (default cleanup), `task-ops.ts:409-430` (archive entry), `command-ops.ts` journal path, `workflow.md:119,126`.
10. Task directory listing: `case-evidence/` now exists with `code-fingerprint.txt`; `design.md` / `implement.md` are already gone; `task.json` is `in_progress` with `base_branch = workloom/validation-archived-legacy-validation` and `case.caseHash = null`.

### Open questions (round 2)

None. The three P0 items have deterministic fixes in the plan text; no user decision is required beyond the already-recorded baseline choice.
