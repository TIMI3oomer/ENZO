-- =====================================================================
-- ENZO STORE — MIGRATION 16: POINTS, ORDER TRACKING, ITEM RETURNS
-- File: /supabase/migration_v16.sql
-- Run this ONCE in the Supabase SQL editor on a database that already has
-- migration_v15 applied (a brand-new database gets all of this from
-- schema.sql, which includes this file's contents at the end). Safe to
-- run more than once.
--
-- 1) LOYALTY POINTS
--    - 100 points = 1 ILS.
--    - An order whose items come to 100 ILS or more earns 500 points per
--      full 100 ILS (100-199 -> 500, 200-299 -> 1000, ...). Counted on the
--      items after any points discount, never on the delivery fee.
--    - Points are earned the moment the order is placed (signed-in
--      customers only -- a guest has no account to hold them).
--    - Points can be spent on the next order (place_order p_points_redeem).
--    - Cancelling an order takes back the points it earned and gives back
--      the points spent on it; re-opening it does the reverse. A full
--      refund cancels the order, so it's covered too.
--    - Refunding / exchanging single items recalculates the points the
--      order earns and takes back (or adds) the difference.
--    Every change is written to points_ledger, and profiles.points is the
--    running balance. A balance CAN go below zero (points earned on an
--    order, spent, then that order cancelled) -- it just can't be spent
--    until it's positive again.
--
-- 2) ORDER TRACKING: order_status_history gets a row every time an
--    order's status changes (plus one when it's created), so customers
--    can see a timeline on the site's "Track order" page.
--
-- 3) DISCOUNT CODES: the admin creates codes (percent or fixed ILS, with
--    optional minimum order, usage limit and expiry) and customers enter
--    one at checkout. The code comes off the items first; points are then
--    spent/earned on what's left. Cancelling an order frees its use of
--    the code again; re-opening takes it back.
--
-- 4) ITEM REFUND / EXCHANGE (admin): refund_order_item() and
--    exchange_order_item() change one line of an order, move stock if the
--    order had already taken it, re-price the order and log the money
--    difference in order_returns.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Columns and tables
-- ---------------------------------------------------------------------
alter table profiles add column if not exists points int not null default 0;

alter table orders add column if not exists points_redeemed int not null default 0;
alter table orders add column if not exists points_discount numeric(10,2) not null default 0;
alter table orders add column if not exists points_earned int not null default 0;
alter table orders add column if not exists points_reversed boolean not null default false;

alter table orders add column if not exists discount_code text;
alter table orders add column if not exists discount_kind text;
alter table orders add column if not exists discount_value numeric(10,2) not null default 0;
alter table orders add column if not exists code_discount numeric(10,2) not null default 0;

create table if not exists discount_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code = upper(code) and length(code) between 3 and 30),
  kind text not null check (kind in ('percent', 'fixed')),
  value numeric(10,2) not null check (value > 0),
  min_order numeric(10,2) not null default 0,
  max_uses int check (max_uses is null or max_uses > 0),
  used_count int not null default 0,
  expires_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  check (kind <> 'percent' or value <= 100)
);
alter table discount_codes enable row level security;

create table if not exists points_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  order_id uuid references orders(id) on delete set null,
  delta int not null,
  reason text not null check (reason in (
    'earned', 'redeemed', 'order_cancelled', 'order_reopened', 'item_refunded', 'item_exchanged', 'admin'
  )),
  created_at timestamptz not null default now()
);
create index if not exists idx_points_ledger_user on points_ledger(user_id, created_at desc);

create table if not exists order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  status text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_order_status_history_order on order_status_history(order_id, created_at);

-- Every order that existed before this migration gets one history row
-- (its current status, at the time it was placed) so tracking isn't empty.
insert into order_status_history (order_id, status, created_at)
select o.id, o.status, o.created_at
from orders o
where not exists (select 1 from order_status_history h where h.order_id = o.id);

create table if not exists order_returns (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  kind text not null check (kind in ('refund', 'exchange')),
  product_name jsonb not null,
  size text,
  color text,
  quantity int not null check (quantity > 0),
  new_product_name jsonb,
  new_size text,
  new_color text,
  -- Order total after minus before: negative = the store owes the
  -- customer that much back, positive = the customer pays the difference.
  money_diff numeric(10,2) not null,
  points_delta int not null default 0,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists idx_order_returns_order on order_returns(order_id, created_at);

-- Server (service_role) only -- no public policies.
alter table points_ledger enable row level security;
alter table order_status_history enable row level security;
alter table order_returns enable row level security;

-- ---------------------------------------------------------------------
-- 2) Helpers
-- ---------------------------------------------------------------------
-- 500 points per full 100 ILS, only once the amount reaches 100 ILS.
create or replace function points_for_amount(p_amount numeric)
returns int
language sql
immutable
as $$
  select case when coalesce(p_amount, 0) >= 100 then (floor(p_amount / 100) * 500)::int else 0 end;
$$;

-- What a code takes off `p_subtotal` (never more than the subtotal).
create or replace function code_discount_amount(p_kind text, p_value numeric, p_subtotal numeric)
returns numeric
language sql
immutable
as $$
  select case
    when p_kind = 'percent' then round(p_subtotal * p_value / 100, 2)
    when p_kind = 'fixed' then least(p_value, p_subtotal)
    else 0
  end;
$$;

-- Adds `p_delta` points to a customer (negative takes them) and logs why.
create or replace function add_points(p_user_id uuid, p_order_id uuid, p_delta int, p_reason text)
returns void
language plpgsql
security definer
as $$
begin
  if p_user_id is null or coalesce(p_delta, 0) = 0 then
    return;
  end if;
  insert into profiles (user_id) values (p_user_id) on conflict (user_id) do nothing;
  update profiles set points = points + p_delta where user_id = p_user_id;
  insert into points_ledger (user_id, order_id, delta, reason) values (p_user_id, p_order_id, p_delta, p_reason);
end;
$$;

-- Moves stock for one product/size/color: negative p_delta takes it
-- (refused if not enough left), positive puts it back. Same two-state
-- rule as everywhere else (src/lib/variantStock.js): a product with any
-- variant_stock entries is tracked per color+size, otherwise by `stock`.
create or replace function adjust_stock(p_product_id uuid, p_size text, p_color text, p_delta int)
returns void
language plpgsql
security definer
as $$
declare
  v_product products%rowtype;
  v_key text;
  v_have int;
begin
  select * into v_product from products where id = p_product_id for update;
  if not found then
    return; -- product deleted since; nothing to move
  end if;

  if v_product.variant_stock <> '{}'::jsonb then
    if p_size is null or p_color is null then
      if p_delta < 0 then
        raise exception 'Please choose a size and color for %', v_product.slug;
      end if;
      return;
    end if;
    v_key := p_color || '__' || p_size;
    v_have := coalesce((v_product.variant_stock ->> v_key)::int, 0);
    if v_have + p_delta < 0 then
      raise exception 'Not enough stock for % (% / %): only % left', v_product.slug, p_color, p_size, v_have;
    end if;
    update products
      set variant_stock = jsonb_set(variant_stock, array[v_key], to_jsonb(v_have + p_delta))
      where id = p_product_id;
  else
    if v_product.stock + p_delta < 0 then
      raise exception 'Not enough stock for %: only % left', v_product.slug, v_product.stock;
    end if;
    update products set stock = stock + p_delta where id = p_product_id;
  end if;
end;
$$;

-- Re-prices an order from its current lines after a refund/exchange:
-- subtotal, points discount (capped at the new subtotal -- any points
-- that no longer fit are given back), total, and the points it earns.
-- Returns the change in the customer's points.
create or replace function reprice_order(p_order_id uuid, p_reason text)
returns int
language plpgsql
security definer
as $$
declare
  v_order orders%rowtype;
  v_subtotal numeric;
  v_code numeric;
  v_discount numeric;
  v_redeemed int;
  v_earned int;
  v_delta int := 0;
begin
  select * into v_order from orders where id = p_order_id for update;

  select coalesce(sum(quantity * unit_price), 0) into v_subtotal from order_items where order_id = p_order_id;

  v_code := code_discount_amount(v_order.discount_kind, v_order.discount_value, v_subtotal);
  v_discount := least(v_order.points_discount, v_subtotal - v_code);
  v_redeemed := (v_discount * 100)::int;
  v_earned := case when v_order.user_id is null then 0 else points_for_amount(v_subtotal - v_code - v_discount) end;

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

-- ---------------------------------------------------------------------
-- 3) Triggers: tracking history + points on cancel / re-open
-- ---------------------------------------------------------------------
create or replace function orders_status_changed()
returns trigger
language plpgsql
security definer
as $$
begin
  if tg_op = 'INSERT' then
    insert into order_status_history (order_id, status) values (new.id, new.status);
    return new;
  end if;

  if new.status is distinct from old.status then
    insert into order_status_history (order_id, status) values (new.id, new.status);

    if new.discount_code is not null then
      if new.status = 'cancelled' then
        update discount_codes set used_count = greatest(used_count - 1, 0) where code = new.discount_code;
      elsif old.status = 'cancelled' then
        update discount_codes set used_count = used_count + 1 where code = new.discount_code;
      end if;
    end if;

    if new.user_id is not null then
      if new.status = 'cancelled' and not old.points_reversed then
        -- take back what it earned, give back what was spent on it
        perform add_points(new.user_id, new.id, new.points_redeemed - new.points_earned, 'order_cancelled');
        new.points_reversed := true;
      elsif old.status = 'cancelled' and old.points_reversed then
        perform add_points(new.user_id, new.id, new.points_earned - new.points_redeemed, 'order_reopened');
        new.points_reversed := false;
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_orders_status_insert on orders;
create trigger trg_orders_status_insert
  after insert on orders
  for each row execute function orders_status_changed();

drop trigger if exists trg_orders_status_update on orders;
create trigger trg_orders_status_update
  before update of status on orders
  for each row execute function orders_status_changed();

-- ---------------------------------------------------------------------
-- 4) place_order(): same as before + points (p_points_redeem) and a
--    discount code (p_discount_code)
-- ---------------------------------------------------------------------
drop function if exists place_order(text, text, text, text, text, text, text, uuid, jsonb, text, text, text, text);
drop function if exists place_order(text, text, text, text, text, text, text, uuid, jsonb, text, text, text, text, int);

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
    v_earned := points_for_amount(v_subtotal - v_code_discount - v_discount);
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
-- 5) Item refund / exchange (admin)
-- ---------------------------------------------------------------------
create or replace function refund_order_item(p_item_id uuid, p_quantity int, p_note text default null)
returns table(money_diff numeric, points_delta int, order_total numeric)
language plpgsql
security definer
as $$
declare
  v_item order_items%rowtype;
  v_order orders%rowtype;
  v_old_total numeric;
  v_points int;
begin
  select * into v_item from order_items where id = p_item_id for update;
  if not found then
    raise exception 'Order item not found';
  end if;
  select * into v_order from orders where id = v_item.order_id for update;
  if v_order.status = 'cancelled' then
    raise exception 'This order is cancelled';
  end if;
  if p_quantity is null or p_quantity < 1 or p_quantity > v_item.quantity then
    raise exception 'Choose between 1 and % pieces', v_item.quantity;
  end if;

  v_old_total := v_order.total;

  -- Back on the shelf only if this order had actually taken the stock.
  if v_order.status in ('confirmed', 'shipped', 'delivered') and v_item.product_id is not null then
    perform adjust_stock(v_item.product_id, v_item.size, v_item.color, p_quantity);
  end if;

  if p_quantity = v_item.quantity then
    delete from order_items where id = p_item_id;
  else
    update order_items set quantity = quantity - p_quantity where id = p_item_id;
  end if;

  v_points := reprice_order(v_order.id, 'item_refunded');
  select * into v_order from orders where id = v_order.id;

  insert into order_returns (order_id, kind, product_name, size, color, quantity, money_diff, points_delta, note)
  values (v_order.id, 'refund', v_item.product_name, v_item.size, v_item.color, p_quantity,
          v_order.total - v_old_total, v_points, p_note);

  return query select v_order.total - v_old_total, v_points, v_order.total;
end;
$$;

create or replace function exchange_order_item(
  p_item_id uuid,
  p_quantity int,
  p_new_product_id uuid,
  p_new_size text default null,
  p_new_color text default null,
  p_note text default null
) returns table(money_diff numeric, points_delta int, order_total numeric)
language plpgsql
security definer
as $$
declare
  v_item order_items%rowtype;
  v_order orders%rowtype;
  v_new products%rowtype;
  v_old_total numeric;
  v_points int;
  v_key text;
  v_have int;
  v_size text := nullif(p_new_size, '');
  v_color text := nullif(p_new_color, '');
begin
  select * into v_item from order_items where id = p_item_id for update;
  if not found then
    raise exception 'Order item not found';
  end if;
  select * into v_order from orders where id = v_item.order_id for update;
  if v_order.status = 'cancelled' then
    raise exception 'This order is cancelled';
  end if;
  if p_quantity is null or p_quantity < 1 or p_quantity > v_item.quantity then
    raise exception 'Choose between 1 and % pieces', v_item.quantity;
  end if;

  select * into v_new from products where id = p_new_product_id for update;
  if not found or not v_new.is_active then
    raise exception 'That product is not available';
  end if;
  if coalesce(array_length(v_new.sizes, 1), 0) > 0 and (v_size is null or not (v_size = any (v_new.sizes))) then
    raise exception 'Please choose a size for %', v_new.slug;
  end if;
  if coalesce(array_length(v_new.colors, 1), 0) > 0 and (v_color is null or not (v_color = any (v_new.colors))) then
    raise exception 'Please choose a color for %', v_new.slug;
  end if;
  if v_size is not null and v_new.sold_out_sizes @> array[v_size] then
    raise exception 'Size % is sold out for %', v_size, v_new.slug;
  end if;
  if v_color is not null and v_new.sold_out_colors @> array[v_color] then
    raise exception 'Color % is sold out for %', v_color, v_new.slug;
  end if;

  v_old_total := v_order.total;

  if v_order.status in ('confirmed', 'shipped', 'delivered') then
    -- old piece back on the shelf, new piece off it
    if v_item.product_id is not null then
      perform adjust_stock(v_item.product_id, v_item.size, v_item.color, p_quantity);
    end if;
    perform adjust_stock(v_new.id, v_size, v_color, -p_quantity);
  else
    -- pending: nothing taken yet, but the new piece must exist
    if v_new.variant_stock <> '{}'::jsonb then
      v_key := coalesce(v_color, '') || '__' || coalesce(v_size, '');
      v_have := coalesce((v_new.variant_stock ->> v_key)::int, 0);
    else
      v_have := v_new.stock;
    end if;
    if v_have < p_quantity then
      raise exception 'Not enough stock for %: only % left', v_new.slug, v_have;
    end if;
  end if;

  if p_quantity = v_item.quantity then
    delete from order_items where id = p_item_id;
  else
    update order_items set quantity = quantity - p_quantity where id = p_item_id;
  end if;

  insert into order_items (order_id, product_id, product_name, size, color, quantity, unit_price)
  values (v_order.id, v_new.id, v_new.name, v_size, v_color, p_quantity,
          round(v_new.price * (1 - v_new.discount_percent / 100), 2));

  v_points := reprice_order(v_order.id, 'item_exchanged');
  select * into v_order from orders where id = v_order.id;

  insert into order_returns (order_id, kind, product_name, size, color, quantity,
                             new_product_name, new_size, new_color, money_diff, points_delta, note)
  values (v_order.id, 'exchange', v_item.product_name, v_item.size, v_item.color, p_quantity,
          v_new.name, v_size, v_color, v_order.total - v_old_total, v_points, p_note);

  return query select v_order.total - v_old_total, v_points, v_order.total;
end;
$$;

revoke execute on function code_discount_amount(text, numeric, numeric) from public, anon, authenticated;
grant execute on function code_discount_amount(text, numeric, numeric) to service_role;
revoke execute on function points_for_amount(numeric) from public, anon, authenticated;
revoke execute on function add_points(uuid, uuid, int, text) from public, anon, authenticated;
revoke execute on function adjust_stock(uuid, text, text, int) from public, anon, authenticated;
revoke execute on function reprice_order(uuid, text) from public, anon, authenticated;
revoke execute on function refund_order_item(uuid, int, text) from public, anon, authenticated;
revoke execute on function exchange_order_item(uuid, int, uuid, text, text, text) from public, anon, authenticated;
grant execute on function points_for_amount(numeric) to service_role;
grant execute on function add_points(uuid, uuid, int, text) to service_role;
grant execute on function adjust_stock(uuid, text, text, int) to service_role;
grant execute on function reprice_order(uuid, text) to service_role;
grant execute on function refund_order_item(uuid, int, text) to service_role;
grant execute on function exchange_order_item(uuid, int, uuid, text, text, text) to service_role;

NOTIFY pgrst, 'reload schema';
