import { useEffect, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ClipboardCheck, PackageCheck, Truck, Home, XCircle, Search, ChevronDown } from "lucide-react";
import { api } from "../lib/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useLocalizedField } from "../context/LanguageContext.jsx";
import { formatPrice } from "../lib/formatPrice.js";
import DeliveryEstimate from "../components/DeliveryEstimate.jsx";

// CHECKPOINT NOTE (TrackOrder.jsx):
// "Where's my order?" -- just the phone number. GET /api/orders/track?phone=
// returns every online order placed with that number (newest first), each
// with its status timeline (order_status_history, migration_v16.sql), items
// and totals -- never the name or address.
//
// /track/:number (links from the order confirmation and My account): a
// signed-in customer sees that order straight away (owner lookup, no phone
// needed); anyone else gets the phone form with that order opened once
// found. The confirmation page also passes the phone along, so a guest who
// just ordered lands on their order without typing anything.
const STEPS = [
  { status: "pending", icon: ClipboardCheck },
  { status: "confirmed", icon: PackageCheck },
  { status: "shipped", icon: Truck },
  { status: "delivered", icon: Home },
];

export default function TrackOrder() {
  const { number: numberParam } = useParams();
  const location = useLocation();
  const { t } = useTranslation("common");
  const { session } = useAuth();

  const [phone, setPhone] = useState(location.state?.phone || "");
  const [orders, setOrders] = useState(null); // null = not searched yet
  const [openNumber, setOpenNumber] = useState(numberParam ? Number(numberParam) : null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function searchByPhone(ph) {
    setLoading(true);
    setError("");
    try {
      const found = await api.get(`/orders/track?phone=${encodeURIComponent(ph)}`);
      setOrders(found);
      if (found.length === 0) setError(t("track.noneForPhone"));
      else if (!found.some((o) => o.order_number === openNumber)) setOpenNumber(found[0].order_number);
    } catch (err) {
      setOrders(null);
      setError(err.status === 400 ? t("track.fullPhone") : err.status === 429 ? err.message : t("errors.network"));
    } finally {
      setLoading(false);
    }
  }

  // Arriving from a link: signed-in owner sees the order directly; a guest
  // coming from the confirmation page has their phone passed along.
  useEffect(() => {
    if (location.state?.phone) {
      searchByPhone(location.state.phone);
      return;
    }
    if (numberParam && session) {
      api
        .get(`/orders/track/${encodeURIComponent(numberParam)}`)
        .then((o) => {
          setOrders([o]);
          setOpenNumber(o.order_number);
        })
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numberParam, session]);

  function handleSubmit(e) {
    e.preventDefault();
    if (phone.trim()) searchByPhone(phone.trim());
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 text-start sm:px-6">
      <h1 className="font-display text-3xl uppercase">{t("track.title")}</h1>
      <p className="mt-2 text-sm text-enzo-muted">{t("track.intro")}</p>

      <form onSubmit={handleSubmit} data-tour="track-form" className="mt-6 flex gap-3">
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder={t("track.phonePlaceholder")}
          aria-label={t("track.phone")}
          className="input flex-1"
          dir="ltr"
          inputMode="tel"
          autoComplete="tel"
        />
        <button
          type="submit"
          disabled={loading || !phone.trim()}
          className="flex flex-none items-center justify-center gap-2 rounded-md bg-enzo-gradient px-5 py-2.5 font-semibold text-enzo-black disabled:opacity-40"
        >
          <Search size={16} />
          {t("track.find")}
        </button>
      </form>
      {error && <p className="mt-3 text-sm text-enzo-error">{error}</p>}

      {orders?.length > 1 && <p className="mt-8 text-sm text-enzo-muted">{t("track.foundCount", { count: orders.length })}</p>}

      <div className="mt-4 flex flex-col gap-4">
        {(orders || []).map((order) => (
          <OrderCard
            key={order.order_number}
            order={order}
            open={openNumber === order.order_number || orders.length === 1}
            onToggle={() => setOpenNumber(openNumber === order.order_number ? null : order.order_number)}
          />
        ))}
      </div>
    </div>
  );
}

function OrderCard({ order, open, onToggle }) {
  const { t } = useTranslation("common");
  const localize = useLocalizedField();

  // When each status was reached (latest time it was entered).
  const reachedAt = {};
  for (const h of order.history || []) reachedAt[h.status] = h.created_at;
  const cancelled = order.status === "cancelled";
  const currentIndex = STEPS.findIndex((s) => s.status === order.status);

  return (
    <div className={`rounded-lg border ${open ? "border-enzo-gold/40" : "hairline"}`}>
      <button type="button" onClick={onToggle} className="flex w-full items-center justify-between gap-3 p-4 text-start">
        <div>
          <p className="font-display text-xl">#{order.order_number}</p>
          <p className="text-xs text-enzo-muted">{new Date(order.created_at).toLocaleString()}</p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              cancelled ? "bg-enzo-error/15 text-enzo-error" : "bg-enzo-gold/15 text-enzo-goldBright"
            }`}
          >
            {t(`track.status_${order.status}`)}
          </span>
          <ChevronDown size={18} className={`text-enzo-muted transition-transform ${open ? "rotate-180" : ""}`} />
        </div>
      </button>

      {open && (
        <div className="border-t hairline px-4 pb-5">
          {!cancelled && order.status !== "delivered" && <DeliveryEstimate className="mt-4" />}

          {cancelled ? (
            <div className="mt-5 flex items-center gap-3 rounded-lg border border-enzo-error/50 bg-enzo-error/10 p-4 text-enzo-error">
              <XCircle size={22} />
              <div>
                <p className="font-semibold">{t("track.status_cancelled")}</p>
                {reachedAt.cancelled && <p className="text-xs opacity-80">{new Date(reachedAt.cancelled).toLocaleString()}</p>}
              </div>
            </div>
          ) : (
            <ol className="relative mt-6 flex flex-col gap-7 ps-2">
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
                        {done
                          ? reachedAt[status]
                            ? new Date(reachedAt[status]).toLocaleString()
                            : t("track.done") // older orders: step finished before times were recorded
                          : t(`track.hint_${status}`)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}

          <div className="mt-6 rounded-lg bg-enzo-panel/50 p-4">
            <ul className="flex flex-col gap-2 border-b hairline pb-3 text-sm">
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
              {Number(order.code_discount) > 0 && <Row label={t("track.codeDiscount")} value={`-${formatPrice(order.code_discount)}`} />}
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
