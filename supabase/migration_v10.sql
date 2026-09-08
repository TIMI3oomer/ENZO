-- =====================================================================
-- ENZO STORE — MIGRATION 10
-- File: /supabase/migration_v10.sql
-- Run this on an EXISTING database that already has schema.sql applied.
-- Safe to run more than once.
--
-- Adds: a store_settings table (delivery fee + currency symbol, admin-
-- editable), delivery fee + payment tracking columns on orders, and
-- updates place_order() to add the delivery fee to every order's total
-- automatically (looked up server-side, never trusted from the client).
-- =====================================================================

create table if not exists store_settings (
  id boolean primary key default true check (id),
  delivery_fee numeric(10,2) not null default 0,
  currency_symbol text not null default '₪',
  updated_at timestamptz not null default now()
);
insert into store_settings (id) values (true) on conflict (id) do nothing;

alter table orders add column if not exists delivery_fee numeric(10,2) not null default 0;
alter table orders add column if not exists payment_status text not null default 'pending'
  check (payment_status in ('pending', 'paid', 'failed'));
alter table orders add column if not exists stripe_session_id text;
create index if not exists idx_orders_stripe_session on orders(stripe_session_id);

alter table store_settings enable row level security;
drop policy if exists "public read store settings" on store_settings;
create policy "public read store settings" on store_settings for select using (true);
drop policy if exists "admin write store settings" on store_settings;
create policy "admin write store settings" on store_settings for update using (is_admin()) with check (is_admin());

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
  v_delivery_fee numeric := 0;
  v_total numeric := 0;
  v_item jsonb;
  v_product products%rowtype;
  v_qty int;
begin
  if jsonb_array_length(p_items) = 0 then
    raise exception 'Cannot place an order with no items';
  end if;

  select delivery_fee into v_delivery_fee from store_settings where id = true;
  v_delivery_fee := coalesce(v_delivery_fee, 0);

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

  v_total := v_subtotal + v_delivery_fee;

  insert into orders (
    customer_name, phone, city, address, notes,
    payment_method, subtotal, delivery_fee, total, locale, user_id, customer_email,
    payment_status, stripe_session_id
  ) values (
    p_customer_name, p_phone, p_city, p_address, p_notes,
    p_payment_method, v_subtotal, v_delivery_fee, v_total, p_locale, p_user_id, p_email,
    p_payment_status, p_stripe_session_id
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

  return query select v_order_id, v_order_number, v_total;
end;
$$;

NOTIFY pgrst, 'reload schema';
