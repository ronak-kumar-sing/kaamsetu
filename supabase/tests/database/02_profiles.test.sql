begin;
-- pgTAP is test-only: created inside this rolled-back transaction, never by migrations.
create extension if not exists pgtap with schema extensions;
select plan(22);
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
select tests.create_user('919811111111', 'asha@example.com') as u1,
       tests.create_user('919822222222', null) as u2;
grant select on ids to anon, authenticated;

-- Trigger-created profile ---------------------------------------------------
select results_eq(
  $$ select phone, email, phone_verified, email_verified from public.profiles where id = (select u1 from ids) $$,
  $$ values ('+919811111111'::text, 'asha@example.com'::text, true, true) $$,
  'auth.users insert creates profile with E.164 phone and verification flags'
);
select is(
  (select email_verified from public.profiles where id = (select u2 from ids)),
  false, 'email_verified is false without a confirmed email'
);

update auth.users set email = 'ravi@example.com', email_confirmed_at = now() where id = (select u2 from ids);
select results_eq(
  $$ select email, email_verified from public.profiles where id = (select u2 from ids) $$,
  $$ values ('ravi@example.com'::text, true) $$,
  'auth.users update syncs email + email_verified'
);

-- Owner updates ---------------------------------------------------------------
select tests.authenticate_as((select u1 from ids));

select lives_ok(
  $$ update public.profiles
        set full_name = 'Asha Rao', city = 'Pune', headline = 'Designer', bio = 'Hi',
            languages = array['en','hi','mr'], hourly_rate_paise = 150000, availability = 'busy'
      where id = (select u1 from ids) $$,
  'owner can update allowed profile columns'
);
select results_eq(
  $$ select full_name, city, hourly_rate_paise, availability::text from public.profiles where id = (select u1 from ids) $$,
  $$ values ('Asha Rao'::text, 'Pune'::text, 150000::bigint, 'busy'::text) $$,
  'owner reads back own updated profile'
);
select throws_ok($$ update public.profiles set kyc_verified = true where id = (select u1 from ids) $$,
  '42501', null, 'owner cannot set kyc_verified');
select throws_ok($$ update public.profiles set phone_verified = false where id = (select u1 from ids) $$,
  '42501', null, 'owner cannot set phone_verified');
select throws_ok($$ update public.profiles set is_flagged = false where id = (select u1 from ids) $$,
  '42501', null, 'owner cannot set is_flagged');
select throws_ok($$ update public.profiles set phone = '+910000000000' where id = (select u1 from ids) $$,
  '42501', null, 'owner cannot set phone');
select throws_ok($$ update public.profiles set hourly_rate_paise = -1 where id = (select u1 from ids) $$,
  '23514', null, 'hourly rate must be >= 0');
select results_eq(
  $$ with u as (update public.profiles set full_name = 'Hacked' where id = (select u2 from ids) returning 1)
     select count(*)::int from u $$,
  $$ values (0) $$,
  'user cannot update another user''s profile'
);
select throws_ok($$ insert into public.profiles (id) values (gen_random_uuid()) $$,
  '42501', null, 'user cannot insert profiles directly');

-- Another user reads public fields only -----------------------------------------
select tests.authenticate_as((select u2 from ids));

select is((select full_name from public.profiles where id = (select u1 from ids)), 'Asha Rao',
  'other authenticated user can read public profile fields');
select is((select headline from public.public_profiles where id = (select u1 from ids)), 'Designer',
  'public_profiles view is readable');
select throws_ok($$ select phone from public.profiles where id = (select u1 from ids) $$,
  '42501', null, 'other user cannot read phone');
select throws_ok($$ select email from public.profiles where id = (select u1 from ids) $$,
  '42501', null, 'other user cannot read email');
select throws_ok($$ select * from public.get_profile_private((select u1 from ids)) $$,
  '42501', null, 'other user cannot read private fields via get_profile_private');
select is((select count(*)::int from public.profiles where id = (select u2 from ids)), 1,
  'user can read own profile row');

select tests.authenticate_as((select u1 from ids));
select results_eq(
  $$ select phone, email from public.get_profile_private() $$,
  $$ values ('+919811111111'::text, 'asha@example.com'::text) $$,
  'owner reads own phone/email via get_profile_private'
);

-- anon ------------------------------------------------------------------------------
select tests.as_anon();
select throws_ok($$ select id from public.profiles $$, '42501', null, 'anon cannot read profiles');
select throws_ok($$ select id from public.public_profiles $$, '42501', null, 'anon cannot read public_profiles');
select isnt_empty($$ select slug from public.skills $$, 'anon can read skills');

select * from finish();
rollback;
