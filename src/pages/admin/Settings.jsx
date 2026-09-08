import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../lib/api.js";
import AdminLayout from "../../components/AdminLayout.jsx";

// CHECKPOINT NOTE (admin/Settings.jsx):
// Edits the single row in store_settings. The delivery fee set here is
// what place_order() reads server-side and adds to every new order's
// total automatically — changing it here takes effect immediately for
// any order placed after saving. Orders already placed keep whatever
// fee was in effect when they were created (it's copied onto the order
// row, not recalculated after the fact), so past orders never change
// retroactively just because you updated the fee.
export default function AdminSettings() {
  const { t } = useTranslation("admin");
  const [form, setForm] = useState({ delivery_fee: 0, currency_symbol: "₪" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get("/settings")
      .then(setForm)
      .finally(() => setLoading(false));
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      await api.put("/admin/settings", {
        delivery_fee: Number(form.delivery_fee) || 0,
        currency_symbol: form.currency_symbol,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminLayout title={t("nav.settings")}>
      {loading ? (
        <p className="text-enzo-muted">…</p>
      ) : (
        <form onSubmit={handleSubmit} className="max-w-sm text-start">
          <label className="mb-1 block text-sm text-enzo-muted">{t("settingsPage.deliveryFee")}</label>
          <input
            type="number"
            step="0.01"
            min="0"
            className="input mb-4"
            value={form.delivery_fee}
            onChange={(e) => setForm((f) => ({ ...f, delivery_fee: e.target.value }))}
          />

          <label className="mb-1 block text-sm text-enzo-muted">{t("settingsPage.currencySymbol")}</label>
          <input
            className="input mb-6"
            dir="ltr"
            value={form.currency_symbol}
            onChange={(e) => setForm((f) => ({ ...f, currency_symbol: e.target.value }))}
          />

          {error && <p className="mb-4 text-sm text-enzo-error">{error}</p>}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-enzo-gradient px-6 py-3 font-semibold text-enzo-black disabled:opacity-40"
            >
              {t("categoriesPage.save")}
            </button>
            {saved && <span className="text-sm text-enzo-goldBright">✓</span>}
          </div>
        </form>
      )}
    </AdminLayout>
  );
}
