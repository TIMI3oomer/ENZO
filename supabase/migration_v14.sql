-- =====================================================================
-- ENZO STORE — MIGRATION 14: STOCK PER SIZE
-- File: /supabase/migration_v14.sql
-- Run this ONCE in the Supabase SQL editor on an EXISTING database
-- (a brand-new database gets all of this from schema.sql). Safe to run
-- more than once.
--
-- WHAT CHANGES
-- 1) products.size_stock (jsonb) -- stock per size, e.g. {"S":2,"M":3,"L":5}.
-- 2) products.stock stays, but for any product that has sizes it is now
--    the automatic TOTAL of its sizes (2+3+5 = 10), kept in sync by a
--    trigger. Products WITHOUT sizes (a cap, a bag...) keep using the
--    single stock number exactly as before.
-- 3) place_order() now checks and decrements the SIZE the customer picked.
--    It also adds up identical lines first, so two cart lines of the same
--    shirt+size (e.g. two colours) can't together exceed what is left.
-- 4) set_order_status(): changing an order to "cancelled" now puts its
--    items back in stock (per size); moving it out of "cancelled" takes
--    them out again, and refuses if they are no longer available.
--
-- EXISTING PRODUCTS: their current stock is split EVENLY across their
-- sizes (stock 10 over S/M/L -> 4/3/3; the total stays 10). Open each
-- product in the admin and set the real number per size.
-- =====================================================================

alter table products add column if not exists size_stock jsonb not null default '{}'::jsonb;

alter table products drop constraint if exists products_size_stock_is_object;
alter table products add constraint products_size_stock_is_object check (jsonb_typeof(size_stock) = 'object');

-- ---------------------------------------------------------------------
-- Keep products.stock = sum of the sizes' stock (only for products that
-- have sizes), and drop stock entries for sizes the product no longer has.
-- ---------------------------------------------------------------------
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

-- One-time backfill: split existing stock evenly across the sizes.
update products p
set size_stock = (
  select jsonb_object_agg(
    u.size,
    (p.stock / array_length(p.sizes, 1)) + case when u.ord <= (p.stock % array_length(p.sizes, 1)) then 1 else 0 end
  )
  from unnest(p.sizes) with ordinality as u(size, ord)
)
where coalesce(array_length(p.sizes, 1), 0) > 0
  and p.size_stock = '{}'::jsonb;

-- ---------------------------------------------------------------------
-- place_order(): same signature as before, now stock-per-size aware.
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

-- ---------------------------------------------------------------------
-- set_order_status(): the ONLY place an order's status changes, so stock
-- can't drift. Cancelling returns the items to stock; un-cancelling takes
-- them again (and refuses with a clear message if they're gone).
-- ---------------------------------------------------------------------
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
