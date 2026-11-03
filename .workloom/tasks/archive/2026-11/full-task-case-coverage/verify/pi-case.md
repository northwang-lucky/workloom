# Pi CASE real-machine checklist

Scope: CASE 工具、purpose、stage、同 child 续用、进程恢复、全文注入和超预算失败。

## Environment

- Fresh scratch project: `/tmp/workloom-pi-case-1103`.
- Dedicated tmux session: `workloom-pi-case-1103`; no existing user session is touched.
- Loaded worktree source: `PI_BIN=$(which pi) pi -e /data00/home/wangyubo.1219/workbench/code-src/github/workloom/.workloom/worktree/11-03-full-task-case-coverage/packages/adapter-pi/src/index.ts`.
- Use a fresh task and real child sessions; save pane text and task.json excerpts as evidence.
- Main-session execution only; do not delegate this checklist to the executor.

## Verification items

1. **Tool surface**: `workloom_task_case` is visible with review/confirm and expectedCaseHash; confirm is unavailable to child executors.
2. **Start gate**: a full implementation task without plan.md is rejected; after a valid PLAN, start writes `case.required=true`.
3. **CASE design**: `purpose=case-design` dispatches a real check child, leaves stage=implement and records designSession plus purpose.
4. **Confirmation**: review returns readyToConfirm for a valid CASE; confirm records the current hash; editing CASE makes execution fail before a new child starts.
5. **Execution continuation**: after re-confirm, `purpose=execution` continues designSession, moves stage=check and sends only the incremental instruction plus confirmed hash.
6. **Process recovery**: restart the Pi host, continue the same durable child id, and confirm the id is unchanged; no fallbackOf chain is fabricated.
7. **Full injection**: first dispatch and reinject contain the current CASE and both template bodies; ordinary continuation does not repeat them.
8. **Budget failure**: an oversized CASE returns a byte-limit error and does not create a child or a dispatch record.
9. **Outcome gate**: a valid RESULT passes; a different session without fallbackOf, failed coverage, blocked C item, or force=true is rejected without an override.

## Results

| Item | Result | Evidence |
| --- | --- | --- |
| 1 | PASS | `case-evidence/pi-case-design-dispatch.txt` shows review action returning case/caseHash/structureIssues/readyToConfirm; Pi child has no CASE task tool surface. |
| 2 | PASS | `case-evidence/pi-start-gate.txt` shows missing-PLAN rejection; `case-evidence/pi-valid-start.txt` plus scratch task.json show successful start, `case.required=true`, and no override. |
| 3 | PASS | `case-evidence/pi-clean-design.txt` and `pi-clean-design-task.json` show a fresh task with purpose=case-design, non-empty designSession, and stage=implement after dispatch. |
| 4 | PASS | `case-evidence/pi-confirm-execution.txt` and `pi-confirm-execution-task.json` show review/confirm, current caseHash, and stale-CASE rejection before execution. |
| 5 | PASS | The same evidence records execution with the designSession childId, purpose=execution, stage=check, and the spawn binding preserved. |
| 6 | PASS | Dedicated host was restarted with `--session 01a1a0cd-8592-71e6-9be7-07313b85c814` and the same MiniMax model; `pi-before-host-restart.txt` / `pi-host-recovery.txt` preserve the timeline, and no fallbackOf was fabricated. |
| 7 | PASS | `case-evidence/pi-injection-evidence.txt` is extracted from the real child JSONL: both full templates and current CASE are present initially; ordinary continuation carries the confirmed hash without repeating full templates. |
| 8 | PASS | `case-evidence/pi-budget-failure.txt` shows 8949 > 1024 and no new child; `pi-over-budget-task.json` confirms dispatches=[] and config restoration was reported afterward. |
| 9 | PASS | `case-evidence/pi-invalid-results.txt` extracts the original tool errors for session-chain, failed coverage, and blocked/pending cases; force added no override, and the restored resultHash matches the recorded valid check. |

## Observations

- Missing-PLAN rejection observed and saved to `case-evidence/pi-start-gate.txt`.
- The first model retry returned 503 service busy; evidence is saved to `case-evidence/pi-model-busy.txt`. Retry will reuse this same Pi session after at least one minute.
- The CASE execution child also failed with 503 before producing a result; it will be resumed by child id rather than replaced.
- PRD retains its pre-existing byte-budget truncation behavior; the new no-truncation failure applies to CASE only, as reviewed.
