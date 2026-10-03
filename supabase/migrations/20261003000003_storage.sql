-- =============================================================================
-- Personal Finance OS — 0003 storage: bucket privato per i CSV importati
--
-- Percorso obbligatorio: {auth.uid()}/{import_id}/{nome-file}.csv
-- Il bucket non è pubblico; nessuna URL firmata viene generata per il browser.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'imports',
  'imports',
  false,
  10485760, -- 10 MB, allineato a import_files.size_bytes
  array['text/csv', 'text/plain', 'application/vnd.ms-excel']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy imports_bucket_select_own on storage.objects
  for select to authenticated
  using (bucket_id = 'imports' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy imports_bucket_insert_own on storage.objects
  for insert to authenticated
  with check (bucket_id = 'imports' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy imports_bucket_delete_own on storage.objects
  for delete to authenticated
  using (bucket_id = 'imports' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Nessuna policy di update: un file importato non si sovrascrive.
