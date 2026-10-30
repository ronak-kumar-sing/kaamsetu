-- Keep public.profiles in sync with auth.users: creates the profile on signup and
-- mirrors phone/email + their verification state. Clients cannot write these
-- columns (no UPDATE grant), so this trigger is their only writer.

create or replace function public.handle_auth_user_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phone text := nullif(btrim(new.phone), '');
begin
  -- auth stores phones without '+'; profiles store E.164.
  if v_phone is not null and left(v_phone, 1) <> '+' then
    v_phone := '+' || v_phone;
  end if;

  insert into public.profiles (id, phone, email, phone_verified, email_verified)
  values (
    new.id,
    v_phone,
    nullif(lower(btrim(new.email)), ''),
    new.phone_confirmed_at is not null,
    new.email_confirmed_at is not null
  )
  on conflict (id) do update
    set phone = excluded.phone,
        email = excluded.email,
        phone_verified = excluded.phone_verified,
        email_verified = excluded.email_verified
    where (public.profiles.phone, public.profiles.email,
           public.profiles.phone_verified, public.profiles.email_verified)
      is distinct from
          (excluded.phone, excluded.email, excluded.phone_verified, excluded.email_verified);

  return new;
end;
$$;

revoke execute on function public.handle_auth_user_change() from public, anon, authenticated;

create trigger on_auth_user_change
  after insert or update of phone, email, phone_confirmed_at, email_confirmed_at
  on auth.users
  for each row execute function public.handle_auth_user_change();
