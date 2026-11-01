// Per-size/color stock (e.g. a grey shirt might have 10 in S while the
// same shirt in blue only has 5 in S). Stored as product.variant_stock,
// a jsonb map keyed "<color>__<size>" -> quantity (see
// supabase/migration_v15.sql and admin/ProductForm.jsx's stock grid).
//
// FALLBACK: a product saved before this feature existed (or one with no
// colors/sizes, or a combo the admin hasn't entered a number for yet) has
// no entry for that key -- those fall back to the product's plain
// aggregate `stock` field, exactly like before this feature existed, so
// nothing regresses for products that haven't been given per-combo
// numbers. This same fallback rule is mirrored server-side in
// place_order() (schema.sql) and the Stripe session route
// (server/src/routes/orders.js) -- keep all three in sync.
export function variantKey(color, size) {
  return `${color}__${size}`;
}

export function getAvailableStock(product, size, color) {
  if (!product) return 0;
  if (size && color && product.variant_stock) {
    const key = variantKey(color, size);
    if (Object.prototype.hasOwnProperty.call(product.variant_stock, key)) {
      return Number(product.variant_stock[key]) || 0;
    }
  }
  return Number(product.stock) || 0;
}
