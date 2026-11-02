-- =====================================================================
-- ENZO STORE — MIGRATION 17: SELLER ON IN-STORE SALES
-- File: /supabase/migration_v17.sql
-- Run this ONCE in the Supabase SQL editor after migration_v16 (a
-- brand-new database gets it from schema.sql). Safe to run more than once.
--
-- orders.seller: who rang up an in-store sale (عبدالله / عمير / any other
-- name typed in). Shown in Admin -> Orders, on the printed invoice and in
-- the "today per seller" summary on the In-store sale page. Empty for
-- online orders.
-- =====================================================================

alter table orders add column if not exists seller text check (seller is null or length(seller) between 1 and 60);
create index if not exists idx_orders_in_store_seller on orders(created_at, seller) where channel = 'in_store';

NOTIFY pgrst, 'reload schema';
