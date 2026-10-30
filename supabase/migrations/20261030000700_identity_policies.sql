-- RLS policies for base + identity tables. Anything not listed is denied.
-- `(select auth.uid())` is used so Postgres evaluates it once per statement.

-- audit_log ------------------------------------------------------------------
create policy audit_log_select_admin
  on public.audit_log for select to authenticated
  using ((select public.is_admin()));

-- profiles -------------------------------------------------------------------
-- Every authenticated user can see every profile row; sensitive columns are
-- protected by column grants (see identity_tables migration).
create policy profiles_select_authenticated
  on public.profiles for select to authenticated
  using (true);

create policy profiles_update_own
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- user_roles -----------------------------------------------------------------
create policy user_roles_select_own_or_admin
  on public.user_roles for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

-- skills -----------------------------------------------------------------------
create policy skills_select_all
  on public.skills for select to anon, authenticated
  using (true);

-- profile_skills ---------------------------------------------------------------
create policy profile_skills_select_authenticated
  on public.profile_skills for select to authenticated
  using (true);

create policy profile_skills_insert_own
  on public.profile_skills for insert to authenticated
  with check (profile_id = (select auth.uid()));

create policy profile_skills_delete_own
  on public.profile_skills for delete to authenticated
  using (profile_id = (select auth.uid()));

-- portfolio_items --------------------------------------------------------------
create policy portfolio_items_select_authenticated
  on public.portfolio_items for select to authenticated
  using (true);

create policy portfolio_items_insert_own
  on public.portfolio_items for insert to authenticated
  with check (profile_id = (select auth.uid()));

create policy portfolio_items_update_own
  on public.portfolio_items for update to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

create policy portfolio_items_delete_own
  on public.portfolio_items for delete to authenticated
  using (profile_id = (select auth.uid()));

-- kyc_verifications ------------------------------------------------------------
create policy kyc_verifications_select_own_or_admin
  on public.kyc_verifications for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

-- push_tokens ------------------------------------------------------------------
create policy push_tokens_select_own
  on public.push_tokens for select to authenticated
  using (user_id = (select auth.uid()));

create policy push_tokens_insert_own
  on public.push_tokens for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy push_tokens_update_own
  on public.push_tokens for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy push_tokens_delete_own
  on public.push_tokens for delete to authenticated
  using (user_id = (select auth.uid()));
