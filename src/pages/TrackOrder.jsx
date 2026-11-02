import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ClipboardCheck, PackageCheck, Truck, Home, XCircle, Search } from "lucide-react";
import { api } from "../lib/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useLocalizedField } from "../context/LanguageContext.jsx";
import { formatPrice } from "../lib/formatPrice.js";
import DeliveryEstimate from "../components/DeliveryEstimate.jsx";

// CHECKPOINT NOTE (TrackOrder.jsx):
// "Where's my order?" -- /track (form) and /track/:number. Data comes from
// GET /api/orders/track/:number, which needs either the signed-in owner of
// the order or the phone number it was placed with. The timeline uses the
// order's status history (order_status_history, migration_v16.sql), so
// each step shows when it actually happened.
const STEPS = [
  { status: "pending", icon: ClipboardCheck },
  { status: "confirmed", icon: PackageCheck },
  { status: "shipped", icon: Truck },
  { status: "delivered", icon: Home },
];

export default function TrackOrder() {
  const { number: numberParam } = useParams();
  const { t } = useTranslation("common");
  const { session } = useAuth();
  const navigate = useNavigate();
  const localize = useLocalizedField();

  const [number, setNumber] = useState(numberParam || "");
  const [phone, setPhone] = useState("");
  const [order, setOrder] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function lookup(num, ph) {
    setLoading(true);
    setError("");
    try {
      const q = ph ? `?phone=${encodeURIComponent(ph)}` : "";
      setOrder(await api.get(`/orders/track/${encodeURIComponent(num)}${q}`));
    } catch (err) {
      setOrder(null);
      setError(err.status === 429 ? err.message : t("track.notFound"));
    } finally {
      setLoading(false);
    }
  }

  // Signed in and arriving from a link (/track/123): try as the owner first.
  useEffect(() => {
    if (numberParam && session) lookup(numberParam, "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numberParam, session]);

  function handleSubmit(e) {
    e.preventDefault();
    if (!number.trim()) return;
    if (number.trim() !== numberParam) navigate(`/track/${number.trim()}`, { replace: true });
    lookup(number.trim().replace(/^#/, ""), phone.trim());
  }

  // When each status was reached (latest time it was entered).
  const reachedAt = {};
  for (const h of order?.history || []) reachedAt[h.status] = h.created_at;
  const cancelled = order?.status === "cancelled";
  const currentIndex = STEPS.findIndex((s) => s.status === order?.status);

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 text-start sm:px-6">
      <h1 className="font-display text-3xl uppercase">{t("track.title")}</h1>
      <p className="mt-2 text-sm text-enzo-muted">{t("track.intro")}</p>

      <form onSubmit={handleSubmit} className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <input
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          placeholder={t("track.orderNumber")}
          className="input"
          dir="ltr"
          inputMode="numeric"
        />
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder={t("track.phone")}
          className="input"
          dir="ltr"
          inputMode="tel"
        />
        <button
          type="submit"
          disabled={loading}
          className="flex items-center justify-center gap-2 rounded-md bg-enzo-gradient px-5 py-2.5 font-semibold text-enzo-black disabled:opacity-40"
        >
          <Search size={16} />
          {t("track.find")}
        </button>
      </form>
      {error && <p className="mt-3 text-sm text-enzo-error">{error}</p>}

      {order && (
        <div className="mt-10">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-display text-2xl">#{order.order_number}</p>
            <p className="text-sm text-enzo-muted">{new Date(order.created_at).toLocaleString()}</p>
          </div>
          {!cancelled && order.status !== "delivered" && <DeliveryEstimate className="mt-2" />}

          {cancelled ? (
            <div className="mt-6 flex items-center gap-3 rounded-lg border border-enzo-error/50 bg-enzo-error/10 p-4 text-enzo-error">
              <XCircle size={22} />
              <div>
                <p className="font-semibold">{t("track.status_cancelled")}</p>
                {reachedAt.cancelled && <p className="text-xs opacity-80">{new Date(reachedAt.cancelled).toLocaleString()}</p>}
              </div>
            </div>
          ) : (
            <ol className="relative mt-8 flex flex-col gap-8 ps-2">
              <span className="absolute bottom-4 start-[1.3rem] top-4 w-px bg-enzo-line" aria-hidden="true" />
              {STEPS.map(({ status, icon: Icon }, i) => {
                const done = i <= currentIndex;
                const current = i === currentIndex;
                return (
                  <li key={status} className="relative flex items-center gap-4">
                    <span
                      className={`relative z-10 flex h-9 w-9 flex-none items-center justify-center rounded-full border-2 ${
                        done ? "border-enzo-goldBright bg-enzo-goldBright text-enzo-black" : "border-enzo-line bg-enzo-black text-enzo-muted"
                      } ${current ? "ring-4 ring-enzo-gold/25" : ""}`}
                    >
                      <Icon size={17} />
                    </span>
                    <div>
                      <p className={`font-semibold ${done ? "text-enzo-white" : "text-enzo-muted"}`}>{t(`track.status_${status}`)}</p>
                      <p className="text-xs text-enzo-muted">
                        {done && reachedAt[status] ? new Date(reachedAt[status]).toLocaleString() : t(`track.hint_${status}`)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}

          <div className="mt-10 rounded-lg border hairline p-5">
            <ul className="flex flex-col gap-2 border-b hairline pb-4 text-sm">
              {order.items.map((item, i) => (
                <li key={i} className="flex justify-between gap-3">
                  <span>
                    {localize(item.product_name)} × {item.quantity}
                    {[item.color, item.size].filter(Boolean).map((v) => ` (${v})`).join("")}
                  </span>
                  <span>{formatPrice(item.unit_price * item.quantity)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex flex-col gap-1 text-sm">
              {Number(order.code_discount) > 0 && (
                <Row label={t("track.codeDiscount")} value={`-${formatPrice(order.code_discount)}`} />
              )}
              {Number(order.points_discount) > 0 && (
                <Row label={t("track.pointsDiscount")} value={`-${formatPrice(order.points_discount)}`} />
              )}
              <Row label={t("track.delivery")} value={formatPrice(order.delivery_fee)} />
              <div className="mt-1 flex justify-between font-semibold">
                <span>{t("track.total")}</span>
                <span>{formatPrice(order.total)}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between">
      <span className="text-enzo-muted">{label}</span>
      <span>{value}</span>
    </div>
  );
}
