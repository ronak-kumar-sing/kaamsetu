begin;
-- pgTAP is test-only: created inside this rolled-back transaction, never by migrations.
create extension if not exists pgtap with schema extensions;
select plan(18);
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
select tests.create_user('919833333333') as u1,
       tests.create_user('919844444444') as adm;
grant select on ids to authenticated;
select tests.make_admin((select adm from ids));

select tests.authenticate_as((select u1 from ids));

select throws_ok($$ insert into public.user_roles (user_id, role) values ((select u1 from ids), 'admin') $$,
  '42501', null, 'user cannot self-insert admin role');
select throws_ok($$ insert into public.user_roles (user_id, role) values ((select u1 from ids), 'client') $$,
  '42501', null, 'user cannot insert any role directly');
select throws_ok($$ select public.rpc_set_my_roles(array['admin']::public.app_role[]) $$,
  '42501', 'The admin role cannot be self-assigned', 'rpc_set_my_roles rejects admin');
select throws_ok($$ select public.rpc_set_my_roles(array['client','admin']::public.app_role[]) $$,
  '42501', null, 'rpc_set_my_roles rejects admin mixed with other roles');
select throws_ok($$ select public.rpc_set_my_roles('{}'::public.app_role[]) $$,
  'P0001', null, 'rpc_set_my_roles requires at least one role');

select is(public.rpc_set_my_roles(array['client','freelancer']::public.app_role[]),
  array['client','freelancer']::public.app_role[], 'set client+freelancer works');
select is(public.my_roles(), array['client','freelancer']::public.app_role[], 'my_roles reflects roles');
select is(public.rpc_set_my_roles(array['freelancer']::public.app_role[]),
  array['freelancer']::public.app_role[], 'set replaces previous non-admin roles');
select ok(not public.is_admin(), 'regular user is not admin');

-- onboarding
select throws_ok($$ select public.rpc_complete_onboarding() $$,
  'P0001', 'Full name is required to complete onboarding', 'onboarding requires full_name');
update public.profiles set full_name = 'Ravi', city = 'Jaipur' where id = (select u1 from ids);
select isnt(public.rpc_complete_onboarding(), null, 'onboarding completes with name, city, role');

-- admin-only RPCs and audit visibility
select throws_ok($$ select public.rpc_admin_set_role((select u1 from ids), 'admin', true) $$,
  '42501', 'Admin only', 'non-admin cannot call rpc_admin_set_role');
select throws_ok($$ select public.rpc_admin_flag_user((select u1 from ids), true, 'spam') $$,
  '42501', 'Admin only', 'non-admin cannot call rpc_admin_flag_user');
select is((select count(*)::int from public.audit_log), 0, 'non-admin sees no audit_log rows');

select tests.authenticate_as((select adm from ids));
select is(public.rpc_admin_set_role((select u1 from ids), 'client', true),
  array['client','freelancer']::public.app_role[], 'admin can grant a role');
select throws_ok($$ select public.rpc_admin_set_role((select adm from ids), 'admin', false) $$,
  'P0001', null, 'admin cannot remove own admin role');
select lives_ok($$ select public.rpc_admin_flag_user((select u1 from ids), true, 'spam reports') $$,
  'admin can flag a user');
select ok((select count(*) from public.audit_log where entity_id = (select u1 from ids)) >= 3,
  'admin sees audit entries for the user');

select * from finish();
rollback;
