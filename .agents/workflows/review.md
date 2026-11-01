---
description: Security- and correctness-focused review of the current phase's changes before finishing it.
---

# /review

Review `git diff main...HEAD`, or the uncommitted changes plus the last commit. This is read-only: don't fix anything while reviewing.

Check, in priority order:

1. **Security.**
   - RLS holes: can user B read or write user A's rows?
   - Privilege escalation through RPCs, views, column grants, or a `security definer` function without `search_path = ''`.
   - Storage path traversal.
   - `anon` access.
   - Secrets or PII in logs, or in the app bundle.
2. **Money.**
   - Is any amount decided on the client?
   - Floats.
   - Non-idempotent webhook or ledger paths.
   - Unbalanced ledger transactions.
   - Missing amount checks.
3. **State.**
   - Can the milestone or project state skip an edge?
   - Can a direct UPDATE bypass `_transition_milestone`?
   - Race conditions: double submit, concurrent RPCs (use `for update` row locks).
4. **App correctness.**
   - Stuck or looping navigation guards.
   - Stale caches after mutations.
   - Missing loading, error or empty states.
   - Wrong RPC argument names.
5. **Production readiness and CI.**
   - Would CI pass on a clean runner?
   - Missing indexes.
   - Unbounded queries.
6. **Code quality.** `any`, dead code, duplication, conventions drift.

Prove every finding with a concrete scenario: in SQL, run it as a test user inside a rolled-back transaction; in TS, write a failing test. Drop anything you can't substantiate.

List the findings most severe first, each with severity, `file:line`, the scenario and the fix. Then fix the confirmed ones and add a regression test for each.
