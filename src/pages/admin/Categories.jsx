import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { api } from "../../lib/api.js";
import { useLocalizedField } from "../../context/LanguageContext.jsx";
import AdminLayout from "../../components/AdminLayout.jsx";

const emptyForm = { slug: "", name_ar: "", name_en: "" };

// CHECKPOINT NOTE (admin/Categories.jsx):
// This is what lets the store owner name categories however they want —
// no more being limited to whatever was seeded by schema.sql. Add, rename
// (inline edit), or delete categories freely; Shop.jsx's category tabs
// and ProductForm.jsx's category dropdown both already read live from
// GET /api/categories, so changes made here show up everywhere
// immediately with no other code changes needed.
export default function AdminCategories() {
  const { t } = useTranslation("admin");
  const localize = useLocalizedField();

  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const data = await api.get("/categories").catch(() => []);
    setCategories(data || []);
    setLoading(false);
  }

  function startAdd() {
    setForm(emptyForm);
    setEditingId(null);
    setAdding(true);
    setError("");
  }

  function startEdit(cat) {
    setForm({ slug: cat.slug, name_ar: cat.name?.ar || "", name_en: cat.name?.en || "" });
    setEditingId(cat.id);
    setAdding(false);
    setError("");
  }

  function cancel() {
    setAdding(false);
    setEditingId(null);
    setForm(emptyForm);
    setError("");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    const payload = { slug: form.slug.trim(), name: { ar: form.name_ar, en: form.name_en } };
    try {
      if (editingId) await api.put(`/admin/categories/${editingId}`, payload);
      else await api.post("/admin/categories", payload);
      cancel();
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!confirm(t("categoriesPage.confirmDelete"))) return;
    await api.del(`/admin/categories/${id}`);
    load();
  }

  const showForm = adding || editingId;

  return (
    <AdminLayout title={t("categoriesPage.title")}>
      {!showForm && (
        <button
          onClick={startAdd}
          className="mb-4 flex items-center gap-2 rounded-md bg-enzo-gradient px-4 py-2 text-sm font-semibold text-enzo-black"
        >
          <Plus size={16} />
          {t("categoriesPage.add")}
        </button>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="mb-6 max-w-xl rounded-lg border hairline p-4 text-start">
          <div className="mb-3">
            <label className="mb-1 block text-sm text-enzo-muted">{t("categoriesPage.slug")}</label>
            <input className="input" dir="ltr" value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))} required />
          </div>
          <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm text-enzo-muted">{t("categoriesPage.nameAr")}</label>
              <input className="input" dir="rtl" value={form.name_ar} onChange={(e) => setForm((f) => ({ ...f, name_ar: e.target.value }))} required />
            </div>
            <div>
              <label className="mb-1 block text-sm text-enzo-muted">{t("categoriesPage.nameEn")}</label>
              <input className="input" dir="ltr" value={form.name_en} onChange={(e) => setForm((f) => ({ ...f, name_en: e.target.value }))} required />
            </div>
          </div>
          {error && <p className="mb-3 text-sm text-enzo-error">{error}</p>}
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-enzo-gradient px-5 py-2 text-sm font-semibold text-enzo-black disabled:opacity-40"
            >
              {t("categoriesPage.save")}
            </button>
            <button type="button" onClick={cancel} className="text-sm text-enzo-muted underline">
              {t("categoriesPage.cancel")}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-enzo-muted">…</p>
      ) : categories.length === 0 ? (
        <p className="text-enzo-muted">{t("categoriesPage.empty")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {categories.map((c) => (
            <li key={c.id} className="flex items-center justify-between rounded-md border hairline p-3 text-sm">
              <div>
                <p className="font-medium">{localize(c.name)}</p>
                <p className="text-xs text-enzo-muted" dir="ltr">
                  {c.slug}
                </p>
              </div>
              <div className="flex gap-3">
                <button onClick={() => startEdit(c)} className="text-enzo-gold hover:underline" aria-label={t("categoriesPage.edit")}>
                  <Pencil size={16} />
                </button>
                <button onClick={() => handleDelete(c.id)} className="text-enzo-error hover:underline" aria-label={t("categoriesPage.delete")}>
                  <Trash2 size={16} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </AdminLayout>
  );
}
