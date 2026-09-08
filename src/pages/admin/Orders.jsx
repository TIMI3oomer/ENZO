import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown } from "lucide-react";
import { api } from "../../lib/api.js";
import { useLocalizedField } from "../../context/LanguageContext.jsx";
import { useSettings } from "../../context/SettingsContext.jsx";
import { formatPrice } from "../../lib/formatPrice.js";
import AdminLayout from "../../components/AdminLayout.jsx";

const STATUSES = ["pending", "confirmed", "shipped", "delivered", "cancelled"];

// CHECKPOINT NOTE (admin/Orders.jsx):
// Expanding a row shows its line items (product/size/quantity) plus a
// status dropdown and a note field. Clicking "Update & send" calls
// PATCH /api/admin/orders/:id/status with both — the backend then emails
// the customer (if they gave an email at checkout) with the new status
// and that note, via server/src/lib/email.js.
export default function AdminOrders() {
  const { t } = useTranslation("admin");
  const localize = useLocalizedField();
  const { currency_symbol } = useSettings();
  const [orders, setOrders] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [itemsByOrder, setItemsByOrder] = useState({});
  const [draft, setDraft] = useState({}); // { [orderId]: { status, note } }
  const [sending, setSending] = useState(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const data = await api.get("/admin/orders").catch(() => []);
    setOrders(data || []);
  }

  async function toggleExpand(order) {
    if (expanded === order.id) {
      setExpanded(null);
      return;
    }
    setExpanded(order.id);
    setDraft((d) => ({ ...d, [order.id]: d[order.id] || { status: order.status, note: order.admin_note || "" } }));
    if (!itemsByOrder[order.id]) {
      const data = await api.get(`/admin/orders/${order.id}/items`).catch(() => []);
      setItemsByOrder((prev) => ({ ...prev, [order.id]: data || [] }));
    }
  }

  async function sendUpdate(orderId) {
    setSending(orderId);
    try {
      await api.patch(`/admin/orders/${orderId}/status`, draft[orderId]);
      await load();
    } finally {
      setSending(null);
    }
  }

  return (
    <AdminLayout title={t("orders.title")}>
      <div className="flex flex-col gap-3">
        {orders.map((o) => (
          <div key={o.id} className="rounded-lg border hairline">
            <button
              onClick={() => toggleExpand(o)}
              className="flex w-full items-center justify-between p-4 text-start text-sm"
            >
              <span className="font-medium">#{o.order_number}</span>
              <span>{o.customer_name}</span>
              <span className="text-enzo-muted">{new Date(o.created_at).toLocaleDateString()}</span>
              {o.payment_method === "visa" && (
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    o.payment_status === "paid"
                      ? "bg-enzo-gold/20 text-enzo-goldBright"
                      : "bg-enzo-error/20 text-enzo-error"
                  }`}
                >
                  {o.payment_status === "paid" ? t("orders.paid") : t("orders.unpaid")}
                </span>
              )}
              <span className="rounded-full border hairline px-3 py-1 text-xs text-enzo-muted">{o.status}</span>
              <ChevronDown size={16} className={`transition-transform ${expanded === o.id ? "rotate-180" : ""}`} />
            </button>

            {expanded === o.id && (
              <div className="border-t hairline p-4 text-sm">
                <p className="mb-3 text-enzo-muted">
                  {o.phone} · {o.city} · {o.address}
                  {o.customer_email && <> · {o.customer_email}</>}
                </p>

                <p className="mb-1 font-medium">{t("orders.items")}</p>
                {!itemsByOrder[o.id] ? (
                  <p className="text-enzo-muted">…</p>
                ) : (
                  <ul className="mb-4 flex flex-col gap-1">
                    {itemsByOrder[o.id].map((item) => (
                      <li key={item.id} className="flex justify-between">
                        <span>
                          {localize(item.product_name)} × {item.quantity}
                          {[item.color, item.size].filter(Boolean).map((v) => ` (${v})`).join("")}
                        </span>
                        <span>{formatPrice(item.unit_price * item.quantity, currency_symbol)}</span>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="mb-4 flex justify-between border-b hairline pb-3 text-sm">
                  <span className="text-enzo-muted">
                    {t("orders.subtotal")} {formatPrice(o.subtotal, currency_symbol)}
                    {o.delivery_fee > 0 && ` + ${t("orders.delivery")} ${formatPrice(o.delivery_fee, currency_symbol)}`}
                  </span>
                  <span className="font-semibold">{formatPrice(o.total, currency_symbol)}</span>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                  <div className="flex-1">
                    <label className="mb-1 block text-xs text-enzo-muted">{t("orders.status")}</label>
                    <select
                      className="input py-1.5"
                      value={draft[o.id]?.status ?? o.status}
                      onChange={(e) => setDraft((d) => ({ ...d, [o.id]: { ...d[o.id], status: e.target.value } }))}
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {t(`orders.status${s[0].toUpperCase()}${s.slice(1)}`)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex-[2]">
                    <label className="mb-1 block text-xs text-enzo-muted">{t("orders.note")}</label>
                    <input
                      className="input py-1.5"
                      value={draft[o.id]?.note ?? ""}
                      onChange={(e) => setDraft((d) => ({ ...d, [o.id]: { ...d[o.id], note: e.target.value } }))}
                    />
                  </div>
                  <button
                    onClick={() => sendUpdate(o.id)}
                    disabled={sending === o.id}
                    className="rounded-md bg-enzo-gradient px-4 py-2 text-sm font-semibold text-enzo-black disabled:opacity-40"
                  >
                    {t("orders.sendUpdate")}
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </AdminLayout>
  );
}
