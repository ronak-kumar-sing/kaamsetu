-- Projects domain helpers:
--   * milestone plan rules (milestone_cap_pct, validate_milestone_plan) + app_config key;
--   * visibility helpers used by RLS policies (security definer => no policy recursion);
--   * internal input parsers used by the rpc_* functions (not callable from the API);
--   * projects.total_paise maintenance trigger.

insert into public.app_config (key, value) values
  ('milestone_cap_slack_pct', '120')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- milestone_cap_pct(n) = least(100, greatest(max_milestone_pct, ceil(slack / n)))
-- Integer maths only: ceil(a / b) = (a + b - 1) / b for positive ints.
-- n <= 0 => 100 (mirrors milestoneCapPct in shared/schemas/projects.ts).
-- ---------------------------------------------------------------------------
create or replace function public.milestone_cap_pct(p_count int)
returns int
language sql
stable
set search_path = ''
as $$
  select case
    when coalesce(p_count, 0) <= 0 then 100
    else least(
      100,
      greatest(
        coalesce((select (c.value #>> '{}')::int from public.app_config c
                   where c.key = 'max_milestone_pct'), 30),
        (coalesce((select (c.value #>> '{}')::int from public.app_config c
                    where c.key = 'milestone_cap_slack_pct'), 120) + p_count - 1) / p_count
      )
    )
  end;
$$;

-- ---------------------------------------------------------------------------
-- validate_milestone_plan: null when OK, else the error key:
--   too_few_milestones      fewer than app_config.min_milestones
--   invalid_input           array lengths differ, or a null / non-positive amount
--   milestone_cap_exceeded  some amount * 100 > total * cap_pct(n)
--   milestone_dates_invalid a due date is null, not after today (Asia/Kolkata), or
--                           earlier than the previous milestone's
-- Exact numeric arithmetic on integers (no floats, no overflow).
-- ---------------------------------------------------------------------------
create or replace function public.validate_milestone_plan(p_amounts bigint[], p_due_dates date[])
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_n int := coalesce(cardinality(p_amounts), 0);
  v_min int;
  v_cap int;
  v_total numeric;
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  select (c.value #>> '{}')::int into v_min from public.app_config c where c.key = 'min_milestones';
  if v_n < coalesce(v_min, 2) then
    return 'too_few_milestones';
  end if;
  if coalesce(cardinality(p_due_dates), 0) <> v_n then
    return 'invalid_input';
  end if;
  if exists (select 1 from unnest(p_amounts) a where a is null or a <= 0) then
    return 'invalid_input';
  end if;

  select sum(a::numeric) into v_total from unnest(p_amounts) a;
  v_cap := public.milestone_cap_pct(v_n);
  if exists (select 1 from unnest(p_amounts) a where a::numeric * 100 > v_total * v_cap) then
    return 'milestone_cap_exceeded';
  end if;

  if exists (select 1 from unnest(p_due_dates) d where d is null or d <= v_today) then
    return 'milestone_dates_invalid';
  end if;
  if exists (
    select 1
      from (
        select t.d, lag(t.d) over (order by t.ord) as prev
          from unnest(p_due_dates) with ordinality as t (d, ord)
      ) s
     where s.prev is not null and s.d < s.prev
  ) then
    return 'milestone_dates_invalid';
  end if;

  return null;
end;
$$;

revoke execute on function public.milestone_cap_pct(int) from public, anon;
revoke execute on function public.validate_milestone_plan(bigint[], date[]) from public, anon;
grant execute on function public.milestone_cap_pct(int) to authenticated;
grant execute on function public.validate_milestone_plan(bigint[], date[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Visibility helpers (security definer, stable, authenticated only).
-- ---------------------------------------------------------------------------

-- The caller's phone if verified (E.164), else null. Used to match phone invites.
create or replace function public.my_verified_phone()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.phone from public.profiles p where p.id = auth.uid() and p.phone_verified;
$$;

-- Active member (client or assigned freelancer) of the project.
create or replace function public.is_project_member(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.project_members pm
     where pm.project_id = p_project_id and pm.user_id = auth.uid() and pm.active
  );
$$;

create or replace function public.is_project_client(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.projects p where p.id = p_project_id and p.client_id = auth.uid()
  );
$$;

-- The caller holds a live invite: pending and unexpired, or accepted. Matched by
-- freelancer_id, or (unbound phone invites) by the caller's verified phone.
create or replace function public.has_project_invite(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.project_invites i
     where i.project_id = p_project_id
       and (i.status = 'accepted' or (i.status = 'pending' and i.expires_at > now()))
       and (
         i.freelancer_id = auth.uid()
         or (i.freelancer_id is null and i.phone_e164 is not null
             and i.phone_e164 = public.my_verified_phone())
       )
  );
$$;

-- Project (and milestone / skill) visibility. Non-members only ever see `open`
-- projects, so "awarded or later => members only" follows automatically, and drafts
-- are visible to their client only.
create or replace function public.can_view_project(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.projects p
     where p.id = p_project_id
       and (
         p.client_id = auth.uid()
         or public.is_admin()
         or public.is_project_member(p.id)
         or (p.status = 'open' and (p.visibility = 'public' or public.has_project_invite(p.id)))
       )
  );
$$;

-- Member of (or admin over) the project that owns the milestone.
create or replace function public.can_view_milestone_activity(p_milestone_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_admin() or exists (
    select 1
      from public.milestones m
      join public.project_members pm on pm.project_id = m.project_id
     where m.id = p_milestone_id and pm.user_id = auth.uid() and pm.active
  );
$$;

revoke execute on function public.my_verified_phone() from public, anon;
revoke execute on function public.is_project_member(uuid) from public, anon;
revoke execute on function public.is_project_client(uuid) from public, anon;
revoke execute on function public.has_project_invite(uuid) from public, anon;
revoke execute on function public.can_view_project(uuid) from public, anon;
revoke execute on function public.can_view_milestone_activity(uuid) from public, anon;
grant execute on function public.my_verified_phone() to authenticated;
grant execute on function public.is_project_member(uuid) to authenticated;
grant execute on function public.is_project_client(uuid) to authenticated;
grant execute on function public.has_project_invite(uuid) to authenticated;
grant execute on function public.can_view_project(uuid) to authenticated;
grant execute on function public.can_view_milestone_activity(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Internal input parsers for the rpc_* functions. They raise
-- P0001 'invalid_input' (detail names the field). Not callable from the API.
-- ---------------------------------------------------------------------------

-- Trim whitespace; null/blank => null (or invalid_input when required); enforce length.
create or replace function public._clean_text(
  p_value text, p_min int, p_max int, p_field text, p_required boolean default true
)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v text := nullif(btrim(p_value, E' \t\r\n'), '');
begin
  if v is null then
    if p_required then
      raise exception using errcode = 'P0001', message = 'invalid_input',
        detail = p_field || ' is required';
    end if;
    return null;
  end if;
  if char_length(v) < p_min or char_length(v) > p_max then
    raise exception using errcode = 'P0001', message = 'invalid_input',
      detail = format('%s must be %s..%s characters', p_field, p_min, p_max);
  end if;
  return v;
end;
$$;

-- JSON number => bigint within [p_min, p_max]; must be an integer.
create or replace function public._json_bigint(
  p_value jsonb, p_min bigint, p_max bigint, p_field text, p_required boolean default true
)
returns bigint
language plpgsql
stable
set search_path = ''
as $$
declare
  v numeric;
begin
  if p_value is null or jsonb_typeof(p_value) = 'null' then
    if p_required then
      raise exception using errcode = 'P0001', message = 'invalid_input',
        detail = p_field || ' is required';
    end if;
    return null;
  end if;
  if jsonb_typeof(p_value) <> 'number' then
    raise exception using errcode = 'P0001', message = 'invalid_input',
      detail = p_field || ' must be a number';
  end if;
  v := (p_value #>> '{}')::numeric;
  if v <> trunc(v) or v < p_min or v > p_max then
    raise exception using errcode = 'P0001', message = 'invalid_input',
      detail = format('%s must be an integer in %s..%s', p_field, p_min, p_max);
  end if;
  return v::bigint;
end;
$$;

create or replace function public._json_bool(p_value jsonb, p_default boolean, p_field text)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_value is null or jsonb_typeof(p_value) = 'null' then
    return p_default;
  end if;
  if jsonb_typeof(p_value) <> 'boolean' then
    raise exception using errcode = 'P0001', message = 'invalid_input',
      detail = p_field || ' must be a boolean';
  end if;
  return (p_value #>> '{}')::boolean;
end;
$$;

-- JSON string 'YYYY-MM-DD' => date.
create or replace function public._json_date(p_value jsonb, p_field text)
returns date
language plpgsql
stable
set search_path = ''
as $$
declare
  v text;
begin
  if p_value is null or jsonb_typeof(p_value) <> 'string'
     or (p_value #>> '{}') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    raise exception using errcode = 'P0001', message = 'invalid_input',
      detail = p_field || ' must be a YYYY-MM-DD date';
  end if;
  v := p_value #>> '{}';
  begin
    return v::date;
  exception when others then
    raise exception using errcode = 'P0001', message = 'invalid_input',
      detail = p_field || ' is not a valid date';
  end;
end;
$$;

-- JSON array of uuid strings => distinct uuid[] (null => '{}').
create or replace function public._json_uuid_array(p_value jsonb, p_max int, p_field text)
returns uuid[]
language plpgsql
stable
set search_path = ''
as $$
declare
  v_ids uuid[];
begin
  if p_value is null or jsonb_typeof(p_value) = 'null' then
    return '{}'::uuid[];
  end if;
  if jsonb_typeof(p_value) <> 'array' or exists (
    select 1 from jsonb_array_elements(p_value) e
     where jsonb_typeof(e) <> 'string'
        or (e #>> '{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ) then
    raise exception using errcode = 'P0001', message = 'invalid_input',
      detail = p_field || ' must be an array of uuids';
  end if;
  select coalesce(array_agg(distinct (e #>> '{}')::uuid), '{}'::uuid[])
    into v_ids
    from jsonb_array_elements(p_value) e;
  if cardinality(v_ids) > p_max then
    raise exception using errcode = 'P0001', message = 'invalid_input',
      detail = format('%s accepts at most %s items', p_field, p_max);
  end if;
  return v_ids;
end;
$$;

-- Milestone plan JSON => rows in input order (pos = 1..n), at most 20.
-- p_full: also require deliverable / acceptance_criteria (drafts). Proposal
-- counter-plans use _parse_proposal_plan instead.
create or replace function public._parse_milestone_plan(p_items jsonb, p_full boolean)
returns table (
  pos int, title text, deliverable text, acceptance_criteria text, amount_paise bigint, due_date date
)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_item jsonb;
  v_ord bigint;
  v_field text;
begin
  if p_items is null or jsonb_typeof(p_items) = 'null' then
    return;
  end if;
  if jsonb_typeof(p_items) <> 'array' then
    raise exception using errcode = 'P0001', message = 'invalid_input',
      detail = 'milestones must be an array';
  end if;
  if jsonb_array_length(p_items) > 20 then
    raise exception using errcode = 'P0001', message = 'invalid_input',
      detail = 'at most 20 milestones';
  end if;
  for v_item, v_ord in select e.value, e.ord from jsonb_array_elements(p_items) with ordinality as e (value, ord) loop
    v_field := format('milestones[%s]', v_ord - 1);
    if jsonb_typeof(v_item) <> 'object' then
      raise exception using errcode = 'P0001', message = 'invalid_input',
        detail = v_field || ' must be an object';
    end if;
    pos := v_ord::int;
    title := public._clean_text(v_item ->> 'title', 3, 120, v_field || '.title');
    if p_full then
      deliverable := public._clean_text(v_item ->> 'deliverable', 10, 2000, v_field || '.deliverable');
      acceptance_criteria := public._clean_text(
        v_item ->> 'acceptance_criteria', 10, 2000, v_field || '.acceptance_criteria');
    else
      deliverable := null;
      acceptance_criteria := null;
    end if;
    amount_paise := public._json_bigint(
      v_item -> 'amount_paise', 10000, 10000000000, v_field || '.amount_paise');
    due_date := public._json_date(v_item -> 'due_date', v_field || '.due_date');
    return next;
  end loop;
end;
$$;

-- Proposal counter-plan JSON (D26) => rows in input order (pos = 1..n), at most 20.
-- Row: {source_milestone_id uuid|null, title, amount_paise, due_date,
--       deliverable|null, acceptance_criteria|null}.
--   * source_milestone_id must be a milestone of p_project_id, unique within the plan;
--   * rows without a source must carry deliverable + acceptance_criteria (10..2000);
--   * rows with a source inherit the source's texts where theirs are null.
-- deliverable / acceptance_criteria are the texts as given (null = inherit; this is
-- what rpc_submit_proposal stores); final_* are the resolved texts for new milestones.
-- Rows are matched by id, never by position. Raises invalid_input (detail = field).
create or replace function public._parse_proposal_plan(p_project_id uuid, p_items jsonb)
returns table (
  pos int, source_milestone_id uuid, title text, deliverable text, acceptance_criteria text,
  amount_paise bigint, due_date date, final_deliverable text, final_acceptance_criteria text
)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_item jsonb;
  v_ord bigint;
  v_field text;
  v_src_text text;
  v_seen uuid[] := '{}';
  v_src public.milestones%rowtype;
begin
  if p_items is null or jsonb_typeof(p_items) = 'null' then
    return;
  end if;
  if jsonb_typeof(p_items) <> 'array' then
    raise exception using errcode = 'P0001', message = 'invalid_input',
      detail = 'milestone_edits must be an array';
  end if;
  if jsonb_array_length(p_items) > 20 then
    raise exception using errcode = 'P0001', message = 'invalid_input',
      detail = 'at most 20 milestones';
  end if;
  for v_item, v_ord in select e.value, e.ord from jsonb_array_elements(p_items) with ordinality as e (value, ord) loop
    v_field := format('milestone_edits[%s]', v_ord - 1);
    if jsonb_typeof(v_item) <> 'object' then
      raise exception using errcode = 'P0001', message = 'invalid_input',
        detail = v_field || ' must be an object';
    end if;
    pos := v_ord::int;

    source_milestone_id := null;
    if v_item ? 'source_milestone_id' and jsonb_typeof(v_item -> 'source_milestone_id') <> 'null' then
      v_src_text := v_item ->> 'source_milestone_id';
      if jsonb_typeof(v_item -> 'source_milestone_id') <> 'string'
         or v_src_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        raise exception using errcode = 'P0001', message = 'invalid_input',
          detail = v_field || '.source_milestone_id must be a uuid';
      end if;
      source_milestone_id := v_src_text::uuid;
      if source_milestone_id = any (v_seen) then
        raise exception using errcode = 'P0001', message = 'invalid_input',
          detail = v_field || '.source_milestone_id is used twice';
      end if;
      v_seen := v_seen || source_milestone_id;
      select * into v_src from public.milestones m
       where m.id = source_milestone_id and m.project_id = p_project_id;
      if not found then
        raise exception using errcode = 'P0001', message = 'invalid_input',
          detail = v_field || '.source_milestone_id is not a milestone of this project';
      end if;
    end if;

    title := public._clean_text(v_item ->> 'title', 3, 120, v_field || '.title');
    deliverable := public._clean_text(
      v_item ->> 'deliverable', 10, 2000, v_field || '.deliverable', source_milestone_id is null);
    acceptance_criteria := public._clean_text(
      v_item ->> 'acceptance_criteria', 10, 2000, v_field || '.acceptance_criteria',
      source_milestone_id is null);
    amount_paise := public._json_bigint(
      v_item -> 'amount_paise', 10000, 10000000000, v_field || '.amount_paise');
    due_date := public._json_date(v_item -> 'due_date', v_field || '.due_date');

    if source_milestone_id is null then
      final_deliverable := deliverable;
      final_acceptance_criteria := acceptance_criteria;
    else
      final_deliverable := coalesce(deliverable, v_src.deliverable);
      final_acceptance_criteria := coalesce(acceptance_criteria, v_src.acceptance_criteria);
    end if;
    return next;
  end loop;
end;
$$;

revoke execute on function public._clean_text(text, int, int, text, boolean) from public, anon, authenticated;
revoke execute on function public._parse_proposal_plan(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public._json_bigint(jsonb, bigint, bigint, text, boolean) from public, anon, authenticated;
revoke execute on function public._json_bool(jsonb, boolean, text) from public, anon, authenticated;
revoke execute on function public._json_date(jsonb, text) from public, anon, authenticated;
revoke execute on function public._json_uuid_array(jsonb, int, text) from public, anon, authenticated;
revoke execute on function public._parse_milestone_plan(jsonb, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- projects.total_paise = sum(milestones.amount_paise).
-- Statement-level AFTER triggers with transition tables: each affected project is
-- recomputed once per statement from the table itself, so multi-row inserts,
-- updates (including project_id moves) and deletes are always exact.
-- ---------------------------------------------------------------------------
create or replace function public._milestones_sync_total()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_ids uuid[];
begin
  if tg_op = 'INSERT' then
    select array_agg(distinct n.project_id) into v_ids from new_rows n;
  elsif tg_op = 'DELETE' then
    select array_agg(distinct o.project_id) into v_ids from old_rows o;
  else
    select array_agg(distinct x.project_id) into v_ids
      from (select n.project_id from new_rows n union select o.project_id from old_rows o) x;
  end if;

  -- Only touch projects whose total actually changed (status-only updates are no-ops).
  update public.projects p
     set total_paise = s.total
    from (
      select pid, coalesce((select sum(m.amount_paise) from public.milestones m
                             where m.project_id = pid), 0) as total
        from unnest(v_ids) as pid
    ) s
   where p.id = s.pid and p.total_paise <> s.total;
  return null;
end;
$$;

revoke execute on function public._milestones_sync_total() from public, anon, authenticated;

create trigger milestones_sync_total_ins
  after insert on public.milestones
  referencing new table as new_rows
  for each statement execute function public._milestones_sync_total();

create trigger milestones_sync_total_upd
  after update on public.milestones
  referencing new table as new_rows old table as old_rows
  for each statement execute function public._milestones_sync_total();

create trigger milestones_sync_total_del
  after delete on public.milestones
  referencing old table as old_rows
  for each statement execute function public._milestones_sync_total();
