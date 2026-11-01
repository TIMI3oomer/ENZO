-- =====================================================================
-- ENZO STORE — MIGRATION 12
-- File: /supabase/migration_v12.sql
-- Run this on an EXISTING database that already has schema.sql (or
-- migration_v11.sql) applied. Safe to run more than once.
--
-- 1) DELIVERY REGIONS: the customer now picks where they are at checkout
--    (الضفة / القدس / الداخل) and the delivery fee is charged right away:
--      west_bank  -> 20 ILS
--      jerusalem  -> 30 ILS
--      inside     -> 70 ILS
--    The fee is computed HERE in the database from the region name --
--    never sent by the client -- same "don't trust the client for money"
--    rule as product prices. New orders are created with
--    delivery_fee_confirmed = true and total = subtotal + fee. The admin
--    can still override the fee per order from the Orders page.
--    To change a price later, edit delivery_fee_for_region() below and
--    re-run this file (and update src/lib/delivery.js for the display).
--
-- 2) SECURITY FIX: the old direct-to-Supabase checkout left two INSERT
--    policies open ("create own or guest orders", "anyone can create
--    order items"), and place_order() was executable by anon. Anyone with
--    the public anon key could insert an order with any total, or call
--    place_order() with p_payment_status = 'paid' and get a "paid" card
--    order without paying. All checkout writes go through the Node
--    backend with the service_role key now, so those doors are closed.
--
-- 3) STRIPE WEBHOOK RETRIES: Stripe can deliver the same
--    checkout.session.completed event more than once. place_order() now
--    returns the existing order for an already-used stripe_session_id
--    instead of creating a duplicate order (and decrementing stock twice).
-- =====================================================================

-- ---------- 1) delivery region column ----------
alter table orders add column if not exists delivery_region text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'orders_delivery_region_check'
  ) then
    alter table orders add constraint orders_delivery_region_check
      check (delivery_region is null or delivery_region in ('west_bank', 'jerusalem', 'inside'));
  end if;
end $$;

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

-- ---------- place_order with region ----------
-- Signature changes (new p_delivery_region param), so the old version
-- must be dropped first or Postgres keeps both overloads side by side.
drop function if exists place_order(text, text, text, text, text, text, text, uuid, jsonb, text, text, text);

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
  v_product products%rowtype;
  v_qty int;
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
    select * into v_product from products where id = (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::int;

    insert into order_items (order_id, product_id, product_name, size, color, quantity, unit_price)
    values (v_order_id, v_product.id, v_product.name, v_item->>'size', v_item->>'color', v_qty, v_product.price);

    update products set stock = stock - v_qty where id = v_product.id;
  end loop;

  return query select v_order_id, v_order_number, v_subtotal + v_delivery_fee, v_delivery_fee;
end;
$$;

-- ---------- 2) lock checkout down to the backend only ----------
revoke execute on function place_order(text, text, text, text, text, text, text, uuid, jsonb, text, text, text, text) from public, anon, authenticated;
grant execute on function place_order(text, text, text, text, text, text, text, uuid, jsonb, text, text, text, text) to service_role;

drop policy if exists "create own or guest orders" on orders;
drop policy if exists "anyone can create order items" on order_items;

NOTIFY pgrst, 'reload schema';
