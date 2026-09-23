---
name: workloom-finish
description: Wrap up the session — check dirty files, archive the task, record the session journal, and separate work commits from bookkeeping commits — use when the session ends, the user says "finish", "wrap up", "archive and record", or asks to close out the current workloom task (replaces the old /workloom-finish command).
---

# Workloom Finish

Wrap the session up end to end. Run the checks yourself (`git status`, recent commits); the steps below tell you what to do with the results.

## Steps

1. List the active task, `git status`, and recent commits.
2. Check dirty files: uncommitted files still belonging to this task → refuse to wrap up and go back to 2.3 Commit; work from other windows → report and continue; unclear → ask once.
3. Archive: archive the active task with `workloom_task_archive`; archive other completed tasks after a one-time confirmation.
4. Record: record this session in the journal with the `workloom_journal` tool (title + work commit hash + summary).
5. Propose spec candidates: skim this task's implementation decisions and conventions; if any is worth persisting as a team standard (decidable, reusable, not one-off), propose it to the user with the workloom-update-spec skill — write it only after the user confirms; otherwise skip silently.

## Note

Both `workloom_task_archive` and `workloom_journal` require an explicit `taskPath` (the task directory relative to `.workloom`); they never fall back to the active task.

Completion criteria: the task is archived, the journal is recorded, and git history order is work commits → archive commit → bookkeeping commit.
