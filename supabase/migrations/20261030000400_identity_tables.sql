-- Identity tables: profiles, user_roles, skills, profile_skills, portfolio_items,
-- kyc_verifications, push_tokens, plus the public_profiles view.
-- RLS is enabled here (default deny); policies live in ..._identity_policies.sql.

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  -- Bounds mirror shared/schemas/identity.ts (profileSetupSchema / freelancerDetailsSchema).
  -- full_name/city stay NULL until onboarding.
  full_name text check (
    full_name is null
    or (char_length(full_name) between 2 and 80 and char_length(btrim(full_name)) >= 2)
  ),
  -- Object in the `avatars` bucket under the owner's folder: `<id>/<file>`, one level,
  -- no traversal (see storage migration).
  avatar_path text check (
    avatar_path is null
    or (
      avatar_path ~ ('^' || id::text || '/[A-Za-z0-9][A-Za-z0-9._-]{0,127}$')
      and position('..' in avatar_path) = 0
    )
  ),
  headline text check (headline is null or char_length(headline) <= 120),
  bio text check (bio is null or char_length(bio) <= 1000),
  city text check (
    city is null or (char_length(city) <= 60 and char_length(btrim(city)) >= 2)
  ),
  languages text[] not null default '{}' check (
    cardinality(languages) <= 10 and public.text_array_items_between(languages, 2, 30)
  ),
  -- <= ₹1,00,000/hr
  hourly_rate_paise bigint check (hourly_rate_paise between 0 and 10000000),
  availability public.availability_status not null default 'available',
  phone text,
  email text,
  phone_verified boolean not null default false,
  email_verified boolean not null default false,
  kyc_verified boolean not null default false,
  portfolio_verified boolean not null default false,
  onboarding_completed_at timestamptz,
  is_flagged boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_city_idx on public.profiles (city);

alter table public.profiles enable row level security;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Column-level privileges. Any authenticated user may read PUBLIC columns of
-- any profile (RLS policy allows all rows); phone, email and is_flagged are
-- not granted, so selecting them fails with 42501. Owners/admins read those
-- via public.get_profile_private(). Only profile-editable columns are
-- UPDATE-able; verification flags etc. are written by triggers/RPCs only.
revoke all on table public.profiles from anon, authenticated;
grant select (
  id, full_name, avatar_path, headline, bio, city, languages, hourly_rate_paise,
  availability, phone_verified, email_verified, kyc_verified, portfolio_verified,
  onboarding_completed_at, created_at, updated_at
) on table public.profiles to authenticated;
grant update (
  full_name, avatar_path, headline, bio, city, languages, hourly_rate_paise, availability
) on table public.profiles to authenticated;

-- Safe projection for clients: `select *` works here (it does not on profiles,
-- because of the column grants). security_invoker => caller's RLS + grants apply.
create view public.public_profiles
with (security_invoker = on) as
select
  id, full_name, avatar_path, headline, bio, city, languages, hourly_rate_paise,
  availability, phone_verified, email_verified, kyc_verified, portfolio_verified,
  onboarding_completed_at, created_at, updated_at
from public.profiles;

revoke all on table public.public_profiles from anon, authenticated;
grant select on table public.public_profiles to authenticated;

-- ---------------------------------------------------------------------------
-- user_roles
-- ---------------------------------------------------------------------------
create table public.user_roles (
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

alter table public.user_roles enable row level security;

revoke all on table public.user_roles from anon, authenticated;
grant select on table public.user_roles to authenticated; -- writes via rpc_* only

-- ---------------------------------------------------------------------------
-- skills (reference data)
-- ---------------------------------------------------------------------------
create table public.skills (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null,
  category text not null,
  created_at timestamptz not null default now()
);

create index skills_category_idx on public.skills (category);

alter table public.skills enable row level security;

revoke all on table public.skills from anon, authenticated;
grant select on table public.skills to anon, authenticated;

insert into public.skills (slug, name, category) values
  ('logo-design', 'Logo Design', 'design'),
  ('ui-ux-design', 'UI/UX Design', 'design'),
  ('graphic-design', 'Graphic Design', 'design'),
  ('illustration', 'Illustration', 'design'),
  ('packaging-design', 'Packaging Design', 'design'),
  ('web-development', 'Web Development', 'development'),
  ('react-native', 'React Native', 'development'),
  ('android-development', 'Android Development', 'development'),
  ('ios-development', 'iOS Development', 'development'),
  ('wordpress', 'WordPress', 'development'),
  ('shopify', 'Shopify', 'development'),
  ('python', 'Python', 'development'),
  ('content-writing', 'Content Writing', 'writing'),
  ('copywriting', 'Copywriting', 'writing'),
  ('hindi-translation', 'Hindi Translation', 'writing'),
  ('technical-writing', 'Technical Writing', 'writing'),
  ('seo', 'SEO', 'marketing'),
  ('social-media-marketing', 'Social Media Marketing', 'marketing'),
  ('performance-marketing', 'Performance Marketing', 'marketing'),
  ('email-marketing', 'Email Marketing', 'marketing'),
  ('video-editing', 'Video Editing', 'video'),
  ('motion-graphics', 'Motion Graphics', 'video'),
  ('youtube-production', 'YouTube Production', 'video'),
  ('product-photography', 'Product Photography', 'photography'),
  ('wedding-photography', 'Wedding Photography', 'photography'),
  ('photo-editing', 'Photo Editing', 'photography'),
  ('bookkeeping', 'Bookkeeping', 'accounting'),
  ('gst-filing', 'GST Filing', 'accounting'),
  ('tally', 'Tally', 'accounting'),
  ('data-entry', 'Data Entry', 'admin-support'),
  ('virtual-assistant', 'Virtual Assistant', 'admin-support'),
  ('voice-over', 'Voice Over', 'audio')
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- profile_skills
-- ---------------------------------------------------------------------------
create table public.profile_skills (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  skill_id uuid not null references public.skills (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, skill_id)
);

create index profile_skills_skill_idx on public.profile_skills (skill_id);

alter table public.profile_skills enable row level security;

revoke all on table public.profile_skills from anon, authenticated;
grant select, delete on table public.profile_skills to authenticated;
grant insert (profile_id, skill_id) on table public.profile_skills to authenticated;

-- ---------------------------------------------------------------------------
-- portfolio_items
-- ---------------------------------------------------------------------------
create table public.portfolio_items (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  kind public.portfolio_kind not null,
  title text not null check (char_length(title) <= 120 and char_length(btrim(title)) >= 1),
  url text null check (
    url is null or (url ~* '^https://[^[:space:]]+$' and char_length(url) <= 2048)
  ),
  -- Object in the `portfolio` bucket under the owner's folder: `<profile_id>/<file>`,
  -- one level, no traversal (LIKE '<id>/%' allowed '<id>/../<victim>/x').
  storage_path text null check (
    storage_path is null
    or (
      storage_path ~ ('^' || profile_id::text || '/[A-Za-z0-9][A-Za-z0-9._-]{0,127}$')
      and position('..' in storage_path) = 0
    )
  ),
  description text check (description is null or char_length(description) <= 1000),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- links carry a url; files/images carry an object in the `portfolio` bucket
  -- under the owner's folder.
  constraint portfolio_items_source_chk check (
    (kind = 'link' and url is not null and storage_path is null)
    or (
      kind in ('file', 'image')
      and url is null
      and storage_path is not null
    )
  )
);

create index portfolio_items_profile_idx on public.portfolio_items (profile_id, sort_order);

alter table public.portfolio_items enable row level security;

create trigger portfolio_items_set_updated_at
  before update on public.portfolio_items
  for each row execute function public.set_updated_at();

revoke all on table public.portfolio_items from anon, authenticated;
grant select, delete on table public.portfolio_items to authenticated;
grant insert (profile_id, kind, title, url, storage_path, description, sort_order)
  on table public.portfolio_items to authenticated;
grant update (kind, title, url, storage_path, description, sort_order)
  on table public.portfolio_items to authenticated;

-- ---------------------------------------------------------------------------
-- kyc_verifications
-- Inserted by an edge function (service_role). Reviewed via rpc_admin_review_kyc.
-- id_hash (peppered hash of the full ID number) is never exposed to clients.
-- ---------------------------------------------------------------------------
create table public.kyc_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  doc_type public.kyc_doc_type not null,
  id_last4 char(4) not null check (id_last4 ~ '^[0-9A-Z]{4}$'),
  id_hash text not null,
  -- Object in the private `kyc` bucket under the owner's folder: `<user_id>/<file>`.
  storage_path text not null check (
    storage_path ~ ('^' || user_id::text || '/[A-Za-z0-9][A-Za-z0-9._-]{0,127}$')
    and position('..' in storage_path) = 0
  ),
  status public.kyc_status not null default 'pending',
  provider text not null default 'manual',
  reviewed_by uuid null references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  rejection_reason text check (rejection_reason is null or length(rejection_reason) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint kyc_review_consistency_chk check (
    (status = 'pending' and reviewed_at is null)
    or (status <> 'pending' and reviewed_at is not null)
  ),
  constraint kyc_rejection_reason_chk check (
    status <> 'rejected' or rejection_reason is not null
  )
);

create unique index kyc_verifications_one_pending_per_user
  on public.kyc_verifications (user_id) where status = 'pending';
create index kyc_verifications_user_idx on public.kyc_verifications (user_id, created_at desc);
create index kyc_verifications_status_idx on public.kyc_verifications (status, created_at);
create index kyc_verifications_id_hash_idx on public.kyc_verifications (id_hash);

alter table public.kyc_verifications enable row level security;

create trigger kyc_verifications_set_updated_at
  before update on public.kyc_verifications
  for each row execute function public.set_updated_at();

revoke all on table public.kyc_verifications from anon, authenticated;
grant select (
  id, user_id, doc_type, id_last4, storage_path, status, provider, reviewed_by,
  reviewed_at, rejection_reason, created_at, updated_at
) on table public.kyc_verifications to authenticated;

-- ---------------------------------------------------------------------------
-- push_tokens
-- ---------------------------------------------------------------------------
create table public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  token text not null unique check (length(token) between 1 and 500),
  platform text not null check (platform in ('ios', 'android')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index push_tokens_user_idx on public.push_tokens (user_id);

alter table public.push_tokens enable row level security;

create trigger push_tokens_set_updated_at
  before update on public.push_tokens
  for each row execute function public.set_updated_at();

revoke all on table public.push_tokens from anon, authenticated;
grant select, delete on table public.push_tokens to authenticated;
grant insert (user_id, token, platform) on table public.push_tokens to authenticated;
grant update (platform) on table public.push_tokens to authenticated;
