import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, Printer } from "lucide-react";
import { api } from "../../lib/api.js";
import { useLocalizedField } from "../../context/LanguageContext.jsx";
import { formatPrice } from "../../lib/formatPrice.js";
import { COLOR_HEX } from "../../lib/colors.js";
import AdminLayout from "../../components/AdminLayout.jsx";
import InvoiceModal from "../../components/Invoice.jsx";

const STATUSES = ["pending", "confirmed", "shipped", "delivered", "cancelled"];

// CHECKPOINT NOTE (admin/Orders.jsx):
// Expanding a row shows its line items (product, color + size, quantity)
// and a status dropdown + note field.
// - DELIVERY FEE is automatic: it's charged from the customer's region at
//   checkout. An older order without one gets its region fee when it's
//   confirmed (applyRegionDeliveryFee in server/src/routes/admin.js) --
//   there's no fee to type in here.
// - "Update & send" calls PATCH /api/admin/orders/:id/status with the
//   status + note — the backend then emails the customer (if they gave
//   an email at checkout) with the new status and that note, via
//   server/src/lib/email.js.
export default function AdminOrders() {
  const { t } = useTranslation("admin");
  const localize = useLocalizedField();
  const [orders, setOrders] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [itemsByOrder, setItemsByOrder] = useState({});
  const [draft, setDraft] = useState({}); // { [orderId]: { status, note } }
  const [sending, setSending] = useState(null);
  const [savingPayment, setSavingPayment] = useState(null);
  const [refunding, setRefunding] = useState(null);
  const [invoiceFor, setInvoiceFor] = useState(null); // order whose invoice is open

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

  // Reflect transfers (and cash) aren't confirmed automatically: the owner
  // checks the money actually arrived, then flips the order to paid here.
  async function setPaymentStatus(orderId, payment_status) {
    setSavingPayment(orderId);
    try {
      await api.patch(`/admin/orders/${orderId}/payment-status`, { payment_status });
      await load();
    } finally {
      setSavingPayment(null);
    }
  }

  async function refundOrder(orderId) {
    if (!confirm(t("orders.confirmRefund"))) return;
    setRefunding(orderId);
    try {
      await api.patch(`/admin/orders/${orderId}/refund`, {});
      await load();
    } catch (err) {
      alert(err.message);
    } finally {
      setRefunding(null);
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
              {(o.payment_method === "visa" || o.payment_method === "reflect") && (
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
              {!o.delivery_fee_confirmed && (
                <span className="rounded-full bg-enzo-gold/10 px-2 py-0.5 text-xs text-enzo-goldBright">
                  {t("orders.deliveryPending")}
                </span>
              )}
              <ChevronDown size={16} className={`transition-transform ${expanded === o.id ? "rotate-180" : ""}`} />
            </button>

            {expanded === o.id && (
              <div className="border-t hairline p-4 text-sm">
                <p className="mb-3 text-enzo-muted">
                  {o.phone}
                  {o.delivery_region && <> · {t(`orders.region.${o.delivery_region}`)}</>} · {o.city} · {o.address}
                  {o.customer_email && <> · {o.customer_email}</>}
                </p>

                <div className="mb-1 flex items-center justify-between">
                  <p className="font-medium">{t("orders.items")}</p>
                  {itemsByOrder[o.id] && (
                    <button
                      type="button"
                      onClick={() => setInvoiceFor(o)}
                      className="flex items-center gap-1.5 rounded-md border hairline px-3 py-1 text-xs font-semibold hover:border-enzo-gold"
                    >
                      <Printer size={14} />
                      {t("invoice.printInvoice")}
                    </button>
                  )}
                </div>
                {!itemsByOrder[o.id] ? (
                  <p className="text-enzo-muted">…</p>
                ) : (
                  <ul className="mb-4 flex flex-col gap-2">
                    {itemsByOrder[o.id].map((item) => (
                      <OrderItemRow key={item.id} item={item} localize={localize} t={t} />
                    ))}
                  </ul>
                )}

                <div className="mb-4 flex justify-between border-b hairline pb-3 text-sm">
                  <span className="text-enzo-muted">
                    {t("orders.subtotal")} {formatPrice(o.subtotal)}
                    {o.delivery_fee_confirmed && ` + ${t("orders.delivery")} ${formatPrice(o.delivery_fee)}`}
                  </span>
                  <span className="font-semibold">
                    {formatPrice(o.total)}
                    {!o.delivery_fee_confirmed && (
                      <span className="ms-2 text-xs font-normal text-enzo-muted">{t("orders.deliveryPending")}</span>
                    )}
                  </span>
                </div>

                {o.payment_status !== "refunded" && (
                  <div className="mb-4 flex items-center justify-between gap-3 border-b hairline pb-4">
                    <span className="text-sm text-enzo-muted">
                      {t("orders.paymentLabel")}: {o.payment_method} ·{" "}
                      {o.payment_status === "paid" ? t("orders.paid") : t("orders.unpaid")}
                    </span>
                    <div className="flex gap-2">
                      {o.payment_method !== "visa" && (
                        <button
                          onClick={() => setPaymentStatus(o.id, o.payment_status === "paid" ? "pending" : "paid")}
                          disabled={savingPayment === o.id}
                          className="rounded-md border hairline px-4 py-2 text-sm font-semibold disabled:opacity-40"
                        >
                          {o.payment_status === "paid" ? t("orders.markUnpaid") : t("orders.markPaid")}
                        </button>
                      )}
                      {o.payment_status === "paid" && (
                        <button
                          onClick={() => refundOrder(o.id)}
                          disabled={refunding === o.id}
                          className="rounded-md border border-enzo-error px-4 py-2 text-sm font-semibold text-enzo-error disabled:opacity-40"
                        >
                          {t("orders.refund")}
                        </button>
                      )}
                    </div>
                  </div>
                )}
                {o.payment_status === "refunded" && (
                  <div className="mb-4 border-b hairline pb-4 text-sm text-enzo-error">{t("orders.refunded")}</div>
                )}

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
      {invoiceFor && (
        <InvoiceModal order={invoiceFor} items={itemsByOrder[invoiceFor.id] || []} onClose={() => setInvoiceFor(null)} />
      )}
    </AdminLayout>
  );
}

// One line item: product, then its color (with swatch) and size as
// separate labelled chips so the picker can't mix them up, then the price.
// Also used by the customer history in admin/Customers.jsx.
export function OrderItemRow({ item, localize, t }) {
  return (
    <li className="flex items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span>
          {localize(item.product_name)} × {item.quantity}
        </span>
        {item.color && (
          <span className="flex items-center gap-1.5 rounded-full border hairline px-2 py-0.5 text-xs">
            <span
              className="h-3 w-3 rounded-full border border-enzo-line"
              style={{ backgroundColor: COLOR_HEX[item.color] || "#333" }}
            />
            {t("orders.colorLabel")}: {item.color}
          </span>
        )}
        {item.size && (
          <span className="rounded-full border hairline px-2 py-0.5 text-xs">
            {t("orders.sizeLabel")}: <span className="font-semibold">{item.size}</span>
          </span>
        )}
      </div>
      <span className="shrink-0">{formatPrice(item.unit_price * item.quantity)}</span>
    </li>
  );
}
