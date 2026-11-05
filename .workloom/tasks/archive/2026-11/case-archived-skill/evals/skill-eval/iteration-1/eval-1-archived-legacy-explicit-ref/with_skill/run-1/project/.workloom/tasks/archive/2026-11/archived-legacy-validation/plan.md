# Plan: Validate archived legacy-source CASE against ref c36a6fd

> Migrated 2026-11-05 from design.md + implement.md (pre-plan.md contract), rewritten to the prescriptive bar.

## Design decisions

- The legacy `design.md` says only: "Verify archived requirements with deterministic local checks." The legacy `implement.md` says only: "No implementation work remains." The migrated plan keeps exactly that intent — deterministic local checks, no product code — and binds it to the current validation baseline instead of inventing implementation work. (Source: `tasks/archive/legacy-source/design.md`, `tasks/archive/legacy-source/implement.md`.)
- The code baseline is the user-requested ref `c36a6fd4dd73132ca8e2b21fe154ecc3ab8fae6d`, reached through the dedicated local branch `workloom/validation-archived-legacy-validation` (recorded as `task.json.meta.validationBranch`). The current HEAD `1058f6641f4d104179d633ec0bc04c499e605002` is *not* the baseline. `src/current.txt` is the discriminating payload: `base` at the requested ref, `current` at the current HEAD.
- Two branches are in play and must not be confused: the ref branch `workloom/validation-archived-legacy-validation` is the *source* of the baseline and is checked out only while the task worktree is created and while the task is archived; `start` then creates the task worktree on its own branch `workloom/11-05-archived-legacy-validation` (default template `workloom/<task-id>`) at commit `c36a6fd…`. The branch assertion in step 1.2 applies to the worktree branch only.
- The archived directory `tasks/archive/legacy-source/` is read-only input. The legacy pair was copied into this task directory as the migration input; the copies were deleted from this task directory when the migration was confirmed, and the archived originals stay untouched (proven by the AC1 manifest).
- No product code is edited: every step below only reads the validation worktree and writes evidence artifacts inside this task directory. Consequently the executable scope of the change set is empty and the CASE coverage status is `not_applicable` with a recorded exclusion reason (`src/**` — fixture payload asserted by content comparison in C2, not coverable product code).
- Rejected alternative: reuse the archived historical `check` record as the current result — the archive itself states "Historical result; not reusable as current evidence.", so the CASE must be freshly designed, confirmed and executed here.
- The code fingerprint is produced only by the skill-shipped script `packages/assets/skills/workloom-case-active/scripts/task-fingerprint.mjs` (the `workloom-case-active` asset of the workloom repository). If that script is missing the run stops and reports; an inline reimplementation of the fingerprint algorithm is not permitted.
- The CASE lifecycle (author → confirm → execute) is kept inside 步骤 1.4 as ordered sub-steps 1.4a–1.4e rather than as extra top-level steps: `prd.md` AC2 pins the documented commands to "steps 1.1–1.4" and `prd.md` is already confirmed, so the step range must not change.
- **Archive choreography** (the archive gate demands it): the archive cleanup requires the main checkout to be on the task's `base_branch`, i.e. `workloom/validation-archived-legacy-validation`. So the archive is run from that branch and the checkout is restored to `master` afterwards. The archive's auto-commit is therefore deferred (`autoCommit: false`) and the equivalent bookkeeping commit is made in the main repository on `master` right after the restore — otherwise the archived directory would be bound to the validation branch and would be deleted from the working tree by the checkout back to `master`. The validation branch stays pinned at `c36a6fd…`, and the archived original is never written.
- **Ordering constraint**: the archive removes the validation worktree and moves the task directory. AC3 (worktree HEAD, branch, `src/current.txt`) and AC5 (`codeFingerprint`) can therefore only be verified *before* the archive, and the final archive-manifest capture (step 1.1) must also run inside the execution round, before the archive.

## Steps

Working-directory contract: every command in this plan runs from the **project root** (the main checkout). The task directory `.workloom/tasks/11-05-archived-legacy-validation/` and the archived directory `.workloom/tasks/archive/legacy-source/` exist only in the main checkout, so no command may be run with the validation worktree as its working directory; the worktree is addressed exclusively through an explicit path or `git -C <path>`. "Inside the validation worktree" (AC2) means: the command *reads* the worktree at that path, it does not chdir into it. Every artifact is produced by redirecting the command's stdout — never hand-transcribed — and is then compared against the expectation stated in the same step. The canonical CASE and RESULT templates are injected into the check dispatch by the runtime; they are not files of this project.

#### 步骤 1.1 freeze-archived-baseline

- Covers: AC1
- Target: `.workloom/tasks/archive/legacy-source/` — the six archived files `prd.md`, `design.md`, `implement.md`, `task.json`, `implement.jsonl`, `check.jsonl`
- Edit: no product code change. Create `.workloom/tasks/11-05-archived-legacy-validation/case-evidence/archive-manifest-after.txt` by redirecting the stdout of the Verify command below, so the artifact is captured, never typed. The artifact directory is created by the command itself.
- Verify: run from the project root
  ```bash
  mkdir -p .workloom/tasks/11-05-archived-legacy-validation/case-evidence
  node -e 'const{createHash}=require("node:crypto");const{readdirSync,readFileSync}=require("node:fs");const{join,relative}=require("node:path");const dir=".workloom/tasks/archive/legacy-source";const walk=(d)=>readdirSync(d,{withFileTypes:true}).flatMap(e=>{const p=join(d,e.name);return e.isDirectory()?walk(p):[p]});console.log(walk(dir).sort().map(f=>`${createHash("sha256").update(readFileSync(f)).digest("hex")}  ${relative(dir,f)}`).join("\n"))' > .workloom/tasks/11-05-archived-legacy-validation/case-evidence/archive-manifest-after.txt
  ```
  Expected: the command exits `0`; the captured file holds exactly six `<sha256>  <relative-path>` lines, one per archived file, sorted by path, with these exact values:
  ```text
  6df30fdc19e0166fab3f3783caf42c42b574d9814bb8996abf119f70802031e0  check.jsonl
  e5faf3e32a5e886e86ff210e92a23dccf75ed65298924416db4cbf92b051f501  design.md
  6df30fdc19e0166fab3f3783caf42c42b574d9814bb8996abf119f70802031e0  implement.jsonl
  d60747d1b23eb95ee0d1b1b857be9984955c5343549481f873d44fbc3a80b64a  implement.md
  e769942a78de94e020d1f6deae4f400cfdab148fd3b6a1f1d78db1314fb00647  prd.md
  88122c9b6bf97aa87f589a2b072607314c729a5cac2392e78096f490b4f994f3  task.json
  ```
  Two separate comparisons prove AC1: (1) the captured six lines must equal the block above byte-for-byte; (2) compared as a hash map against the manifest captured before this task started (`.workloom/.runtime/case-archived-legacy-source.manifest.json`, a JSON object — *not* a text file, so no byte comparison with it is possible), the check below must print `MANIFEST_EQUAL 6/6`:
  ```bash
  node -e 'const{readFileSync}=require("node:fs");const before=JSON.parse(readFileSync(".workloom/.runtime/case-archived-legacy-source.manifest.json","utf8"));const lines=readFileSync(".workloom/tasks/11-05-archived-legacy-validation/case-evidence/archive-manifest-after.txt","utf8").trim().split("\n");const after=Object.fromEntries(lines.map(l=>{const i=l.indexOf("  ");return [l.slice(i+2),l.slice(0,i)]}));const keys=Object.keys(before);console.log(`MANIFEST_EQUAL ${keys.filter(k=>after[k]===before[k]).length}/${keys.length}`)'
  ```
  Whole-run re-verification (R1 guarantees byte-identity for the *whole* run): inside the execution round, after the other runtime cases have run and **before** the archive, re-run the capture command above with the output path replaced by `case-evidence/archive-manifest-final.txt`, then
  ```bash
  diff .workloom/tasks/11-05-archived-legacy-validation/case-evidence/archive-manifest-after.txt .workloom/tasks/11-05-archived-legacy-validation/case-evidence/archive-manifest-final.txt
  ```
  Expected: the `diff` exits `0` with no output — the archive was never written during the whole run, not only up to the first capture.

#### 步骤 1.2 assert-validation-baseline

- Covers: AC2, AC3
- Target: validation worktree `.workloom/worktree/11-05-archived-legacy-validation` (git worktree on branch `workloom/11-05-archived-legacy-validation`), file `src/current.txt` inside that worktree; main checkout `.` (branch `master`)
- Edit: no product code change. Create the four evidence artifacts by redirecting the stdout of the Verify commands below: `case-evidence/baseline-head.txt` (worktree HEAD), `case-evidence/baseline-branch.txt` (worktree branch), `case-evidence/baseline-src-current-txt.txt` (worktree `src/current.txt`), `case-evidence/main-head.txt` (main checkout HEAD).
- Verify: run from the project root
  ```bash
  mkdir -p .workloom/tasks/11-05-archived-legacy-validation/case-evidence
  git -C .workloom/worktree/11-05-archived-legacy-validation rev-parse HEAD > .workloom/tasks/11-05-archived-legacy-validation/case-evidence/baseline-head.txt
  git -C .workloom/worktree/11-05-archived-legacy-validation symbolic-ref --short HEAD > .workloom/tasks/11-05-archived-legacy-validation/case-evidence/baseline-branch.txt
  cat .workloom/worktree/11-05-archived-legacy-validation/src/current.txt > .workloom/tasks/11-05-archived-legacy-validation/case-evidence/baseline-src-current-txt.txt
  git rev-parse HEAD > .workloom/tasks/11-05-archived-legacy-validation/case-evidence/main-head.txt
  ```
  Expected: all commands exit `0`; `baseline-head.txt` contains `c36a6fd4dd73132ca8e2b21fe154ecc3ab8fae6d`; `baseline-branch.txt` contains `workloom/11-05-archived-legacy-validation` and never `HEAD` (the worktree must not be detached); `baseline-src-current-txt.txt` contains `base` and must not contain `current`; `main-head.txt` contains `1058f6641f4d104179d633ec0bc04c499e605002`, which differs from the worktree HEAD — that inequality is the proof that the validated baseline is the requested ref and not the current HEAD. This step must run before the archive, because the archive removes the validation worktree.

#### 步骤 1.3 verify-migrated-artifacts

- Covers: AC4
- Target: `.workloom/tasks/11-05-archived-legacy-validation/plan.md`, `.workloom/tasks/11-05-archived-legacy-validation/prd.md`, `.workloom/tasks/11-05-archived-legacy-validation/design.md`, `.workloom/tasks/11-05-archived-legacy-validation/implement.md`, and the archived originals `.workloom/tasks/archive/legacy-source/design.md`, `.workloom/tasks/archive/legacy-source/implement.md`
- Edit: no product code change. The migrated-from legacy copies `design.md` and `implement.md` were already deleted from this task directory when the migration was confirmed — this step verifies their absence instead of deleting them again, and creates `case-evidence/migration-check.txt` by redirecting the stdout of the Verify commands below.
- Verify: run from the project root
  ```bash
  mkdir -p .workloom/tasks/11-05-archived-legacy-validation/case-evidence
  { test -f .workloom/tasks/11-05-archived-legacy-validation/plan.md && echo "plan.md: present"; test -f .workloom/tasks/11-05-archived-legacy-validation/prd.md && echo "prd.md: present"; test ! -e .workloom/tasks/11-05-archived-legacy-validation/design.md && echo "task design.md: removed"; test ! -e .workloom/tasks/11-05-archived-legacy-validation/implement.md && echo "task implement.md: removed"; test -f .workloom/tasks/archive/legacy-source/design.md && echo "archived design.md: present"; test -f .workloom/tasks/archive/legacy-source/implement.md && echo "archived implement.md: present"; } > .workloom/tasks/11-05-archived-legacy-validation/case-evidence/migration-check.txt
  test "$(wc -l < .workloom/tasks/11-05-archived-legacy-validation/case-evidence/migration-check.txt)" -eq 6
  sha256sum .workloom/tasks/archive/legacy-source/design.md .workloom/tasks/archive/legacy-source/implement.md
  grep -c '^#### 步骤 ' .workloom/tasks/11-05-archived-legacy-validation/plan.md
  ```
  Expected: the capture exits `0` and `migration-check.txt` holds exactly six lines **in the order the command emits them** — `plan.md: present`, `prd.md: present`, `task design.md: removed`, `task implement.md: removed`, `archived design.md: present`, `archived implement.md: present`. The exit code of the `{ … }` group only reflects its last command, so the follow-up `test "$(wc -l …)" -eq 6` is the real assertion: a failing `test` omits its line, the file would hold fewer than six lines, and that check exits `1`. `sha256sum` prints `e5faf3e32a5e886e86ff210e92a23dccf75ed65298924416db4cbf92b051f501` for the archived `design.md` and `d60747d1b23eb95ee0d1b1b857be9984955c5343549481f873d44fbc3a80b64a` for the archived `implement.md` (existence is not enough — the hashes must be unchanged); `grep -c` prints `4` (one `#### 步骤 ` heading per plan step).

#### 步骤 1.4 execute-case-and-record-result

- Covers: AC2, AC5
- Target: `.workloom/tasks/11-05-archived-legacy-validation/case.md`, `.workloom/tasks/11-05-archived-legacy-validation/case-result.md`, `.workloom/tasks/11-05-archived-legacy-validation/case-evidence/`
- Edit: no product code change. The CASE lifecycle runs as the ordered sub-steps 1.4a–1.4e below; each names its executing role and its own target, edit and verification. `coverage/` is **not** a target of this task and is never created: the coverage status is `not_applicable` (no executable file is in the change set), so no coverage tool is run and no coverage report exists.
- Verify: run from the project root — the step is done when sub-step 1.4e reports that `workloom_task_check` recorded the pass, the task is archived with `status: completed`, the journal entry exists, and the 步骤 1.1 whole-run re-verification `diff` exits `0`. Each sub-step states its own verification command and expected result below.

  **1.4a record-baseline-facts** — role: main session (records facts, no code).
  - Target: `.workloom/tasks/11-05-archived-legacy-validation/case-evidence/code-fingerprint.txt`
  - Edit: the fingerprint of the clean validation worktree is captured here, by the main session, into `case-evidence/code-fingerprint.txt` — the value recorded before the CASE design round was `codeFingerprint=c8b55f3bdce3f74f69c34dbc11c5b38702f3d5e94d66bb9d446a4b7fb6fce32c`. The fingerprint script must exist; if it is missing, stop and report instead of substituting an inline reimplementation:
    ```bash
    test -f /data00/home/wangyubo.1219/workbench/code-src/github/workloom/.workloom/worktree/11-03-case-archived-skill/packages/assets/skills/workloom-case-active/scripts/task-fingerprint.mjs || { echo "fingerprint script missing; stop and report"; exit 1; }
    node /data00/home/wangyubo.1219/workbench/code-src/github/workloom/.workloom/worktree/11-03-case-archived-skill/packages/assets/skills/workloom-case-active/scripts/task-fingerprint.mjs .workloom/worktree/11-05-archived-legacy-validation > .workloom/tasks/11-05-archived-legacy-validation/case-evidence/code-fingerprint.txt
    ```
  - Verify: the guard command exits `0`; the fingerprint command exits `0` and the captured file holds exactly one line `codeFingerprint=<64-hex>` equal to `c8b55f3bdce3f74f69c34dbc11c5b38702f3d5e94d66bb9d446a4b7fb6fce32c` — the worktree is clean, so the fingerprint is stable across the run and sub-step 1.4d re-runs the same command to prove it did not change.

  **1.4b author-case** — role: check executor, dispatched with `kind: check` and `purpose: case-design`.
  - Target: `.workloom/tasks/11-05-archived-legacy-validation/case.md`
  - Edit: the executor writes `case.md` from `prd.md`, `plan.md`, the real code and the canonical CASE template injected into its dispatch. The document carries YAML front matter `version: 1` and `task: tasks/11-05-archived-legacy-validation`, an H1 `# CASE: <title>`, and these sections: `References` (fields `PRD`, `Implementation`, `Code target`, `Source task` = `tasks/archive/legacy-source`), `Scope` (fields `Requirements`, `Acceptance criteria`, `Out of scope`), `Static Review` (one `### SRn` item per SR item, each with `Covers`, `Target`, `Checks`, `Expected`), `Runtime Cases` (one `### Cn` item per runtime case, each with `Covers`, `Preconditions`, `Steps`, `Expected`, `Evidence`, `Cleanup`), `Coverage` (fields `Tool`, `Instrumentation`, `Aggregate command`, `Scope`, `Exclusions`, `Raw outputs`) and `Traceability` (one row per AC1–AC5). The `## Coverage` section carries `Tool: none — no executable file is in the change set`, `Instrumentation: none`, `Aggregate command: none`, a scope naming the task directory and the archived legacy documents under `.workloom/`, `Raw outputs: none — coverage status is not_applicable`, and exactly one Exclusions row — the exclusion list is a **nested** item under `- Exclusions:`, i.e. `- \`src/**\`: fixture payload asserted by content comparison in C2, not coverable product code` — because a flat sibling item is truncated by the field parser. Every SR/C `Covers` field cites the AC numbers of `prd.md`.
  - Verify: the executor's own check — `case.md` exists in the task directory, starts with the YAML front matter, and contains the six required sections with the required per-item fields. The `workloom_task_case` action=review that proves `readyToConfirm: true` is a **main-session** call and runs in sub-step 1.4c, not here.

  **1.4c confirm-case** — role: main session plus the user (a confirm is a user decision and is never taken from a subagent).
  - Target: `.workloom/tasks/11-05-archived-legacy-validation/case.md`, `task.json` field `case.caseHash`
  - Edit: run `workloom_task_case` action=review to obtain the current snapshot and hash, present the snapshot and hash to the user, and stop until a **new** user message explicitly approves that hash; then run `workloom_task_case` action=confirm with `expectedCaseHash` equal to the approved hash. A generic "continue" is not an approval.
  - Verify: `workloom_task_case` action=review reports `task.json` `case.caseHash` equal to the hash of the current `case.md`, and the recorded `case.designSession` is the id of the 1.4b dispatch.

  **1.4d execute-case** — role: check executor, continuing the same design session with `kind: check`, `purpose: execution` and the confirmed `caseHash`.
  - Target: `.workloom/tasks/11-05-archived-legacy-validation/case-result.md`, `.workloom/tasks/11-05-archived-legacy-validation/case-evidence/`
  - Edit: the executor writes `case-result.md` following the canonical RESULT template injected into its dispatch, with YAML front matter `version: 1`, `task: tasks/11-05-archived-legacy-validation`, `caseHash` equal to the confirmed hash of `case.md`, `codeBaseline` as a **single string** —
    ```text
    validationCommit=c36a6fd4dd73132ca8e2b21fe154ecc3ab8fae6d, validationRefSource=user-specified, validationReason=User-selected ref c36a6fd4dd73132ca8e2b21fe154ecc3ab8fae6d, sourceCommit=c36a6fd4dd73132ca8e2b21fe154ecc3ab8fae6d, codeFingerprint=<hex>
    ```
    where `<hex>` is copied verbatim from the fingerprint output below — plus `checkSession` equal to the design session id, `status: passed`, `startedAt` and `completedAt` as ISO-8601 timestamps. The body carries exactly these sections: `Summary` (with `Coverage: not_applicable` and `Standard verification: passed`), `Static Review Results` (one `### SRn` block per CASE SR item, each `Status: passed`), `Runtime Results` (one `### Cn` block per CASE runtime case, each `Status: passed` — the section is named **Runtime Results**, not "Runtime Cases"), `Coverage` (`Status: not_applicable`, `Tool`, `Command`, `Overall lines: N/A`, a `### Changed Files` table with **header and separator rows only — the template's placeholder row must be deleted**, because a placeholder row would be read as a covered file), an `### Exclusions` table whose single row is
    `` | `src/**` | `fixture payload asserted by content comparison in C2, not coverable product code` | ``
    (both cells backticked — the parser ignores a row whose reason cell is not backticked, and the RESULT exclusions would then not match the CASE exclusions), `Standard Verification` (a table whose rows are the step 1.1 manifest command, the step 1.2 git commands, the step 1.3 `test`/`sha256sum`/`grep` commands and the fingerprint command, each with exit code `0` and its evidence file), `Resolved Findings` (`- none`) and, as the final section, `Open issues` containing exactly `- none`. The fingerprint command is re-run in this sub-step and must print the same hex that 1.4a captured into `case-evidence/code-fingerprint.txt`:
    ```bash
    node /data00/home/wangyubo.1219/workbench/code-src/github/workloom/.workloom/worktree/11-03-case-archived-skill/packages/assets/skills/workloom-case-active/scripts/task-fingerprint.mjs .workloom/worktree/11-05-archived-legacy-validation
    ```
  - Verify: the command exits `0` and prints one line `codeFingerprint=<64-hex>`; that hex equals the `codeFingerprint` recorded in the `codeBaseline` string, which proves the recorded baseline is the current state of the validation worktree and not a historical value; `workloom_task_case` action=review reports `readyToConfirm: true` (the confirmed CASE is unchanged).

  **1.4e record-check-archive-journal** — role: main session.
  - Target: `.workloom/tasks/11-05-archived-legacy-validation/task.json`, the archive directory `.workloom/tasks/archive/2026-11/archived-legacy-validation/`, the main repository branch `master`.
  - Edit: (1) record the passing result with `workloom_task_check` (it re-verifies the CASE/RESULT outcome gate, the standard verification and the coverage status); (2) check out the task's `base_branch` — `git checkout workloom/validation-archived-legacy-validation` — because the archive cleanup refuses a main checkout that is not on `base_branch`; (3) archive the task with `workloom_task_archive` for `taskPath = tasks/11-05-archived-legacy-validation` and `autoCommit: false`, so the archived directory is not bound to the validation branch and survives the checkout back to `master`; (4) restore the checkout — `git checkout master`; (5) make the equivalent bookkeeping commit in the main repository — `git add .workloom/tasks/archive/2026-11/archived-legacy-validation` and `git commit -m "chore(workloom): archive archived-legacy-validation"`; (6) record the session with `workloom_journal` using the **archived** task path returned by step (3) — the month segment comes from the archive result, not from a hard-coded date (`tasks/archive/2026-11/archived-legacy-validation` for this run) — because the pre-archive path no longer holds a `task.json`. AC1, AC3 and AC5 are verified from the captures of 步骤 1.1, 步骤 1.2 and sub-step 1.4d **before** the archive; no post-archive command re-derives them, because the archive removes the validation worktree and moves the task directory. No commit is made on the task branch and nothing is written into the validation worktree: the worktree keeps HEAD `c36a6fd…`, so AC3 and the recorded fingerprint stay true. The archived original `tasks/archive/legacy-source/` is never written.
  - Verify: `workloom_task_check` succeeds (task.json `check.passedAt` and `check.summary` are set); the task directory is gone from `.workloom/tasks/` and present under `.workloom/tasks/archive/2026-11/archived-legacy-validation/` with `status: completed`; `git branch --show-current` prints `master` again and `git rev-parse workloom/validation-archived-legacy-validation` still prints `c36a6fd4dd73132ca8e2b21fe154ecc3ab8fae6d`; the journal entry exists; and the 步骤 1.1 whole-run re-verification `diff` exits `0`, proving the archived original is byte-identical to the manifest captured before this task started.

## Plan review disposition

Round 1 (`plan-review.md`, `## Round 1`) reported P0 ×3, P1 ×4, P2 ×4. Round 2 (`## Round 2`) reported P0 ×3, P1 ×6, P2 ×7 against this revision. All findings of both rounds are disposed of below. `prd.md` was left byte-identical throughout, so the confirmed PRD hash `91d8fcd4e095cc817871e002760dde509e57be8e67c87ed8984c42195808a26d` stays valid.

**Round 1**

- P0-1 (CASE lifecycle missing from the plan) → fixed: 步骤 1.4 now carries the ordered sub-steps 1.4a–1.4e with the executing role named for each (author / confirm / execute / record).
- P0-2 (RESULT skeleton incomplete) → fixed: 1.4d prescribes the full front matter (including `status: passed`, `startedAt`, `completedAt`, `checkSession`) and all seven required body sections with `Resolved Findings`/`Open issues` = `- none` and a standard-verification table whose rows all exit `0`.
- P0-3 (byte-identity against a JSON manifest is unsatisfiable) → fixed: 步骤 1.1 now states two distinct comparisons — byte-equality with the six expected lines, and hash-map equality with the JSON manifest printed as `MANIFEST_EQUAL 6/6`.
- P1-1 (`codeBaseline` must be one string) → fixed: 1.4d gives the exact single-line value.
- P1-2 (working-directory ambiguity) → fixed: the working-directory contract is stated once under `## Steps` and repeated in each `Expected`.
- P1-3 (no whole-run archive re-verification; existence instead of hashes) → fixed: 步骤 1.1 mandates a second capture plus `diff` after 步骤 1.4, and 步骤 1.3 compares the archived `design.md` / `implement.md` hashes instead of only their existence.
- P1-4 (fingerprint script dependency unguarded) → fixed: 1.4a adds the existence guard and the design decisions record that the skill-shipped script is the only permitted implementation.
- P2-1 (two branches confusable) → fixed: the design decisions now name both branches and state which one the branch assertion applies to.
- P2-2 (no "not the current HEAD" inequality assertion) → fixed: 步骤 1.2 captures the main checkout HEAD and asserts it differs from the worktree HEAD.
- P2-3 (evidence transcribed by hand) → fixed: every artifact is produced by redirecting the command output.
- P2-4 (CASE-side coverage shape and lifecycle completion unspecified) → fixed: 1.4b prescribes the CASE `## Coverage` exclusions row and 1.4d the matching RESULT `### Exclusions` row and empty `### Changed Files` table; 1.4e adds the `workloom_task_check` / archive / journal sequence.

**Round 2**

- P0-1 (the archive refuses a main checkout that is not on `base_branch`) → fixed: 1.4e now states the checkout of `workloom/validation-archived-legacy-validation` before the archive and the restore to `master` afterwards; the design decisions add the "Archive choreography" bullet explaining why the auto-commit is deferred and the bookkeeping commit is made in the main repository.
- P0-2 (committing the artifacts on the task branch would move the worktree HEAD and break AC3/AC5) → fixed: the task-branch commit instruction is deleted; 1.4e keeps the worktree untouched and puts the bookkeeping commit in the main repository, as the workflow requires.
- P0-3 (the RESULT exclusion row was not parseable) → fixed: 1.4d now writes the reason cell backticked, `` | `src/**` | `fixture payload …` | ``, and names the matching CASE-side nested exclusion item.
- P1-1 (RESULT section named `Runtime Cases`) → fixed: 1.4d names the section `Runtime Results` explicitly.
- P1-2 (step 1.3 expected order vs. actual output order; group exit code) → fixed: 步骤 1.3 now states the six lines in the order the command emits them and adds the `wc -l` assertion that actually proves all six checks passed.
- P1-3 (`packages/assets/templates/…` does not exist in this project) → fixed: the working-directory contract states that the canonical CASE/RESULT templates are injected into the check dispatch by the runtime, and 1.4b/1.4d refer to "the canonical template injected into its dispatch".
- P1-4 (AC3/AC5 are only verifiable before the archive) → fixed: the "Ordering constraint" bullet states it, 步骤 1.2 repeats it, and 1.4e now says explicitly that AC1/AC3/AC5 are verified from the pre-archive captures and that no post-archive command re-derives them.
- P1-5 (the whole-run re-verification had no second file name and ran after the archive) → fixed: 步骤 1.1 names `case-evidence/archive-manifest-final.txt` and places the capture inside the execution round, before the archive.
- P1-6 (`workloom_journal` with the pre-archive path) → fixed: 1.4e step (6) uses the archived task path returned by the archive tool, and states that the month segment comes from that result rather than from a hard-coded date.
- P2-1 (`coverage/` still advertised as a target) → fixed: removed from 步骤 1.4's Target; the Edit states that it is never created.
- P2-2 (step 1.3 still deleted files that no longer exist) → fixed: 步骤 1.3 now verifies the absence of the already-migrated copies.
- P2-3 (missing `mkdir -p`) → fixed: every capture command block starts with `mkdir -p …/case-evidence`.
- P2-4 (1.4a's artifact was produced in 1.4d) → fixed: the capture moved into 1.4a itself — 1.4a now runs the guarded fingerprint command and writes `case-evidence/code-fingerprint.txt`, and 1.4d only re-runs the same command to prove the value did not change.
- P2-5 (empty Changed Files table vs. the template placeholder row) → fixed: 1.4d requires the placeholder row to be deleted.
- P2-6 (the CASE field list was incomplete) → fixed: 1.4b lists the front-matter keys, the six sections and the per-item fields of the CASE.
- P2-7 (1.4b claimed the executor calls `workloom_task_case`) → fixed: 1.4b's verification is the executor's own document check; the `workloom_task_case` review belongs to the main session in 1.4c.
