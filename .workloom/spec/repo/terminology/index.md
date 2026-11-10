# repo/terminology standards

Shared vocabulary for this repository. Use these terms; avoid the listed alternatives.

- runtime: an external AI coding platform (DeepSeek Harness, Claude Code, …) that hosts an adapter — avoid "platform"
- adapter: the runtime-specific wrapper following that runtime's official plugin format — avoid "plugin"
- core: runtime-independent logic — task lifecycle, workflow state machine, context assembly, asset rendering — avoid "engine", "kernel"
- domain: the core's pure-JS behavior modules under `packages/core/src/domain/` (pure JS + JSDoc, no build), paired with the TypeScript abstractions under `src/service/` — avoid "legacy module"
- assets: runtime-independent content (skills, agents, commands) as Markdown + YAML front-matter — avoid "resources"
- executor: the abstraction behind the five dispatch roles — researcher / developer / frontend-developer / checker / judger, inline or as a subagent; the old research/implement/check/frontend/review kind names survive only as a legacy read on old records — avoid "worker", "runner"
- frontend-developer: the executor role dedicated to the task's frontend UI file implementation — it follows the PRD `## UI Design` section and the design UI chapter, only touches frontend files, and uses an annotated mock/placeholder for a missing backend interface instead of implementing the backend — avoid "ui agent", "frontend executor"
- effort: the executor's reasoning tier — `low` / `medium` / `high` / `xhigh` / `max` in core, mapped by adapters — avoid "thinking level", "budget"
- workflow-state breadcrumb: the per-turn task + phase guidance block injected into the main session; the only per-turn phase-control channel — avoid "status banner", "phase hint"
- workflow contract: the workflow state-machine contract (tag blocks, step ids, state enum, transitions) shipped with the package; projects cannot customize it
- workflow guidance: the natural-language guidance text per state; shipped defaults, overridable locally via overlay
- workflow overlay: the optional project-level guidance override (`.workloom/workflow.override.md`) — changes only "how a step is done", never the state machine
- workflow profile: an optional contract + guidance bundle, reserved for later; only the contract loader and overlay merger keep replaceable seams today
- workloom alignment: the single Phase 1.1 design tree — fixed root nodes, full-frontier rounds, recommended answers, incremental prd.md recording, and review → user confirmation → confirm; use `workloom-alignment` for the skill name
- requirement alignment: the Phase 1.1 completion state — every requirement decidable, unambiguous, no open nodes, and the prd.md content confirmation recorded (no document hash exists anywhere in the flow); the hard gate before document writing
- task: one task directory (task.json, prd/plan, research/, jsonl lists) — avoid "issue", "ticket"
- spec: coding standards organized as `spec/<package>/<layer>/index.md`
- spec index: the spec index path list injected at session start (the guidelines section of the session-context snapshot, filtered by configured packages)
- init: the adapter's built-in init command that generates/updates the project's `.workloom` directory and supports migration from a legacy layout
