-- Local development seed (Phase 1). Full seed data arrives in Phase 9.
-- Dev admin: phone +91 90000 00009, OTP 123456 (see [auth.sms.test_otp] in config.toml).

do $$
declare
  v_admin_id constant uuid := '00000000-0000-4000-a000-000000000009';
  v_phone constant text := '919000000009';
begin
  insert into auth.users (
    instance_id, id, aud, role, phone, phone_confirmed_at,
    email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, is_super_admin, is_sso_user, is_anonymous,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token,
    created_at, updated_at
  ) values (
    '00000000-0000-0000-0000-000000000000', v_admin_id, 'authenticated', 'authenticated',
    v_phone, now(),
    null, '', null,
    '{"provider": "phone", "providers": ["phone"]}'::jsonb, '{}'::jsonb, false, false, false,
    '', '', '', '',
    '', '', '', '',
    now(), now()
  ) on conflict (id) do nothing;

  insert into auth.identities (
    id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), v_admin_id::text, v_admin_id,
    jsonb_build_object('sub', v_admin_id::text, 'phone', v_phone,
                       'email_verified', false, 'phone_verified', true),
    'phone', now(), now(), now()
  ) on conflict (provider_id, provider) do nothing;

  -- Profile row is created by the on_auth_user_change trigger.
  update public.profiles
     set full_name = 'KaamSetu Admin',
         city = 'Bengaluru',
         onboarding_completed_at = coalesce(onboarding_completed_at, now())
   where id = v_admin_id;

  insert into public.user_roles (user_id, role) values (v_admin_id, 'admin')
  on conflict do nothing;
end;
$$;
