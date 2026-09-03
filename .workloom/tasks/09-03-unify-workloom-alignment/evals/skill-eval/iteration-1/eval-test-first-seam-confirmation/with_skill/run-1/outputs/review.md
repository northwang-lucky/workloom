# Test-first applicability — Phase 1.1, root node 5

We're walking the design tree in fixed order: goal/value, scope/non-goals, environment constraints, and observable acceptance are settled. This is a backend payments retry service, so the UI node does not apply; the remaining applicability node is test-first. Per the test-first reference, every task with implementation work must settle this before prd.md is finalized.

One round, one numbered batch — two merged questions, since answering 1 determines whether 2 applies:

1. Does implementation require test-first delivery?
   - A. yes — seams join the alignment scope. **(Recommended)** This is money-moving behavior: idempotency, backoff timing, and retryable-vs-final classification are exactly where a silent regression costs real money. Test-first locks those behaviors before any implementation exists.
   - B. no — conventional implementation. Only acceptable if we're comfortable relying on after-the-fact manual verification for retry correctness.
   - C. critical paths only — test-first on the retry decision core, conventional elsewhere. Cheaper, but leaves scheduling and persistence seams unguarded against regression.

2. If yes (or critical-only), confirm the seams under test — no test is written at an unconfirmed seam. A seam is the public boundary where we observe behavior without reaching inside. My proposed seams for this service:
   - `RetryPolicy.decide(attemptHistory, lastError)` — pure decision: retryable vs final, plus delay computation.
   - `PaymentGatewayClient.charge(request)` — the outbound port, faked in tests.
   - `RetryScheduler.execute(jobId)` — the service entry point: orchestration of attempt, backoff, and terminal states.
   - `RetryStore` — persistence boundary for attempt records and idempotency keys.

My recommendation: confirm all four as written. If you dispute where a seam belongs (e.g. whether `RetryStore` is a seam or an internal hidden behind the scheduler), that question becomes its own design-tree node and stays open until settled — the seam's ownership is an alignment decision, not an implementation detail.

Scope note: Phase 1.1 settles only *which* seams are under test. The red → green method itself is not alignment work; the implement executor loads the generic `tdd` skill in Phase 2.1 and works exactly the seams we record here, without re-litigating scope.

Once you answer, I will, in order:

1. Record the applicability choice and the confirmed seams in `prd.md`: the seams go into `## Acceptance Criteria` (they join the no-grey-areas gate and are required by Phase 2.1's test-first loop); the choice, its reasoning, and the rejected alternatives (B and C, or whichever you decline) go into `## Alignment Decisions`.
2. Recompute the frontier. If nothing else is open, flip the marker to `<!-- workloom:open-nodes=none -->`; otherwise the open nodes stay listed and the marker stays `pending`.
3. Run `workloom_task_align` with `action=review` and show you the finalized prd snapshot together with its SHA-256 hash.
4. After your explicit confirmation of that exact snapshot, run `workloom_task_align` with `action=confirm`, passing `expectedPrdHash` from the review and a summary of the nodes covered, key decisions, and the confirmation result — closing the loop on this alignment.
