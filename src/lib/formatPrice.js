// CHECKPOINT NOTE (src/lib/formatPrice.js):
// Small helper so every price display looks the same way -- "150 ₪" --
// instead of some places showing a bare number and others adding a
// symbol inconsistently (this was the actual bug: no price anywhere in
// the app showed a currency symbol at all before this).
export function formatPrice(amount, currencySymbol = "₪") {
  const n = Number(amount) || 0;
  return `${n.toLocaleString()} ${currencySymbol}`;
}
