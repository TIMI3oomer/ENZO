-- =====================================================================
-- ENZO STORE — SUPABASE SCHEMA
-- File: /supabase/schema.sql
-- Run this once in the Supabase SQL editor (Project -> SQL Editor -> New query).
--
-- CHECKPOINT NOTE — SECURITY MODEL
-- - Anyone with the public "anon" key can only SELECT products/categories
--   and INSERT into orders/order_items. They can never UPDATE or DELETE
--   anything, and can never read other customers' orders.
-- - Only an authenticated admin user (see admin_users table) can manage
--   products, categories, and update order status.
-- - This is enforced with Postgres Row Level Security (RLS), not just in
--   the frontend, so it can't be bypassed by calling the API directly.
-- =====================================================================

-- ---------- CATEGORIES ----------
create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name jsonb not null default '{}'::jsonb, -- { "ar": "...", "en": "..." }
  created_at timestamptz not null default now()
);

-- ---------- PRODUCTS ----------
create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  category_id uuid references categories(id) on delete set null,
  name jsonb not null default '{}'::jsonb,             -- { ar, en }
  description jsonb not null default '{}'::jsonb,      -- { ar, en }
  material jsonb not null default '{}'::jsonb,         -- { ar, en }
  fit jsonb not null default '{}'::jsonb,               -- { ar, en }
  care_instructions jsonb not null default '{}'::jsonb, -- { ar, en }
  price numeric(10,2) not null check (price >= 0),
  sizes text[] not null default '{}',       -- e.g. {"S","M","L","XL"}
  images text[] not null default '{}',      -- Supabase Storage public URLs
  stock int not null default 0 check (stock >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_products_category on products(category_id);
create index if not exists idx_products_active on products(is_active);

-- ---------- ORDERS ----------
create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  order_number bigserial unique,
  customer_name text not null,
  phone text not null,
  city text not null,
  address text not null,
  notes text,
  payment_method text not null check (payment_method in ('cod','visa','reflect')),
  status text not null default 'pending'
    check (status in ('pending','confirmed','shipped','delivered','cancelled')),
  subtotal numeric(10,2) not null,
  total numeric(10,2) not null,
  locale text not null default 'ar' check (locale in ('ar','en')),
  created_at timestamptz not null default now()
);

-- ---------- ORDER ITEMS ----------
create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  product_name jsonb not null,  -- snapshot of name at purchase time { ar, en }
  size text,
  quantity int not null check (quantity > 0),
  unit_price numeric(10,2) not null
);

-- ---------- ADMIN USERS ----------
-- Marks which authenticated Supabase Auth users are allowed into the
-- admin dashboard. Sign the store owner up normally via Supabase Auth,
-- then insert their auth.users id here.
create table if not exists admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  created_at timestamptz not null default now()
);

-- =====================================================================
-- ROW LEVEL SECURITY
-- =====================================================================
alter table categories enable row level security;
alter table products enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table admin_users enable row level security;

-- Helper: is the current request from a logged-in admin?
create or replace function is_admin()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from admin_users where user_id = auth.uid()
  );
$$;

-- Public (anon + authenticated) can read active products/categories.
create policy "public read categories" on categories
  for select using (true);

create policy "public read active products" on products
  for select using (is_active = true or is_admin());

-- Only admins can write products/categories.
create policy "admin write categories" on categories
  for all using (is_admin()) with check (is_admin());

create policy "admin write products" on products
  for all using (is_admin()) with check (is_admin());

-- Anyone (even anonymous checkout) can create an order + its items,
-- but can never read, update, or delete orders — only admins can.
create policy "anyone can create orders" on orders
  for insert with check (true);

create policy "admin read orders" on orders
  for select using (is_admin());

create policy "admin update orders" on orders
  for update using (is_admin()) with check (is_admin());

create policy "anyone can create order items" on order_items
  for insert with check (true);

create policy "admin read order items" on order_items
  for select using (is_admin());

-- admin_users table itself is only readable by admins (prevents
-- customers from ever discovering who the admins are).
create policy "admin read admin_users" on admin_users
  for select using (is_admin());

-- =====================================================================
-- SEED DATA (optional — remove or edit before going live)
-- =====================================================================
insert into categories (slug, name) values
  ('t-shirts', '{"ar":"تيشيرتات","en":"T-Shirts"}'),
  ('sweats', '{"ar":"سويت شيرت","en":"Sweatshirts"}'),
  ('shoes', '{"ar":"أحذية","en":"Shoes"}')
on conflict (slug) do nothing;
