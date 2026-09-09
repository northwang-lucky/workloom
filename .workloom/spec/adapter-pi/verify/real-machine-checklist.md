# real-machine checklist template

Every adapter-pi executor real-machine verification follows this structure. Reference instances: `verify-m1/m2/m3` under `tasks/archive/2026-09/pi-executor-parity/`.

## Required sections

- title and scope: one line naming the milestone/round and what behavior it verifies.
- verification items: grouped by scenario; each item carries (a) a one-sentence assertion, (b) the concrete operation and observation point — verbatim receipt text to expect, on-disk records to check (task.json dispatches, registry.json), and the process/system command to run.
- environment: pinned minimum — tmux session, fresh `/tmp` scratch project, `/workloom-init`, extension loaded from repo source via `PI_BIN=$(which pi) pi -e packages/adapter-pi/src/index.ts`.
- results table: item number / result / note per row; a PASS entry must cite captured evidence (pane text, file diff, command output), never a bare assertion.
- observations: correct-but-notable behaviors recorded explicitly as non-defects.

## Execution rules

- the main session runs the checklist; a dispatch subagent's self-report of "all green" is not real-machine evidence.
- re-start the pi host after each code fix before re-running items (the loaded extension snapshot is from process start).
- check process liveness with `ps -p <pid>`; `pgrep -f` self-matches the verifier's own command line.
- respect real elapsed windows of the behavior under test (e.g. a child's sleep starts after its own boot); probing too early is a test bug, not a product defect.
- defects found get ledger numbers, are fixed within the same round, and the whole checklist re-runs after the fix.
