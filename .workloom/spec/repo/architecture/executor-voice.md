# executor voice

State the executor role-copy layering: core holds the per-kind discipline, adapters hold only the role persona.

- rule: `packages/core/src/legacy/executor-context.js` owns `EXECUTOR_CONTRACT_BY_KIND` — the per-kind hard directives (single source, shared by every runtime); each adapter keeps at most a role persona (descriptive identity) that is complementary, not duplicated — sentences that repeat or contradict a core directive are removed from the persona; adding or changing an executor kind updates both sides (core directives + adapter persona) and their tests together (core test asserts the directive's presence, adapter test asserts the persona's wording)
- counter-example: changing only the Pi `agent-definitions.ts` persona (or only the core directive) — the two runtimes diverge in behaviour; or restating a whole directive's meaning inside the persona, so the same instruction ships twice and drifts
