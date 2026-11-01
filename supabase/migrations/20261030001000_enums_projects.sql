-- Enums for the projects domain (Phase 2). Mirrors shared/schemas/projects.ts and
-- docs/api/projects.md.
create type public.project_status as enum (
  'draft', 'open', 'awarded', 'in_progress', 'completed', 'cancelled'
);
create type public.project_visibility as enum ('public', 'invite_only');
create type public.milestone_status as enum (
  'draft', 'funded', 'in_progress', 'submitted', 'revision_requested', 'approved',
  'released', 'disputed', 'refunded', 'partially_released', 'abandoned', 'reassigned'
);
create type public.proposal_status as enum ('pending', 'accepted', 'rejected', 'withdrawn');
create type public.invite_status as enum ('pending', 'accepted', 'declined', 'revoked', 'expired');
create type public.project_member_role as enum ('client', 'freelancer');
-- Who performed a milestone transition (milestone_transitions / milestone_status_history).
create type public.milestone_actor_kind as enum ('client', 'freelancer', 'system', 'admin');
