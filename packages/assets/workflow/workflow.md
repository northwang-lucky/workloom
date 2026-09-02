---
version: 17
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
4. Commit authority stays in the main session: subagents implement and check; the main session fixes check-stage findings per 2.2; git commits happen only in the main session's Phase 2.3 and Phase 3.
5. Model recommends, user confirms subtasks: the model only recommends splitting a task and never creates subtask tasks before the user confirms the candidate list and the split itself. A container task stays in planning; its subtasks run their own full lifecycle; the container does the final acceptance and archives last. Subtask checks follow the same check discipline as main-task checks — they fix P2 findings themselves and escalate P0/P1 in their reports; "the container does the final acceptance" refers only to the timing and responsibility of the overall acceptance, not to a read-only role for the check executor, and "fixing is decided by the container" does not hold. This does not conflict with "one active task" — at any moment at most one task (the container or one of its subtasks) is the active task.

## Phase 1 Plan

#### 1.0 Create task

When the user expresses work worth doing, recommend whether it warrants a task; create the task (`workloom_task_create`) only after the user confirms. The task enters `planning`.
When recommending, roughly count the independently deliverable pieces: if there are 3 or more pieces that can be delivered and accepted independently, pre-announce in the recommendation that the task should be split into N subtasks, and never create them before the user confirms the split.
Completion criteria: the task directory exists and `task.json` `status` is `planning`.

#### 1.1 Align requirements

First load the `workloom-brainstorm` skill and explore the requirements — what is wanted, what the constraints are, how acceptance will be judged. For tasks with design decisions, the sequence is brainstorm → grilling → prd finalized: load the grilling skill and grill the plan round by round using the design-tree method, giving a recommended answer per question. After every user answer, recompute the design-tree frontier; new branches mean another round. Never declare "frontier empty" just because the user answered the current batch — claim convergence only when no open question remains. Tasks involving implementation work must ask the fixed test-first question (below).

Every question across the workflow — fixed questions and exploratory questions alike — follows these rules:

1. Ask in the user's language; you judge which language that is from how the user writes.
2. Keep the options out of the question text: the question states only what is being asked, and the options follow as a separate numbered list.
3. Never use an interactive question tool (ask_user_question and equivalents); pose questions as plain text output on any runtime.
4. Never ask one question at a time: once per stage, list every open question identified so far as one numbered batch, and let the user answer them freely, in any order and any subset.

The fixed questions run in flow order: the test-first question (implementation tasks) → the UI-design question (yes enters 1.1b) → the grilling question (after the UI question answers no, or after 1.1b completes; yes enters 1.1c).

**The fixed test-first question:** does implementation require test-first delivery?
Options:
- A. yes: seams join the alignment scope.
- B. no: conventional implementation.
- C. critical paths only.

For A/C, the confirmed seams go into prd.md acceptance criteria.

**The fixed UI-design question:** Does this task involve frontend UI presentation?
Options:
- A. yes: UI design alignment joins the alignment scope (Phase 1.1b).
- B. no.

For A, after brainstorming, run Phase 1.1b UI design alignment with the `workloom-ui-design` skill: explore the UI axes (pages/components and information architecture, layout and navigation, visual style and design source, interactions and states, responsiveness, accessibility, observable acceptance points), record decidable UI requirements in a `## UI Design` section of prd.md, and require a UI design chapter in design.md when the task is complex. UI decisions then join grilling (Phase 1.1c) for the design-tree pressure test; all UI requirements face the same no-grey-areas gate.

**The fixed grilling question:** does this task involve design-tree grilling?
Options:
- A. yes: grilling joins the alignment scope (Phase 1.1c).
- B. no.

Tasks whose UI-design question answered yes do not get this question — they go straight into Phase 1.1c grilling. For A: record the judgment with `workloom_task_check` (phase=grilling, required=true); after grilling converges, record passedAt + summary with a second call (phase=grilling, summary); the convergence conclusions go into prd.md acceptance criteria. For B: record required=false — the record distinguishes "answered no" from "never asked".

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
On "author both", write design.md and implement.md first. Then hand all task documents to the user for review; after confirmation, run `workloom_task_start` and the task enters `in_progress`. The start tool is gated: it refuses while prd.md has no H1 title, any prd.md section is still the skeleton placeholder, or implement.jsonl/check.jsonl hold no real entries; tasks with no spec to reference may pass `force: true` (ideally with `reason`), and the bypass is recorded in task.json `overrides` for audit.
Before starting, run a scale self-check: judge precisely by the actual number of phases in prd.md/design.md/implement.md. When the work is large, recommend a candidate subtask list — for each candidate, its title, its scope, and the reason it is a separate deliverable. The user confirms the list; then create the subtasks one by one with `workloom_task_create`, each with `parent` set to the main task. Every subtask runs the full lifecycle (start → check → archive); the main task starts, checks, and archives only after every declared subtask is archived.
Completion criteria: for a task involving implementation work, the design/implement question has been answered; `task.json` `status` is `in_progress`; and the user has confirmed the review.

## Phase 2 Execute

#### 2.1 Implement

Dispatch the implement executor with `workloom_execute` (model and effort per task configuration); the dispatcher injects context (spec, research, prd/design/implement). Always pass a semantic `title` with the dispatch (required by the schema) so repeated dispatches of the same task remain distinguishable in subagent sessions. Dispatch is background by default: `workloom_execute` returns the child session id and the receipt immediately, and the main session continues other work; the completion report arrives via the subagent notice. Pass `foreground: true` only when the main session must wait on the result, and use `continue_executor` only to append new work — never to collect a report. The subagent writes code, runs lint and typecheck, and must not git commit. Test-first tasks follow the tdd skill's red-green loop. Hard constraint (stage `implement`): while the task stage is `implement`, the main session must not write implementation code directly — including test-first test seeds — and every implementation file change comes from the dispatched implement subagent.

For a task with frontend UI presentation (the UI-design fixed question answered yes), its frontend file implementation must go through a `workloom_execute` dispatch with `kind: frontend`; the logic and backend parts still go through the implement executor. The check tool refuses such a task unless a frontend dispatch has been recorded (see 2.2), so route UI work through a dedicated frontend dispatch instead of folding it into the implement dispatch.
Completion criteria: changes are done, lint and typecheck pass, and the fixed-format report (file list + verification results) is returned. When LSP tooling is available, treat it as the first choice for code work: read structure through LSP symbol outlines and call signatures; resolve members and arguments with completions; rename symbols through server-side rename and fix them with code actions instead of hand-searched edits; and include an LSP diagnostics check in the verification pass.

#### 2.2 Check

Dispatch the check executor with `workloom_execute`: it reviews changes against the spec files referenced in check.jsonl and the task artifacts (prd/design/implement), checking structure, naming, types, and potential bugs item by item, and classifies every finding by severity before acting (the definitions below are the single source; the injected discipline summarizes them):

- P0 (blocking): acceptance criteria unmet; hard lint / typecheck / build / tests failures; security or data-integrity risks.
- P1 (important): behavioral or correctness defects; design or spec deviations (including cross-file semantic changes); issues that pre-date the current task, even mechanical ones.
- P2 (minor): mechanical issues (typos, naming, comments, formatting, weakened test assertions); small local defects confined to a single file; compliance fixes with no trade-offs.

Dispatch is background by default: `workloom_execute` returns the child session id and the receipt immediately, and the main session continues other work; the completion report arrives via the subagent notice. Pass `foreground: true` only when the main session must wait on the result, and use `continue_executor` only to append new work (for example a re-review) — never to collect a report.

The check executor fixes P2 findings itself — leaving one unfixed is a dereliction of duty — then runs lint and typecheck after fixing. It does not fix P0/P1 findings: its report ends with a structured `## Open issues` section listing every remaining issue as `- <file>:<line> [P0|P1|P2] <issue> — fix: <suggestion>`, or `- none` when nothing remains. The final check of a task must cover the full scope.

The main session's dispatch prompt must carry the same fix-and-escalate semantics — "fix small findings (P2) yourself, escalate big ones (P0/P1)" — and must not write constraints like "read-only review", "report only", or "do not change code": as user-level instructions they override the injected discipline. It must not steer the severity classification either; classification is the check executor's standard duty. If a dispatch prompt conflicts with the executor discipline anyway, the executor follows the discipline and states the conflict in the first line of its report.

While the task stage is `check`, the main session may fix issues directly, no fix dispatch needed; after fixing, re-dispatch the check executor for a full re-review. Before recording the pass with `workloom_task_check`, handle every remaining issue — fix it or record why not — and state the outcome in the summary. For a P0 finding the "record why not" path does not apply: the main session may only fix it or propose adjusting the acceptance baseline to the user, and only after the user confirms may it amend prd.md and re-dispatch the check executor against the new baseline. The tool writes `check.passedAt` + `check.summary` into task.json (it requires at least one real check.jsonl entry; `force: true` bypasses and is recorded). Any change after the pass is recorded requires a fresh check re-dispatch. For a task with a `## UI Design` section, it additionally refuses unless a `frontend` dispatch has been recorded.
Completion criteria: no unresolved findings against spec, lint and typecheck all green, and `workloom_task_check` has recorded the pass. When LSP tooling is available, treat it as the first choice for code work: read structure through LSP symbol outlines and call signatures; resolve members and arguments with completions; rename symbols through server-side rename and fix them with code actions instead of hand-searched edits; and include an LSP diagnostics check in the verification pass.

#### 2.3 Commit

The main session commits in batches: one commit per logical change, message format `<type>(<scope>): <description>`.
Completion criteria: `git status` shows no dirty files belonging to this task.

## Phase 3 Wrap up

#### 3.1 Archive and record

Run `workloom_finish`: check dirty files → archive the task (`workloom_task_archive`) → record the session (journal). Archiving and recording each produce their own auto-commit. The archive tool is gated: it refuses when task.json has no `check` field (no new/legacy distinction), so either record a passed check via `workloom_task_check` first, or pass `force: true` with `reason` for a recorded bypass. Before archiving the main task, confirm that every declared subtask is archived; if any is missing, state the reason and leave a trace (for example a note in the task record) so the gap is auditable.
Completion criteria: the task is under `archive/` with `status` `completed`, and the journal has recorded this session. Do not consider the phase done with tool calls alone: session wrap-up requires the `/workloom-finish` command (it produces the journal record and the bookkeeping commit; the archive tool alone leaves no journal).

[workflow-state:no_task]
No active task right now. When the user expresses a need, answer direct questions outright without a task; for work touching files or documents, recommend whether it warrants a task and create it only after the user confirms (follow 1.0), then proceed by the planning guidance.
[/workflow-state:no_task]

[workflow-state:planning]
The task is in planning. Act now, in order: load the workloom-brainstorm skill and explore requirements; then ask the fixed questions in flow order — test-first → UI → the fixed grilling question; for tasks with design decisions, run grilling (Phase 1.1c) after brainstorm and do not finalize prd.md before grilling converges. Then follow Phase 1: optional research → configure context → for implementation work, ask whether to author design/implement → user review, then start. Do not write implementation code before the review; do not write documents before alignment reaches the no-grey-areas bar.
[/workflow-state:planning]

[workflow-state:in_progress]
The task is in progress. Follow Phase 2: implement → check → commit. Subagent artifacts are persisted; the main session controls commits; do not declare completion before 2.2 has passed, and once 2.2 passes record it with `workloom_task_check` — archiving refuses without it. While the task stage is `implement`, route implementation through `workloom_execute`. While the task stage is `check`, the main session may fix issues directly — including implementation code; after fixing, re-dispatch the check executor for a full re-review before recording the pass. When LSP tooling is available, treat it as the first choice for code work: read structure through LSP symbol outlines and call signatures; resolve members and arguments with completions; rename symbols through server-side rename and fix them with code actions instead of hand-searched edits; and include an LSP diagnostics check in the verification pass.
[/workflow-state:in_progress]

[workflow-state:completed]
The task is archived. When the user asks for more, recommend whether a new task is warranted and create it only after the user confirms (follow 1.0); do not modify tasks under the archive directory. If this session is wrapping up and no journal entry has been recorded yet, run the `/workloom-finish` command to record it.
[/workflow-state:completed]

[workflow-norms]
Questioning (always-on):

1. Ask in the user's language; you judge which language that is from how the user writes.
2. Keep the options out of the question text: the question states only what is being asked, and the options follow as a separate numbered list.
3. Never use an interactive question tool (ask_user_question and equivalents); pose questions as plain text output on any runtime.
4. Never ask one question at a time: once per stage, list every open question identified so far as one numbered batch, and let the user answer them freely, in any order and any subset.

Dispatch (always-on):

- Dispatch is background by default: `workloom_execute` returns the child session id and the receipt immediately and does not block the main session; pass `foreground: true` only when the main session must wait on the result. The completion report arrives with the subagent notice; do not block or poll for it, and use `continue_executor` only to append new work, never to collect a report.
- Dispatch and continuation prompts must not restate the context the subagent already holds (spec, research, prd/design/implement, and the session history); send only the new work for this round, and use `reinject` only when compaction lost context.
- Hard constraint (stage `implement`): while the task stage is `implement`, the main session must not write implementation code directly — including test-first test seeds — and every implementation file change comes from the dispatched implement subagent.
- Exception (stage `check`): while the task stage is `check`, the main session may fix issues directly — including implementation code — without a fix dispatch; re-dispatch the check executor for a full re-review afterwards.

Task decomposition (always-on):

- When a task contains 3+ independently deliverable pieces, recommend splitting it; never create subtask tasks before the user confirms the candidate list and the split itself. A container task stays in planning; subtasks run their own full lifecycle; the container does the final acceptance and archives last.

Grilling (always-on):

- After every user answer, recompute the design-tree frontier; new branches mean another round. Never declare "frontier empty" just because the user answered the current batch — claim convergence only when no open question remains.
- In the planning phase, run grilling after brainstorm; do not finalize prd.md before grilling converges.

LSP (always-on):

- When LSP tooling is available, treat it as the first choice for code work: read structure through LSP symbol outlines and call signatures; resolve members and arguments with completions; rename symbols through server-side rename and fix them with code actions instead of hand-searched edits; and include an LSP diagnostics check in the verification pass.
[/workflow-norms]
