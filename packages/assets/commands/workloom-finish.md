---
name: workloom_finish
title: Wrap up
description: Check dirty files, archive the task, record the session journal, and separate work commits from bookkeeping commits
argument-hint: ''
---

# Wrap up

1. List the active task, git status, and recent commits.
2. Check dirty files: uncommitted files still belonging to this task → refuse to wrap up and go back to 2.3 Commit; work from other windows → report and continue; unclear → ask once.
3. Archive: archive the active task; archive other completed tasks after a one-time confirmation.
4. Record: record this session in the journal (title + work commit hash + summary).

Completion criteria: the task is archived, the journal is recorded, and git history order is work commits → archive commit → bookkeeping commit.
