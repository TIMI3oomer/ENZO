-- =====================================================================
-- ENZO STORE — MIGRATION 9 (storage RLS fix)
-- File: /supabase/migration_v9.sql
--
-- Run this if you're getting "new row violates row-level security
-- policy" when uploading a product image. Safe to run even if you're
-- not sure whether the bucket/policies already exist — this drops and
-- recreates them cleanly either way.
-- =====================================================================

-- Make sure the bucket exists with the right settings (in case an
-- earlier migration was skipped).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images', 'product-images', true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Drop and recreate the policies cleanly (avoids "policy already exists"
-- errors if some of these were partially created before).
drop policy if exists "public read product images" on storage.objects;
drop policy if exists "admin upload product images" on storage.objects;
drop policy if exists "admin delete product images" on storage.objects;

create policy "public read product images" on storage.objects
  for select using (bucket_id = 'product-images');

-- NOTE: is_admin() is explicitly schema-qualified as public.is_admin()
-- here. Storage policies run in a slightly different context than normal
-- queries, and being explicit removes any ambiguity about which schema's
-- function is being called — this is the most common cause of this
-- exact error when the function itself is correct but "invisible" to
-- the policy check.
create policy "admin upload product images" on storage.objects
  for insert with check (bucket_id = 'product-images' and public.is_admin());

create policy "admin delete product images" on storage.objects
  for delete using (bucket_id = 'product-images' and public.is_admin());
