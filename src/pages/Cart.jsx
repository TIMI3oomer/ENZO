import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Minus, Plus, Trash2 } from "lucide-react";
import { useCart } from "../context/CartContext.jsx";
import { useLocalizedField } from "../context/LanguageContext.jsx";

// CHECKPOINT NOTE (Cart.jsx):
// Full-page cart (in addition to the CartDrawer) for people who land on
// /cart directly (e.g. from a saved link). Shares the same CartContext,
// so both stay in sync automatically.
export default function Cart() {
  const { t } = useTranslation("common");
  const { items, removeItem, updateQuantity, subtotal } = useCart();
  const localize = useLocalizedField();

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
      <ul className="flex flex-col gap-4">
        {items.map((item) => (
          <li key={item.key} className="flex items-center gap-4 border-b hairline pb-4">
            <div className="h-24 w-20 flex-none overflow-hidden rounded bg-enzo-panel">
              {item.image && <img src={item.image} alt="" className="h-full w-full object-cover" />}
            </div>
            <div className="flex-1 text-start">
              <p className="font-medium">{localize(item.name)}</p>
              {item.size && <p className="text-sm text-enzo-muted">{item.size}</p>}
              <div className="mt-2 flex items-center gap-3">
                <button onClick={() => updateQuantity(item.key, item.quantity - 1)}>
                  <Minus size={16} />
                </button>
                <span>{item.quantity}</span>
                <button onClick={() => updateQuantity(item.key, item.quantity + 1)}>
                  <Plus size={16} />
                </button>
              </div>
            </div>
            <p className="font-medium">{item.price * item.quantity}</p>
            <button onClick={() => removeItem(item.key)} className="text-enzo-muted hover:text-enzo-error">
              <Trash2 size={18} />
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-8 flex items-center justify-between border-t hairline pt-6">
        <span className="text-enzo-muted">{t("cart.subtotal")}</span>
        <span className="text-xl font-semibold">{subtotal}</span>
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
