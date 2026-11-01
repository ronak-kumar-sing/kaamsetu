-- Milestone state machine (docs/api/projects.md "Milestone state machine").
--   * milestone_transitions: every allowed (from, to, actor_kind) edge for ALL phases,
--     so later phases only add RPCs.
--   * BEFORE UPDATE OF status trigger: rejects edges not in the table, and any status
--     change made without the transaction-local flag app.via_rpc = 'on'.
--   * public._transition_milestone(): the only code that sets the flag. Writes
--     milestone_status_history + audit_log. Not executable by API roles.
--   * Terms guard: milestones are created as 'draft'; title/deliverable/acceptance/
--     amount/due date/position cannot change (nor rows be added/removed) once the
--     project is past 'open' or the milestone is past 'draft' (agreement immutability).

create table public.milestone_transitions (
  from_status public.milestone_status not null,
  to_status public.milestone_status not null,
  actor_kind public.milestone_actor_kind not null,
  created_at timestamptz not null default now(),
  primary key (from_status, to_status, actor_kind),
  constraint milestone_transitions_not_loop_chk check (from_status <> to_status)
);

alter table public.milestone_transitions enable row level security;

revoke all on table public.milestone_transitions from anon, authenticated;
grant select on table public.milestone_transitions to authenticated;

create policy milestone_transitions_select_authenticated
  on public.milestone_transitions for select to authenticated
  using (true);

insert into public.milestone_transitions (from_status, to_status, actor_kind) values
  -- Phase 4: payment webhook
  ('draft', 'funded', 'system'),
  -- Phase 2: freelancer / client RPCs
  ('funded', 'in_progress', 'freelancer'),
  ('in_progress', 'submitted', 'freelancer'),
  ('revision_requested', 'in_progress', 'freelancer'),
  ('submitted', 'revision_requested', 'client'),
  ('submitted', 'approved', 'client'),
  -- Phase 4: auto-approve cron, ledger release
  ('submitted', 'approved', 'system'),
  ('approved', 'released', 'system'),
  -- Phase 7: disputes
  ('funded', 'disputed', 'client'),
  ('funded', 'disputed', 'freelancer'),
  ('in_progress', 'disputed', 'client'),
  ('in_progress', 'disputed', 'freelancer'),
  ('submitted', 'disputed', 'client'),
  ('submitted', 'disputed', 'freelancer'),
  ('disputed', 'released', 'system'),
  ('disputed', 'released', 'admin'),
  ('disputed', 'refunded', 'system'),
  ('disputed', 'refunded', 'admin'),
  ('disputed', 'partially_released', 'system'),
  ('disputed', 'partially_released', 'admin'),
  -- Phase 5 / 8: abandonment
  ('funded', 'abandoned', 'client'),
  ('in_progress', 'abandoned', 'client'),
  ('abandoned', 'refunded', 'system'),
  ('abandoned', 'reassigned', 'system')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Status guard. Applies to every role, including the table owner.
-- ---------------------------------------------------------------------------
create or replace function public._milestones_guard_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is not distinct from old.status then
    return new;
  end if;
  if coalesce(current_setting('app.via_rpc', true), '') <> 'on' then
    raise exception using errcode = '42501', message = 'milestone_status_locked',
      detail = 'milestone status changes must go through public._transition_milestone';
  end if;
  if not exists (
    select 1 from public.milestone_transitions t
     where t.from_status = old.status and t.to_status = new.status
  ) then
    raise exception using errcode = 'P0001', message = 'invalid_status',
      detail = format('illegal milestone transition %s -> %s', old.status, new.status);
  end if;
  return new;
end;
$$;

revoke execute on function public._milestones_guard_status() from public, anon, authenticated;

create trigger milestones_guard_status
  before update of status on public.milestones
  for each row execute function public._milestones_guard_status();

-- ---------------------------------------------------------------------------
-- Terms guard (agreement immutability groundwork).
-- When the parent project row no longer exists (cascade delete) the change is allowed.
-- ---------------------------------------------------------------------------
create or replace function public._milestones_guard_terms()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_project_status public.project_status;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'draft' then
      raise exception using errcode = 'P0001', message = 'invalid_status',
        detail = 'milestones are created as draft';
    end if;
    select p.status into v_project_status from public.projects p where p.id = new.project_id;
  elsif tg_op = 'UPDATE' then
    if (new.project_id, new.position, new.title, new.deliverable, new.acceptance_criteria,
        new.amount_paise, new.due_date)
       is not distinct from
       (old.project_id, old.position, old.title, old.deliverable, old.acceptance_criteria,
        old.amount_paise, old.due_date) then
      return new;
    end if;
    if new.project_id <> old.project_id then
      raise exception using errcode = 'P0001', message = 'invalid_status',
        detail = 'milestones cannot move between projects';
    end if;
    if old.status <> 'draft' then
      raise exception using errcode = 'P0001', message = 'invalid_status',
        detail = 'milestone terms are locked once funded';
    end if;
    select p.status into v_project_status from public.projects p where p.id = old.project_id;
  else -- DELETE
    select p.status into v_project_status from public.projects p where p.id = old.project_id;
    if v_project_status is not null and old.status <> 'draft' then
      raise exception using errcode = 'P0001', message = 'invalid_status',
        detail = 'milestones past draft cannot be deleted';
    end if;
  end if;

  if v_project_status is not null and v_project_status not in ('draft', 'open') then
    raise exception using errcode = 'P0001', message = 'invalid_status',
      detail = 'milestone terms are locked once the project is awarded';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke execute on function public._milestones_guard_terms() from public, anon, authenticated;

create trigger milestones_guard_terms
  before insert or update or delete on public.milestones
  for each row execute function public._milestones_guard_terms();

-- ---------------------------------------------------------------------------
-- _transition_milestone: the single writer of milestones.status.
-- Raises P0001 milestone_not_found / invalid_status. Side effects:
--   revision_requested => revision_count + 1; timestamps; history row; audit row;
--   first `funded` milestone moves an `awarded` project to `in_progress`.
-- Not security definer and not executable by anon/authenticated: only the definer
-- rpc_* functions (owner postgres), payment webhooks (service_role / postgres) and
-- cron jobs call it.
-- ---------------------------------------------------------------------------
create or replace function public._transition_milestone(
  p_milestone_id uuid,
  p_to public.milestone_status,
  p_actor_kind public.milestone_actor_kind,
  p_actor_id uuid,
  p_note text default null
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_m public.milestones%rowtype;
  v_note text := nullif(btrim(p_note), '');
begin
  if p_milestone_id is null or p_to is null or p_actor_kind is null then
    raise exception using errcode = 'P0001', message = 'invalid_input';
  end if;

  select * into v_m from public.milestones m where m.id = p_milestone_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'milestone_not_found';
  end if;

  if not exists (
    select 1 from public.milestone_transitions t
     where t.from_status = v_m.status and t.to_status = p_to and t.actor_kind = p_actor_kind
  ) then
    raise exception using errcode = 'P0001', message = 'invalid_status',
      detail = format('%s -> %s is not allowed for %s', v_m.status, p_to, p_actor_kind);
  end if;

  perform set_config('app.via_rpc', 'on', true);
  update public.milestones m
     set status = p_to,
         revision_count = m.revision_count + (case when p_to = 'revision_requested' then 1 else 0 end),
         started_at = case when p_to = 'in_progress' then coalesce(m.started_at, now()) else m.started_at end,
         submitted_at = case when p_to = 'submitted' then now() else m.submitted_at end,
         approved_at = case when p_to = 'approved' then now() else m.approved_at end,
         released_at = case when p_to in ('released', 'partially_released') then now() else m.released_at end
   where m.id = p_milestone_id;
  perform set_config('app.via_rpc', 'off', true);

  insert into public.milestone_status_history (milestone_id, from_status, to_status, actor_id, actor_kind, note)
  values (p_milestone_id, v_m.status, p_to, p_actor_id, p_actor_kind, left(v_note, 2000));

  if p_to = 'funded' then
    update public.projects p
       set status = 'in_progress'
     where p.id = v_m.project_id and p.status = 'awarded';
  end if;

  perform public.write_audit(
    'milestone.' || p_to::text, 'milestone', p_milestone_id,
    jsonb_build_object(
      'project_id', v_m.project_id, 'from', v_m.status, 'to', p_to,
      'actor_kind', p_actor_kind, 'actor_id', p_actor_id, 'note', v_note));
end;
$$;

revoke execute on function public._transition_milestone(
  uuid, public.milestone_status, public.milestone_actor_kind, uuid, text
) from public, anon, authenticated;
