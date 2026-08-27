-- =====================================================================
-- ENZO STORE — MIGRATION 4
-- File: /supabase/migration_v4.sql
-- Run this AFTER schema.sql, migration_v2.sql, migration_v3.sql.
--
-- CHECKPOINT NOTE — WHY THIS EXISTS
-- Supabase Auth's built-in `auth.users` table (Authentication -> Users in
-- the dashboard) only holds login info: email, password hash, id. It's
-- not meant to be extended directly. The standard pattern -- used here --
-- is a separate `profiles` table in the public schema that stores
-- everything else about a customer (phone, saved address) and is linked
-- 1-to-1 with auth.users by id. This is what finally gives the admin
-- dashboard's "Customers" section (already in admin.json's nav, not yet
-- built) something real to show.
-- =====================================================================

create table if not exists profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  default_city text,
  default_address text,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

-- A customer can read and update only their own profile.
create policy "customer read own profile" on profiles
  for select using (auth.uid() = user_id);

create policy "customer update own profile" on profiles
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Admins can read every profile (needed for the admin Customers list).
create policy "admin read all profiles" on profiles
  for select using (is_admin());

-- ---------------------------------------------------------------------
-- Auto-create a profile row the moment someone signs up, pulling the
-- full name they entered at registration out of auth.users' metadata
-- (see AuthContext.jsx's register() function, which sets that metadata).
-- This means the app never has to remember to create a profile manually.
-- ---------------------------------------------------------------------
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.profiles (user_id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name')
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Backfill profiles for any accounts created before this migration ran.
insert into profiles (user_id, full_name)
select id, raw_user_meta_data ->> 'full_name' from auth.users
on conflict (user_id) do nothing;
