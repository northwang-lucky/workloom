# adapter-pi/verify standards

Verification discipline for changes to the Pi adapter's executor runtime behavior.

- real-machine: every task round that changes adapter-pi executor behavior (dispatch, settle, continuation, registry lifecycle, capacity gate) must produce and execute a real-machine checklist in a tmux pi TUI before the task check passes — see real-machine-checklist.md
- unit-gap: "unit tests green" is insufficient evidence for async or process-level behavior (spawn timing windows, registry lifecycle, RPC liveness); the checklist exists to close exactly that gap
- counter-example: an executor change whose acceptance relied only on bun test numbers and passed check, while a same-turn parallel dispatch race stayed unproven
