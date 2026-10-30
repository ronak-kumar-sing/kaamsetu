-- Base objects shared by every domain: privilege hardening, updated_at trigger,
-- app_config (runtime tunables) and audit_log.

-- ---------------------------------------------------------------------------
-- Privilege hardening.
-- Supabase grants ALL on new public objects to anon/authenticated by default.
-- We revoke those defaults so every table/function must be granted explicitly.
-- service_role keeps its defaults (used by edge functions / admin tooling).
-- ---------------------------------------------------------------------------
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated;
-- PUBLIC execute on functions can only be revoked globally (not per-schema).
alter default privileges for role postgres
  revoke execute on functions from public;

-- ---------------------------------------------------------------------------
-- updated_at trigger function
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke execute on function public.set_updated_at() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- text_array_items_between: true when every element of p_items is non-null
-- and its char_length is within [p_min, p_max] (an empty/NULL array is true).
-- Used by CHECK constraints (subqueries are not allowed there directly).
-- Not security definer. EXECUTE is needed by roles whose writes evaluate the
-- constraint (authenticated); anon never writes these tables.
-- ---------------------------------------------------------------------------
create or replace function public.text_array_items_between(p_items text[], p_min int, p_max int)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(bool_and(x is not null and char_length(x) between p_min and p_max), true)
  from unnest(p_items) as x;
$$;

revoke execute on function public.text_array_items_between(text[], int, int) from public, anon;
grant execute on function public.text_array_items_between(text[], int, int) to authenticated;

-- ---------------------------------------------------------------------------
-- app_config: key/value tunables. Readable by authenticated, written only by
-- migrations / service_role.
-- ---------------------------------------------------------------------------
create table public.app_config (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.app_config enable row level security;

create trigger app_config_set_updated_at
  before update on public.app_config
  for each row execute function public.set_updated_at();

revoke all on table public.app_config from anon, authenticated;
grant select on table public.app_config to authenticated;

create policy app_config_select_authenticated
  on public.app_config for select
  to authenticated
  using (true);

insert into public.app_config (key, value) values
  ('max_milestone_pct', '30'),
  ('min_milestones', '2'),
  ('auto_approve_days', '5'),
  ('revision_limit', '2'),
  ('checkin_cadence_days', '2'),
  ('deposit_threshold_paise', '2000000'),
  ('deposit_pct', '5'),
  ('deposit_cap_paise', '500000'),
  ('deposit_forfeit_fee_pct', '10'),
  ('deposit_exempt_min_score', '85'),
  ('deposit_exempt_min_projects', '5')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- audit_log: append-only. Inserted only via public.write_audit() (called from
-- security definer RPCs). Admin SELECT policy is added in the helpers/policies
-- migration once public.is_admin() exists.
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid null,
  action text not null check (length(action) between 1 and 100),
  entity_type text not null check (length(entity_type) between 1 and 100),
  entity_id uuid null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_entity_idx on public.audit_log (entity_type, entity_id, created_at desc);
create index audit_log_actor_idx on public.audit_log (actor_id, created_at desc);

alter table public.audit_log enable row level security;

revoke all on table public.audit_log from anon, authenticated;
grant select on table public.audit_log to authenticated; -- rows gated by admin-only policy

create or replace function public.write_audit(
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_data jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.audit_log (actor_id, action, entity_type, entity_id, data)
  values (auth.uid(), p_action, p_entity_type, p_entity_id, coalesce(p_data, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end;
$$;

-- Not callable from the API: only other security definer functions (owned by
-- postgres) may write audit entries, so clients cannot forge them.
revoke execute on function public.write_audit(text, text, uuid, jsonb) from public, anon, authenticated;
