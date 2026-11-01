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
  stock int not null default 0 check (stock >= 0), -- for products WITH sizes this is the auto-total of size_stock (see trigger below)
  size_stock jsonb not null default '{}'::jsonb check (jsonb_typeof(size_stock) = 'object'), -- stock per size, e.g. {"S":2,"M":3,"L":5}
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_products_category on products(category_id);
create index if not exists idx_products_active on products(is_active);

-- ---------- ORDERS ----------
-- DELIVERY FEE: charged at checkout from the region the customer picks
-- (delivery_region: west_bank 20 / jerusalem 30 / inside 70 ILS -- see
-- delivery_fee_for_region() below). New orders are created with
-- delivery_fee_confirmed = true. The admin can still override the fee
-- per order (PATCH /api/admin/orders/:id/delivery-fee in
-- server/src/routes/admin.js), which re-emails the final total.
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
  delivery_region text check (delivery_region is null or delivery_region in ('west_bank', 'jerusalem', 'inside')),
  total numeric(10,2) not null,
  payment_status text not null default 'pending' check (payment_status in ('pending', 'paid', 'failed')),
  stripe_session_id text,
  locale text not null default 'ar' check (locale in ('ar','en')),
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
-- UNIQUE (partial): two simultaneous deliveries of the same Stripe webhook
-- could previously both pass place_order()'s "already exists?" check and
-- create two orders for one payment. The database now refuses the second.
create unique index if not exists uq_orders_stripe_session on orders(stripe_session_id) where stripe_session_id is not null;

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

-- No INSERT policies on orders/order_items on purpose: every order is
-- created by place_order() from the Node backend (service_role), never
-- directly from the browser with the anon key.
create policy "customer read own orders" on orders for select using (user_id = auth.uid());
create policy "admin read orders" on orders for select using (is_admin());
create policy "admin update orders" on orders for update using (is_admin()) with check (is_admin());

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
-- key (execute is revoked from anon/authenticated below). Looks up real
-- prices/stock itself (never trusts the client), locks rows to prevent
-- overselling, and writes the order + line items + stock decrement as
-- one transaction.
--
-- DELIVERY FEE: computed from p_delivery_region via
-- delivery_fee_for_region() -- never sent by the client.
--
-- PAYMENT STATUS: card orders are created only AFTER Stripe confirms
-- payment (webhook) and recorded as 'paid'; cod/reflect stay 'pending'.
-- A repeated stripe_session_id (Stripe webhook retry) returns the
-- existing order instead of creating a duplicate.
-- =====================================================================
-- Single source of truth for delivery prices (ILS).
create or replace function delivery_fee_for_region(p_region text)
returns numeric
language sql
immutable
as $$
  select case p_region
    when 'west_bank' then 20::numeric
    when 'jerusalem' then 30::numeric
    when 'inside'    then 70::numeric
    else null
  end;
$$;

-- STOCK PER SIZE: products.size_stock holds stock per size and the trigger
-- below keeps products.stock equal to their total. Products without sizes
-- just use products.stock. (Added by migration_v14.sql on existing DBs.)
create or replace function sync_product_stock()
returns trigger
language plpgsql
as $$
begin
  -- Refuse malformed data instead of silently turning it into zeros.
  if jsonb_typeof(new.size_stock) is distinct from 'object' then
    raise exception 'size_stock must be a JSON object like {"S":2,"M":3}';
  end if;

  if coalesce(array_length(new.sizes, 1), 0) > 0 then
    new.size_stock := coalesce(
      (
        select jsonb_object_agg(s, greatest(coalesce((new.size_stock ->> s)::int, 0), 0))
        from unnest(new.sizes) as s
      ),
      '{}'::jsonb
    );
    new.stock := coalesce((select sum(value::int) from jsonb_each_text(new.size_stock)), 0);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_product_stock on products;
create trigger trg_sync_product_stock
  before insert or update on products
  for each row execute function sync_product_stock();

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
  p_stripe_session_id text default null,
  p_delivery_region text default null
) returns table(order_id uuid, order_number bigint, total numeric, delivery_fee numeric)
language plpgsql
security definer
as $$
declare
  v_order_id uuid;
  v_order_number bigint;
  v_subtotal numeric := 0;
  v_delivery_fee numeric;
  v_item jsonb;
  v_line record;
  v_product products%rowtype;
  v_qty int;
  v_have int;
  v_existing orders%rowtype;
begin
  -- Stripe webhook retry: same session already turned into an order.
  if p_stripe_session_id is not null then
    select * into v_existing from orders o where o.stripe_session_id = p_stripe_session_id limit 1;
    if found then
      return query select v_existing.id, v_existing.order_number, v_existing.total, v_existing.delivery_fee;
      return;
    end if;
  end if;

  v_delivery_fee := delivery_fee_for_region(p_delivery_region);
  if v_delivery_fee is null then
    raise exception 'Please choose your delivery region';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Cannot place an order with no items';
  end if;

  -- 1) VALIDATE. Lines are grouped by (product, size) so the same shirt in
  --    the same size ordered twice (e.g. two colours) is checked as one
  --    total. Rows are locked in a fixed order, so two simultaneous
  --    orders can never deadlock or both take the last piece.
  for v_line in
    select (i ->> 'product_id')::uuid as product_id,
           nullif(i ->> 'size', '') as size,
           sum((i ->> 'quantity')::int) as qty
    from jsonb_array_elements(p_items) as i
    group by 1, 2
    order by 1, 2
  loop
    select * into v_product from products where id = v_line.product_id for update;

    if not found then
      raise exception 'Product not found: %', v_line.product_id;
    end if;

    if not v_product.is_active then
      raise exception 'Product is no longer available: %', v_product.slug;
    end if;

    if v_line.qty is null or v_line.qty <= 0 then
      raise exception 'Invalid quantity for product %', v_product.slug;
    end if;

    if coalesce(array_length(v_product.sizes, 1), 0) > 0 then
      if v_line.size is null or not (v_line.size = any (v_product.sizes)) then
        raise exception 'Please choose a size for %', v_product.slug;
      end if;
      v_have := coalesce((v_product.size_stock ->> v_line.size)::int, 0);
      if v_have < v_line.qty then
        raise exception 'Insufficient stock for % (size %): only % left', v_product.slug, v_line.size, v_have;
      end if;
    else
      if v_product.stock < v_line.qty then
        raise exception 'Insufficient stock for %: only % left', v_product.slug, v_product.stock;
      end if;
    end if;

    v_subtotal := v_subtotal + (v_product.price * v_line.qty);
  end loop;

  -- 2) CREATE the order and its line items.
  insert into orders (
    customer_name, phone, city, address, notes,
    payment_method, subtotal, delivery_fee, delivery_fee_confirmed, total,
    locale, user_id, customer_email,
    payment_status, stripe_session_id, delivery_region
  ) values (
    p_customer_name, p_phone, p_city, p_address, p_notes,
    p_payment_method, v_subtotal, v_delivery_fee, true, v_subtotal + v_delivery_fee,
    p_locale, p_user_id, p_email,
    p_payment_status, p_stripe_session_id, p_delivery_region
  )
  returning id, orders.order_number into v_order_id, v_order_number;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select * into v_product from products where id = (v_item ->> 'product_id')::uuid;
    v_qty := (v_item ->> 'quantity')::int;

    insert into order_items (order_id, product_id, product_name, size, color, quantity, unit_price)
    values (v_order_id, v_product.id, v_product.name, nullif(v_item ->> 'size', ''), v_item ->> 'color', v_qty, v_product.price);
  end loop;

  -- 3) TAKE the stock (per size for sized products; the trigger then
  --    refreshes products.stock to the new total).
  for v_line in
    select (i ->> 'product_id')::uuid as product_id,
           nullif(i ->> 'size', '') as size,
           sum((i ->> 'quantity')::int) as qty
    from jsonb_array_elements(p_items) as i
    group by 1, 2
    order by 1, 2
  loop
    select * into v_product from products where id = v_line.product_id;
    if coalesce(array_length(v_product.sizes, 1), 0) > 0 then
      update products
        set size_stock = jsonb_set(
          size_stock,
          array[v_line.size],
          to_jsonb(coalesce((size_stock ->> v_line.size)::int, 0) - v_line.qty)
        )
        where id = v_product.id;
    else
      update products set stock = stock - v_line.qty where id = v_product.id;
    end if;
  end loop;

  return query select v_order_id, v_order_number, v_subtotal + v_delivery_fee, v_delivery_fee;
end;
$$;

revoke execute on function place_order(text, text, text, text, text, text, text, uuid, jsonb, text, text, text, text) from public, anon, authenticated;
grant execute on function place_order(text, text, text, text, text, text, text, uuid, jsonb, text, text, text, text) to service_role;

-- set_order_status(): changing an order to 'cancelled' returns its items to
-- stock (per size); moving it out of 'cancelled' takes them again.
create or replace function set_order_status(p_order_id uuid, p_status text, p_note text default null)
returns orders
language plpgsql
security definer
as $$
declare
  v_order orders%rowtype;
  v_line record;
  v_product products%rowtype;
  v_have int;
begin
  if p_status not in ('pending', 'confirmed', 'shipped', 'delivered', 'cancelled') then
    raise exception 'Invalid order status: %', p_status;
  end if;

  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found';
  end if;

  if p_status = 'cancelled' and v_order.status <> 'cancelled' then
    -- Put the items back on the shelf.
    for v_line in
      select product_id, size, sum(quantity)::int as qty
      from order_items
      where order_id = p_order_id and product_id is not null
      group by 1, 2
      order by 1, 2
    loop
      select * into v_product from products where id = v_line.product_id for update;
      if not found then
        continue; -- product was deleted since; nothing to restock
      end if;

      if coalesce(array_length(v_product.sizes, 1), 0) > 0 then
        if v_line.size is not null and v_line.size = any (v_product.sizes) then
          update products
            set size_stock = jsonb_set(
              size_stock,
              array[v_line.size],
              to_jsonb(coalesce((size_stock ->> v_line.size)::int, 0) + v_line.qty)
            )
            where id = v_product.id;
        end if;
      else
        update products set stock = stock + v_line.qty where id = v_product.id;
      end if;
    end loop;

  elsif p_status <> 'cancelled' and v_order.status = 'cancelled' then
    -- Re-opening a cancelled order: take the items again, if still there.
    for v_line in
      select product_id, size, sum(quantity)::int as qty
      from order_items
      where order_id = p_order_id and product_id is not null
      group by 1, 2
      order by 1, 2
    loop
      select * into v_product from products where id = v_line.product_id for update;
      if not found then
        continue;
      end if;

      if coalesce(array_length(v_product.sizes, 1), 0) > 0 then
        if v_line.size is null or not (v_line.size = any (v_product.sizes)) then
          raise exception 'Cannot re-open this order: size % of % is no longer offered', coalesce(v_line.size, '?'), v_product.slug;
        end if;
        v_have := coalesce((v_product.size_stock ->> v_line.size)::int, 0);
        if v_have < v_line.qty then
          raise exception 'Cannot re-open this order: only % left of % in size %', v_have, v_product.slug, v_line.size;
        end if;
        update products
          set size_stock = jsonb_set(size_stock, array[v_line.size], to_jsonb(v_have - v_line.qty))
          where id = v_product.id;
      else
        if v_product.stock < v_line.qty then
          raise exception 'Cannot re-open this order: only % left of %', v_product.stock, v_product.slug;
        end if;
        update products set stock = stock - v_line.qty where id = v_product.id;
      end if;
    end loop;
  end if;

  update orders set status = p_status, admin_note = p_note where id = p_order_id returning * into v_order;
  return v_order;
end;
$$;

revoke execute on function set_order_status(uuid, text, text) from public, anon, authenticated;
grant execute on function set_order_status(uuid, text, text) to service_role;


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
