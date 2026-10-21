---
version: 1
states:
  - planning
  - in_progress
  - completed
---

# workloom Light Workflow

Light tasks are created with `mode: "light"`. The main session implements, self-checks, and commits them directly — no executor is dispatched — and the start/check gates are relaxed accordingly.

This contract covers active light tasks only: it has no `no_task` block (the main contract owns that guidance) and no norms block (norms always come from the main contract). Project overlays apply to the full track only; this file is used verbatim for light tasks. Step ids reuse the main contract numbering so `workloom_step` keeps resolving the same ids.

## Phase 1 Plan

#### 1.0 Start task

Create the light task with `workloom_task_create` and pass `mode: "light"`, then fill prd.md to the light minimum: an H1 title, a filled `## Goal` section, and the acceptance points you will verify. Skip Phase 1.1 alignment — light tasks carry no alignment credential, no implement/check jsonl, and no open-nodes marker. Run `workloom_task_start`; the light start gate only rejects a missing prd.md, a missing H1 title, or a missing/placeholder Goal section.
Completion criteria: prd.md meets the light minimum and `task.json` `status` is `in_progress`.

## Phase 2 Execute

#### 2.1 Implement

Implement the change directly in the main session — do not dispatch an executor (`workloom_execute` rejects dispatches for light tasks unless forced with a recorded reason). Keep the change small and low risk: a few files, no new external interfaces. If the work grows past the light standard, finish it in this task or archive it and create a full task instead of stretching the mode. Follow the same verification bar as a full task (lint, typecheck, tests, and LSP diagnostics when available), and work in the task worktree when one exists.
Completion criteria: changes are done and lint/typecheck/tests pass.

#### 2.2 Self-check and record

Self-check the change against prd.md and the usual verification commands, then record the pass with `workloom_task_check` and a summary of what you verified. Light tasks need no check.jsonl entries and no check executor; the recorded summary is the audit trail. Fix every finding before recording, and re-run the self-check (with a fresh record) after any change that lands post-pass.
Completion criteria: `workloom_task_check` recorded the pass with a non-empty summary.

#### 2.3 Commit

The main session commits in batches: one commit per logical change, message format `<type>(<scope>): <description>`. When the task has a worktree, code commits happen on the task branch inside that worktree; task-metadata bookkeeping stays in the main repository, and the two kinds are never mixed in one commit.
Completion criteria: `git status` shows no dirty files belonging to this task.

## Phase 3 Wrap up

#### 3.1 Archive and record

Load the `workloom-finish` skill: check dirty files → archive the task (`workloom_task_archive`) → record the session (journal). Both `workloom_task_archive` and `workloom_journal` require an explicit `taskPath`. The archive gate still requires a recorded check, which the self-check in 2.2 provides.
Completion criteria: the task is under `archive/` with `status` `completed`, and the journal has recorded this session.

[workflow-state:planning]
The light task is in planning. Fill prd.md to the light minimum (H1, Goal, acceptance points) and run `workloom_task_start`; skip Phase 1.1 alignment, the context jsonl files, and the open-nodes marker. Do not write implementation code before the task starts.
[/workflow-state:planning]

[workflow-state:in_progress]
The light task is in progress. The main session implements directly (no executor dispatch), self-checks with lint/typecheck/tests, records the pass with `workloom_task_check`, then commits. Keep the scope light; if the work grows, finish it here or archive the task and recreate it as a full task.
[/workflow-state:in_progress]

[workflow-state:completed]
The light task is archived. When the user asks for more, recommend whether a new task is warranted and create it only after the user confirms (follow 1.0 of the main contract); do not modify tasks under the archive directory. If this session is wrapping up and no journal entry has been recorded yet, load the `workloom-finish` skill to record it.
[/workflow-state:completed]
