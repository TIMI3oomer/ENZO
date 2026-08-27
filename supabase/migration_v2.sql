-- =====================================================================
-- ENZO STORE — MIGRATION 2
-- File: /supabase/migration_v2.sql
-- Run this AFTER schema.sql, once, in the Supabase SQL editor.
-- Adds: Pants + Training categories, and customer accounts on orders.
-- =====================================================================

-- ---------- New categories (requirement: pants + trainings tabs) ----------
insert into categories (slug, name) values
  ('pants', '{"ar":"بناطيل","en":"Pants"}'),
  ('training', '{"ar":"ترينج","en":"Trainings"}')
on conflict (slug) do nothing;

-- ---------- Link orders to a logged-in customer (optional — guest checkout still works) ----------
alter table orders add column if not exists user_id uuid references auth.users(id) on delete set null;
create index if not exists idx_orders_user on orders(user_id);

-- Replace the old "anyone can create orders" policy with one that also
-- makes sure a logged-in customer can only attach their OWN user_id to an
-- order they create (can't place an order pretending to be someone else).
drop policy if exists "anyone can create orders" on orders;
create policy "create own or guest orders" on orders
  for insert
  with check (user_id is null or user_id = auth.uid());

-- A logged-in customer can see their own past orders (previously only
-- admins could read orders at all).
create policy "customer read own orders" on orders
  for select using (user_id = auth.uid());

-- Same for order_items: a customer can read the line items that belong to
-- one of their own orders.
create policy "customer read own order items" on order_items
  for select using (
    order_id in (select id from orders where user_id = auth.uid())
  );
