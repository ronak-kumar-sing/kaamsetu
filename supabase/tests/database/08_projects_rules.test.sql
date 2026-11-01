begin;
-- pgTAP is test-only: created inside this rolled-back transaction, never by migrations.
create extension if not exists pgtap with schema extensions;
select plan(35);
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

-- Milestone plan rules, total_paise trigger, privileges on the projects domain.

-- Config + cap ---------------------------------------------------------------------
select is((select value #>> '{}' from public.app_config where key = 'milestone_cap_slack_pct'), '120',
  'app_config.milestone_cap_slack_pct = 120');
select is(array[public.milestone_cap_pct(0), public.milestone_cap_pct(1), public.milestone_cap_pct(2),
                public.milestone_cap_pct(3), public.milestone_cap_pct(4), public.milestone_cap_pct(5),
                public.milestone_cap_pct(20)],
  array[100, 100, 60, 40, 30, 30, 30], 'cap_pct: 1:100, 2:60, 3:40, 4+:30');

-- validate_milestone_plan: cap ----------------------------------------------------------
select is(public.validate_milestone_plan(array[600000, 400000]::bigint[],
            array[tests.today() + 5, tests.today() + 6]),
  null, '2 milestones at exactly 60/40 pass');
select is(public.validate_milestone_plan(array[600100, 399900]::bigint[],
            array[tests.today() + 5, tests.today() + 6]),
  'milestone_cap_exceeded', '2 milestones at 60.01/39.99 fail');
select is(public.validate_milestone_plan(array[400000, 300000, 300000]::bigint[],
            array[tests.today() + 5, tests.today() + 6, tests.today() + 7]),
  null, '3 milestones at exactly 40/30/30 pass');
select is(public.validate_milestone_plan(array[400100, 300000, 299900]::bigint[],
            array[tests.today() + 5, tests.today() + 6, tests.today() + 7]),
  'milestone_cap_exceeded', '3 milestones at 40.01% fail');
select is(public.validate_milestone_plan(array[300000, 300000, 200000, 200000]::bigint[],
            array[tests.today() + 5, tests.today() + 6, tests.today() + 7, tests.today() + 8]),
  null, '4 milestones at exactly 30/30/20/20 pass');
select is(public.validate_milestone_plan(array[300100, 299900, 200000, 200000]::bigint[],
            array[tests.today() + 5, tests.today() + 6, tests.today() + 7, tests.today() + 8]),
  'milestone_cap_exceeded', '4 milestones at 30.01% fail');
select is(public.validate_milestone_plan(array[310000, 230000, 230000, 230000]::bigint[],
            array[tests.today() + 5, tests.today() + 6, tests.today() + 7, tests.today() + 8]),
  'milestone_cap_exceeded', '4 milestones at 31% fail (not the 3-milestone 40% cap)');
select is(public.validate_milestone_plan(array[300000, 300000, 200000, 100000, 100000]::bigint[],
            array[tests.today() + 5, tests.today() + 6, tests.today() + 7, tests.today() + 8, tests.today() + 9]),
  null, '5 milestones at 30% max pass');
select is(public.validate_milestone_plan(
            (select array_agg(50000::bigint) from generate_series(1, 20)),
            (select array_agg(tests.today() + g) from generate_series(1, 20) g)),
  null, '20 equal milestones pass');

-- validate_milestone_plan: count / dates / shape ------------------------------------------
select is(public.validate_milestone_plan(array[1000000]::bigint[], array[tests.today() + 5]),
  'too_few_milestones', 'one milestone is too few');
select is(public.validate_milestone_plan('{}'::bigint[], '{}'::date[]),
  'too_few_milestones', 'no milestones is too few');
select is(public.validate_milestone_plan(array[500000, 500000]::bigint[], array[tests.today(), tests.today() + 6]),
  'milestone_dates_invalid', 'due date today (Asia/Kolkata) is rejected');
select is(public.validate_milestone_plan(array[500000, 500000]::bigint[], array[tests.today() - 3, tests.today() + 6]),
  'milestone_dates_invalid', 'past due date is rejected');
select is(public.validate_milestone_plan(array[500000, 500000]::bigint[], array[tests.today() + 9, tests.today() + 6]),
  'milestone_dates_invalid', 'decreasing due dates are rejected');
select is(public.validate_milestone_plan(array[500000, 500000]::bigint[], array[tests.today() + 6, tests.today() + 6]),
  null, 'equal consecutive due dates are allowed');
select is(public.validate_milestone_plan(array[500000, 500000]::bigint[], array[tests.today() + 6, null]),
  'milestone_dates_invalid', 'null due date is rejected');
select is(public.validate_milestone_plan(array[500000, 500000]::bigint[], array[tests.today() + 6]),
  'invalid_input', 'mismatched array lengths are rejected');

-- total_paise trigger ---------------------------------------------------------------------
select tests.setup_user('c1', '919810000001', array['client']::public.app_role[]);
with x as (
  insert into public.projects (client_id, title, description, category)
  values (tests.id('c1'), 'Direct insert project', 'A project inserted directly by the table owner.', 'design')
  returning id)
select tests.set('p', id::text) from x;

insert into public.milestones (project_id, position, title, amount_paise, due_date)
select tests.id('p'), g, 'Milestone ' || g, g * 100000, tests.today() + g from generate_series(1, 3) g;
select is((select total_paise from public.projects where id = tests.id('p')), 600000::bigint,
  'total_paise = sum after a multi-row insert');

update public.milestones set amount_paise = amount_paise + 50000 where project_id = tests.id('p');
select is((select total_paise from public.projects where id = tests.id('p')), 750000::bigint,
  'total_paise follows a multi-row update');

delete from public.milestones where project_id = tests.id('p') and position = 3;
select is((select total_paise from public.projects where id = tests.id('p')), 400000::bigint,
  'total_paise follows a delete');

delete from public.milestones where project_id = tests.id('p');
select is((select total_paise from public.projects where id = tests.id('p')), 0::bigint,
  'total_paise is 0 with no milestones');

select throws_ok($$ insert into public.milestones (project_id, position, title, amount_paise, due_date, status)
                    values (tests.id('p'), 1, 'Sneaky', 100000, tests.today() + 3, 'funded') $$,
  'P0001', 'invalid_status', 'milestones cannot be inserted past draft');

-- State machine table ------------------------------------------------------------------------
select is((select count(*)::int from public.milestone_transitions), 24,
  'milestone_transitions holds all 24 contract edges');
select ok(exists (select 1 from public.milestone_transitions
                   where from_status = 'submitted' and to_status = 'approved' and actor_kind = 'system'),
  'auto-approve edge (Phase 4) is seeded');
select ok(not exists (select 1 from public.milestone_transitions
                       where from_status = 'draft' and to_status = 'in_progress'),
  'no draft -> in_progress shortcut');

-- Privileges -----------------------------------------------------------------------------------
select ok(not has_function_privilege('authenticated',
  'public._transition_milestone(uuid, public.milestone_status, public.milestone_actor_kind, uuid, text)', 'execute'),
  'authenticated cannot execute _transition_milestone');
select ok(not has_function_privilege('anon',
  'public._transition_milestone(uuid, public.milestone_status, public.milestone_actor_kind, uuid, text)', 'execute'),
  'anon cannot execute _transition_milestone');
select is(
  (select coalesce(array_agg(distinct table_name || ':' || privilege_type order by table_name || ':' || privilege_type), '{}')
     from information_schema.role_table_grants
    where grantee = 'authenticated' and table_schema = 'public'
      and table_name in ('projects', 'project_skills', 'project_members', 'milestones',
                         'milestone_status_history', 'submissions', 'proposals', 'project_invites',
                         'milestone_transitions')
      and privilege_type <> 'SELECT'),
  '{}'::text[], 'authenticated has no write privileges on projects-domain tables');
select ok(not has_column_privilege('authenticated', 'public.project_invites', 'token', 'select'),
  'project_invites.token is not selectable by authenticated');
select is(
  (select coalesce(array_agg(p.proname::text order by p.proname), '{}')
     from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname like 'rpc\_%'
      and p.proname in ('rpc_save_project_draft', 'rpc_publish_project', 'rpc_cancel_project',
        'rpc_submit_proposal', 'rpc_withdraw_proposal', 'rpc_reject_proposal', 'rpc_accept_proposal',
        'rpc_create_invite', 'rpc_resolve_invite', 'rpc_respond_invite', 'rpc_revoke_invite',
        'rpc_start_milestone', 'rpc_submit_milestone', 'rpc_request_revision', 'rpc_approve_milestone',
        'rpc_search_projects', 'rpc_search_freelancers')
      and p.prosecdef),
  array['rpc_accept_proposal', 'rpc_approve_milestone', 'rpc_cancel_project', 'rpc_create_invite',
        'rpc_publish_project', 'rpc_reject_proposal', 'rpc_request_revision', 'rpc_resolve_invite',
        'rpc_respond_invite', 'rpc_revoke_invite', 'rpc_save_project_draft', 'rpc_search_freelancers',
        'rpc_search_projects', 'rpc_start_milestone', 'rpc_submit_milestone', 'rpc_submit_proposal',
        'rpc_withdraw_proposal'],
  'all 17 Phase 2 RPCs exist and are security definer');

select tests.authenticate_as(tests.id('c1'));
select throws_ok($$ select public._transition_milestone(gen_random_uuid(), 'funded', 'system', null, null) $$,
  '42501', null, 'authenticated calling _transition_milestone is denied');
select throws_ok($$ select public._parse_milestone_plan('[]'::jsonb, true) $$,
  '42501', null, 'internal parsers are not callable from the API');
select is(public.milestone_cap_pct(3), 40, 'authenticated can call milestone_cap_pct');

select * from finish();
rollback;
