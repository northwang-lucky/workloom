---
name: workloom_continue
title: Continue the task
description: On session resume, locate where work left off and route to the matching Phase step by status
argument-hint: ''
---

# Continue the task

1. Read the current active task and its `task.json` status.
2. Read git status and recent commits.
3. Route by status and artifacts:

   - `planning` without prd → 1.1 Align requirements.
   - `planning` with prd → judge lightweight vs complex; artifacts ready → 1.4 await review.
   - `in_progress`, not yet implemented → 2.1 Implement.
   - `in_progress`, implemented but unchecked → 2.2 Check.
   - Check passed → 2.3 Commit → 3.1 Wrap up.

4. Load the step details and continue from there.

Completion criteria: located the exact Phase step and started executing it.
