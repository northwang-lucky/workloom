# legacy-case — plan

> Migrated 2026-11-04 from design.md + implement.md (pre-plan.md contract), rewritten to the prescriptive bar.

## Design decisions

1. **PRD semantics are frozen.** The legacy `design.md` said "Use the current PRD and preserve its two AC items." The migration is therefore a format upgrade only: `R1`/`R2` and `AC1`/`AC2` survive item by item, `## Alignment Decisions` and the `<!-- workloom:open-nodes=none -->` marker stay in place, and only the migration note is added under the H1.
2. **No product source changes.** The legacy `implement.md` said "No product code remains", and the repository contains only `.workloom/` task artifacts plus `.gitignore`. No product source file is created, modified, or deleted by this task, so the verifiable surface is the task materials and the CASE artifacts themselves (AC1, AC2).
3. **The runtime case is a deterministic local verification.** AC2 accepts either branch ("executes deterministically, or reports blocked when the required socket is absent"). This repository has no service and no socket to wait for, so the CASE runtime case verifies the task artifacts locally with a repeatable command whose exit code is deterministic. The alternative branch is not reachable here and must not be simulated as "blocked", because a blocked C item would fail the CASE result gate.
4. **Coverage is `not_applicable`, with a stated reason.** There is no executable source in the repository, so there is no coverable file scope. The CASE states this as an exclusion of `.workloom/**` (task artifacts, not product source) instead of fabricating a coverage percentage.
5. **The CASE is authored by the check executor, the main session only reviews and confirms.** `case.md` and `case-result.md` are written by the `kind: check` executor (design round, then execution round) so the artifact and its evidence come from one session chain (`case.designSession` == `case-result.md` `checkSession`).

## Steps

### Step 1 — Record the already-executed legacy implementation `[executed 2026-01-01 — verification: implement-report.md records completion; no product source file exists in the repository]`

- Covers: (internal)
- Target: `.workloom/tasks/legacy-case/implement-report.md`
- Edit: no product code. The legacy implementation step only recorded its own completion; the file keeps its content unchanged:

```markdown
# Implement report

Completed; no implementation work remains.
```

- Verify: `cat .workloom/tasks/legacy-case/implement-report.md` prints `Completed; no implementation work remains.`, and `git ls-files` lists no product source file (only `.gitignore` and `.workloom/**`).

### Step 2 — Migrate the legacy plan artifacts to `prd.md` + `plan.md` `[executed 2026-11-04 — verification: workloom_task_align review returned readyToConfirm=true, confirm re-recorded the credential against prd hash b8f617342a17c513e750cf4cda17d537ba8bcd3ce309067480d15af7c41e559f, and design.md + implement.md are deleted]`

- Covers: AC1
- Target: `.workloom/tasks/legacy-case/prd.md`, `.workloom/tasks/legacy-case/plan.md` (new), `.workloom/tasks/legacy-case/design.md` (deleted), `.workloom/tasks/legacy-case/implement.md` (deleted)
- Edit: add the migration note under the PRD H1 — before:

```markdown
# legacy-case

## Goal
```

after:

```markdown
# legacy-case

> Migrated 2026-11-04 from the pre-plan.md task contract (design.md + implement.md); prd semantics preserved item by item — R1/R2 and AC1/AC2 are carried over unchanged; the only added text is this migration note.

## Goal
```

Then create `plan.md` (this file) from `design.md` + `implement.md`, and delete the two legacy files:

```bash
rm .workloom/tasks/legacy-case/design.md .workloom/tasks/legacy-case/implement.md
```

- Verify: `workloom_task_align` action=`review` returns `readyToConfirm: true`; `workloom_task_align` action=`confirm` with the returned `prdHash` re-records the credential; `ls .workloom/tasks/legacy-case` lists `plan.md` and no longer lists `design.md` or `implement.md`; `task.json` `alignment.prdHash` equals the review hash.

### Step 3 — Design the CASE

- Covers: AC1, AC2
- Target: `.workloom/tasks/legacy-case/case.md`
- Edit: the check executor writes `case.md` from the CASE template during the `purpose: case-design` dispatch. Required content: front matter `version: 1` / `task: tasks/legacy-case`; `## References` pointing at `prd.md`, `plan.md`, the code target and the source task; `## Scope` naming `R1`, `R2`, `AC1`, `AC2`; at least one `### SR1` item (fields `Covers`, `Target`, `Checks`, `Expected`) whose `Target` covers the changed task materials; at least one `### C1` runtime item (fields `Covers`, `Preconditions`, `Steps`, `Expected`, `Evidence`, `Cleanup`) that runs a deterministic local command and writes its raw output under `case-evidence/`; a `## Coverage` section with `Tool`, `Instrumentation`, `Aggregate command`, `Scope`, `Exclusions`, `Raw outputs`; and a `## Traceability` table with one row per AC (`AC1` → SR/C ids, `AC2` → C ids).
- Verify: `workloom_task_case` action=`review` returns `readyToConfirm: true` with an empty `structureIssues` list and a `caseHash`.

### Step 4 — Confirm the CASE

- Covers: AC1
- Target: `.workloom/tasks/legacy-case/task.json` (`case` record)
- Edit: `workloom_task_case` action=`confirm` with `expectedCaseHash` set to the hash returned by the review in Step 3.
- Verify: `task.json` shows `case.required: true`, `case.caseHash` equal to the Step 3 review hash, `case.confirmedAt` non-empty, `case.designSession` equal to the `case-design` dispatch `childId`, and the pre-existing task fields (`alignment`, `dispatches`, `check`, `stage`) still present.

### Step 5 — Execute the confirmed CASE and record the evidence

- Covers: AC2
- Target: `.workloom/tasks/legacy-case/case-result.md`, `.workloom/tasks/legacy-case/case-evidence/`, `.workloom/tasks/legacy-case/coverage/`
- Edit: the same check session (continued with `purpose: execution`) executes every SR item, then C1..Cn in order, and writes `case-result.md` from the RESULT template: front matter `version: 1`, `task: tasks/legacy-case`, `caseHash` equal to the confirmed hash, non-empty `codeBaseline`, `checkSession` equal to the design session, `status: passed`, `startedAt` and `completedAt`; `## Summary`; `## Static Review Results` with one `passed` entry per SR id; `## Runtime Results` with one `passed` entry per C id; `## Coverage` with `Status: not_applicable`, `Overall lines: N/A`, an empty `### Changed Files` table and the same exclusion paths/reasons as the CASE; `## Standard Verification` with at least one command row whose exit code is `0`; `## Resolved Findings`; and `## Open issues` containing only `- none`.
- Verify: `workloom_task_case` action=`review` still reports the same `caseHash`; every evidence path referenced from `case-result.md` exists under the task directory; the command in `## Standard Verification` re-run by hand exits `0`.

### Step 6 — Record the 2.3 check credential

- Covers: AC1, AC2
- Target: `.workloom/tasks/legacy-case/task.json` (`check` and `case.result` records)
- Edit: `workloom_task_check` with a summary naming the verified items; the tool writes `check.passedAt`/`check.summary` and the `case.result` digest.
- Verify: `task.json` shows `check.passedAt` non-empty and `case.result.resultHash` equal to the SHA-256 of the current `case-result.md` bytes.
