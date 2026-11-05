# Validate archived legacy-source CASE against ref c36a6fd

> Migrated 2026-11-05 from the pre-R/AC prd format; semantics preserved item by item.

## Goal

Rebuild deterministic verification from archived material: re-derive an independent CASE for the archived full task `tasks/archive/legacy-source` and execute it against a recorded current code baseline, without touching the archived original.

## Requirements

- R1: The archived source material under `tasks/archive/legacy-source` stays readable and byte-identical for the whole validation run; its original semantics are preserved.
- R2: A deterministic local condition is verified without any external service or network dependency.
- R3: The verified code baseline is the user-selected commit `c36a6fd4dd73132ca8e2b21fe154ecc3ab8fae6d`, reached through a dedicated local branch, and is provably *not* the current HEAD (`1058f6641f4d104179d633ec0bc04c499e605002`).
- R4: The legacy pair `design.md` + `implement.md` is migrated inside this task only, producing a prescriptive `plan.md`; the archived copies are never edited.
- R5: The CASE and RESULT of this task are freshly designed, independently confirmed and executed against the recorded baseline; the archived historical check record is reference-only.

## Acceptance Criteria

- AC1: Source material and alignment are readable. Verification: recompute the per-file SHA-256 manifest of `tasks/archive/legacy-source` (6 files) and compare it byte-for-byte with the manifest captured before this task started; both manifests must be equal and every listed hash unchanged. Covers R1.
- AC2: A local runtime check passes deterministically. Verification: execute the documented commands in `plan.md` (steps 1.1–1.4) inside the validation worktree; every command must exit `0` and the recorded output must match the expected result. Covers R2.
- AC3: The validation baseline is the requested ref, not the current HEAD. Verification: `git -C <validation worktree> rev-parse HEAD` must print `c36a6fd4dd73132ca8e2b21fe154ecc3ab8fae6d`, `git -C <validation worktree> symbolic-ref --short HEAD` must print the task branch (never `HEAD`, i.e. not detached), and `src/current.txt` inside the validation worktree must contain `base` and must not contain `current`. Covers R3.
- AC4: The legacy pair was migrated into this task's contract. Verification: `plan.md` exists in this task directory with a `## Design decisions` section and a `## Steps` section whose every step carries `Covers`, `Target`, `Edit` and `Verify`; `design.md` and `implement.md` no longer exist in this task directory after the migration; `tasks/archive/legacy-source/design.md` and `tasks/archive/legacy-source/implement.md` are unchanged. Covers R4.
- AC5: The CASE is fresh, confirmed and executed. Verification: `workloom_task_case` action=review returns `readyToConfirm: true` with a `caseHash` that the user explicitly approved, the recorded `task.case.caseHash` equals the current hash of `case.md`, and `case-result.md` carries `codeBaseline` with `codeFingerprint=<64-hex>` equal to an independent `task-fingerprint.mjs` run on the validation worktree. Covers R5.

## Notes

- Historical material is a reference for a new independent validation task: the archived `check.summary` ("Historical result; not reusable as current evidence.") is never reused as a current result.
- The validation baseline is the requested ref, not the current checkout: `src/current.txt` is the discriminating payload (`base` at the requested ref, `current` at the current HEAD).
- No product code is changed by this task; the archived `implement.md` states that no implementation work remains. All artifacts stay inside this task directory (and inside the validation worktree for read-only inspection).
- The archived directory `tasks/archive/legacy-source/` is read-only input for this task. The new task is independent: it has no `parent`, and it is archived on its own.

## Alignment Decisions

- Migrated 2026-11-05 from the pre-R/AC prd format; semantics preserved item by one. Item mapping (original statement → new number): "Keep the source materials readable and preserve their original semantics." → R1; "Verify a deterministic local condition without external services." → R2; "Source material and alignment are readable." → AC1; "A local runtime check passes deterministically." → AC2. R3–R5 and AC3–AC5 are the added verification-method completions for this independent validation run.
- The legacy pair `design.md` + `implement.md` was copied into this task directory as the migration input and is migrated here only; the archived copies stay untouched (verified by the AC1 manifest).
- Baseline decision: use the user-requested ref `c36a6fd4dd73132ca8e2b21fe154ecc3ab8fae6d` through the dedicated local branch `workloom/validation-archived-legacy-validation`. Rejected alternative: validating the current HEAD, because the request names the ref explicitly and HEAD carries different `src/current.txt` content (`current` instead of `base`).
- Verification-only plan: keep the archived intent ("deterministic local checks", "no implementation work remains") and bind it to the current validation baseline instead of inventing product code; consequently `src/**` stays outside the coverage scope and the coverage status is `not_applicable` with a recorded reason.
- Rejected alternative: reuse the archived historical CASE/RESULT as the current result — rejected because the archive explicitly marks it as not reusable as current evidence.
- Open nodes: none. The frontier is empty; every decision above is settled and recorded in this PRD.

<!-- workloom:open-nodes=none -->
