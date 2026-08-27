import { createContext, useContext, useEffect, useMemo, useState } from "react";

const CartContext = createContext(null);
const STORAGE_KEY = "enzo_cart_v1";

// CHECKPOINT NOTE (CartContext.jsx):
// Cart is stored client-side (localStorage) keyed by product id + size, and
// is completely independent of the language context — switching between
// Arabic and English never clears or resets it. Each cart line stores the
// bilingual product name snapshot so the cart can render correctly in
// whichever language is active without re-fetching the product.
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

  const addItem = (product, size, quantity = 1) => {
    setItems((prev) => {
      const key = `${product.id}__${size ?? "onesize"}`;
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
          price: product.price,
          image: product.images?.[0] ?? null,
          size,
          quantity,
        },
      ];
    });
  };

  const removeItem = (key) =>
    setItems((prev) => prev.filter((i) => i.key !== key));

  const updateQuantity = (key, quantity) =>
    setItems((prev) =>
      prev.map((i) => (i.key === key ? { ...i, quantity: Math.max(1, quantity) } : i))
    );

  const clearCart = () => setItems([]);

  const subtotal = useMemo(
    () => items.reduce((sum, i) => sum + i.price * i.quantity, 0),
    [items]
  );

  const count = useMemo(
    () => items.reduce((sum, i) => sum + i.quantity, 0),
    [items]
  );

  const value = { items, addItem, removeItem, updateQuantity, clearCart, subtotal, count };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside CartProvider");
  return ctx;
}
