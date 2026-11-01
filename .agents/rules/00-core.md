---
trigger: always_on
description: Non-negotiable rules for every task in the KaamSetu repo.
---

# KaamSetu — core rules (always on)

Read `AGENTS.md` for the map. Read `docs/STATUS.md` before starting work, and `docs/DECISIONS.md` before changing behaviour. `docs/DECISIONS.md` overrides `docs/BRIEF.md`.

## Never

- Decide on the client that money moved. Payment success, funding, release, refunds and state transitions happen **only** in SQL or edge functions.
- Store money in floats. Money is `bigint` paise in SQL and an integer `number` in TS. Format it only with `formatINR`, the `Money` component or `MoneyCountUp`.
- Write to tables directly from the app. Every write goes through a `security definer` RPC (`rpc_*`) or an edge function.
- Add a table without RLS, explicit grants and pgTAP tests that prove cross-user isolation.
- Use `select('*')` on `profiles`. Phone and email are column-protected (D14).
- Log secrets, KYC data, phone numbers or full payment payloads.
- Put server secrets in `EXPO_PUBLIC_*` variables or anywhere in the app bundle.
- Use `any`, `@ts-ignore` or `eslint-disable` to get past an error. Fix the type instead.
- Edit a migration that has already shipped. Add a new migration. Phase 1 and 2 migrations count as shipped once committed.
- Run `supabase config push`, or push to a hosted project, without the user asking (D19).
- Commit or push unless the user asks.
- Guess at a product decision. If the brief is ambiguous or the YouPI-PG docs contradict it, **stop and ask the user**, then record the answer in `docs/DECISIONS.md`.

## Always

- Work phase by phase, following `docs/ROADMAP.md`. Stop at the end of each phase for the user's review.
- Write or update the contract in `docs/api/<area>.md` before writing SQL or screens.
- Regenerate types after every schema change: `npm run db:types`.
- Run `/verify` before saying anything is done. Report failures honestly, with output.
- Give every screen loading, empty and error states, plus accessibility labels and 44pt touch targets.
- Use the semantic colour classes (`bg-background`, `text-foreground`, `bg-primary`…) so dark mode works.
- Keep `docs/STATUS.md` current at the end of each phase.
