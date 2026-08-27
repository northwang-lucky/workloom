---
version: 6
states:
  - no_task
  - planning
  - in_progress
  - completed
---

# workloom Workflow

## Principles

1. One step, one state: at any moment there is at most one active task; task state is maintained by the task-management tools, and the breadcrumb reflects it.
2. Align before implementing: do not write implementation code until the requirements pass the "no grey areas" bar (every requirement is decidable, unambiguous, with no open assumptions).
3. Persist artifacts: requirements, designs, research, and session records go into `.workloom/tasks/` and `.workloom/workspace/`. Conversations get compacted; files don't.
4. Commit authority stays in the main session: subagents implement and check; git commits happen only in the main session's Phase 2.3 and Phase 3.

## Phase 1 Plan

#### 1.0 Create task

When the user expresses work worth doing, create a task (`workloom_task_create`); the task enters `planning`.
Completion criteria: the task directory exists and `task.json` `status` is `planning`.

#### 1.1 Align requirements

First load the brainstorm skill and explore the requirements — what is wanted, what the constraints are, how acceptance will be judged. For tasks with design decisions, load the grilling skill and grill the plan round by round using the design-tree method, giving a recommended answer per question. Tasks involving implementation work must ask the fixed test-first question (below).

Every question across the workflow — fixed questions and exploratory questions alike — follows these rules:

1. Ask in the user's language; you judge which language that is from how the user writes.
2. Keep the options out of the question text: the question states only what is being asked, and the options follow as a separate numbered list.
3. Never use an interactive question tool (ask_user_question and equivalents); pose questions as plain text output on any runtime.
4. Never ask one question at a time: once per stage, list every open question identified so far as one numbered batch, and let the user answer them freely, in any order and any subset.

**The fixed test-first question:** does implementation require test-first delivery?
Options:
- A. yes: seams join the alignment scope.
- B. no: conventional implementation.
- C. critical paths only.

For A/C, the confirmed seams go into prd.md acceptance criteria.
Completion criteria (hard gate): the aligned requirements have no grey areas — every requirement is decidable, unambiguously worded, and the frontier holds no open assumptions.

#### 1.2 Research (optional)

When code or technical investigation is needed, dispatch the research executor with `workloom_execute`; it writes one file per topic under the task's `research/`, and reports back only file paths plus a one-line summary each.
Completion criteria: findings are persisted and either referenced by 1.3's context lists or explicitly not referenced.

#### 1.3 Configure context

Fill implement.jsonl and check.jsonl with real entries (`{"file": "<path>", "reason": "<why>"}`): spec and research only, never code paths. Referenced spec files must live under `.workloom/spec/` in its two-level layout (`<package>/<layer>/`).
Completion criteria: each jsonl has at least one real entry (the seeded `_example` line does not count).

#### 1.4 Review and start

Once prd.md is finalized, a task involving implementation work asks the user whether to author design.md/implement.md.
Options:
- A. author both.
- B. author neither.
On "author both", write design.md and implement.md first. Then hand all task documents to the user for review; after confirmation, run `workloom_task_start` and the task enters `in_progress`. The start tool is gated: it refuses while any prd.md section is still the skeleton placeholder or while implement.jsonl/check.jsonl hold no real entries; tasks with no spec to reference may pass `force: true` (ideally with `reason`), and the bypass is recorded in task.json `overrides` for audit.
Completion criteria: for a task involving implementation work, the design/implement question has been answered; `task.json` `status` is `in_progress`; and the user has confirmed the review.

## Phase 2 Execute

#### 2.1 Implement

Dispatch the implement executor with `workloom_execute` (model and effort per task configuration); the dispatcher injects context (spec, research, prd/design/implement). Always pass a semantic `title` with the dispatch (required by the schema) so repeated dispatches of the same task remain distinguishable in subagent sessions. The subagent writes code, runs lint and typecheck, and must not git commit. Test-first tasks follow the tdd skill's red-green loop. Hard constraint: the main session must not write implementation code directly — including test-first test seeds — and every implementation file change comes from the dispatched implement subagent. On DSH, `executor.gate` denies the main session's direct write/edit of files outside `.workloom/` while the task is in progress, and file writes inside bash commands are not interceptable, so this contract is the backstop — route changes through `workloom_execute` instead of working around the gate.
Completion criteria: changes are done, lint and typecheck pass, and the fixed-format report (file list + verification results) is returned.

#### 2.2 Check

Dispatch the check executor with `workloom_execute`: it reviews changes against the spec files referenced in check.jsonl and the task artifacts (prd/design/implement), checking structure, naming, types, and potential bugs item by item, and fixes what it finds itself — do not just report. It then runs lint and typecheck. The final check of a task must cover the full scope. When the check passes, the main session calls `workloom_task_check` with a summary; the tool writes `check.passedAt` + `check.summary` into task.json (it requires at least one real check.jsonl entry; `force: true` bypasses and is recorded).
Completion criteria: no unresolved findings against spec, lint and typecheck all green, and `workloom_task_check` has recorded the pass.

#### 2.3 Commit

The main session commits in batches: one commit per logical change, message format `<type>(<scope>): <description>`.
Completion criteria: `git status` shows no dirty files belonging to this task.

## Phase 3 Wrap up

#### 3.1 Archive and record

Run `workloom_finish`: check dirty files → archive the task (`workloom_task_archive`) → record the session (journal). Archiving and recording each produce their own auto-commit. The archive tool is gated: it refuses when task.json has no `check` field (no new/legacy distinction), so either record a passed check via `workloom_task_check` first, or pass `force: true` with `reason` for a recorded bypass.
Completion criteria: the task is under `archive/` with `status` `completed`, and the journal has recorded this session. Do not consider the phase done with tool calls alone: session wrap-up requires the `/workloom-finish` command (it produces the journal record and the bookkeeping commit; the archive tool alone leaves no journal).

[workflow-state:no_task]
No active task right now. When the user expresses a need: first judge whether it is a simple answer or work worth a task; for work worth a task, follow Phase 1.0 to create it, then proceed by the planning guidance.
[/workflow-state:no_task]

[workflow-state:planning]
The task is in planning. Follow Phase 1: align requirements (brainstorm + grilling, no-grey-areas gate) → optional research → configure context → for implementation work, ask whether to author design/implement → user review, then start. Do not write implementation code before the review; do not write documents before alignment reaches the no-grey-areas bar.
[/workflow-state:planning]

[workflow-state:in_progress]
The task is in progress. Follow Phase 2: implement → check → commit. Subagent artifacts are persisted; the main session controls commits; do not declare completion before 2.2 has passed, and once 2.2 passes record it with `workloom_task_check` — archiving refuses without it. On DSH, `executor.gate` denies the main session's direct write/edit of files outside `.workloom/` while the task is in progress — dispatch `workloom_execute` instead of working around the gate (lift it with `executor.gate: false` in config.yaml only when necessary).
[/workflow-state:in_progress]

[workflow-state:completed]
The task is archived. When the user asks for more, judge whether a new task is warranted (follow 1.0); do not modify tasks under the archive directory. If this session is wrapping up and no journal entry has been recorded yet, run the `/workloom-finish` command to record it.
[/workflow-state:completed]

[workflow-norms]
Questioning (always-on):

1. Ask in the user's language; you judge which language that is from how the user writes.
2. Keep the options out of the question text: the question states only what is being asked, and the options follow as a separate numbered list.
3. Never use an interactive question tool (ask_user_question and equivalents); pose questions as plain text output on any runtime.
4. Never ask one question at a time: once per stage, list every open question identified so far as one numbered batch, and let the user answer them freely, in any order and any subset.

Dispatch (always-on):

- Hard constraint: the main session must not write implementation code directly — including test-first test seeds — and every implementation file change comes from the dispatched implement subagent.
[/workflow-norms]
