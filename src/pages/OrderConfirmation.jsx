import { useParams, useLocation, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useLocalizedField } from "../context/LanguageContext.jsx";
import { formatPrice } from "../lib/formatPrice.js";
import { usePaymentConfig } from "../lib/usePaymentConfig.js";
import { Coins, Truck } from "lucide-react";
import DeliveryEstimate from "../components/DeliveryEstimate.jsx";

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
  const subtotal = location.state?.subtotal;
  const deliveryFee = location.state?.deliveryFee;
  const codeDiscount = location.state?.codeDiscount || 0;
  const pointsDiscount = location.state?.pointsDiscount || 0;
  const pointsEarned = location.state?.pointsEarned || 0;

  // Reflect orders: show where to send the money, right when the customer
  // needs it. (Only available straight after checkout -- a page refresh
  // drops router state, same limitation as the item list below.)
  const payments = usePaymentConfig();
  const showReflect = location.state?.paymentMethod === "reflect" && payments.reflect?.enabled;

  return (
    <div className="mx-auto max-w-lg px-4 py-20 text-center">
      <h1 className="font-display text-2xl">{t("confirmation.success")}</h1>
      <p className="mt-6 text-enzo-muted">{t("confirmation.orderNumber")}</p>
      <p className="text-2xl font-semibold">#{orderNumber}</p>
      <p className="mt-4 text-enzo-muted">{t("confirmation.status")}</p>
      <p className="font-medium">{t("confirmation.pending")}</p>
      <DeliveryEstimate className="mt-4 justify-center" />

      {pointsEarned > 0 && (
        <div className="mt-6 flex items-center justify-center gap-2 rounded-lg border border-enzo-gold/40 bg-enzo-gold/10 px-4 py-3 text-sm text-enzo-goldBright">
          <Coins size={16} />
          {t("confirmation.pointsEarned", { points: pointsEarned, value: formatPrice(pointsEarned / 100) })}
        </div>
      )}

      {showReflect && (
        <div className="mt-8 rounded-lg border hairline p-5 text-start">
          <p className="mb-2 font-medium">{t("reflectTitle")}</p>
          <p className="mb-3 text-sm text-enzo-muted">
            {t("reflectInstructions", { total: formatPrice(total ?? 0), orderNumber })}
          </p>
          <p className="text-sm">
            <span className="text-enzo-muted">{t("reflectPhone")}: </span>
            <span dir="ltr" className="font-semibold">
              {payments.reflect.phone}
            </span>
          </p>
          {payments.reflect.accountName && (
            <p className="text-sm">
              <span className="text-enzo-muted">{t("reflectName")}: </span>
              <span className="font-semibold">{payments.reflect.accountName}</span>
            </p>
          )}
        </div>
      )}

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
          {subtotal != null && (
            <div className="mt-4 flex justify-between text-sm">
              <span className="text-enzo-muted">{t("subtotal")}</span>
              <span>{formatPrice(subtotal)}</span>
            </div>
          )}
          {codeDiscount > 0 && (
            <div className="mt-2 flex justify-between text-sm text-enzo-goldBright">
              <span>{t("codeDiscount")}</span>
              <span>-{formatPrice(codeDiscount)}</span>
            </div>
          )}
          {pointsDiscount > 0 && (
            <div className="mt-2 flex justify-between text-sm text-enzo-goldBright">
              <span>{t("pointsDiscount")}</span>
              <span>-{formatPrice(pointsDiscount)}</span>
            </div>
          )}
          {deliveryFee != null && (
            <div className="mt-2 flex justify-between text-sm">
              <span className="text-enzo-muted">{t("delivery")}</span>
              <span>{formatPrice(deliveryFee)}</span>
            </div>
          )}
          <div className="mt-3 flex justify-between font-semibold">
            <span>{t("total")}</span>
            <span>{formatPrice(total)}</span>
          </div>
        </div>
      ) : (
        <p className="mt-10 text-sm text-enzo-muted">
          {t("confirmation.detailsSentSeparately")}
        </p>
      )}

      <div className="mt-10 flex flex-wrap justify-center gap-3">
        <Link
          to={`/track/${orderNumber}`}
          state={location.state?.phone ? { phone: location.state.phone } : undefined}
          className="flex items-center gap-2 rounded-md bg-enzo-gradient px-6 py-3 font-semibold text-enzo-black"
        >
          <Truck size={18} />
          {t("confirmation.trackOrder")}
        </Link>
        <Link to="/" className="rounded-md border hairline px-6 py-3 font-semibold">
          {t("confirmation.backHome")}
        </Link>
      </div>
    </div>
  );
}
