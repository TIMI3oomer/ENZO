-- =====================================================================
-- ENZO STORE — MIGRATION 18: WHEN WAS A DISCOUNT ADDED
-- File: /supabase/migration_v18.sql
-- Run this ONCE in the Supabase SQL editor after migration_v17 (a
-- brand-new database gets it from schema.sql). Safe to run more than once.
--
-- products.discount_updated_at: set automatically whenever a product's
-- discount_percent changes. The site's guided tour (WelcomeTour.jsx)
-- highlights whichever happened LAST -- a new product being added, or a
-- discount being put on one -- so it needs to know when discounts start.
-- Products already on sale today get their created_at as a starting point.
-- =====================================================================

alter table products add column if not exists discount_updated_at timestamptz;

update products
set discount_updated_at = created_at
where discount_percent > 0 and discount_updated_at is null;

create or replace function touch_discount_updated_at()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if coalesce(new.discount_percent, 0) > 0 then
      new.discount_updated_at := now();
    end if;
  elsif new.discount_percent is distinct from old.discount_percent then
    new.discount_updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_touch_discount_updated_at on products;
create trigger trg_touch_discount_updated_at
  before insert or update of discount_percent on products
  for each row execute function touch_discount_updated_at();

NOTIFY pgrst, 'reload schema';
