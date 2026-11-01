// Per-size/color stock (e.g. a grey shirt might have 10 in S while the
// same shirt in blue only has 5 in S). Stored as product.variant_stock,
// a jsonb map keyed "<color>__<size>" -> quantity (see
// supabase/schema.sql's products table and admin/ProductForm.jsx's stock
// grid).
//
// TWO STATES, not a per-key fallback:
// - variant_stock is EMPTY ({}) -- this product has never used the grid
//   (every product saved before this feature existed, or one with only
//   sizes, only colors, or neither). Availability is just the plain
//   aggregate `stock` column, exactly like before this feature existed.
// - variant_stock has ANY entry -- this product IS using the grid. Every
//   combo is looked up by key; a combo with no key is 0, not a silent
//   fallback to the aggregate. This matches the DB's sync_product_stock
//   trigger (schema.sql), which only recomputes `stock` from the grid
//   once the grid is non-empty -- so there's exactly one unambiguous rule
//   on both the client and the server, never a mix of the two.
export function variantKey(color, size) {
  return `${color}__${size}`;
}

export function usesVariantStock(product) {
  return Boolean(product?.variant_stock) && Object.keys(product.variant_stock).length > 0;
}

export function getAvailableStock(product, size, color) {
  if (!product) return 0;
  if (usesVariantStock(product)) {
    if (!size || !color) return 0;
    return Number(product.variant_stock[variantKey(color, size)]) || 0;
  }
  return Number(product.stock) || 0;
}
