# Archived material validation spec

Deterministic local verification for rebuilding CASE verification of an archived full task.

## Scope

- The archived source task is read-only input. Its raw-byte SHA-256 manifest is frozen before any write and recomputed after the validation task is archived; the two manifests must be exactly equal.
- The validation baseline is the current target branch HEAD, never the archive bookkeeping commit.
- All checks are local, deterministic and side-effect free: no network egress, no external service, no clock- or seed-dependent assertion.

## Material mode

- `plan`: the archived task ships `plan.md`; the new PLAN is rewritten against the current code.
- `legacy-pair`: the archived task ships `design.md` and `implement.md`; the migration runs only inside the new task directory.
- `prd-only`: the archived task ships no implementation PLAN. The missing file is named explicitly and the new PLAN is authored from the archived PRD. A single-sided legacy pair (`design.md` only, or `implement.md` only) is handled as `prd-only` with the missing file named.

## Required recorded metadata

The validation task records in `task.json` `meta`: the source task path, the source commit with its type (`task-commit` or `archive-bookkeeping`), the validation ref, the validation ref source (`default-current-branch` or `user-specified`), the validation reason, the validation commit, the validation branch and the material mode. The CASE `References` section names the same source task and the same current code baseline.

## Deterministic checks

1. Archived bytes: recompute the SHA-256 of every file of the archived source directory and compare each entry with the frozen manifest. No entry may be missing, added or mismatched.
2. Baseline identity: the validation worktree HEAD equals the recorded validation commit and differs from the recorded source commit; the worktree is clean.
3. Task independence: the validation task has no parent and its recorded material mode matches the archived material.

## Evidence and coverage

- Every runtime case retains its command output under `case-evidence/` inside the validation task directory.
- The coverage status is recorded explicitly. When the task changes no product source file, the coverage status is `not_applicable` with the excluded paths and their reasons, and the changed-file table is empty.
