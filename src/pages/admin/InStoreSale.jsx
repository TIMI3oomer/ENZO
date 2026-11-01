import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Trash2, Printer } from "lucide-react";
import { api } from "../../lib/api.js";
import { useLocalizedField } from "../../context/LanguageContext.jsx";
import { formatPrice, getDiscountedPrice } from "../../lib/formatPrice.js";
import { getAvailableStock } from "../../lib/variantStock.js";
import AdminLayout from "../../components/AdminLayout.jsx";
import InvoiceModal from "../../components/Invoice.jsx";

// CHECKPOINT NOTE (admin/InStoreSale.jsx):
// For walk-in customers -- this is a real shop, not just a website. Pick
// a product (+ size/color if it has them), a quantity, add it to the
// ticket, repeat for everything the customer's buying, then ring it up.
// Stock is taken immediately on submit (record_in_store_sale() in
// schema.sql) -- there's no "pending" step like online orders, since the
// item has already left the shelf by the time this is entered.
//
// INVOICE: ringing up opens the printable invoice (فاتورة) for that sale
// right away (components/Invoice.jsx); "Print invoice" reopens it.
export default function AdminInStoreSale() {
  const { t } = useTranslation("admin");
  const localize = useLocalizedField();
  const [products, setProducts] = useState([]);
  const [productId, setProductId] = useState("");
  const [size, setSize] = useState("");
  const [color, setColor] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [lines, setLines] = useState([]);
  const [customerName, setCustomerName] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(null);
  const [showInvoice, setShowInvoice] = useState(false);

  useEffect(() => {
    api.get("/admin/products").then((data) => setProducts((data || []).filter((p) => p.is_active))).catch(() => {});
  }, []);

  const product = products.find((p) => p.id === productId);

  function addLine() {
    if (!product) return;
    if (product.sizes?.length > 0 && !size) return;
    if (product.colors?.length > 0 && !color) return;
    setLines((l) => [
      ...l,
      {
        key: `${productId}__${size}__${color}__${Date.now()}`,
        productId,
        name: localize(product.name),
        size: size || null,
        color: color || null,
        quantity,
        price: getDiscountedPrice(product.price, product.discount_percent),
      },
    ]);
    setSize("");
    setColor("");
    setQuantity(1);
  }

  function removeLine(key) {
    setLines((l) => l.filter((line) => line.key !== key));
  }

  const total = lines.reduce((sum, l) => sum + l.price * l.quantity, 0);

  async function handleSubmit() {
    setError("");
    setSaving(true);
    try {
      const result = await api.post("/admin/in-store-sales", {
        customerName: customerName || undefined,
        note: note || undefined,
        items: lines.map((l) => ({
          product_id: l.productId,
          size: l.size,
          color: l.color,
          quantity: l.quantity,
        })),
      });
      setDone(result);
      setShowInvoice(true);
      setLines([]);
      setCustomerName("");
      setNote("");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const availableForSelection = product ? getAvailableStock(product, size || null, color || null) : null;

  return (
    <AdminLayout title={t("inStoreSale.title")}>
      <div className="max-w-2xl">
        {done && (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-enzo-gold/40 bg-enzo-gold/10 p-4 text-sm">
            <span>{t("inStoreSale.recorded", { orderNumber: done.orderNumber, total: formatPrice(done.total) })}</span>
            {done.order && (
              <button
                type="button"
                onClick={() => setShowInvoice(true)}
                className="flex items-center gap-2 rounded-md border border-enzo-gold px-3 py-1.5 font-semibold text-enzo-goldBright"
              >
                <Printer size={15} />
                {t("invoice.printInvoice")}
              </button>
            )}
          </div>
        )}
        {showInvoice && done?.order && (
          <InvoiceModal order={done.order} items={done.items} onClose={() => setShowInvoice(false)} />
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-medium text-enzo-muted">{t("inStoreSale.product")}</label>
            <select
              className="input"
              value={productId}
              onChange={(e) => {
                setProductId(e.target.value);
                setSize("");
                setColor("");
              }}
            >
              <option value="">—</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {localize(p.name)} — {formatPrice(getDiscountedPrice(p.price, p.discount_percent))}
                </option>
              ))}
            </select>
          </div>

          {product?.sizes?.length > 0 && (
            <div>
              <label className="mb-1 block text-sm font-medium text-enzo-muted">{t("inStoreSale.size")}</label>
              <select className="input" value={size} onChange={(e) => setSize(e.target.value)}>
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

          {product?.colors?.length > 0 && (
            <div>
              <label className="mb-1 block text-sm font-medium text-enzo-muted">{t("inStoreSale.color")}</label>
              <select className="input" value={color} onChange={(e) => setColor(e.target.value)}>
                <option value="">—</option>
                {product.colors.map((c) => (
                  <option key={c} value={c} disabled={product.sold_out_colors?.includes(c)}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          )}

          {product && (
            <div>
              <label className="mb-1 block text-sm font-medium text-enzo-muted">{t("inStoreSale.quantity")}</label>
              <input
                type="number"
                min="1"
                className="input"
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
              />
              {availableForSelection != null && (
                <p className="mt-1 text-xs text-enzo-muted">{t("inStoreSale.inStock", { count: availableForSelection })}</p>
              )}
            </div>
          )}

          <div className="sm:col-span-2">
            <button
              type="button"
              onClick={addLine}
              disabled={!product || (product.sizes?.length > 0 && !size) || (product.colors?.length > 0 && !color)}
              className="rounded-md border hairline px-4 py-2 text-sm font-semibold disabled:opacity-40"
            >
              {t("inStoreSale.addToTicket")}
            </button>
          </div>
        </div>

        {lines.length > 0 && (
          <div className="mt-6 flex flex-col gap-2 border-t hairline pt-6">
            {lines.map((l) => (
              <div key={l.key} className="flex items-center justify-between gap-3 text-sm">
                <span>
                  {l.name} {[l.color, l.size].filter(Boolean).join(" / ") && `(${[l.color, l.size].filter(Boolean).join(" / ")})`} × {l.quantity}
                </span>
                <div className="flex items-center gap-3">
                  <span>{formatPrice(l.price * l.quantity)}</span>
                  <button onClick={() => removeLine(l.key)} className="text-enzo-muted hover:text-enzo-error">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
            <div className="mt-2 flex justify-between border-t hairline pt-3 text-base font-semibold">
              <span>{t("inStoreSale.total")}</span>
              <span>{formatPrice(total)}</span>
            </div>
          </div>
        )}

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-enzo-muted">{t("inStoreSale.customerName")}</label>
            <input className="input" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-enzo-muted">{t("inStoreSale.note")}</label>
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>

        {error && <p className="mt-4 text-sm text-enzo-error">{error}</p>}

        <button
          onClick={handleSubmit}
          disabled={lines.length === 0 || saving}
          className="mt-6 rounded-md bg-enzo-gradient px-6 py-3 font-semibold text-enzo-black disabled:opacity-40"
        >
          {t("inStoreSale.ringUp")}
        </button>
      </div>
    </AdminLayout>
  );
}
