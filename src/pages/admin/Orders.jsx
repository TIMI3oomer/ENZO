import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, Printer, Search, Undo2, Repeat } from "lucide-react";
import { api } from "../../lib/api.js";
import { useLocalizedField } from "../../context/LanguageContext.jsx";
import { formatPrice } from "../../lib/formatPrice.js";
import { COLOR_HEX } from "../../lib/colors.js";
import { getAvailableStock } from "../../lib/variantStock.js";
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
// - SEARCH: filters by order/invoice number, name, phone, email or the
//   discount code used.
// - REFUND / EXCHANGE one item: the buttons on each line open a small form
//   (ItemReturnForm below). The server does the stock, re-pricing and
//   points (refund_order_item / exchange_order_item, migration_v16.sql)
//   and answers with the money difference, shown here so the owner knows
//   how much to give back or collect. Past changes are listed under the
//   items.
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
  const [search, setSearch] = useState("");
  const [returnsByOrder, setReturnsByOrder] = useState({});
  const [action, setAction] = useState(null); // { orderId, item, mode: "refund" | "exchange" }
  const [actionResult, setActionResult] = useState(null); // { orderId, moneyDiff, pointsDelta }
  const [products, setProducts] = useState(null);

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
    if (!itemsByOrder[order.id]) await loadOrderDetails(order.id);
  }

  async function loadOrderDetails(orderId) {
    const [items, returns] = await Promise.all([
      api.get(`/admin/orders/${orderId}/items`).catch(() => []),
      api.get(`/admin/orders/${orderId}/returns`).catch(() => []),
    ]);
    setItemsByOrder((prev) => ({ ...prev, [orderId]: items || [] }));
    setReturnsByOrder((prev) => ({ ...prev, [orderId]: returns || [] }));
  }

  function openAction(orderId, item, mode) {
    setActionResult(null);
    setAction({ orderId, item, mode });
    if (mode === "exchange" && !products) {
      api.get("/admin/products").then((d) => setProducts((d || []).filter((p) => p.is_active))).catch(() => setProducts([]));
    }
  }

  async function submitAction(payload) {
    const { orderId, item, mode } = action;
    const result = await api.post(`/admin/order-items/${item.id}/${mode}`, payload);
    setAction(null);
    setActionResult({ orderId, ...result });
    await Promise.all([load(), loadOrderDetails(orderId)]);
  }

  const q = search.trim().toLowerCase().replace(/^#/, "");
  const visibleOrders = !q
    ? orders
    : orders.filter((o) =>
        [o.order_number, o.customer_name, o.phone, o.customer_email, o.discount_code, o.seller]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q))
      );

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
      <div className="relative mb-5 max-w-md">
        <Search size={16} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-enzo-muted" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("orders.searchPlaceholder")}
          className="input ps-9"
        />
      </div>
      {q && visibleOrders.length === 0 && <p className="text-enzo-muted">{t("orders.noMatches")}</p>}
      <div className="flex flex-col gap-3">
        {visibleOrders.map((o) => (
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
              {o.channel === "in_store" && (
                <span className="rounded-full bg-enzo-gold/10 px-2 py-0.5 text-xs text-enzo-goldBright">
                  {t("invoice.inStore")}
                  {o.seller && ` · ${o.seller}`}
                </span>
              )}
              <span className="rounded-full border hairline px-3 py-1 text-xs text-enzo-muted">
                {t(`orders.status${o.status[0].toUpperCase()}${o.status.slice(1)}`)}
              </span>
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
                      <OrderItemRow key={item.id} item={item} localize={localize} t={t}>
                        {o.status !== "cancelled" && o.payment_status !== "refunded" && (
                          <span className="flex gap-1">
                            <button
                              type="button"
                              onClick={() => openAction(o.id, item, "refund")}
                              title={t("returns.refund")}
                              className="flex items-center gap-1 rounded border hairline px-2 py-0.5 text-xs hover:border-enzo-error hover:text-enzo-error"
                            >
                              <Undo2 size={12} />
                              {t("returns.refund")}
                            </button>
                            <button
                              type="button"
                              onClick={() => openAction(o.id, item, "exchange")}
                              title={t("returns.exchange")}
                              className="flex items-center gap-1 rounded border hairline px-2 py-0.5 text-xs hover:border-enzo-gold hover:text-enzo-goldBright"
                            >
                              <Repeat size={12} />
                              {t("returns.exchange")}
                            </button>
                          </span>
                        )}
                      </OrderItemRow>
                    ))}
                  </ul>
                )}

                {action?.orderId === o.id && (
                  <ItemReturnForm
                    action={action}
                    products={products}
                    localize={localize}
                    onCancel={() => setAction(null)}
                    onSubmit={submitAction}
                  />
                )}

                {actionResult?.orderId === o.id && (
                  <div
                    className={`mb-4 rounded-md border p-3 text-sm ${
                      actionResult.moneyDiff < 0
                        ? "border-enzo-error/50 bg-enzo-error/10"
                        : actionResult.moneyDiff > 0
                          ? "border-enzo-gold/50 bg-enzo-gold/10"
                          : "border-enzo-line"
                    }`}
                  >
                    <p className="font-semibold">
                      {actionResult.moneyDiff < 0
                        ? t("returns.giveBack", { amount: formatPrice(-actionResult.moneyDiff) })
                        : actionResult.moneyDiff > 0
                          ? t("returns.collect", { amount: formatPrice(actionResult.moneyDiff) })
                          : t("returns.noDiff")}
                    </p>
                    <p className="text-xs text-enzo-muted">
                      {t("returns.newTotal", { total: formatPrice(actionResult.total) })}
                      {actionResult.pointsDelta !== 0 &&
                        ` · ${t("returns.pointsChanged", { points: (actionResult.pointsDelta > 0 ? "+" : "") + actionResult.pointsDelta })}`}
                    </p>
                  </div>
                )}

                {returnsByOrder[o.id]?.length > 0 && (
                  <div className="mb-4 rounded-md border hairline p-3">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-enzo-gold">{t("returns.history")}</p>
                    <ul className="flex flex-col gap-1.5 text-xs">
                      {returnsByOrder[o.id].map((r) => (
                        <li key={r.id} className="flex flex-wrap justify-between gap-2">
                          <span>
                            {r.kind === "refund" ? t("returns.refunded") : t("returns.exchanged")}: {localize(r.product_name)}
                            {[r.color, r.size].filter(Boolean).length > 0 && ` (${[r.color, r.size].filter(Boolean).join(" / ")})`} × {r.quantity}
                            {r.kind === "exchange" &&
                              ` → ${localize(r.new_product_name)}${
                                [r.new_color, r.new_size].filter(Boolean).length ? ` (${[r.new_color, r.new_size].filter(Boolean).join(" / ")})` : ""
                              }`}
                            {r.note && <span className="text-enzo-muted"> · {r.note}</span>}
                          </span>
                          <span className="text-enzo-muted">
                            {Number(r.money_diff) === 0 ? "±0" : `${Number(r.money_diff) > 0 ? "+" : "-"}${formatPrice(Math.abs(r.money_diff))}`} ·{" "}
                            {new Date(r.created_at).toLocaleDateString()}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="mb-4 flex justify-between border-b hairline pb-3 text-sm">
                  <span className="text-enzo-muted">
                    {t("orders.subtotal")} {formatPrice(o.subtotal)}
                    {Number(o.code_discount) > 0 && ` − ${t("orders.codeDiscount", { code: o.discount_code })} ${formatPrice(o.code_discount)}`}
                    {Number(o.points_discount) > 0 && ` − ${t("orders.pointsUsed", { points: o.points_redeemed })} ${formatPrice(o.points_discount)}`}
                    {o.delivery_fee_confirmed && ` + ${t("orders.delivery")} ${formatPrice(o.delivery_fee)}`}
                    {o.points_earned > 0 && !o.points_reversed && (
                      <span className="ms-2 text-enzo-goldBright">· {t("orders.pointsEarned", { points: o.points_earned })}</span>
                    )}
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
export function OrderItemRow({ item, localize, t, children }) {
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
      <span className="flex shrink-0 items-center gap-3">
        {children}
        {formatPrice(item.unit_price * item.quantity)}
      </span>
    </li>
  );
}

// Inline form under an order's items: refund N pieces of a line, or swap
// them for another product/size/color. Sizes are limited to ones that
// exist in the chosen color (same stock rule as the storefront).
function ItemReturnForm({ action, products, localize, onCancel, onSubmit }) {
  const { t } = useTranslation("admin");
  const { item, mode } = action;
  const [quantity, setQuantity] = useState(1);
  const [productId, setProductId] = useState(item.product_id || "");
  const [size, setSize] = useState("");
  const [color, setColor] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const product = products?.find((p) => p.id === productId);
  const newPrice = product ? Number(product.price) * (1 - (product.discount_percent || 0) / 100) : 0;
  const estimate = mode === "exchange" && product ? (newPrice - Number(item.unit_price)) * quantity : -Number(item.unit_price) * quantity;

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      await onSubmit(
        mode === "refund"
          ? { quantity, note: note || null }
          : { quantity, product_id: productId, size: size || null, color: color || null, note: note || null }
      );
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mb-4 rounded-md border border-enzo-gold/40 bg-enzo-panel p-4">
      <p className="mb-3 font-semibold">
        {mode === "refund" ? t("returns.refundTitle") : t("returns.exchangeTitle")}: {localize(item.product_name)}
        {[item.color, item.size].filter(Boolean).length > 0 && ` (${[item.color, item.size].filter(Boolean).join(" / ")})`}
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <div>
          <label className="mb-1 block text-xs text-enzo-muted">{t("returns.quantity")}</label>
          <select className="input py-1.5" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))}>
            {Array.from({ length: item.quantity }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>

        {mode === "exchange" && (
          <>
            <div className="sm:col-span-3">
              <label className="mb-1 block text-xs text-enzo-muted">{t("returns.newProduct")}</label>
              <select
                className="input py-1.5"
                value={productId}
                onChange={(e) => {
                  setProductId(e.target.value);
                  setSize("");
                  setColor("");
                }}
                required
              >
                <option value="">{products ? "—" : "…"}</option>
                {(products || []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {localize(p.name)} — {formatPrice(Number(p.price) * (1 - (p.discount_percent || 0) / 100))}
                  </option>
                ))}
              </select>
            </div>
            {product?.colors?.length > 0 && (
              <div>
                <label className="mb-1 block text-xs text-enzo-muted">{t("inStoreSale.color")}</label>
                <select className="input py-1.5" value={color} onChange={(e) => setColor(e.target.value)} required>
                  <option value="">—</option>
                  {product.colors.map((c) => (
                    <option key={c} value={c} disabled={product.sold_out_colors?.includes(c)}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {product?.sizes?.length > 0 && (
              <div>
                <label className="mb-1 block text-xs text-enzo-muted">{t("inStoreSale.size")}</label>
                <select className="input py-1.5" value={size} onChange={(e) => setSize(e.target.value)} required>
                  <option value="">—</option>
                  {product.sizes.map((s) => (
                    <option
                      key={s}
                      value={s}
                      disabled={product.sold_out_sizes?.includes(s) || (color && getAvailableStock(product, s, color) <= 0)}
                    >
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </>
        )}

        <div className={mode === "exchange" ? "sm:col-span-2" : "sm:col-span-3"}>
          <label className="mb-1 block text-xs text-enzo-muted">{t("returns.note")}</label>
          <input className="input py-1.5" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>

      {(mode === "refund" || product) && (
        <p className="mt-3 text-xs text-enzo-muted">
          {t("returns.estimate")}:{" "}
          <span className={`font-semibold ${estimate < 0 ? "text-enzo-error" : estimate > 0 ? "text-enzo-goldBright" : ""}`}>
            {estimate < 0 ? "-" : estimate > 0 ? "+" : "±"}
            {formatPrice(Math.abs(estimate))}
          </span>{" "}
          ({t("returns.estimateHint")})
        </p>
      )}
      {error && <p className="mt-2 text-sm text-enzo-error">{error}</p>}

      <div className="mt-4 flex gap-2">
        <button
          type="submit"
          disabled={saving || (mode === "exchange" && !productId)}
          className="rounded-md bg-enzo-gradient px-4 py-2 text-sm font-semibold text-enzo-black disabled:opacity-40"
        >
          {mode === "refund" ? t("returns.confirmRefund") : t("returns.confirmExchange")}
        </button>
        <button type="button" onClick={onCancel} className="rounded-md border hairline px-4 py-2 text-sm">
          {t("returns.cancel")}
        </button>
      </div>
    </form>
  );
}
