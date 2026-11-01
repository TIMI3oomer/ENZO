// Stock helpers shared by the product page, cart and admin.
//
// A product WITH sizes keeps its stock per size in product.size_stock
// (e.g. { S: 2, M: 3, L: 5 }) and product.stock is just their total.
// A product WITHOUT sizes (a cap, a bag...) only has product.stock.

export function hasSizes(product) {
  return (product?.sizes?.length ?? 0) > 0;
}

// How many pieces of this product are available in this size.
export function stockFor(product, size) {
  if (!product) return 0;
  if (!hasSizes(product)) return Number(product.stock) || 0;
  return Number(product.size_stock?.[size]) || 0;
}

// First size that still has stock (used to pre-select a size that can
// actually be bought), or the first size if everything is sold out.
export function firstAvailableSize(product) {
  if (!hasSizes(product)) return null;
  return product.sizes.find((s) => stockFor(product, s) > 0) ?? product.sizes[0];
}
