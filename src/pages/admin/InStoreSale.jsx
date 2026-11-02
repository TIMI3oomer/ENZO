import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Trash2, Printer, UserRound, Coins, Search, X } from "lucide-react";
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
// SELLER: who's at the till (عبدالله / عمير / another name). Remembered
// on this device, required before ringing up, saved on the order
// (orders.seller) and printed on the invoice. "Today" at the top totals
// today's in-store sales per seller.
//
// POINTS FOR WALK-INS: type the customer's phone and press Find. If an ENZO
// account uses that number (profile or an online order), its name, a
// partly hidden email and points show -- the seller checks the name with
// the customer, taps it, and the sale earns them points like an online
// order (server/src/routes/admin.js -> /customers/lookup, /in-store-sales).
// No account: they can sign up on the site (Google works) and add this
// phone under My account, then be found next time.
//
// INVOICE: ringing up opens the printable invoice (فاتورة) for that sale
// right away (components/Invoice.jsx); "Print invoice" reopens it.
// The two regular sellers; anyone else types their name under "Other".
const SELLERS = ["عبدالله", "عمير"];
const OTHER = "__other__";

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
  const [customerPhone, setCustomerPhone] = useState("");
  const [matches, setMatches] = useState(null); // null = not searched yet
  const [member, setMember] = useState(null); // the account the sale goes to
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(null);
  const [showInvoice, setShowInvoice] = useState(false);
  const [seller, setSeller] = useState(() => {
    try {
      return localStorage.getItem("enzo_till_seller") || "";
    } catch {
      return "";
    }
  });
  const [otherName, setOtherName] = useState(() => (SELLERS.includes(seller) || seller === OTHER ? "" : seller));
  const [summary, setSummary] = useState([]);

  const sellerName = SELLERS.includes(seller) ? seller : otherName.trim();

  function chooseSeller(value) {
    setSeller(value);
    try {
      localStorage.setItem("enzo_till_seller", value === OTHER ? otherName.trim() : value);
    } catch {
      /* private mode -- just not remembered */
    }
  }

  function loadSummary() {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    api
      .get(`/admin/in-store-sales/summary?since=${encodeURIComponent(start.toISOString())}`)
      .then((d) => setSummary(d || []))
      .catch(() => setSummary([]));
  }

  useEffect(loadSummary, []);

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
        onSale: Number(product.discount_percent) > 0, // sale items don't earn points
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
  // Same rule as online orders: 500 points per full 100 ILS, from 100 ILS,
  // counted only on items that aren't on sale.
  const fullPriceTotal = lines.filter((l) => !l.onSale).reduce((sum, l) => sum + l.price * l.quantity, 0);
  const pointsPreview = fullPriceTotal >= 100 ? Math.floor(fullPriceTotal / 100) * 500 : 0;

  async function findCustomer() {
    setLookupError("");
    setMember(null);
    setLookingUp(true);
    try {
      const found = await api.get(`/admin/customers/lookup?phone=${encodeURIComponent(customerPhone.trim())}`);
      setMatches(found);
      if (found.length === 1) setMember(found[0]);
    } catch (err) {
      setMatches(null);
      setLookupError(err.status === 400 ? t("inStoreSale.fullPhone") : err.message);
    } finally {
      setLookingUp(false);
    }
  }

  function clearCustomer() {
    setCustomerPhone("");
    setMatches(null);
    setMember(null);
    setLookupError("");
  }

  async function handleSubmit() {
    setError("");
    setSaving(true);
    try {
      const result = await api.post("/admin/in-store-sales", {
        seller: sellerName,
        customerName: customerName || undefined,
        customerUserId: member?.userId || undefined,
        customerPhone: member ? customerPhone.trim() : undefined,
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
      loadSummary();
      setLines([]);
      setCustomerName("");
      clearCustomer();
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
            <span>
              {t("inStoreSale.recorded", { orderNumber: done.orderNumber, total: formatPrice(done.total) })}
              {done.pointsEarned > 0 && (
                <span className="ms-2 font-semibold text-enzo-goldBright">
                  · {t("inStoreSale.pointsAdded", { points: done.pointsEarned.toLocaleString() })}
                </span>
              )}
            </span>
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

        {summary.length > 0 && (
          <div className="mb-6 rounded-lg border hairline p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-enzo-gold">{t("inStoreSale.today")}</p>
            <div className="flex flex-wrap gap-3">
              {summary.map((s) => (
                <div key={s.seller || "-"} className="rounded-md bg-enzo-panel px-3 py-2 text-sm">
                  <p className="font-semibold">{s.seller || t("inStoreSale.noSeller")}</p>
                  <p className="text-xs text-enzo-muted">
                    {t("inStoreSale.salesCount", { count: s.count })} · {formatPrice(s.total)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Seller */}
        <div className="mb-6">
          <label className="mb-2 flex items-center gap-2 text-sm font-medium text-enzo-muted">
            <UserRound size={16} />
            {t("inStoreSale.seller")}
          </label>
          <div className="flex flex-wrap gap-2">
            {[...SELLERS, OTHER].map((s) => {
              const active = s === OTHER ? !SELLERS.includes(seller) && seller !== "" : seller === s;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => chooseSeller(s)}
                  className={`rounded-md border px-4 py-2 text-sm font-semibold ${
                    active ? "border-enzo-goldBright bg-enzo-goldBright text-enzo-black" : "border-enzo-line text-enzo-white hover:border-enzo-white"
                  }`}
                >
                  {s === OTHER ? t("inStoreSale.otherSeller") : s}
                </button>
              );
            })}
          </div>
          {seller !== "" && !SELLERS.includes(seller) && (
            <input
              className="input mt-2 max-w-xs"
              value={otherName}
              onChange={(e) => {
                setOtherName(e.target.value);
                try {
                  localStorage.setItem("enzo_till_seller", e.target.value.trim() || OTHER);
                } catch {
                  /* ignore */
                }
              }}
              placeholder={t("inStoreSale.sellerName")}
              autoFocus
            />
          )}
        </div>

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

        {/* Points: find the customer's account by phone */}
        <div className="mt-6 rounded-lg border border-enzo-gold/30 bg-enzo-gold/5 p-4">
          <label className="mb-2 flex items-center gap-2 text-sm font-medium">
            <Coins size={16} className="text-enzo-goldBright" />
            {t("inStoreSale.pointsTitle")}
          </label>
          <div className="flex gap-2">
            <input
              className="input flex-1"
              dir="ltr"
              inputMode="tel"
              placeholder={t("inStoreSale.phonePlaceholder")}
              value={customerPhone}
              onChange={(e) => {
                setCustomerPhone(e.target.value);
                setMatches(null);
                setMember(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (customerPhone.trim()) findCustomer();
                }
              }}
            />
            <button
              type="button"
              onClick={findCustomer}
              disabled={!customerPhone.trim() || lookingUp}
              className="flex items-center gap-1.5 rounded-md border border-enzo-gold px-4 text-sm font-semibold text-enzo-goldBright disabled:opacity-40"
            >
              <Search size={15} />
              {t("inStoreSale.find")}
            </button>
            {(matches || member) && (
              <button type="button" onClick={clearCustomer} aria-label={t("inStoreSale.clearCustomer")} className="px-2 text-enzo-muted hover:text-enzo-white">
                <X size={18} />
              </button>
            )}
          </div>
          {lookupError && <p className="mt-2 text-sm text-enzo-error">{lookupError}</p>}

          {matches && matches.length === 0 && (
            <p className="mt-3 text-sm text-enzo-muted">{t("inStoreSale.noAccount")}</p>
          )}

          {matches && matches.length > 0 && (
            <div className="mt-3 flex flex-col gap-2">
              {matches.length > 1 && <p className="text-xs text-enzo-muted">{t("inStoreSale.pickAccount")}</p>}
              {matches.map((m) => (
                <button
                  key={m.userId}
                  type="button"
                  onClick={() => setMember(m)}
                  className={`flex items-center justify-between gap-3 rounded-md border px-3 py-2.5 text-start text-sm ${
                    member?.userId === m.userId ? "border-enzo-goldBright bg-enzo-gold/15" : "border-enzo-line"
                  }`}
                >
                  <span>
                    <span className="block font-semibold">{m.name || "—"}</span>
                    <span className="block text-xs text-enzo-muted" dir="ltr">{m.email}</span>
                  </span>
                  <span className="text-xs text-enzo-goldBright">{t("inStoreSale.hasPoints", { points: m.points.toLocaleString() })}</span>
                </button>
              ))}
              {member && (
                <p className="text-sm">
                  {pointsPreview > 0
                    ? t("inStoreSale.willEarn", { points: pointsPreview.toLocaleString(), name: member.name || "" })
                    : t("inStoreSale.under100")}
                  {lines.some((l) => l.onSale) && <span className="block text-xs text-enzo-muted">{t("inStoreSale.saleNoPoints")}</span>}
                </p>
              )}
              {member && <p className="text-xs text-enzo-muted">{t("inStoreSale.confirmName")}</p>}
            </div>
          )}
        </div>

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

        {!sellerName && lines.length > 0 && <p className="mt-4 text-sm text-enzo-goldBright">{t("inStoreSale.pickSeller")}</p>}
        {done && done.sellerSaved === false && (
          <p className="mt-4 text-sm text-enzo-error">{t("inStoreSale.sellerNotSaved")}</p>
        )}
        {error && <p className="mt-4 text-sm text-enzo-error">{error}</p>}

        <button
          onClick={handleSubmit}
          disabled={lines.length === 0 || saving || !sellerName}
          className="mt-6 rounded-md bg-enzo-gradient px-6 py-3 font-semibold text-enzo-black disabled:opacity-40"
        >
          {t("inStoreSale.ringUp")}
        </button>
      </div>
    </AdminLayout>
  );
}
