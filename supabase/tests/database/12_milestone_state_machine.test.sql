begin;
-- pgTAP is test-only: created inside this rolled-back transaction, never by migrations.
create extension if not exists pgtap with schema extensions;
select plan(46);
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

-- Milestone state machine: trigger guards, agreement immutability, Phase 2 RPCs and
-- a full funded -> in_progress -> submitted -> revision -> ... -> approved walk.

select tests.setup_user('c1', '919810000041', array['client']::public.app_role[]);
select tests.setup_user('f1', '919810000042', array['freelancer']::public.app_role[]);
select tests.setup_user('f2', '919810000043', array['freelancer']::public.app_role[]);

-- revision_limit 1 so the limit is reached within the walk.
select tests.new_project('p', tests.id('c1'), array[400000, 300000, 300000], p_revision_limit => 1);
select tests.award(tests.id('p'), tests.id('c1'), tests.id('f1'));
select tests.set('m1', tests.milestone(tests.id('p'), 1)::text);
select tests.set('m2', tests.milestone(tests.id('p'), 2)::text);

-- Guards apply to the table owner too --------------------------------------------------------------
select tests.as_postgres();
select throws_ok($$ update public.milestones set status = 'funded' where id = tests.id('m1') $$,
  '42501', 'milestone_status_locked', 'direct status UPDATE without app.via_rpc is blocked (table owner)');
select set_config('app.via_rpc', 'on', true);
select throws_ok($$ update public.milestones set status = 'approved' where id = tests.id('m1') $$,
  'P0001', 'invalid_status', 'illegal edge draft -> approved is blocked even with app.via_rpc on');
select throws_ok($$ update public.milestones set status = 'in_progress' where id = tests.id('m1') $$,
  'P0001', 'invalid_status', 'illegal edge draft -> in_progress is blocked even with app.via_rpc on');
select set_config('app.via_rpc', 'off', true);
select throws_ok($$ select public._transition_milestone(tests.id('m1'), 'funded', 'client', tests.id('c1'), null) $$,
  'P0001', 'invalid_status', 'legal edge with the wrong actor kind is rejected');

select throws_ok($$ update public.milestones set amount_paise = 500000 where id = tests.id('m1') $$,
  'P0001', 'invalid_status', 'amount is immutable once the project is awarded');
select throws_ok($$ update public.milestones set due_date = due_date + 1 where id = tests.id('m1') $$,
  'P0001', 'invalid_status', 'due date is immutable once the project is awarded');
select throws_ok($$ update public.milestones set position = 9 where id = tests.id('m1') $$,
  'P0001', 'invalid_status', 'position is immutable once the project is awarded');
select throws_ok($$ delete from public.milestones where id = tests.id('m2') $$,
  'P0001', 'invalid_status', 'milestones cannot be deleted once the project is awarded');
select throws_ok($$ insert into public.milestones (project_id, position, title, amount_paise, due_date)
                    values (tests.id('p'), 4, 'Extra work', 100000, tests.today() + 60) $$,
  'P0001', 'invalid_status', 'milestones cannot be added once the project is awarded');
select is(current_setting('app.via_rpc', true), 'off', 'flag is off outside _transition_milestone');

-- Funding (Phase 4 simulated as postgres) ------------------------------------------------------------
select tests.fund(tests.id('m1'));
select is((select status::text from public.milestones where id = tests.id('m1')), 'funded', 'milestone funded by system');
select is(current_setting('app.via_rpc', true), 'off', '_transition_milestone resets the flag');
select is((select status::text from public.projects where id = tests.id('p')), 'in_progress',
  'first funded milestone moves the project to in_progress');
select tests.authenticate_as(tests.id('c1'));
select throws_ok($$ select public.rpc_cancel_project(tests.id('p'), 'changed my mind') $$,
  'P0001', 'invalid_status', 'cancel is blocked once a milestone is funded');

-- Authorisation ---------------------------------------------------------------------------------------
select tests.authenticate_as(tests.id('f2'));
select throws_ok($$ select public.rpc_start_milestone(tests.id('m1')) $$,
  'P0001', 'milestone_not_found', 'non-member cannot start a milestone');
select throws_ok($$ select public.rpc_approve_milestone(tests.id('m1')) $$,
  'P0001', 'milestone_not_found', 'non-member cannot approve a milestone');
select tests.authenticate_as(tests.id('c1'));
select throws_ok($$ select public.rpc_start_milestone(tests.id('m1')) $$,
  'P0001', 'not_assigned_freelancer', 'client cannot start a milestone');
select throws_ok($$ select public.rpc_submit_milestone(tests.id('m1'), 'done', null, null) $$,
  'P0001', 'not_assigned_freelancer', 'client cannot submit a milestone');
select tests.authenticate_as(tests.id('f1'));
select throws_ok($$ select public.rpc_start_milestone(tests.id('m2')) $$,
  'P0001', 'invalid_status', 'cannot start an unfunded milestone');
select throws_ok($$ select public.rpc_submit_milestone(tests.id('m1'), 'done', null, null) $$,
  'P0001', 'invalid_status', 'cannot submit before starting');
select throws_ok($$ select public.rpc_approve_milestone(tests.id('m1')) $$,
  'P0001', 'not_project_client', 'freelancer cannot approve');
select throws_ok($$ select public.rpc_request_revision(tests.id('m1'), 'x') $$,
  'P0001', 'not_project_client', 'freelancer cannot request a revision');

-- Full walk -----------------------------------------------------------------------------------------------
select lives_ok($$ select public.rpc_start_milestone(tests.id('m1')) $$, 'freelancer starts the funded milestone');
select results_eq($$ select status::text, started_at is not null from public.milestones where id = tests.id('m1') $$,
  $$ values ('in_progress'::text, true) $$, 'milestone in_progress with started_at');

select throws_ok($$ select public.rpc_submit_milestone(tests.id('m1'), null, null, null) $$,
  'P0001', 'invalid_input', 'empty submission rejected');
select throws_ok($$ select public.rpc_submit_milestone(tests.id('m1'), null, array['http://insecure.example.com'], null) $$,
  'P0001', 'invalid_input', 'non-https link rejected');
select throws_ok($$ select public.rpc_submit_milestone(tests.id('m1'), null, null,
                      array[tests.get('p') || '/' || tests.get('m1') || '/missing.pdf']) $$,
  'P0001', 'invalid_input', 'attachment must be an uploaded object');
select tests.as_postgres();
insert into storage.objects (bucket_id, name, owner_id) values
  ('project-files', tests.get('p') || '/' || tests.get('m1') || '/design-v1.pdf', tests.get('f1')),
  ('project-files', tests.get('p') || '/' || tests.get('m2') || '/other.pdf', tests.get('f1'));
select tests.authenticate_as(tests.id('f1'));
select throws_ok($$ select public.rpc_submit_milestone(tests.id('m1'), null, null,
                      array[tests.get('p') || '/' || tests.get('m2') || '/other.pdf']) $$,
  'P0001', 'invalid_input', 'attachment must be under this milestone''s folder');

select tests.set('sub1', public.rpc_submit_milestone(tests.id('m1'), '  First version is ready  ',
  array['https://example.com/v1'], array[tests.get('p') || '/' || tests.get('m1') || '/design-v1.pdf'])::text);
select results_eq($$ select milestone_id, submitted_by, note, links, attachment_paths from public.submissions where id = tests.id('sub1') $$,
  $$ values (tests.id('m1'), tests.id('f1'), 'First version is ready'::text, array['https://example.com/v1'],
             array[tests.get('p') || '/' || tests.get('m1') || '/design-v1.pdf']) $$,
  'submission stored');
select results_eq($$ select status::text, submitted_at is not null from public.milestones where id = tests.id('m1') $$,
  $$ values ('submitted'::text, true) $$, 'milestone submitted');

select tests.authenticate_as(tests.id('c1'));
select lives_ok($$ select public.rpc_request_revision(tests.id('m1'), 'Please fix the header colours') $$,
  'client requests a revision');
select results_eq($$ select status::text, revision_count from public.milestones where id = tests.id('m1') $$,
  $$ values ('revision_requested'::text, 1) $$, 'revision requested, revision_count = 1');
select throws_ok($$ select public.rpc_approve_milestone(tests.id('m1')) $$,
  'P0001', 'invalid_status', 'cannot approve while revision is requested');

select tests.authenticate_as(tests.id('f1'));
select lives_ok($$ select public.rpc_start_milestone(tests.id('m1')) $$, 'freelancer resumes after the revision request');
select isnt(public.rpc_submit_milestone(tests.id('m1'), 'Header fixed', null, null), null, 'freelancer resubmits');

select tests.authenticate_as(tests.id('c1'));
select throws_ok($$ select public.rpc_request_revision(tests.id('m1'), 'One more change') $$,
  'P0001', 'revision_limit_reached', 'revision limit (1) reached');
select lives_ok($$ select public.rpc_approve_milestone(tests.id('m1')) $$, 'client approves');
select results_eq($$ select status::text, approved_at is not null, released_at from public.milestones where id = tests.id('m1') $$,
  $$ values ('approved'::text, true, null::timestamptz) $$, 'milestone approved (release is Phase 4)');
select throws_ok($$ select public.rpc_approve_milestone(tests.id('m1')) $$,
  'P0001', 'invalid_status', 'cannot approve twice');

select results_eq(
  $$ select from_status::text, to_status::text, actor_kind::text, actor_id
       from public.milestone_status_history where milestone_id = tests.id('m1') order by created_at $$,
  $$ values ('draft'::text, 'funded'::text, 'system'::text, null::uuid),
            ('funded', 'in_progress', 'freelancer', tests.id('f1')),
            ('in_progress', 'submitted', 'freelancer', tests.id('f1')),
            ('submitted', 'revision_requested', 'client', tests.id('c1')),
            ('revision_requested', 'in_progress', 'freelancer', tests.id('f1')),
            ('in_progress', 'submitted', 'freelancer', tests.id('f1')),
            ('submitted', 'approved', 'client', tests.id('c1')) $$,
  'every transition is recorded in milestone_status_history');
select is((select note from public.milestone_status_history
            where milestone_id = tests.id('m1') and to_status = 'revision_requested'),
  'Please fix the header colours', 'revision note is kept in history');
select is((select count(*)::int from public.submissions where milestone_id = tests.id('m1')), 2, 'two submissions recorded');

select tests.as_postgres();
-- (audit_log.created_at is now(), identical within this transaction: compare as a bag)
select bag_eq($$ select action from public.audit_log where entity_type = 'milestone' and entity_id = tests.id('m1') $$,
  $$ values ('milestone.funded'), ('milestone.in_progress'), ('milestone.submitted'), ('milestone.revision_requested'),
            ('milestone.in_progress'), ('milestone.submitted'), ('milestone.approved') $$,
  'every transition writes an audit row');
select lives_ok($$ select public._transition_milestone(tests.id('m1'), 'released', 'system', null, 'ledger release') $$,
  'system releases an approved milestone (Phase 4 path)');
select throws_ok($$ select public._transition_milestone(tests.id('m1'), 'in_progress', 'freelancer', null, null) $$,
  'P0001', 'invalid_status', 'released is terminal for Phase 2 edges');
select throws_ok($$ update public.milestones set title = 'Renamed' where id = tests.id('m1') $$,
  'P0001', 'invalid_status', 'terms of a non-draft milestone are immutable');

select * from finish();
rollback;
