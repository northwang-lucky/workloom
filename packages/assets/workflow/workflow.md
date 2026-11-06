---
version: 25
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
4. Commit authority stays in the main session: subagents implement and check; the main session fixes check-stage findings per 2.3; git commits happen only in the main session's Phase 2.4 and Phase 3.
5. Model recommends, user confirms subtasks: the model only recommends splitting a task and never creates subtask tasks before the user confirms the candidate list and the split itself. A container task stays in planning; its subtasks run their own full lifecycle; the container does the final acceptance and archives last. Subtask checks follow the same check discipline as main-task checks — they fix P2 findings themselves and escalate P0/P1 in their reports; "the container does the final acceptance" refers only to the timing and responsibility of the overall acceptance, not to a read-only role for the check executor, and "fixing is decided by the container" does not hold. This does not conflict with "one active task" — at any moment at most one task (the container or one of its subtasks) is the active task.

## Phase 1 Plan

#### 1.0 Create task

When the user expresses work worth doing, recommend whether it warrants a task; create the task (`workloom_task_create`) only after the user confirms. The task enters `planning`.
Before recommending a task, apply the negative standard. Do not create a task when the change is already fully settled in the conversation, touches only a few files, is low risk, changes no external interface, and the user frames it as incidental ("by the way", "while you are there") — fix it directly instead. Recommend a light task instead of a full one when the change is still small but deserves an audit trail or cross-session continuity: create it with `mode: "light"`; the main session implements and self-checks it, no executor is dispatched, and the start/check gates are relaxed. Everything else is a full task.
When recommending, roughly count the independently deliverable pieces: if there are 3 or more pieces that can be delivered and accepted independently, pre-announce in the recommendation that the task should be split into N subtasks, and never create them before the user confirms the split.
Completion criteria: the task directory exists and `task.json` `status` is `planning`.

#### 1.1 Align requirements

Every task enters Phase 1.1 alignment automatically at creation — there is no "do you need grilling?" question and no brainstorm/UI/grilling substages. Load the `workloom-alignment` skill (the only alignment skill this step loads) and drive one continuous design tree to convergence; generic `tdd` and `grilling` skills stay available for non-workloom use but are not part of the Phase 1.1 flow.

The design tree uses a fixed root family that you walk in order and branch dynamically underneath: Goal and value → Scope and non-goals → Environment constraints → Observable acceptance → UI and test-first applicability → Key decisions → Edge cases, failure paths and alternatives → Convergence confirmation.

Each round covers the full current frontier: every open node is asked once per round as one numbered batch (questioning rules below), and highly related questions are merged when answering one answers the other. Every decision node comes with a recommendation and its reasoning; the user picks per option and you record the outcome. Fact nodes are investigated by you in Phase 1.1 (file/web/LSP retrieval) only when a decision is blocked on them; deep implementation research stays in Phase 1.2. Only technical decisions that affect scope, acceptance, risk, external interfaces, or irreversible cost enter the alignment; purely internal choices are implementation details for the implement executor.

Frontend UI presentation nodes consult the UI axes reference bundled with `workloom-alignment` (references/ui-design) and record decidable UI requirements in a `## UI Design` section of prd.md. Implementation tasks that need test-first delivery consult the test-first seam reference (references/test-first) and put the confirmed seams into prd.md acceptance criteria. Both references load only when their node applies.

Write settled conclusions into prd.md incrementally as you go. Number Requirements as R1, R2, ... — each a single decidable statement, a vague verb always bound to an object and a decidable outcome — and number Acceptance Criteria as AC1, AC2, ... — each carrying its verification method (a runnable command, or an observable action plus expected result) and the R items it covers, so plan steps and later review/check can trace coverage by number. Keep a `## Alignment Decisions` section that records key choices, rejected alternatives, open nodes, and a convergence summary, ending with the machine-checkable marker `<!-- workloom:open-nodes=pending|none -->`. Convergence means the marker reads `none`.

Convergence order is fixed: 1) the frontier is empty (no open node remains), 2) finalize prd.md, 3) run `workloom_task_align` with action=review and require `readyToConfirm` true — while it is false the review's `structureIssues` / `confirmBlockers` (missing prd.md, missing H1, a missing skeleton section such as `## Notes`, a section still on its placeholder, or a missing/non-`none` open-nodes marker) are content blockers you must fix in prd.md before re-running action=review; do not show the snapshot to the user while content blockers remain. Once the review is ready, present the prd.md content to the user and ask them to confirm it; after the user confirms the content, run `workloom_task_align` with `target=prd`, `action=confirm`, and a non-empty `summary` — the tool records the confirmation time and the summary, and no document hash exists anywhere in the flow. The PRD content confirmation happens here, before research, context configuration, and plan authoring. A later prd.md change never invalidates the record automatically: when the user proposes the change themselves, that message is the change confirmation — update the affected documents, re-run action=confirm to refresh the record, and continue without asking again; when you discover a blocker, a scope change, or an acceptance-baseline change yourself, batch the questions to the user per the questioning rules before touching the documents.

Every question across the workflow — design-tree questions and exploratory questions alike — follows these rules:

1. Ask in the user's language; you judge which language that is from how the user writes.
2. Keep the options out of the question text: the question states only what is being asked, and the options follow as a separate numbered list.
3. Never use an interactive question tool (ask_user_question and equivalents); pose questions as plain text output on any runtime.
4. Never ask one question at a time: once per stage, list every open question identified so far as one numbered batch, and let the user answer them freely, in any order and any subset.

Completion criteria (hard gate): the aligned requirements have no grey areas — every requirement is decidable, unambiguously worded, the frontier holds no open assumptions — and the PRD content confirmation is recorded via `workloom_task_align` (`target=prd`, `action=confirm`) right after its review returns `readyToConfirm` true for the finalized prd.md.

#### 1.2 Research (optional)

When code or technical investigation is needed, dispatch the research executor with `workloom_execute`; it writes one file per topic under the task's `research/`, and reports back only file paths plus a one-line summary each.
Completion criteria: findings are persisted and either referenced by 1.3's context lists or explicitly not referenced.

#### 1.3 Configure context

Fill implement.jsonl and check.jsonl with real entries (`{"file": "<path>", "reason": "<why>"}`): spec and research only, never code paths. Referenced spec files must live under `.workloom/spec/` in its two-level layout (`<package>/<layer>/`). Keep each list minimal: include only the entries the current stage actually needs — when in doubt, fewer entries beat more.
Completion criteria: each jsonl has at least one real entry (the seeded `_example` line does not count).

#### 1.4 Review and start

This step holds the PLAN content confirmation, the second and last fixed content confirmation before implementation. The prd.md content was already confirmed at 1.1 — do not re-confirm it here and never show any hash. Present the finalized plan.md content (with the jsonl context lists) in one message for the user to confirm.

Authoring bar for plan.md (applies whenever the plan is authored or revised): every step names its target file path and symbol; every edit carries the exact before/after code, with the before snippet locating uniquely in the file and line numbers only as aids; every new file carries its full content; every step ends with its verification command and expected result; a directive without an anchor ("optimize", "adjust accordingly") is a defect. The full standard and the plan.md document shape live in the workloom-alignment skill's references/plan-authoring.md — read it before authoring.

Plan review dispatch (default on): once plan.md is authored or revised, dispatch the review executor with `workloom_execute` (kind: review) before presenting the plan — it audits the plan against prd.md and the real code and writes its findings to plan-review.md in the task directory. The final alignment round may explicitly skip the review for a task; record the skip in prd.md. Dispose of every finding before the presentation: P0 must be resolved (fix the plan, or take prd-level findings to the user), P1 fixed or recorded with a reason, P2 all fixed. After revising the plan, re-run the review by continuing the same review child session (`continue_executor`), looping until no P0/P1 finding remains or three rounds are reached; leftover findings then enter the presentation with their disposal notes for the user to decide. The review report and the disposal of every finding are part of the presentation.

Run the scale self-check while preparing the presentation: judge precisely by the actual number of phases in prd.md/plan.md. When the work is large, the presentation carries a candidate subtask list instead — for each candidate, its title, its scope, and the reason it is a separate deliverable — and the user's confirmation either starts the task or confirms the split (create the subtasks one by one with `workloom_task_create`, each with `parent` set to the main task; every subtask runs the full lifecycle; the main task starts, checks, and archives only after every declared subtask is archived).

On the user's confirmation of the plan content: run `workloom_task_align` with `target=plan`, `action=confirm`, and a non-empty `summary` (records the PLAN confirmation time and the summary), then `workloom_task_start` — the task enters `in_progress`. The start tool is gated: it refuses while prd.md has no H1 title, any prd.md section is still the skeleton placeholder, plan.md is missing or structurally incomplete, the PRD or the PLAN content confirmation is missing, or implement.jsonl/check.jsonl hold no real entries; tasks with no spec to reference may pass `force: true` with a non-empty `reason`, and the bypass is recorded in task.json `overrides` for audit.
Completion criteria: `task.json` `status` is `in_progress`; and the user has confirmed the PLAN content here after having confirmed the PRD content at 1.1.

## Phase 2 Execute

#### 2.1 Implement

Dispatch the implement executor with `workloom_execute` (model and effort per task configuration); the dispatcher injects context (spec, research, prd/plan). Always pass a semantic `title` with the dispatch (required by the schema) so repeated dispatches of the same task remain distinguishable in subagent sessions. Dispatch is background by default: `workloom_execute` returns the child session id and the receipt immediately and does not block the main session. The completion report arrives asynchronously in the main session. Use `continue_executor` only to append new work — never to collect a report. The subagent writes code, runs lint and typecheck, and must not git commit. Test-first tasks follow the tdd skill's red-green loop. Hard constraint (stage `implement`): while the task stage is `implement`, the main session must not write implementation code directly — including test-first test seeds — and every implementation file change comes from the dispatched implement subagent. When the active task has a worktree, implementation file work and code commands happen inside that worktree. The frontend dispatch rule and completion criteria remain unchanged; the frontend gate is defined in 2.3.

For a task whose alignment concluded frontend UI presentation applies (prd.md records a `## UI Design` section), its frontend file implementation must go through a `workloom_execute` dispatch with `kind: frontend`; the logic and backend parts still go through the implement executor. The check tool refuses such a task unless a frontend dispatch has been recorded (see 2.3), so route UI work through a dedicated frontend dispatch instead of folding it into the implement dispatch.
Completion criteria: changes are done, lint and typecheck pass, and the fixed-format report (file list + verification results) is returned. When LSP tooling is available, treat it as the first choice for code work: read structure through LSP symbol outlines and call signatures; resolve members and arguments with completions; rename symbols through server-side rename and fix them with code actions instead of hand-searched edits; and include an LSP diagnostics check in the verification pass.

Executor reports may end with blocking items: open questions the executor could not resolve alone. The main session batches every blocking item to the user for decisions in one round, records the decisions, and only then re-dispatches; never route the executor to the user directly.

#### 2.2 Design CASE

At the start of implementation, dispatch `kind: check` with `purpose: case-design` alongside the implement/frontend dispatches. The check executor reads prd.md, plan.md, the check.jsonl materials, and the two CASE template assets, then writes `case.md` using the canonical structure. Cover every AC with at least one SR or C item and every changed code file with an SR item; define real runtime steps, evidence, cleanup, and coverage collection. A container task without its own plan lists its children's PLAN paths in task.children order.

The main session reviews the CASE against prd/plan and the real code. For any problem, continue the recorded `case.designSession` with `purpose: case-design` and a concrete revision instruction. Run `workloom_task_case` action=review to get the machine-readable structure diagnostics; once the main session's actual review is satisfied, it continues the same `case.designSession` for execution directly — the user is never asked to confirm the CASE, and no review confirmation, summary, or fingerprint is recorded anywhere. Any later CASE change is re-reviewed by the main session the same way before execution continues.

Completion criteria: `workloom_task_case` action=review returns `readyForExecution: true`, `task.json` records `case.designSession`, and the main session has completed the actual review against prd/plan and the real code. CASE design dispatches keep the current stage.

#### 2.3 Check

After implementation is complete and the main session's CASE review is satisfied, continue `case.designSession` with `kind: check` and `purpose: execution`. The executor first completes every SR item, then runs C1 through Cn in order and records actual actions, observations, and evidence in `case-result.md`. It collects overall line coverage, changed-file line coverage, and uncovered lines under `coverage/`; large evidence goes under `case-evidence/`. A blocked C item stops all later C items and prevents a pass. Any code fix requires a full rerun of static review, every C item, and coverage.

Dispatch the check executor with `workloom_execute`: it reviews changes against the spec files referenced in check.jsonl and the task artifacts (prd/plan), checking structure, naming, types, and potential bugs item by item, and classifies every finding by severity before acting (the definitions below are the single source; the injected discipline summarizes them):

- P0 (blocking): acceptance criteria unmet; hard lint / typecheck / build / tests failures; security or data-integrity risks.
- P1 (important): behavioral or correctness defects; design or spec deviations (including cross-file semantic changes); issues that pre-date the current task, even mechanical ones.
- P2 (minor): mechanical issues (typos, naming, comments, formatting, weakened test assertions); small local defects confined to a single file; compliance fixes with no trade-offs.

Dispatch is background by default: `workloom_execute` returns the child session id and the receipt immediately and does not block the main session; the main session continues other work; the completion report arrives asynchronously in the main session. Use `continue_executor` only to append new work (for example a re-review) — never to collect a report.

The check executor fixes P2 findings itself — leaving one unfixed is a dereliction of duty — then runs lint and typecheck after fixing. It does not fix P0/P1 findings: its report ends with a structured `## Open issues` section listing every remaining issue as `- <file>:<line> [P0|P1|P2] <issue> — fix: <suggestion>`, or `- none` when nothing remains. The final check of a task must cover the full scope.

The main session's dispatch prompt must carry the same fix-and-escalate semantics — "fix small findings (P2) yourself, escalate big ones (P0/P1)" — and must not write constraints like "read-only review", "report only", or "do not change code": as user-level instructions they override the injected discipline. It must not steer the severity classification either; classification is the check executor's standard duty. If a dispatch prompt conflicts with the executor discipline anyway, the executor follows the discipline and states the conflict in the first line of its report.

While the task stage is `check`, the main session may fix issues directly, no fix dispatch needed; after fixing, re-dispatch the check executor for a full re-review. Before recording the pass with `workloom_task_check`, handle every remaining issue — fix it or record why not — and state the outcome in the summary. For a P0 finding the "record why not" path does not apply: the main session may only fix it or propose adjusting the acceptance baseline to the user, and only after the user confirms may it amend prd.md and re-dispatch the check executor against the new baseline. The tool writes `check.passedAt` + `check.summary` into task.json (it requires at least one real check.jsonl entry; `force: true` with a non-empty `reason` bypasses the gate and is recorded). Any change after the pass is recorded requires a fresh check re-dispatch. For a task with a `## UI Design` section, it additionally refuses unless a `frontend` dispatch has been recorded.

Core CASE failures — a missing CASE document, a missing design session, an invalid RESULT, failed or pending items, failed standard verification, failed coverage, and an invalid session chain — cannot be bypassed with force. Run `workloom_task_check` only after RESULT has `status: passed`, every SR/C item is passed, standard verification is green, coverage is generated or validly not_applicable, and Open issues is `- none`.
Completion criteria: no unresolved findings against spec, lint and typecheck all green, and `workloom_task_check` has recorded the pass. When LSP tooling is available, treat it as the first choice for code work: read structure through LSP symbol outlines and call signatures; resolve members and arguments with completions; rename symbols through server-side rename and fix them with code actions instead of hand-searched edits; and include an LSP diagnostics check in the verification pass.

#### 2.4 Commit

The main session commits in batches: one commit per logical change, message format `<type>(<scope>): <description>`. When the active task has a worktree, code commits are made on the task branch inside the worktree (`git -C <worktree>` or a worktree workdir); journal and task-metadata bookkeeping commits stay in the main repository, and the two kinds are never mixed in one commit.
Completion criteria: `git status` shows no dirty files belonging to this task.

## Phase 3 Wrap up

#### 3.1 Archive and record

Load the `workloom-finish` skill: check dirty files → archive the task (`workloom_task_archive`) → record the session (journal). Archiving and recording each produce their own auto-commit; both `workloom_task_archive` and `workloom_journal` require an explicit `taskPath`. The archive tool is gated: it refuses when task.json has no `check` field (no new/legacy distinction), so either record a passed check via `workloom_task_check` first, or pass `force: true` with a non-empty `reason` for a recorded bypass. Before archiving the main task, confirm that every declared subtask is archived; if any is missing, state the reason and leave a trace (for example a note in the task record) so the gap is auditable.
Completion criteria: the task is under `archive/` with `status` `completed`, and the journal has recorded this session. Do not consider the phase done with tool calls alone: session wrap-up requires loading the `workloom-finish` skill (it produces the journal record and the bookkeeping commit; the archive tool alone leaves no journal).

[workflow-state:no_task]
No active task right now. When the user expresses a need, answer direct questions outright without a task; for work touching files or documents, apply the negative standard in 1.0 (fix a settled, low-risk change directly instead of creating a task) and recommend a light task when the change is small but deserves an audit trail or cross-session continuity; create any task only after the user confirms, then proceed by the planning guidance.
[/workflow-state:no_task]

[workflow-state:planning]
The task is in planning. Phase 1.1 alignment runs automatically: load the workloom-alignment skill and drive the design tree (full-frontier rounds, recommended answers per decision node, fact checks on demand) to convergence; write conclusions into prd.md as you go (Requirements numbered R1, R2, ...; Acceptance Criteria numbered AC1, AC2, ... each with its verification method); do not finalize prd.md before alignment converges. Convergence ends at `workloom_task_align` action=review returning `readyToConfirm` true (fix every `confirmBlockers` entry and re-run review while it is false, without showing the snapshot) — then present the prd.md content, confirm it with the user, and record it with action=confirm (`target=prd`). Then follow Phase 1: optional research → configure context → author plan.md (required for every full implementation task; only a parent task with declared children is exempt), meeting the prescriptive authoring bar in 1.4 (every step anchored to a concrete file, symbol, and exact code change; read the alignment skill's plan-authoring reference first) and running the 1.4 plan review. At 1.4 present the plan.md content (with the jsonl lists and, when the scale self-check trips, a split candidate list); the user's confirmation then runs action=confirm (`target=plan`) and start back to back. Do not write implementation code before the plan review; do not write documents before alignment reaches the no-grey-areas bar.
[/workflow-state:planning]

[workflow-state:in_progress]
The task is in progress. Follow Phase 2: implement → design CASE → check → commit. Subagent artifacts are persisted; the main session controls commits; do not declare completion before 2.3 has passed, and once 2.3 passes record it with `workloom_task_check` — archiving refuses without it. While the task stage is `implement`, route implementation through `workloom_execute`, and dispatch `kind: check` with `purpose: case-design` alongside for CASE design. While the task stage is `check`, the main session may fix issues directly — including implementation code; after fixing, re-dispatch the check executor for a full re-review before recording the pass. When LSP tooling is available, treat it as the first choice for code work: read structure through LSP symbol outlines and call signatures; resolve members and arguments with completions; rename symbols through server-side rename and fix them with code actions instead of hand-searched edits; and include an LSP diagnostics check in the verification pass.
[/workflow-state:in_progress]

[workflow-state:completed]
The task is archived. When the user asks for more, recommend whether a new task is warranted and create it only after the user confirms (follow 1.0); do not modify tasks under the archive directory. If this session is wrapping up and no journal entry has been recorded yet, load the `workloom-finish` skill to record it.
[/workflow-state:completed]

[workflow-norms]
Questioning (always-on):

1. Ask in the user's language; you judge which language that is from how the user writes.
2. Keep the options out of the question text: the question states only what is being asked, and the options follow as a separate numbered list.
3. Never use an interactive question tool (ask_user_question and equivalents); pose questions as plain text output on any runtime.
4. Never ask one question at a time: once per stage, list every open question identified so far as one numbered batch, and let the user answer them freely, in any order and any subset.

Dispatch (always-on):

- Dispatch is background by default: `workloom_execute` returns the child session id and the receipt immediately and does not block the main session. The completion report arrives asynchronously in the main session; do not block or poll for it, and use `continue_executor` only to append new work, never to collect a report.
- Dispatch and continuation prompts must not restate the context the subagent already holds (spec, research, prd/plan, and the session history); send only the new work for this round, and use `reinject` only when compaction lost context.
- Hard constraint (stage `implement`): while the task stage is `implement`, the main session must not write implementation code directly — including test-first test seeds — and every implementation file change comes from the dispatched implement subagent.
- Exception (stage `check`): while the task stage is `check`, the main session may fix issues directly — including implementation code — without a fix dispatch; re-dispatch the check executor for a full re-review afterwards.
- Light-task exemption: light tasks (`mode: "light"`) are executed entirely by the main session — implementation, self-check, and commit — so the implement-stage dispatch constraint above does not apply, and `workloom_execute` rejects dispatching an executor for a light task unless forced with a recorded reason.
- CASE purpose: a check dispatch carries `purpose: case-design` (design round — it keeps the current stage and records `case.designSession` in task.json) or `purpose: execution` (it continues the reviewed design session for actual execution and enters the check stage; execution is the default for backward compatibility). Continue the same `case.designSession` child for CASE revisions and for the final execution round.
- CASE readiness gates execution: `workloom_execute` with `purpose: execution` is refused while case.md is missing or `case.designSession` is not recorded. The main session reviews the CASE itself — no user CASE confirmation exists — and continues the same design session once satisfied. The first dispatch, every failover re-injection, and every reinject carry the current CASE and both CASE template assets in full; an ordinary continuation appends only the new instruction.
- Core CASE failures (a missing CASE document, a missing design session, invalid RESULT, failed or pending SR/C items, failed standard verification, failed coverage, invalid session chain) cannot be bypassed with `force` at check or archive.
- Loading protocol: Load in layers: read the plan artifact (plan.md) before acting; consult every other pointer only when the current step needs it, in targeted ranges; never bulk-read the whole list upfront. Echo the injection marker token in the first line of your report as proof the protocol was read.

Task decomposition (always-on):

- When a task contains 3+ independently deliverable pieces, recommend splitting it; never create subtask tasks before the user confirms the candidate list and the split itself. A container task stays in planning; subtasks run their own full lifecycle; the container does the final acceptance and archives last.

Alignment (always-on):

- Every task auto-enters Phase 1.1 alignment with the `workloom-alignment` skill only — never brainstorm/grilling/UI substages, and never the fixed grilling question.
- After every user answer, recompute the design-tree frontier; new branches mean another round. Never declare convergence just because the user answered the current batch — claim it only when no open node remains and the `<!-- workloom:open-nodes=none -->` marker is in place.
- In the planning phase, do not finalize prd.md before alignment converges. There are exactly two content confirmations: the PRD content is confirmed at 1.1 with `workloom_task_align` (`target=prd`, `action=confirm`) once its review is ready, and the PLAN content is confirmed at 1.4 (`target=plan`, `action=confirm`) after the plan review; start requires both confirmations to be recorded, and no other fixed document confirmation exists.
- Treat a review with `readyToConfirm` false as a hard stop for user confirmation: fix every `structureIssues` / `confirmBlockers` entry in prd.md first (missing section, unfilled placeholder section, missing H1, missing or non-`none` open-nodes marker), then re-run `workloom_task_align` action=review; only a review with `readyToConfirm` true may be shown to the user for the explicit confirmation.
- When the user proposes a concrete change themselves, that message is the change confirmation: update the affected prd.md or plan.md, re-run `workloom_task_align` action=confirm for the touched document to refresh the record, and continue — never ask the user to confirm the same change a second time. Blockers, scope changes, or acceptance-baseline changes that you discover yourself still go to the user as one batched round.

LSP (always-on):

- When LSP tooling is available, treat it as the first choice for code work: read structure through LSP symbol outlines and call signatures; resolve members and arguments with completions; rename symbols through server-side rename and fix them with code actions instead of hand-searched edits; and include an LSP diagnostics check in the verification pass.
[/workflow-norms]
