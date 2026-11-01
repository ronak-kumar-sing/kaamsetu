-- Discovery RPCs: rpc_search_projects / rpc_search_freelancers.
-- security definer (one indexed query, no per-row RLS) but each applies the same
-- visibility rules as RLS itself. Keyset pagination, limit clamped to 1..50.
-- Text search: case-insensitive substring (ILIKE, wildcards escaped), backed by
-- pg_trgm GIN indexes.

create extension if not exists pg_trgm with schema extensions;

create index projects_title_trgm_idx
  on public.projects using gin (title extensions.gin_trgm_ops);
create index projects_description_trgm_idx
  on public.projects using gin (description extensions.gin_trgm_ops);
create index profiles_full_name_trgm_idx
  on public.profiles using gin (full_name extensions.gin_trgm_ops);
create index profiles_headline_trgm_idx
  on public.profiles using gin (headline extensions.gin_trgm_ops);
create index profiles_onboarded_idx
  on public.profiles (onboarding_completed_at desc, id desc)
  where onboarding_completed_at is not null and not is_flagged;

-- ILIKE pattern for a free-text query: null when blank; % _ \ escaped; <= 100 chars.
create or replace function public._search_pattern(p_query text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when nullif(btrim(p_query), '') is null then null
    else '%' || replace(replace(replace(left(btrim(p_query), 100), '\', '\\'), '%', '\%'), '_', '\_') || '%'
  end;
$$;

revoke execute on function public._search_pattern(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- rpc_search_projects: open public projects + open projects the caller holds a live
-- invite to. Ordered by published_at desc; pass the last row's published_at as
-- p_cursor for the next page. p_skill_ids matches projects having ANY of the skills.
-- ---------------------------------------------------------------------------
create or replace function public.rpc_search_projects(
  p_query text default null,
  p_skill_ids uuid[] default null,
  p_category text default null,
  p_city text default null,
  p_min_paise bigint default null,
  p_max_paise bigint default null,
  p_takeover_only boolean default false,
  p_limit int default 20,
  p_cursor timestamptz default null
)
returns table (
  id uuid,
  client_id uuid,
  title text,
  description text,
  category text,
  city text,
  is_remote boolean,
  visibility public.project_visibility,
  status public.project_status,
  checkin_cadence_days int,
  revision_limit int,
  deposit_required boolean,
  total_paise bigint,
  is_takeover boolean,
  source_project_id uuid,
  published_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  client_name text,
  client_city text,
  milestone_count int,
  skill_ids uuid[]
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_pattern text := public._search_pattern(p_query);
  v_limit int := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_category text := nullif(btrim(p_category), '');
  v_city text := lower(nullif(btrim(p_city), ''));
  v_skills uuid[] := case when cardinality(p_skill_ids) > 0 then p_skill_ids end;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;

  return query
    select p.id, p.client_id, p.title, p.description, p.category, p.city, p.is_remote,
           p.visibility, p.status, p.checkin_cadence_days, p.revision_limit, p.deposit_required,
           p.total_paise, p.is_takeover, p.source_project_id, p.published_at, p.created_at,
           p.updated_at, cp.full_name, cp.city,
           (select count(*)::int from public.milestones m where m.project_id = p.id),
           coalesce((select array_agg(ps.skill_id order by ps.skill_id)
                       from public.project_skills ps where ps.project_id = p.id), '{}'::uuid[])
      from public.projects p
      join public.profiles cp on cp.id = p.client_id
     where p.status = 'open'
       and (p.visibility = 'public' or public.has_project_invite(p.id))
       and (p_cursor is null or p.published_at < p_cursor)
       and (v_pattern is null
            or p.title ilike v_pattern escape '\'
            or p.description ilike v_pattern escape '\')
       and (v_skills is null or exists (
             select 1 from public.project_skills ps
              where ps.project_id = p.id and ps.skill_id = any (v_skills)))
       and (v_category is null or p.category = v_category)
       and (v_city is null or lower(p.city) = v_city)
       and (p_min_paise is null or p.total_paise >= p_min_paise)
       and (p_max_paise is null or p.total_paise <= p_max_paise)
       and (not coalesce(p_takeover_only, false) or p.is_takeover)
     order by p.published_at desc, p.id desc
     limit v_limit;
end;
$$;

-- ---------------------------------------------------------------------------
-- rpc_search_freelancers: onboarded, unflagged users with the freelancer role.
-- Ordered by onboarding_completed_at desc; pass the last row's
-- onboarding_completed_at as p_cursor. Returns public profile fields only.
-- ---------------------------------------------------------------------------
create or replace function public.rpc_search_freelancers(
  p_query text default null,
  p_skill_ids uuid[] default null,
  p_city text default null,
  p_limit int default 20,
  p_cursor timestamptz default null
)
returns table (
  id uuid,
  full_name text,
  avatar_path text,
  headline text,
  bio text,
  city text,
  languages text[],
  hourly_rate_paise bigint,
  availability public.availability_status,
  phone_verified boolean,
  email_verified boolean,
  kyc_verified boolean,
  portfolio_verified boolean,
  onboarding_completed_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  skill_ids uuid[]
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_pattern text := public._search_pattern(p_query);
  v_limit int := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_city text := lower(nullif(btrim(p_city), ''));
  v_skills uuid[] := case when cardinality(p_skill_ids) > 0 then p_skill_ids end;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;

  return query
    select pr.id, pr.full_name, pr.avatar_path, pr.headline, pr.bio, pr.city, pr.languages,
           pr.hourly_rate_paise, pr.availability, pr.phone_verified, pr.email_verified,
           pr.kyc_verified, pr.portfolio_verified, pr.onboarding_completed_at, pr.created_at,
           pr.updated_at,
           coalesce((select array_agg(s.skill_id order by s.skill_id)
                       from public.profile_skills s where s.profile_id = pr.id), '{}'::uuid[])
      from public.profiles pr
     where pr.onboarding_completed_at is not null
       and not pr.is_flagged
       and exists (select 1 from public.user_roles ur
                    where ur.user_id = pr.id and ur.role = 'freelancer')
       and (p_cursor is null or pr.onboarding_completed_at < p_cursor)
       and (v_pattern is null
            or pr.full_name ilike v_pattern escape '\'
            or pr.headline ilike v_pattern escape '\')
       and (v_skills is null or exists (
             select 1 from public.profile_skills s
              where s.profile_id = pr.id and s.skill_id = any (v_skills)))
       and (v_city is null or lower(pr.city) = v_city)
     order by pr.onboarding_completed_at desc, pr.id desc
     limit v_limit;
end;
$$;

revoke execute on function public.rpc_search_projects(
  text, uuid[], text, text, bigint, bigint, boolean, int, timestamptz) from public, anon;
revoke execute on function public.rpc_search_freelancers(
  text, uuid[], text, int, timestamptz) from public, anon;
grant execute on function public.rpc_search_projects(
  text, uuid[], text, text, bigint, bigint, boolean, int, timestamptz) to authenticated;
grant execute on function public.rpc_search_freelancers(
  text, uuid[], text, int, timestamptz) to authenticated;
