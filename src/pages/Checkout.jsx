import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useCart } from "../context/CartContext.jsx";
import { useLanguage, useLocalizedField } from "../context/LanguageContext.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { api } from "../lib/api.js";

const initialForm = { fullName: "", email: "", phone: "", city: "", address: "", notes: "", paymentMethod: "cod" };

// CHECKPOINT NOTE (Checkout.jsx):
// - The request sent to the backend contains ONLY product ids, sizes, and
//   quantities -- never a price. POST /api/orders (server/src/routes/orders.js)
//   calls the place_order() Postgres function (supabase/migration_v3.sql),
//   which looks up real prices/stock itself. Even if someone edited this
//   page's JS in devtools to send a fake price, the backend would ignore
//   it entirely -- there's no price field for it to send.
// - Client-side validation here only improves UX (instant feedback); the
//   backend re-validates everything independently with zod
//   (server/src/utils/validation.js).
// - GUEST CHECKOUT IS STILL FULLY SUPPORTED. Logging in is optional: if a
//   session exists, the full name is prefilled and the order is linked to
//   that account (so it shows up on /account); if not, it's a normal
//   guest order.
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

  useEffect(() => {
    const name = session?.user?.user_metadata?.full_name;
    const email = session?.user?.email;
    if (name) setForm((f) => ({ ...f, fullName: f.fullName || name }));
    if (email) setForm((f) => ({ ...f, email: f.email || email }));
  }, [session]);

  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  function validate() {
    const errs = {};
    if (!form.fullName.trim()) errs.fullName = t("validation.required");
    if (form.email.trim() && !/^\S+@\S+\.\S+$/.test(form.email.trim())) errs.email = t("validation.invalidEmail");
    if (!form.phone.trim()) errs.phone = t("validation.required");
    else if (!/^[0-9+\-\s]{7,15}$/.test(form.phone.trim())) errs.phone = t("validation.invalidPhone");
    if (!form.city.trim()) errs.city = t("validation.required");
    if (!form.address.trim()) errs.address = t("validation.required");
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (items.length === 0) return;
    if (!validate()) return;

    setSubmitting(true);
    setSubmitError("");

    try {
      const result = await api.post("/orders", {
        fullName: form.fullName.trim(),
        email: form.email.trim() || null,
        phone: form.phone.trim(),
        city: form.city.trim(),
        address: form.address.trim(),
        notes: form.notes.trim() || null,
        paymentMethod: form.paymentMethod,
        locale: lang,
        items: items.map((item) => ({
          product_id: item.productId,
          size: item.size ?? null,
          quantity: item.quantity,
        })),
      });

      // Pass the items/total along to the confirmation page BEFORE
      // clearing the cart -- once cleared, this is the only place that
      // still has "what did I just order, what size, how many" in memory.
      // See OrderConfirmation.jsx, which reads this from location.state.
      const confirmedItems = items.map((item) => ({
        name: item.name,
        size: item.size,
        quantity: item.quantity,
        price: item.price,
      }));

      clearCart();
      navigate(`/order-confirmation/${result.orderNumber}`, {
        state: { items: confirmedItems, total: result.total },
      });
    } catch (err) {
      // place_order() raises clean messages like "Insufficient stock for
      // enzo-black-tee: only 1 left" -- safe to show directly.
      setSubmitError(err.message || tc("errors.network"));
    } finally {
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
          {["cod", "visa", "reflect"].map((method) => (
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

        {submitError && <p className="mt-4 text-sm text-enzo-error">{submitError}</p>}

        <button
          type="submit"
          disabled={submitting || items.length === 0}
          className="mt-8 w-full rounded-md bg-enzo-gradient py-3 font-semibold text-enzo-black disabled:opacity-40"
        >
          {t("placeOrder")}
        </button>
      </form>

      <div className="text-start">
        <h2 className="mb-4 font-display text-xl">{t("orderSummary")}</h2>
        <ul className="flex flex-col gap-3 border-b hairline pb-4">
          {items.map((item) => (
            <li key={item.key} className="flex justify-between text-sm">
              <span>
                {localize(item.name)} × {item.quantity}
                {item.size ? ` (${item.size})` : ""}
              </span>
              <span>{item.price * item.quantity}</span>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex justify-between font-semibold">
          <span>{t("total")}</span>
          <span>{subtotal}</span>
        </div>
        <p className="mt-2 text-xs text-enzo-muted">
          {lang === "ar"
            ? "السعر النهائي يُحتسب من الخادم عند تأكيد الطلب."
            : "Final price is recalculated by the server when you confirm."}
        </p>
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
