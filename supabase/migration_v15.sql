-- =====================================================================
-- ENZO STORE — MIGRATION 15
-- File: /supabase/migration_v15.sql
-- Run this on an EXISTING database that already has schema.sql (or
-- migration_v6 through v14) applied. Safe to run more than once.
--
-- Everything below, in one file since it all touches the same tables/
-- functions:
--
-- 1. STOCK PER SIZE+COLOR (replaces the per-size-only model from
--    migration_v14.sql): products.variant_stock, a jsonb map keyed
--    "<color>__<size>" -> quantity, e.g. {"Grey__S": 10, "Blue__S": 5}.
--    products.size_stock is dropped -- there's no faithful way to split
--    its per-size-only numbers across colors, so instead every existing
--    product just starts with an EMPTY variant_stock and keeps using its
--    current `stock` total exactly as before (see the two-state rule in
--    src/lib/variantStock.js: empty = plain aggregate, non-empty = the
--    grid is authoritative, missing combo = 0). Nothing to re-enter
--    unless you actually want per-combo tracking for a given product.
--
-- 2. SOLD-OUT FLAGS + DISCOUNTS: products.sold_out_sizes/sold_out_colors
--    (manual override, independent of stock numbers) and
--    products.discount_percent (0 = not on sale; the sale price is
--    always computed as price * (1 - discount_percent/100), never
--    stored separately).
--
-- 3. SITE CONTENT CMS: content_items/content_collections, a small
--    manifest-driven editor for page text/images that don't already have
--    their own admin screen (products/categories/orders already do).
--    Reuses the SAME is_admin() every other admin write here already
--    uses -- no new admin table or allow-list.
--
-- 4. STOCK TAKEN ON CONFIRM, NOT ON PLACEMENT: a new order now only
--    VALIDATES stock is available -- it's actually taken when the admin
--    moves it to 'confirmed' (not before), so a pending order that's
--    never confirmed never ties up stock, and "declining" one (straight
--    to 'cancelled' from 'pending') is a no-op on stock since nothing
--    was taken. Items go back on the shelf the moment an order leaves a
--    "stock committed" status (confirmed/shipped/delivered) -- covers
--    cancelling a confirmed order and re-confirming a cancelled one.
--
-- 5. IN-STORE SALES: this is a real shop, not just a website. Admin ->
--    In-store sale rings up a walk-in sale against the SAME stock pool,
--    taken immediately (record_in_store_sale()) since there's no pending
--    step for something that already happened. orders.channel
--    ('online'/'in_store') tells the two apart.
--
-- 6. REFUNDS: Admin -> Orders -> "Refund" on a paid order. For a card
--    payment this calls Stripe to actually return the money (see
--    PATCH /api/admin/orders/:id/refund in server/src/routes/admin.js);
--    either way it restocks the items (reuses set_order_status, same as
--    a decline) and marks payment_status 'refunded'.
-- =====================================================================

alter table products add column if not exists sold_out_sizes text[] not null default '{}';
alter table products add column if not exists sold_out_colors text[] not null default '{}';
alter table products add column if not exists discount_percent numeric(5,2) not null default 0
  check (discount_percent >= 0 and discount_percent <= 100);
alter table products add column if not exists variant_stock jsonb not null default '{}'::jsonb
  check (jsonb_typeof(variant_stock) = 'object');
alter table products drop column if exists size_stock;

create index if not exists idx_products_discount on products(discount_percent) where discount_percent > 0;

alter table orders drop constraint if exists orders_payment_method_check;
alter table orders add constraint orders_payment_method_check
  check (payment_method in ('cod','visa','reflect','in_store'));

alter table orders drop constraint if exists orders_payment_status_check;
alter table orders add constraint orders_payment_status_check
  check (payment_status in ('pending','paid','failed','refunded'));

alter table orders add column if not exists channel text not null default 'online'
  check (channel in ('online', 'in_store'));

-- ---------- sync_product_stock() trigger: size_stock -> variant_stock ----------
create or replace function sync_product_stock()
returns trigger
language plpgsql
as $$
begin
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

-- ---------- place_order(): validates stock, does NOT take it (see set_order_status) ----------
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

  -- VALIDATE. Lines are grouped by (product, size, color) so the exact
  -- same combo split across two cart lines is checked as one total. Rows
  -- are locked in a fixed order, so two simultaneous orders can never
  -- deadlock or both take the last piece.
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

-- ---------- set_order_status(): takes stock on confirm, restocks when leaving a committed status ----------
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

-- ---------- record_in_store_sale(): walk-in sale, stock taken immediately ----------
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
        set variant_stock = jsonb_set(variant_stock, array[v_variant_key], to_jsonb(v_have - v_line.qty))
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

-- ---------- CMS: content_items / content_collections ----------
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

drop policy if exists "public read content_items" on content_items;
create policy "public read content_items" on content_items for select using (true);
drop policy if exists "admin write content_items" on content_items;
create policy "admin write content_items" on content_items for all using (is_admin()) with check (is_admin());

drop policy if exists "public read content_collections" on content_collections;
create policy "public read content_collections" on content_collections for select using (true);
drop policy if exists "admin write content_collections" on content_collections;
create policy "admin write content_collections" on content_collections for all using (is_admin()) with check (is_admin());

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
