-- RLS for the projects domain (docs/api/projects.md "Visibility (RLS)").
-- SELECT only: there are no INSERT/UPDATE/DELETE grants or policies for API roles;
-- every write goes through the rpc_* functions. Admins can read everything.
-- Helpers are security definer so policies never recurse through each other's RLS.

-- projects: members; open+public to any authenticated user; open projects to holders
-- of a live invite; drafts to their client only.
create policy projects_select_visible
  on public.projects for select to authenticated
  using (
    client_id = (select auth.uid())
    or (status = 'open' and visibility = 'public')
    or (select public.is_admin())
    or public.is_project_member(id)
    or (status = 'open' and public.has_project_invite(id))
  );

-- project_skills: same as the project.
create policy project_skills_select_visible
  on public.project_skills for select to authenticated
  using (public.can_view_project(project_id));

-- project_members: fellow members (and admins).
create policy project_members_select_member
  on public.project_members for select to authenticated
  using (user_id = (select auth.uid()) or public.is_project_member(project_id) or (select public.is_admin()));

-- milestones: same as the project. Non-members only see `open` projects, so once a
-- project is awarded or later only members (and admins) see its milestones.
create policy milestones_select_visible
  on public.milestones for select to authenticated
  using (public.can_view_project(project_id));

-- milestone_status_history / submissions: project members only (and admins).
create policy milestone_status_history_select_member
  on public.milestone_status_history for select to authenticated
  using (public.can_view_milestone_activity(milestone_id));

create policy submissions_select_member
  on public.submissions for select to authenticated
  using (public.can_view_milestone_activity(milestone_id));

-- proposals: author and the project's client (and admins).
create policy proposals_select_author_or_client
  on public.proposals for select to authenticated
  using (
    freelancer_id = (select auth.uid())
    or public.is_project_client(project_id)
    or (select public.is_admin())
  );

-- project_invites: inviter and invitee (by freelancer_id, or by verified phone).
-- Link invites (no freelancer_id / phone) are resolved only via rpc_resolve_invite.
create policy project_invites_select_party
  on public.project_invites for select to authenticated
  using (
    invited_by = (select auth.uid())
    or freelancer_id = (select auth.uid())
    or (phone_e164 is not null and phone_e164 = (select public.my_verified_phone()))
    or (select public.is_admin())
  );
