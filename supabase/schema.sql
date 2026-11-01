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
  color_images jsonb not null default '{}', -- { "Black": "https://...", "Gold": "https://..." }
  images text[] not null default '{}',
  stock int not null default 0 check (stock >= 0),
  -- Which of this product's sizes/colors are currently unavailable,
  -- independent of each other (not a per-combination stock grid) --
  -- the storefront disables + red-marks these as "Sold out".
  sold_out_sizes text[] not null default '{}',
  sold_out_colors text[] not null default '{}',
  -- 0 = not on sale. Sale price is computed as price * (1 -
  -- discount_percent/100) wherever shown, never stored separately.
  discount_percent numeric(5,2) not null default 0 check (discount_percent >= 0 and discount_percent <= 100),
  -- Per size+color stock (e.g. grey/S = 10, blue/S = 5), keyed
  -- "<color>__<size>" -> quantity. Only entries the admin has actually
  -- filled in exist here -- a combo with no key falls back to the plain
  -- `stock` aggregate above (see src/lib/variantStock.js and
  -- place_order() below), so a product saved before this existed, or one
  -- with only sizes or only colors, behaves exactly as it did before.
  -- `stock` itself is always kept as the sum of this map once it's in
  -- use (computed client-side in admin/ProductForm.jsx on save), so
  -- every other screen that already reads the plain aggregate keeps
  -- working unchanged.
  variant_stock jsonb not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_products_category on products(category_id);
create index if not exists idx_products_active on products(is_active);
create index if not exists idx_products_discount on products(discount_percent) where discount_percent > 0;

-- ---------- ORDERS ----------
-- DELIVERY FEE: varies by city, so it's never charged/guessed at
-- checkout -- every order is created with delivery_fee = 0 and
-- delivery_fee_confirmed = false, and the admin fills in the real fee
-- for that specific order from the Orders page once they know it (see
-- PATCH /api/admin/orders/:id/delivery-fee in server/src/routes/admin.js),
-- which is what emails the customer their confirmed final total.
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
  delivery_fee numeric(10,2) not null default 0,
  delivery_fee_confirmed boolean not null default false,
  total numeric(10,2) not null,
  payment_status text not null default 'pending' check (payment_status in ('pending', 'paid', 'failed')),
  stripe_session_id text,
  locale text not null default 'ar' check (locale in ('ar','en')),
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_orders_stripe_session on orders(stripe_session_id);

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
--
-- DELIVERY FEE: not charged here at all -- it varies by city, so every
-- order is created with delivery_fee = 0 / delivery_fee_confirmed =
-- false (total = subtotal only), and the admin fills in the real fee
-- for this specific order afterward from the Orders page (see
-- PATCH /api/admin/orders/:id/delivery-fee), which recalculates total
-- and emails the customer their confirmed final price.
--
-- PAYMENT STATUS: p_payment_status lets card payments (created only
-- AFTER Stripe confirms payment, via the webhook) be recorded as 'paid'
-- immediately, while cash-on-delivery/manual-transfer orders default to
-- 'pending' (money hasn't actually been collected yet).
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
  p_email text default null,
  p_payment_status text default 'pending',
  p_stripe_session_id text default null
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
  v_variant_key text;
  v_available int;
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

    if (v_item->>'size') is not null and v_product.sold_out_sizes @> array[v_item->>'size'] then
      raise exception 'Size % is sold out for %', v_item->>'size', v_product.slug;
    end if;

    if (v_item->>'color') is not null and v_product.sold_out_colors @> array[v_item->>'color'] then
      raise exception 'Color % is sold out for %', v_item->>'color', v_product.slug;
    end if;

    v_qty := (v_item->>'quantity')::int;
    if v_qty is null or v_qty <= 0 then
      raise exception 'Invalid quantity for product %', v_product.slug;
    end if;

    -- Per size+color stock, when the admin has actually tracked that
    -- combo (variant_stock has the key) -- otherwise fall back to the
    -- plain aggregate `stock`, same rule src/lib/variantStock.js uses
    -- client-side, so a product without a stock grid yet behaves exactly
    -- as it did before this existed.
    if (v_item->>'size') is not null and (v_item->>'color') is not null then
      v_variant_key := (v_item->>'color') || '__' || (v_item->>'size');
    else
      v_variant_key := null;
    end if;

    if v_variant_key is not null and v_product.variant_stock ? v_variant_key then
      v_available := (v_product.variant_stock ->> v_variant_key)::int;
    else
      v_available := v_product.stock;
    end if;

    if v_available < v_qty then
      raise exception 'Insufficient stock for %: only % left', v_product.slug, v_available;
    end if;

    -- Sale price, same math as the frontend (never a stored column) --
    -- the subtotal/line item below MUST agree with what the customer saw.
    v_subtotal := v_subtotal + (round(v_product.price * (1 - v_product.discount_percent / 100), 2) * v_qty);
  end loop;

  -- delivery_fee / delivery_fee_confirmed are left at their column
  -- defaults (0 / false) -- not known yet, see the note above.
  insert into orders (
    customer_name, phone, city, address, notes,
    payment_method, subtotal, total, locale, user_id, customer_email,
    payment_status, stripe_session_id
  ) values (
    p_customer_name, p_phone, p_city, p_address, p_notes,
    p_payment_method, v_subtotal, v_subtotal, p_locale, p_user_id, p_email,
    p_payment_status, p_stripe_session_id
  )
  returning id, orders.order_number into v_order_id, v_order_number;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select * into v_product from products where id = (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::int;

    insert into order_items (order_id, product_id, product_name, size, color, quantity, unit_price)
    values (
      v_order_id, v_product.id, v_product.name, v_item->>'size', v_item->>'color', v_qty,
      round(v_product.price * (1 - v_product.discount_percent / 100), 2)
    );

    if (v_item->>'size') is not null and (v_item->>'color') is not null then
      v_variant_key := (v_item->>'color') || '__' || (v_item->>'size');
    else
      v_variant_key := null;
    end if;

    -- The aggregate `stock` is ALWAYS decremented (every other screen --
    -- ProductCard's "out of stock" ribbon, Cart.jsx -- reads only that),
    -- and the specific variant cell on top of it when one is tracked, so
    -- the two never drift apart.
    update products set
      stock = greatest(0, stock - v_qty),
      variant_stock = case
        when v_variant_key is not null and variant_stock ? v_variant_key
          then jsonb_set(variant_stock, array[v_variant_key], to_jsonb(greatest(0, (variant_stock ->> v_variant_key)::int - v_qty)))
        else variant_stock
      end
    where id = v_product.id;
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
-- MINI CMS: page text/images that don't have their own admin screen
-- (products/categories/orders already do -- this is NOT for those).
-- content_items: singleton scalars per (page, section, key) -- a
-- heading, a button label, an image URL. content_collections: small
-- ordered lists per (page, section) -- footer social links. Reuses the
-- SAME is_admin() as every other admin table above, not a separate
-- admin allow-list. See src/lib/contentManifest.js for the fields this
-- actually drives and their fallback defaults.
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

create policy "public read content_items" on content_items for select using (true);
create policy "admin write content_items" on content_items for all using (is_admin()) with check (is_admin());

create policy "public read content_collections" on content_collections for select using (true);
create policy "admin write content_collections" on content_collections for all using (is_admin()) with check (is_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'content-images', 'content-images', true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
  -- no image/svg+xml: an uploaded SVG can carry <script>, and this
  -- bucket is served publicly -- a stored-XSS vector.
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "public read content images" on storage.objects
  for select using (bucket_id = 'content-images');

create policy "admin write content images" on storage.objects
  for all using (bucket_id = 'content-images' and is_admin())
  with check (bucket_id = 'content-images' and is_admin());

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
