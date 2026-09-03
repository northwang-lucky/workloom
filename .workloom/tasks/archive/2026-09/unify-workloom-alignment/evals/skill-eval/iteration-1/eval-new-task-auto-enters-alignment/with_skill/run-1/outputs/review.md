Task created — the task is now in Phase 1.1 requirement alignment, so I'll drive it from here.

How I'll run it: one continuous design tree. I walk the fixed root nodes in order (Goal and value → Scope and non-goals → Environment constraints → Observable acceptance → UI/test-first applicability → Key decisions → Edge cases and alternatives → Convergence confirmation), ask each round's entire frontier as a single numbered batch, and attach a recommendation with reasoning to every decision node so you're choosing between an informed default and an explicit alternative.

Recording: as answers settle, I'll write them into the task's prd.md incrementally, maintaining a `## Alignment Decisions` section (key choices and alternatives, rejected options with reasons, open nodes, convergence summary) and keep the `<!-- workloom:open-nodes=pending -->` marker until the frontier is empty.

Convergence: once the frontier is empty and prd.md has no grey areas, I'll run `workloom_task_align` with `action=review` and show you the prd snapshot plus its SHA-256 hash; only after your explicit confirmation will I run `action=confirm` with `expectedPrdHash` and a summary. Deep implementation research is deferred to Phase 1.2; Phase 1.4 separately authorizes the start.

Here is the full current frontier — Round 1:

**Goal and value**

1. What hurts today: flaky connectivity, data usage, perceived speed, or something else? Recommendation: treat perceived speed plus offline reads as the primary value — it's the most common driver for client caching and makes "done" measurable (content visible with no network).
2. What does "done" look like in one sentence an observer could verify?

**Scope and non-goals**

3. Read-only content caching only, or also offline writes with later sync? Recommendation: read-only caching in scope, offline write queue explicitly out — write-sync conflict handling multiplies scope and risk and belongs in a follow-up task.

**Environment constraints**

4. Platform and stack: native iOS + Android, or cross-platform (RN/Flutter)? Any storage ceiling or existing local-store dependency we must reuse? Recommendation: reuse the existing persistence layer if one exists instead of adding a new dependency — fewer review surfaces and consistent eviction behavior.

**Observable acceptance**

5. Which acceptance signals matter: airplane-mode content visible, cache-hit latency target, staleness ceiling? Recommendation: define acceptance as "airplane-mode launch shows last-seen content within X ms, data no older than Y" — both are observer-checkable.

**UI / test-first applicability**

6. Does this touch user-facing UI (offline indicator, stale banner)? If yes, I'll read the UI axes reference and record a `## UI Design` section in prd.md. Recommendation: assume a minimal offline indicator is in scope; otherwise users can't tell cached from live data.
7. Must implementation be test-first? Recommendation: yes — caching has clean seams (store, policy, eviction) and regressions are silent; if you confirm, I'll read the test-first reference and confirm the concrete seams.

**Key decisions**

8. Eviction/invalidation policy: TTL, LRU size cap, or server-driven invalidation? Recommendation: TTL plus size-capped LRU — no server contract change, reversible, easy to tune later.
9. Cache layer: HTTP-layer cache or application-level model cache? Recommendation: application-level — it survives API shape changes and gives explicit staleness control.

**Edge cases and alternatives**

10. Which failure paths must be designed for: corrupted cache, schema migration across app versions, partial write on app kill? Recommendation: make "cache unreadable → silently fall back to network" the default failure contract, and record that rejected alternatives (e.g., write-through offline queue) live in the decisions section.

Answer per number, or say "take all recommendations". After each answer I'll recompute the frontier and bring the next batch — or, if nothing new opens, the review snapshot for confirmation.
