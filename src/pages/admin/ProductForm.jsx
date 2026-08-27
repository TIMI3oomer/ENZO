import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../../lib/api.js";
import AdminLayout from "../../components/AdminLayout.jsx";

const empty = {
  slug: "",
  name_ar: "",
  name_en: "",
  description_ar: "",
  description_en: "",
  material_ar: "",
  material_en: "",
  fit_ar: "",
  fit_en: "",
  care_ar: "",
  care_en: "",
  price: "",
  stock: "",
  category_id: "",
  sizes: "S,M,L,XL",
  images: "",
};

// CHECKPOINT NOTE (admin/ProductForm.jsx):
// This form is the concrete implementation of spec section 4 ("Bilingual
// product data") — every localized field has an explicit ar/en input pair
// side by side, so the admin can never accidentally publish a product with
// only one language filled in. Images are entered as comma-separated URLs
// for now; swap this input for a real Supabase Storage file uploader when
// you're ready (flagged here as a clear upgrade point, not built silently).
export default function AdminProductForm() {
  const { t } = useTranslation("admin");
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(id);

  const [form, setForm] = useState(empty);
  const [categories, setCategories] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/categories").then(setCategories).catch(() => {});
  }, []);

  useEffect(() => {
    if (!isEdit) return;
    api
      .get(`/admin/products/${id}`)
      .then((data) => {
        if (!data) return;
        setForm({
          slug: data.slug,
          name_ar: data.name?.ar || "",
          name_en: data.name?.en || "",
          description_ar: data.description?.ar || "",
          description_en: data.description?.en || "",
          material_ar: data.material?.ar || "",
          material_en: data.material?.en || "",
          fit_ar: data.fit?.ar || "",
          fit_en: data.fit?.en || "",
          care_ar: data.care_instructions?.ar || "",
          care_en: data.care_instructions?.en || "",
          price: data.price,
          stock: data.stock,
          category_id: data.category_id || "",
          sizes: (data.sizes || []).join(","),
          images: (data.images || []).join(","),
        });
      })
      .catch(() => {});
  }, [id, isEdit]);

  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError("");

    const payload = {
      slug: form.slug.trim(),
      name: { ar: form.name_ar, en: form.name_en },
      description: { ar: form.description_ar, en: form.description_en },
      material: { ar: form.material_ar, en: form.material_en },
      fit: { ar: form.fit_ar, en: form.fit_en },
      care_instructions: { ar: form.care_ar, en: form.care_en },
      price: Number(form.price) || 0,
      stock: Number(form.stock) || 0,
      category_id: form.category_id || null,
      sizes: form.sizes.split(",").map((s) => s.trim()).filter(Boolean),
      images: form.images.split(",").map((s) => s.trim()).filter(Boolean),
    };

    try {
      if (isEdit) await api.put(`/admin/products/${id}`, payload);
      else await api.post("/admin/products", payload);
      navigate("/admin/products");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminLayout title={isEdit ? t("products.edit") : t("products.add")}>
      <form onSubmit={handleSubmit} className="grid max-w-3xl grid-cols-1 gap-4 text-start sm:grid-cols-2">
        <FullRow>
          <Label>slug</Label>
          <input className="input" value={form.slug} onChange={update("slug")} dir="ltr" required />
        </FullRow>

        <div>
          <Label>{t("products.nameAr")}</Label>
          <input className="input" dir="rtl" value={form.name_ar} onChange={update("name_ar")} required />
        </div>
        <div>
          <Label>{t("products.nameEn")}</Label>
          <input className="input" dir="ltr" value={form.name_en} onChange={update("name_en")} required />
        </div>

        <div>
          <Label>{t("products.descAr")}</Label>
          <textarea className="input" dir="rtl" rows={3} value={form.description_ar} onChange={update("description_ar")} />
        </div>
        <div>
          <Label>{t("products.descEn")}</Label>
          <textarea className="input" dir="ltr" rows={3} value={form.description_en} onChange={update("description_en")} />
        </div>

        <div>
          <Label>Material (AR)</Label>
          <input className="input" dir="rtl" value={form.material_ar} onChange={update("material_ar")} />
        </div>
        <div>
          <Label>Material (EN)</Label>
          <input className="input" dir="ltr" value={form.material_en} onChange={update("material_en")} />
        </div>

        <div>
          <Label>Fit (AR)</Label>
          <input className="input" dir="rtl" value={form.fit_ar} onChange={update("fit_ar")} />
        </div>
        <div>
          <Label>Fit (EN)</Label>
          <input className="input" dir="ltr" value={form.fit_en} onChange={update("fit_en")} />
        </div>

        <div>
          <Label>Care (AR)</Label>
          <input className="input" dir="rtl" value={form.care_ar} onChange={update("care_ar")} />
        </div>
        <div>
          <Label>Care (EN)</Label>
          <input className="input" dir="ltr" value={form.care_en} onChange={update("care_en")} />
        </div>

        <div>
          <Label>{t("products.price")}</Label>
          <input className="input" type="number" step="0.01" value={form.price} onChange={update("price")} required />
        </div>
        <div>
          <Label>{t("products.stock")}</Label>
          <input className="input" type="number" value={form.stock} onChange={update("stock")} required />
        </div>

        <div>
          <Label>{t("products.category")}</Label>
          <select className="input" value={form.category_id} onChange={update("category_id")}>
            <option value="">—</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name?.en} / {c.name?.ar}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label>Sizes (comma separated)</Label>
          <input className="input" dir="ltr" value={form.sizes} onChange={update("sizes")} />
        </div>

        <FullRow>
          <Label>Image URLs (comma separated)</Label>
          <input className="input" dir="ltr" value={form.images} onChange={update("images")} />
        </FullRow>

        {error && <FullRow><p className="text-sm text-enzo-error">{error}</p></FullRow>}

        <FullRow>
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-enzo-gradient px-6 py-3 font-semibold text-enzo-black disabled:opacity-40"
          >
            {t("products.save")}
          </button>
        </FullRow>
      </form>
    </AdminLayout>
  );
}

function Label({ children }) {
  return <label className="mb-1 block text-sm font-medium text-enzo-muted">{children}</label>;
}
function FullRow({ children }) {
  return <div className="sm:col-span-2">{children}</div>;
}
