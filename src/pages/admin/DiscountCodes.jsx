import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Shuffle, Copy, Trash2, Check } from "lucide-react";
import { api } from "../../lib/api.js";
import { formatPrice } from "../../lib/formatPrice.js";
import AdminLayout from "../../components/AdminLayout.jsx";

// CHECKPOINT NOTE (admin/DiscountCodes.jsx):
// Create discount codes customers type at checkout. A code is a percent or
// a fixed ILS amount off the items (never the delivery fee), with an
// optional minimum order, number of uses and expiry date. The database
// enforces all of it when an order is placed (place_order in
// migration_v16.sql); cancelling an order gives its use back.
const emptyForm = { code: "", kind: "percent", value: "", min_order: "", max_uses: "", expires_at: "" };

// Easy-to-read random code: no 0/O or 1/I lookalikes.
function randomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return "ENZO" + Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

export default function AdminDiscountCodes() {
  const { t } = useTranslation("admin");
  const [codes, setCodes] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(null);

  const load = () => api.get("/admin/discount-codes").then((d) => setCodes(d || [])).catch(() => {});
  useEffect(() => {
    load();
  }, []);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function handleCreate(e) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      await api.post("/admin/discount-codes", {
        code: form.code.trim(),
        kind: form.kind,
        value: Number(form.value),
        min_order: Number(form.min_order) || 0,
        max_uses: form.max_uses ? Number(form.max_uses) : null,
        expires_at: form.expires_at ? new Date(`${form.expires_at}T23:59:59`).toISOString() : null,
      });
      setForm(emptyForm);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggle(c) {
    await api.patch(`/admin/discount-codes/${c.id}`, { is_active: !c.is_active }).catch(() => {});
    load();
  }

  async function remove(c) {
    if (!confirm(t("codes.confirmDelete", { code: c.code }))) return;
    await api.del(`/admin/discount-codes/${c.id}`).catch(() => {});
    load();
  }

  function copy(code) {
    navigator.clipboard?.writeText(code);
    setCopied(code);
    setTimeout(() => setCopied(null), 1200);
  }

  const status = (c) => {
    if (!c.is_active) return ["off", "text-enzo-muted"];
    if (c.expires_at && new Date(c.expires_at) < new Date()) return ["expired", "text-enzo-error"];
    if (c.max_uses != null && c.used_count >= c.max_uses) return ["usedUp", "text-enzo-error"];
    return ["active", "text-enzo-goldBright"];
  };

  return (
    <AdminLayout title={t("codes.title")}>
      <form onSubmit={handleCreate} className="mb-10 max-w-3xl rounded-lg border hairline bg-enzo-panel p-5">
        <p className="mb-4 font-medium">{t("codes.new")}</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm text-enzo-muted">{t("codes.code")}</label>
            <div className="flex gap-2">
              <input
                className="input flex-1 uppercase tracking-wider"
                dir="ltr"
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, "") }))}
                placeholder="ENZO10"
                required
              />
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, code: randomCode() }))}
                className="flex items-center gap-2 rounded-md border hairline px-3 text-sm font-semibold hover:border-enzo-gold"
              >
                <Shuffle size={15} />
                {t("codes.generate")}
              </button>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm text-enzo-muted">{t("codes.value")}</label>
            <div className="flex gap-2">
              <input
                type="number"
                min="0.01"
                step="0.01"
                max={form.kind === "percent" ? 100 : undefined}
                className="input flex-1"
                value={form.value}
                onChange={set("value")}
                required
              />
              <div className="flex rounded-md border hairline p-0.5">
                {[
                  ["percent", "%"],
                  ["fixed", "₪"],
                ].map(([kind, label]) => (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, kind }))}
                    className={`w-10 rounded text-sm font-semibold ${form.kind === kind ? "bg-enzo-white text-enzo-black" : "text-enzo-muted"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm text-enzo-muted">{t("codes.minOrder")}</label>
            <input type="number" min="0" step="1" className="input" value={form.min_order} onChange={set("min_order")} placeholder="0" />
          </div>
          <div>
            <label className="mb-1 block text-sm text-enzo-muted">{t("codes.maxUses")}</label>
            <input type="number" min="1" step="1" className="input" value={form.max_uses} onChange={set("max_uses")} placeholder="∞" />
          </div>
          <div>
            <label className="mb-1 block text-sm text-enzo-muted">{t("codes.expires")}</label>
            <input type="date" className="input" value={form.expires_at} onChange={set("expires_at")} />
          </div>
        </div>

        {error && <p className="mt-3 text-sm text-enzo-error">{error}</p>}
        <button
          type="submit"
          disabled={saving}
          className="mt-5 rounded-md bg-enzo-gradient px-6 py-2.5 font-semibold text-enzo-black disabled:opacity-40"
        >
          {t("codes.create")}
        </button>
      </form>

      {codes.length === 0 ? (
        <p className="text-enzo-muted">{t("codes.none")}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border hairline">
          <table className="w-full text-sm">
            <thead className="bg-enzo-panel text-enzo-muted">
              <tr>
                <th className="px-4 py-3 text-start">{t("codes.code")}</th>
                <th className="px-4 py-3 text-start">{t("codes.value")}</th>
                <th className="px-4 py-3 text-start">{t("codes.minOrder")}</th>
                <th className="px-4 py-3 text-start">{t("codes.used")}</th>
                <th className="px-4 py-3 text-start">{t("codes.expires")}</th>
                <th className="px-4 py-3 text-start">{t("codes.status")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {codes.map((c) => {
                const [st, color] = status(c);
                return (
                  <tr key={c.id} className="border-t hairline">
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => copy(c.code)}
                        className="flex items-center gap-2 font-semibold tracking-wider"
                        dir="ltr"
                        title={t("codes.copy")}
                      >
                        {c.code}
                        {copied === c.code ? <Check size={14} className="text-enzo-goldBright" /> : <Copy size={14} className="text-enzo-muted" />}
                      </button>
                    </td>
                    <td className="px-4 py-3">{c.kind === "percent" ? `${Number(c.value)}%` : formatPrice(c.value)}</td>
                    <td className="px-4 py-3">{Number(c.min_order) > 0 ? formatPrice(c.min_order) : "—"}</td>
                    <td className="px-4 py-3">
                      {c.used_count}
                      {c.max_uses != null && ` / ${c.max_uses}`}
                    </td>
                    <td className="px-4 py-3">{c.expires_at ? new Date(c.expires_at).toLocaleDateString() : "—"}</td>
                    <td className={`px-4 py-3 font-semibold ${color}`}>{t(`codes.status_${st}`)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-3">
                        <button type="button" onClick={() => toggle(c)} className="text-enzo-gold hover:underline">
                          {c.is_active ? t("codes.disable") : t("codes.enable")}
                        </button>
                        <button type="button" onClick={() => remove(c)} className="text-enzo-muted hover:text-enzo-error" aria-label={t("codes.delete")}>
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </AdminLayout>
  );
}
