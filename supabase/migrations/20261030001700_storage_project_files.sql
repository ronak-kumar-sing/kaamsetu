-- Object policies for the private `project-files` bucket (created in Phase 1).
-- Path: `<project_id>/<milestone_id>/<file>`; every segment [A-Za-z0-9._-]+, no '..'.
-- Members (and admins) read; the client and the assigned freelancer (= the active
-- members) insert; nobody updates or deletes (no policies).

create or replace function public.can_access_project_file(p_name text, p_write boolean)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_parts text[];
  v_uuid_re constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_project_id uuid;
  v_milestone_id uuid;
begin
  if v_uid is null or p_name is null or position('..' in p_name) > 0 then
    return false;
  end if;
  v_parts := string_to_array(p_name, '/');
  if cardinality(v_parts) <> 3
     or exists (select 1 from unnest(v_parts) s where s !~ '^[A-Za-z0-9._-]+$')
     or v_parts[1] !~ v_uuid_re or v_parts[2] !~ v_uuid_re then
    return false;
  end if;
  v_project_id := v_parts[1]::uuid;
  v_milestone_id := v_parts[2]::uuid;
  if not exists (
    select 1 from public.milestones m where m.id = v_milestone_id and m.project_id = v_project_id
  ) then
    return false;
  end if;
  if not coalesce(p_write, false) and public.is_admin() then
    return true;
  end if;
  return exists (
    select 1 from public.project_members pm
     where pm.project_id = v_project_id and pm.user_id = v_uid and pm.active
  );
end;
$$;

revoke execute on function public.can_access_project_file(text, boolean) from public, anon;
grant execute on function public.can_access_project_file(text, boolean) to authenticated;

create policy project_files_select_member
  on storage.objects for select to authenticated
  using (bucket_id = 'project-files' and public.can_access_project_file(name, false));

create policy project_files_insert_party
  on storage.objects for insert to authenticated
  with check (bucket_id = 'project-files' and public.can_access_project_file(name, true));
