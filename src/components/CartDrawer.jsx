import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { X, Minus, Plus, Trash2 } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useCart } from "../context/CartContext.jsx";
import { useLocalizedField } from "../context/LanguageContext.jsx";

// CHECKPOINT NOTE (CartDrawer.jsx):
// Slides in from the "end" edge (inset-inline-end), which is the right side
// in LTR and the LEFT side in RTL automatically — this is the kind of thing
// that breaks silently if you hardcode `right-0`. framer-motion (external
// animation library) drives the slide + fade.
export default function CartDrawer({ open, onClose }) {
  const { t } = useTranslation("common");
  const { items, removeItem, updateQuantity, subtotal } = useCart();
  const localize = useLocalizedField();

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-50 bg-black/60"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            className="fixed inset-block-0 inset-inline-end-0 z-50 flex h-full w-full max-w-sm flex-col bg-enzo-panel"
            style={{ insetBlock: 0, insetInlineEnd: 0 }}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "tween", duration: 0.25 }}
          >
            <div className="flex items-center justify-between border-b hairline px-5 py-4">
              <h2 className="font-display text-lg">{t("cart.title")}</h2>
              <button onClick={onClose} aria-label="close">
                <X size={22} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              {items.length === 0 ? (
                <p className="mt-10 text-center text-enzo-muted">{t("cart.empty")}</p>
              ) : (
                <ul className="flex flex-col gap-4">
                  {items.map((item) => (
                    <li key={item.key} className="flex gap-3 border-b hairline pb-4">
                      <div className="h-20 w-16 flex-none overflow-hidden rounded bg-enzo-black">
                        {item.image && (
                          <img src={item.image} alt="" className="h-full w-full object-cover" />
                        )}
                      </div>
                      <div className="flex flex-1 flex-col gap-1">
                        <p className="text-sm font-medium">{localize(item.name)}</p>
                        {item.size && <p className="text-xs text-enzo-muted">{item.size}</p>}
                        <div className="mt-1 flex items-center gap-3">
                          <button onClick={() => updateQuantity(item.key, item.quantity - 1)}>
                            <Minus size={14} />
                          </button>
                          <span className="text-sm">{item.quantity}</span>
                          <button onClick={() => updateQuantity(item.key, item.quantity + 1)}>
                            <Plus size={14} />
                          </button>
                          <button
                            onClick={() => removeItem(item.key)}
                            className="ms-auto text-enzo-muted hover:text-enzo-error"
                            aria-label={t("cart.remove")}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                      <p className="font-medium">{item.price * item.quantity}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {items.length > 0 && (
              <div className="border-t hairline px-5 py-4">
                <div className="mb-4 flex justify-between text-sm">
                  <span className="text-enzo-muted">{t("cart.subtotal")}</span>
                  <span className="font-semibold">{subtotal}</span>
                </div>
                <Link
                  to="/checkout"
                  onClick={onClose}
                  className="block w-full rounded-md bg-enzo-gradient py-3 text-center font-semibold text-enzo-black"
                >
                  {t("cart.checkout")}
                </Link>
              </div>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
