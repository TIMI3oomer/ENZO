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
  -- Which of this product's sizes/colors are currently unavailable,
  -- independent of each other and of the stock numbers below -- the
  -- storefront disables + red-marks these as "Sold out" regardless of
  -- what variant_stock says, for a quick manual override.
  sold_out_sizes text[] not null default '{}',
  sold_out_colors text[] not null default '{}',
  -- 0 = not on sale. Sale price is computed as price * (1 -
  -- discount_percent/100) wherever shown, never stored separately.
  discount_percent numeric(5,2) not null default 0 check (discount_percent >= 0 and discount_percent <= 100),
  stock int not null default 0 check (stock >= 0), -- auto-total of variant_stock once it's in use (see trigger below)
  -- Per size+color stock, e.g. {"Grey__S": 10, "Blue__S": 5} -- a grey
  -- shirt might have 10 in S while the same shirt in blue only has 5 in
  -- S. Empty object = this product doesn't use the grid (every product
  -- saved before this existed, or one with only sizes, only colors, or
  -- neither) -- `stock` above is then the plain total, edited directly.
  -- See src/lib/variantStock.js for the exact two-state rule this and
  -- the trigger below both follow.
  variant_stock jsonb not null default '{}'::jsonb check (jsonb_typeof(variant_stock) = 'object'),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_products_category on products(category_id);
create index if not exists idx_products_active on products(is_active);
create index if not exists idx_products_discount on products(discount_percent) where discount_percent > 0;

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
  payment_method text not null check (payment_method in ('cod','visa','reflect','in_store')),
  status text not null default 'pending'
    check (status in ('pending','confirmed','shipped','delivered','cancelled')),
  subtotal numeric(10,2) not null,
  delivery_fee numeric(10,2) not null default 0,
  delivery_fee_confirmed boolean not null default false,
  delivery_region text check (delivery_region is null or delivery_region in ('west_bank', 'jerusalem', 'inside')),
  total numeric(10,2) not null,
  payment_status text not null default 'pending' check (payment_status in ('pending', 'paid', 'failed', 'refunded')),
  stripe_session_id text,
  -- 'online' = placed by a customer on the site; 'in_store' = rung up by
  -- the admin for a walk-in customer (Admin -> In-store sale). Same
  -- products/stock pool either way -- this is just for telling the two
  -- apart in the orders list and analytics.
  channel text not null default 'online' check (channel in ('online', 'in_store')),
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

-- STOCK PER SIZE+COLOR: products.variant_stock holds stock per combo and
-- this trigger keeps products.stock equal to their total, but ONLY once
-- variant_stock actually has entries -- a product that has never used the
-- grid keeps `stock` as a plain, directly-edited number (see the two-state
-- rule in src/lib/variantStock.js). This is what lets an admin edit, say,
-- just a product's name without the trigger silently zeroing out its
-- stock because the grid was never filled in.
create or replace function sync_product_stock()
returns trigger
language plpgsql
as $$
begin
  -- Refuse malformed data instead of silently turning it into zeros.
  if jsonb_typeof(new.variant_stock) is distinct from 'object' then
    raise exception 'variant_stock must be a JSON object like {"Grey__S": 10}';
  end if;

  if new.variant_stock <> '{}'::jsonb then
    new.stock := coalesce(
      (select sum(greatest(value::int, 0)) from jsonb_each_text(new.variant_stock)),
      0
    );
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
  v_variant_key text;
  v_unit_price numeric;
  v_uses_variants boolean;
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

  -- 1) VALIDATE. Lines are grouped by (product, size, color) so the exact
  --    same combo split across two cart lines is checked as one total.
  --    Rows are locked in a fixed order, so two simultaneous orders can
  --    never deadlock or both take the last piece.
  for v_line in
    select (i ->> 'product_id')::uuid as product_id,
           nullif(i ->> 'size', '') as size,
           nullif(i ->> 'color', '') as color,
           sum((i ->> 'quantity')::int) as qty
    from jsonb_array_elements(p_items) as i
    group by 1, 2, 3
    order by 1, 2, 3
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
    end if;

    if v_line.size is not null and v_product.sold_out_sizes @> array[v_line.size] then
      raise exception 'Size % is sold out for %', v_line.size, v_product.slug;
    end if;

    if v_line.color is not null and v_product.sold_out_colors @> array[v_line.color] then
      raise exception 'Color % is sold out for %', v_line.color, v_product.slug;
    end if;

    -- Two states, not a per-combo fallback: a product with ANY
    -- variant_stock entries is using the grid, and a combo with no key
    -- there is 0, not the aggregate; a product with none yet (or one
    -- without both sizes and colors) just uses the plain aggregate. See
    -- src/lib/variantStock.js for the identical client-side rule.
    v_uses_variants := v_product.variant_stock <> '{}'::jsonb;
    if v_uses_variants then
      if v_line.size is not null and v_line.color is not null then
        v_variant_key := v_line.color || '__' || v_line.size;
        v_have := coalesce((v_product.variant_stock ->> v_variant_key)::int, 0);
      else
        v_have := 0;
      end if;
    else
      v_have := v_product.stock;
    end if;

    if v_have < v_line.qty then
      raise exception 'Insufficient stock for %: only % left', v_product.slug, v_have;
    end if;

    -- Sale price, same math as the frontend (never a stored column) --
    -- the subtotal/line item below MUST agree with what the customer saw.
    v_subtotal := v_subtotal + (round(v_product.price * (1 - v_product.discount_percent / 100), 2) * v_line.qty);
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
    v_unit_price := round(v_product.price * (1 - v_product.discount_percent / 100), 2);

    insert into order_items (order_id, product_id, product_name, size, color, quantity, unit_price)
    values (
      v_order_id, v_product.id, v_product.name,
      nullif(v_item ->> 'size', ''), nullif(v_item ->> 'color', ''), v_qty, v_unit_price
    );
  end loop;

  -- NOTE: stock is NOT taken here. A new order only VALIDATES that stock
  -- is available right now -- it's actually taken when the admin moves
  -- the order to 'confirmed' (see set_order_status() below), so a
  -- pending order that's never confirmed never ties up stock. Between
  -- placing and confirming, stock can still be sold out from under a
  -- pending order by something else; confirming then fails with a clear
  -- "insufficient stock" error instead of silently overselling.
  return query select v_order_id, v_order_number, v_subtotal + v_delivery_fee, v_delivery_fee;
end;
$$;

revoke execute on function place_order(text, text, text, text, text, text, text, uuid, jsonb, text, text, text, text) from public, anon, authenticated;
grant execute on function place_order(text, text, text, text, text, text, text, uuid, jsonb, text, text, text, text) to service_role;

-- set_order_status(): stock is taken ONLY once an order is CONFIRMED (not
-- at creation -- see place_order()), and given back the moment it leaves
-- a "stock committed" status. 'confirmed'/'shipped'/'delivered' all count
-- as committed (moving between those three never touches stock); moving
-- IN from 'pending' takes it, moving OUT to 'pending' or 'cancelled'
-- gives it back. This one rule also covers "declining" an order (send it
-- straight from 'pending' to 'cancelled' -- nothing was ever taken, so
-- nothing to restock) and re-confirming a previously cancelled order
-- (validated and taken again, refused if it's since sold out).
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
  v_variant_key text;
  v_uses_variants boolean;
  v_was_committed boolean;
  v_will_be_committed boolean;
begin
  if p_status not in ('pending', 'confirmed', 'shipped', 'delivered', 'cancelled') then
    raise exception 'Invalid order status: %', p_status;
  end if;

  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found';
  end if;

  v_was_committed := v_order.status in ('confirmed', 'shipped', 'delivered');
  v_will_be_committed := p_status in ('confirmed', 'shipped', 'delivered');

  if v_will_be_committed and not v_was_committed then
    -- Taking stock for the first time: validate every line has enough
    -- left (it may have sold out since this order was placed), THEN take
    -- it -- two passes, so a failure partway through never leaves some
    -- lines decremented and others not.
    for v_line in
      select product_id, size, color, sum(quantity)::int as qty
      from order_items
      where order_id = p_order_id and product_id is not null
      group by 1, 2, 3
      order by 1, 2, 3
    loop
      select * into v_product from products where id = v_line.product_id for update;
      if not found then
        raise exception 'Cannot confirm this order: a product in it was deleted';
      end if;

      if coalesce(array_length(v_product.sizes, 1), 0) > 0 then
        if v_line.size is null or not (v_line.size = any (v_product.sizes)) then
          raise exception 'Cannot confirm this order: size % of % is no longer offered', coalesce(v_line.size, '?'), v_product.slug;
        end if;
      end if;

      v_uses_variants := v_product.variant_stock <> '{}'::jsonb;
      if v_uses_variants then
        if v_line.size is not null and v_line.color is not null then
          v_variant_key := v_line.color || '__' || v_line.size;
          v_have := coalesce((v_product.variant_stock ->> v_variant_key)::int, 0);
        else
          v_have := 0;
        end if;
      else
        v_have := v_product.stock;
      end if;

      if v_have < v_line.qty then
        raise exception 'Cannot confirm this order: only % left of %', v_have, v_product.slug;
      end if;
    end loop;

    for v_line in
      select product_id, size, color, sum(quantity)::int as qty
      from order_items
      where order_id = p_order_id and product_id is not null
      group by 1, 2, 3
      order by 1, 2, 3
    loop
      select * into v_product from products where id = v_line.product_id for update;
      v_uses_variants := v_product.variant_stock <> '{}'::jsonb;

      if v_uses_variants and v_line.size is not null and v_line.color is not null then
        v_variant_key := v_line.color || '__' || v_line.size;
        update products
          set variant_stock = jsonb_set(
            variant_stock,
            array[v_variant_key],
            to_jsonb(greatest(0, coalesce((variant_stock ->> v_variant_key)::int, 0) - v_line.qty))
          )
          where id = v_product.id;
      else
        update products set stock = greatest(0, stock - v_line.qty) where id = v_product.id;
      end if;
    end loop;

  elsif v_was_committed and not v_will_be_committed then
    -- Put the items back on the shelf (declining a confirmed order,
    -- cancelling, or sending it back to pending).
    for v_line in
      select product_id, size, color, sum(quantity)::int as qty
      from order_items
      where order_id = p_order_id and product_id is not null
      group by 1, 2, 3
      order by 1, 2, 3
    loop
      select * into v_product from products where id = v_line.product_id for update;
      if not found then
        continue; -- product was deleted since; nothing to restock
      end if;

      v_uses_variants := v_product.variant_stock <> '{}'::jsonb;
      if v_uses_variants and v_line.size is not null and v_line.color is not null then
        v_variant_key := v_line.color || '__' || v_line.size;
        update products
          set variant_stock = jsonb_set(
            variant_stock,
            array[v_variant_key],
            to_jsonb(coalesce((variant_stock ->> v_variant_key)::int, 0) + v_line.qty)
          )
          where id = v_product.id;
      elsif not v_uses_variants then
        update products set stock = stock + v_line.qty where id = v_product.id;
      end if;
      -- else: product uses the grid but this line has no size+color on
      -- record (shouldn't happen) -- nothing sane to restock, skip it.
    end loop;
  end if;
  -- else: moving between two committed statuses (confirmed -> shipped ->
  -- delivered) or two uncommitted ones (pending -> cancelled, "declining"
  -- an order that was never confirmed) -- stock already reflects reality,
  -- nothing to change.

  update orders set status = p_status, admin_note = p_note where id = p_order_id returning * into v_order;
  return v_order;
end;
$$;

revoke execute on function set_order_status(uuid, text, text) from public, anon, authenticated;
grant execute on function set_order_status(uuid, text, text) to service_role;

-- record_in_store_sale(): a walk-in, rung-up-by-the-admin sale -- this is
-- a real shop, not just a website. Same products/stock pool as online
-- orders, but immediate: stock is taken right away (no pending step,
-- there's nothing to confirm -- the item already left the shelf) and the
-- order is recorded already paid/delivered, tagged channel='in_store' so
-- it's easy to tell apart in the orders list and analytics.
create or replace function record_in_store_sale(
  p_items jsonb,
  p_customer_name text default 'Walk-in customer',
  p_note text default null
) returns table(order_id uuid, order_number bigint, total numeric)
language plpgsql
security definer
as $$
declare
  v_order_id uuid;
  v_order_number bigint;
  v_subtotal numeric := 0;
  v_item jsonb;
  v_line record;
  v_product products%rowtype;
  v_qty int;
  v_have int;
  v_variant_key text;
  v_unit_price numeric;
  v_uses_variants boolean;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Cannot record a sale with no items';
  end if;

  -- VALIDATE + TAKE in one pass -- unlike online orders, an in-store sale
  -- has already happened by the time it's entered, so stock is taken
  -- immediately rather than waiting for a separate confirm step.
  for v_line in
    select (i ->> 'product_id')::uuid as product_id,
           nullif(i ->> 'size', '') as size,
           nullif(i ->> 'color', '') as color,
           sum((i ->> 'quantity')::int) as qty
    from jsonb_array_elements(p_items) as i
    group by 1, 2, 3
    order by 1, 2, 3
  loop
    select * into v_product from products where id = v_line.product_id for update;

    if not found then
      raise exception 'Product not found: %', v_line.product_id;
    end if;

    if v_line.qty is null or v_line.qty <= 0 then
      raise exception 'Invalid quantity for product %', v_product.slug;
    end if;

    v_uses_variants := v_product.variant_stock <> '{}'::jsonb;
    if v_uses_variants then
      if v_line.size is not null and v_line.color is not null then
        v_variant_key := v_line.color || '__' || v_line.size;
        v_have := coalesce((v_product.variant_stock ->> v_variant_key)::int, 0);
      else
        v_have := 0;
      end if;
    else
      v_have := v_product.stock;
    end if;

    if v_have < v_line.qty then
      raise exception 'Insufficient stock for %: only % left', v_product.slug, v_have;
    end if;

    v_subtotal := v_subtotal + (round(v_product.price * (1 - v_product.discount_percent / 100), 2) * v_line.qty);

    if v_uses_variants and v_line.size is not null and v_line.color is not null then
      update products
        set variant_stock = jsonb_set(
          variant_stock,
          array[v_variant_key],
          to_jsonb(v_have - v_line.qty)
        )
        where id = v_product.id;
    else
      update products set stock = v_have - v_line.qty where id = v_product.id;
    end if;
  end loop;

  insert into orders (
    customer_name, phone, city, address, notes, admin_note,
    payment_method, subtotal, delivery_fee, delivery_fee_confirmed, total,
    locale, payment_status, status, channel
  ) values (
    p_customer_name, '-', 'In-store', '-', null, p_note,
    'in_store', v_subtotal, 0, true, v_subtotal,
    'ar', 'paid', 'delivered', 'in_store'
  )
  returning id, orders.order_number into v_order_id, v_order_number;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select * into v_product from products where id = (v_item ->> 'product_id')::uuid;
    v_qty := (v_item ->> 'quantity')::int;
    v_unit_price := round(v_product.price * (1 - v_product.discount_percent / 100), 2);

    insert into order_items (order_id, product_id, product_name, size, color, quantity, unit_price)
    values (
      v_order_id, v_product.id, v_product.name,
      nullif(v_item ->> 'size', ''), nullif(v_item ->> 'color', ''), v_qty, v_unit_price
    );
  end loop;

  return query select v_order_id, v_order_number, v_subtotal;
end;
$$;

revoke execute on function record_in_store_sale(jsonb, text, text) from public, anon, authenticated;
grant execute on function record_in_store_sale(jsonb, text, text) to service_role;

-- =====================================================================
-- CMS: manifest-driven content for page text/images that don't already
-- have their own admin screen (products/categories/orders already do --
-- this is NOT for those). See src/lib/contentManifest.js.
--
-- content_items: (page, section, key) -> value, for singleton scalars (a
-- heading, a button label, an image URL). content_collections: (page,
-- section, sort_order) -> jsonb, for small ordered lists. Reuses the
-- SAME is_admin() every other admin write in this file already checks --
-- one admin allow-list, not a second one that could drift out of sync.
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

-- Separate bucket for CMS-uploaded images (hero/logo/etc), managed
-- independently of product-images. SVG is deliberately excluded -- an
-- uploaded SVG can carry <script>, and this bucket is served publicly
-- (stored-XSS vector).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'content-images', 'content-images', true,
  5242880, -- 5 MB
  array['image/jpeg', 'image/png', 'image/webp']
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
