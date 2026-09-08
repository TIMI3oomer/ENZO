import { useParams, useLocation, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useLocalizedField } from "../context/LanguageContext.jsx";
import { formatPrice } from "../lib/formatPrice.js";

// CHECKPOINT NOTE (OrderConfirmation.jsx):
// Items/total are read from router state, passed by Checkout.jsx right
// before it clears the cart (see the "confirmedItems" comment there) --
// this is what lets the customer see exactly what they ordered, in what
// size, and how many, immediately after checkout. If someone refreshes
// this page directly, that state is gone (browser navigation state
// doesn't survive a refresh), so it falls back to just the order number +
// status and a note pointing them to their email or /account instead of
// showing broken/empty item rows.
export default function OrderConfirmation() {
  const { orderNumber } = useParams();
  const location = useLocation();
  const { t } = useTranslation("checkout");
  const localize = useLocalizedField();

  const items = location.state?.items;
  const total = location.state?.total;

  return (
    <div className="mx-auto max-w-lg px-4 py-20 text-center">
      <h1 className="font-display text-2xl">{t("confirmation.success")}</h1>
      <p className="mt-6 text-enzo-muted">{t("confirmation.orderNumber")}</p>
      <p className="text-2xl font-semibold">#{orderNumber}</p>
      <p className="mt-4 text-enzo-muted">{t("confirmation.status")}</p>
      <p className="font-medium">{t("confirmation.pending")}</p>

      {items ? (
        <div className="mt-10 rounded-lg border hairline p-5 text-start">
          <ul className="flex flex-col gap-3 border-b hairline pb-4">
            {items.map((item, i) => (
              <li key={i} className="flex justify-between text-sm">
                <span>
                  {localize(item.name)} × {item.quantity}
                  {[item.color, item.size].filter(Boolean).map((v) => ` (${v})`).join("")}
                </span>
                <span>{formatPrice(item.price * item.quantity)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex justify-between font-semibold">
            <span>{t("subtotal")}</span>
            <span>{formatPrice(total)}</span>
          </div>
          <p className="mt-2 text-xs text-enzo-muted">{t("confirmation.deliveryNote")}</p>
        </div>
      ) : (
        <p className="mt-10 text-sm text-enzo-muted">
          {t("confirmation.detailsSentSeparately")}
        </p>
      )}

      <Link to="/" className="mt-10 inline-block rounded-md bg-enzo-gradient px-6 py-3 font-semibold text-enzo-black">
        {t("confirmation.backHome")}
      </Link>
    </div>
  );
}
