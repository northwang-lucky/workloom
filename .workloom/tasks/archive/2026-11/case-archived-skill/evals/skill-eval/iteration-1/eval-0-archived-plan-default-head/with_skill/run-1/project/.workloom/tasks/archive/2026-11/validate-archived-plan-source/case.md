---
version: 1
task: tasks/11-05-validate-archived-plan-source
---

# CASE: Validate archived plan-source CASE against current HEAD

## References

- PRD: `prd.md`
- Implementation: `plan.md`
- Code target: `master@0c9bb6e95eaccaf5c869bd45c81fdd1a7b8480bc`
- Source task: `tasks/archive/plan-source`

## Scope

- Requirements: `R1, R2, R3, R4, R5, R6, R7, R8, R9`
- Acceptance criteria: `AC1, AC2, AC3, AC4, AC5`
- Out of scope:
  - the archived original under `.workloom/tasks/archive/plan-source/` is never created, edited, renamed or deleted
  - no product code is written; every file this task produces stays under `.workloom/`
  - no external service is contacted and no network access is needed
  - the archived `case.md` and `case-result.md` are read-only historical reference; their content and their hashes are not reused as this task's CASE, RESULT or check credential

## Static Review

### SR1 The archived source material keeps its pre-task bytes

- Covers: `AC1`
- Target: `.workloom/tasks/archive/plan-source/`
- Checks:
  1. The archived directory holds exactly the seven files of the pre-task manifest — `prd.md`, `plan.md`, `case.md`, `case-result.md`, `implement.jsonl`, `check.jsonl` and `task.json` — and each file's SHA-256 equals its manifest entry.
  2. The pre-task baseline is the stored file `.workloom/tasks/11-05-validate-archived-plan-source/case-evidence/archived-manifest-before.json`; it is read, never regenerated or overwritten.
  3. The archived `case.md` and `case-result.md` are historical reference only: this task's `case.md` is authored from the current PRD, PLAN and current code, and no archived hash is reused as this task's `caseHash`.
- Expected: The recomputed manifest of `.workloom/tasks/archive/plan-source/` is byte-identical to `case-evidence/archived-manifest-before.json` — the same seven entries with the same hashes — and this task's own `caseHash` differs from the archived `case.md` and `case-result.md` hashes.

### SR2 The task record carries the full provenance of the validation baseline

- Covers: `AC2`
- Target: `.workloom/tasks/11-05-validate-archived-plan-source/task.json`
- Checks:
  1. `meta` records `sourceTask=tasks/archive/plan-source`, `sourceCommit=044423a1869e20213f0a1006e7d3e968d19edd3b`, `sourceCommitType=archive-bookkeeping`, `validationRef=master`, `validationRefSource=default-current-branch`, `validationCommit=0c9bb6e95eaccaf5c869bd45c81fdd1a7b8480bc`, `validationBranch=null` and `materialMode=plan`.
  2. `meta.validationReason` is a non-empty string that states the default-target-branch rationale, and `meta.sourceCommit` differs from `meta.validationCommit`.
  3. The confirmed `case.caseHash` equals the hash of this task's own `case.md` and differs from the archived `case.md` and `case-result.md` hashes; the RESULT `caseHash` equals the same value.
- Expected: Every recorded field equals the value named in AC2, the worktree HEAD equals `meta.validationCommit`, and the confirmed `caseHash` is this task's own CASE hash — never an archived hash.

### SR3 The task owns a self-consistent PRD, PLAN and credential set

- Covers: `AC3`
- Target: `.workloom/tasks/11-05-validate-archived-plan-source/prd.md` and `.workloom/tasks/11-05-validate-archived-plan-source/plan.md`
- Checks:
  1. `plan.md` declares one `#### 步骤 N.M` heading per step, and every step declares the fields `Covers`, `Target`, `Edit` and `Verify`.
  2. Each of AC1, AC2, AC3, AC4 and AC5 appears in at least one step's `Covers`.
  3. `task.json.alignment.prdHash` equals the current `prd.md` hash, and `task.json.case.caseHash` equals the current `case.md` hash; both review tools report `readyToConfirm: true`.
- Expected: The PLAN covers every acceptance criterion with the four declared step fields, and the two recorded credential hashes equal the on-disk hashes of `prd.md` and `case.md`.

### SR4 The CASE and the RESULT field structure is complete and honest about coverage

- Covers: `AC4`
- Target: `.workloom/tasks/11-05-validate-archived-plan-source/case.md`
- Checks:
  1. The CASE declares the sections `References`, `Scope`, `Static Review`, `Runtime Cases`, `Coverage` and `Traceability`; every SR item carries `Covers`, `Target`, `Checks` and `Expected`, and every C item carries `Covers`, `Preconditions`, `Steps`, `Expected`, `Evidence` and `Cleanup`.
  2. The `Coverage` block declares `Tool`, `Instrumentation`, `Aggregate command`, `Scope`, `Exclusions` and `Raw outputs`, and lists `src/current.txt` with its exclusion reason; no core CASE gate is forced or bypassed.
  3. The `Traceability` table maps every acceptance criterion to at least one SR item and one C item, and this CASE's own id sets — SR1 to SR5 and C1 to C4 — are the id sets the RESULT must mirror.
- Expected: The CASE structure check reports no issue, coverage is reported as `not_applicable` only because the change scope holds no countable source code, and the excluded path and its reason are listed in both the CASE and the RESULT.

### SR5 The close-out precondition and the specified close-out sequence

- Covers: `AC5`
- Target: `.workloom/tasks/11-05-validate-archived-plan-source/task.json` and `.workloom/tasks/11-05-validate-archived-plan-source/plan.md`
- Checks:
  1. `task.json` names the real validation worktree `.workloom/worktree/11-05-validate-archived-plan-source`, branch `workloom/11-05-validate-archived-plan-source` and base branch `master`, and `git -C <worktree> status --porcelain` is empty — the archive tool refuses to archive a dirty worktree, so this is the close-out precondition.
  2. `plan.md` step 1.6 specifies the close-out sequence that produces this task's own `check` credential, moves the task to `.workloom/tasks/archive/2026-11/validate-archived-plan-source` with `status: completed`, and writes this task's own journal record, and it carries the product-code invariant `git diff 0c9bb6e95eaccaf5c869bd45c81fdd1a7b8480bc..HEAD -- . ':(exclude).workloom/**'`.
  3. The close-out postconditions — the archived task record reading `status: completed` with a non-empty `check` summary, the journal entry of this task and the empty product-code diff — are verified by plan step 1.6's Verify block after the check credential is recorded and after the archive, so this static review does not assert them.
- Expected: The task record names the real worktree path, the task branch and base branch `master`, the validation worktree is clean, and `plan.md` step 1.6 carries the close-out sequence together with the product-code invariant.

## Runtime Cases

### C1 The recorded provenance matches the live repository and the validation worktree

- Covers: `AC2`
- Preconditions:
  1. The main repository root is `/data00/home/wangyubo.1219/workbench/code-src/github/workloom/.workloom/tasks/11-03-case-archived-skill/evals/skill-eval/iteration-1/eval-0-archived-plan-default-head/with_skill/run-1/project` and the validation worktree exists at `.workloom/worktree/11-05-validate-archived-plan-source`.
  2. `task.json` for this task holds the `meta` block written at task start, and the worktree sits on branch `workloom/11-05-validate-archived-plan-source` with base `master`.
- Steps:
  1. Run from the main repository root:

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
     " > "$TASK/case-evidence/c1-provenance.txt" && cat "$TASK/case-evidence/c1-provenance.txt"
     ```
- Expected:
  1. The command writes `provenance-ok 0c9bb6e95eaccaf5c869bd45c81fdd1a7b8480bc worktree=.workloom/worktree/11-05-validate-archived-plan-source branch=workloom/11-05-validate-archived-plan-source` into `case-evidence/c1-provenance.txt`, prints the same line, and exits `0`.
- Evidence:
  - `case-evidence/c1-provenance.txt`
- Cleanup: none — every command in this case is read-only.

### C2 The archived original's manifest is byte-identical to the pre-task baseline

- Covers: `AC1`
- Preconditions:
  1. The archived original lives in the main repository at `.workloom/tasks/archive/plan-source/`, its authoritative location; the snapshot always runs with the main repository root as the working directory.
  2. The pre-task baseline is the stored file `.workloom/tasks/11-05-validate-archived-plan-source/case-evidence/archived-manifest-before.json`; it is reused as-is and never regenerated.
- Steps:
  1. Run from the main repository root:

     ```bash
     MAIN=/data00/home/wangyubo.1219/workbench/code-src/github/workloom/.workloom/tasks/11-03-case-archived-skill/evals/skill-eval/iteration-1/eval-0-archived-plan-default-head/with_skill/run-1/project
     ARCHIVED=/data00/home/wangyubo.1219/workbench/code-src/github/workloom/.workloom/worktree/11-03-case-archived-skill/packages/assets/skills/workloom-case-archived/scripts
     TASK=$MAIN/.workloom/tasks/11-05-validate-archived-plan-source
     cd "$MAIN"
     node "$ARCHIVED/archived-tasks.mjs" snapshot tasks/archive/plan-source > "$TASK/case-evidence/c2-archived-manifest-after.json"
     if diff "$TASK/case-evidence/archived-manifest-before.json" "$TASK/case-evidence/c2-archived-manifest-after.json" > "$TASK/case-evidence/c2-manifest-diff.txt"; then
       echo "manifest-identical" | tee -a "$TASK/case-evidence/c2-manifest-diff.txt"
     else
       echo "manifest-DIFFERS" | tee -a "$TASK/case-evidence/c2-manifest-diff.txt"
       exit 1
     fi
     ```

  2. Read the seven entries of the recomputed snapshot.
- Expected:
  1. The block prints `manifest-identical` and exits `0`; on any mismatch it prints `manifest-DIFFERS`, writes the differing lines into `case-evidence/c2-manifest-diff.txt` and exits non-zero.
  2. The recomputed snapshot holds exactly the seven entries `prd.md`, `plan.md`, `case.md`, `case-result.md`, `implement.jsonl`, `check.jsonl` and `task.json`, each with the same hash as the pre-task baseline.
- Evidence:
  - `case-evidence/archived-manifest-before.json`
  - `case-evidence/c2-archived-manifest-after.json`
  - `case-evidence/c2-manifest-diff.txt`
- Cleanup: none — the snapshot command only reads the archived directory.

### C3 The current HEAD payload differs from the archived bookkeeping payload

- Covers: `AC5`
- Preconditions:
  1. The main repository holds the archived bookkeeping commit `044423a1869e20213f0a1006e7d3e968d19edd3b`, and the validation worktree holds the current payload at commit `0c9bb6e95eaccaf5c869bd45c81fdd1a7b8480bc`.
  2. The only product file of the project is `src/current.txt`.
- Steps:
  1. Run from the main repository root:

     ```bash
     MAIN=/data00/home/wangyubo.1219/workbench/code-src/github/workloom/.workloom/tasks/11-03-case-archived-skill/evals/skill-eval/iteration-1/eval-0-archived-plan-default-head/with_skill/run-1/project
     WT=$MAIN/.workloom/worktree/11-05-validate-archived-plan-source
     TASK=$MAIN/.workloom/tasks/11-05-validate-archived-plan-source
     cd "$MAIN"
     { echo "archived sourceCommit payload:"; git show 044423a1869e20213f0a1006e7d3e968d19edd3b:src/current.txt; echo "current validationCommit payload:"; cat "$WT/src/current.txt"; echo "validation worktree HEAD:"; git -C "$WT" rev-parse HEAD; } > "$TASK/case-evidence/c3-payload-comparison.txt" && cat "$TASK/case-evidence/c3-payload-comparison.txt"
     ```
- Expected:
  1. The command writes the payload comparison into `case-evidence/c3-payload-comparison.txt`, prints the same content, and exits `0`.
  2. The archived bookkeeping payload prints `base`, the validation worktree payload prints `current`, and the validation worktree HEAD prints `0c9bb6e95eaccaf5c869bd45c81fdd1a7b8480bc`.
  3. The two payloads differ, which shows the validated code is the current baseline and not the archived bookkeeping state.
- Evidence:
  - `case-evidence/c3-payload-comparison.txt`
- Cleanup: none — every command in this case is read-only.

### C4 The canonical code fingerprint over the validation worktree is reproducible

- Covers: `AC3, AC4`
- Preconditions:
  1. The canonical fingerprint script is at `.workloom/worktree/11-03-case-archived-skill/packages/assets/skills/workloom-case-active/scripts/task-fingerprint.mjs` and the validation worktree exists at `.workloom/worktree/11-05-validate-archived-plan-source`.
  2. The validation worktree is clean, so the fingerprint covers exactly the validation baseline.
- Steps:
  1. Run from the main repository root:

     ```bash
     MAIN=/data00/home/wangyubo.1219/workbench/code-src/github/workloom/.workloom/tasks/11-03-case-archived-skill/evals/skill-eval/iteration-1/eval-0-archived-plan-default-head/with_skill/run-1/project
     ACTIVE=/data00/home/wangyubo.1219/workbench/code-src/github/workloom/.workloom/worktree/11-03-case-archived-skill/packages/assets/skills/workloom-case-active/scripts
     WT=$MAIN/.workloom/worktree/11-05-validate-archived-plan-source
     TASK=$MAIN/.workloom/tasks/11-05-validate-archived-plan-source
     cd "$MAIN"
     node "$ACTIVE/task-fingerprint.mjs" "$WT" > "$TASK/case-evidence/c4-fingerprint.txt" && cat "$TASK/case-evidence/c4-fingerprint.txt"
     ```

  2. Re-run the same script into a second file and compare the two files byte for byte:

     ```bash
     MAIN=/data00/home/wangyubo.1219/workbench/code-src/github/workloom/.workloom/tasks/11-03-case-archived-skill/evals/skill-eval/iteration-1/eval-0-archived-plan-default-head/with_skill/run-1/project
     ACTIVE=/data00/home/wangyubo.1219/workbench/code-src/github/workloom/.workloom/worktree/11-03-case-archived-skill/packages/assets/skills/workloom-case-active/scripts
     WT=$MAIN/.workloom/worktree/11-05-validate-archived-plan-source
     TASK=$MAIN/.workloom/tasks/11-05-validate-archived-plan-source
     cd "$MAIN"
     node "$ACTIVE/task-fingerprint.mjs" "$WT" > "$TASK/case-evidence/c4-fingerprint-rerun.txt" && cat "$TASK/case-evidence/c4-fingerprint-rerun.txt"
     cmp "$TASK/case-evidence/c4-fingerprint.txt" "$TASK/case-evidence/c4-fingerprint-rerun.txt" && echo "fingerprint-reproducible"
     ```

  3. Record the `codeFingerprint=` value in the RESULT's `codeBaseline` field.
- Expected:
  1. The script writes `codeFingerprint=63381f126841386d027dece5539d6a94e008d1611b4f7c205d3cb37ec925ba46` into `case-evidence/c4-fingerprint.txt`, prints the same line, and exits `0`.
  2. The second run writes the identical value into `case-evidence/c4-fingerprint-rerun.txt`, `cmp` reports the two files to be byte-identical, and the block prints `fingerprint-reproducible` and exits `0`.
  3. An independent re-run over the same worktree reproduces the value recorded in the RESULT.
- Evidence:
  - `case-evidence/c4-fingerprint.txt`
  - `case-evidence/c4-fingerprint-rerun.txt`
- Cleanup: none — the fingerprint script only reads the validation worktree.

## Coverage

- Tool: `none — no coverage tool runs, because the change scope of this task holds no countable source code`
- Instrumentation: `none — the runtime cases are plain deterministic shell commands; no coverage instrumentation is applied to them`
- Aggregate command:
  ```bash
  # Coverage is not applicable: this task changes no countable source code,
  # so there is no instrumented run whose report could be aggregated.
  echo "coverage not_applicable: no countable source code in the change scope"
  ```
- Scope: `.workloom/` task documents only — the PRD, PLAN, CASE, RESULT, evidence and archive records; the only product file of the project is the `src/current.txt` data fixture, which is excluded below
- Exclusions:
  - `src/current.txt`: validation data fixture, not countable source code
- Raw outputs:
  - `none — no coverage report is produced, because the coverage status is not_applicable`

## Traceability

| AC | Static review | Runtime cases |
| --- | --- | --- |
| AC1 | SR1 | C2 |
| AC2 | SR2 | C1 |
| AC3 | SR3 | C4 |
| AC4 | SR4 | C4 |
| AC5 | SR5 | C3 |
