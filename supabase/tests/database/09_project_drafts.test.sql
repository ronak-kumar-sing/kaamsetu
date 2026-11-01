begin;
-- pgTAP is test-only: created inside this rolled-back transaction, never by migrations.
create extension if not exists pgtap with schema extensions;
select plan(47);
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

-- rpc_save_project_draft / rpc_publish_project / rpc_cancel_project.

select tests.setup_user('c1', '919810000011', array['client']::public.app_role[], 'Asha Client');
select tests.setup_user('c2', '919810000012', array['client']::public.app_role[]);
select tests.setup_user('f1', '919810000013', array['freelancer']::public.app_role[]);
select tests.set('logo', (select id::text from public.skills where slug = 'logo-design'));
select tests.set('web', (select id::text from public.skills where slug = 'web-development'));

-- Save draft: role + create ---------------------------------------------------------------
select tests.authenticate_as(tests.id('f1'));
select throws_ok($$ select public.rpc_save_project_draft(null, tests.project_json(), tests.ms(array[500000, 500000])) $$,
  'P0001', 'role_required', 'freelancer-only user cannot create a project');

select tests.authenticate_as(tests.id('c1'));
select tests.set('d', public.rpc_save_project_draft(null,
  tests.project_json() || jsonb_build_object('skill_ids', jsonb_build_array(tests.get('logo'), tests.get('web'))),
  tests.ms(array[500000, 500000]))::text);
select results_eq(
  $$ select status::text, client_id, freelancer_id, total_paise, visibility::text, published_at
       from public.projects where id = tests.id('d') $$,
  $$ values ('draft'::text, tests.id('c1'), null::uuid, 1000000::bigint, 'public'::text, null::timestamptz) $$,
  'draft created with total_paise from milestones');
select results_eq(
  $$ select user_id, member_role::text, active from public.project_members where project_id = tests.id('d') $$,
  $$ values (tests.id('c1'), 'client'::text, true) $$,
  'client is added to project_members on create');
select is((select count(*)::int from public.project_skills where project_id = tests.id('d')), 2,
  'skills saved');
select results_eq(
  $$ select position, title, amount_paise from public.milestones where project_id = tests.id('d') order by position $$,
  $$ values (1, 'Milestone 1'::text, 500000::bigint), (2, 'Milestone 2'::text, 500000::bigint) $$,
  'milestones saved in order');

-- Save draft: replace atomically --------------------------------------------------------------
select tests.set('old_m1', tests.milestone(tests.id('d'), 1)::text);
select is(public.rpc_save_project_draft(tests.id('d'),
            tests.project_json('Build a shop website v2') || '{"city": "", "skill_ids": []}'::jsonb,
            tests.ms(array[400000, 300000, 300000])),
  tests.id('d'), 'saving an existing draft returns its id');
select results_eq(
  $$ select title, city, total_paise, (select count(*)::int from public.milestones m where m.project_id = p.id),
            (select count(*)::int from public.project_skills s where s.project_id = p.id)
       from public.projects p where p.id = tests.id('d') $$,
  $$ values ('Build a shop website v2'::text, null::text, 1000000::bigint, 3, 0) $$,
  'draft update replaces fields, milestones and skills; blank city => null');
select is((select count(*)::int from public.milestones where id = tests.id('old_m1')), 0,
  'old milestones are replaced');
select tests.set('padded', public.rpc_save_project_draft(null,
  tests.project_json() || '{"title": "   Padded title here   "}'::jsonb, tests.ms(array[500000, 500000]))::text);
select is((select title from public.projects where id = tests.id('padded')),
  'Padded title here', 'text fields are trimmed');
select lives_ok($$ select public.rpc_save_project_draft(null, tests.project_json(), tests.ms(array[1000000])) $$,
  'drafts may be incomplete (one 100% milestone)');
select lives_ok($$ select public.rpc_save_project_draft(null, tests.project_json(), null) $$,
  'drafts may have no milestones yet');

-- Save draft: ownership / status / bounds ----------------------------------------------------
select tests.authenticate_as(tests.id('c2'));
select throws_ok($$ select public.rpc_save_project_draft(tests.id('d'), tests.project_json(), tests.ms(array[500000, 500000])) $$,
  'P0001', 'not_project_client', 'another client cannot edit the draft');
select throws_ok($$ select public.rpc_save_project_draft(gen_random_uuid(), tests.project_json(), tests.ms(array[500000, 500000])) $$,
  'P0001', 'project_not_found', 'unknown project id');
select throws_ok($$ select public.rpc_save_project_draft(null, tests.project_json('Shop'), tests.ms(array[500000, 500000])) $$,
  'P0001', 'invalid_input', 'title shorter than 5 rejected');
select throws_ok($$ select public.rpc_save_project_draft(null, tests.project_json(repeat('x', 121)), tests.ms(array[500000, 500000])) $$,
  'P0001', 'invalid_input', 'title longer than 120 rejected');
select throws_ok($$ select public.rpc_save_project_draft(null, tests.project_json() || '{"description": "too short"}', tests.ms(array[500000, 500000])) $$,
  'P0001', 'invalid_input', 'description shorter than 30 rejected');
select throws_ok($$ select public.rpc_save_project_draft(null, tests.project_json() || '{"checkin_cadence_days": 15}', tests.ms(array[500000, 500000])) $$,
  'P0001', 'invalid_input', 'checkin_cadence_days > 14 rejected');
select throws_ok($$ select public.rpc_save_project_draft(null, tests.project_json() || '{"revision_limit": 6}', tests.ms(array[500000, 500000])) $$,
  'P0001', 'invalid_input', 'revision_limit > 5 rejected');
select throws_ok($$ select public.rpc_save_project_draft(null, tests.project_json() || '{"visibility": "secret"}', tests.ms(array[500000, 500000])) $$,
  'P0001', 'invalid_input', 'unknown visibility rejected');
select throws_ok($$ select public.rpc_save_project_draft(null, tests.project_json() || jsonb_build_object('skill_ids',
                      (select jsonb_agg(id) from (select id from public.skills limit 11) s)), tests.ms(array[500000, 500000])) $$,
  'P0001', 'invalid_input', 'more than 10 skills rejected');
select throws_ok($$ select public.rpc_save_project_draft(null, tests.project_json() || jsonb_build_object('skill_ids',
                      jsonb_build_array(gen_random_uuid())), tests.ms(array[500000, 500000])) $$,
  'P0001', 'invalid_input', 'unknown skill rejected');
select throws_ok($$ select public.rpc_save_project_draft(null, tests.project_json(), tests.ms(array[9999, 500000])) $$,
  'P0001', 'invalid_input', 'milestone amount below 10000 paise rejected');
select throws_ok($$ select public.rpc_save_project_draft(null, tests.project_json(), tests.ms(array[10000000001, 500000])) $$,
  'P0001', 'invalid_input', 'milestone amount above 1e10 paise rejected');
select throws_ok($$ select public.rpc_save_project_draft(null, tests.project_json(),
                      jsonb_set(tests.ms(array[500000, 500000]), '{0,amount_paise}', '1000.5')) $$,
  'P0001', 'invalid_input', 'fractional amount rejected');
select throws_ok($$ select public.rpc_save_project_draft(null, tests.project_json(),
                      jsonb_set(tests.ms(array[500000, 500000]), '{0,due_date}', '"2026-02-30"')) $$,
  'P0001', 'invalid_input', 'impossible date rejected');
select throws_ok($$ select public.rpc_save_project_draft(null, tests.project_json(),
                      jsonb_set(tests.ms(array[500000, 500000]), '{1,deliverable}', '"short"')) $$,
  'P0001', 'invalid_input', 'deliverable shorter than 10 rejected');
select throws_ok($$ select public.rpc_save_project_draft(null, tests.project_json(),
                      jsonb_set(tests.ms(array[500000, 500000]), '{1,title}', '"ab"')) $$,
  'P0001', 'invalid_input', 'milestone title shorter than 3 rejected');
select throws_ok($$ select public.rpc_save_project_draft(null, tests.project_json(),
                      tests.ms((select array_agg(50000::bigint) from generate_series(1, 21)))) $$,
  'P0001', 'invalid_input', 'more than 20 milestones rejected');

-- Publish ---------------------------------------------------------------------------------------
select tests.new_project('one', tests.id('c1'), array[1000000], p_publish => false);
select throws_ok($$ select public.rpc_publish_project(tests.id('one')) $$,
  'P0001', 'too_few_milestones', 'publish needs at least 2 milestones');
select tests.new_project('cap', tests.id('c1'), array[700000, 300000], p_publish => false);
select throws_ok($$ select public.rpc_publish_project(tests.id('cap')) $$,
  'P0001', 'milestone_cap_exceeded', 'publish enforces the 60% cap for 2 milestones');
select tests.new_project('cap4', tests.id('c1'), array[350000, 250000, 200000, 200000], p_publish => false);
select throws_ok($$ select public.rpc_publish_project(tests.id('cap4')) $$,
  'P0001', 'milestone_cap_exceeded', 'publish enforces the 30% cap for 4 milestones');

select tests.authenticate_as(tests.id('c1'));
select tests.set('past', public.rpc_save_project_draft(null, tests.project_json(), tests.ms(array[500000, 500000], -5))::text);
select throws_ok($$ select public.rpc_publish_project(tests.id('past')) $$,
  'P0001', 'milestone_dates_invalid', 'publish rejects past due dates');
select tests.set('order', public.rpc_save_project_draft(null, tests.project_json(),
  jsonb_set(tests.ms(array[500000, 500000]), '{0,due_date}', to_jsonb(to_char(tests.today() + 40, 'YYYY-MM-DD'))))::text);
select throws_ok($$ select public.rpc_publish_project(tests.id('order')) $$,
  'P0001', 'milestone_dates_invalid', 'publish rejects decreasing due dates');

select tests.authenticate_as(tests.id('c2'));
select throws_ok($$ select public.rpc_publish_project(tests.id('d')) $$,
  'P0001', 'not_project_client', 'another client cannot publish');
select throws_ok($$ select public.rpc_publish_project(gen_random_uuid()) $$,
  'P0001', 'project_not_found', 'publish unknown project');

select tests.authenticate_as(tests.id('c1'));
select lives_ok($$ select public.rpc_publish_project(tests.id('d')) $$, 'publish a valid draft (40/30/30)');
select results_eq($$ select status::text, published_at is not null from public.projects where id = tests.id('d') $$,
  $$ values ('open'::text, true) $$, 'published project is open with published_at');
select throws_ok($$ select public.rpc_publish_project(tests.id('d')) $$,
  'P0001', 'invalid_status', 'cannot publish twice');
select throws_ok($$ select public.rpc_save_project_draft(tests.id('d'), tests.project_json(), tests.ms(array[500000, 500000])) $$,
  'P0001', 'invalid_status', 'cannot edit a published project as a draft');

-- Cancel ------------------------------------------------------------------------------------------
select tests.authenticate_as(tests.id('f1'));
select tests.set('prop', public.rpc_submit_proposal(tests.id('d'),
  'I have built many shop websites and can deliver this quickly.', 1000000, 30, null)::text);
select tests.authenticate_as(tests.id('c1'));
select tests.set('inv', (select invite_id::text from public.rpc_create_invite(tests.id('d'), null, null)));

select tests.authenticate_as(tests.id('c2'));
select throws_ok($$ select public.rpc_cancel_project(tests.id('d'), 'nope') $$,
  'P0001', 'not_project_client', 'another client cannot cancel');

select tests.authenticate_as(tests.id('c1'));
select lives_ok($$ select public.rpc_cancel_project(tests.id('d'), 'Budget changed') $$, 'client cancels an open project');
select results_eq($$ select status::text, cancelled_at is not null, cancel_reason from public.projects where id = tests.id('d') $$,
  $$ values ('cancelled'::text, true, 'Budget changed'::text) $$, 'project cancelled with reason');
select results_eq($$ select status::text, rejection_reason from public.proposals where id = tests.id('prop') $$,
  $$ values ('rejected'::text, 'project_cancelled'::text) $$, 'cancel rejects pending proposals');
select is((select status::text from public.project_invites where id = tests.id('inv')), 'revoked',
  'cancel revokes pending invites');
select throws_ok($$ select public.rpc_cancel_project(tests.id('d'), null) $$,
  'P0001', 'invalid_status', 'cannot cancel twice');
select lives_ok($$ select public.rpc_cancel_project(tests.id('one'), null) $$, 'client cancels a draft');

-- Audit -------------------------------------------------------------------------------------------
select tests.as_postgres();
select is((select array_agg(action order by action) from public.audit_log where entity_id = tests.id('d')),
  array['project.cancelled', 'project.created', 'project.draft_saved', 'project.published'],
  'every project RPC writes an audit row');

select * from finish();
rollback;
