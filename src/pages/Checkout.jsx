import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronDown } from "lucide-react";
import { useCart } from "../context/CartContext.jsx";
import { useLanguage, useLocalizedField } from "../context/LanguageContext.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { formatPrice } from "../lib/formatPrice.js";
import { api } from "../lib/api.js";
import { DELIVERY_REGIONS, getDeliveryRegion } from "../lib/delivery.js";
import { usePaymentConfig } from "../lib/usePaymentConfig.js";

const initialForm = {
  fullName: "",
  email: "",
  phone: "",
  deliveryRegion: "",
  city: "",
  address: "",
  notes: "",
  paymentMethod: "cod",
};

// CHECKPOINT NOTE (Checkout.jsx):
// - The request sent to the backend contains ONLY product ids, sizes, and
//   quantities -- never a price. All money math happens server-side.
// - DELIVERY FEE: the customer picks a region (الضفة 20 / القدس 30 /
//   الداخل 70 ILS) from the dropdown. Only the region NAME is sent -- the
//   fee shown here comes from src/lib/delivery.js for display, but the
//   amount actually charged is computed by the database
//   (delivery_fee_for_region in schema.sql). Total = subtotal + fee.
// - PAYMENT SPLIT: "cod" and "reflect" go straight to POST /api/orders
//   and create the order immediately, same as before. "visa" (card) is
//   different -- it calls POST /api/orders/stripe-session instead, which
//   returns a Stripe-hosted checkout URL to redirect to. The order itself
//   isn't created until Stripe confirms the payment (via a webhook), so
//   the cart is intentionally NOT cleared here for the card path -- see
//   PaymentSuccess.jsx, which clears it once the order is confirmed.
// - GUEST CHECKOUT IS STILL FULLY SUPPORTED for all three payment methods.
export default function Checkout() {
  const { t } = useTranslation("checkout");
  const { t: tc } = useTranslation("common");
  const { items, subtotal, clearCart } = useCart();
  const { lang } = useLanguage();
  const { session } = useAuth();
  const localize = useLocalizedField();
  const navigate = useNavigate();

  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  // Only offer payment methods the backend says are actually available
  // (card is hidden unless a card provider is configured, Reflect unless
  // its transfer details are set). See server/src/lib/payments.js.
  const payments = usePaymentConfig();
  const availableMethods = ["cod", payments.card && "visa", payments.reflect?.enabled && "reflect"].filter(Boolean);

  useEffect(() => {
    if (!availableMethods.includes(form.paymentMethod)) {
      setForm((f) => ({ ...f, paymentMethod: "cod" }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payments]);

  useEffect(() => {
    const name = session?.user?.user_metadata?.full_name;
    const email = session?.user?.email;
    if (name) setForm((f) => ({ ...f, fullName: f.fullName || name }));
    if (email) setForm((f) => ({ ...f, email: f.email || email }));
  }, [session]);

  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const region = getDeliveryRegion(form.deliveryRegion);
  const deliveryFee = region?.fee ?? 0;
  const total = subtotal + deliveryFee;

  function validate() {
    const errs = {};
    if (!form.fullName.trim()) errs.fullName = t("validation.required");
    if (form.email.trim() && !/^\S+@\S+\.\S+$/.test(form.email.trim())) errs.email = t("validation.invalidEmail");
    if (!form.phone.trim()) errs.phone = t("validation.required");
    else if (!/^[0-9+\-\s]{7,15}$/.test(form.phone.trim())) errs.phone = t("validation.invalidPhone");
    if (!region) errs.deliveryRegion = t("validation.chooseRegion");
    if (!form.city.trim()) errs.city = t("validation.required");
    if (!form.address.trim()) errs.address = t("validation.required");
    // Card payments need an email so the customer has a way to see their
    // receipt/confirmation even without an account -- cod/reflect don't
    // strictly need one since they're arranged in person or manually.
    if (form.paymentMethod === "visa" && !form.email.trim()) errs.email = t("validation.required");
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (items.length === 0) return;
    if (!validate()) return;

    setSubmitting(true);
    setSubmitError("");

    const orderPayload = {
      fullName: form.fullName.trim(),
      email: form.email.trim() || null,
      phone: form.phone.trim(),
      city: form.city.trim(),
      address: form.address.trim(),
      notes: form.notes.trim() || null,
      paymentMethod: form.paymentMethod,
      deliveryRegion: form.deliveryRegion,
      locale: lang,
      items: items.map((item) => ({
        product_id: item.productId,
        size: item.size ?? null,
        color: item.color ?? null,
        quantity: item.quantity,
      })),
    };

    try {
      if (form.paymentMethod === "visa") {
        // Card payment: redirect to Stripe's hosted checkout page. The
        // order is created by the webhook only once payment succeeds --
        // see server/src/routes/webhooks.js. Cart stays intact until then
        // (in case the customer backs out of the Stripe page).
        const { url } = await api.post("/orders/stripe-session", orderPayload);
        window.location.href = url;
        return; // leaving the page now, no need to setSubmitting(false)
      }

      const result = await api.post("/orders", orderPayload);

      // Pass the items/total along to the confirmation page BEFORE
      // clearing the cart -- once cleared, this is the only place that
      // still has "what did I just order, what size, how many" in memory.
      const confirmedItems = items.map((item) => ({
        name: item.name,
        size: item.size,
        color: item.color,
        quantity: item.quantity,
        price: item.price,
      }));

      clearCart();
      navigate(`/order-confirmation/${result.orderNumber}`, {
        state: {
          items: confirmedItems,
          subtotal,
          deliveryFee: result.deliveryFee,
          total: result.total,
          paymentMethod: form.paymentMethod,
        },
      });
    } catch (err) {
      // place_order() raises clean messages like "Insufficient stock for
      // enzo-black-tee: only 1 left" -- safe to show directly.
      setSubmitError(err.message || tc("errors.network"));
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto grid max-w-5xl grid-cols-1 gap-10 px-4 py-10 sm:px-6 md:grid-cols-2">
      <form onSubmit={handleSubmit} className="text-start">
        <h1 className="mb-2 font-display text-2xl">{t("title")}</h1>

        {!session && (
          <p className="mb-6 text-sm text-enzo-muted">
            <Link to="/login" state={{ from: "/checkout" }} className="text-enzo-white underline">
              {tc("auth.signIn")}
            </Link>{" "}
            {tc("auth.orContinueAsGuest")}
          </p>
        )}

        <Field label={t("fullName")} error={errors.fullName}>
          <input value={form.fullName} onChange={update("fullName")} className="input" />
        </Field>
        <Field label={t("email")} error={errors.email}>
          <input
            type="email"
            value={form.email}
            onChange={update("email")}
            className="input"
            dir="ltr"
            placeholder={t("emailPlaceholder")}
          />
        </Field>
        <Field label={t("phone")} error={errors.phone}>
          <input value={form.phone} onChange={update("phone")} className="input" dir="ltr" />
        </Field>
        <Field label={t("deliveryRegion")} error={errors.deliveryRegion}>
          <div className="relative">
            <select
              value={form.deliveryRegion}
              onChange={update("deliveryRegion")}
              className="input appearance-none pe-10"
            >
              <option value="" disabled>
                {t("chooseRegion")}
              </option>
              {DELIVERY_REGIONS.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label[lang] || r.label.ar} — {formatPrice(r.fee)}
                </option>
              ))}
            </select>
            <ChevronDown
              size={16}
              className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-enzo-muted"
            />
          </div>
        </Field>
        <Field label={t("city")} error={errors.city}>
          <input value={form.city} onChange={update("city")} className="input" />
        </Field>
        <Field label={t("address")} error={errors.address}>
          <input value={form.address} onChange={update("address")} className="input" />
        </Field>
        <Field label={t("notes")}>
          <textarea value={form.notes} onChange={update("notes")} className="input" rows={3} />
        </Field>

        <p className="mb-2 mt-4 text-sm font-medium">{t("paymentMethod")}</p>
        <div className="flex flex-col gap-2">
          {availableMethods.map((method) => (
            <label key={method} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="paymentMethod"
                checked={form.paymentMethod === method}
                onChange={() => setForm((f) => ({ ...f, paymentMethod: method }))}
              />
              {t(method)}
            </label>
          ))}
        </div>
        {form.paymentMethod === "reflect" && (
          <p className="mt-2 text-xs text-enzo-muted">{t("reflectCheckoutHint")}</p>
        )}

        {submitError && <p className="mt-4 text-sm text-enzo-error">{submitError}</p>}

        <button
          type="submit"
          disabled={submitting || items.length === 0}
          className="mt-8 w-full rounded-md bg-enzo-gradient py-3 font-semibold text-enzo-black disabled:opacity-40"
        >
          {form.paymentMethod === "visa" ? t("continueToPay") : t("placeOrder")}
        </button>
      </form>

      <div className="text-start">
        <h2 className="mb-4 font-display text-xl">{t("orderSummary")}</h2>
        <ul className="flex flex-col gap-3 border-b hairline pb-4">
          {items.map((item) => (
            <li key={item.key} className="flex justify-between text-sm">
              <span>
                {localize(item.name)} × {item.quantity}
                {[item.color, item.size].filter(Boolean).map((v) => ` (${v})`).join("")}
              </span>
              <span>{formatPrice(item.price * item.quantity)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex flex-col gap-2">
          <div className="flex justify-between text-sm">
            <span className="text-enzo-muted">{t("subtotal")}</span>
            <span>{formatPrice(subtotal)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-enzo-muted">
              {t("delivery")}
              {region && ` (${region.label[lang] || region.label.ar})`}
            </span>
            <span>{region ? formatPrice(deliveryFee) : "—"}</span>
          </div>
          <div className="mt-2 flex justify-between border-t hairline pt-3 text-lg font-semibold">
            <span>{t("total")}</span>
            <span>{formatPrice(total)}</span>
          </div>
        </div>
        {!region && <p className="mt-2 text-xs text-enzo-muted">{t("chooseRegionHint")}</p>}
      </div>
    </div>
  );
}

function Field({ label, error, children }) {
  return (
    <div className="mb-4">
      <label className="mb-1 block text-sm font-medium">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs text-enzo-error">{error}</p>}
    </div>
  );
}
