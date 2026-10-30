-- Role helpers used by RLS policies and RPCs.
-- security definer so they can read user_roles regardless of the caller's RLS;
-- stable; empty search_path with fully-qualified names; authenticated only.

create or replace function public.has_role(p_role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid() and ur.role = p_role
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_role('admin'::public.app_role);
$$;

create or replace function public.my_roles()
returns public.app_role[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(ur.role order by ur.role), '{}'::public.app_role[])
  from public.user_roles ur
  where ur.user_id = auth.uid();
$$;

-- Private profile columns (phone, email, is_flagged) for the owner or an admin.
-- Returns a composite type (not `returns table`) so generated TS types keep
-- phone/email nullable.
create type public.profile_private as (
  id uuid,
  phone text,
  email text,
  is_flagged boolean
);

create or replace function public.get_profile_private(p_user_id uuid default null)
returns setof public.profile_private
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_target uuid := coalesce(p_user_id, auth.uid());
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Not authenticated';
  end if;
  if v_target <> auth.uid() and not public.is_admin() then
    raise exception using errcode = '42501', message = 'Not allowed to read this profile''s private fields';
  end if;
  return query
    select p.id, p.phone, p.email, p.is_flagged
    from public.profiles p
    where p.id = v_target;
end;
$$;

revoke execute on function public.has_role(public.app_role) from public, anon;
revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.my_roles() from public, anon;
revoke execute on function public.get_profile_private(uuid) from public, anon;
grant execute on function public.has_role(public.app_role) to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.my_roles() to authenticated;
grant execute on function public.get_profile_private(uuid) to authenticated;
