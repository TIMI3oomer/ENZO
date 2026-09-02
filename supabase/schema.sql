-- =====================================================================
-- ENZO STORE — FULL SCHEMA (consolidated)
-- File: /supabase/schema.sql
--
-- Run this ONCE in the Supabase SQL editor. If you have an existing
-- ENZO database from before and want a clean slate, run 00_reset.sql
-- FIRST, then this file. This single file replaces the old
-- schema.sql + migration_v2/v3/v4/v5.sql sequence — you only need
-- this one from now on for a fresh setup.
--
-- CHECKPOINT NOTE — SECURITY MODEL
-- - The public "anon" key can only SELECT active products/categories and
--   INSERT into orders/order_items. It can never UPDATE or DELETE
--   anything, and can never read other customers' orders.
-- - Only an authenticated admin (listed in admin_users) can manage
--   products/categories or update order status.
-- - This is enforced with Postgres Row Level Security, independent of
--   the Node backend's own checks (server/src/middleware/auth.js) — two
--   separate layers, neither trusting the other.
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
  name jsonb not null default '{}'::jsonb,
  description jsonb not null default '{}'::jsonb,
  material jsonb not null default '{}'::jsonb,
  fit jsonb not null default '{}'::jsonb,
  care_instructions jsonb not null default '{}'::jsonb,
  price numeric(10,2) not null check (price >= 0),
  sizes text[] not null default '{}',
  colors text[] not null default '{}',
  images text[] not null default '{}',
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
  customer_email text,
  phone text not null,
  city text not null,
  address text not null,
  notes text,
  admin_note text,
  payment_method text not null check (payment_method in ('cod','visa','reflect')),
  status text not null default 'pending'
    check (status in ('pending','confirmed','shipped','delivered','cancelled')),
  subtotal numeric(10,2) not null,
  total numeric(10,2) not null,
  locale text not null default 'ar' check (locale in ('ar','en')),
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_orders_user on orders(user_id);

-- ---------- ORDER ITEMS ----------
create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  product_name jsonb not null,
  size text,
  color text,
  quantity int not null check (quantity > 0),
  unit_price numeric(10,2) not null
);

-- ---------- ADMIN USERS ----------
create table if not exists admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  created_at timestamptz not null default now()
);

-- ---------- CUSTOMER PROFILES ----------
-- Extends Supabase Auth's built-in auth.users (email/password only) with
-- everything else about a customer: phone, saved address. Auto-created on
-- signup by the trigger below.
create table if not exists profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  default_city text,
  default_address text,
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
alter table profiles enable row level security;

create or replace function is_admin()
returns boolean
language sql
security definer
stable
as $$
  select exists (select 1 from admin_users where user_id = auth.uid());
$$;

create policy "public read categories" on categories for select using (true);
create policy "public read active products" on products for select using (is_active = true or is_admin());
create policy "admin write categories" on categories for all using (is_admin()) with check (is_admin());
create policy "admin write products" on products for all using (is_admin()) with check (is_admin());

create policy "create own or guest orders" on orders
  for insert with check (user_id is null or user_id = auth.uid());
create policy "customer read own orders" on orders for select using (user_id = auth.uid());
create policy "admin read orders" on orders for select using (is_admin());
create policy "admin update orders" on orders for update using (is_admin()) with check (is_admin());

create policy "anyone can create order items" on order_items for insert with check (true);
create policy "customer read own order items" on order_items
  for select using (order_id in (select id from orders where user_id = auth.uid()));
create policy "admin read order items" on order_items for select using (is_admin());

create policy "admin read admin_users" on admin_users for select using (is_admin());

create policy "customer read own profile" on profiles for select using (auth.uid() = user_id);
create policy "customer update own profile" on profiles for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "admin read all profiles" on profiles for select using (is_admin());

-- =====================================================================
-- Auto-create a profile row on signup, pulling full_name out of the
-- metadata AuthContext.jsx's register() function sets at sign-up time.
-- =====================================================================
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

-- =====================================================================
-- place_order() — atomic, price-safe checkout.
-- Called ONLY from the Node backend (server/), using the service_role
-- key. Looks up real prices/stock itself (never trusts the client),
-- locks rows to prevent overselling, and writes the order + line items +
-- stock decrement as one transaction.
-- =====================================================================
create or replace function place_order(
  p_customer_name text,
  p_phone text,
  p_city text,
  p_address text,
  p_notes text,
  p_payment_method text,
  p_locale text,
  p_user_id uuid,
  p_items jsonb,
  p_email text default null
) returns table(order_id uuid, order_number bigint, total numeric)
language plpgsql
security definer
as $$
declare
  v_order_id uuid;
  v_order_number bigint;
  v_subtotal numeric := 0;
  v_item jsonb;
  v_product products%rowtype;
  v_qty int;
begin
  if jsonb_array_length(p_items) = 0 then
    raise exception 'Cannot place an order with no items';
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select * into v_product from products
      where id = (v_item->>'product_id')::uuid
      for update;

    if not found then
      raise exception 'Product not found: %', (v_item->>'product_id');
    end if;

    if not v_product.is_active then
      raise exception 'Product is no longer available: %', v_product.slug;
    end if;

    v_qty := (v_item->>'quantity')::int;
    if v_qty is null or v_qty <= 0 then
      raise exception 'Invalid quantity for product %', v_product.slug;
    end if;

    if v_product.stock < v_qty then
      raise exception 'Insufficient stock for %: only % left', v_product.slug, v_product.stock;
    end if;

    v_subtotal := v_subtotal + (v_product.price * v_qty);
  end loop;

  insert into orders (
    customer_name, phone, city, address, notes,
    payment_method, subtotal, total, locale, user_id, customer_email
  ) values (
    p_customer_name, p_phone, p_city, p_address, p_notes,
    p_payment_method, v_subtotal, v_subtotal, p_locale, p_user_id, p_email
  )
  returning id, orders.order_number into v_order_id, v_order_number;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select * into v_product from products where id = (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::int;

    insert into order_items (order_id, product_id, product_name, size, color, quantity, unit_price)
    values (v_order_id, v_product.id, v_product.name, v_item->>'size', v_item->>'color', v_qty, v_product.price);

    update products set stock = stock - v_qty where id = v_product.id;
  end loop;

  return query select v_order_id, v_order_number, v_subtotal;
end;
$$;

-- =====================================================================
-- STORAGE: product image uploads (admin panel "upload from gallery")
--
-- file_size_limit + allowed_mime_types are the REAL security boundary
-- against malicious/disguised file uploads — enforced by Supabase
-- itself, unlike the client-side checks in src/lib/upload.js which a
-- determined attacker could bypass. "do update set" (not "do nothing")
-- so re-running this file always re-applies these limits even if the
-- bucket already existed from an earlier version of this schema.
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images', 'product-images', true,
  5242880, -- 5 MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "public read product images" on storage.objects
  for select using (bucket_id = 'product-images');

create policy "admin upload product images" on storage.objects
  for insert with check (bucket_id = 'product-images' and is_admin());

create policy "admin delete product images" on storage.objects
  for delete using (bucket_id = 'product-images' and is_admin());

-- =====================================================================
-- SEED DATA (optional — remove or edit before going live)
-- =====================================================================
insert into categories (slug, name) values
  ('t-shirts', '{"ar":"تيشيرتات","en":"T-Shirts"}'),
  ('sweats', '{"ar":"سويت شيرت","en":"Sweatshirts"}'),
  ('shoes', '{"ar":"أحذية","en":"Shoes"}'),
  ('pants', '{"ar":"بناطيل","en":"Pants"}'),
  ('training', '{"ar":"ترينج","en":"Trainings"}')
on conflict (slug) do nothing;
