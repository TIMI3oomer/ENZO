-- =====================================================================
-- ENZO STORE — MIGRATION 19: SALE ITEMS DON'T EARN POINTS
-- File: /supabase/migration_v19.sql
-- Run this ONCE in the Supabase SQL editor after migration_v18 (a
-- brand-new database gets it from schema.sql). Safe to run more than once.
--
-- Points (500 per full 100 ILS, from 100 ILS) are now counted only on
-- items that are NOT on sale. Example: 5 items of 100 ILS with one of them
-- discounted -> points are counted on 400 ILS.
-- If the order also used a discount code and/or points, that discount is
-- spread across all items in proportion, and only the full-price items'
-- share of it is taken off the points total.
--
-- 1) order_items.on_sale: whether the line was on sale when it was added
--    (set automatically by a trigger from the product's discount at that
--    moment), so refunds/exchanges later re-calculate points correctly.
--    Existing lines are filled in from whether they were sold below the
--    product's normal price.
-- 2) points_base(): the amount points are counted on.
-- 3) place_order() and reprice_order(): same as migration_v16, but earn
--    points on points_base() instead of the whole order.
-- 4) order_points_base(): the same for one existing order (used when an
--    in-store sale is given to a customer's account).
-- Points already earned on past orders are not changed.
-- =====================================================================

alter table order_items add column if not exists on_sale boolean not null default false;

update order_items oi
set on_sale = true
from products p
where p.id = oi.product_id
  and oi.on_sale = false
  and oi.unit_price < p.price - 0.005;

create or replace function set_order_item_on_sale()
returns trigger
language plpgsql
as $$
begin
  if new.product_id is not null then
    new.on_sale := coalesce((select discount_percent > 0 from products where id = new.product_id), false);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_order_item_on_sale on order_items;
create trigger trg_order_item_on_sale
  before insert on order_items
  for each row execute function set_order_item_on_sale();

-- What points are counted on: the full-price items, minus their share of
-- any code/points discount (discounts spread over all items by value).
create or replace function points_base(p_subtotal numeric, p_full numeric, p_discounts numeric)
returns numeric
language sql
immutable
as $$
  select case
    when coalesce(p_subtotal, 0) <= 0 then 0
    else greatest(0, coalesce(p_full, 0) - coalesce(p_discounts, 0) * coalesce(p_full, 0) / p_subtotal)
  end;
$$;

create or replace function order_points_base(p_order_id uuid)
returns numeric
language sql
stable
as $$
  select points_base(
    coalesce(sum(oi.quantity * oi.unit_price), 0),
    coalesce(sum(oi.quantity * oi.unit_price) filter (where not oi.on_sale), 0),
    (select coalesce(o.code_discount, 0) + coalesce(o.points_discount, 0) from orders o where o.id = p_order_id)
  )
  from order_items oi
  where oi.order_id = p_order_id;
$$;

-- ---------------------------------------------------------------------
-- place_order(): as in migration_v16, points now on points_base()
-- ---------------------------------------------------------------------
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
  p_delivery_region text default null,
  p_points_redeem int default 0,
  p_discount_code text default null
) returns table(order_id uuid, order_number bigint, total numeric, delivery_fee numeric, points_earned int,
                points_discount numeric, code_discount numeric)
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
  v_redeem int := greatest(coalesce(p_points_redeem, 0), 0);
  v_balance int;
  v_discount numeric := 0;
  v_earned int := 0;
  v_code discount_codes%rowtype;
  v_code_text text := nullif(upper(trim(coalesce(p_discount_code, ''))), '');
  v_code_discount numeric := 0;
  v_full numeric := 0; -- items NOT on sale: the only ones that earn points
begin
  -- Stripe webhook retry: same session already turned into an order.
  if p_stripe_session_id is not null then
    select * into v_existing from orders o where o.stripe_session_id = p_stripe_session_id limit 1;
    if found then
      return query select v_existing.id, v_existing.order_number, v_existing.total, v_existing.delivery_fee,
                          v_existing.points_earned, v_existing.points_discount, v_existing.code_discount;
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

  -- 1) VALIDATE (unchanged): grouped by product/size/color, rows locked
  --    in a fixed order so two simultaneous orders can't deadlock.
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
    if coalesce(v_product.discount_percent, 0) = 0 then
      v_full := v_full + v_product.price * v_line.qty;
    end if;
  end loop;

  -- 2) DISCOUNT CODE (row locked so its last use can't be taken twice).
  if v_code_text is not null then
    select * into v_code from discount_codes where code = v_code_text for update;
    if not found or not v_code.is_active then
      raise exception 'This discount code is not valid';
    end if;
    if v_code.expires_at is not null and v_code.expires_at < now() then
      raise exception 'This discount code has expired';
    end if;
    if v_code.max_uses is not null and v_code.used_count >= v_code.max_uses then
      raise exception 'This discount code has been used up';
    end if;
    if v_subtotal < v_code.min_order then
      raise exception 'This code needs an order of at least % ILS', v_code.min_order;
    end if;
    v_code_discount := code_discount_amount(v_code.kind, v_code.value, v_subtotal);
    update discount_codes set used_count = used_count + 1 where id = v_code.id;
  end if;

  -- 3) POINTS: spend (checked against the locked balance) and earn.
  if v_redeem > 0 then
    if p_user_id is null then
      raise exception 'Sign in to use your points';
    end if;
    insert into profiles (user_id) values (p_user_id) on conflict (user_id) do nothing;
    select points into v_balance from profiles where user_id = p_user_id for update;
    if v_balance < v_redeem then
      raise exception 'You only have % points', greatest(v_balance, 0);
    end if;
    v_discount := round(v_redeem / 100.0, 2);
    if v_discount > v_subtotal - v_code_discount then
      raise exception 'You can use at most % points on this order', ((v_subtotal - v_code_discount) * 100)::int;
    end if;
  end if;

  if p_user_id is not null then
    v_earned := points_for_amount(points_base(v_subtotal, v_full, v_code_discount + v_discount));
  end if;

  -- 4) CREATE the order and its line items.
  insert into orders (
    customer_name, phone, city, address, notes,
    payment_method, subtotal, delivery_fee, delivery_fee_confirmed, total,
    locale, user_id, customer_email,
    payment_status, stripe_session_id, delivery_region,
    points_redeemed, points_discount, points_earned,
    discount_code, discount_kind, discount_value, code_discount
  ) values (
    p_customer_name, p_phone, p_city, p_address, p_notes,
    p_payment_method, v_subtotal, v_delivery_fee, true, v_subtotal - v_code_discount - v_discount + v_delivery_fee,
    p_locale, p_user_id, p_email,
    p_payment_status, p_stripe_session_id, p_delivery_region,
    v_redeem, v_discount, v_earned,
    v_code.code, v_code.kind, coalesce(v_code.value, 0), v_code_discount
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

  perform add_points(p_user_id, v_order_id, -v_redeem, 'redeemed');
  perform add_points(p_user_id, v_order_id, v_earned, 'earned');

  -- Stock is NOT taken here -- only when the admin confirms the order
  -- (set_order_status). See the note in schema.sql.
  return query select v_order_id, v_order_number, v_subtotal - v_code_discount - v_discount + v_delivery_fee,
                      v_delivery_fee, v_earned, v_discount, v_code_discount;
end;
$$;

revoke execute on function place_order(text, text, text, text, text, text, text, uuid, jsonb, text, text, text, text, int, text) from public, anon, authenticated;
grant execute on function place_order(text, text, text, text, text, text, text, uuid, jsonb, text, text, text, text, int, text) to service_role;

-- ---------------------------------------------------------------------
-- reprice_order(): as in migration_v16, points now on points_base()
-- ---------------------------------------------------------------------
create or replace function reprice_order(p_order_id uuid, p_reason text)
returns int
language plpgsql
security definer
as $$
declare
  v_order orders%rowtype;
  v_subtotal numeric;
  v_full numeric;
  v_code numeric;
  v_discount numeric;
  v_redeemed int;
  v_earned int;
  v_delta int := 0;
begin
  select * into v_order from orders where id = p_order_id for update;

  select coalesce(sum(quantity * unit_price), 0),
         coalesce(sum(quantity * unit_price) filter (where not on_sale), 0)
    into v_subtotal, v_full
    from order_items where order_id = p_order_id;

  v_code := code_discount_amount(v_order.discount_kind, v_order.discount_value, v_subtotal);
  v_discount := least(v_order.points_discount, v_subtotal - v_code);
  v_redeemed := (v_discount * 100)::int;
  v_earned := case when v_order.user_id is null then 0 else points_for_amount(points_base(v_subtotal, v_full, v_code + v_discount)) end;

  if v_order.user_id is not null and not v_order.points_reversed then
    -- earned points change, plus any redeemed points that no longer fit
    v_delta := (v_earned - v_order.points_earned) + (v_order.points_redeemed - v_redeemed);
    perform add_points(v_order.user_id, p_order_id, v_delta, p_reason);
  end if;

  update orders set
    subtotal = v_subtotal,
    code_discount = v_code,
    points_discount = v_discount,
    points_redeemed = v_redeemed,
    points_earned = v_earned,
    total = v_subtotal - v_code - v_discount + delivery_fee
  where id = p_order_id;

  return v_delta;
end;
$$;

revoke execute on function points_base(numeric, numeric, numeric) from public, anon, authenticated;
revoke execute on function order_points_base(uuid) from public, anon, authenticated;
revoke execute on function reprice_order(uuid, text) from public, anon, authenticated;
grant execute on function points_base(numeric, numeric, numeric) to service_role;
grant execute on function order_points_base(uuid) to service_role;
grant execute on function reprice_order(uuid, text) to service_role;

NOTIFY pgrst, 'reload schema';
