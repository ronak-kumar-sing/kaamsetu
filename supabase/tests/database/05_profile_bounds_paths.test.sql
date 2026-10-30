begin;
-- pgTAP is test-only: created inside this rolled-back transaction, never by migrations.
create extension if not exists pgtap with schema extensions;
select plan(30);
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
select tests.create_user('919811100001') as u1,
       tests.create_user('919811100002') as u2;
grant select on ids to authenticated;

-- text_array_items_between helper ----------------------------------------------
select ok(public.text_array_items_between(array['en','hi'], 2, 30), 'helper: valid items pass');
select ok(public.text_array_items_between('{}'::text[], 2, 30), 'helper: empty array passes');
select ok(not public.text_array_items_between(array['en', null], 2, 30), 'helper: null item fails');
select ok(not public.text_array_items_between(array['e'], 2, 30), 'helper: too-short item fails');

select tests.authenticate_as((select u1 from ids));

-- profiles bounds -----------------------------------------------------------------
select lives_ok($$ update public.profiles set full_name = null where id = (select u1 from ids) $$,
  'full_name may stay NULL before onboarding');
select throws_ok($$ update public.profiles set full_name = 'A' where id = (select u1 from ids) $$,
  '23514', null, 'full_name shorter than 2 rejected');
select throws_ok($$ update public.profiles set full_name = repeat('a', 81) where id = (select u1 from ids) $$,
  '23514', null, 'full_name longer than 80 rejected');
select lives_ok($$ update public.profiles set full_name = repeat('a', 80), city = repeat('c', 60),
                     headline = repeat('h', 120), bio = repeat('b', 1000),
                     languages = array['en','hi','mr','ta','te','kn','ml','bn','gu','pa'],
                     hourly_rate_paise = 10000000
                   where id = (select u1 from ids) $$,
  'values at the upper bounds are accepted');
select throws_ok($$ update public.profiles set headline = repeat('h', 121) where id = (select u1 from ids) $$,
  '23514', null, 'headline > 120 rejected');
select throws_ok($$ update public.profiles set bio = repeat('b', 1001) where id = (select u1 from ids) $$,
  '23514', null, 'bio > 1000 rejected');
select throws_ok($$ update public.profiles set city = repeat('c', 61) where id = (select u1 from ids) $$,
  '23514', null, 'city > 60 rejected');
select throws_ok($$ update public.profiles set languages = array['en','hi','mr','ta','te','kn','ml','bn','gu','pa','or']
                     where id = (select u1 from ids) $$,
  '23514', null, 'more than 10 languages rejected');
select throws_ok($$ update public.profiles set languages = array['e'] where id = (select u1 from ids) $$,
  '23514', null, 'language shorter than 2 rejected');
select throws_ok($$ update public.profiles set languages = array[repeat('x', 31)] where id = (select u1 from ids) $$,
  '23514', null, 'language longer than 30 rejected');
select throws_ok($$ update public.profiles set hourly_rate_paise = 10000001 where id = (select u1 from ids) $$,
  '23514', null, 'hourly rate above 1,00,000 INR/hr rejected');

-- avatar_path -------------------------------------------------------------------------
select lives_ok($$ update public.profiles set avatar_path = (select u1 from ids)::text || '/avatar-1.png'
                   where id = (select u1 from ids) $$,
  'avatar_path under own folder accepted');
select throws_ok($$ update public.profiles set avatar_path = (select u2 from ids)::text || '/avatar.png'
                   where id = (select u1 from ids) $$,
  '23514', null, 'avatar_path in another user''s folder rejected');
select throws_ok($$ update public.profiles set avatar_path = (select u1 from ids)::text || '/../' || (select u2 from ids)::text || '/a.png'
                   where id = (select u1 from ids) $$,
  '23514', null, 'avatar_path traversal rejected');
select throws_ok($$ update public.profiles set avatar_path = (select u1 from ids)::text || '/a..png'
                   where id = (select u1 from ids) $$,
  '23514', null, 'avatar_path containing .. rejected');

-- portfolio_items -----------------------------------------------------------------------
select lives_ok($$ insert into public.portfolio_items (profile_id, kind, title, storage_path)
                   values ((select u1 from ids), 'file', 'Deck', (select u1 from ids)::text || '/deck.pdf') $$,
  'portfolio file under own folder accepted');
select throws_ok($$ insert into public.portfolio_items (profile_id, kind, title, storage_path)
                   values ((select u1 from ids), 'file', 'Deck',
                           (select u1 from ids)::text || '/../' || (select u2 from ids)::text || '/x.pdf') $$,
  '23514', null, 'portfolio storage_path traversal rejected');
select throws_ok($$ insert into public.portfolio_items (profile_id, kind, title, storage_path)
                   values ((select u1 from ids), 'image', 'Pic', (select u2 from ids)::text || '/x.png') $$,
  '23514', null, 'portfolio storage_path in another user''s folder rejected');
select lives_ok($$ insert into public.portfolio_items (profile_id, kind, title, url, description)
                   values ((select u1 from ids), 'link', repeat('t', 120), 'https://example.com/work', repeat('d', 1000)) $$,
  'portfolio link at bounds accepted');
select throws_ok($$ insert into public.portfolio_items (profile_id, kind, title, url)
                   values ((select u1 from ids), 'link', 'Site', 'http://example.com') $$,
  '23514', null, 'portfolio url must be https');
select throws_ok($$ insert into public.portfolio_items (profile_id, kind, title, url)
                   values ((select u1 from ids), 'link', 'Site', 'https://e.com/' || repeat('a', 2040)) $$,
  '23514', null, 'portfolio url > 2048 rejected');
select throws_ok($$ insert into public.portfolio_items (profile_id, kind, title, url)
                   values ((select u1 from ids), 'link', repeat('t', 121), 'https://example.com') $$,
  '23514', null, 'portfolio title > 120 rejected');
select throws_ok($$ insert into public.portfolio_items (profile_id, kind, title, url, description)
                   values ((select u1 from ids), 'link', 'Site', 'https://example.com', repeat('d', 1001)) $$,
  '23514', null, 'portfolio description > 1000 rejected');

-- kyc_verifications.storage_path (rows written by service role) --------------------------
reset role;
select lives_ok($$ insert into public.kyc_verifications (user_id, doc_type, id_last4, id_hash, storage_path)
                   select u1, 'pan', '234F', 'h', u1::text || '/pan.jpg' from ids $$,
  'kyc storage_path under own folder accepted');
select throws_ok($$ insert into public.kyc_verifications (user_id, doc_type, id_last4, id_hash, storage_path)
                   select u2, 'pan', '234F', 'h', u2::text || '/../' || u1::text || '/pan.jpg' from ids $$,
  '23514', null, 'kyc storage_path traversal rejected');
select throws_ok($$ insert into public.kyc_verifications (user_id, doc_type, id_last4, id_hash, storage_path)
                   select u2, 'pan', '234F', 'h', u1::text || '/pan.jpg' from ids $$,
  '23514', null, 'kyc storage_path in another user''s folder rejected');

select * from finish();
rollback;
