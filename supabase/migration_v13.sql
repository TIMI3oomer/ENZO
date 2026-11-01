-- migration_v13.sql
-- Run this ONCE in the Supabase SQL editor on an EXISTING database.
-- (A brand-new database gets the same change from schema.sql.)
--
-- Makes orders.stripe_session_id unique so that a Stripe webhook delivered
-- twice at the same moment can never create two orders for one payment.
--
-- If this fails with "could not create unique index ... duplicate key",
-- you already have two orders for one Stripe session. Find them with:
--
--   select stripe_session_id, count(*)
--   from orders where stripe_session_id is not null
--   group by 1 having count(*) > 1;
--
-- then cancel/merge the extra order(s) and run this again.

create unique index if not exists uq_orders_stripe_session
  on orders(stripe_session_id)
  where stripe_session_id is not null;

-- The old non-unique index is now redundant.
drop index if exists idx_orders_stripe_session;
