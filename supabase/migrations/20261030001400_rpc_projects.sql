-- Project, proposal and invite RPCs (docs/api/projects.md "RPCs").
-- All security definer, search_path = '', validate auth.uid(). Errors:
--   42501 'not_authenticated'; P0001 with the stable keys from the contract
--   (+ 'invalid_input' / 'proposal_not_found' with a detail naming the problem).
-- Lock order everywhere: projects row first, then milestones / proposals / invites
-- (see supabase/migrations/README.md "Lock order").
-- Existence leaks: a caller who cannot see a project (can_view_project) gets
-- project_not_found, never not_project_client. Client-only proposal RPCs answer
-- proposal_not_found to anyone but the project's client.

-- ---------------------------------------------------------------------------
-- rpc_save_project_draft
-- p_project: {title, description, category, skill_ids?, city?, is_remote?, visibility?,
--             checkin_cadence_days?, revision_limit?}
-- p_milestones: [{title, deliverable, acceptance_criteria, amount_paise, due_date}] (0..20)
-- Creates (p_project_id null) or fully replaces a draft. The cap/date rules are
-- enforced at publish time.
-- ---------------------------------------------------------------------------
-- Args default to null so generated TS types let callers omit p_project_id (create).
create or replace function public.rpc_save_project_draft(
  p_project_id uuid default null,
  p_project jsonb default null,
  p_milestones jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid := p_project_id;
  v_project public.projects%rowtype;
  v_title text;
  v_description text;
  v_category text;
  v_city text;
  v_is_remote boolean;
  v_visibility text;
  v_cadence int;
  v_revision_limit int;
  v_skill_ids uuid[];
  v_count int;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  if not public.has_role('client') then
    raise exception using errcode = 'P0001', message = 'role_required', detail = 'client';
  end if;

  if p_project_id is not null then
    select * into v_project from public.projects p where p.id = p_project_id for update;
    if not found then
      raise exception using errcode = 'P0001', message = 'project_not_found';
    end if;
    if v_project.client_id <> v_uid then
      raise exception using errcode = 'P0001',
        message = case when public.can_view_project(p_project_id)
                       then 'not_project_client' else 'project_not_found' end;
    end if;
    if v_project.status <> 'draft' then
      raise exception using errcode = 'P0001', message = 'invalid_status';
    end if;
  end if;

  if p_project is null or jsonb_typeof(p_project) <> 'object' then
    raise exception using errcode = 'P0001', message = 'invalid_input',
      detail = 'project must be an object';
  end if;

  v_title := public._clean_text(p_project ->> 'title', 5, 120, 'title');
  v_description := public._clean_text(p_project ->> 'description', 30, 5000, 'description');
  v_category := public._clean_text(p_project ->> 'category', 2, 60, 'category');
  v_city := public._clean_text(p_project ->> 'city', 1, 60, 'city', false);
  v_is_remote := public._json_bool(p_project -> 'is_remote', true, 'is_remote');
  v_visibility := coalesce(p_project ->> 'visibility', 'public');
  if v_visibility not in ('public', 'invite_only') then
    raise exception using errcode = 'P0001', message = 'invalid_input',
      detail = 'visibility must be public or invite_only';
  end if;
  v_cadence := coalesce(
    public._json_bigint(p_project -> 'checkin_cadence_days', 1, 14, 'checkin_cadence_days', false),
    (select (c.value #>> '{}')::int from public.app_config c where c.key = 'checkin_cadence_days'),
    2);
  v_revision_limit := coalesce(
    public._json_bigint(p_project -> 'revision_limit', 0, 5, 'revision_limit', false),
    (select (c.value #>> '{}')::int from public.app_config c where c.key = 'revision_limit'),
    2);
  v_skill_ids := public._json_uuid_array(p_project -> 'skill_ids', 10, 'skill_ids');
  if exists (
    select 1 from unnest(v_skill_ids) s
     where not exists (select 1 from public.skills k where k.id = s)
  ) then
    raise exception using errcode = 'P0001', message = 'invalid_input',
      detail = 'unknown skill id';
  end if;

  -- Parse (and validate) milestones before writing anything.
  select count(*) into v_count from public._parse_milestone_plan(p_milestones, true);

  if v_id is null then
    insert into public.projects as p (
      client_id, title, description, category, city, is_remote, visibility,
      checkin_cadence_days, revision_limit
    ) values (
      v_uid, v_title, v_description, v_category, v_city, v_is_remote,
      v_visibility::public.project_visibility, v_cadence, v_revision_limit
    )
    returning p.id into v_id;

    insert into public.project_members (project_id, user_id, member_role)
    values (v_id, v_uid, 'client');
  else
    update public.projects p
       set title = v_title,
           description = v_description,
           category = v_category,
           city = v_city,
           is_remote = v_is_remote,
           visibility = v_visibility::public.project_visibility,
           checkin_cadence_days = v_cadence,
           revision_limit = v_revision_limit,
           updated_at = now()
     where p.id = v_id;
  end if;

  delete from public.project_skills ps where ps.project_id = v_id;
  insert into public.project_skills (project_id, skill_id)
  select v_id, s from unnest(v_skill_ids) s;

  delete from public.milestones m where m.project_id = v_id;
  insert into public.milestones (
    project_id, position, title, deliverable, acceptance_criteria, amount_paise, due_date
  )
  select v_id, e.pos, e.title, e.deliverable, e.acceptance_criteria, e.amount_paise, e.due_date
    from public._parse_milestone_plan(p_milestones, true) e;

  perform public.write_audit(
    case when p_project_id is null then 'project.created' else 'project.draft_saved' end,
    'project', v_id,
    jsonb_build_object('milestone_count', v_count, 'skill_count', cardinality(v_skill_ids)));

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- rpc_publish_project: draft -> open (min count, cap, dates).
-- ---------------------------------------------------------------------------
create or replace function public.rpc_publish_project(p_project_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_project public.projects%rowtype;
  v_amounts bigint[];
  v_dates date[];
  v_error text;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;

  select * into v_project from public.projects p where p.id = p_project_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'project_not_found';
  end if;
  if v_project.client_id <> v_uid then
    raise exception using errcode = 'P0001',
      message = case when public.can_view_project(p_project_id)
                     then 'not_project_client' else 'project_not_found' end;
  end if;
  if v_project.status <> 'draft' then
    raise exception using errcode = 'P0001', message = 'invalid_status';
  end if;

  select coalesce(array_agg(m.amount_paise order by m.position), '{}'),
         coalesce(array_agg(m.due_date order by m.position), '{}')
    into v_amounts, v_dates
    from public.milestones m
   where m.project_id = p_project_id;

  v_error := public.validate_milestone_plan(v_amounts, v_dates);
  if v_error is not null then
    raise exception using errcode = 'P0001', message = v_error;
  end if;

  -- clock_timestamp(): distinct per publish even inside one transaction, which keeps
  -- the published_at keyset cursor of rpc_search_projects tie-free in practice.
  update public.projects p
     set status = 'open', published_at = clock_timestamp()
   where p.id = p_project_id;

  perform public.write_audit('project.published', 'project', p_project_id,
    jsonb_build_object('total_paise', v_project.total_paise, 'milestone_count', cardinality(v_amounts)));
end;
$$;

-- ---------------------------------------------------------------------------
-- rpc_cancel_project: draft/open/awarded with every milestone still draft.
-- Rejects pending proposals and revokes pending invites. Anyone but the client gets
-- project_not_found.
-- ---------------------------------------------------------------------------
create or replace function public.rpc_cancel_project(p_project_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_project public.projects%rowtype;
  v_reason text;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;

  select * into v_project from public.projects p where p.id = p_project_id for update;
  if not found or v_project.client_id <> v_uid then
    raise exception using errcode = 'P0001', message = 'project_not_found';
  end if;
  if v_project.status not in ('draft', 'open', 'awarded') then
    raise exception using errcode = 'P0001', message = 'invalid_status';
  end if;
  if exists (
    select 1 from public.milestones m where m.project_id = p_project_id and m.status <> 'draft'
  ) then
    raise exception using errcode = 'P0001', message = 'invalid_status',
      detail = 'a milestone has been funded';
  end if;

  v_reason := public._clean_text(p_reason, 1, 500, 'reason', false);

  update public.projects p
     set status = 'cancelled', cancelled_at = now(), cancel_reason = v_reason
   where p.id = p_project_id;

  update public.proposals pr
     set status = 'rejected', rejection_reason = 'project_cancelled', decided_at = now()
   where pr.project_id = p_project_id and pr.status = 'pending';

  update public.project_invites i
     set status = 'revoked', responded_at = now()
   where i.project_id = p_project_id and i.status = 'pending';

  perform public.write_audit('project.cancelled', 'project', p_project_id,
    jsonb_build_object('from_status', v_project.status, 'reason', v_reason));
end;
$$;

-- ---------------------------------------------------------------------------
-- rpc_submit_proposal
-- p_milestone_edits: null or a counter-plan (see _parse_proposal_plan; an empty array
-- = null). Price = plan (D26):
--   with edits    sum(amount_paise) = p_proposed_total_paise   else plan_total_mismatch
--   without edits p_proposed_total_paise = projects.total_paise else price_change_needs_plan
-- A project the caller cannot view (draft, invite-only without a live invite, awarded
-- or later) is project_not_found.
-- ---------------------------------------------------------------------------
create or replace function public.rpc_submit_proposal(
  p_project_id uuid,
  p_cover_note text,
  p_proposed_total_paise bigint,
  p_timeline_days int,
  p_milestone_edits jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_project public.projects%rowtype;
  v_cover text;
  v_edits jsonb;
  v_amounts bigint[];
  v_dates date[];
  v_sum numeric;
  v_error text;
  v_id uuid;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  if not public.has_role('freelancer') then
    raise exception using errcode = 'P0001', message = 'role_required', detail = 'freelancer';
  end if;

  select * into v_project from public.projects p where p.id = p_project_id for share;
  if not found then
    raise exception using errcode = 'P0001', message = 'project_not_found';
  end if;
  if v_project.client_id = v_uid then
    raise exception using errcode = 'P0001', message = 'cannot_propose_own_project';
  end if;
  if not public.can_view_project(v_project.id) then
    raise exception using errcode = 'P0001', message = 'project_not_found';
  end if;
  -- Only members / admins can see a non-open project.
  if v_project.status <> 'open' then
    raise exception using errcode = 'P0001', message = 'invalid_status';
  end if;

  v_cover := public._clean_text(p_cover_note, 30, 3000, 'cover_note');
  if p_proposed_total_paise is null or p_proposed_total_paise not between 10000 and 200000000000 then
    raise exception using errcode = 'P0001', message = 'invalid_input',
      detail = 'proposed_total_paise must be in 10000..200000000000';
  end if;
  if p_timeline_days is null or p_timeline_days not between 1 and 365 then
    raise exception using errcode = 'P0001', message = 'invalid_input',
      detail = 'timeline_days must be in 1..365';
  end if;

  select jsonb_agg(jsonb_build_object(
           'source_milestone_id', e.source_milestone_id, 'title', e.title,
           'amount_paise', e.amount_paise, 'due_date', e.due_date,
           'deliverable', e.deliverable, 'acceptance_criteria', e.acceptance_criteria)
           order by e.pos),
         array_agg(e.amount_paise order by e.pos),
         array_agg(e.due_date order by e.pos),
         sum(e.amount_paise::numeric)
    into v_edits, v_amounts, v_dates, v_sum
    from public._parse_proposal_plan(p_project_id, p_milestone_edits) e;

  if v_edits is not null then
    v_error := public.validate_milestone_plan(v_amounts, v_dates);
    if v_error is not null then
      raise exception using errcode = 'P0001', message = v_error;
    end if;
    if v_sum <> p_proposed_total_paise then
      raise exception using errcode = 'P0001', message = 'plan_total_mismatch',
        detail = format('milestones add up to %s, proposed total is %s', v_sum, p_proposed_total_paise);
    end if;
  elsif p_proposed_total_paise <> v_project.total_paise then
    raise exception using errcode = 'P0001', message = 'price_change_needs_plan',
      detail = format('project total is %s', v_project.total_paise);
  end if;

  if exists (
    select 1 from public.proposals pr
     where pr.project_id = p_project_id and pr.freelancer_id = v_uid and pr.status = 'pending'
  ) then
    raise exception using errcode = 'P0001', message = 'already_proposed';
  end if;

  begin
    insert into public.proposals as pr (
      project_id, freelancer_id, cover_note, proposed_total_paise, timeline_days, milestone_edits
    ) values (
      p_project_id, v_uid, v_cover, p_proposed_total_paise, p_timeline_days, v_edits
    )
    returning pr.id into v_id;
  exception when unique_violation then
    raise exception using errcode = 'P0001', message = 'already_proposed';
  end;

  perform public.write_audit('proposal.submitted', 'proposal', v_id,
    jsonb_build_object('project_id', p_project_id, 'proposed_total_paise', p_proposed_total_paise,
                       'has_milestone_edits', v_edits is not null));

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- rpc_withdraw_proposal: author only, while pending. Other callers get
-- proposal_not_found (no existence leak).
-- ---------------------------------------------------------------------------
create or replace function public.rpc_withdraw_proposal(p_proposal_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_proposal public.proposals%rowtype;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;

  select * into v_proposal from public.proposals pr where pr.id = p_proposal_id for update;
  if not found or v_proposal.freelancer_id <> v_uid then
    raise exception using errcode = 'P0001', message = 'proposal_not_found';
  end if;
  if v_proposal.status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'invalid_status';
  end if;

  update public.proposals pr
     set status = 'withdrawn', decided_at = now()
   where pr.id = p_proposal_id;

  perform public.write_audit('proposal.withdrawn', 'proposal', p_proposal_id,
    jsonb_build_object('project_id', v_proposal.project_id));
end;
$$;

-- ---------------------------------------------------------------------------
-- rpc_reject_proposal: project client only, while pending. Anyone else (including
-- the proposal's author) gets proposal_not_found.
-- ---------------------------------------------------------------------------
create or replace function public.rpc_reject_proposal(p_proposal_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_project_id uuid;
  v_project public.projects%rowtype;
  v_proposal public.proposals%rowtype;
  v_reason text;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;

  select pr.project_id into v_project_id from public.proposals pr where pr.id = p_proposal_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'proposal_not_found';
  end if;
  select * into v_project from public.projects p where p.id = v_project_id for update;
  if v_project.client_id is distinct from v_uid then
    raise exception using errcode = 'P0001', message = 'proposal_not_found';
  end if;
  select * into v_proposal from public.proposals pr where pr.id = p_proposal_id for update;

  if v_proposal.status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'invalid_status';
  end if;

  v_reason := public._clean_text(p_reason, 1, 500, 'reason', false);

  update public.proposals pr
     set status = 'rejected', rejection_reason = v_reason, decided_at = now()
   where pr.id = p_proposal_id;

  perform public.write_audit('proposal.rejected', 'proposal', p_proposal_id,
    jsonb_build_object('project_id', v_project_id, 'reason', v_reason));
end;
$$;

-- ---------------------------------------------------------------------------
-- rpc_accept_proposal: open project, pending proposal, project client only (anyone
-- else gets proposal_not_found).
-- Price = plan is re-checked (D26):
--   p_apply_milestone_edits  the proposal must have edits and sum(edits) must equal
--                            proposed_total_paise (plan_total_mismatch); the milestones
--                            are replaced by the edits, texts resolved by
--                            source_milestone_id (never by position);
--   otherwise                proposed_total_paise must equal projects.total_paise
--                            (price_change_needs_plan).
-- The final plan always passes validate_milestone_plan (count, cap, dates as of today)
-- before the project is awarded.
-- ---------------------------------------------------------------------------
create or replace function public.rpc_accept_proposal(
  p_proposal_id uuid,
  p_apply_milestone_edits boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_apply boolean := coalesce(p_apply_milestone_edits, false);
  v_project_id uuid;
  v_project public.projects%rowtype;
  v_proposal public.proposals%rowtype;
  v_amounts bigint[];
  v_dates date[];
  v_sum numeric;
  v_error text;
  v_rejected int;
  v_revoked int;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;

  select pr.project_id into v_project_id from public.proposals pr where pr.id = p_proposal_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'proposal_not_found';
  end if;
  select * into v_project from public.projects p where p.id = v_project_id for update;
  if v_project.client_id is distinct from v_uid then
    raise exception using errcode = 'P0001', message = 'proposal_not_found';
  end if;
  select * into v_proposal from public.proposals pr where pr.id = p_proposal_id for update;

  if v_project.status <> 'open' or v_proposal.status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'invalid_status';
  end if;

  if v_apply then
    if v_proposal.milestone_edits is null then
      raise exception using errcode = 'P0001', message = 'invalid_input',
        detail = 'proposal has no milestone edits';
    end if;
    -- Resolve once into a temp structure: validates sources against the current
    -- milestones (which cannot change while the project is open).
    create temp table if not exists _accept_plan (
      pos int, title text, deliverable text, acceptance_criteria text,
      amount_paise bigint, due_date date
    ) on commit drop;
    truncate _accept_plan;
    insert into _accept_plan
    select e.pos, e.title, e.final_deliverable, e.final_acceptance_criteria, e.amount_paise, e.due_date
      from public._parse_proposal_plan(v_project_id, v_proposal.milestone_edits) e;

    select array_agg(x.amount_paise order by x.pos), array_agg(x.due_date order by x.pos),
           sum(x.amount_paise::numeric)
      into v_amounts, v_dates, v_sum
      from _accept_plan x;
    if v_sum is distinct from v_proposal.proposed_total_paise::numeric then
      raise exception using errcode = 'P0001', message = 'plan_total_mismatch';
    end if;
  else
    if v_proposal.proposed_total_paise <> v_project.total_paise then
      raise exception using errcode = 'P0001', message = 'price_change_needs_plan';
    end if;
    select coalesce(array_agg(m.amount_paise order by m.position), '{}'),
           coalesce(array_agg(m.due_date order by m.position), '{}')
      into v_amounts, v_dates
      from public.milestones m
     where m.project_id = v_project_id;
  end if;

  v_error := public.validate_milestone_plan(v_amounts, v_dates);
  if v_error is not null then
    raise exception using errcode = 'P0001', message = v_error;
  end if;

  if v_apply then
    delete from public.milestones m where m.project_id = v_project_id;
    insert into public.milestones (
      project_id, position, title, deliverable, acceptance_criteria, amount_paise, due_date
    )
    select v_project_id, x.pos, x.title, x.deliverable, x.acceptance_criteria, x.amount_paise, x.due_date
      from _accept_plan x;
  end if;

  update public.projects p
     set freelancer_id = v_proposal.freelancer_id, status = 'awarded', awarded_at = now()
   where p.id = v_project_id;

  insert into public.project_members (project_id, user_id, member_role)
  values (v_project_id, v_proposal.freelancer_id, 'freelancer')
  on conflict (project_id, user_id) do update
    set member_role = excluded.member_role, active = true, left_at = null, joined_at = now();

  update public.proposals pr
     set status = 'accepted', decided_at = now()
   where pr.id = p_proposal_id;

  update public.proposals pr
     set status = 'rejected', rejection_reason = 'another_proposal_accepted', decided_at = now()
   where pr.project_id = v_project_id and pr.status = 'pending';
  get diagnostics v_rejected = row_count;

  update public.project_invites i
     set status = 'revoked', responded_at = now()
   where i.project_id = v_project_id and i.status = 'pending';
  get diagnostics v_revoked = row_count;

  perform public.write_audit('proposal.accepted', 'proposal', p_proposal_id,
    jsonb_build_object(
      'project_id', v_project_id, 'freelancer_id', v_proposal.freelancer_id,
      'applied_milestone_edits', v_apply,
      'rejected_proposals', v_rejected, 'revoked_invites', v_revoked));
end;
$$;

-- ---------------------------------------------------------------------------
-- rpc_create_invite: project client, draft/open. One of p_freelancer_id / p_phone,
-- or neither for a link invite. Re-inviting the same freelancer/phone revokes the
-- previous pending invite. The token is returned only here.
-- ---------------------------------------------------------------------------
create or replace function public.rpc_create_invite(
  p_project_id uuid,
  p_freelancer_id uuid default null,
  p_phone text default null
)
returns table (invite_id uuid, token text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_project public.projects%rowtype;
  v_phone text := nullif(btrim(p_phone), '');
  v_token text;
  v_id uuid;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;

  select * into v_project from public.projects p where p.id = p_project_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'project_not_found';
  end if;
  if v_project.client_id <> v_uid then
    raise exception using errcode = 'P0001', message = 'not_project_client';
  end if;
  if v_project.status not in ('draft', 'open') then
    raise exception using errcode = 'P0001', message = 'invalid_status';
  end if;

  if p_freelancer_id is not null and v_phone is not null then
    raise exception using errcode = 'P0001', message = 'invalid_input',
      detail = 'pass freelancer_id or phone, not both';
  end if;
  if p_freelancer_id is not null then
    if p_freelancer_id = v_uid or not exists (
      select 1 from public.user_roles ur
       where ur.user_id = p_freelancer_id and ur.role = 'freelancer'
    ) then
      raise exception using errcode = 'P0001', message = 'invalid_input',
        detail = 'freelancer_id is not a freelancer';
    end if;
  end if;
  if v_phone is not null and v_phone !~ '^\+91[6-9][0-9]{9}$' then
    raise exception using errcode = 'P0001', message = 'invalid_input',
      detail = 'phone must be +91XXXXXXXXXX';
  end if;

  if p_freelancer_id is not null or v_phone is not null then
    update public.project_invites i
       set status = 'revoked', responded_at = now()
     where i.project_id = p_project_id and i.status = 'pending'
       and (i.freelancer_id = p_freelancer_id or i.phone_e164 = v_phone);
  end if;

  if (select count(*) from public.project_invites i
       where i.project_id = p_project_id and i.status = 'pending') >= 50 then
    raise exception using errcode = 'P0001', message = 'invalid_input',
      detail = 'too many pending invites';
  end if;

  v_token := translate(rtrim(encode(extensions.gen_random_bytes(32), 'base64'), '='), '+/', '-_');

  insert into public.project_invites as i (project_id, invited_by, freelancer_id, phone_e164, token)
  values (p_project_id, v_uid, p_freelancer_id, v_phone, v_token)
  returning i.id into v_id;

  perform public.write_audit('invite.created', 'project_invite', v_id,
    jsonb_build_object(
      'project_id', p_project_id,
      'kind', case when p_freelancer_id is not null then 'profile'
                   when v_phone is not null then 'phone' else 'link' end,
      'freelancer_id', p_freelancer_id));

  return query select v_id, v_token;
end;
$$;

-- ---------------------------------------------------------------------------
-- rpc_resolve_invite: read-only lookup of a link token for any authenticated user.
-- A pending invite past expires_at is reported as 'expired'. Unknown => invite_invalid.
-- ---------------------------------------------------------------------------
create or replace function public.rpc_resolve_invite(p_token text)
returns table (
  invite_id uuid,
  project_id uuid,
  project_title text,
  client_name text,
  status public.invite_status
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then
    raise exception using errcode = 'P0001', message = 'invite_invalid';
  end if;

  return query
    select i.id, i.project_id, p.title, cp.full_name,
           case when i.status = 'pending' and i.expires_at <= now()
                then 'expired'::public.invite_status else i.status end
      from public.project_invites i
      join public.projects p on p.id = i.project_id
      join public.profiles cp on cp.id = p.client_id
     where i.token = p_token;

  if not found then
    raise exception using errcode = 'P0001', message = 'invite_invalid';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- rpc_respond_invite: the invitee accepts/declines, by p_invite_id or p_token
-- (exactly one). Invitee = freelancer_id, else the verified phone for phone invites,
-- else (link invites, token only) whoever holds the token: the first response binds
-- freelancer_id to the caller. Returns project_id.
-- ---------------------------------------------------------------------------
create or replace function public.rpc_respond_invite(
  p_invite_id uuid default null,
  p_token text default null,
  p_accept boolean default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_invite public.project_invites%rowtype;
  v_project public.projects%rowtype;
  v_project_id uuid;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  if p_accept is null or (p_invite_id is null) = (p_token is null) then
    raise exception using errcode = 'P0001', message = 'invalid_input',
      detail = 'pass p_accept and exactly one of p_invite_id / p_token';
  end if;

  select i.project_id into v_project_id
    from public.project_invites i
   where (p_invite_id is not null and i.id = p_invite_id)
      or (p_token is not null and i.token = p_token);
  if not found then
    raise exception using errcode = 'P0001', message = 'invite_invalid';
  end if;
  select * into v_project from public.projects p where p.id = v_project_id for update;
  select * into v_invite from public.project_invites i
   where (p_invite_id is not null and i.id = p_invite_id)
      or (p_token is not null and i.token = p_token)
   for update;

  if v_invite.freelancer_id is not null then
    if v_invite.freelancer_id <> v_uid then
      raise exception using errcode = 'P0001', message = 'invite_invalid';
    end if;
  elsif v_invite.phone_e164 is not null then
    if public.my_verified_phone() is distinct from v_invite.phone_e164 then
      raise exception using errcode = 'P0001', message = 'invite_invalid';
    end if;
  elsif p_token is null then
    -- unbound link invite: only the token proves possession
    raise exception using errcode = 'P0001', message = 'invite_invalid';
  end if;

  if v_invite.status <> 'pending' or v_invite.expires_at <= now()
     or v_project.client_id = v_uid or v_project.status not in ('draft', 'open') then
    raise exception using errcode = 'P0001', message = 'invite_invalid';
  end if;
  if p_accept and not public.has_role('freelancer') then
    raise exception using errcode = 'P0001', message = 'role_required', detail = 'freelancer';
  end if;

  update public.project_invites i
     set status = case when p_accept then 'accepted'::public.invite_status
                       else 'declined'::public.invite_status end,
         freelancer_id = coalesce(i.freelancer_id, v_uid),
         responded_at = now()
   where i.id = v_invite.id;

  perform public.write_audit(
    case when p_accept then 'invite.accepted' else 'invite.declined' end,
    'project_invite', v_invite.id,
    jsonb_build_object('project_id', v_project_id, 'via_token', p_token is not null));

  return v_project_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- rpc_revoke_invite: inviter only, while pending.
-- ---------------------------------------------------------------------------
create or replace function public.rpc_revoke_invite(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_invite public.project_invites%rowtype;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;

  select * into v_invite from public.project_invites i where i.id = p_invite_id for update;
  if not found or v_invite.invited_by <> v_uid then
    raise exception using errcode = 'P0001', message = 'invite_invalid';
  end if;
  if v_invite.status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'invalid_status';
  end if;

  update public.project_invites i
     set status = 'revoked', responded_at = now()
   where i.id = p_invite_id;

  perform public.write_audit('invite.revoked', 'project_invite', p_invite_id,
    jsonb_build_object('project_id', v_invite.project_id));
end;
$$;

-- ---------------------------------------------------------------------------
-- Housekeeping: mark pending invites past expires_at as expired (pg_cron, every
-- 15 minutes). The RPCs never rely on it: they also check expires_at directly.
-- ---------------------------------------------------------------------------
create or replace function public._expire_project_invites()
returns int
language plpgsql
set search_path = ''
as $$
declare
  v_count int;
begin
  update public.project_invites i
     set status = 'expired'
   where i.status = 'pending' and i.expires_at <= now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public._expire_project_invites() from public, anon, authenticated;

select cron.schedule(
  'expire-project-invites', '*/15 * * * *', 'select public._expire_project_invites()'
);

-- Grants: authenticated only.
revoke execute on function public.rpc_save_project_draft(uuid, jsonb, jsonb) from public, anon;
revoke execute on function public.rpc_publish_project(uuid) from public, anon;
revoke execute on function public.rpc_cancel_project(uuid, text) from public, anon;
revoke execute on function public.rpc_submit_proposal(uuid, text, bigint, int, jsonb) from public, anon;
revoke execute on function public.rpc_withdraw_proposal(uuid) from public, anon;
revoke execute on function public.rpc_reject_proposal(uuid, text) from public, anon;
revoke execute on function public.rpc_accept_proposal(uuid, boolean) from public, anon;
revoke execute on function public.rpc_create_invite(uuid, uuid, text) from public, anon;
revoke execute on function public.rpc_resolve_invite(text) from public, anon;
revoke execute on function public.rpc_respond_invite(uuid, text, boolean) from public, anon;
revoke execute on function public.rpc_revoke_invite(uuid) from public, anon;

grant execute on function public.rpc_save_project_draft(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.rpc_publish_project(uuid) to authenticated;
grant execute on function public.rpc_cancel_project(uuid, text) to authenticated;
grant execute on function public.rpc_submit_proposal(uuid, text, bigint, int, jsonb) to authenticated;
grant execute on function public.rpc_withdraw_proposal(uuid) to authenticated;
grant execute on function public.rpc_reject_proposal(uuid, text) to authenticated;
grant execute on function public.rpc_accept_proposal(uuid, boolean) to authenticated;
grant execute on function public.rpc_create_invite(uuid, uuid, text) to authenticated;
grant execute on function public.rpc_resolve_invite(text) to authenticated;
grant execute on function public.rpc_respond_invite(uuid, text, boolean) to authenticated;
grant execute on function public.rpc_revoke_invite(uuid) to authenticated;
