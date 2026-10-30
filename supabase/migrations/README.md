# KaamSetu database migrations

Conventions for **all** migrations (Phase 1 onwards).

## Files

- Timestamped, one concern per file: `YYYYMMDDHHMMSS_<concern>.sql`
  (e.g. `20261030000100_extensions.sql`, `..000200_base.sql`, `..000400_identity_tables.sql`).
- Order inside a domain: enums -> tables (+ grants, `enable row level security`) -> helpers ->
  policies -> RPCs -> storage.
- Never edit an applied migration; add a new one.

## Tables

- `id uuid primary key default gen_random_uuid()` (profiles use `auth.users.id`).
- `created_at timestamptz not null default now()`; mutable tables also get
  `updated_at timestamptz not null default now()` + a `before update` trigger calling
  `public.set_updated_at()`.
- Statuses are Postgres enums. Money is `bigint` **paise** only (suffix `_paise`); never numeric/float.
- Add `check` constraints for lengths/ranges and indexes for every FK / hot filter.

## Privileges and RLS (default deny)

- `base` migration revokes Supabase's default grants to `anon`/`authenticated` in `public`
  and PUBLIC execute on new functions. Every table/view/function must be granted explicitly.
- Every table: `alter table ... enable row level security` in the same migration that creates it,
  `revoke all ... from anon, authenticated`, then minimal grants. Use **column-level grants**
  (`grant update (col, ...)`, `grant select (col, ...)`) to protect privileged/sensitive columns.
- Explicit policies per command and role (`to authenticated` / `to anon`). Use
  `(select auth.uid())` in policies (evaluated once per statement).
- `anon` gets nothing unless it is public reference data (currently only `skills`).
- `service_role` keeps defaults (edge functions, e.g. KYC submission).

## Functions

- Helpers (`is_admin()`, `has_role()`, `my_roles()`, `get_profile_private()`):
  `security definer`, `set search_path = ''`, fully-qualified names, `stable`,
  `revoke ... from public, anon`, `grant execute ... to authenticated`.
- State changes go through `security definer` RPCs named `rpc_*` that check `auth.uid()`,
  authorisation and inputs and raise:
  `raise exception using errcode = '42501', message = '...'` (not allowed) or
  `errcode = 'P0001'` (invalid input/state). Admin RPCs are `rpc_admin_*` and call `public.is_admin()`.
- Every RPC that changes state writes `public.write_audit(action, entity_type, entity_id, data)`.
  `write_audit` is not executable by API roles, so clients cannot forge audit rows.
- Trigger functions: `revoke execute ... from public, anon, authenticated`.

## Profiles: public vs private columns

`profiles` has an RLS policy allowing any authenticated user to read any row; `phone`, `email`
and `is_flagged` are **not** in the `select` column grant, so selecting them raises 42501.

- Clients read other users via `public_profiles` (a `security_invoker` view of the public columns;
  `select *` is safe there) or `profiles` with an explicit column list. `select *` on `profiles` fails.
- Owners/admins read private columns via `public.get_profile_private(user_id default auth.uid())`.
- Only `full_name, avatar_path, headline, bio, city, languages, hourly_rate_paise, availability`
  are client-updatable. Phone/email (+ verified flags) come from the `auth.users` trigger
  `handle_auth_user_change`; `kyc_verified`/`is_flagged`/etc. only via admin RPCs.

## Storage

Object paths are `<auth.uid()>/<file>`; policies compare `(storage.foldername(name))[1]`.
Public buckets have no anon/public SELECT policy (public URLs bypass RLS; a SELECT policy
would allow listing). Columns referencing objects must match `^<owner_id>/[A-Za-z0-9][A-Za-z0-9._-]{0,127}$`
and not contain `..`.
Buckets set `file_size_limit` and `allowed_mime_types`.

## Tests

pgTAP files in `supabase/tests/database/NN_<area>.test.sql`, run with `npx supabase test db`.
Each file is `begin; create extension if not exists pgtap with schema extensions; select plan(n);
<helpers>; ...; select * from finish(); rollback;`. pgTAP is never created by a migration
(it must not ship to production); the CLI also installs/removes it around `test db`.
Helpers (`tests.create_user`, `tests.make_admin`, `tests.authenticate_as`, `tests.as_anon`) are
created inline at the top of each file inside the transaction, so nothing test-only ships in
migrations. Auth is simulated via `set_config('role', 'authenticated', true)` and
`set_config('request.jwt.claims', '{"sub":..., "role":"authenticated"}', true)`.
`01_schema_invariants` enforces: RLS on every public table, a policy on every table, anon grants
limited to `skills`, empty `search_path` on all security definer functions, no anon-executable functions.

After schema changes: `npx supabase db reset && npx supabase test db`, then
`npx supabase gen types typescript --local --schema public > types/database.ts && npx prettier --write types/database.ts`.
