-- =====================================================================
-- ENZO STORE — MIGRATION 15
-- File: /supabase/migration_v15.sql
-- Run this on an EXISTING database that already has schema.sql (or
-- migration_v6 through v14) applied. Safe to run more than once.
--
-- Adds per size+color stock tracking: a grey shirt might have 10 in S
-- while the same shirt in blue only has 5 in S. Stored as
-- products.variant_stock, a jsonb map keyed "<color>__<size>" ->
-- quantity (see src/lib/variantStock.js and admin/ProductForm.jsx's
-- stock grid).
--
-- BACKWARD COMPATIBLE: a product saved before this existed (or one with
-- only sizes, only colors, or neither) has no entries in variant_stock --
-- place_order() below falls back to the plain aggregate `stock` column
-- for any size+color combo with no tracked entry, so nothing already
-- live regresses. `stock` itself stays the authoritative total every
-- other screen reads (ProductCard's "out of stock" ribbon, Cart.jsx) --
-- it's kept in sync automatically (computed as the sum of the grid on
-- save, and decremented alongside the specific variant on checkout).
-- =====================================================================

alter table products add column if not exists variant_stock jsonb not null default '{}';

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

NOTIFY pgrst, 'reload schema';
