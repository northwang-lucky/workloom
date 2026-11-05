---
version: 1
task: tasks/blocked-a
---

# CASE: blocked-a

## References

- PRD: `.workloom/tasks/blocked-a/prd.md`
- Implementation: `.workloom/tasks/blocked-a/plan.md`
- Code target: `master` at the reviewed commit `d098390` (the fixture checkout; `task.json` records neither a branch nor a worktree path)
- Source task: none

## Scope

- Requirements: R1, R2
- Acceptance criteria: AC1, AC2
- Out of scope:
  - Product source code: the project ships no product source file, and the PRD records that no product source change is required.
  - The task materials themselves: `prd.md`, `plan.md`, `task.json`, `check.jsonl` and the recorded alignment hash stay untouched, so AC1 keeps reviewing the current bytes.
  - Execution artifacts: `case-result.md`, `case-evidence/` and the coverage output belong to the execution round, not to this design.
  - The other tasks of the batch: `tasks/untouched-b`, `tasks/not-ready`, `tasks/light-task` and `tasks/archive/completed-case` own their own CASE and are not reviewed here.

## Static Review

### SR1 Task record keeps its case state and its alignment hash

- Covers: AC1
- Target: `.workloom/tasks/blocked-a/task.json#alignment`
- Checks:
  1. `task.json` parses as JSON and still records `status` = `in_progress`, `mode` = `full` and `stage` = `implement`.
  2. `case.required` stays `true` and `case.designSession` equals the `childId` of the `purpose: case-design` check dispatch listed in `dispatches`.
  3. `alignment.prdHash` equals the SHA-256 digest of the CRLF-normalized bytes of `.workloom/tasks/blocked-a/prd.md`.
- Expected: The record parses, keeps `case.required = true` together with the recorded design session, and its `alignment.prdHash` still equals the recomputed digest of the current PRD.

### SR2 PRD stays reviewable and still names the required socket

- Covers: AC1
- Target: `.workloom/tasks/blocked-a/prd.md#Requirements`
- Checks:
  1. `prd.md` keeps the `## Goal`, `## Requirements`, `## Acceptance Criteria`, `## Notes` and `## Alignment Decisions` sections plus the `<!-- workloom:open-nodes=none -->` marker.
  2. `## Requirements` still lists R1 and R2, and `## Acceptance Criteria` still lists AC1 and AC2.
  3. R2 still requires the runtime case to use the UNIX socket `/tmp/workloom-case-missing.sock` and to stop as blocked when that socket is absent.
- Expected: The PRD keeps its reviewed section structure and its R1, R2, AC1 and AC2 identifiers, and R2 still binds the runtime case to the socket path that C2 requires.

### SR3 PLAN still covers both acceptance criteria and delegates verification to the CASE

- Covers: AC1
- Target: `.workloom/tasks/blocked-a/plan.md#Steps`
- Checks:
  1. `plan.md` still carries the single step `步骤 1.1 verify`.
  2. That step still declares `Covers: AC1, AC2` and `Target: task documents`.
  3. Its `Edit:` clause still forbids product code edits and its `Verify:` clause still requires executing the confirmed CASE and inspecting `case-result.md`.
- Expected: The PLAN still holds the one verification step that covers AC1 and AC2 and delegates the verification to the confirmed CASE execution.

### SR4 The declared deterministic verification source exists

- Covers: AC2
- Target: `.workloom/spec/README.md`
- Checks:
  1. `.workloom/spec/README.md` exists in the project and states the deterministic local verification rule.
  2. `check.jsonl` names exactly this file as its verification source, so the runtime cases rely on a stable local oracle.
  3. The file names no executable entry point, so no alternative runtime path can replace the C2 socket precondition.
- Expected: The file declared by `check.jsonl` exists and offers no runtime surface that could bypass the socket precondition of C2.

## Runtime Cases

### C1 Deterministic structural verification of the task materials

- Covers: AC1
- Preconditions:
  1. The run happens in the project root that owns `.workloom/tasks/blocked-a/` and `.gitignore`.
  2. `node` and `git` are available on `PATH`.
  3. The confirmed CASE document exists at `.workloom/tasks/blocked-a/case.md`.
- Steps:
  1. Run `node -e 'const fs=require("node:fs");const t=JSON.parse(fs.readFileSync(".workloom/tasks/blocked-a/task.json","utf8"));if(t.status!=="in_progress"||t.mode!=="full"||t.case?.required!==true){console.error("unexpected task record",JSON.stringify({status:t.status,mode:t.mode,required:t.case?.required}));process.exit(1)}console.log("task record ok")'` and require exit code 0.
  2. Run `node -e 'const fs=require("node:fs"),c=require("node:crypto");const raw=fs.readFileSync(".workloom/tasks/blocked-a/prd.md","utf8");const d=c.createHash("sha256").update(raw.replace(/\r\n|\r/g,"\n"),"utf8").digest("hex");const t=JSON.parse(fs.readFileSync(".workloom/tasks/blocked-a/task.json","utf8"));if(d!==t.alignment.prdHash){console.error("alignment hash mismatch",d,t.alignment.prdHash);process.exit(1)}console.log("alignment hash ok",d)'` and require exit code 0.
  3. Run `grep -qx 'version: 1' .workloom/tasks/blocked-a/case.md && grep -qx 'task: tasks/blocked-a' .workloom/tasks/blocked-a/case.md && echo 'case front matter ok'` and require exit code 0.
  4. Run `git status --porcelain -- .workloom/tasks/blocked-a/prd.md .workloom/tasks/blocked-a/plan.md` and require empty output.
- Expected:
  1. Steps 1 to 3 exit 0 and print `task record ok`, `alignment hash ok <64-hex>` and `case front matter ok`.
  2. The digest printed in step 2 equals `f4aff85945ca470e16feb378ec931672b4ead6fd6560bab5e81c9d1e95e92503`, the digest recorded as `alignment.prdHash` in `task.json`.
  3. Step 4 prints nothing, so `prd.md` and `plan.md` are byte-identical to the reviewed materials.
- Evidence:
  - `case-evidence/c1-task-materials.txt` — combined output of steps 1 to 3.
  - `case-evidence/c1-git-status.txt` — output of step 4.
- Cleanup: none — every command is read-only and writes only inside `case-evidence/`.

### C2 Runtime check against the required UNIX socket

- Covers: AC2
- Preconditions:
  1. The UNIX socket `/tmp/workloom-case-missing.sock` exists as a socket file, and a listener on it accepts one connection.
  2. The run happens in the same project root as C1, so the evidence lands in `.workloom/tasks/blocked-a/case-evidence/`.
- Steps:
  1. Run `test -S /tmp/workloom-case-missing.sock` and capture its exit status and error output. When the socket is absent, stop the run at this step: do not create the socket, do not run step 2, and record this case as `blocked` with the missing-path output as evidence.
  2. Connect to `/tmp/workloom-case-missing.sock` and exchange one request and one response line.
  3. Write the probe output together with the exit status to `case-evidence/c2-socket-probe.txt`.
- Expected:
  1. When the socket is present, the probe connects and the case is recorded as `passed`.
  2. When the socket is absent — the state of this project — the run stops as `blocked`, C2 is not recorded as `passed`, and the check cannot be closed with a pass credential; the batch stops at this task and the later tasks stay unexecuted.
- Evidence:
  - `case-evidence/c2-socket-probe.txt` — the socket probe output and exit status; when the socket is absent it records the missing-path error that blocks the case.
- Cleanup: none — the socket is an environment precondition that this run never creates or removes, and nothing is left behind besides the evidence file.

## Coverage

- Tool: `node --test --experimental-test-coverage` (Node.js built-in V8 coverage, Node v24.18.1)
- Instrumentation: The deterministic verification commands of the runtime cases run inside the same Node.js process, so V8 coverage is collected without a separate instrumentation step; the project holds no product source file to instrument.
- Aggregate command:
  ```bash
  node --test --experimental-test-coverage
  ```
- Scope: The project ships no product source file — the tracked tree holds only `.gitignore` and `.workloom/` task bookkeeping — so the coverable file scope is empty and every changed file is task bookkeeping.
- Exclusions:
  - `.workloom/`: Task bookkeeping only; the project ships no product source file to instrument.
- Raw outputs:
  - none: the coverable file scope is empty, so the execution records no coverage report.

## Traceability

| AC | Static review | Runtime cases |
| --- | --- | --- |
| AC1 | SR1, SR2, SR3 | C1 |
| AC2 | SR4 | C2 |
