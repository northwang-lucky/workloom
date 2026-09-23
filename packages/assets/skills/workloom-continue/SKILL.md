---
name: workloom-continue
description: On session resume, locate where the active task left off and route to the matching workflow step by status — use whenever the user says "continue", "resume", "pick up where we stopped", or asks what to do next on the active workloom task (replaces the old /workloom-continue command).
---

# Workloom Continue

Locate where work left off and resume from the matching Phase step. Do the routing yourself: read the active task's `task.json` and check artifact existence with file reads — no routing tool exists.

## Steps

1. Read the active task of this session and its `task.json` `status`. With no active task, tell the user to create or start one first (1.0).
2. Read `git status` and the recent commits to see what actually changed.
3. Route by `status` and artifacts (artifact files live inside the task directory):

   - `planning` without prd.md → 1.1 Align requirements.
   - `planning` with prd.md but no design.md → 1.4 await review (lightweight task, PRD artifacts ready).
   - `planning` with prd.md and design.md → 1.4 await review (complex task, PRD/design/implement artifacts ready).
   - `in_progress`, not yet implemented → 2.1 Implement.
   - `in_progress`, implemented but unchecked → 2.2 Check.
   - Check passed → 2.3 Commit → 3.1 Wrap up.
   - `completed` → 3.1 Wrap up.

4. Load the step details (`workloom_step` or the workflow contract) and continue from there.

## Note

When the route reaches 3.1 Wrap up, every `workloom_task_archive` and `workloom_journal` call must pass `taskPath` explicitly — both tools require it and never fall back to the active task.

Completion criteria: the exact Phase step is located and its execution has started.
