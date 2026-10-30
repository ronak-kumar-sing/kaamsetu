-- Storage buckets and object policies.
-- Object paths are always `<owner auth.uid()>/<...>`.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('avatars', 'avatars', true, 2097152,
    array['image/jpeg', 'image/png', 'image/webp']),
  ('portfolio', 'portfolio', true, 10485760,
    array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  ('kyc', 'kyc', false, 5242880,
    array['image/jpeg', 'image/png', 'application/pdf']),
  -- Phase 2/3: object policies for project-files and agreements are added with
  -- the projects / agreements migrations. Until then only service_role can use them.
  ('project-files', 'project-files', false, 26214400, null),
  ('agreements', 'agreements', false, 10485760, array['application/pdf'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Public buckets (avatars, portfolio) are served via
-- /storage/v1/object/public/<bucket>/<path>, which does NOT consult RLS. There is
-- deliberately no anon/public SELECT policy: it would let anyone list every object
-- name (and thus every user id). Owners get SELECT on their own folder, which the
-- storage API needs for upsert/replace and list-own flows.
-- Writes reject traversal-looking names ('..' anywhere, leading '/'); the DB
-- columns that reference objects (profiles.avatar_path, portfolio_items.storage_path,
-- kyc_verifications.storage_path) enforce the strict `<owner>/<file>` form.

-- avatars ----------------------------------------------------------------------
create policy avatars_select_own
  on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy avatars_insert_own
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text
    and position('..' in name) = 0 and left(name, 1) <> '/'
  );

create policy avatars_update_own
  on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text
    and position('..' in name) = 0 and left(name, 1) <> '/'
  );

create policy avatars_delete_own
  on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- portfolio --------------------------------------------------------------------
create policy portfolio_select_own
  on storage.objects for select to authenticated
  using (bucket_id = 'portfolio' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy portfolio_insert_own
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'portfolio' and (storage.foldername(name))[1] = (select auth.uid())::text
    and position('..' in name) = 0 and left(name, 1) <> '/'
  );

create policy portfolio_update_own
  on storage.objects for update to authenticated
  using (bucket_id = 'portfolio' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (
    bucket_id = 'portfolio' and (storage.foldername(name))[1] = (select auth.uid())::text
    and position('..' in name) = 0 and left(name, 1) <> '/'
  );

create policy portfolio_delete_own
  on storage.objects for delete to authenticated
  using (bucket_id = 'portfolio' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- kyc (private): owner uploads once; owner + admins read; no owner update/delete.
create policy kyc_select_own_or_admin
  on storage.objects for select to authenticated
  using (
    bucket_id = 'kyc'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.is_admin()))
  );

create policy kyc_insert_own
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'kyc' and (storage.foldername(name))[1] = (select auth.uid())::text
    and position('..' in name) = 0 and left(name, 1) <> '/'
  );
