---
trigger: glob
globs: supabase/migrations/**, supabase/tests/**, supabase/seed.sql, docs/api/**
description: Postgres/Supabase conventions for migrations, RLS, RPCs and pgTAP tests.
---

# Database rules

Also read `supabase/migrations/README.md`. It holds the full conventions and wins over this summary.

## Migrations

- File name: `supabase/migrations/<YYYYMMDDHHMMSS>_<concern>.sql`. One concern per file, with a timestamp later than every existing one.
- Primary keys are `uuid` with `gen_random_uuid()`. Every table has `created_at timestamptz not null default now()` and `updated_at`, maintained by `public.set_updated_at()`.
- Statuses are Postgres enums. Money is `bigint` paise with `check (… >= 0)` or `> 0`.
- Text has length CHECKs that match the zod schemas in `shared/schemas/*`. Arrays are bounded, using `public.text_array_items_between`.
- Storage paths are `<owner_or_project_id>/<file>`, using only `[A-Za-z0-9._-]`, with no `..` (D17).
- "Today" is `(now() at time zone 'Asia/Kolkata')::date` (D11).
- Use integer maths for percentages. Example: `amount * 100 <= total * cap`.

## Access

- Default privileges are revoked (D15). Every table and function needs explicit `grant`s. `anon` gets nothing unless the table is genuinely public reference data.
- `alter table … enable row level security` plus explicit policies for every table. There are no client INSERT/UPDATE/DELETE policies on business tables, because writes go through RPCs.
- Helpers live in `public`: `is_admin()`, `has_role(app_role)`, `is_project_member(uuid)`, `write_audit(…)`.
- RPCs:
  - `security definer`, `set search_path = ''`, every name schema-qualified.
  - Check `auth.uid()` first.
  - Validate every argument.
  - Raise `errcode 'P0001'` with a stable snake_case message key (listed in the contract) for business errors, and `42501` for permission errors.
  - Call `public.write_audit(...)`.
  - Revoke from `public`, `anon`. Grant execute to `authenticated` (or `service_role` only, for webhook and ledger internals).
- Milestone status changes go only through `public._transition_milestone(...)`. A trigger enforces the edges in `milestone_transitions` and the `app.via_rpc` flag. Never bypass it.
- Ledger (Phase 4+): `ledger_entries` is append-only and double-entry. `sum(amount_paise) = 0` per `txn_id`. Balances come from views, never from mutable columns.

## Tests (pgTAP)

- `supabase/tests/database/NN_<area>.test.sql`. Each file is a single `begin; … select * from finish(); rollback;`. It creates `pgtap` and its helpers inline (D20).
- Simulate users with: `set local role authenticated; set local request.jwt.claims = '{"sub":"<uuid>","role":"authenticated"}';`
- Every new table needs tests for:
  - an owner or member **can** do X;
  - another user **cannot** read or write;
  - `anon` cannot;
  - each RPC rejection path (wrong role, wrong owner, wrong status, invalid input).
- Run: `npx supabase db reset && npx supabase test db && npx supabase db lint --schema public`, then `npm run db:types`.
