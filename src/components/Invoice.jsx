import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Printer, X } from "lucide-react";
import { useContent } from "../hooks/useContent.js";
import { useLocalizedField } from "../context/LanguageContext.jsx";
import { formatPrice } from "../lib/formatPrice.js";

// CHECKPOINT NOTE (components/Invoice.jsx):
// Printable invoice (فاتورة) for an order -- shown right after an in-store
// sale (admin/InStoreSale.jsx) and from any order in admin/Orders.jsx.
// Store name/phone/address/Instagram and the closing note come from the
// CMS (site.store.*). Printing uses the browser's print dialog: the
// `.invoice-print` rules in index.css hide everything else on the page,
// and the receipt is narrow enough for an 80mm receipt printer while
// still looking right on A4.
export default function InvoiceModal({ order, items, onClose }) {
  const { t } = useTranslation("admin");
  const store = useContent("site").store || {};

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/70 p-4 sm:items-center">
      <div className="w-full max-w-sm">
        <div className="mb-3 flex items-center justify-between gap-2 print:hidden">
          <button
            type="button"
            onClick={() => window.print()}
            className="flex items-center gap-2 rounded-md bg-enzo-gradient px-5 py-2.5 text-sm font-semibold text-enzo-black"
          >
            <Printer size={16} />
            {t("invoice.print")}
          </button>
          <button type="button" onClick={onClose} aria-label="close" className="rounded-md p-2 text-enzo-white hover:bg-white/10">
            <X size={20} />
          </button>
        </div>
        <Receipt order={order} items={items} store={store} />
      </div>
    </div>,
    document.body
  );
}

function Receipt({ order, items, store }) {
  const { t } = useTranslation("admin");
  const localize = useLocalizedField();
  const date = new Date(order.created_at);
  const delivery = Number(order.delivery_fee) || 0;
  const codeDiscount = Number(order.code_discount) || 0;
  const pointsDiscount = Number(order.points_discount) || 0;
  const row = "flex justify-between gap-3";

  return (
    <div className="invoice-print rounded-md bg-white p-6 font-sans text-[13px] leading-snug text-black">
      <div className="text-center">
        <img src="/logo.jpg" alt="" className="mx-auto mb-2 h-14 w-14 rounded-full" />
        <p className="text-lg font-bold tracking-[0.2em]">{store.name || "ENZO"}</p>
        {store.address && <p>{store.address}</p>}
        {store.phone && <p dir="ltr">{store.phone}</p>}
        {store.instagram && <p dir="ltr">@{store.instagram.replace(/^@/, "")}</p>}
      </div>

      <div className="my-4 border-y border-dashed border-black py-3">
        <p className="mb-1 text-center text-base font-bold">{t("invoice.title")}</p>
        <div className={row}>
          <span>{t("invoice.number")}</span>
          <span className="font-semibold">#{order.order_number}</span>
        </div>
        <div className={row}>
          <span>{t("invoice.date")}</span>
          <span dir="ltr">
            {date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
        {order.customer_name && (
          <div className={row}>
            <span>{t("invoice.customer")}</span>
            <span>{order.customer_name}</span>
          </div>
        )}
        {order.phone && order.channel !== "in_store" && (
          <div className={row}>
            <span>{t("invoice.phone")}</span>
            <span dir="ltr">{order.phone}</span>
          </div>
        )}
        {order.seller && (
          <div className={row}>
            <span>{t("invoice.seller")}</span>
            <span>{order.seller}</span>
          </div>
        )}
        <div className={row}>
          <span>{t("invoice.channel")}</span>
          <span>{order.channel === "in_store" ? t("invoice.inStore") : t("invoice.online")}</span>
        </div>
      </div>

      <table className="w-full">
        <thead>
          <tr className="border-b border-black text-start">
            <th className="pb-1 text-start font-semibold">{t("invoice.item")}</th>
            <th className="pb-1 text-center font-semibold">{t("invoice.qty")}</th>
            <th className="pb-1 text-end font-semibold">{t("invoice.amount")}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="align-top">
              <td className="py-1.5">
                {localize(item.product_name)}
                {(item.color || item.size) && (
                  <span className="block text-[11px] text-neutral-600">
                    {[item.color, item.size].filter(Boolean).join(" / ")} · {formatPrice(item.unit_price)}
                  </span>
                )}
              </td>
              <td className="py-1.5 text-center">{item.quantity}</td>
              <td className="py-1.5 text-end">{formatPrice(item.unit_price * item.quantity)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-3 flex flex-col gap-1 border-t border-black pt-2">
        {(delivery > 0 || codeDiscount > 0 || pointsDiscount > 0) && (
          <div className={row}>
            <span>{t("invoice.subtotal")}</span>
            <span>{formatPrice(order.subtotal)}</span>
          </div>
        )}
        {codeDiscount > 0 && (
          <div className={row}>
            <span>
              {t("invoice.codeDiscount")} ({order.discount_code})
            </span>
            <span>-{formatPrice(codeDiscount)}</span>
          </div>
        )}
        {pointsDiscount > 0 && (
          <div className={row}>
            <span>{t("invoice.pointsDiscount", { points: order.points_redeemed })}</span>
            <span>-{formatPrice(pointsDiscount)}</span>
          </div>
        )}
        {delivery > 0 && (
          <div className={row}>
            <span>{t("invoice.delivery")}</span>
            <span>{formatPrice(delivery)}</span>
          </div>
        )}
        <div className={`${row} text-base font-bold`}>
          <span>{t("invoice.total")}</span>
          <span>{formatPrice(order.total)}</span>
        </div>
        <div className={row}>
          <span>{t("invoice.payment")}</span>
          <span>
            {t(`invoice.method_${order.payment_method}`, order.payment_method)}
            {order.payment_status === "paid" && order.payment_method !== "in_store" && ` · ${t("orders.paid")}`}
          </span>
        </div>
      </div>

      {order.points_earned > 0 && (
        <p className="mt-3 text-center text-[12px] font-semibold">{t("invoice.pointsEarned", { points: order.points_earned })}</p>
      )}

      {order.notes && <p className="mt-3 text-[12px]">{order.notes}</p>}

      {/* Store policy -- printed on the invoice only, never shown on the site.
          Typing "-" in the CMS hides it (an empty field means "use the default"). */}
      {store.invoicePolicy && store.invoicePolicy.trim() !== "-" && (
        <p className="mt-5 border-y border-black py-2 text-center text-[12px] font-bold">{store.invoicePolicy}</p>
      )}

      <p className="mt-4 border-t border-dashed border-black pt-3 text-center text-[12px]">
        {store.invoiceNote || t("invoice.thanks")}
      </p>
    </div>
  );
}
