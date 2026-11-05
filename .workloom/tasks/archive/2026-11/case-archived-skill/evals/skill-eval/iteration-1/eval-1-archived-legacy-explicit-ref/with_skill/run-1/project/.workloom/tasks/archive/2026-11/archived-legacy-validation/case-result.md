---
version: 1
task: tasks/11-05-archived-legacy-validation
caseHash: 77a1ca558b4d12e5c24322e8ce83b5cde09b9d870d965fe4e9bd0b77c4ec841c
codeBaseline: validationCommit=c36a6fd4dd73132ca8e2b21fe154ecc3ab8fae6d, validationRefSource=user-specified, validationReason=User-selected ref c36a6fd4dd73132ca8e2b21fe154ecc3ab8fae6d, sourceCommit=c36a6fd4dd73132ca8e2b21fe154ecc3ab8fae6d, codeFingerprint=c8b55f3bdce3f74f69c34dbc11c5b38702f3d5e94d66bb9d446a4b7fb6fce32c
checkSession: 01a1ab06-b78d-77c5-93a2-387a3b0372f5
status: passed
startedAt: 2026-11-05T09:43:56.000Z
completedAt: 2026-11-05T09:45:03.000Z
---

# CASE Result: Validate archived legacy-source CASE against ref c36a6fd

## Summary

- Static review: 4/4
- Runtime cases: 3/3; blocked: 0
- Coverage: not_applicable
- Standard verification: passed

## Static Review Results

### SR1 archived legacy design keeps its original statement

- Status: passed
- Evidence: Target `.workloom/tasks/archive/legacy-source/design.md` inspected in place. `cat -A` shows exactly three lines: `# Legacy design`, an empty line, `Verify archived requirements with deterministic local checks.` (3 lines, 79 bytes, SHA-256 `e5faf3e32a5e886e86ff210e92a23dccf75ed65298924416db4cbf92b051f501`) — nothing was appended for this task. `plan.md` line 7 (`## Design decisions`, first bullet) quotes the sentence verbatim: `The legacy design.md says only: "Verify archived requirements with deterministic local checks."`
- Findings: none

### SR2 archived legacy implementation statement preserved

- Status: passed
- Evidence: Target `.workloom/tasks/archive/legacy-source/implement.md` inspected in place. `cat -A` shows exactly three lines: `# Legacy implementation`, an empty line, `No implementation work remains.` (3 lines, 57 bytes, SHA-256 `d60747d1b23eb95ee0d1b1b857be9984955c5343549481f873d44fbc3a80b64a`) — nothing was appended for this task. All four `#### 步骤` steps of `plan.md` declare `Edit: no product code change.` (步骤 1.1, 1.2, 1.3, 1.4), so the archived "no implementation work remains" is honoured by the migrated plan.
- Findings: none

### SR3 confirmed PRD carries decidable acceptance criteria

- Status: passed
- Evidence: Target `.workloom/tasks/11-05-archived-legacy-validation/prd.md` inspected in place (SHA-256 `91d8fcd4e095cc817871e002760dde509e57be8e67c87ed8984c42195808a26d`). It lists exactly 5 requirements (`R1`–`R5`) and exactly 5 acceptance criteria (`AC1`–`AC5`), each naming a decidable artefact: AC1 a SHA-256 manifest, AC2 the documented commands of `plan.md` steps 1.1–1.4, AC3 the two git commands plus `src/current.txt`, AC4 `plan.md` sections and the archived file hashes, AC5 the `caseHash` and the `codeFingerprint=<64-hex>`. AC3 pins `c36a6fd4dd73132ca8e2b21fe154ecc3ab8fae6d` and names `1058f6641f4d104179d633ec0bc04c499e605002`. AC5 requires the user-approved `caseHash` and a `codeFingerprint=<64-hex>` equal to an independent `task-fingerprint.mjs` run on the validation worktree. `## Notes` states that the archived `check.summary` ("Historical result; not reusable as current evidence.") is never reused as a current result.
- Findings: none

### SR4 prescriptive plan with four self-verifying steps

- Status: passed
- Evidence: Target `.workloom/tasks/11-05-archived-legacy-validation/plan.md` inspected in place. It has `## Design decisions` (line 5) and `## Steps` (line 18); `grep -c '^#### 步骤 '` prints `4` and each of the four steps (1.1, 1.2, 1.3, 1.4) carries `Covers`, `Target`, `Edit` and `Verify`. Scanning all 17 bash lines of the plan: no `rm` / `mv` / `unlink` / `git rm` occurs, every one of the 7 redirections targets a file under `.workloom/tasks/11-05-archived-legacy-validation/case-evidence/`, and none targets the archived directory or the validation worktree — the artifact directory itself is created by `mkdir -p`. 步骤 1.4 defines the ordered sub-steps 1.4a–1.4e and pins the RESULT `codeBaseline` to one string carrying `validationCommit`, `validationRefSource=user-specified`, `validationReason`, `sourceCommit` and `codeFingerprint=<64-hex>`.
- Findings: none

## Runtime Results

### C1 archived manifest stays byte-identical for the whole run

- Status: passed
- Executed at: 2026-11-05T09:44:39Z (steps 1–2) and 2026-11-05T09:45:03Z (step 3, final capture and diff)
- Actions:
  1. `mkdir -p .workloom/tasks/11-05-archived-legacy-validation/case-evidence` — exit `0`.
  2. Manifest capture `node -e '…createHash("sha256")…' > .workloom/tasks/11-05-archived-legacy-validation/case-evidence/archive-manifest-after.txt` — exit `0`.
  3. Manifest comparison `node -e '…MANIFEST_EQUAL…'` — exit `0`.
  4. Step 3, inside the execution round after C2 and C3 and before the archive: `mkdir -p …/case-evidence`, the same capture command with the output path replaced by `case-evidence/archive-manifest-final.txt` — exit `0` — then `diff …/archive-manifest-after.txt …/archive-manifest-final.txt` — exit `0`, no output.
- Observed: The captured file holds exactly six `<sha256>  <relative-path>` lines sorted by path, and a byte-wise `diff` against the six expected lines of `plan.md` 步骤 1.1 exits `0` (`6df30fdc…  check.jsonl`, `e5faf3e3…  design.md`, `6df30fdc…  implement.jsonl`, `d60747d1…  implement.md`, `e769942a…  prd.md`, `88122c9b…  task.json`). The comparison command prints `MANIFEST_EQUAL 6/6` and exits `0`, so every hash equals the manifest captured before this task started. The final capture is identical to the first one and the `diff` exits `0` with no output, so the archived original was never written during the whole run.
- Evidence:
  - `case-evidence/archive-manifest-after.txt`
  - `case-evidence/archive-manifest-final.txt`
- Findings: none

### C2 validated baseline is the requested ref, not the current HEAD

- Status: passed
- Executed at: 2026-11-05T09:44:46Z
- Actions:
  1. `mkdir -p .workloom/tasks/11-05-archived-legacy-validation/case-evidence` — exit `0`.
  2. `git -C .workloom/worktree/11-05-archived-legacy-validation rev-parse HEAD > …/case-evidence/baseline-head.txt` — exit `0`.
  3. `git -C .workloom/worktree/11-05-archived-legacy-validation symbolic-ref --short HEAD > …/case-evidence/baseline-branch.txt` — exit `0`.
  4. `cat .workloom/worktree/11-05-archived-legacy-validation/src/current.txt > …/case-evidence/baseline-src-current-txt.txt` — exit `0`.
  5. `git rev-parse HEAD > …/case-evidence/main-head.txt` — exit `0`.
- Observed: All four captures exit `0`. `baseline-head.txt` holds `c36a6fd4dd73132ca8e2b21fe154ecc3ab8fae6d`, the requested ref. `baseline-branch.txt` holds `workloom/11-05-archived-legacy-validation` and does not contain `HEAD`, so the worktree is not detached. `baseline-src-current-txt.txt` holds `base` and does not contain `current`. `main-head.txt` holds `1058f6641f4d104179d633ec0bc04c499e605002`, which differs from `baseline-head.txt` — the validated baseline is the requested ref and not the current HEAD. The captures ran before the archive, and the validation worktree is untouched (`git status --porcelain` in the worktree is empty).
- Evidence:
  - `case-evidence/baseline-head.txt`
  - `case-evidence/baseline-branch.txt`
  - `case-evidence/baseline-src-current-txt.txt`
  - `case-evidence/main-head.txt`
- Findings: none

### C3 legacy pair migrated into this task, archived originals untouched

- Status: passed
- Executed at: 2026-11-05T09:44:56Z
- Actions:
  1. `mkdir -p .workloom/tasks/11-05-archived-legacy-validation/case-evidence` — exit `0`.
  2. Capture `{ test -f …/plan.md && echo "plan.md: present"; … } > …/case-evidence/migration-check.txt` — exit `0`.
  3. Line-count assertion `test "$(wc -l < …/case-evidence/migration-check.txt)" -eq 6` — exit `0`.
  4. `sha256sum .workloom/tasks/archive/legacy-source/design.md .workloom/tasks/archive/legacy-source/implement.md` — exit `0`.
  5. `grep -c '^#### 步骤 ' .workloom/tasks/11-05-archived-legacy-validation/plan.md` — exit `0`, prints `4`.
- Observed: The capture exits `0` and `migration-check.txt` holds exactly six lines, in the order the command emits them: `plan.md: present`, `prd.md: present`, `task design.md: removed`, `task implement.md: removed`, `archived design.md: present`, `archived implement.md: present`. The line-count assertion exits `0`, which is the real assertion — the exit code of the `{ … }` group only reflects its last command, so a failing check would omit its line, leave fewer than six lines and make this check exit `1`. `sha256sum` prints `e5faf3e32a5e886e86ff210e92a23dccf75ed65298924416db4cbf92b051f501` for the archived `design.md` and `d60747d1b23eb95ee0d1b1b857be9984955c5343549481f873d44fbc3a80b64a` for the archived `implement.md`, so the hashes are unchanged and not only the file existence. This case performed no deletion: the migrated copies were already deleted when the migration was confirmed, and 步骤 1.3 only verifies their absence.
- Evidence:
  - `case-evidence/migration-check.txt`
- Findings: none

## Coverage

- Status: not_applicable
- Tool: none — no executable file is in the change set
- Command: none
- Overall lines: N/A
- Raw reports: none — coverage status is not_applicable

### Changed Files

| File | Covered/Total | Line coverage | Uncovered lines | Details |
| --- | --- | --- | --- | --- |

### Exclusions

| Path | Reason |
| --- | --- |
| `src/**` | `fixture payload asserted by content comparison in C2, not coverable product code` |

### Collection Failure

none

## Standard Verification

| Command | Exit code | Evidence |
| --- | --- | --- |
| `mkdir -p .workloom/tasks/11-05-archived-legacy-validation/case-evidence` | `0` | `case-evidence/archive-manifest-after.txt` |
| `node -e '…sha256 manifest of .workloom/tasks/archive/legacy-source…' > .workloom/tasks/11-05-archived-legacy-validation/case-evidence/archive-manifest-after.txt` | `0` | `case-evidence/archive-manifest-after.txt` |
| `node -e '…MANIFEST_EQUAL against .workloom/.runtime/case-archived-legacy-source.manifest.json…'` | `0` | stdout `MANIFEST_EQUAL 6/6` |
| `node -e '…sha256 manifest of .workloom/tasks/archive/legacy-source…' > .workloom/tasks/11-05-archived-legacy-validation/case-evidence/archive-manifest-final.txt` | `0` | `case-evidence/archive-manifest-final.txt` |
| `diff .workloom/tasks/11-05-archived-legacy-validation/case-evidence/archive-manifest-after.txt .workloom/tasks/11-05-archived-legacy-validation/case-evidence/archive-manifest-final.txt` | `0` | no output |
| `git -C .workloom/worktree/11-05-archived-legacy-validation rev-parse HEAD` | `0` | `case-evidence/baseline-head.txt` |
| `git -C .workloom/worktree/11-05-archived-legacy-validation symbolic-ref --short HEAD` | `0` | `case-evidence/baseline-branch.txt` |
| `cat .workloom/worktree/11-05-archived-legacy-validation/src/current.txt` | `0` | `case-evidence/baseline-src-current-txt.txt` |
| `git rev-parse HEAD` | `0` | `case-evidence/main-head.txt` |
| `{ test -f …/plan.md && echo "plan.md: present"; … } > .workloom/tasks/11-05-archived-legacy-validation/case-evidence/migration-check.txt` | `0` | `case-evidence/migration-check.txt` |
| `test "$(wc -l < .workloom/tasks/11-05-archived-legacy-validation/case-evidence/migration-check.txt)" -eq 6` | `0` | `case-evidence/migration-check.txt` |
| `sha256sum .workloom/tasks/archive/legacy-source/design.md .workloom/tasks/archive/legacy-source/implement.md` | `0` | stdout `e5faf3e32a5e886e86ff210e92a23dccf75ed65298924416db4cbf92b051f501` and `d60747d1b23eb95ee0d1b1b857be9984955c5343549481f873d44fbc3a80b64a` |
| `grep -c '^#### 步骤 ' .workloom/tasks/11-05-archived-legacy-validation/plan.md` | `0` | stdout `4` |
| `node …/workloom-case-active/scripts/task-fingerprint.mjs .workloom/worktree/11-05-archived-legacy-validation` | `0` | `case-evidence/code-fingerprint.txt` |

## Resolved Findings

- none

## Open issues

- none
