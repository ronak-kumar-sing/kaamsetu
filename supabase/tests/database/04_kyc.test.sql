begin;
-- pgTAP is test-only: created inside this rolled-back transaction, never by migrations.
create extension if not exists pgtap with schema extensions;
select plan(15);
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
select tests.create_user('919855555555') as u1,
       tests.create_user('919866666666') as u2,
       tests.create_user('919877777777') as adm;
select tests.make_admin((select adm from ids));

-- KYC rows are inserted by an edge function with service_role; simulate as postgres.
alter table ids add column k1 uuid not null default gen_random_uuid(),
                add column k2 uuid not null default gen_random_uuid();
insert into public.kyc_verifications (id, user_id, doc_type, id_last4, id_hash, storage_path)
select k1, u1, 'pan'::public.kyc_doc_type, '234F', 'hash-u1', u1::text || '/pan.jpg' from ids
union all
select k2, u2, 'aadhaar'::public.kyc_doc_type, '9012', 'hash-u2', u2::text || '/aadhaar.pdf' from ids;
grant select on ids to authenticated;

select tests.authenticate_as((select u1 from ids));

select results_eq($$ select id from public.kyc_verifications $$, $$ select k1 from ids $$,
  'user sees only own kyc rows');
select is_empty($$ select id from public.kyc_verifications where user_id = (select u2 from ids) $$,
  'user cannot read other users'' kyc rows');
select lives_ok($$ select id, status, id_last4, storage_path from public.kyc_verifications $$,
  'user can read safe kyc columns');
select throws_ok($$ select id_hash from public.kyc_verifications $$, '42501', null,
  'user cannot read id_hash');
select throws_ok(
  $$ insert into public.kyc_verifications (user_id, doc_type, id_last4, id_hash, storage_path)
     values ((select u1 from ids), 'pan', '1111', 'x', (select u1 from ids)::text || '/x.jpg') $$,
  '42501', null, 'user cannot insert kyc rows directly');
select throws_ok($$ update public.kyc_verifications set status = 'approved' $$, '42501', null,
  'user cannot update kyc status directly');
select throws_ok($$ select public.rpc_admin_review_kyc((select k1 from ids), true, null) $$,
  '42501', 'Admin only', 'non-admin cannot call rpc_admin_review_kyc');

select tests.authenticate_as((select adm from ids));

select is((select count(*)::int from public.kyc_verifications where user_id in ((select u1 from ids), (select u2 from ids))),
  2, 'admin can read all kyc rows');
select is(public.rpc_admin_review_kyc((select k1 from ids), true, null), 'approved'::public.kyc_status,
  'admin approves kyc');
select is((select kyc_verified from public.profiles where id = (select u1 from ids)), true,
  'approval flips profiles.kyc_verified');
select throws_ok($$ select public.rpc_admin_review_kyc((select k1 from ids), false, 'dup') $$,
  'P0001', 'KYC submission has already been reviewed', 'cannot review twice');
select throws_ok($$ select public.rpc_admin_review_kyc((select k2 from ids), false, null) $$,
  'P0001', 'A rejection reason is required', 'rejection requires a reason');
select is(public.rpc_admin_review_kyc((select k2 from ids), false, 'Blurry image'), 'rejected'::public.kyc_status,
  'admin rejects kyc');
select is((select kyc_verified from public.profiles where id = (select u2 from ids)), false,
  'rejection leaves kyc_verified false');

-- One pending submission per user (as service role / postgres).
reset role;
insert into public.kyc_verifications (user_id, doc_type, id_last4, id_hash, storage_path)
select u2, 'pan', '777A', 'h', u2::text || '/pan2.jpg' from ids;
select throws_ok(
  $$ insert into public.kyc_verifications (user_id, doc_type, id_last4, id_hash, storage_path)
     select u2, 'pan', '888B', 'h2', u2::text || '/pan3.jpg' from ids $$,
  '23505', null, 'only one pending kyc per user');

select * from finish();
rollback;
