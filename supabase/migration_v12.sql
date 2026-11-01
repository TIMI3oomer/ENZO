-- =====================================================================
-- ENZO STORE — MIGRATION 12
-- File: /supabase/migration_v12.sql
-- Run this on an EXISTING database that already has schema.sql (or
-- migration_v6 through v11) applied. Safe to run more than once.
--
-- Adds a small, manifest-driven CMS for page text/images that don't
-- already have their own admin screen (products/categories/orders
-- already do -- this is NOT for those). Ported from a portable Next.js
-- CMS spec, adapted to this project's actual stack (Vite + Express, no
-- Next.js here) and its EXISTING admin auth:
--
-- - No new "admins" table or ADMIN_EMAILS env var. This project already
--   has admin_users + a SECURITY DEFINER is_admin() (schema.sql) gating
--   every other admin write -- these new tables reuse that function
--   directly, so there's one admin allow-list, not two that could drift
--   out of sync.
-- - content_items / content_collections are the same generic shape the
--   spec describes: (page, section, key) -> value for singleton scalars
--   (a heading, a button label, an image URL), and (page, section,
--   sort_order) -> jsonb for small ordered lists (footer social links).
-- - Every value is admin-set text; the app always falls back to a
--   hardcoded default when a row is missing (see src/lib/contentManifest.js),
--   so a CMS hiccup never breaks the public site.
-- =====================================================================

create table if not exists content_items (
  id         uuid primary key default gen_random_uuid(),
  page       text not null,
  section    text not null,
  key        text not null,
  value      text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create unique index if not exists content_items_page_section_key_idx
  on content_items (page, section, key);
create index if not exists content_items_page_idx on content_items (page);

create table if not exists content_collections (
  id         uuid primary key default gen_random_uuid(),
  page       text not null,
  section    text not null,
  sort_order integer not null default 0,
  data       jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create index if not exists content_collections_page_section_idx
  on content_collections (page, section, sort_order);

alter table content_items enable row level security;
alter table content_collections enable row level security;

-- Public read (the whole point -- storefront pages need this with no
-- auth), writes gated to the SAME is_admin() every other admin table
-- already uses.
drop policy if exists "public read content_items" on content_items;
create policy "public read content_items" on content_items for select using (true);
drop policy if exists "admin write content_items" on content_items;
create policy "admin write content_items" on content_items for all using (is_admin()) with check (is_admin());

drop policy if exists "public read content_collections" on content_collections;
create policy "public read content_collections" on content_collections for select using (true);
drop policy if exists "admin write content_collections" on content_collections;
create policy "admin write content_collections" on content_collections for all using (is_admin()) with check (is_admin());

-- ============================================================
-- Storage — public bucket for CMS-uploaded images (hero/logo/etc).
-- Separate from 'product-images' (schema.sql) so the two are managed
-- independently. Same security notes as that bucket: file_size_limit +
-- allowed_mime_types are the real boundary against malicious uploads,
-- and SVG is deliberately excluded -- an uploaded SVG can carry
-- <script>, and this bucket is served publicly (stored-XSS vector).
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'content-images', 'content-images', true,
  5242880, -- 5 MB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "public read content images" on storage.objects;
create policy "public read content images" on storage.objects
  for select using (bucket_id = 'content-images');

drop policy if exists "admin write content images" on storage.objects;
create policy "admin write content images" on storage.objects
  for all using (bucket_id = 'content-images' and is_admin())
  with check (bucket_id = 'content-images' and is_admin());

NOTIFY pgrst, 'reload schema';
