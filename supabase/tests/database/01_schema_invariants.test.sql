begin;
-- pgTAP is test-only: created inside this rolled-back transaction, never by migrations.
create extension if not exists pgtap with schema extensions;
select plan(5);
-- ---------------------------------------------------------------------------
-- Inline test helpers. Each test file runs in its own transaction that is
-- rolled back, so helpers are (re)created per file and never persist.
-- ---------------------------------------------------------------------------
create schema if not exists tests;
grant usage on schema tests to anon, authenticated;

create or replace function tests.create_user(p_phone text, p_email text default null)
returns uuid language plpgsql as $fn$
declare v_id uuid := gen_random_uuid();
begin
  insert into auth.users (
    instance_id, id, aud, role, phone, phone_confirmed_at, email, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
    p_phone, now(), p_email, case when p_email is not null then now() end,
    '{"provider":"phone","providers":["phone"]}', '{}', now(), now()
  );
  return v_id;
end $fn$;

create or replace function tests.make_admin(p_user uuid)
returns void language sql as $fn$
  insert into public.user_roles (user_id, role) values (p_user, 'admin') on conflict do nothing;
$fn$;

-- Switch to the `authenticated` role with the given user as JWT subject.
create or replace function tests.authenticate_as(p_user uuid)
returns void language plpgsql as $fn$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $fn$;

create or replace function tests.as_anon()
returns void language plpgsql as $fn$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('role', 'anon', true);
end $fn$;

grant execute on all functions in schema tests to anon, authenticated;
-- ---------------------------------------------------------------------------

select is(
  (select coalesce(array_agg(c.relname::text order by c.relname), '{}')
     from pg_class c
    where c.relnamespace = 'public'::regnamespace
      and c.relkind in ('r', 'p')
      and not c.relrowsecurity),
  '{}'::text[],
  'RLS is enabled on every table in public'
);

select is(
  (select coalesce(array_agg(c.relname::text order by c.relname), '{}')
     from pg_class c
    where c.relnamespace = 'public'::regnamespace
      and c.relkind in ('r', 'p')
      and not exists (select 1 from pg_policy p where p.polrelid = c.oid)),
  '{}'::text[],
  'Every table in public has at least one explicit policy'
);

select is(
  (select coalesce(array_agg(distinct table_name || ':' || privilege_type order by table_name || ':' || privilege_type), '{}')
     from information_schema.role_table_grants
    where grantee = 'anon' and table_schema = 'public'),
  array['skills:SELECT']::text[],
  'anon only has SELECT on skills'
);

select is(
  (select coalesce(array_agg(p.proname::text order by p.proname), '{}')
     from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.prosecdef
      and not coalesce(p.proconfig @> array['search_path=""'], false)),
  '{}'::text[],
  'Every security definer function in public pins search_path to empty'
);

select is(
  (select coalesce(array_agg(p.proname::text order by p.proname), '{}')
     from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and has_function_privilege('anon', p.oid, 'execute')),
  '{}'::text[],
  'anon cannot execute any function in public'
);

select * from finish();
rollback;
