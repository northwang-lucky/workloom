tasks/11-05-validate-archived-plan-source:mw3a3x6e7zk3dyoj

# Plan Review: validate-archived-plan-source

## Round 1

Verdict: **not ready** — 1 P0, 7 P1, 5 P2. The plan is structurally sound and its acceptance coverage mapping is complete, but step 1.5 is self-contradictory (a commit and an unchanged HEAD cannot both hold), the two credentials that AC3 demands are never recorded by any step, and several `Verify` lines are prose comparisons or unresolvable placeholders rather than runnable commands.

### Inputs and method

- Read `prd.md`, `plan.md`, `task.json`, the archived original (`prd.md`, `plan.md`, `case.md`, `case-result.md`, `task.json`), `.workloom/config.json`, `.workloom/spec/README.md`, the canonical `packages/assets/templates/case.md` and `case-result.md`, the core gates in `packages/core/src/domain/{case,task-gates,alignment,config,git,journal}.js`, and the `workloom-case-archived` skill contract.
- Live checks run in the project root: `git rev-parse HEAD` → `0c9bb6e95eaccaf5c869bd45c81fdd1a7b8480bc`; `git rev-parse --abbrev-ref HEAD` → `master`; `git status --porcelain` → ` M .workloom/config.json`, `?? .workloom/tasks/11-05-validate-archived-plan-source/`.
- Ran plan structure gate `inspectPlanStructure(plan.md, prd.md)` → `[]` (no missing fields, no uncovered AC). Covers map: 1.1→AC2, 1.2→AC1, 1.3→AC3, 1.4→AC4, 1.5→AC5; no unknown AC refs.
- Ran step 1.1's exact `node -e` command → `provenance-ok 0c9bb6e95eaccaf5c869bd45c81fdd1a7b8480bc`, exit 0. The stated expected output is accurate.
- Ran `archived-tasks.mjs snapshot tasks/archive/plan-source` (resolved to `.workloom/worktree/11-03-case-archived-skill/packages/assets/skills/workloom-case-archived/scripts/archived-tasks.mjs`) → JSON with exactly 7 entries, exit 0. Ran `task-fingerprint.mjs` on the project root → `codeFingerprint=63381f126841386d027dece5539d6a94e008d1611b4f7c205d3cb37ec925ba46`, exit 0.
- Found the pre-task manifest the plan refers to but never names: `/tmp/wl-archived-manifest-before.json` (7 entries, mtime 16:16, before task creation at 16:19); `diff` against a fresh snapshot is currently empty.

### Findings

#### P0-1 — Step 1.5's commit and AC5's unchanged-HEAD assertion cannot both hold

- Anchor: `plan.md:52` (`commit the task bookkeeping with git commit`; `... so the project HEAD stays at the validation commit`) and `plan.md:53` (`git rev-parse HEAD still prints 0c9bb6e...`); contradicted by `prd.md` R9 ("its own commit") and AC5 ("`git rev-parse HEAD` ... is still `0c9bb6e...`").
- Why it fails as written:
  1. `git status --porcelain` shows nothing staged (` M` is worktree-only, `??` is untracked), so a bare `git commit` exits non-zero with "no changes added to commit". The step's own `Edit` command fails.
  2. Any working commit (`git add -A && git commit`, or `git commit -am`) moves `HEAD` off `0c9bb6e`, so the step's `Verify` and AC5 fail. There is no validation branch (`task.json.meta.validationBranch = null`), so no branch can absorb the commit while `master` stays put.
  3. Even without the explicit commit, `workloom_journal` auto-commits: `DEFAULT_CONFIG.sessionAutoCommit = true` (`packages/core/src/domain/config.js:37`), gated at `packages/core/src/domain/journal.js:228`, and `gitAddCommit` runs `git commit -m` (`packages/core/src/domain/git.js:97-99`). `.workloom/workspace/` is not gitignored (`.gitignore` lists only `.pi/`, `.workloom/.runtime/`, `.workloom/worktree/`), so journaling alone moves `HEAD`.
  4. The fingerprint hashes `HEAD` as an input (`task-fingerprint.mjs` `HEAD\0...`), so any post-commit re-run of the AC4 fingerprint also stops matching.
- Fix (needs a user decision first; the plan cannot decide it alone): pick one mechanism and make both the step and the PRD wording agree.
  - A. Record `task.json.commit` as the bookkeeping commit, and assert `git rev-parse HEAD == <task.commit>` plus `git rev-parse <task.commit>^ == 0c9bb6e...`; AC5 then needs a user-approved PRD amendment from "HEAD is still" to "HEAD is the recorded task commit whose parent is".
  - B. Leave `HEAD` untouched: set `"session_auto_commit": false` in `.workloom/config.json`, skip the git commit, record `commit: ""` with a note, and state that R9's commit is intentionally absent for this fixture (again a user-approved deviation).
  - C. Produce the artifact commit, then `git reset --soft 0c9bb6e...` after journaling and record the commit hash; mechanically satisfies both, but must be written out explicitly, including the resulting staged-but-uncommitted index.
  - Do not leave 1.5 asserting both outcomes. Stop and batch this question to the user before executing 1.5.

#### P1-1 — Step 1.1 verifies less than half of AC2

- Anchor: `plan.md:16-25` (Verify block), AC2 in `prd.md`.
- AC2 requires nine `meta` fields (`sourceTask`, `sourceCommit` exact value, `sourceCommitType=archive-bookkeeping`, `validationRef=master`, `validationRefSource=default-current-branch`, non-empty `validationReason`, `validationCommit`, `validationBranch=null`, `materialMode=plan`), `HEAD == validationCommit`, and two `caseHash` relationships: `task.json.case.caseHash` and the RESULT `caseHash` both equal this task's `case.md` hash and differ from the archived `case.md` / `case-result.md` hashes. The step asserts only `sourceTask`, `validationRefSource`, `validationCommit == HEAD`, and `sourceCommit != validationCommit`.
- Missing assertions: exact `sourceCommit`, `sourceCommitType`, `validationRef` (`master`), `validationReason` non-empty, `validationBranch` null, `materialMode`, and the entire caseHash equality/inequality clause.
- Fix: extend the same `node -e` script with all nine key assertions, then add a second assertion block comparing `task.json.case.caseHash` and the RESULT `caseHash` against core's `computeCaseHash(case.md)` (CRLF-normalized, so it matches `workloom_task_case`'s hash) and against the archived `case.md` / `case-result.md` hashes taken from the pre-task manifest. Assert `validationReason.trim() !== ''` (the recorded value `Default current target branch` is the canonical `prepareRef` reason and passes).

#### P1-2 — Step 1.2's Verify is not a runnable comparison and its expected result is not what the command prints

- Anchor: `plan.md:31-32`.
- Evidence: `archived-tasks.mjs snapshot tasks/archive/plan-source` prints a JSON object of seven `file: hash` pairs (verified). The step says only "compare ... → seven entries, zero differing hashes", which is prose, not an assertion, and it names no path for the pre-task manifest even though it exists at `/tmp/wl-archived-manifest-before.json` (verified identical to a fresh snapshot). A check executor cannot produce an exit code or reproducible evidence from that wording, and AC4's standard-verification table needs exit-code-0 rows.
- Fix: give the concrete three-line block and expected output, e.g.
  - `node <workloom-case-archived>/scripts/archived-tasks.mjs snapshot tasks/archive/plan-source > /tmp/wl-archived-manifest-after.json`
  - `diff /tmp/wl-archived-manifest-before.json /tmp/wl-archived-manifest-after.json && echo manifest-identical`
  - Expected: `manifest-identical`, exit 0; and copy the before-manifest into `case-evidence/archived-manifest-before.json` so the baseline is durable and reviewable (a copy under the task dir writes outside the archive, which R1 allows).

#### P1-3 — The `<workloom-case-archived>` / `<workloom-case-active>` placeholders do not resolve in this project

- Anchor: `plan.md:31-32`, `plan.md:46`, `plan.md:53`; `prd.md` AC1/AC4 use the same placeholder form.
- Evidence: the fixture project root contains `.workloom/`, `.pi/`, `src/` only; there is no skill directory. The only real script copies are at `.workloom/worktree/11-03-case-archived-skill/packages/assets/skills/workloom-case-archived/scripts/archived-tasks.mjs` (and the sibling `.../workloom-case-active/scripts/task-fingerprint.mjs`). Invoking the literal placeholder fails with "Cannot find module". The archived skill's Step 5.2 does define the fingerprint as `../workloom-case-active/scripts/task-fingerprint.mjs`, but the plan never states the resolution rule.
- Fix: state the resolution once at the top of the plan ("`<workloom-case-archived>` is the skill resource directory; `<workloom-case-active>` is its sibling"), or inline the concrete path used in this environment in every Verify block.

#### P1-4 — Steps 1.3 and 1.5 mix executor work with main-session orchestration tools

- Anchor: `plan.md:39` (`workloom_task_case`, `workloom_task_align`), `plan.md:52` (`workloom_task_check`, `workloom_task_archive`, `workloom_journal`).
- Evidence: leaf executor prompts forbid exactly these calls — `packages/core/src/domain/session-context.ts:94` ("Do not call workloom orchestration tools (workloom_execute, workloom_step, workloom_task_*, workloom_journal)") and `packages/core/src/domain/executor-context.js:82`. An implement/check executor following 1.5 literally is told to do work its contract forbids.
- Fix: annotate the actor on every step (implement executor / check executor / main session). Executor steps keep file authoring and shell verification; alignment confirm, CASE review and confirm, `workloom_task_check`, `workloom_task_archive` and `workloom_journal` belong to an explicit main-session checklist, with the executor returning after producing artifacts.

#### P1-5 — The CASE confirm action is never an explicit step, and AC3's recorded `caseHash` clause is unverified

- Anchor: `plan.md:38-39` (step 1.3); AC3's "`task.json.case.caseHash` equals the hash of the current `case.md`".
- Evidence: `task.json.case` is `null` now. Step 1.3's Verify checks only `workloom_task_case review`'s `readyToConfirm` and `caseHash`, and mentions `action: confirm` only as the thing the user's approval precedes; no step calls confirm and no step compares `task.json.case.caseHash` with `case.md`. With `case.required !== true`, core's outcome gate short-circuits to `[]` (`packages/core/src/domain/case.js:601`), so AC4's RESULT checks (caseHash freshness, SR/C set, coverage, standard verification) never run — the CASE gate is silently absent rather than validated.
- Fix: make confirm an explicit, actor-annotated action after the user approves the exact hash, and add a Verify assertion that `task.json.case.required === true` and `task.json.case.caseHash === computeCaseHash(case.md)`.

#### P1-6 — AC3's recorded alignment credential is never produced or verified

- Anchor: `plan.md:39`; AC3's "the recorded alignment credential's `prdHash` equals the current `prd.md` hash"; `prd.md` R4.
- Evidence: `task.json.alignment` is `null`, and no step calls `workloom_task_align` with `action: confirm`; step 1.3 checks only the review-time `prdHash`. Core records the credential on confirm (`packages/core/src/domain/task-store.js:895-943`) and gates `planning` status on it (`packages/core/src/domain/alignment.js:109-115`, wired at `packages/core/src/domain/task-gates.js:319`).
- Fix: add the alignment confirmation (after the pre-start user approval) and a Verify assertion that `task.json.alignment.prdHash` equals `computePrdHash(prd.md)`. If the credential is meant to be recorded before the plan's steps run, say so explicitly and keep the assertion; the current null value contradicts AC3 either way.

#### P1-7 — Step 1.3's "exact content contract" omits fields core requires

- Anchor: `plan.md:38`.
- Evidence: core requires `Scope` to declare `Requirements`, `Acceptance criteria` and `Out of scope` (`packages/core/src/domain/case.js:406`), and requires `Coverage` to declare `Tool`, `Instrumentation`, `Aggregate command`, `Scope`, `Exclusions`, `Raw outputs` (`case.js:410`, `CASE_STRUCTURE.coverageFields`). The enumerated contract lists only Requirements/Acceptance criteria and only the Exclusions entry. "Canonical CASE structure" mitigates this, but the enumeration is what a literal executor follows, and dropping `- Out of scope:` alone makes `workloom_task_case review` report a structure issue.
- Fix: add `Out of scope: none` and the five remaining Coverage fields to the contract (with `Overall lines` irrelevant in the CASE), or replace the enumeration with "fill every field of the canonical template and do not drop empty ones".

#### P2-1 — Step 1.3's C-item contract is self-referential

- Anchor: `plan.md:38` ("one C item per runtime verification of steps 1.1, 1.2 and 1.4").
- Step 1.4 is RESULT authoring, not a runtime verification, so the sentence has no stable referent and gives the CASE designer no C-item names. Fix: enumerate C1 provenance/HEAD, C2 archive-snapshot diff, C3 independent fingerprint equality, and require a C (or SR) item for the coverage-exclusion statement.

#### P2-2 — Step 1.5's Verify omits the journal record and the recorded commit

- Anchor: `plan.md:52-53`.
- AC5 requires "its own journal record" and R9 "its own commit", but the Verify checks only the archived `task.json`, `HEAD` and the manifest. Fix: add `ls .workloom/workspace/<developer>/journal-*.md` plus a title match (journal path scheme at `packages/core/src/domain/journal.js:41-49,245`), and assert the commit hash recorded in `task.json.commit` (see P0-1 for which hash).

#### P2-3 — The bookkeeping `git commit` has no pathspec and would sweep the fixture config repair

- Anchor: `plan.md:52`.
- `.workloom/config.json` is tracked and currently modified by the recorded fixture repair. A convenience `git commit -a` or `git add -A` would fold that pre-existing change into the task commit, which the plan elsewhere forbids ("no file outside `.workloom/`", and the config repair is not this task's deliverable). Fix: name the exact paths (`git add .workloom/tasks/11-05-validate-archived-plan-source` and the archive path after the move) and forbid `-a`/`-A`.

#### P2-4 — "Phase 1.4" has no referent in this plan

- Anchor: `plan.md:10`.
- The plan's own steps are 1.1–1.5 and no "Phase 1.4" is defined; the phrase is inherited from the standard workflow. Fix: call it "the pre-start alignment gate (PRD, PLAN, context lists, baseline)".

#### P2-5 — "The only files this task writes live under `.workloom/tasks/11-05-...`" is false

- Anchor: `plan.md:8`.
- `workloom_journal` writes `.workloom/workspace/<developer>/journal-N.md` plus the personal and global indexes (`packages/core/src/domain/journal.js:225-245`), outside the task directory. Fix: widen the statement to `.workloom/` and name the journal path.

### Verified positives

- **Structure gate passes**: `inspectPlanStructure` returns `[]`; five `#### 步骤 N.M` blocks, each with `- Covers:`, `- Target:`, `- Edit:`, `- Verify:`; `## Steps` present; H1 present.
- **AC coverage mapping is complete and honest**: AC1–AC5 each covered once, no Covers value refers to a nonexistent AC, and the coverage matches the step content (1.1 provenance, 1.2 archive, 1.3 CASE, 1.4 RESULT, 1.5 close-out).
- **No archive or product-code change is planned**: every archive reference is a read; the only writable area is `.workloom/`; `src/current.txt` is untouched; `prd.md`'s no-code-change claim matches `git status`.
- **Step 1.1's command and expected output are exact**: reproduced `provenance-ok 0c9bb6e95eaccaf5c869bd45c81fdd1a7b8480bc`, exit 0.
- **Step 1.2's command resolves and the baseline exists**: the snapshot prints seven entries and currently diffs clean against `/tmp/wl-archived-manifest-before.json`; the archive is intact at review time.
- **Fingerprint anchor is real and deterministic**: the script exists, runs offline, and prints `codeFingerprint=63381f126841386d027dece5539d6a94e008d1611b4f7c205d3cb37ec925ba46`; its path filters exclude `.workloom/**` and `.pi/**`, so task evidence and the fixture config diff do not perturb it.
- **Coverage treatment is internally consistent (prompt item 4)**: CASE excludes `src/current.txt` with a reason, RESULT repeats the same path and reason, `Overall lines: N/A` matches core's `not_applicable` rule (`case.js:679-685`), and no core gate is forced. Caveat: core derives "expected coverable files" from SR targets when no code changed, so every SR target must stay under `.workloom/` or be the excluded `src/current.txt`; the plan should say so.
- **No gate duplication or bypass (prompt item 5)**: the plan reuses `workloom_task_align`, `workloom_task_case`, `workloom_task_check` and `workloom_task_archive` instead of reimplementing them, and never mentions `force`.

### Open questions (blocking)

1. Which requirement wins for close-out: R9's "own commit" or AC5's "HEAD still `0c9bb6e...`"? The plan must be fixed to one mechanism, and any PRD wording change needs user approval. (P0-1)
2. Is the alignment credential expected to be recorded at the pre-start gate (outside these steps) or inside this plan? `task.json.alignment` is `null` today. (P1-6)
3. Is `/tmp/wl-archived-manifest-before.json` the authoritative pre-task manifest, and is `/tmp` visible to the check executor? If not, the baseline must be copied under `case-evidence/` before step 1.2. (P1-2)

## Round 2 — re-review of the 16:27–16:28 revision

While Round 1 was being written, `plan.md` and `prd.md` were rewritten (mtime 16:28) and `.workloom/config.json` was flipped to `worktree.enabled=true` (mtime 16:27). Round 1 anchors refer to the 16:23 version. This round re-checks the changed design and the new preconditions; Round 1 findings that the rewrite did not touch are carried forward by ID.

Verdict: **still not ready** — the rewrite introduces a hard precondition that the repository does not satisfy, and the commit/HEAD contradiction survives in a new form (which root?): 2 P0, 3 P1, 2 P2.

### Findings

#### P0-2 — Step 1.1 now fails immediately: the required validation worktree does not exist and cannot be created yet

- Anchor: `plan.md:18-25` (step 1.1 Edit/Verify), `plan.md:8` (design decision), `prd.md` AC5/Notes (new worktree requirement).
- Evidence: the new Verify script asserts `t.worktree_path !== ''`, `t.branch === 'workloom/11-05-validate-archived-plan-source'`, `t.base_branch === 'master'` and a matching worktree HEAD. Ran the exact command from the project root → `Error: validation worktree missing`, exit 1. `task.json` still has `worktree_path: ""`, `branch: ""`, `base_branch: ""`, and `.workloom/worktree/` does not exist. The worktree is only created by `startTask` (`packages/core/src/domain/task-store.js:747-758`, `packages/core/src/domain/worktree.js:323-340`, path `.workloom/worktree/<task-id>`, branch template `workloom/<task-id>`), and start is blocked: `evaluateStartGate` returns `["no alignment credential recorded (run workloom_task_align with action=confirm after Phase 1.1 converges)"]`. The config flip happened after the task was created (task created 16:19, config 16:27), so no worktree was ever made; a (re)start is required.
- Why it fails as written: the plan never states that a start must run (and how it gets past the alignment gate) before step 1.1, yet 1.1 asserts start-owned fields. Executing from the current state fails on the first step.
- Fix: add an explicit pre-step (main session, before 1.1): user approves the pre-start package → `workloom_task_align` `action: confirm` → `workloom_task_start` (creates the worktree, sets `worktree_path`/`branch`/`base_branch`, promotes `case.required=true`) → then run 1.1. Also state the ordering constraint: start must run while the main repo HEAD is still `0c9bb6e...` (the worktree is created from the current branch HEAD, `worktree.js:300-340`).

#### P0-3 — Step 1.5 still commits while asserting an unchanged HEAD, and the new worktree split leaves the root undefined

- Anchor: `plan.md:52-53`; AC5 (`prd.md:25`).
- What changed: the step now adds "The validation worktree must be clean when the archive runs — this task changes no product code, so the task branch `workloom/11-05-...` carries no commit of its own and the worktree cleanup leaves `master` at the validation commit." But `Edit` still says "commit the task bookkeeping with `git commit`". The main repository is on `master` (`git rev-parse --abbrev-ref HEAD` → `master`), so that bookkeeping commit lands on `master` and moves it off `0c9bb6e`; the sentence "leaves `master` at the validation commit" is false. The worktree HEAD stays put, but `Verify` (`git rev-parse HEAD still prints 0c9bb6e...`) names no root, so it is undefined whether it passes or fails. Additionally `workloom_journal` auto-commits in the main repo (`sessionAutoCommit` default true, `config.js:37`, `journal.js:228`, `git.js:97-99`), so even skipping the explicit commit does not keep the main repo HEAD fixed.
- Fix: define both roots explicitly and make each assertion name its root: (a) bookkeeping commit in the main repo, hash recorded in `task.json.commit`; (b) `<worktree>` HEAD must equal `0c9bb6e...` and `git -C <worktree> status --porcelain` empty; (c) AC5's "project root" restated as the validation worktree, or AC5 amended by the user to expect `HEAD == <task.commit>` with parent `0c9bb6e`. Decide explicitly whether the journal's auto-commit is acceptable on `master`; if not, set `session_auto_commit: false` in `.workloom/config.json`.

#### P1-8 — AC5's new "worktree clean at close" clause is not verified

- Anchor: `plan.md:53` (Verify), `prd.md:25`.
- AC5 now asserts the worktree was clean when the task closed, but step 1.5 checks only the archived `task.json`, HEAD and the manifest. Fix: add `test -z "$(git -C <worktree> status --porcelain)"` (exit 0) and record the worktree HEAD hash in `case-result.md` `codeBaseline`.

#### P1-9 — Artifact root is ambiguous for every document step

- Anchor: `plan.md:8` (task metadata stays in the main repo) vs `plan.md:37,44` (relative paths `case.md`, `case-result.md`, `case-evidence/`), and `plan.md:46` (`<validation-worktree>`).
- Evidence: executors run with the worktree as their workspace; `.workloom/tasks/11-05-...` exists only in the main repo (untracked there, absent from the worktree checkout). Relative writes from the worktree would create a second task directory in the worktree, which the fingerprint excludes but the main-repo archive never sees.
- Fix: state the absolute main-repo task directory once (`<main-repo>/.workloom/tasks/11-05-validate-archived-plan-source/`), address every artifact against it, and say that all `workloom_task_*` calls and the CASE/RESULT/evidence writes run against the main repo root while only code reads, git checks and the fingerprint use the worktree.

#### P1-10 — Step 1.1's new script still misses most of AC2 and all caseHash assertions

- Anchor: `plan.md:22-25`; AC2 (`prd.md:22`).
- The rewrite added worktree/branch assertions but still does not assert exact `sourceCommit`, `sourceCommitType`, `validationRef`, non-empty `validationReason`, `validationBranch=null`, `materialMode`, nor the caseHash equality/inequality clauses. Fix: extend the same script (see Round 1 P1-1), keeping the worktree assertions.

#### P2-6 — The worktree checkout carries the un-repaired config

- Anchor: `plan.md:8` ("every code read, runtime command and the code fingerprint target that worktree").
- `git show HEAD:.workloom/config.json` still contains `worktree.base_dir` and `worktree.copy_node_modules`, which core rejects as unknown fields (`packages/core/src/domain/config.js:467`); the repair exists only as an uncommitted main-repo change. Any core command run with the worktree as root fails to load config. Fix: narrow the worktree claim to code reads, git checks and the fingerprint, and state that every workloom/core command runs against the main repo root.

#### P2-7 — "No separate validation branch" now reads against the visible worktree branch

- Anchor: `prd.md:42`, `prd.md` AC2 (`validationBranch=null`) vs `plan.md:22` (`t.branch === 'workloom/11-05-...'`).
- The statements are reconcilable only as "the explicit validation-ref branch is null; the task worktree has its own task branch". Say that in one sentence in the plan, otherwise AC2's `validationBranch=null` and the plan's branch assertion look contradictory.

### Round 1 finding status after the rewrite

- R1 P0-1 → carried as R2 P0-3 (root ambiguity replaces pure contradiction; still blocking).
- R1 P1-1 → open (R2 P1-10).
- R1 P1-2 → partially addressed: step 1.2 now pins the main-repo root; still no manifest path, no diff command, and the "expected" line is prose, not the command's JSON output.
- R1 P1-3 → open: `<workloom-case-archived>` / `<workloom-case-active>` remain unresolved placeholders; `<validation-worktree>` is a new placeholder.
- R1 P1-4 → open and enlarged: step 1.5 now also mixes worktree cleanup with orchestration tools.
- R1 P1-5 → open: `startTask` will set `case.required=true` (`task-store.js:757`), but CASE confirm is still not an explicit action and `task.json.case.caseHash` is still unverified.
- R1 P1-6 → now blocking at the start gate (evidence above); still no confirm step.
- R1 P1-7 → open (CASE contract omits `Out of scope` and five Coverage fields).
- R1 P2-1..P2-4 → unchanged; R1 P2-5 now also covers the worktree root split (see R2 P1-9).

### Open questions added in Round 2 (blocking)

4. Should the bookkeeping commit land on `master` in the main repo (and AC5 be reworded to accept that), or should the main repo HEAD stay at `0c9bb6e` (disable auto-commit and skip the commit)? The current plan asserts both.
5. Is the expected execution root the worktree or the main repo for AC2/AC5's `git rev-parse HEAD`? The plan must name it; it currently names neither.
6. Does the task need a fresh `workloom_task_start` after the config flip, and is the main session ready to confirm alignment first? Step 1.1 cannot pass otherwise.

## Round 3 — version pin and delta check

The plan was edited again at 16:28:51 while Round 2 was being written. To keep the findings actionable, the reviewed version is pinned as `plan.md` sha256 `16ba91703904ffcdb9042e712164be8ed79e5be3a9ef3b94c10f3ce19e7647fd` (9438 bytes) and `prd.md` sha256 `0d60eb2f822e37ced5f936839f234b74b6bb80142086217ae59c738788babb3f` (12094 bytes). Any later edit needs a new round.

- Delta: step 1.5's Verify gained `git branch --list workloom/11-05-validate-archived-plan-source still resolves to that same commit` (`plan.md:53`). Nothing else changed; steps 1.1–1.4 and the design decisions are the versions audited in Rounds 1–2.
- Effect on P0-3: the new clause confirms the intended split — the task branch and worktree stay at `0c9bb6e...`, while the bookkeeping commit is expected elsewhere. That makes the missing root in the very next assertion (`git rev-parse HEAD still prints 0c9bb6e...`) more, not less, important: in the main repo that command fails after the commit, in the worktree it passes. P0-3 stands as stated: name the root, state which HEAD advances, and align AC5 with it.
- Effect on the other findings: none. Step 1.1 is unchanged and still exits 1 today (R2 P0-2); step 1.5's cleanliness check is still absent (R2 P1-8); the artifact-root ambiguity (R2 P1-9) and the AC2 gaps (R2 P1-10) remain.

### Final verdict

Not ready for implementation. Blocking: R2 P0-2 (worktree/start precondition, fails today), R2 P0-3 (commit vs unchanged HEAD, root undefined), R1 P1-6 (alignment credential blocks the start gate), R1 P1-5 (no CASE confirm, recorded `caseHash` unverified), and R1 P1-7 (CASE contract omits core-required fields). The plan's structure, AC coverage mapping, archive read-only discipline and coverage treatment are sound; the defects are execution preconditions and verification precision, not scope.

## Round 4 — re-review of the 1170d1fe revision

Reviewed versions pinned from disk: `plan.md` sha256 `1170d1fea9e06a650b93dc87f1b096fd54ebc649f65621d86b851ba3e1d3d06b` (200 lines) and `prd.md` sha256 `9000605546553fd2d948a005a252c76ab60c351fa0fb17f5efe7668f7ebc6cbd` (57 lines). Repository state at review time: `git rev-parse HEAD` = `0c9bb6e95eaccaf5c869bd45c81fdd1a7b8480bc` on `master`; task status `planning`; `worktree_path`/`branch`/`base_branch` empty; `.workloom/worktree/` absent; `case-evidence/archived-manifest-before.json` present (590 bytes, sha256 `954dfb392146e6d6f455dce9b18d71cdcec8d9651a960bd76e0ac19dc585a067`, byte-identical to the `/tmp` pre-task capture); `.workloom/config.json` still modified and uncommitted.

Verdict: **much closer, still not ready** — 2 P0 (both mechanical path/command errors in steps 1.5 and 1.6), 3 P1 (missing close-out verifications and one absent RESULT front-matter field), 5 P2.

### Evidence run for this round

- `inspectPlanStructure(current plan, current prd)` → `[]`; six `#### 步骤 N.M` blocks, every AC covered (1.1 AC3, 1.2 AC2, 1.3 AC1, 1.4 AC3, 1.5 AC4, 1.6 AC5).
- `evaluateStartGate(main root, task)` → only `["no alignment credential recorded ..."]`; the PRD, PLAN and both context lists already pass, so step 1.1's align-confirm + start is the only blocker and is feasible.
- `git show 044423a1869e20213f0a1006e7d3e968d19edd3b:src/current.txt` → `base`; `cat src/current.txt` → `current`; C3's expected values are correct.
- `diff /tmp/wl-archived-manifest-before.json $TASK/case-evidence/archived-manifest-before.json` → empty; the baseline file step 1.3 and 1.4 read really exists now.
- `grep -Fx "$(cat fingerprint-line)" result.md` versus `grep -F ...` on a one-line `codeBaseline`: `-x` exits `1`, plain `-F` exits `0`.
- Core archive destination: `archiveTaskInternal` computes `join(tasks, archive, formatYearMonth(now), task.name)` (`packages/core/src/domain/task-store.js:1505`) and `renameSync`s the task directory there (`:1543`); `date +%Y-%m` → `2026-11`; `task.name` → `validate-archived-plan-source`.

### Disposition of previous findings

- R2 P0-2 (worktree/start precondition) → **resolved**. Step 1.1 is first, main-session-owned, confirms alignment with `expectedPrdHash`, starts while main HEAD is still `0c9bb6e...`, and its Verify asserts `status: in_progress`, the alignment credential and its `prdHash`, `case.required`, and a non-empty `worktree_path`. The start gate above shows alignment is the only missing item.
- R2 P0-3 / R1 P0-1 (commit vs unchanged HEAD) → **resolved**. The `### The two roots, and which HEAD advances` section names `$MAIN`/`$WT`, freezes the worktree HEAD, states that the main HEAD advances through the three bookkeeping commits, and replaces the old invariant with `git diff 0c9bb6e..HEAD -- . ':(exclude).workloom/**'`; `prd.md` R9/AC5 were amended to the same contract.
- R2 P1-8 (worktree clean) → **partially resolved**: step 1.2 checks the worktree status at the beginning; no later step re-checks it at close (new P1-1 below).
- R2 P1-9 (artifact root) → **resolved**. `MAIN`/`ARCHIVED`/`ACTIVE`/`TASK`/`WT` are fixed once, every artifact is addressed to `$TASK`, code commands to `$WT`.
- R2 P1-10 / R1 P1-1 (AC2 coverage) → **resolved**. Step 1.2 asserts all nine `meta` fields with exact values, non-empty `validationReason`, `validationBranch === null`, the source/validation commit difference, the worktree HEAD, `base_branch`, the task branch and an empty worktree status; step 1.4 carries the caseHash equality/inequality checks.
- R1 P1-2 (prose comparison) → **resolved**. Step 1.3 is a runnable snapshot-to-file plus `diff` against the named stored manifest with `manifest-identical` as the expected output.
- R1 P1-3 (placeholders) → **resolved**; every command uses the absolute constants.
- R1 P1-4 (actor) → **resolved**; every step has an `- Actor:` line and the design decisions forbid executors calling orchestration tools.
- R1 P1-5 / R1 P1-6 (CASE and alignment confirm) → **resolved**; step 1.1 confirms alignment, step 1.4 confirms the CASE after user approval and asserts `case.required`, `case.caseHash`, `designSession`, `confirmedAt`, and the archived-hash inequality.
- R1 P1-7 (CASE fields) → **resolved**; the contract names all template sections, `Out of scope`, all six Coverage fields, and SR1–SR4/C1–C4.
- R1 P2-1 (self-referential C) → **resolved**; C1–C4 are enumerated with concrete commands.
- R1 P2-2 (journal/commit) → **partially resolved**: the journal file and `git log` are listed, but the archived task's `status: completed` and `check.summary` are no longer asserted (new P1-2).
- R1 P2-3 (commit pathspec) → **resolved**; exact `git add` path, `-a`/`-A` forbidden.
- R1 P2-4 (Phase 1.4) → **resolved**.
- R1 P2-5 / R2 P2-6 (write scope, worktree config) → **resolved**; writes are under `.workloom/`, the worktree is scoped to code reads/git/fingerprint, and the PRD notes the worktree carries the committed config while all orchestration runs from `$MAIN`.
- R2 P2-7 (`validationBranch=null` vs task branch) → **resolved**; the two-roots section states the distinction explicitly.

### New findings

#### P0-1 — Step 1.6's archive path is wrong, so its final `diff` fails

- Anchor: `plan.md:185` (Target: task directory moved to `.workloom/tasks/archive/11-05-validate-archived-plan-source/`) and `plan.md:197` (`diff .workloom/tasks/archive/11-05-validate-archived-plan-source/case-evidence/archived-manifest-before.json ...`).
- Evidence: core archives to `tasks/archive/<YYYY-MM>/<task.name>` (`task-store.js:1505`, `:1543`), i.e. `.workloom/tasks/archive/2026-11/validate-archived-plan-source` today. The plan's path uses the task-directory id and omits the month, so `diff` exits 2 with "No such file or directory" and step 1.6 cannot pass.
- Fix: address the archived task as `.workloom/tasks/archive/2026-11/validate-archived-plan-source/` (or, more robustly, capture the path returned by `workloom_task_archive` and use `find .workloom/tasks/archive -maxdepth 3 -path '*/validate-archived-plan-source/case-evidence/archived-manifest-before.json'`), and correct the Target line to the same path.

#### P0-2 — Step 1.5's `grep -Fx` cannot match a one-line `codeBaseline`

- Anchor: `plan.md:175` (`grep -Fx "$(cat /tmp/wl-fingerprint.txt)" "$TASK/case-result.md" && echo fingerprint-matches`), with the RESULT contract at `plan.md:163` putting `codeFingerprint=<64-hex>` inside the single front-matter `codeBaseline` line.
- Evidence: reproduced with a one-line `codeBaseline: master@0c9bb6e codeFingerprint=<hash>` sample — `grep -Fx` exits `1` (whole-line match), while `grep -F` exits `0`. The step's third command therefore fails even with a correct RESULT, and the step's own expectation ("every command exits `0`") is unmet.
- Fix: compare the extracted value, e.g. `test "$(grep -o 'codeFingerprint=[0-9a-f]\{64\}' "$TASK/case-result.md")" = "$(cat /tmp/wl-fingerprint.txt)" && echo fingerprint-matches`, or drop `-x` and keep `grep -F`.

#### P1-1 — AC5's "worktree clean when the task closed" is checked only at the start

- Anchor: `plan.md:107-124` (step 1.3/1.2 early check) versus `plan.md:186-197` (step 1.6 Verify); `prd.md` AC5.
- AC5 says the worktree "was clean when the task closed"; step 1.2 checks it before the CASE exists, and step 1.6 never re-checks. Fix: add `git -C "$WT" status --porcelain` (empty, exit 0) and `git -C "$WT" rev-parse HEAD` (`0c9bb6e...`) to step 1.6's Verify, and record both in the RESULT `codeBaseline`.

#### P1-2 — Step 1.6 no longer verifies the archived task's `status: completed` and check credential

- Anchor: `plan.md:186-197`; AC5's "archived under `tasks/archive/` with `status: completed`, its own `check` credential and its own journal record".
- The previous version asserted both; the current Verify lists only the product-code diff, `git log`, the journal file and the manifest diff. The archive gate enforces a recorded check internally, but the plan's own verification of AC5 is now incomplete, and the archived `task.json` path is also affected by P0-1. Fix: after archive, read the archived `task.json` and assert `status === 'completed'` and a non-empty `check.summary` (with the corrected path), plus the journal entry title match.

#### P1-3 — The RESULT front matter omits `checkSession`, which core's check gate requires

- Anchor: `plan.md:163` (front-matter enumeration: `version`, `task`, `caseHash`, `status`, `startedAt`, `completedAt`), `plan.md:174-179` (Verify).
- The canonical RESULT template requires `checkSession: <check-child-session-id>`, and core rejects a RESULT whose `checkSession` is neither the design session nor linked by `fallbackOf` (`packages/core/src/domain/case.js:636-637`). The plan never mentions the field, so `workloom_task_check` can fail with `result_session` as the plan is written. Fix: add `checkSession: <the execution child session id>` (or the design session id when execution continues it) to the RESULT contract, and assert it in step 1.5's Verify against `t.case.designSession`.

#### P2-1 — "one SR item per acceptance criterion" contradicts the enumerated SR1–SR4

- Anchor: `plan.md:131`.
- The sentence says one SR per AC (five ACs), then enumerates four SRs. Core only requires every AC to be referenced by at least one SR or C row in `Traceability` (`case.js:validateTraceability`). Fix: say "four SR items plus four C items, with every AC referenced at least once in Traceability" and add the AC→item mapping.

#### P2-2 — The RESULT `caseHash` equality with `case.md` is not asserted in step 1.5

- Anchor: `plan.md:163` and `plan.md:174-179`; AC2 requires both `task.json.case.caseHash` and the RESULT `caseHash` to equal `case.md`'s hash.
- Step 1.4 asserts the recorded `caseHash`; core validates the RESULT's `caseHash` at check time, but the plan's own verification never compares the RESULT value. Fix: add `grep -E '^caseHash: <hash>
 "$TASK/case-result.md"` (or an equivalent node check) to step 1.5's Verify.

#### P2-3 — The stored baseline manifest's provenance is undocumented

- Anchor: `plan.md:28` ("copied before the CASE design") and `plan.md:111` ("The pre-task manifest lives at ...").
- The file exists and is byte-identical to `/tmp/wl-archived-manifest-before.json` (sha256 `954dfb39...`), but no step records the copy, its source or its hash, so a reviewer cannot tell whether it is truly the pre-task capture. Fix: in step 1.3's Edit, name the source file, the copy command and the expected sha256 of the copy (or the 7 entry hashes), and keep that output under `case-evidence/`.

#### P2-4 — Runtime evidence files are required but only the manifest is verified

- Anchor: `plan.md:163` ("The real output of every runtime case is stored under `case-evidence/`") and `plan.md:176` (`test -s` only checks the manifest).
- AC4 requires real execution evidence for every SR and C item; the plan never names the per-case evidence files or asserts them. Fix: specify files such as `case-evidence/provenance.txt`, `case-evidence/archive-snapshot-after.json`, `case-evidence/fingerprint.txt`, reference them from the RESULT items, and assert each is non-empty in step 1.5's Verify.

#### P2-5 — Step 1.4's design dispatch and step 1.6's artifact commit are not asserted

- Anchor: `plan.md:129-131` (no `workloom_execute` case-design dispatch named) and `plan.md:186-197` (the commit is in `Edit` but the Verify only prints `git log`).
- The main session must dispatch the check executor for CASE design (the archived skill's Step 4.1), and the artifact commit is an AC5 requirement; neither is an asserted action. Fix: name the `workloom_execute` call (`kind: check`, `purpose: case-design`) in step 1.4, and assert `git rev-list --count 0c9bb6e..HEAD` is at least the expected number of bookkeeping commits and that `git show --name-only --format= HEAD` lists only `.workloom/` paths.

### Final verdict (Round 4)

Not ready, but the remaining work is small and localised: two mechanical failures in the Verify blocks (P0-1 archive path, P0-2 `grep -Fx`), three close-out/report gaps (P1-1 worktree clean at close, P1-2 archived status/check, P1-3 `checkSession`), and five clarity/evidence gaps (P2-1..P2-5). The structural turn of this revision is sound: the two-root contract, the path constants, the actor lines, the full AC2 script, the CASE field contract and the manifest diff are all in place, and the start gate is now unblocked except for the alignment confirmation that step 1.1 performs.
