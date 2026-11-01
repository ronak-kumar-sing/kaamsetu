begin;
-- pgTAP is test-only: created inside this rolled-back transaction, never by migrations.
create extension if not exists pgtap with schema extensions;
select plan(16);
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

-- Phase 2 helpers -------------------------------------------------------------

-- Back to the table owner with no JWT (simulates system jobs / payment webhooks).
create or replace function tests.as_postgres()
returns void language plpgsql as $fn$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end $fn$;

-- Named values shared between statements (ids, tokens).
create table tests.ctx (k text primary key, v text);
grant all on tests.ctx to anon, authenticated;

create or replace function tests.set(p_k text, p_v text)
returns text language sql as $fn$
  insert into tests.ctx (k, v) values (p_k, p_v) on conflict (k) do update set v = excluded.v
  returning v;
$fn$;

create or replace function tests.get(p_k text)
returns text language sql stable as $fn$ select v from tests.ctx where k = p_k $fn$;

create or replace function tests.id(p_k text)
returns uuid language sql stable as $fn$ select v::uuid from tests.ctx where k = p_k $fn$;

create or replace function tests.today()
returns date language sql stable as $fn$ select (now() at time zone 'Asia/Kolkata')::date $fn$;

-- Onboarded user with roles; stored in ctx under p_key.
create or replace function tests.setup_user(
  p_key text, p_phone text, p_roles public.app_role[], p_name text default 'Test User',
  p_headline text default null
) returns uuid language plpgsql as $fn$
declare v_id uuid := tests.create_user(p_phone);
begin
  insert into public.user_roles (user_id, role) select v_id, r from unnest(p_roles) r;
  update public.profiles
     set full_name = p_name, city = 'Jaipur', headline = p_headline, onboarding_completed_at = now()
   where id = v_id;
  perform tests.set(p_key, v_id::text);
  return v_id;
end $fn$;

-- Milestone plan JSON: amounts in order, due dates today + p_offset + i.
create or replace function tests.ms(p_amounts bigint[], p_offset int default 10)
returns jsonb language sql stable as $fn$
  select jsonb_agg(jsonb_build_object(
           'title', 'Milestone ' || o,
           'deliverable', 'Deliverable number ' || o || ' completed',
           'acceptance_criteria', 'Accepted when item ' || o || ' works',
           'amount_paise', a,
           'due_date', to_char(tests.today() + p_offset + o::int, 'YYYY-MM-DD'))
         order by o)
    from unnest(p_amounts) with ordinality t (a, o);
$fn$;

create or replace function tests.edits(p_amounts bigint[], p_offset int default 20)
returns jsonb language sql stable as $fn$
  select jsonb_agg(jsonb_build_object(
           'title', 'Edited milestone ' || o,
           'amount_paise', a,
           'due_date', to_char(tests.today() + p_offset + o::int, 'YYYY-MM-DD'))
         order by o)
    from unnest(p_amounts) with ordinality t (a, o);
$fn$;

create or replace function tests.project_json(
  p_title text default 'Build a shop website',
  p_visibility text default 'public',
  p_revision_limit int default 2
) returns jsonb language sql immutable as $fn$
  select jsonb_build_object(
    'title', p_title,
    'description', 'We need a complete, responsive website for our shop with a catalogue.',
    'category', 'development',
    'city', 'Jaipur',
    'is_remote', true,
    'visibility', p_visibility,
    'checkin_cadence_days', 2,
    'revision_limit', p_revision_limit);
$fn$;

-- Create (and by default publish) a project as p_client; leaves the session as p_client.
create or replace function tests.new_project(
  p_key text, p_client uuid, p_amounts bigint[], p_visibility text default 'public',
  p_publish boolean default true, p_revision_limit int default 2,
  p_title text default 'Build a shop website'
) returns uuid language plpgsql as $fn$
declare v_id uuid;
begin
  perform tests.authenticate_as(p_client);
  v_id := public.rpc_save_project_draft(
    null, tests.project_json(p_title, p_visibility, p_revision_limit), tests.ms(p_amounts));
  if p_publish then
    perform public.rpc_publish_project(v_id);
  end if;
  perform tests.set(p_key, v_id::text);
  return v_id;
end $fn$;

-- Freelancer proposes (no edits) and the client accepts; leaves the session as p_client.
create or replace function tests.award(p_project uuid, p_client uuid, p_freelancer uuid)
returns uuid language plpgsql as $fn$
declare v_prop uuid;
begin
  perform tests.authenticate_as(p_freelancer);
  v_prop := public.rpc_submit_proposal(
    p_project, 'I have built many shop websites and can deliver this quickly.', 1000000, 30, null);
  perform tests.authenticate_as(p_client);
  perform public.rpc_accept_proposal(v_prop, false);
  return v_prop;
end $fn$;

-- Simulate the Phase-4 payment webhook funding a milestone (as postgres).
create or replace function tests.fund(p_milestone uuid)
returns void language plpgsql as $fn$
begin
  perform tests.as_postgres();
  perform public._transition_milestone(p_milestone, 'funded', 'system', null, 'test funding');
end $fn$;

create or replace function tests.milestone(p_project uuid, p_position int)
returns uuid language sql stable security definer set search_path = '' as $fn$
  select m.id from public.milestones m where m.project_id = p_project and m.position = p_position;
$fn$;

grant execute on all functions in schema tests to anon, authenticated;
-- ---------------------------------------------------------------------------

-- Storage policies for the private `project-files` bucket.

select tests.setup_user('c1', '919810000061', array['client']::public.app_role[]);
select tests.setup_user('f1', '919810000062', array['freelancer']::public.app_role[]);
select tests.setup_user('s', '919810000063', array['freelancer']::public.app_role[]);
select tests.setup_user('adm', '919810000064', array['client']::public.app_role[]);
select tests.make_admin(tests.id('adm'));

select tests.new_project('p', tests.id('c1'), array[500000, 500000]);
select tests.award(tests.id('p'), tests.id('c1'), tests.id('f1'));
select tests.new_project('q', tests.id('c1'), array[500000, 500000]);
select tests.set('m1', tests.milestone(tests.id('p'), 1)::text);
select tests.set('qm1', tests.milestone(tests.id('q'), 1)::text);
select tests.set('dir', tests.get('p') || '/' || tests.get('m1') || '/');

select tests.as_postgres();
select results_eq($$ select public, file_size_limit from storage.buckets where id = 'project-files' $$,
  $$ values (false, 26214400::bigint) $$, 'project-files is a private bucket');

-- Inserts ------------------------------------------------------------------------------------------
select tests.authenticate_as(tests.id('f1'));
select lives_ok($$ insert into storage.objects (bucket_id, name, owner_id)
                   values ('project-files', tests.get('dir') || 'design-v1.pdf', tests.get('f1')) $$,
  'assigned freelancer uploads into <project>/<milestone>/');
select throws_ok($$ insert into storage.objects (bucket_id, name, owner_id)
                    values ('project-files', tests.get('p') || '/design.pdf', tests.get('f1')) $$,
  '42501', null, 'path must have exactly 3 segments');
select throws_ok($$ insert into storage.objects (bucket_id, name, owner_id)
                    values ('project-files', tests.get('dir') || '../x.pdf', tests.get('f1')) $$,
  '42501', null, '.. is rejected');
select throws_ok($$ insert into storage.objects (bucket_id, name, owner_id)
                    values ('project-files', tests.get('dir') || 'my file.pdf', tests.get('f1')) $$,
  '42501', null, 'segments must match [A-Za-z0-9._-]');
select throws_ok($$ insert into storage.objects (bucket_id, name, owner_id)
                    values ('project-files', tests.get('p') || '/' || tests.get('qm1') || '/x.pdf', tests.get('f1')) $$,
  '42501', null, 'milestone must belong to the project in the path');
select throws_ok($$ insert into storage.objects (bucket_id, name, owner_id)
                    values ('project-files', tests.get('q') || '/' || tests.get('qm1') || '/x.pdf', tests.get('f1')) $$,
  '42501', null, 'freelancer cannot upload into a project they are not assigned to');

select tests.authenticate_as(tests.id('c1'));
select lives_ok($$ insert into storage.objects (bucket_id, name, owner_id)
                   values ('project-files', tests.get('dir') || 'brief.pdf', tests.get('c1')) $$,
  'client uploads into own project');

select tests.authenticate_as(tests.id('s'));
select throws_ok($$ insert into storage.objects (bucket_id, name, owner_id)
                    values ('project-files', tests.get('dir') || 'evil.pdf', tests.get('s')) $$,
  '42501', null, 'non-member cannot upload');

-- Reads ----------------------------------------------------------------------------------------------
select is((select count(*)::int from storage.objects where bucket_id = 'project-files'), 0, 'non-member cannot list files');
select tests.authenticate_as(tests.id('f1'));
select is((select count(*)::int from storage.objects where bucket_id = 'project-files'), 2, 'freelancer member reads files');
select tests.authenticate_as(tests.id('c1'));
select is((select count(*)::int from storage.objects where bucket_id = 'project-files'), 2, 'client member reads files');
select tests.authenticate_as(tests.id('adm'));
select is((select count(*)::int from storage.objects where bucket_id = 'project-files'), 2, 'admin reads files');
select tests.as_anon();
select is((select count(*)::int from storage.objects where bucket_id = 'project-files'), 0, 'anon reads nothing');

-- No update / delete ---------------------------------------------------------------------------------------
select tests.authenticate_as(tests.id('f1'));
update storage.objects set name = tests.get('dir') || 'renamed.pdf'
 where bucket_id = 'project-files' and name = tests.get('dir') || 'design-v1.pdf';
select tests.as_postgres();
select set_eq($$ select name from storage.objects where bucket_id = 'project-files' $$,
  $$ values (tests.get('dir') || 'design-v1.pdf'), (tests.get('dir') || 'brief.pdf') $$,
  'members cannot rename files');
select is_empty($$ select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects'
                     and policyname like 'project_files%' and cmd in ('UPDATE', 'DELETE') $$,
  'no update/delete policies on project-files');

select * from finish();
rollback;
