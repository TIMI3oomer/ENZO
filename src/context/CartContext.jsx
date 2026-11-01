import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { getDiscountedPrice } from "../lib/formatPrice.js";
import { getAvailableStock } from "../lib/variantStock.js";

const CartContext = createContext(null);
const STORAGE_KEY = "enzo_cart_v1";

// CHECKPOINT NOTE (CartContext.jsx):
// Cart is stored client-side (localStorage) keyed by product id + size +
// color, and is completely independent of the language context —
// switching between Arabic and English never clears or resets it. Each
// cart line stores the bilingual product name snapshot so the cart can
// render correctly in whichever language is active without re-fetching
// the product.
export function CartProvider({ children }) {
  const [items, setItems] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  const addItem = (product, size, color, quantity = 1) => {
    setItems((prev) => {
      const key = `${product.id}__${size ?? "onesize"}__${color ?? "nocolor"}`;
      const existing = prev.find((i) => i.key === key);
      if (existing) {
        return prev.map((i) =>
          i.key === key ? { ...i, quantity: i.quantity + quantity } : i
        );
      }
      return [
        ...prev,
        {
          key,
          productId: product.id,
          slug: product.slug,
          name: product.name, // { ar, en }
          price: getDiscountedPrice(product.price, product.discount_percent), // sale price, if on sale
          image: product.images?.[0] ?? null,
          size,
          color,
          quantity,
          // The specific size+color combo's limit when tracked, else the
          // product's aggregate -- snapshot, refreshed live on the Cart
          // page (see Cart.jsx).
          stock: getAvailableStock(product, size, color),
        },
      ];
    });
  };

  const removeItem = (key) =>
    setItems((prev) => prev.filter((i) => i.key !== key));

  // BUG FIX: previously only clamped the LOWER bound (never below 1),
  // with nothing stopping someone from clicking "+" past what's actually
  // in stock -- the mistake would only surface later at checkout. Now
  // also clamps to the item's known stock, when we have it.
  const updateQuantity = (key, quantity) =>
    setItems((prev) =>
      prev.map((i) =>
        i.key === key
          ? { ...i, quantity: Math.max(1, Math.min(quantity, i.stock ?? Infinity)) }
          : i
      )
    );

  // Used by Cart.jsx to refresh stale price/stock/name snapshots and
  // drop items that are no longer available, without needing to touch
  // any of the other cart logic above.
  const syncItem = (key, updates) =>
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...updates } : i)));

  const clearCart = () => setItems([]);

  const subtotal = useMemo(
    () => items.reduce((sum, i) => sum + i.price * i.quantity, 0),
    [items]
  );

  const count = useMemo(
    () => items.reduce((sum, i) => sum + i.quantity, 0),
    [items]
  );

  const value = { items, addItem, removeItem, updateQuantity, syncItem, clearCart, subtotal, count };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside CartProvider");
  return ctx;
}
