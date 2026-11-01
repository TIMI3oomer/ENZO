-- =====================================================================
-- ENZO STORE — MIGRATION 13
-- File: /supabase/migration_v13.sql
-- Run this on an EXISTING database that already has schema.sql (or
-- migration_v6 through v12) applied. Safe to run more than once.
--
-- Adds:
-- - sold_out_sizes / sold_out_colors (text[]): which of a product's
--   sizes/colors are currently unavailable, independent of the other
--   dimension (e.g. "M is sold out in every color" or "Black is sold
--   out in every size") -- not a full per-combination stock grid, which
--   this store has never tracked and doesn't need for its catalog size.
--   The storefront disables and red-marks these as "Sold out" and won't
--   let a customer add that size/color to their cart.
-- - discount_percent (numeric, 0-100): optional discount, 0 = not on
--   sale. The sale price is computed as price * (1 - discount_percent/100)
--   wherever it's displayed -- no separate "sale_price" column to keep
--   in sync.
-- =====================================================================

alter table products add column if not exists sold_out_sizes text[] not null default '{}';
alter table products add column if not exists sold_out_colors text[] not null default '{}';
alter table products add column if not exists discount_percent numeric(5,2) not null default 0
  check (discount_percent >= 0 and discount_percent <= 100);

create index if not exists idx_products_discount on products(discount_percent) where discount_percent > 0;

NOTIFY pgrst, 'reload schema';
