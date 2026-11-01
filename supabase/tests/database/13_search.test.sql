begin;
-- pgTAP is test-only: created inside this rolled-back transaction, never by migrations.
create extension if not exists pgtap with schema extensions;
select plan(25);
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

-- rpc_search_projects / rpc_search_freelancers: visibility, filters, keyset pagination.

select tests.setup_user('c1', '919810000051', array['client']::public.app_role[], 'Bakery Owner');
select tests.setup_user('f1', '919810000052', array['freelancer']::public.app_role[], 'Ravi Kumar', 'Expert logo designer');
select tests.setup_user('f2', '919810000053', array['freelancer']::public.app_role[], 'Flagged Person', 'Logo designer too');
select tests.setup_user('f3', '919810000054', array['freelancer']::public.app_role[], 'Neha Singh', 'React Native developer');
select tests.setup_user('cx', '919810000055', array['client']::public.app_role[], 'Client Only', 'Logo buyer');
select tests.set('logo', (select id::text from public.skills where slug = 'logo-design'));
select tests.set('web', (select id::text from public.skills where slug = 'web-development'));

select tests.as_postgres();
update public.profiles set is_flagged = true where id = tests.id('f2');
insert into public.profile_skills (profile_id, skill_id) values (tests.id('f1'), tests.id('logo')), (tests.id('f3'), tests.id('web'));
select tests.set('f4', tests.create_user('919810000056')::text); -- freelancer role but not onboarded
insert into public.user_roles (user_id, role) values (tests.id('f4'), 'freelancer');

-- Projects: O1 (logo, bakery), O2 (100% literal in title, higher budget, Delhi),
-- I (invite-only, f1 invited), D (draft), X (cancelled).
select tests.authenticate_as(tests.id('c1'));
select tests.set('O1', public.rpc_save_project_draft(null,
  tests.project_json('Logo design for my bakery') || jsonb_build_object('skill_ids', jsonb_build_array(tests.get('logo')), 'category', 'design'),
  tests.ms(array[500000, 500000]))::text);
select public.rpc_publish_project(tests.id('O1'));
select tests.set('O2', public.rpc_save_project_draft(null,
  tests.project_json('Mobile app built 100% in React Native') || jsonb_build_object('city', 'Delhi', 'skill_ids', jsonb_build_array(tests.get('web'))),
  tests.ms(array[3000000, 3000000]))::text);
select public.rpc_publish_project(tests.id('O2'));
select tests.new_project('I', tests.id('c1'), array[500000, 500000], 'invite_only', p_title => 'Secret logo refresh');
select tests.set('inv', (select invite_id::text from public.rpc_create_invite(tests.id('I'), tests.id('f1'), null)));
select tests.new_project('D', tests.id('c1'), array[500000, 500000], p_publish => false, p_title => 'Draft logo project');
select tests.new_project('X', tests.id('c1'), array[500000, 500000], p_title => 'Cancelled logo project');
select public.rpc_cancel_project(tests.id('X'), null);

-- Visibility ----------------------------------------------------------------------------------------
select tests.authenticate_as(tests.id('f3'));
select set_eq($$ select id from public.rpc_search_projects() $$, $$ values (tests.id('O1')), (tests.id('O2')) $$,
  'non-invitee finds only open public projects (no draft / invite-only / cancelled)');
select tests.authenticate_as(tests.id('f1'));
select set_eq($$ select id from public.rpc_search_projects() $$,
  $$ values (tests.id('O1')), (tests.id('O2')), (tests.id('I')) $$, 'invitee also finds the invite-only project');
select results_eq($$ select client_name, client_city, milestone_count, skill_ids, total_paise
                       from public.rpc_search_projects(p_query => 'bakery') $$,
  $$ values ('Bakery Owner'::text, 'Jaipur'::text, 2, array[tests.id('logo')], 1000000::bigint) $$,
  'rows carry client_name, client_city, milestone_count, skill_ids');

-- Filters ---------------------------------------------------------------------------------------------
select set_eq($$ select id from public.rpc_search_projects(p_query => 'LOGO') $$,
  $$ values (tests.id('O1')), (tests.id('I')) $$, 'query is a case-insensitive substring match on title');
select set_eq($$ select id from public.rpc_search_projects(p_query => 'catalogue') $$,
  $$ values (tests.id('O1')), (tests.id('O2')), (tests.id('I')) $$, 'query also matches the description');
select set_eq($$ select id from public.rpc_search_projects(p_query => '100%') $$,
  $$ values (tests.id('O2')) $$, 'LIKE wildcards in the query are escaped');
select is_empty($$ select id from public.rpc_search_projects(p_query => '_') $$, 'a bare _ is literal, not a wildcard');
select set_eq($$ select id from public.rpc_search_projects(p_skill_ids => array[tests.id('web'), gen_random_uuid()]) $$,
  $$ values (tests.id('O2')) $$, 'skill filter matches any of the skills');
select set_eq($$ select id from public.rpc_search_projects(p_category => 'design') $$,
  $$ values (tests.id('O1')) $$, 'category filter');
select set_eq($$ select id from public.rpc_search_projects(p_city => ' delhi ') $$,
  $$ values (tests.id('O2')) $$, 'city filter is case-insensitive');
select set_eq($$ select id from public.rpc_search_projects(p_min_paise => 2000000) $$,
  $$ values (tests.id('O2')) $$, 'min budget filter');
select set_eq($$ select id from public.rpc_search_projects(p_max_paise => 1000000) $$,
  $$ values (tests.id('O1')), (tests.id('I')) $$, 'max budget filter');
select is_empty($$ select id from public.rpc_search_projects(p_takeover_only => true) $$, 'takeover filter');

-- Keyset pagination ------------------------------------------------------------------------------------
select is((select array_agg(id) from public.rpc_search_projects(p_limit => 2)),
  array[tests.id('I'), tests.id('O2')], 'newest first, limited');
select is((select array_agg(id) from public.rpc_search_projects(p_limit => 2,
            p_cursor => (select published_at from public.projects where id = tests.id('O2')))),
  array[tests.id('O1')], 'next page via published_at cursor');
select is((select count(*)::int from public.rpc_search_projects(p_limit => 0)), 1, 'limit is clamped to >= 1');
select is((select count(*)::int from public.rpc_search_projects(p_limit => 100000)), 3, 'large limits are clamped (<= 50)');

-- Freelancers ---------------------------------------------------------------------------------------------
select set_eq($$ select id from public.rpc_search_freelancers() $$,
  $$ values (tests.id('f1')), (tests.id('f3')) $$,
  'only onboarded, unflagged users with the freelancer role');
select set_eq($$ select id from public.rpc_search_freelancers(p_query => 'logo') $$,
  $$ values (tests.id('f1')) $$, 'query matches headline (flagged / client-only excluded)');
select set_eq($$ select id from public.rpc_search_freelancers(p_query => 'neha') $$,
  $$ values (tests.id('f3')) $$, 'query matches full_name');
select set_eq($$ select id from public.rpc_search_freelancers(p_skill_ids => array[tests.id('web')]) $$,
  $$ values (tests.id('f3')) $$, 'skill filter');
select results_eq($$ select full_name, headline, skill_ids from public.rpc_search_freelancers(p_query => 'Ravi') $$,
  $$ values ('Ravi Kumar'::text, 'Expert logo designer'::text, array[tests.id('logo')]) $$, 'public fields + skill_ids');
select is_empty($$ select id from public.rpc_search_freelancers(p_city => 'Mumbai') $$, 'city filter');
select is((select count(*)::int from public.rpc_search_freelancers(p_limit => 1)), 1, 'freelancer search is limited');
select ok(not ((select proargnames from pg_proc where oid = 'public.rpc_search_freelancers'::regproc)
             && array['phone', 'email', 'is_flagged']),
  'freelancer search never returns private columns');

select * from finish();
rollback;
