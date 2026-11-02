import { isProductSoldOut } from "./variantStock.js";

// Which product the guided tour (components/WelcomeTour.jsx) zooms into.
//
// `focus` comes from the CMS (Site content -> Guided tour, site.tour.focus):
// - "new":      always the newest product.
// - "discount": always the most recently discounted product (falls back
//               to the newest product if nothing is on sale).
// - "auto" (default): whichever happened LAST -- a product being added, or
//               a discount being put on one (products.discount_updated_at,
//               migration_v18.sql; until that migration is run, a sale
//               product's created_at stands in for it).
// Sold-out products are skipped while anything else is available.
const time = (v) => (v ? new Date(v).getTime() : 0);
const latest = (list, when) => list.reduce((best, p) => (!best || when(p) > when(best) ? p : best), null);

export function pickFeatured(products = [], focus = "auto") {
  const available = products.filter((p) => !isProductSoldOut(p));
  const pool = available.length ? available : products;
  if (!pool.length) return null;

  const newest = latest(pool, (p) => time(p.created_at));
  const discountTime = (p) => time(p.discount_updated_at || p.created_at);
  const lastDiscounted = latest(
    pool.filter((p) => Number(p.discount_percent) > 0),
    discountTime
  );

  const asNew = { product: newest, kind: "new" };
  const asSale = lastDiscounted && { product: lastDiscounted, kind: "sale" };

  if (focus === "new") return asNew;
  if (focus === "discount") return asSale || asNew;
  if (!asSale) return asNew;
  return discountTime(lastDiscounted) >= time(newest.created_at) ? asSale : asNew;
}
