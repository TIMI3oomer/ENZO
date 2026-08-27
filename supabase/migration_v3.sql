-- =====================================================================
-- ENZO STORE — MIGRATION 3
-- File: /supabase/migration_v3.sql
-- Run this AFTER schema.sql and migration_v2.sql.
--
-- CHECKPOINT NOTE — WHY THIS EXISTS
-- Until now, Checkout.jsx computed the order total in the BROWSER (from
-- cart state) and sent that number straight to the database. Anyone with
-- devtools open could edit the price before it's saved. This function
-- moves price calculation and stock-checking into the database itself:
-- - It looks up the REAL price of each product server-side (ignores
--   whatever price the client sends).
-- - It locks each product row (`for update`) while checking stock, so two
--   customers buying the last item at the same instant can't both succeed.
-- - It creates the order + its line items + decrements stock all in ONE
--   transaction — if anything fails partway, everything rolls back
--   together (no half-created orders, no stock silently vanishing).
--
-- This function is called ONLY from the Node.js backend (server/), using
-- the service_role key — never directly from the frontend.
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
  p_items jsonb -- [{ "product_id": "...", "size": "M", "quantity": 2 }, ...]
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

  -- First pass: lock every product row involved and validate stock/price.
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

    -- Real price comes from the database, never from the client.
    v_subtotal := v_subtotal + (v_product.price * v_qty);
  end loop;

  insert into orders (
    customer_name, phone, city, address, notes,
    payment_method, subtotal, total, locale, user_id
  ) values (
    p_customer_name, p_phone, p_city, p_address, p_notes,
    p_payment_method, v_subtotal, v_subtotal, p_locale, p_user_id
  )
  returning id, orders.order_number into v_order_id, v_order_number;

  -- Second pass: write line items (snapshotting the name) and decrement stock.
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select * into v_product from products where id = (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::int;

    insert into order_items (order_id, product_id, product_name, size, quantity, unit_price)
    values (v_order_id, v_product.id, v_product.name, v_item->>'size', v_qty, v_product.price);

    update products set stock = stock - v_qty where id = v_product.id;
  end loop;

  return query select v_order_id, v_order_number, v_subtotal;
end;
$$;
