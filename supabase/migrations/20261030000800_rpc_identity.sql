-- Identity RPCs. All are security definer, validate auth.uid() and inputs, and
-- raise P0001 (bad input / state) or 42501 (not allowed).

-- ---------------------------------------------------------------------------
-- rpc_set_my_roles: replace the caller's non-admin roles.
-- ---------------------------------------------------------------------------
create or replace function public.rpc_set_my_roles(p_roles public.app_role[])
returns public.app_role[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_roles public.app_role[];
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'Not authenticated';
  end if;

  select coalesce(array_agg(distinct r order by r), '{}')
    into v_roles
    from unnest(p_roles) as r
   where r is not null;

  if cardinality(v_roles) = 0 then
    raise exception using errcode = 'P0001', message = 'At least one role (client or freelancer) is required';
  end if;
  if 'admin'::public.app_role = any (v_roles) then
    raise exception using errcode = '42501', message = 'The admin role cannot be self-assigned';
  end if;
  if not exists (select 1 from public.profiles p where p.id = v_uid) then
    raise exception using errcode = 'P0001', message = 'Profile not found';
  end if;

  delete from public.user_roles ur
   where ur.user_id = v_uid
     and ur.role <> 'admin'
     and not (ur.role = any (v_roles));

  insert into public.user_roles (user_id, role)
  select v_uid, r from unnest(v_roles) as r
  on conflict (user_id, role) do nothing;

  perform public.write_audit('roles.set', 'profile', v_uid, jsonb_build_object('roles', to_jsonb(v_roles)));

  return public.my_roles();
end;
$$;

-- ---------------------------------------------------------------------------
-- rpc_complete_onboarding
-- ---------------------------------------------------------------------------
create or replace function public.rpc_complete_onboarding()
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles%rowtype;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'Not authenticated';
  end if;

  select * into v_profile from public.profiles p where p.id = v_uid for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'Profile not found';
  end if;

  if v_profile.onboarding_completed_at is not null then
    return v_profile.onboarding_completed_at;
  end if;

  if v_profile.full_name is null or btrim(v_profile.full_name) = '' then
    raise exception using errcode = 'P0001', message = 'Full name is required to complete onboarding';
  end if;
  if v_profile.city is null or btrim(v_profile.city) = '' then
    raise exception using errcode = 'P0001', message = 'City is required to complete onboarding';
  end if;
  if not exists (select 1 from public.user_roles ur where ur.user_id = v_uid) then
    raise exception using errcode = 'P0001', message = 'Choose at least one role to complete onboarding';
  end if;

  update public.profiles p
     set onboarding_completed_at = now()
   where p.id = v_uid
  returning p.onboarding_completed_at into v_profile.onboarding_completed_at;

  perform public.write_audit('onboarding.completed', 'profile', v_uid, '{}'::jsonb);

  return v_profile.onboarding_completed_at;
end;
$$;

-- ---------------------------------------------------------------------------
-- rpc_admin_set_role
-- ---------------------------------------------------------------------------
create or replace function public.rpc_admin_set_role(
  p_user_id uuid,
  p_role public.app_role,
  p_grant boolean
)
returns public.app_role[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_roles public.app_role[];
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception using errcode = '42501', message = 'Admin only';
  end if;
  if p_user_id is null or p_role is null or p_grant is null then
    raise exception using errcode = 'P0001', message = 'user_id, role and grant are required';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_user_id) then
    raise exception using errcode = 'P0001', message = 'User not found';
  end if;
  if not p_grant and p_role = 'admin' and p_user_id = auth.uid() then
    raise exception using errcode = 'P0001', message = 'Admins cannot remove their own admin role';
  end if;

  if p_grant then
    insert into public.user_roles (user_id, role) values (p_user_id, p_role)
    on conflict (user_id, role) do nothing;
  else
    delete from public.user_roles ur where ur.user_id = p_user_id and ur.role = p_role;
  end if;

  perform public.write_audit(
    case when p_grant then 'admin.role.grant' else 'admin.role.revoke' end,
    'profile', p_user_id, jsonb_build_object('role', p_role));

  select coalesce(array_agg(ur.role order by ur.role), '{}')
    into v_roles
    from public.user_roles ur where ur.user_id = p_user_id;
  return v_roles;
end;
$$;

-- ---------------------------------------------------------------------------
-- rpc_admin_flag_user
-- ---------------------------------------------------------------------------
create or replace function public.rpc_admin_flag_user(
  p_user_id uuid,
  p_flagged boolean,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception using errcode = '42501', message = 'Admin only';
  end if;
  if p_user_id is null or p_flagged is null then
    raise exception using errcode = 'P0001', message = 'user_id and flagged are required';
  end if;
  if p_flagged and (p_reason is null or btrim(p_reason) = '') then
    raise exception using errcode = 'P0001', message = 'A reason is required to flag a user';
  end if;

  update public.profiles p set is_flagged = p_flagged where p.id = p_user_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'User not found';
  end if;

  perform public.write_audit(
    case when p_flagged then 'admin.user.flag' else 'admin.user.unflag' end,
    'profile', p_user_id, jsonb_build_object('reason', p_reason));
end;
$$;

-- ---------------------------------------------------------------------------
-- rpc_admin_review_kyc
-- ---------------------------------------------------------------------------
create or replace function public.rpc_admin_review_kyc(
  p_kyc_id uuid,
  p_approve boolean,
  p_reason text default null
)
returns public.kyc_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kyc public.kyc_verifications%rowtype;
  v_status public.kyc_status;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception using errcode = '42501', message = 'Admin only';
  end if;
  if p_kyc_id is null or p_approve is null then
    raise exception using errcode = 'P0001', message = 'kyc_id and approve are required';
  end if;
  if not p_approve and (p_reason is null or btrim(p_reason) = '') then
    raise exception using errcode = 'P0001', message = 'A rejection reason is required';
  end if;

  select * into v_kyc from public.kyc_verifications k where k.id = p_kyc_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'KYC submission not found';
  end if;
  if v_kyc.status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'KYC submission has already been reviewed';
  end if;

  v_status := case when p_approve then 'approved'::public.kyc_status else 'rejected'::public.kyc_status end;

  update public.kyc_verifications k
     set status = v_status,
         reviewed_by = auth.uid(),
         reviewed_at = now(),
         rejection_reason = case when p_approve then null else btrim(p_reason) end
   where k.id = p_kyc_id;

  -- Badge reflects whether the user has any approved KYC.
  update public.profiles p
     set kyc_verified = exists (
           select 1 from public.kyc_verifications k
            where k.user_id = v_kyc.user_id and k.status = 'approved')
   where p.id = v_kyc.user_id;

  perform public.write_audit(
    case when p_approve then 'admin.kyc.approve' else 'admin.kyc.reject' end,
    'kyc_verification', p_kyc_id,
    jsonb_build_object('user_id', v_kyc.user_id, 'reason', p_reason));

  return v_status;
end;
$$;

-- ---------------------------------------------------------------------------
-- rpc_register_push_token: upsert a device token for the caller.
-- A token already owned by ANOTHER account is never reassigned from the client
-- (that allowed user B to hijack A's notifications): it raises 42501. The app
-- must call rpc_unregister_push_token on sign-out so a shared device can be
-- re-registered by the next account. Stale tokens (Expo push receipts with
-- DeviceNotRegistered) are deleted server-side by the push sender (Phase 5).
-- Re-registering an own token is idempotent (refreshes platform/updated_at).
-- ---------------------------------------------------------------------------
create or replace function public.rpc_register_push_token(p_token text, p_platform text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'Not authenticated';
  end if;
  if p_token is null or length(btrim(p_token)) = 0 or length(p_token) > 500 then
    raise exception using errcode = 'P0001', message = 'Invalid push token';
  end if;
  if p_platform is null or p_platform not in ('ios', 'android') then
    raise exception using errcode = 'P0001', message = 'Platform must be ios or android';
  end if;

  insert into public.push_tokens (user_id, token, platform)
  values (v_uid, btrim(p_token), p_platform)
  on conflict (token) do update
    set platform = excluded.platform
    where public.push_tokens.user_id = excluded.user_id
  returning id into v_id;

  -- No row => the token exists and belongs to someone else (also race-safe).
  if v_id is null then
    raise exception using errcode = '42501', message = 'push token already registered to another account';
  end if;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- rpc_unregister_push_token: remove the caller's own token (call on sign-out).
-- Returns true if a row was deleted; never touches other users' tokens.
-- ---------------------------------------------------------------------------
create or replace function public.rpc_unregister_push_token(p_token text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'Not authenticated';
  end if;
  if p_token is null or length(btrim(p_token)) = 0 then
    raise exception using errcode = 'P0001', message = 'Invalid push token';
  end if;

  delete from public.push_tokens t
   where t.token = btrim(p_token) and t.user_id = v_uid;
  return found;
end;
$$;

-- Grants: authenticated only.
revoke execute on function public.rpc_set_my_roles(public.app_role[]) from public, anon;
revoke execute on function public.rpc_complete_onboarding() from public, anon;
revoke execute on function public.rpc_admin_set_role(uuid, public.app_role, boolean) from public, anon;
revoke execute on function public.rpc_admin_flag_user(uuid, boolean, text) from public, anon;
revoke execute on function public.rpc_admin_review_kyc(uuid, boolean, text) from public, anon;
revoke execute on function public.rpc_register_push_token(text, text) from public, anon;
revoke execute on function public.rpc_unregister_push_token(text) from public, anon;

grant execute on function public.rpc_set_my_roles(public.app_role[]) to authenticated;
grant execute on function public.rpc_complete_onboarding() to authenticated;
grant execute on function public.rpc_admin_set_role(uuid, public.app_role, boolean) to authenticated;
grant execute on function public.rpc_admin_flag_user(uuid, boolean, text) to authenticated;
grant execute on function public.rpc_admin_review_kyc(uuid, boolean, text) to authenticated;
grant execute on function public.rpc_register_push_token(text, text) to authenticated;
grant execute on function public.rpc_unregister_push_token(text) to authenticated;
