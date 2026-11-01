-- =====================================================================
-- ENZO STORE — RESET (DESTRUCTIVE)
-- File: /supabase/00_reset.sql
--
-- WARNING: this deletes every ENZO table and all data in them —
-- products, orders, customers, everything. It does NOT touch Supabase
-- Auth's own user accounts (auth.users) — those live outside this
-- schema and are untouched, so your admin/customer logins still exist
-- after this runs (you'll just need to re-insert your admin into
-- admin_users afterward, since that table gets dropped).
--
-- Run this ONCE, then run schema.sql. Do not run this on a store that
-- has real customer orders you want to keep.
-- =====================================================================

drop trigger if exists on_auth_user_created on auth.users;

drop table if exists order_items cascade;
drop table if exists orders cascade;
drop table if exists products cascade;
drop table if exists categories cascade;
drop table if exists admin_users cascade;
drop table if exists profiles cascade;
drop table if exists store_settings cascade;
drop table if exists content_items cascade;
drop table if exists content_collections cascade;

drop function if exists place_order(text, text, text, text, text, text, text, uuid, jsonb, text);
drop function if exists place_order(text, text, text, text, text, text, text, uuid, jsonb);
drop function if exists is_admin();
drop function if exists handle_new_user();
