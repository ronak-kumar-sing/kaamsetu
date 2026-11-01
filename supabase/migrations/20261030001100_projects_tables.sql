-- Projects domain tables: projects, project_skills, project_members, milestones,
-- milestone_status_history, submissions, proposals, project_invites.
-- RLS is enabled here (default deny); policies live in ..._projects_policies.sql.
-- Clients get SELECT only: every write goes through security definer rpc_* functions.
-- Bounds mirror shared/schemas/projects.ts (RPCs store trimmed values).

-- ---------------------------------------------------------------------------
-- projects
-- ---------------------------------------------------------------------------
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  -- restrict: projects are financial records; a profile with projects cannot vanish.
  client_id uuid not null references public.profiles (id) on delete restrict,
  freelancer_id uuid null references public.profiles (id) on delete restrict,
  title text not null check (char_length(title) between 5 and 120),
  description text not null check (char_length(description) between 30 and 5000),
  category text not null check (char_length(category) between 2 and 60),
  city text null check (city is null or char_length(city) between 1 and 60),
  is_remote boolean not null default true,
  visibility public.project_visibility not null default 'public',
  status public.project_status not null default 'draft',
  checkin_cadence_days int not null default 2 check (checkin_cadence_days between 1 and 14),
  revision_limit int not null default 2 check (revision_limit between 0 and 5),
  deposit_required boolean not null default false, -- Phase 6
  -- Sum of milestones.amount_paise, maintained by trigger (see projects_helpers migration).
  total_paise bigint not null default 0 check (total_paise >= 0),
  is_takeover boolean not null default false, -- Phase 8
  source_project_id uuid null references public.projects (id) on delete set null, -- Phase 8
  cancel_reason text null check (cancel_reason is null or char_length(cancel_reason) <= 500),
  published_at timestamptz,
  awarded_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint projects_parties_chk check (freelancer_id is null or freelancer_id <> client_id),
  constraint projects_lifecycle_chk check (
    (status = 'draft' and freelancer_id is null and published_at is null)
    or (status = 'open' and freelancer_id is null and published_at is not null)
    or (
      status in ('awarded', 'in_progress', 'completed')
      and freelancer_id is not null and awarded_at is not null
    )
    or (status = 'cancelled' and cancelled_at is not null)
  )
);

create index projects_client_idx on public.projects (client_id, created_at desc);
create index projects_freelancer_idx on public.projects (freelancer_id, created_at desc)
  where freelancer_id is not null;
create index projects_status_idx on public.projects (status);
create index projects_open_published_idx on public.projects (published_at desc, id desc)
  where status = 'open';
create index projects_category_idx on public.projects (category) where status = 'open';
create index projects_source_project_idx on public.projects (source_project_id)
  where source_project_id is not null;

alter table public.projects enable row level security;

create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

revoke all on table public.projects from anon, authenticated;
grant select on table public.projects to authenticated;

-- ---------------------------------------------------------------------------
-- project_skills
-- ---------------------------------------------------------------------------
create table public.project_skills (
  project_id uuid not null references public.projects (id) on delete cascade,
  skill_id uuid not null references public.skills (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (project_id, skill_id)
);

create index project_skills_skill_idx on public.project_skills (skill_id);

alter table public.project_skills enable row level security;

revoke all on table public.project_skills from anon, authenticated;
grant select on table public.project_skills to authenticated;

-- ---------------------------------------------------------------------------
-- project_members: basis for RLS. Client added on create, freelancer on award.
-- ---------------------------------------------------------------------------
create table public.project_members (
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete restrict,
  member_role public.project_member_role not null,
  active boolean not null default true,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  primary key (project_id, user_id),
  constraint project_members_active_chk check (active = (left_at is null))
);

create index project_members_user_idx on public.project_members (user_id, project_id);
-- At most one active client and one active freelancer per project.
create unique index project_members_one_active_role
  on public.project_members (project_id, member_role) where active;

alter table public.project_members enable row level security;

revoke all on table public.project_members from anon, authenticated;
grant select on table public.project_members to authenticated;

-- ---------------------------------------------------------------------------
-- milestones
-- deliverable/acceptance_criteria are always present: draft rows supply them, and
-- rows built from a proposal's counter-plan either inherit them from their
-- source_milestone_id or carry their own (D26, rpc_accept_proposal).
-- ---------------------------------------------------------------------------
create table public.milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  position int not null check (position between 1 and 20),
  title text not null check (char_length(title) between 3 and 120),
  deliverable text not null check (char_length(deliverable) between 10 and 2000),
  acceptance_criteria text not null check (char_length(acceptance_criteria) between 10 and 2000),
  amount_paise bigint not null check (amount_paise between 10000 and 10000000000),
  due_date date not null,
  status public.milestone_status not null default 'draft',
  revision_count int not null default 0 check (revision_count >= 0),
  started_at timestamptz,
  submitted_at timestamptz,
  approved_at timestamptz,
  released_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint milestones_project_position_key unique (project_id, position)
);

create index milestones_status_idx on public.milestones (status);

alter table public.milestones enable row level security;

create trigger milestones_set_updated_at
  before update on public.milestones
  for each row execute function public.set_updated_at();

revoke all on table public.milestones from anon, authenticated;
grant select on table public.milestones to authenticated;

-- ---------------------------------------------------------------------------
-- milestone_status_history (append-only; written by _transition_milestone)
-- ---------------------------------------------------------------------------
create table public.milestone_status_history (
  id uuid primary key default gen_random_uuid(),
  milestone_id uuid not null references public.milestones (id) on delete cascade,
  from_status public.milestone_status not null,
  to_status public.milestone_status not null,
  actor_id uuid null references public.profiles (id) on delete set null,
  actor_kind public.milestone_actor_kind not null,
  note text null check (note is null or char_length(note) <= 2000),
  -- clock_timestamp(): several transitions in one transaction still order correctly.
  created_at timestamptz not null default clock_timestamp()
);

create index milestone_status_history_milestone_idx
  on public.milestone_status_history (milestone_id, created_at);
create index milestone_status_history_actor_idx
  on public.milestone_status_history (actor_id) where actor_id is not null;

alter table public.milestone_status_history enable row level security;

revoke all on table public.milestone_status_history from anon, authenticated;
grant select on table public.milestone_status_history to authenticated;

-- ---------------------------------------------------------------------------
-- submissions
-- attachment_paths: objects in `project-files` at `<project_id>/<milestone_id>/<file>`
-- (validated by rpc_submit_milestone, which also checks the objects exist).
-- ---------------------------------------------------------------------------
create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  milestone_id uuid not null references public.milestones (id) on delete cascade,
  submitted_by uuid not null references public.profiles (id) on delete restrict,
  note text null check (note is null or char_length(note) <= 5000),
  links text[] not null default '{}' check (
    cardinality(links) <= 10 and public.text_array_items_between(links, 9, 2048)
  ),
  attachment_paths text[] not null default '{}' check (
    cardinality(attachment_paths) <= 10
    and public.text_array_items_between(attachment_paths, 1, 512)
  ),
  created_at timestamptz not null default now()
);

create index submissions_milestone_idx on public.submissions (milestone_id, created_at desc);
create index submissions_submitted_by_idx on public.submissions (submitted_by);

alter table public.submissions enable row level security;

revoke all on table public.submissions from anon, authenticated;
grant select on table public.submissions to authenticated;

-- ---------------------------------------------------------------------------
-- proposals
-- milestone_edits: null or a counter-plan of 1..20 rows, normalised by
-- rpc_submit_proposal (D26):
--   [{source_milestone_id uuid|null, title, amount_paise, due_date,
--     deliverable text|null, acceptance_criteria text|null}]
-- sum(amount_paise) = proposed_total_paise; without edits proposed_total_paise equals
-- the project's total_paise at submit time.
-- ---------------------------------------------------------------------------
create table public.proposals (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  freelancer_id uuid not null references public.profiles (id) on delete restrict,
  cover_note text not null check (char_length(cover_note) between 30 and 3000),
  proposed_total_paise bigint not null check (
    proposed_total_paise between 10000 and 200000000000
  ),
  timeline_days int not null check (timeline_days between 1 and 365),
  milestone_edits jsonb null check (
    milestone_edits is null
    or case
      when jsonb_typeof(milestone_edits) = 'array'
        then jsonb_array_length(milestone_edits) between 1 and 20
      else false
    end
  ),
  status public.proposal_status not null default 'pending',
  rejection_reason text null check (rejection_reason is null or char_length(rejection_reason) <= 500),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- At most one pending proposal per freelancer per project.
create unique index proposals_one_pending_per_freelancer
  on public.proposals (project_id, freelancer_id) where status = 'pending';
create index proposals_project_idx on public.proposals (project_id, status, created_at desc);
create index proposals_freelancer_idx on public.proposals (freelancer_id, created_at desc);

alter table public.proposals enable row level security;

create trigger proposals_set_updated_at
  before update on public.proposals
  for each row execute function public.set_updated_at();

revoke all on table public.proposals from anon, authenticated;
grant select on table public.proposals to authenticated;

-- ---------------------------------------------------------------------------
-- project_invites
-- token: 32 random bytes, base64url (43 chars). Never selectable by clients
-- (excluded from the column grant); returned once by rpc_create_invite.
-- ---------------------------------------------------------------------------
create table public.project_invites (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  invited_by uuid not null references public.profiles (id) on delete restrict,
  freelancer_id uuid null references public.profiles (id) on delete restrict,
  phone_e164 text null check (phone_e164 is null or phone_e164 ~ '^\+91[6-9][0-9]{9}$'),
  token text not null unique check (token ~ '^[A-Za-z0-9_-]{43}$'),
  status public.invite_status not null default 'pending',
  expires_at timestamptz not null default (now() + interval '14 days'),
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index project_invites_project_idx on public.project_invites (project_id, status);
create index project_invites_freelancer_idx on public.project_invites (freelancer_id)
  where freelancer_id is not null;
create index project_invites_phone_idx on public.project_invites (phone_e164)
  where phone_e164 is not null;
create index project_invites_invited_by_idx on public.project_invites (invited_by);
create index project_invites_pending_expiry_idx on public.project_invites (expires_at)
  where status = 'pending';

alter table public.project_invites enable row level security;

create trigger project_invites_set_updated_at
  before update on public.project_invites
  for each row execute function public.set_updated_at();

revoke all on table public.project_invites from anon, authenticated;
grant select (
  id, project_id, invited_by, freelancer_id, phone_e164, status, expires_at, responded_at,
  created_at, updated_at
) on table public.project_invites to authenticated;
