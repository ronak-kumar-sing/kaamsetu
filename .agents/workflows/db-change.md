---
description: Safely add or change database schema (new migration, RLS, RPC, tests, types).
---

# /db-change

1. Update the contract in `docs/api/<area>.md` first.
2. Create a **new** migration: `supabase/migrations/$(date -u +%Y%m%d%H%M%S)_<concern>.sql`. Never edit a migration that has already shipped.
3. For every new table:
   - RLS enabled;
   - explicit grants;
   - policies;
   - `updated_at` trigger;
   - CHECK constraints that match the zod schemas;
   - indexes on foreign keys and filter columns.
4. For every new RPC:
   - `security definer`, `search_path = ''`;
   - an `auth.uid()` check;
   - input validation;
   - error keys;
   - `write_audit`;
   - revoke from `public` and `anon`, and grant execute explicitly.
5. Add pgTAP tests (allowed, denied, `anon`, and every rejection path) in `supabase/tests/database/`.
6. Run `npx supabase db reset && npx supabase test db && npx supabase db lint --schema public`.
7. Run `npm run db:types`, then `npm run typecheck`, and fix the app code the type changes break.
