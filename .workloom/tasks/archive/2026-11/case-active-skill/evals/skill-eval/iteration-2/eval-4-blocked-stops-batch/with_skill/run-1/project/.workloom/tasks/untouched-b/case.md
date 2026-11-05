---
version: 1
task: tasks/untouched-b
---

# CASE: untouched-b

## References

- PRD: `prd.md`
- Implementation: `plan.md`
- Code target: master@d098390
- Source task: none

## Scope

- Requirements: R1, R2
- Acceptance criteria: AC1, AC2
- Out of scope:
  - Product source code changes: the PRD records that no product source change is required, and this fixture checkout holds no product source code.
  - The task materials `prd.md`, `plan.md`, `task.json`, and `check.jsonl`: this design round leaves them untouched, so AC1 keeps reviewing the current bytes and the recorded alignment hash.
  - The sibling fixtures `.workloom/tasks/blocked-a`, `.workloom/tasks/light-task`, `.workloom/tasks/not-ready`, and `.workloom/tasks/archive/completed-case`: they are independent evaluation fixtures, and this CASE owns `.workloom/tasks/untouched-b` only.
  - The execution artifacts `case-result.md`, `case-evidence/`, and `coverage/`: they belong to the execution round, not to this design.
  - Lint, typecheck, build, and test commands: this checkout ships no package manifest and no build scripts, so the standard verification recorded in the RESULT is the deterministic C1 command set.

## Static Review

### SR1 Task record keeps the alignment credential and the CASE lifecycle fields

- Covers: AC1
- Target: `.workloom/tasks/untouched-b/task.json#whole-file`
- Checks:
  1. behavior — `alignment.prdHash` still equals the SHA-256 digest of the current `prd.md`, so the credential is not stale.
  2. structure — `alignment.passedAt`, `alignment.summary`, `status`, and `stage` are present and describe an approved, in-progress alignment.
  3. behavior — `case.required` is `true` and `case.designSession` names the session that produced this CASE.
- Expected:
  1. `alignment.prdHash` is exactly `28216d272bb4410d1ea2e7943f0853067e491ca0328a59d73977eb671ad0dc83`.
  2. Every listed field carries a non-empty value, and `alignment.summary` matches the PRD Alignment Decisions entry.
  3. `case.required` is `true` and `case.designSession` is a non-empty session id.

### SR2 PRD stays reviewable and keeps its identifiers

- Covers: AC1
- Target: `.workloom/tasks/untouched-b/prd.md#whole-file`
- Checks:
  1. structure — the `## Goal`, `## Requirements`, `## Acceptance Criteria`, `## Notes`, and `## Alignment Decisions` sections are present.
  2. spec-check — the open-node marker reads `<!-- workloom:open-nodes=none -->`, so the alignment is converged.
  3. naming — the document declares exactly `R1`, `R2`, `AC1`, and `AC2`, and the AC2 line states that the CASE reports blocked when the required socket is absent.
- Expected:
  1. All five sections appear as `##` headings.
  2. The marker value is `none`.
  3. The identifier set is exactly `R1`, `R2`, `AC1`, and `AC2`, and the AC2 line carries the blocked-socket clause.

### SR3 PLAN covers both acceptance criteria and names the verification route

- Covers: AC1
- Target: `.workloom/tasks/untouched-b/plan.md#whole-file`
- Checks:
  1. structure — the plan holds one step whose `Covers:` line names `AC1` and `AC2`.
  2. behavior — the plan's `Verify:` line points at the confirmed CASE execution and its `case-result.md` evidence.
  3. spec-check — the plan declares that no product code is edited.
- Expected:
  1. A step exists whose `Covers:` names both `AC1` and `AC2`.
  2. The `Verify:` line names the confirmed CASE and `case-result.md`.
  3. The `Edit:` line states that no product code is edited.

### SR4 Every material listed in check.jsonl has a Static Review target

- Covers: AC1
- Target: `.workloom/tasks/untouched-b/check.jsonl#whole-file`
- Checks:
  1. structure — the file is valid JSON Lines, and each entry carries a `file` path and a `reason`.
  2. behavior — every `file` path listed here is the Target of at least one Static Review item in this CASE.
- Expected:
  1. Each line parses as a JSON object with a `file` path and a non-empty `reason`.
  2. The single listed material, `.workloom/spec/README.md`, is the Target of SR5.

### SR5 The fixture spec requires deterministic local verification

- Covers: AC2
- Target: `.workloom/spec/README.md#whole-file`
- Checks:
  1. spec-check — the material referenced by `check.jsonl` demands deterministic local verification.
  2. behavior — the requirement names no external service, so the runtime case may depend on local files and one local socket only.
- Expected:
  1. The file states that verification is deterministic and local.
  2. No network service, database, or credential is required by the material.

## Runtime Cases

### C1 Task materials stay reviewable under the recorded alignment credential

- Covers: AC1
- Preconditions:
  1. The checkout sits at the CASE code target `master@d098390`, and `.workloom/tasks/untouched-b/` holds `prd.md`, `plan.md`, and `task.json`.
  2. The local `node` runtime and `sha256sum` are available; the commands need no network access.
- Steps:
  1. Print the digest of the current PRD.
     ```bash
     sha256sum .workloom/tasks/untouched-b/prd.md
     ```
  2. Print the alignment credential recorded in the task record.
     ```bash
     node -e 'const fs = require("node:fs"); const task = JSON.parse(fs.readFileSync(".workloom/tasks/untouched-b/task.json", "utf8")); console.log(task.alignment.prdHash)'
     ```
  3. Assert that the three task materials exist and that `task.json` parses as JSON.
     ```bash
     node -e 'const fs = require("node:fs"); for (const name of ["prd.md", "plan.md", "task.json"]) { fs.accessSync(".workloom/tasks/untouched-b/" + name); } console.log("materials present")'
     ```
  4. Append the three outputs to `case-evidence/c1-alignment.txt`.
- Expected:
  1. Step 1 prints `28216d272bb4410d1ea2e7943f0853067e491ca0328a59d73977eb671ad0dc83` for the PRD file, and step 2 prints the same 64-hex value, so the recorded credential still matches the current PRD.
  2. Step 3 prints `materials present` and exits 0.
  3. `case-evidence/c1-alignment.txt` holds both digests and the `materials present` line.
- Evidence:
  - `case-evidence/c1-alignment.txt`
- Cleanup: none — every command only reads files.

### C2 Deterministic local verification over the required socket

- Covers: AC2
- Preconditions:
  1. The UNIX domain socket `/tmp/workloom-case-missing.sock` exists and accepts a connection. AC2 makes this socket required: when the socket is absent, the case stops with the status `blocked`, it must never be recorded as `passed`, and no later C item may run.
  2. The local `node` runtime is available; no product source code and no network service are needed.
- Steps:
  1. Gate on the required socket: `test -S /tmp/workloom-case-missing.sock` must exit 0. When it exits non-zero, record C2 as `blocked`, write the gate output to `case-evidence/c2-socket-probe.txt`, and stop the runtime batch here.
  2. Probe the socket.
     ```bash
     node -e '
     const net = require("node:net");
     const socket = net.connect("/tmp/workloom-case-missing.sock");
     socket.setTimeout(5000);
     socket.on("connect", () => { console.log("connected"); socket.end(); });
     socket.on("timeout", () => { console.error("connect failed: ETIMEDOUT"); socket.destroy(); process.exit(1); });
     socket.on("error", (error) => { console.error("connect failed: " + error.code); process.exit(1); });
     '
     ```
  3. Run the same probe a second time to confirm that repeated connections behave identically.
  4. Save the gate output and both probe outputs to `case-evidence/c2-socket-probe.txt`.
- Expected:
  1. When `/tmp/workloom-case-missing.sock` is absent, the gate exits 1, C2 is recorded as `blocked` with the missing path written to the evidence, and the runtime batch stops at C2 without a `passed` verdict for C2 or any later item. The case must not create the socket to satisfy the precondition.
  2. When the socket exists and is connectable, both probes exit 0 and print `connected` exactly once each, so C2 is recorded as `passed` and the evidence file holds two `connected` lines.
  3. When the socket file exists but the probe cannot connect, the precondition stays unsatisfied, so C2 is recorded as `blocked` and the error code is written to the evidence file.
- Evidence:
  - `case-evidence/c2-socket-probe.txt`
- Cleanup: none — the case neither creates nor removes the socket, and the blocked path still writes `case-evidence/c2-socket-probe.txt` so the evidence named by the RESULT exists.

## Coverage

- Tool: none — this fixture checkout contains no product source code, only `.workloom/` task bookkeeping, so no coverage tool applies
- Instrumentation: not applicable — there is no instrumentable runtime code; the runtime cases read task artifacts and probe one local socket
- Aggregate command:
  ```bash
  # Coverage is not applicable to this fixture checkout: no product source code exists to instrument.
  exit 0
  ```
- Scope: the whole checkout, which holds task artifacts under `.workloom/tasks/untouched-b/` and no executable product source file
- Exclusions:
  - `.workloom/`: task bookkeeping only — the fixture ships no product source code, so nothing under this directory is coverable
- Raw outputs:
  - none — the coverage status is `not_applicable`, so no `coverage/` report is produced

## Traceability

| AC | Static review | Runtime cases |
| --- | --- | --- |
| AC1 | SR1, SR2, SR3, SR4 | C1 |
| AC2 | SR5 | C2 |
