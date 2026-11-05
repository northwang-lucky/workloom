---
version: 1
task: tasks/11-05-archived-legacy-validation
---

# CASE: Validate archived legacy-source CASE against ref c36a6fd

## References

- PRD: `prd.md`
- Implementation: `plan.md`
- Code target: `workloom/11-05-archived-legacy-validation` — worktree `.workloom/worktree/11-05-archived-legacy-validation` at commit `c36a6fd4dd73132ca8e2b21fe154ecc3ab8fae6d` (user-selected ref; deliberately not the main checkout HEAD `1058f6641f4d104179d633ec0bc04c499e605002`); recorded baseline `codeFingerprint=c8b55f3bdce3f74f69c34dbc11c5b38702f3d5e94d66bb9d446a4b7fb6fce32c`, which the RESULT `codeBaseline` must carry together with `validationCommit`, `validationRefSource=user-specified`, `validationReason` and `sourceCommit` in one string
- Source task: `tasks/archive/legacy-source`

## Scope

- Requirements: R1, R2, R3, R4, R5
- Acceptance criteria: AC1, AC2, AC3, AC4, AC5
- Out of scope:
  - Any write to `.workloom/tasks/archive/legacy-source/` — the archived original is read-only input, and its byte-identity is proven by the AC1 manifest instead of by editing it.
  - Product code changes — the archived `implement.md` states that no implementation work remains, so the migrated plan stays verification-only.
  - Reuse of the archived historical `check` record (`Historical result; not reusable as current evidence.`) as a current result.
  - Coverage collection — the change set holds no executable file, so the coverage status is `not_applicable`.
  - The CASE lifecycle sub-steps 1.4b–1.4e of `plan.md` — they are the execution phase of this CASE, not a runtime case of the design round.

## Static Review

### SR1 archived legacy design keeps its original statement

- Covers: AC1, AC4
- Target: `.workloom/tasks/archive/legacy-source/design.md`
- Checks:
  1. The document body is the heading `# Legacy design` plus the single statement `Verify archived requirements with deterministic local checks.` — no task-specific content was appended.
  2. `plan.md` `## Design decisions` quotes that sentence verbatim, so the migration preserved the original semantics instead of inventing implementation work.
- Expected: The archived `design.md` holds exactly the legacy statement and `plan.md` reproduces that sentence verbatim; the archived file itself was not extended for this task.

### SR2 archived legacy implementation statement preserved

- Covers: AC1, AC4
- Target: `.workloom/tasks/archive/legacy-source/implement.md`
- Checks:
  1. The document body is the heading `# Legacy implementation` plus the single statement `No implementation work remains.` — no task-specific content was appended.
  2. Every `#### 步骤 ` step of `plan.md` `## Steps` declares `Edit: no product code change`, so the archived "no implementation work remains" is honoured by the migrated plan.
- Expected: The archived `implement.md` holds exactly the legacy statement, and all four plan steps are verification-only — no step introduces a product-code edit.

### SR3 confirmed PRD carries decidable acceptance criteria

- Covers: AC2, AC3, AC5
- Target: `.workloom/tasks/11-05-archived-legacy-validation/prd.md`
- Checks:
  1. The PRD lists exactly five requirements (R1–R5) and five acceptance criteria (AC1–AC5), and every acceptance criterion names a concrete verification artefact (a command, a commit SHA, a SHA-256 manifest or a recorded field) rather than a subjective claim.
  2. AC3 pins the validated baseline to `c36a6fd4dd73132ca8e2b21fe154ecc3ab8fae6d` and names `1058f6641f4d104179d633ec0bc04c499e605002` as the current HEAD that must differ.
  3. AC5 requires a user-approved `caseHash` and a `codeFingerprint=<64-hex>` equal to an independent `task-fingerprint.mjs` run on the validation worktree, and the PRD `## Notes` forbids reusing the archived historical check record.
- Expected: The PRD holds 5 requirements and 5 acceptance criteria; AC3 carries both commit SHAs; AC5 names `caseHash` and `codeFingerprint`; the historical check record is marked reference-only.

### SR4 prescriptive plan with four self-verifying steps

- Covers: AC2, AC3, AC4, AC5
- Target: `.workloom/tasks/11-05-archived-legacy-validation/plan.md`
- Checks:
  1. The plan has a `## Design decisions` section and a `## Steps` section.
  2. `grep -c '^#### 步骤 '` prints `4`, and each of the four steps carries the four fields `Covers`, `Target`, `Edit` and `Verify`.
  3. No command of the plan deletes anything: the migrated-from legacy copies `design.md` / `implement.md` were already deleted when the migration was confirmed, and every step only verifies their absence. Every write stays inside `case-evidence/` — the directory is created by `mkdir -p` and each artifact is a stdout redirection into it. Nothing is written to `.workloom/tasks/archive/legacy-source/` or to the validation worktree.
  4. 步骤 1.4 defines the CASE lifecycle as the ordered sub-steps 1.4a–1.4e and pins the RESULT `codeBaseline` to one string carrying `validationCommit`, `validationRefSource=user-specified`, `validationReason`, `sourceCommit` and `codeFingerprint=<64-hex>`.
- Expected: The plan has `## Design decisions` and `## Steps`, four `#### 步骤 ` steps each carrying `Covers`/`Target`/`Edit`/`Verify`, no command writes to the archived directory or the validation worktree, and 步骤 1.4 pins the RESULT baseline string.

## Runtime Cases

### C1 archived manifest stays byte-identical for the whole run

- Covers: AC1, AC2
- Preconditions:
  1. The working directory is the project root that owns `.workloom/tasks/archive/legacy-source/` and `.workloom/.runtime/case-archived-legacy-source.manifest.json`; neither the archived directory nor the validation worktree is used as a working directory.
  2. `node` is on PATH and the pre-task manifest `.workloom/.runtime/case-archived-legacy-source.manifest.json` exists with its six archived-file entries.
  3. No artifact directory has to be prepared: the capture command creates `.workloom/tasks/11-05-archived-legacy-validation/case-evidence/` itself with `mkdir -p`.
- Steps:
  1. Run the command block of `plan.md` 步骤 1.1 verbatim from the project root — it creates the artifact directory with `mkdir -p` and writes `case-evidence/archive-manifest-after.txt`:
     ```bash
     mkdir -p .workloom/tasks/11-05-archived-legacy-validation/case-evidence
     node -e 'const{createHash}=require("node:crypto");const{readdirSync,readFileSync}=require("node:fs");const{join,relative}=require("node:path");const dir=".workloom/tasks/archive/legacy-source";const walk=(d)=>readdirSync(d,{withFileTypes:true}).flatMap(e=>{const p=join(d,e.name);return e.isDirectory()?walk(p):[p]});console.log(walk(dir).sort().map(f=>`${createHash("sha256").update(readFileSync(f)).digest("hex")}  ${relative(dir,f)}`).join("\n"))' > .workloom/tasks/11-05-archived-legacy-validation/case-evidence/archive-manifest-after.txt
     ```
  2. Run the manifest comparison command of `plan.md` 步骤 1.1 verbatim and record its stdout:
     ```bash
     node -e 'const{readFileSync}=require("node:fs");const before=JSON.parse(readFileSync(".workloom/.runtime/case-archived-legacy-source.manifest.json","utf8"));const lines=readFileSync(".workloom/tasks/11-05-archived-legacy-validation/case-evidence/archive-manifest-after.txt","utf8").trim().split("\n");const after=Object.fromEntries(lines.map(l=>{const i=l.indexOf("  ");return [l.slice(i+2),l.slice(0,i)]}));const keys=Object.keys(before);console.log(`MANIFEST_EQUAL ${keys.filter(k=>after[k]===before[k]).length}/${keys.length}`)'
     ```
  3. Inside the execution round, after the other runtime cases have run and **before** the archive — the archive removes the validation worktree and moves the task directory — re-run the capture command of step 1 into `case-evidence/archive-manifest-final.txt` (same command, output path replaced) and compare both captures:
     ```bash
     mkdir -p .workloom/tasks/11-05-archived-legacy-validation/case-evidence
     node -e 'const{createHash}=require("node:crypto");const{readdirSync,readFileSync}=require("node:fs");const{join,relative}=require("node:path");const dir=".workloom/tasks/archive/legacy-source";const walk=(d)=>readdirSync(d,{withFileTypes:true}).flatMap(e=>{const p=join(d,e.name);return e.isDirectory()?walk(p):[p]});console.log(walk(dir).sort().map(f=>`${createHash("sha256").update(readFileSync(f)).digest("hex")}  ${relative(dir,f)}`).join("\n"))' > .workloom/tasks/11-05-archived-legacy-validation/case-evidence/archive-manifest-final.txt
     diff .workloom/tasks/11-05-archived-legacy-validation/case-evidence/archive-manifest-after.txt .workloom/tasks/11-05-archived-legacy-validation/case-evidence/archive-manifest-final.txt
     ```
- Expected:
  1. The capture command exits `0` and `archive-manifest-after.txt` holds exactly six `<sha256>  <relative-path>` lines sorted by path, byte-identical to the six expected lines recorded in `plan.md` 步骤 1.1.
  2. The comparison command exits `0` and prints `MANIFEST_EQUAL 6/6`.
  3. The final `diff` exits `0` with no output — the archived original was never written during the whole run, not only up to the first capture. This capture belongs to the execution round: it runs after the other runtime cases and before the archive, because the archive removes the validation worktree and moves the task directory.
- Evidence:
  - `case-evidence/archive-manifest-after.txt`
  - `case-evidence/archive-manifest-final.txt`
- Cleanup: none — the commands only read `.workloom/tasks/archive/legacy-source/` and write into `case-evidence/`; the archived original is never written.

### C2 validated baseline is the requested ref, not the current HEAD

- Covers: AC2, AC3
- Preconditions:
  1. The working directory is the project root; the validation worktree `.workloom/worktree/11-05-archived-legacy-validation` is registered on branch `workloom/11-05-archived-legacy-validation` and checked out at `c36a6fd4dd73132ca8e2b21fe154ecc3ab8fae6d`.
  2. The main checkout is at HEAD `1058f6641f4d104179d633ec0bc04c499e605002`, so the two commits are provably different.
  3. No artifact directory has to be prepared: the capture command creates `.workloom/tasks/11-05-archived-legacy-validation/case-evidence/` itself with `mkdir -p`.
- Steps:
  1. Run the command block of `plan.md` 步骤 1.2 verbatim from the project root — it creates the artifact directory with `mkdir -p` and writes `baseline-head.txt`, `baseline-branch.txt`, `baseline-src-current-txt.txt` and `main-head.txt`:
     ```bash
     mkdir -p .workloom/tasks/11-05-archived-legacy-validation/case-evidence
     git -C .workloom/worktree/11-05-archived-legacy-validation rev-parse HEAD > .workloom/tasks/11-05-archived-legacy-validation/case-evidence/baseline-head.txt
     git -C .workloom/worktree/11-05-archived-legacy-validation symbolic-ref --short HEAD > .workloom/tasks/11-05-archived-legacy-validation/case-evidence/baseline-branch.txt
     cat .workloom/worktree/11-05-archived-legacy-validation/src/current.txt > .workloom/tasks/11-05-archived-legacy-validation/case-evidence/baseline-src-current-txt.txt
     git rev-parse HEAD > .workloom/tasks/11-05-archived-legacy-validation/case-evidence/main-head.txt
     ```
  2. Read the four captured files and compare `baseline-head.txt` with `main-head.txt`.
- Expected:
  1. All four commands exit `0`.
  2. `baseline-head.txt` contains `c36a6fd4dd73132ca8e2b21fe154ecc3ab8fae6d`; `baseline-branch.txt` contains `workloom/11-05-archived-legacy-validation` and never `HEAD` (the worktree is not detached); `baseline-src-current-txt.txt` contains `base` and does not contain `current`; `main-head.txt` contains `1058f6641f4d104179d633ec0bc04c499e605002` and differs from `baseline-head.txt` — that inequality proves the validated baseline is the requested ref and not the current HEAD. These captures must run before the archive, because the archive removes the validation worktree.
- Evidence:
  - `case-evidence/baseline-head.txt`
  - `case-evidence/baseline-branch.txt`
  - `case-evidence/baseline-src-current-txt.txt`
  - `case-evidence/main-head.txt`
- Cleanup: none — the commands only read the worktree and the main checkout; the validation worktree is never modified.

### C3 legacy pair migrated into this task, archived originals untouched

- Covers: AC4
- Preconditions:
  1. The working directory is the project root; the task directory `.workloom/tasks/11-05-archived-legacy-validation/` holds `plan.md` and `prd.md`, and the migrated copies `design.md` / `implement.md` are already absent from it — they were deleted when the migration was confirmed, and this case performs no deletion at all; `plan.md` 步骤 1.3 only verifies their absence.
  2. `sha256sum` and `grep` are on PATH.
  3. No artifact directory has to be prepared: the capture command creates `.workloom/tasks/11-05-archived-legacy-validation/case-evidence/` itself with `mkdir -p`.
- Steps:
  1. Run the capture command block of `plan.md` 步骤 1.3 verbatim from the project root — it creates the artifact directory with `mkdir -p` and writes `case-evidence/migration-check.txt`:
     ```bash
     mkdir -p .workloom/tasks/11-05-archived-legacy-validation/case-evidence
     { test -f .workloom/tasks/11-05-archived-legacy-validation/plan.md && echo "plan.md: present"; test -f .workloom/tasks/11-05-archived-legacy-validation/prd.md && echo "prd.md: present"; test ! -e .workloom/tasks/11-05-archived-legacy-validation/design.md && echo "task design.md: removed"; test ! -e .workloom/tasks/11-05-archived-legacy-validation/implement.md && echo "task implement.md: removed"; test -f .workloom/tasks/archive/legacy-source/design.md && echo "archived design.md: present"; test -f .workloom/tasks/archive/legacy-source/implement.md && echo "archived implement.md: present"; } > .workloom/tasks/11-05-archived-legacy-validation/case-evidence/migration-check.txt
     ```
  2. Run the line-count assertion of `plan.md` 步骤 1.3 verbatim — it is the real assertion, because the exit code of the `{ … }` group above only reflects its last command:
     ```bash
     test "$(wc -l < .workloom/tasks/11-05-archived-legacy-validation/case-evidence/migration-check.txt)" -eq 6
     ```
  3. Run the `sha256sum` command of `plan.md` 步骤 1.3 and record its stdout:
     ```bash
     sha256sum .workloom/tasks/archive/legacy-source/design.md .workloom/tasks/archive/legacy-source/implement.md
     ```
  4. Run the step-count command of `plan.md` 步骤 1.3 and record its stdout:
     ```bash
     grep -c '^#### 步骤 ' .workloom/tasks/11-05-archived-legacy-validation/plan.md
     ```
- Expected:
  1. The capture command exits `0` and `migration-check.txt` holds exactly six lines, in the order the command emits them: `plan.md: present`, `prd.md: present`, `task design.md: removed`, `task implement.md: removed`, `archived design.md: present`, `archived implement.md: present`.
  2. The line-count assertion exits `0`: the exit code of the `{ … }` group only reflects its last command, so a failing check omits its line, the file would hold fewer than six lines, and this check exits `1`.
  3. `sha256sum` prints `e5faf3e32a5e886e86ff210e92a23dccf75ed65298924416db4cbf92b051f501` for the archived `design.md` and `d60747d1b23eb95ee0d1b1b857be9984955c5343549481f873d44fbc3a80b64a` for the archived `implement.md` — the hashes are unchanged, not only the file existence.
  4. `grep -c` prints `4` — one `#### 步骤 ` heading per plan step.
- Evidence:
  - `case-evidence/migration-check.txt`
- Cleanup: none — the commands only read the two directories and write into `case-evidence/`; nothing is deleted or rewritten by this case.

## Coverage

- Tool: none — no executable file is in the change set
- Instrumentation: none
- Aggregate command: none
- Scope: the task directory `.workloom/tasks/11-05-archived-legacy-validation/` and the archived legacy documents under `.workloom/tasks/archive/legacy-source/`; the validation worktree `.workloom/worktree/11-05-archived-legacy-validation` contributes no executable file
- Exclusions:
  - `src/**`: fixture payload asserted by content comparison in C2, not coverable product code
- Raw outputs: none — coverage status is not_applicable

## Traceability

| AC | Static review | Runtime cases |
| --- | --- | --- |
| AC1 | SR1, SR2 | C1 |
| AC2 | SR3, SR4 | C1, C2, C3 |
| AC3 | SR3, SR4 | C2 |
| AC4 | SR1, SR2, SR4 | C3 |
| AC5 | SR3, SR4 | - |
