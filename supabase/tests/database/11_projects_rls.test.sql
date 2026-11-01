begin;
-- pgTAP is test-only: created inside this rolled-back transaction, never by migrations.
create extension if not exists pgtap with schema extensions;
select plan(42);
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

-- Visibility (RLS) matrix for projects, milestones, skills, members, proposals,
-- invites, submissions and milestone history across draft / open / invite-only /
-- awarded / in_progress projects.

select tests.setup_user('c1', '919810000031', array['client']::public.app_role[]);
select tests.setup_user('f1', '919810000032', array['freelancer']::public.app_role[]); -- assigned
select tests.setup_user('f2', '919810000033', array['freelancer']::public.app_role[]); -- losing proposer
select tests.setup_user('s', '919810000034', array['freelancer', 'client']::public.app_role[]); -- stranger
select tests.setup_user('adm', '919810000035', array['client']::public.app_role[]);
select tests.make_admin(tests.id('adm'));
select tests.set('cover', 'I have built many shop websites and can deliver this quickly.');
select tests.set('logo', (select id::text from public.skills where slug = 'logo-design'));

-- D: draft. O: open public (proposals by f1, f2). I: open invite-only (f1 invited).
-- A: awarded to f1 (f2's proposal rejected). B: in_progress for f1, with history + submission.
select tests.authenticate_as(tests.id('c1'));
select tests.set('D', public.rpc_save_project_draft(null,
  tests.project_json() || jsonb_build_object('skill_ids', jsonb_build_array(tests.get('logo'))),
  tests.ms(array[500000, 500000]))::text);
select tests.new_project('O', tests.id('c1'), array[500000, 500000]);
select tests.set('link_O', (select invite_id::text from public.rpc_create_invite(tests.id('O'), null, null)));
select tests.new_project('I', tests.id('c1'), array[500000, 500000], 'invite_only');
select tests.set('inv_I', (select invite_id::text from public.rpc_create_invite(tests.id('I'), tests.id('f1'), null)));
select tests.new_project('A', tests.id('c1'), array[500000, 500000]);
select tests.new_project('B', tests.id('c1'), array[500000, 500000]);

select tests.authenticate_as(tests.id('f1'));
select tests.set('propO_f1', public.rpc_submit_proposal(tests.id('O'), tests.get('cover'), 1000000, 30, null)::text);
select tests.authenticate_as(tests.id('f2'));
select tests.set('propO_f2', public.rpc_submit_proposal(tests.id('O'), tests.get('cover'), 1000000, 30, null)::text);
select tests.set('propA_f2', public.rpc_submit_proposal(tests.id('A'), tests.get('cover'), 1000000, 30, null)::text);
select tests.award(tests.id('A'), tests.id('c1'), tests.id('f1'));
select tests.award(tests.id('B'), tests.id('c1'), tests.id('f1'));
select tests.fund(tests.milestone(tests.id('B'), 1));
select tests.authenticate_as(tests.id('f1'));
select public.rpc_start_milestone(tests.milestone(tests.id('B'), 1));
select public.rpc_submit_milestone(tests.milestone(tests.id('B'), 1), 'First version is ready', array['https://example.com/v1'], null);

-- private project ids (everything except the open public one)
create temp table private_projects as
select unnest(array[tests.id('D'), tests.id('I'), tests.id('A'), tests.id('B')]) as id;
grant select on private_projects to authenticated, anon;

-- Stranger ---------------------------------------------------------------------------------------------
select tests.authenticate_as(tests.id('s'));
select set_eq($$ select id from public.projects $$, $$ values (tests.id('O')) $$,
  'stranger sees only the open public project');
select is((select count(*)::int from public.milestones where project_id in (select id from private_projects)), 0,
  'stranger cannot read milestones of draft / invite-only / awarded / in_progress projects');
select is((select count(*)::int from public.milestones where project_id = tests.id('O')), 2,
  'stranger can read milestones of the open public project');
select is((select count(*)::int from public.project_skills where project_id = tests.id('D')), 0,
  'stranger cannot read skills of a draft');
select is_empty($$ select 1 from public.proposals $$, 'stranger sees no proposals');
select is_empty($$ select 1 from public.project_invites $$, 'stranger sees no invites');
select is_empty($$ select 1 from public.submissions $$, 'stranger sees no submissions');
select is_empty($$ select 1 from public.milestone_status_history $$, 'stranger sees no milestone history');
select is_empty($$ select 1 from public.project_members $$, 'stranger sees no project members');
select ok(not public.can_view_project(tests.id('B')), 'can_view_project is false for a stranger on an in_progress project');

-- Losing proposer ---------------------------------------------------------------------------------------
select tests.authenticate_as(tests.id('f2'));
select set_eq($$ select id from public.projects $$, $$ values (tests.id('O')) $$,
  'losing proposer cannot see the awarded / in_progress projects');
select set_eq($$ select id from public.proposals $$, $$ values (tests.id('propO_f2')), (tests.id('propA_f2')) $$,
  'proposer sees only their own proposals (not other freelancers'')');
select is((select count(*)::int from public.milestones where project_id in (tests.id('A'), tests.id('B'))), 0,
  'losing proposer cannot read milestones once the project is awarded');
select is_empty($$ select 1 from public.milestone_status_history $$, 'losing proposer sees no milestone history');
select is_empty($$ select 1 from public.submissions $$, 'losing proposer sees no submissions');

-- Assigned freelancer / invitee ------------------------------------------------------------------------------
select tests.authenticate_as(tests.id('f1'));
select set_eq($$ select id from public.projects $$,
  $$ values (tests.id('O')), (tests.id('I')), (tests.id('A')), (tests.id('B')) $$,
  'freelancer sees open, invited, awarded and in_progress projects but not the draft');
select is((select count(*)::int from public.milestones where project_id in (tests.id('A'), tests.id('B'), tests.id('I'))), 6,
  'assigned freelancer / invitee reads those milestones');
select is((select count(*)::int from public.milestones where project_id = tests.id('D')), 0,
  'freelancer cannot read draft milestones');
select set_eq($$ select id from public.proposals where project_id = tests.id('O') $$, $$ values (tests.id('propO_f1')) $$,
  'freelancer does not see a competitor''s proposal');
select set_eq($$ select id from public.project_invites $$, $$ values (tests.id('inv_I')) $$,
  'invitee sees own invite, not link invites');
select is((select count(*)::int from public.milestone_status_history), 3,
  'member reads milestone history of own project');
select is((select count(*)::int from public.submissions), 1, 'member reads submissions of own project');
select set_eq($$ select user_id from public.project_members where project_id = tests.id('B') $$,
  $$ values (tests.id('c1')), (tests.id('f1')) $$, 'member reads the member list');

-- Client ---------------------------------------------------------------------------------------------------------
select tests.authenticate_as(tests.id('c1'));
select is((select count(*)::int from public.projects), 5, 'client sees all own projects including the draft');
select is((select count(*)::int from public.project_skills where project_id = tests.id('D')), 1, 'client reads draft skills');
select is((select count(*)::int from public.proposals), 5, 'client sees every proposal on own projects');
select is((select count(*)::int from public.project_invites), 2, 'client sees invites they created');
select is((select count(*)::int from public.milestone_status_history), 3, 'client reads milestone history');
select is((select count(*)::int from public.submissions), 1, 'client reads submissions');

-- Admin -------------------------------------------------------------------------------------------------------------
select tests.authenticate_as(tests.id('adm'));
select is((select count(*)::int from public.projects where client_id = tests.id('c1')), 5, 'admin sees all projects');
select is((select count(*)::int from public.submissions), 1, 'admin reads submissions');

-- Project closes: the invite-only project is no longer visible to the invitee once revoked
select tests.authenticate_as(tests.id('c1'));
select public.rpc_revoke_invite(tests.id('inv_I'));
select tests.authenticate_as(tests.id('f1'));
select is((select count(*)::int from public.projects where id = tests.id('I')), 0,
  'invite-only project disappears once the invite is revoked');

-- Writes are RPC-only -------------------------------------------------------------------------------------------------
select tests.authenticate_as(tests.id('c1'));
select throws_ok($$ insert into public.projects (client_id, title, description, category)
                    values (tests.id('c1'), 'Direct insert', 'Trying to bypass the RPC layer entirely here.', 'design') $$,
  '42501', null, 'clients cannot insert projects directly');
select throws_ok($$ update public.milestones set amount_paise = 1 where project_id = tests.id('O') $$,
  '42501', null, 'clients cannot update milestones directly');
select throws_ok($$ update public.projects set status = 'open' where id = tests.id('D') $$,
  '42501', null, 'clients cannot update projects directly');
select throws_ok($$ delete from public.proposals $$, '42501', null, 'clients cannot delete proposals');
select throws_ok($$ insert into public.project_members (project_id, user_id, member_role)
                    values (tests.id('A'), tests.id('s'), 'freelancer') $$,
  '42501', null, 'clients cannot add project members');

-- anon -------------------------------------------------------------------------------------------------------------------
select tests.as_anon();
select throws_ok($$ select 1 from public.projects $$, '42501', null, 'anon cannot read projects');
select throws_ok($$ select 1 from public.milestones $$, '42501', null, 'anon cannot read milestones');
select throws_ok($$ select 1 from public.proposals $$, '42501', null, 'anon cannot read proposals');
select throws_ok($$ select * from public.rpc_search_projects() $$, '42501', null, 'anon cannot search projects');
select throws_ok($$ select * from public.rpc_resolve_invite(repeat('A', 43)) $$, '42501', null, 'anon cannot resolve invites');

select * from finish();
rollback;
