-- Milestone work RPCs (Phase 2 edges of the state machine). Each one authorises the
-- caller, then calls public._transition_milestone, which validates the edge, writes
-- milestone_status_history and audit_log.
-- Callers who are not members of the project get 'milestone_not_found'.

-- Internal: caller must be an active project member (else milestone_not_found).
-- Locks the project (shared) then the milestone, in the global lock order, and
-- returns the locked milestone row.
create or replace function public._lock_milestone(p_milestone_id uuid)
returns public.milestones
language plpgsql
set search_path = ''
as $$
declare
  v_project_id uuid;
  v_milestone public.milestones;
begin
  select m.project_id into v_project_id from public.milestones m where m.id = p_milestone_id;
  if not found or not exists (
    select 1 from public.project_members pm
     where pm.project_id = v_project_id and pm.user_id = auth.uid() and pm.active
  ) then
    raise exception using errcode = 'P0001', message = 'milestone_not_found';
  end if;
  perform 1 from public.projects p where p.id = v_project_id for share;
  select * into v_milestone from public.milestones m where m.id = p_milestone_id for update;
  return v_milestone;
end;
$$;

revoke execute on function public._lock_milestone(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- rpc_start_milestone: assigned freelancer; funded | revision_requested -> in_progress.
-- ---------------------------------------------------------------------------
create or replace function public.rpc_start_milestone(p_milestone_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_m public.milestones;
  v_p public.projects;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  v_m := public._lock_milestone(p_milestone_id);
  select * into v_p from public.projects p where p.id = v_m.project_id;
  if v_p.freelancer_id is distinct from v_uid then
    raise exception using errcode = 'P0001', message = 'not_assigned_freelancer';
  end if;
  if v_m.status not in ('funded', 'revision_requested') then
    raise exception using errcode = 'P0001', message = 'invalid_status';
  end if;

  perform public._transition_milestone(p_milestone_id, 'in_progress', 'freelancer', v_uid, null);
end;
$$;

-- ---------------------------------------------------------------------------
-- rpc_submit_milestone: assigned freelancer; in_progress -> submitted.
-- Needs a note, a link or an attachment. Links: https only (<= 10).
-- Attachments (<= 10): existing objects in `project-files` at
-- `<project_id>/<milestone_id>/<file>`.
-- ---------------------------------------------------------------------------
create or replace function public.rpc_submit_milestone(
  p_milestone_id uuid,
  p_note text,
  p_links text[],
  p_attachment_paths text[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_m public.milestones;
  v_p public.projects;
  v_note text;
  v_links text[];
  v_paths text[];
  v_prefix text;
  v_id uuid;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  v_m := public._lock_milestone(p_milestone_id);
  select * into v_p from public.projects p where p.id = v_m.project_id;
  if v_p.freelancer_id is distinct from v_uid then
    raise exception using errcode = 'P0001', message = 'not_assigned_freelancer';
  end if;
  if v_m.status <> 'in_progress' then
    raise exception using errcode = 'P0001', message = 'invalid_status';
  end if;

  v_note := public._clean_text(p_note, 1, 5000, 'note', false);

  select coalesce(array_agg(btrim(l) order by o), '{}') into v_links
    from unnest(coalesce(p_links, '{}')) with ordinality as t (l, o)
   where nullif(btrim(l), '') is not null;
  if cardinality(v_links) > 10 or exists (
    select 1 from unnest(v_links) l
     where l !~* '^https://[^[:space:]]+$' or char_length(l) > 2048
  ) then
    raise exception using errcode = 'P0001', message = 'invalid_input',
      detail = 'links must be at most 10 https URLs';
  end if;

  v_paths := coalesce(p_attachment_paths, '{}');
  v_prefix := v_p.id::text || '/' || p_milestone_id::text || '/';
  if cardinality(v_paths) > 10 or exists (
    select 1 from unnest(v_paths) a
     where a is null
        or left(a, length(v_prefix)) <> v_prefix
        or substr(a, length(v_prefix) + 1) !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$'
        or position('..' in a) > 0
        or not exists (
          select 1 from storage.objects so where so.bucket_id = 'project-files' and so.name = a
        )
  ) then
    raise exception using errcode = 'P0001', message = 'invalid_input',
      detail = 'attachment_paths must be uploaded project-files objects under <project_id>/<milestone_id>/';
  end if;

  if v_note is null and cardinality(v_links) = 0 and cardinality(v_paths) = 0 then
    raise exception using errcode = 'P0001', message = 'invalid_input',
      detail = 'a submission needs a note, a link or an attachment';
  end if;

  insert into public.submissions as s (milestone_id, submitted_by, note, links, attachment_paths)
  values (p_milestone_id, v_uid, v_note, v_links, v_paths)
  returning s.id into v_id;

  perform public._transition_milestone(p_milestone_id, 'submitted', 'freelancer', v_uid, null);

  perform public.write_audit('submission.created', 'submission', v_id,
    jsonb_build_object('milestone_id', p_milestone_id, 'project_id', v_p.id,
                       'link_count', cardinality(v_links), 'attachment_count', cardinality(v_paths)));

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- rpc_request_revision: project client; submitted -> revision_requested.
-- Raises revision_limit_reached once revision_count >= projects.revision_limit.
-- ---------------------------------------------------------------------------
create or replace function public.rpc_request_revision(p_milestone_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_m public.milestones;
  v_p public.projects;
  v_note text;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  v_m := public._lock_milestone(p_milestone_id);
  select * into v_p from public.projects p where p.id = v_m.project_id;
  if v_p.client_id <> v_uid then
    raise exception using errcode = 'P0001', message = 'not_project_client';
  end if;
  if v_m.status <> 'submitted' then
    raise exception using errcode = 'P0001', message = 'invalid_status';
  end if;
  if v_m.revision_count >= v_p.revision_limit then
    raise exception using errcode = 'P0001', message = 'revision_limit_reached';
  end if;

  v_note := public._clean_text(p_note, 1, 2000, 'note', false);

  perform public._transition_milestone(p_milestone_id, 'revision_requested', 'client', v_uid, v_note);
end;
$$;

-- ---------------------------------------------------------------------------
-- rpc_approve_milestone: project client; submitted -> approved (release: Phase 4).
-- ---------------------------------------------------------------------------
create or replace function public.rpc_approve_milestone(p_milestone_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_m public.milestones;
  v_p public.projects;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  v_m := public._lock_milestone(p_milestone_id);
  select * into v_p from public.projects p where p.id = v_m.project_id;
  if v_p.client_id <> v_uid then
    raise exception using errcode = 'P0001', message = 'not_project_client';
  end if;
  if v_m.status <> 'submitted' then
    raise exception using errcode = 'P0001', message = 'invalid_status';
  end if;

  perform public._transition_milestone(p_milestone_id, 'approved', 'client', v_uid, null);
end;
$$;

revoke execute on function public.rpc_start_milestone(uuid) from public, anon;
revoke execute on function public.rpc_submit_milestone(uuid, text, text[], text[]) from public, anon;
revoke execute on function public.rpc_request_revision(uuid, text) from public, anon;
revoke execute on function public.rpc_approve_milestone(uuid) from public, anon;

grant execute on function public.rpc_start_milestone(uuid) to authenticated;
grant execute on function public.rpc_submit_milestone(uuid, text, text[], text[]) to authenticated;
grant execute on function public.rpc_request_revision(uuid, text) to authenticated;
grant execute on function public.rpc_approve_milestone(uuid) to authenticated;
