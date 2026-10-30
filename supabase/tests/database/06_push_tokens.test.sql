begin;
-- pgTAP is test-only: created inside this rolled-back transaction, never by migrations.
create extension if not exists pgtap with schema extensions;
select plan(14);
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

create temp table ids as
select tests.create_user('919811200001') as ua,
       tests.create_user('919811200002') as ub;
grant select on ids to anon, authenticated;
create temp table t (k text primary key, v uuid);
grant select, insert on t to authenticated;

select tests.authenticate_as((select ua from ids));
insert into t select 'a1', public.rpc_register_push_token('ExponentPushToken[aaa]', 'ios');
select isnt((select v from t where k = 'a1'), null, 'A registers a token');

-- Make updated_at observably older so the refresh is visible inside one transaction.
reset role;
update public.push_tokens set updated_at = now() - interval '1 day' where token = 'ExponentPushToken[aaa]';
select tests.authenticate_as((select ua from ids));

select is(public.rpc_register_push_token('ExponentPushToken[aaa]', 'android'), (select v from t where k = 'a1'),
  'A re-registering own token is idempotent (same row)');
select results_eq(
  $$ select platform, updated_at >= now() from public.push_tokens where token = 'ExponentPushToken[aaa]' $$,
  $$ values ('android'::text, true) $$,
  're-register updates platform and updated_at');

select tests.authenticate_as((select ub from ids));
select throws_ok($$ select public.rpc_register_push_token('ExponentPushToken[aaa]', 'ios') $$,
  '42501', 'push token already registered to another account', 'B cannot take A''s token');
select is(public.rpc_unregister_push_token('ExponentPushToken[aaa]'), false,
  'B cannot unregister A''s token');

reset role;
select results_eq(
  $$ select user_id from public.push_tokens where token = 'ExponentPushToken[aaa]' $$,
  $$ select ua from ids $$,
  'A''s token row is untouched after B''s attempts');

select tests.authenticate_as((select ub from ids));
insert into t select 'b1', public.rpc_register_push_token('ExponentPushToken[bbb]', 'android');
select is((select count(*)::int from public.push_tokens), 1, 'B sees only own token');

select tests.authenticate_as((select ua from ids));
select is(public.rpc_unregister_push_token('ExponentPushToken[bbb]'), false,
  'A cannot unregister B''s token');
select is(public.rpc_unregister_push_token('ExponentPushToken[aaa]'), true,
  'A unregisters own token (sign-out)');
select is_empty($$ select 1 from public.push_tokens where token = 'ExponentPushToken[aaa]' $$,
  'A''s token row is gone');

-- Same device, next account after sign-out: B can now register it.
select tests.authenticate_as((select ub from ids));
select lives_ok($$ select public.rpc_register_push_token('ExponentPushToken[aaa]', 'ios') $$,
  'B can register the token after A unregistered it');
reset role;
select is((select count(*)::int from public.push_tokens where user_id = (select ub from ids)), 2,
  'B''s own rows are intact');

select tests.as_anon();
select throws_ok($$ select public.rpc_register_push_token('ExponentPushToken[ccc]', 'ios') $$,
  '42501', null, 'anon cannot register push tokens');
select throws_ok($$ select public.rpc_unregister_push_token('ExponentPushToken[aaa]') $$,
  '42501', null, 'anon cannot unregister push tokens');

select * from finish();
rollback;
