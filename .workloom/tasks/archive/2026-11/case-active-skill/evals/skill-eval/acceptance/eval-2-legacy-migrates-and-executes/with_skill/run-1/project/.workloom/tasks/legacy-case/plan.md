# legacy-case plan

> Migrated 2026-11-04 from design.md + implement.md (pre-plan.md contract), rewritten to the prescriptive bar.

## Design decisions

- This task is a deterministic evaluation fixture for the CASE lifecycle. The fixture repository ships no product source file and this task adds none: the deliverable is the task's own acceptance evidence (`case.md`, `case-result.md`, `case-evidence/`) plus this migration of the legacy plan artefacts.
- The legacy `design.md` ("Use the current PRD and preserve its two AC items.") and `implement.md` ("No product code remains.") carry no decision beyond those two facts. The migrated plan therefore keeps exactly the two PRD acceptance criteria and splits the remaining work into the phases they describe: migrating the legacy artefacts (step 2), authoring and confirming the CASE (step 3), and executing the CASE with retained evidence (step 4). Step 1 records the implementation material that already ran and stays annotated as executed.
- Verification is local and deterministic, as `.workloom/spec/README.md` requires ("Use deterministic local verification."): no network egress, no external service, and no clock- or seed-dependent assertion. The runtime case opens a loopback TCP socket on an ephemeral port inside the fixture repository and asserts the token echo. When the environment refuses the socket, the case reports `blocked`; it never reports `passed` on a blocked socket.
- Coverage is `not_applicable` for this fixture: every file this task touches lives under `.workloom/`, so there is no product source file to instrument. The CASE declares that exclusion explicitly and the RESULT reports `not_applicable` with an empty changed-file table.
- `design.md` and `implement.md` are deleted by step 2. `plan.md` becomes the single plan source of truth and the PRD's two AC items stay the only acceptance baseline.

## Steps

#### 步骤 1 Freeze the legacy implementation material [executed 3e27a0d / 2026-01-01 — verified: the alignment credential hash matched the PRD, and implement-report.md recorded that no implementation work remains]

- Covers: AC1
- Target: `.workloom/tasks/legacy-case/prd.md` (H1 `# legacy-case`, sections `## Requirements` and `## Acceptance Criteria`), `.workloom/tasks/legacy-case/task.json` (`alignment`, `status`), `.workloom/tasks/legacy-case/implement-report.md`, `.workloom/tasks/legacy-case/implement.jsonl`, `.workloom/tasks/legacy-case/check.jsonl`, `.workloom/spec/README.md`
- Edit: create — the task materials own exactly this content; the only delta against commit `3e27a0d` is the migration note on the second line of `prd.md`:
  ```markdown
  # legacy-case

  > Migrated 2026-11-04 from the pre-R/AC prd format; semantics preserved item by item. (The R/AC items were already numbered and were carried over unchanged.)

  ## Goal

  Verify the CASE lifecycle for legacy-case.

  ## Requirements

  - R1: PRD and PLAN remain valid and reviewable.
  - R2: The runtime case performs a deterministic local verification.

  ## Acceptance Criteria

  - AC1: The task materials pass structural review and retain the current alignment hash. Verification: inspect task.json and documents. Covers R1.
  - AC2: The CASE executes deterministically, or reports blocked when the required socket is absent. Verification: run the C item and inspect evidence. Covers R2.

  ## Notes

  - No product source changes are required.

  ## Alignment Decisions

  - This deterministic fixture is approved for evaluation.

  <!-- workloom:open-nodes=none -->
  ```
  and the seed logs own exactly this content, one JSON object per line:
  ```json
  {"file":".workloom/spec/README.md","reason":"fixture verification"}
  ```
- Verify: `git log --oneline -1` prints `3e27a0d fixture`, `cat .workloom/tasks/legacy-case/implement-report.md` prints a report stating that the implementation is complete and no implementation work remains, and `sha256sum .workloom/spec/README.md` matches the file committed at `3e27a0d`.

#### 步骤 2 Migrate the legacy plan artefacts into plan.md [executed 2026-11-04 — verified: plan.md carries the prescriptive structure, prd.md keeps its two AC items, the alignment credential was re-confirmed against the migrated PRD hash, and design.md/implement.md are gone]

- Covers: AC1
- Target: `.workloom/tasks/legacy-case/plan.md` (new file), `.workloom/tasks/legacy-case/prd.md` (migration note), `.workloom/tasks/legacy-case/task.json` (`alignment`), `.workloom/tasks/legacy-case/design.md` (deleted), `.workloom/tasks/legacy-case/implement.md` (deleted)
- Edit: create — `plan.md` is this document; its `## Design decisions` section replaces the two legacy artefacts, and the only change to `prd.md` is the migration note on the second line:
  ```markdown
  > Migrated 2026-11-04 from the pre-R/AC prd format; semantics preserved item by item. (The R/AC items were already numbered and were carried over unchanged.)
  ```
  then delete `.workloom/tasks/legacy-case/design.md` and `.workloom/tasks/legacy-case/implement.md`, and re-confirm the alignment credential against the migrated PRD hash so the in_progress stale-alignment gate opens again.
- Verify: `ls .workloom/tasks/legacy-case/` lists `plan.md` and no `design.md` / `implement.md`; `node -e "const {inspectPlanStructure}=require('/data00/home/wangyubo.1219/workbench/code-src/github/workloom/.workloom/worktree/11-03-case-active-skill/packages/core/dist/domain/task-gates.js');" ` style inspection reports zero plan issues (equivalently: `## Steps` exists and every step declares `Covers`, `Target`, `Edit`, `Verify`, with `AC1` and `AC2` both covered); and `task.json` `alignment.prdHash` equals the SHA-256 of the current `prd.md`.

#### 步骤 3 Author and confirm the CASE document

- Covers: AC1, AC2
- Target: `.workloom/tasks/legacy-case/case.md` (new file: YAML front matter plus the canonical `## References` … `## Traceability` sections)
- Edit: create — the CASE document owns exactly this content:
  ````markdown
  ---
  version: 1
  task: tasks/legacy-case
  ---

  # CASE: legacy-case

  ## References

  - PRD: `prd.md`
  - Implementation: `plan.md`
  - Code target: `master` at the fixture repository root (this task has no worktree)
  - Source task: none

  ## Scope

  - Requirements: `R1`, `R2`
  - Acceptance criteria: `AC1`, `AC2`
  - Out of scope:
    - Any product source file: the fixture repository ships none and this task adds none.
    - Network egress beyond loopback: the runtime case opens only a `127.0.0.1` socket.

  ## Static Review

  ### SR1 Task material structure and alignment credential

  - Covers: `AC1`
  - Target: `.workloom/tasks/legacy-case/prd.md`
  - Checks:
    1. The file starts with the H1 `# legacy-case` and carries the `## Goal`, `## Requirements`, `## Acceptance Criteria`, `## Notes` and `## Alignment Decisions` sections.
    2. Requirements are numbered `R1` and `R2`; acceptance criteria are numbered `AC1` and `AC2`, each naming its verification method and the R item it covers.
    3. The open-nodes marker reads `<!-- workloom:open-nodes=none -->`.
    4. `task.json` `alignment.prdHash` equals the SHA-256 of the current `prd.md`.
  - Expected: All four checks hold with no structural issue and no hash mismatch.

  ### SR2 Plan structure and legacy artefact removal

  - Covers: `AC1`
  - Target: `.workloom/tasks/legacy-case/plan.md`
  - Checks:
    1. The file starts with an H1 and carries the `## Design decisions` and `## Steps` sections.
    2. Every step under `## Steps` declares `Covers`, `Target`, `Edit` and `Verify`.
    3. Every acceptance criterion of `prd.md` appears in at least one step `Covers` list.
    4. `design.md` and `implement.md` no longer exist in the task directory.
  - Expected: All four checks hold.

  ### SR3 CASE document structure and traceability

  - Covers: `AC1`, `AC2`
  - Target: `.workloom/tasks/legacy-case/case.md`
  - Checks:
    1. The front matter declares `version: 1` and `task: tasks/legacy-case`.
    2. The six canonical sections `References`, `Scope`, `Static Review`, `Runtime Cases`, `Coverage` and `Traceability` are present.
    3. Every SR and C item declares `Covers`, `Target`, `Checks` and `Expected` (plus `Preconditions`, `Steps`, `Evidence` and `Cleanup` for the C item) and the ids run sequentially from `SR1` and `C1`.
    4. The `Traceability` table maps `AC1` and `AC2` onto existing SR and C ids.
  - Expected: All four checks hold; the structural review of `case.md` reports zero issue.

  ## Runtime Cases

  ### C1 Deterministic loopback socket check

  - Covers: `AC2`
  - Preconditions:
    1. `node` (version 22 or newer) is on `PATH`.
    2. The fixture repository is checked out at the project root and loopback TCP is permitted.
    3. Every step runs from the task directory `.workloom/tasks/legacy-case/`, so `case-evidence/` resolves to `.workloom/tasks/legacy-case/case-evidence/`.
  - Steps:
    1. Write the checker script to `case-evidence/c1-socket-check.mjs` with the exact content given in the Edit block of `plan.md` step 4.
    2. Run `node case-evidence/c1-socket-check.mjs` and tee its combined output into `case-evidence/c1-socket-check.log`.
    3. Read `case-evidence/c1-socket-check.log` and assert it contains the line `SOCKET_CHECK=ok`.
  - Expected:
    1. The command exits 0 and the log contains `SOCKET_CHECK=ok port=<ephemeral-port> token=workloom-case-ok`.
    2. When the environment forbids opening the socket, the script exits 2 and prints `SOCKET_CHECK=blocked reason=...`; the C item is then recorded as `blocked`, never as passed.
  - Evidence:
    - `case-evidence/c1-socket-check.log`
  - Cleanup: none - the checker script closes its own listener before exiting, and both the script and the log are the retained evidence artefacts.

  ## Coverage

  - Tool: `node --experimental-test-coverage --test` (Node.js built-in coverage driven by the test runner, Node 22 or newer)
  - Instrumentation: the aggregate command runs the checker script under the Node.js built-in coverage reporter with the test runner, which reports line coverage for the loaded script; the runtime case C1 runs the same script without the coverage flag so the script's own exit code (0 ok, 2 blocked, 1 failed) stays observable
  - Aggregate command:
    ```bash
    node --experimental-test-coverage --test case-evidence/c1-socket-check.mjs
    ```
  - Scope: `.workloom/tasks/legacy-case/case-evidence/c1-socket-check.mjs` - the only executable file this task introduces
  - Exclusions:
    - `.workloom/`: task bookkeeping and fixture documents are not product source and carry no runtime behaviour
  - Raw outputs: none - every file this task touches lives under `.workloom/`, so the RESULT reports `not_applicable` with an empty changed-file table

  ## Traceability

  | AC | Static review | Runtime cases |
  | --- | --- | --- |
  | AC1 | SR1, SR2 | C1 |
  | AC2 | SR3 | C1 |
  ````
- Verify: `for s in "## References" "## Scope" "## Static Review" "## Runtime Cases" "## Coverage" "## Traceability"; do grep -qx "$s" .workloom/tasks/legacy-case/case.md || echo "MISSING $s"; done` prints nothing, and the structural review of `case.md` reports zero issue.

#### 步骤 4 Execute the CASE and retain the evidence

- Covers: AC2
- Target: `.workloom/tasks/legacy-case/case-evidence/c1-socket-check.mjs` (new file), `.workloom/tasks/legacy-case/case-evidence/c1-socket-check.log` (new file), `.workloom/tasks/legacy-case/case-evidence/sr-checks.log` (new file), `.workloom/tasks/legacy-case/case-evidence/coverage-aggregate.log` (new file), `.workloom/tasks/legacy-case/case-evidence/case-hash.log` (new file), `.workloom/tasks/legacy-case/case-evidence/code-fingerprint.log` (new file), `.workloom/tasks/legacy-case/case-result.md` (new file)
- Edit: create — the checker script owns exactly this content:
  ```js
  import { connect, createServer } from 'node:net'

  const TOKEN = 'workloom-case-ok'

  const server = createServer((socket) => {
    socket.once('data', () => socket.end(TOKEN))
  })

  server.on('error', (error) => {
    console.error(`SOCKET_CHECK=blocked reason=${error.message}`)
    process.exit(2)
  })

  server.listen(0, '127.0.0.1', () => {
    const { port } = server.address()
    const client = connect(port, '127.0.0.1', () => client.write('ping'))
    const chunks = []
    client.on('data', (chunk) => chunks.push(chunk))
    client.on('error', (error) => {
      server.close()
      console.error(`SOCKET_CHECK=blocked reason=${error.message}`)
      process.exit(2)
    })
    client.on('end', () => {
      const received = Buffer.concat(chunks).toString('utf8')
      server.close()
      if (received === TOKEN) {
        console.log(`SOCKET_CHECK=ok port=${port} token=${received}`)
        process.exit(0)
      }
      console.error(`SOCKET_CHECK=failed expected=${TOKEN} received=${received}`)
      process.exit(1)
    })
  })
  ```
  and the RESULT document follows the canonical `case-result.md` template with these binding constraints:
  1. Front matter: `version: 1`, `task: tasks/legacy-case`, `caseHash` = the confirmed CASE hash, `codeBaseline` carrying `codeFingerprint=<64-hex>`, `checkSession` = the CASE design session, `status: passed`, plus a non-empty `startedAt` and `completedAt`.
  2. `## Summary` reports `- Coverage: not_applicable` and `- Standard verification: passed`.
  3. `## Static Review Results` lists SR1, SR2 and SR3 and `## Runtime Results` lists C1, each with `- Status: passed`.
  4. `## Coverage` uses `- Status: not_applicable` and `- Overall lines: N/A`, an empty `### Changed Files` table, and an `### Exclusions` table whose reason cell is wrapped in backticks so that it matches the CASE exclusion verbatim.
  5. `## Standard Verification` has at least one row whose exit-code column reads `0`, and every listed command exits `0`.
  6. `## Open issues` is the final section and contains exactly `- none`.
  7. Every `case-evidence/...` path quoted in the RESULT exists inside the task directory; the retained evidence files are `case-evidence/sr-checks.log`, `case-evidence/c1-socket-check.log`, `case-evidence/c1-socket-check.mjs`, `case-evidence/coverage-aggregate.log`, `case-evidence/case-hash.log` and `case-evidence/code-fingerprint.log`.
- Verify: `node .workloom/tasks/legacy-case/case-evidence/c1-socket-check.mjs` exits 0 and prints `SOCKET_CHECK=ok`, and `grep -q "SOCKET_CHECK=ok" .workloom/tasks/legacy-case/case-evidence/c1-socket-check.log` exits 0.
