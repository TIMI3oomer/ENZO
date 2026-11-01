// CHECKPOINT NOTE (src/lib/formatPrice.js):
// Small helper so every price display looks the same way -- "150 ₪" --
// instead of some places showing a bare number and others adding a
// symbol inconsistently (this was the actual bug: no price anywhere in
// the app showed a currency symbol at all before this).
export function formatPrice(amount, currencySymbol = "₪") {
  const n = Number(amount) || 0;
  return `${n.toLocaleString()} ${currencySymbol}`;
}

// Sale price is always computed from price + discount_percent, never
// stored separately (see supabase/migration_v13.sql) -- this is the one
// place that math happens, so every screen that shows a discounted price
// agrees with every other.
export function getDiscountedPrice(price, discountPercent) {
  const pct = Number(discountPercent) || 0;
  if (pct <= 0) return Number(price) || 0;
  return (Number(price) || 0) * (1 - pct / 100);
}
