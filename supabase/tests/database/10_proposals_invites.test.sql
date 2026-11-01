begin;
-- pgTAP is test-only: created inside this rolled-back transaction, never by migrations.
create extension if not exists pgtap with schema extensions;
select plan(70);
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

-- Proposals (submit / withdraw / reject / accept) and invites (create / resolve /
-- respond / revoke / expiry).

select tests.setup_user('c1', '919810000021', array['client', 'freelancer']::public.app_role[], 'Asha Client');
select tests.setup_user('c2', '919810000022', array['client']::public.app_role[]);
select tests.setup_user('f1', '919810000023', array['freelancer']::public.app_role[]);
select tests.setup_user('f2', '919810000024', array['freelancer']::public.app_role[]);
select tests.setup_user('f3', '919810000025', array['freelancer']::public.app_role[]);
select tests.setup_user('f4', '919810000026', array['freelancer']::public.app_role[]);

select tests.new_project('p', tests.id('c1'), array[600000, 400000]);
select tests.new_project('draft', tests.id('c1'), array[600000, 400000], p_publish => false);
select tests.set('cover', 'I have built many shop websites and can deliver this quickly.');

-- Submit: rejections ------------------------------------------------------------------------------
select tests.authenticate_as(tests.id('c2'));
select throws_ok($$ select public.rpc_submit_proposal(tests.id('p'), tests.get('cover'), 1000000, 30, null) $$,
  'P0001', 'role_required', 'client-only user cannot propose');
select tests.authenticate_as(tests.id('c1'));
select throws_ok($$ select public.rpc_submit_proposal(tests.id('p'), tests.get('cover'), 1000000, 30, null) $$,
  'P0001', 'cannot_propose_own_project', 'client cannot propose on own project (even with freelancer role)');
select tests.authenticate_as(tests.id('f1'));
select throws_ok($$ select public.rpc_submit_proposal(tests.id('draft'), tests.get('cover'), 1000000, 30, null) $$,
  'P0001', 'project_not_found', 'cannot propose on a draft');
select throws_ok($$ select public.rpc_submit_proposal(gen_random_uuid(), tests.get('cover'), 1000000, 30, null) $$,
  'P0001', 'project_not_found', 'cannot propose on an unknown project');
select throws_ok($$ select public.rpc_submit_proposal(tests.id('p'), 'Too short', 1000000, 30, null) $$,
  'P0001', 'invalid_input', 'cover note shorter than 30 rejected');
select throws_ok($$ select public.rpc_submit_proposal(tests.id('p'), tests.get('cover'), 9999, 30, null) $$,
  'P0001', 'invalid_input', 'proposed total below 10000 paise rejected');
select throws_ok($$ select public.rpc_submit_proposal(tests.id('p'), tests.get('cover'), 1000000, 366, null) $$,
  'P0001', 'invalid_input', 'timeline above 365 days rejected');
select throws_ok($$ select public.rpc_submit_proposal(tests.id('p'), tests.get('cover'), 1000000, 30,
                      tests.edits(array[700000, 300000])) $$,
  'P0001', 'milestone_cap_exceeded', 'milestone edits must respect the cap');
select throws_ok($$ select public.rpc_submit_proposal(tests.id('p'), tests.get('cover'), 1000000, 30,
                      tests.edits(array[500000, 500000], -10)) $$,
  'P0001', 'milestone_dates_invalid', 'milestone edits must have future dates');
select throws_ok($$ select public.rpc_submit_proposal(tests.id('p'), tests.get('cover'), 1000000, 30,
                      tests.edits(array[1000000])) $$,
  'P0001', 'too_few_milestones', 'milestone edits need at least 2 milestones');
select throws_ok($$ select public.rpc_submit_proposal(tests.id('p'), tests.get('cover'), 1000000, 30,
                      '{"title": "not an array"}'::jsonb) $$,
  'P0001', 'invalid_input', 'milestone edits must be an array');

-- Submit: happy paths --------------------------------------------------------------------------------
select tests.set('prop1', public.rpc_submit_proposal(tests.id('p'), '  ' || tests.get('cover') || '  ', 1100000, 45,
  tests.edits(array[400000, 300000, 400000]))::text);
select results_eq(
  $$ select status::text, freelancer_id, cover_note, proposed_total_paise, timeline_days,
            jsonb_array_length(milestone_edits), milestone_edits -> 0 ->> 'title'
       from public.proposals where id = tests.id('prop1') $$,
  $$ values ('pending'::text, tests.id('f1'), tests.get('cover'), 1100000::bigint, 45, 3, 'Edited milestone 1'::text) $$,
  'proposal stored with normalised edits');
select throws_ok($$ select public.rpc_submit_proposal(tests.id('p'), tests.get('cover'), 1000000, 30, null) $$,
  'P0001', 'already_proposed', 'second pending proposal rejected');
select tests.authenticate_as(tests.id('f2'));
select tests.set('prop2', public.rpc_submit_proposal(tests.id('p'), tests.get('cover'), 1000000, 30, '[]'::jsonb)::text);
select is((select milestone_edits from public.proposals where id = tests.id('prop2')), null::jsonb,
  'empty edits array is stored as null');
select tests.authenticate_as(tests.id('f3'));
select tests.set('prop3', public.rpc_submit_proposal(tests.id('p'), tests.get('cover'), 1000000, 30, null)::text);

-- Withdraw ------------------------------------------------------------------------------------------------
select tests.authenticate_as(tests.id('f1'));
select throws_ok($$ select public.rpc_withdraw_proposal(tests.id('prop3')) $$,
  'P0001', 'proposal_not_found', 'cannot withdraw someone else''s proposal');
select tests.authenticate_as(tests.id('f3'));
select lives_ok($$ select public.rpc_withdraw_proposal(tests.id('prop3')) $$, 'author withdraws a pending proposal');
select is((select status::text from public.proposals where id = tests.id('prop3')), 'withdrawn', 'proposal withdrawn');
select throws_ok($$ select public.rpc_withdraw_proposal(tests.id('prop3')) $$,
  'P0001', 'invalid_status', 'cannot withdraw twice');
select tests.set('prop3b', public.rpc_submit_proposal(tests.id('p'), tests.get('cover'), 1000000, 30, null)::text);
select is((select count(*)::int from public.proposals where project_id = tests.id('p') and freelancer_id = tests.id('f3')), 2,
  'a freelancer may propose again after withdrawing');

-- Reject ----------------------------------------------------------------------------------------------------
select tests.authenticate_as(tests.id('f2'));
select throws_ok($$ select public.rpc_reject_proposal(tests.id('prop1'), null) $$,
  'P0001', 'not_project_client', 'freelancer cannot reject proposals');
select tests.authenticate_as(tests.id('f4'));
select tests.set('prop4', public.rpc_submit_proposal(tests.id('p'), tests.get('cover'), 1000000, 30, null)::text);
select tests.authenticate_as(tests.id('c1'));
select lives_ok($$ select public.rpc_reject_proposal(tests.id('prop4'), 'Looking for more experience') $$,
  'client rejects a pending proposal');
select results_eq($$ select status::text, rejection_reason from public.proposals where id = tests.id('prop4') $$,
  $$ values ('rejected'::text, 'Looking for more experience'::text) $$, 'proposal rejected with reason');
select throws_ok($$ select public.rpc_reject_proposal(tests.id('prop4'), null) $$,
  'P0001', 'invalid_status', 'cannot reject twice');

-- Accept -------------------------------------------------------------------------------------------------------
select tests.set('link_p', (select invite_id::text from public.rpc_create_invite(tests.id('p'), null, null)));
select tests.set('inv_f4', (select invite_id::text from public.rpc_create_invite(tests.id('p'), tests.id('f4'), null)));

select tests.authenticate_as(tests.id('f2'));
select throws_ok($$ select public.rpc_accept_proposal(tests.id('prop1'), false) $$,
  'P0001', 'not_project_client', 'freelancer cannot accept proposals');

select tests.authenticate_as(tests.id('c1'));
select throws_ok($$ select public.rpc_accept_proposal(tests.id('prop2'), true) $$,
  'P0001', 'invalid_input', 'applying edits requires the proposal to have edits');
select throws_ok($$ select public.rpc_accept_proposal(gen_random_uuid(), false) $$,
  'P0001', 'proposal_not_found', 'accept unknown proposal');

-- Edits are re-validated at accept time (here: a stored date that is now in the past).
select tests.as_postgres();
update public.proposals
   set milestone_edits = jsonb_set(milestone_edits, '{0,due_date}', to_jsonb(to_char(tests.today() - 1, 'YYYY-MM-DD')))
 where id = tests.id('prop1');
select tests.authenticate_as(tests.id('c1'));
select throws_ok($$ select public.rpc_accept_proposal(tests.id('prop1'), true) $$,
  'P0001', 'milestone_dates_invalid', 'accept with edits re-validates dates');
select tests.as_postgres();
update public.proposals set milestone_edits = tests.edits(array[400000, 300000, 400000]) where id = tests.id('prop1');

select tests.authenticate_as(tests.id('c1'));
select lives_ok($$ select public.rpc_accept_proposal(tests.id('prop1'), true) $$, 'client accepts with milestone edits');
select results_eq(
  $$ select status::text, freelancer_id, awarded_at is not null, total_paise from public.projects where id = tests.id('p') $$,
  $$ values ('awarded'::text, tests.id('f1'), true, 1100000::bigint) $$,
  'project awarded to the freelancer; total recomputed from the edits');
select results_eq(
  $$ select position, title, amount_paise, deliverable, acceptance_criteria
       from public.milestones where project_id = tests.id('p') order by position $$,
  $$ values (1, 'Edited milestone 1'::text, 400000::bigint, 'Deliverable number 1 completed'::text, 'Accepted when item 1 works'::text),
            (2, 'Edited milestone 2'::text, 300000::bigint, 'Deliverable number 2 completed'::text, 'Accepted when item 2 works'::text),
            (3, 'Edited milestone 3'::text, 400000::bigint, ''::text, ''::text) $$,
  'milestones replaced by edits; descriptions copied by position or left empty');
select results_eq(
  $$ select user_id, member_role::text from public.project_members where project_id = tests.id('p') order by member_role $$,
  $$ values (tests.id('c1'), 'client'::text), (tests.id('f1'), 'freelancer'::text) $$,
  'freelancer added to project_members');
select results_eq(
  $$ select id, status::text, rejection_reason from public.proposals where project_id = tests.id('p')
      and id in (tests.id('prop1'), tests.id('prop2'), tests.id('prop3b')) order by status, id $$,
  $$ select * from (values (tests.id('prop1'), 'accepted'::text, null::text),
                           (tests.id('prop2'), 'rejected'::text, 'another_proposal_accepted'::text),
                           (tests.id('prop3b'), 'rejected'::text, 'another_proposal_accepted'::text)) v (a, b, c)
     order by b, a $$,
  'accept marks the proposal accepted and rejects other pending proposals');
select is((select array_agg(status::text) from public.project_invites where project_id = tests.id('p')),
  array['revoked', 'revoked'], 'accept revokes pending invites');
select throws_ok($$ select public.rpc_accept_proposal(tests.id('prop1'), false) $$,
  'P0001', 'invalid_status', 'cannot accept twice');
select throws_ok($$ select * from public.rpc_create_invite(tests.id('p'), tests.id('f2'), null) $$,
  'P0001', 'invalid_status', 'cannot invite on an awarded project');
select tests.authenticate_as(tests.id('f2'));
select throws_ok($$ select public.rpc_submit_proposal(tests.id('p'), tests.get('cover'), 1000000, 30, null) $$,
  'P0001', 'invalid_status', 'cannot propose on an awarded project');

-- Invites ------------------------------------------------------------------------------------------------------------
select tests.new_project('q', tests.id('c1'), array[600000, 400000], 'invite_only');

select tests.authenticate_as(tests.id('f2'));
select throws_ok($$ select * from public.rpc_create_invite(tests.id('q'), tests.id('f1'), null) $$,
  'P0001', 'not_project_client', 'only the client can invite');
select tests.authenticate_as(tests.id('c1'));
select throws_ok($$ select * from public.rpc_create_invite(tests.id('q'), tests.id('f1'), '+919810000025') $$,
  'P0001', 'invalid_input', 'freelancer_id and phone are mutually exclusive');
select throws_ok($$ select * from public.rpc_create_invite(tests.id('q'), tests.id('c2'), null) $$,
  'P0001', 'invalid_input', 'can only invite users with the freelancer role');
select throws_ok($$ select * from public.rpc_create_invite(tests.id('q'), null, '+14155550100') $$,
  'P0001', 'invalid_input', 'phone must be an Indian mobile in E.164');

select tests.set('inv_f1', (select invite_id::text from public.rpc_create_invite(tests.id('q'), tests.id('f1'), null)));
select tests.set('link', (select token from public.rpc_create_invite(tests.id('q'), null, null)));
select ok(tests.get('link') ~ '^[A-Za-z0-9_-]{43}$', 'invite token is 32 bytes base64url');
select tests.set('link_id', (select id::text from public.project_invites where project_id = tests.id('q')
                              and freelancer_id is null and phone_e164 is null));
select throws_ok($$ select token from public.project_invites $$,
  '42501', null, 'token is not selectable, even by the inviter');

-- profile invite: invitee proposes on an invite-only project
select tests.authenticate_as(tests.id('f2'));
select throws_ok($$ select public.rpc_submit_proposal(tests.id('q'), tests.get('cover'), 1000000, 30, null) $$,
  'P0001', 'project_not_found', 'non-invitee cannot propose on an invite-only project');
select tests.authenticate_as(tests.id('f1'));
select isnt(public.rpc_submit_proposal(tests.id('q'), tests.get('cover'), 1000000, 30, null), null,
  'invitee with a pending invite can propose');

-- link invite: resolve + respond binds the caller
select tests.authenticate_as(tests.id('f2'));
select results_eq($$ select invite_id, project_id, project_title, client_name, status::text
                       from public.rpc_resolve_invite(tests.get('link')) $$,
  $$ values (tests.id('link_id'), tests.id('q'), 'Build a shop website'::text, 'Asha Client'::text, 'pending'::text) $$,
  'any authenticated user can resolve a link token');
select throws_ok($$ select * from public.rpc_resolve_invite('x' || repeat('A', 42)) $$,
  'P0001', 'invite_invalid', 'unknown token');
select throws_ok($$ select public.rpc_respond_invite(tests.id('link_id'), null, true) $$,
  'P0001', 'invite_invalid', 'an unbound link invite cannot be answered by id');
select throws_ok($$ select public.rpc_respond_invite(null, null, true) $$,
  'P0001', 'invalid_input', 'respond needs an invite id or token');
select is(public.rpc_respond_invite(p_token => tests.get('link'), p_accept => true), tests.id('q'),
  'accepting a link invite returns the project id');
select results_eq($$ select freelancer_id, status::text, responded_at is not null
                       from public.project_invites where id = tests.id('link_id') $$,
  $$ values (tests.id('f2'), 'accepted'::text, true) $$, 'link token binds freelancer_id to the caller');
select is((select count(*)::int from public.projects where id = tests.id('q')), 1,
  'holder of an accepted invite can see the invite-only project');
select isnt(public.rpc_submit_proposal(tests.id('q'), tests.get('cover'), 1000000, 30, null), null,
  'holder of an accepted invite can propose');
select tests.authenticate_as(tests.id('f3'));
select throws_ok($$ select public.rpc_respond_invite(p_token => tests.get('link'), p_accept => true) $$,
  'P0001', 'invite_invalid', 'a used link token cannot be reused by someone else');

-- revoked invite is unusable
select tests.authenticate_as(tests.id('c1'));
select tests.set('rev', (select token from public.rpc_create_invite(tests.id('q'), null, null)));
select tests.set('rev_id', (select invite_id::text from public.rpc_resolve_invite(tests.get('rev'))));
select tests.authenticate_as(tests.id('f3'));
select throws_ok($$ select public.rpc_revoke_invite(tests.id('rev_id')) $$,
  'P0001', 'invite_invalid', 'only the inviter can revoke');
select tests.authenticate_as(tests.id('c1'));
select lives_ok($$ select public.rpc_revoke_invite(tests.id('rev_id')) $$, 'inviter revokes');
select throws_ok($$ select public.rpc_revoke_invite(tests.id('rev_id')) $$,
  'P0001', 'invalid_status', 'cannot revoke twice');
select tests.authenticate_as(tests.id('f3'));
select is((select status::text from public.rpc_resolve_invite(tests.get('rev'))), 'revoked', 'resolve reports revoked');
select throws_ok($$ select public.rpc_respond_invite(p_token => tests.get('rev'), p_accept => true) $$,
  'P0001', 'invite_invalid', 'revoked invite cannot be accepted');

-- expired invite is unusable
select tests.authenticate_as(tests.id('c1'));
select tests.set('exp', (select token from public.rpc_create_invite(tests.id('q'), null, null)));
select tests.as_postgres();
update public.project_invites set expires_at = now() - interval '1 day' where token = tests.get('exp');
select tests.authenticate_as(tests.id('f3'));
select is((select status::text from public.rpc_resolve_invite(tests.get('exp'))), 'expired', 'resolve reports expired');
select throws_ok($$ select public.rpc_respond_invite(p_token => tests.get('exp'), p_accept => true) $$,
  'P0001', 'invite_invalid', 'expired invite cannot be accepted');
select tests.as_postgres();
select is(public._expire_project_invites(), 1, 'housekeeping marks expired invites');

-- phone invite: matched by verified phone
select tests.authenticate_as(tests.id('c1'));
select tests.set('ph_id', (select invite_id::text from public.rpc_create_invite(tests.id('q'), null, '+919810000025')));
select tests.authenticate_as(tests.id('f3'));
select results_eq($$ select id, phone_e164 from public.project_invites where project_id = tests.id('q') $$,
  $$ values (tests.id('ph_id'), '+919810000025'::text) $$, 'phone invitee sees the invite (and only theirs)');
select is((select count(*)::int from public.projects where id = tests.id('q')), 1,
  'phone invitee sees the invite-only project');
select tests.authenticate_as(tests.id('f4'));
select is((select count(*)::int from public.project_invites where id = tests.id('ph_id')), 0,
  'other users do not see the phone invite');
select throws_ok($$ select public.rpc_respond_invite(tests.id('ph_id'), null, true) $$,
  'P0001', 'invite_invalid', 'a phone invite cannot be answered by another user');
select tests.authenticate_as(tests.id('f3'));
select is(public.rpc_respond_invite(tests.id('ph_id'), null, false), tests.id('q'), 'phone invitee declines by id');
select results_eq($$ select freelancer_id, status::text from public.project_invites where id = tests.id('ph_id') $$,
  $$ values (tests.id('f3'), 'declined'::text) $$, 'decline recorded and bound to the caller');

-- profile invite to the wrong user / own project
select tests.authenticate_as(tests.id('f4'));
select throws_ok($$ select public.rpc_respond_invite(tests.id('inv_f1'), null, true) $$,
  'P0001', 'invite_invalid', 'a profile invite cannot be answered by another user');

-- inviter sees their invites; audit trail
select tests.authenticate_as(tests.id('c1'));
select is((select count(*)::int from public.project_invites where project_id = tests.id('q')), 5,
  'inviter sees all invites on the project');
select tests.as_postgres();
select ok((select count(*) from public.audit_log where action like 'invite.%') >= 8
          and (select count(*) from public.audit_log where action like 'proposal.%') >= 8,
  'invite and proposal RPCs write audit rows');

select * from finish();
rollback;
