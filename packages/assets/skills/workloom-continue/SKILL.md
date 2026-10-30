---
name: workloom-continue
description: On session resume, locate where work left off and route to the matching workflow step by status — with an active task continue it; with none, scan the project's tasks and route to the next pending one. Use whenever the user says "continue", "resume", "pick up where we stopped", or asks what to do next (replaces the old /workloom-continue command).
---

# Workloom Continue

Locate where work left off and resume from the matching Phase step. Do the routing yourself: read the active task's `task.json` (or the candidate selected in step 1 when this session has none) and check artifact existence with file reads — no routing tool exists.

## Steps

1. Read the active task of this session and its `task.json` `status`. With no active task, do not stop — find the continuation candidate among the project's existing tasks (the session context already lists them right under `No active task.`):

   1. List every task with `workloom_task_list`.
   2. No task exists → tell the user to create one first (1.0).
   3. `in_progress` tasks exist → with exactly one, continue it (route via step 4); with several, recommend one with a one-line reason, list the others, and let the user pick.
   4. Otherwise `completed` tasks exist → route the oldest one to 3.1 Wrap up.
   5. Otherwise all tasks are `planning` → a container task stays in planning; among the subtasks pick the next pending one in dependency order (parent plan or children order), inspect its artifacts, recommend it with a one-line reason, and enter its Phase step once the user confirms.

   The session pointer to the selected task appears only when it starts: until then, pass its `taskPath` explicitly to every workloom tool call.
2. Read `git status` and the recent commits to see what actually changed. If the active (or selected) task has a worktree, report its location and branch state (present, missing, or dirty) too, and run implement/check-stage work in that worktree.
3. Re-evaluate whether the task is still warranted before routing. If the remaining work has shrunk below the light-task standard (a few files, settled requirements, low risk), recommend collapsing the task — finish it directly or archive it — instead of walking the full track; get the user's decision before changing the route.
4. Route by `status` and artifacts (artifact files live inside the task directory):

   - `planning` with `mode: "light"` → light 1.0 Start task (fill the light prd minimum, then start; no alignment credential or jsonl).
   - `planning` without prd.md → 1.1 Align requirements.
   - `planning` or `in_progress` with design.md/implement.md but no plan.md → load the workloom-migrate-plan skill (legacy artifacts of the pre-plan.md contract), migrate, then re-route.
   - `planning` with prd.md but no plan.md → 1.4 await review (lightweight task, PRD artifacts ready).
   - `planning` with prd.md and plan.md → 1.4 await review (complex task, PRD/plan artifacts ready).
   - `in_progress`, not yet implemented → 2.1 Implement.
   - `in_progress`, implemented but unchecked → 2.2 Check.
   - Check passed → 2.3 Commit → 3.1 Wrap up.
   - `completed` → 3.1 Wrap up.

5. Load the step details (`workloom_step` or the workflow contract) and continue from there.

## Note

When the route reaches 3.1 Wrap up, every `workloom_task_archive` and `workloom_journal` call must pass `taskPath` explicitly — both tools require it and never fall back to the active task.

Completion criteria: the exact Phase step is located and its execution has started.
