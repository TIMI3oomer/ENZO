import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Minus, Plus, Trash2, AlertTriangle } from "lucide-react";
import { useCart } from "../context/CartContext.jsx";
import { useLocalizedField } from "../context/LanguageContext.jsx";
import { formatPrice, getDiscountedPrice } from "../lib/formatPrice.js";
import { getAvailableStock } from "../lib/variantStock.js";
import { api } from "../lib/api.js";

// CHECKPOINT NOTE (Cart.jsx):
// Full-page cart (in addition to the CartDrawer) for people who land on
// /cart directly. Shares the same CartContext, so both stay in sync.
//
// BUG FIX -- STALE CART DATA: cart items store a price/stock SNAPSHOT
// from whenever they were added, which goes stale if the admin changes a
// price or the product sells out later. On mount, this page fetches the
// CURRENT state of every product still in the cart (GET /api/products?ids=)
// and reconciles: prices are updated to match reality, quantities are
// clamped down if stock dropped, and anything now inactive/deleted is
// removed entirely -- with a visible notice explaining what changed,
// rather than silently surprising the customer at checkout.
export default function Cart() {
  const { t } = useTranslation("common");
  const { items, removeItem, updateQuantity, syncItem, subtotal } = useCart();
  const localize = useLocalizedField();
  const [notice, setNotice] = useState(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (items.length === 0 || checked) return;

    const ids = items.map((i) => i.productId).join(",");
    api
      .get(`/products?ids=${ids}`)
      .then((liveProducts) => {
        const changes = [];

        for (const item of items) {
          const live = liveProducts.find((p) => p.id === item.productId);

          if (!live) {
            removeItem(item.key);
            changes.push(t("cart.itemRemoved", { name: localize(item.name) }));
            continue;
          }

          const sizeSoldOut = item.size && live.sold_out_sizes?.includes(item.size);
          const colorSoldOut = item.color && live.sold_out_colors?.includes(item.color);
          if (sizeSoldOut || colorSoldOut) {
            removeItem(item.key);
            changes.push(t("cart.itemRemoved", { name: localize(item.name) }));
            continue;
          }

          const livePrice = getDiscountedPrice(live.price, live.discount_percent);
          // The specific size+color combo's stock when tracked, else the
          // aggregate -- same rule addItem() used when this line was
          // first added (see CartContext.jsx), so this isn't comparing a
          // per-combo snapshot against an unrelated store-wide total.
          const liveStock = getAvailableStock(live, item.size, item.color);
          const updates = {};
          if (livePrice !== item.price) updates.price = livePrice;
          if (liveStock !== item.stock) updates.stock = liveStock;

          if (liveStock < item.quantity) {
            updateQuantity(item.key, Math.max(1, liveStock));
            if (liveStock === 0) {
              removeItem(item.key);
              changes.push(t("cart.itemRemoved", { name: localize(item.name) }));
              continue;
            }
            changes.push(t("cart.quantityReduced", { name: localize(item.name), stock: liveStock }));
          }

          if (Object.keys(updates).length > 0) syncItem(item.key, updates);
        }

        if (changes.length > 0) setNotice(changes.join(" "));
      })
      .catch(() => {}) // if this fails, just leave the cart as-is -- checkout still re-validates everything server-side regardless
      .finally(() => setChecked(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checked]);

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <p className="mb-6 text-enzo-muted">{t("cart.empty")}</p>
        <Link to="/shop" className="rounded-md bg-enzo-gradient px-6 py-3 font-semibold text-enzo-black">
          {t("cart.continueShopping")}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <h1 className="mb-8 font-display text-3xl">{t("cart.title")}</h1>

      {notice && (
        <div className="mb-6 flex items-start gap-2 rounded-lg border border-enzo-goldBright/40 bg-enzo-gold/10 p-4 text-sm">
          <AlertTriangle size={18} className="mt-0.5 flex-none text-enzo-goldBright" />
          <p>{notice}</p>
        </div>
      )}

      <ul className="flex flex-col gap-4">
        {items.map((item) => (
          <li key={item.key} className="flex items-center gap-4 border-b hairline pb-4">
            <div className="h-24 w-20 flex-none overflow-hidden rounded bg-enzo-panel">
              {item.image && <img src={item.image} alt="" className="h-full w-full object-cover" />}
            </div>
            <div className="flex-1 text-start">
              <p className="font-medium">{localize(item.name)}</p>
              {(item.size || item.color) && (
                <p className="text-sm text-enzo-muted">{[item.color, item.size].filter(Boolean).join(" / ")}</p>
              )}
              <div className="mt-2 flex items-center gap-3">
                <button onClick={() => updateQuantity(item.key, item.quantity - 1)}>
                  <Minus size={16} />
                </button>
                <span>{item.quantity}</span>
                <button
                  onClick={() => updateQuantity(item.key, item.quantity + 1)}
                  disabled={item.stock != null && item.quantity >= item.stock}
                  className="disabled:opacity-30"
                >
                  <Plus size={16} />
                </button>
              </div>
            </div>
            <p className="font-medium">{formatPrice(item.price * item.quantity)}</p>
            <button onClick={() => removeItem(item.key)} className="text-enzo-muted hover:text-enzo-error">
              <Trash2 size={18} />
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-8 flex flex-col gap-2 border-t hairline pt-6">
        <div className="flex items-center justify-between text-lg font-semibold">
          <span>{t("cart.subtotal")}</span>
          <span>{formatPrice(subtotal)}</span>
        </div>
        <p className="text-xs text-enzo-muted">{t("cart.deliveryNote")}</p>
      </div>

      <Link
        to="/checkout"
        className="mt-6 block w-full rounded-md bg-enzo-gradient py-3 text-center font-semibold text-enzo-black"
      >
        {t("cart.checkout")}
      </Link>
    </div>
  );
}
