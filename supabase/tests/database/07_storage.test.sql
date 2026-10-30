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
select tests.create_user('919811300001') as u1,
       tests.create_user('919811300002') as u2,
       tests.create_user('919811300003') as adm;
grant select on ids to anon, authenticated;
select tests.make_admin((select adm from ids));

-- Bucket configuration ------------------------------------------------------------
select results_eq(
  $$ select id, public from storage.buckets where id in ('avatars', 'portfolio', 'kyc') order by id $$,
  $$ values ('avatars'::text, true), ('kyc'::text, false), ('portfolio'::text, true) $$,
  'avatars/portfolio are public buckets (public URLs bypass RLS); kyc is private');
select is_empty(
  $$ select policyname from pg_policies
      where schemaname = 'storage' and tablename = 'objects'
        and cmd = 'SELECT' and 'anon' = any (roles) $$,
  'no storage.objects SELECT policy for anon');

-- Owner writes --------------------------------------------------------------------
select tests.authenticate_as((select u1 from ids));
select lives_ok($$ insert into storage.objects (bucket_id, name, owner_id)
                   values ('avatars', (select u1 from ids)::text || '/avatar.png', (select u1 from ids)::text) $$,
  'owner can upload avatar under own folder');
select lives_ok($$ insert into storage.objects (bucket_id, name, owner_id)
                   values ('portfolio', (select u1 from ids)::text || '/deck.pdf', (select u1 from ids)::text) $$,
  'owner can upload portfolio file under own folder');
select throws_ok($$ insert into storage.objects (bucket_id, name, owner_id)
                    values ('avatars', (select u2 from ids)::text || '/avatar.png', (select u1 from ids)::text) $$,
  '42501', null, 'cannot upload avatar into another user''s folder');
select throws_ok($$ insert into storage.objects (bucket_id, name, owner_id)
                    values ('portfolio', (select u2 from ids)::text || '/x.pdf', (select u1 from ids)::text) $$,
  '42501', null, 'cannot upload portfolio file into another user''s folder');
select throws_ok($$ insert into storage.objects (bucket_id, name, owner_id)
                    values ('avatars', (select u1 from ids)::text || '/../' || (select u2 from ids)::text || '/a.png', (select u1 from ids)::text) $$,
  '42501', null, 'avatar object name with .. rejected');
select throws_ok($$ insert into storage.objects (bucket_id, name, owner_id)
                    values ('portfolio', (select u1 from ids)::text || '/../' || (select u2 from ids)::text || '/x.pdf', (select u1 from ids)::text) $$,
  '42501', null, 'portfolio object name with .. rejected');
select throws_ok($$ update storage.objects set name = (select u1 from ids)::text || '/../' || (select u2 from ids)::text || '/a.png'
                    where bucket_id = 'avatars' and name = (select u1 from ids)::text || '/avatar.png' $$,
  '42501', null, 'cannot rename own avatar to a .. path');
select is((select count(*)::int from storage.objects where bucket_id in ('avatars', 'portfolio')), 2,
  'owner can list own avatar + portfolio objects');

-- Listing by others -----------------------------------------------------------------
select tests.authenticate_as((select u2 from ids));
select is((select count(*)::int from storage.objects where bucket_id in ('avatars', 'portfolio')), 0,
  'another user cannot list avatars/portfolio objects');

select tests.as_anon();
select is((select count(*)::int from storage.objects where bucket_id in ('avatars', 'portfolio')), 0,
  'anon cannot list avatars/portfolio objects');

-- kyc (private) --------------------------------------------------------------------------
select tests.authenticate_as((select u1 from ids));
select lives_ok($$ insert into storage.objects (bucket_id, name, owner_id)
                   values ('kyc', (select u1 from ids)::text || '/pan.jpg', (select u1 from ids)::text) $$,
  'owner can upload kyc document under own folder');
select throws_ok($$ insert into storage.objects (bucket_id, name, owner_id)
                    values ('kyc', (select u2 from ids)::text || '/pan.jpg', (select u1 from ids)::text) $$,
  '42501', null, 'cannot upload kyc document into another user''s folder');
select throws_ok($$ insert into storage.objects (bucket_id, name, owner_id)
                    values ('kyc', (select u1 from ids)::text || '/../x/pan.jpg', (select u1 from ids)::text) $$,
  '42501', null, 'kyc object name with .. rejected');
select is((select count(*)::int from storage.objects where bucket_id = 'kyc'), 1,
  'owner can read own kyc object');

select tests.authenticate_as((select u2 from ids));
select is((select count(*)::int from storage.objects where bucket_id = 'kyc'), 0,
  'another user cannot read kyc objects');

select tests.authenticate_as((select adm from ids));
select is((select count(*)::int from storage.objects
            where bucket_id = 'kyc' and name like (select u1 from ids)::text || '/%'), 1,
  'admin can read kyc objects');

select * from finish();
rollback;
