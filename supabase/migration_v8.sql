-- =====================================================================
-- ENZO STORE — MIGRATION 8
-- File: /supabase/migration_v8.sql
-- Run this AFTER migration_v7.sql.
--
-- Adds an optional color -> image mapping on products, e.g.
-- { "Black": "https://.../black.jpg", "Gold": "https://.../gold.jpg" }
-- so the storefront can show the right photo when a shopper picks a
-- color, instead of always showing the same default photo regardless of
-- which color is selected.
-- =====================================================================

alter table products add column if not exists color_images jsonb not null default '{}';
