---
version: 1
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

First load the brainstorm skill and explore requirements question by question: what is wanted, what the constraints are, how acceptance will be judged. For tasks with design decisions, load the grilling skill and grill the plan round by round using the design-tree method, giving a recommended answer per question. Tasks involving implementation work must ask the fixed question: does implementation require test-first delivery (A. yes: seams join the alignment scope; B. no: conventional implementation; C. critical paths only). For A/C, the confirmed seams go into prd.md acceptance criteria.
Completion criteria (hard gate): the aligned requirements have no grey areas — every requirement is decidable, unambiguously worded, and the frontier holds no open assumptions.

#### 1.2 Research (optional)

When code or technical investigation is needed, dispatch the research executor; write one file per topic under the task's `research/`, and report back only file paths plus a one-line summary each.
Completion criteria: findings are persisted and either referenced by 1.3's context lists or explicitly not referenced.

#### 1.3 Configure context

Fill implement.jsonl and check.jsonl with real entries (`{"file": "<path>", "reason": "<why>"}`): spec and research only, never code paths.
Completion criteria: each jsonl has at least one real entry (the seeded `_example` line does not count).

#### 1.4 Review and start

Hand prd.md (plus design.md/implement.md for complex tasks) to the user for review; after confirmation, run `workloom_task_start` and the task enters `in_progress`.
Completion criteria: `task.json` `status` is `in_progress` and the user has confirmed the review.

## Phase 2 Execute

#### 2.1 Implement

Dispatch the implement executor (model and effort per task configuration); the dispatcher injects context (spec, research, prd/design/implement). The subagent writes code, runs lint and typecheck, and must not git commit. Test-first tasks follow the tdd skill's red-green loop.
Completion criteria: changes are done, lint and typecheck pass, and the fixed-format report (file list + verification results) is returned.

#### 2.2 Check

Dispatch the check executor to review changes against spec and task artifacts, fix what it finds, and run lint and typecheck; the final check of a task must cover the full scope.
Completion criteria: no unresolved findings against spec, lint and typecheck all green.

#### 2.3 Commit

The main session commits in batches: one commit per logical change, message format `<type>(<scope>): <description>`.
Completion criteria: `git status` shows no dirty files belonging to this task.

## Phase 3 Wrap up

#### 3.1 Archive and record

Run `workloom_finish`: check dirty files → archive the task (`workloom_task_archive`) → record the session (journal). Archiving and recording each produce their own auto-commit.
Completion criteria: the task is under `archive/` with `status` `completed`, and the journal has recorded this session.

[workflow-state:no_task]
No active task right now. When the user expresses a need: first judge whether it is a simple answer or work worth a task; for work worth a task, follow Phase 1.0 to create it, then proceed by the planning guidance.
[/workflow-state:no_task]

[workflow-state:planning]
The task is in planning. Follow Phase 1: align requirements (brainstorm + grilling, no-grey-areas gate) → optional research → configure context → user review, then start. Do not write implementation code before the review; do not write documents before alignment reaches the no-grey-areas bar.
[/workflow-state:planning]

[workflow-state:in_progress]
The task is in progress. Follow Phase 2: implement → check → commit. Subagent artifacts are persisted; the main session controls commits; do not declare completion before 2.2 has passed.
[/workflow-state:in_progress]

[workflow-state:completed]
The task is archived. When the user asks for more, judge whether a new task is warranted (follow 1.0); do not modify tasks under the archive directory.
[/workflow-state:completed]
