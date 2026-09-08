-- =====================================================================
-- ENZO STORE — MIGRATION 11
-- File: /supabase/migration_v11.sql
-- Run this on an EXISTING database that already has schema.sql (or
-- migration_v10.sql) applied. Safe to run more than once.
--
-- Removes the single global delivery fee (store_settings) -- delivery
-- cost varies by city, so one flat number for every order was wrong.
-- Delivery fee is now set per order instead: every new order is created
-- with delivery_fee = 0 / delivery_fee_confirmed = false (total =
-- subtotal only), and the admin fills in the real fee for that order
-- from the Orders page once they know it (PATCH
-- /api/admin/orders/:id/delivery-fee) -- which recalculates the total
-- and emails the customer their confirmed final price.
-- =====================================================================

alter table orders add column if not exists delivery_fee_confirmed boolean not null default false;

-- Every order placed before this migration already had a real (if
-- globally-set) delivery fee baked into its total under the old system
-- -- treat all of them as already confirmed, so they don't suddenly show
-- up as "fee pending" in the admin UI.
update orders set delivery_fee_confirmed = true where delivery_fee_confirmed = false;

drop table if exists store_settings;

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
    values (v_order_id, v_product.id, v_product.name, v_item->>'size', v_item->>'color', v_qty, v_product.price);

    update products set stock = stock - v_qty where id = v_product.id;
  end loop;

  return query select v_order_id, v_order_number, v_subtotal;
end;
$$;

NOTIFY pgrst, 'reload schema';
