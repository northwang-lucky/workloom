# repo/terminology standards

Shared vocabulary for this repository. Use these terms; avoid the listed alternatives.

- runtime: an external AI coding platform (DeepSeek Harness, Pi, Claude Code, …) that hosts an adapter — avoid "platform"
- adapter: the runtime-specific wrapper following that runtime's official plugin format — avoid "plugin"
- core: runtime-independent logic — task lifecycle, workflow state machine, context assembly, asset rendering — avoid "engine", "kernel"
- assets: runtime-independent content (skills, agents, commands) as Markdown + YAML front-matter — avoid "resources"
- executor: the abstraction that runs research/implement/check/frontend, inline or as a subagent — avoid "worker", "runner"
- frontend executor: the executor kind (`frontend`) dedicated to the task's frontend UI file implementation — it follows the PRD `## UI Design` section and the design UI chapter, only touches frontend files, and uses an annotated mock/placeholder for a missing backend interface instead of implementing the backend — avoid "ui agent"
- effort: the executor's reasoning tier — `low` / `medium` / `high` / `xhigh` / `max` in core, mapped by adapters — avoid "thinking level", "budget"
- workflow-state breadcrumb: the per-turn task + phase guidance block injected into the main session; the only per-turn phase-control channel — avoid "status banner", "phase hint"
- workflow contract: the workflow state-machine contract (tag blocks, step ids, state enum, transitions) shipped with the package; projects cannot customize it
- workflow guidance: the natural-language guidance text per state; shipped defaults, overridable locally via overlay
- workflow overlay: the optional project-level guidance override (`.workloom/workflow.override.md`) — changes only "how a step is done", never the state machine
- workflow profile: an optional contract + guidance bundle, reserved for later; only the contract loader and overlay merger keep replaceable seams today
- grilling: the Phase 1.1c design-tree questioning skill — frontier rounds with a recommended answer each, until no open assumptions remain
- brainstorm: the Phase 1.1a requirement exploration skill — all open questions listed once per stage as one numbered batch, conclusions written into prd.md as you go
- requirement alignment: the Phase 1 completion state — every requirement decidable, unambiguous, no open assumptions; the hard gate before document writing
- task: one task directory (task.json, prd/design/implement, research/, jsonl lists) — avoid "issue", "ticket"
- spec: coding standards organized as `spec/<package>/<layer>/index.md`
- spec index: the spec index path list injected at session start (the guidelines section of the session-context snapshot, filtered by configured packages)
- journal: the per-developer session log forming cross-session project memory (workspace) — avoid "log", "diary"
- init: the adapter's built-in init command that generates/updates the project's `.workloom` directory and supports migration from a legacy layout
