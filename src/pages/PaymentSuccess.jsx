import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useCart } from "../context/CartContext.jsx";
import { api } from "../lib/api.js";

const POLL_INTERVAL_MS = 2000;
const MAX_ATTEMPTS = 12; // ~24 seconds total

// CHECKPOINT NOTE (pages/PaymentSuccess.jsx):
// Stripe redirects here immediately after a successful card payment, but
// the actual order isn't created until the webhook (server/src/routes/
// webhooks.js) processes the event asynchronously -- that usually takes
// well under a second, but the browser's redirect can arrive slightly
// before it finishes. Rather than assume the order exists immediately,
// this polls GET /api/orders/by-session/:sessionId a few times.
//
// The cart is intentionally NOT cleared until the order is confirmed to
// exist here — if this page is reached but the webhook somehow never
// fires, the customer's cart is still intact rather than silently lost.
export default function PaymentSuccess() {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const navigate = useNavigate();
  const { t } = useTranslation("checkout");
  const { items, clearCart } = useCart();
  const [status, setStatus] = useState("polling"); // polling | timeout | error
  const attemptsRef = useRef(0);

  useEffect(() => {
    if (!sessionId) {
      setStatus("error");
      return;
    }

    let cancelled = false;

    async function poll() {
      attemptsRef.current += 1;
      try {
        const order = await api.get(`/orders/by-session/${sessionId}`);
        if (cancelled) return;

        const confirmedItems = items.map((item) => ({
          name: item.name,
          size: item.size,
          color: item.color,
          quantity: item.quantity,
          price: item.price,
        }));
        clearCart();
        navigate(`/order-confirmation/${order.order_number}`, {
          state: {
            items: confirmedItems,
            subtotal: order.subtotal,
            deliveryFee: order.delivery_fee,
            total: order.total,
          },
          replace: true,
        });
      } catch (err) {
        if (cancelled) return;
        if (attemptsRef.current >= MAX_ATTEMPTS) {
          setStatus("timeout");
          return;
        }
        setTimeout(poll, POLL_INTERVAL_MS);
      }
    }

    poll();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  return (
    <div className="mx-auto max-w-lg px-4 py-24 text-center">
      {status === "polling" && (
        <>
          <div className="mx-auto mb-6 h-10 w-10 animate-spin rounded-full border-2 border-enzo-line border-t-enzo-goldBright" />
          <p className="text-enzo-muted">{t("confirmingPayment")}</p>
        </>
      )}
      {status === "timeout" && (
        <>
          <p className="mb-2 font-medium">{t("paymentTakingLong")}</p>
          <p className="text-sm text-enzo-muted">{t("paymentTakingLongHint")}</p>
        </>
      )}
      {status === "error" && <p className="text-enzo-muted">{t("paymentSessionMissing")}</p>}
    </div>
  );
}
