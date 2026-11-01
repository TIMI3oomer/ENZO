import { Fragment, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { X, Upload, ChevronDown } from "lucide-react";
import { api } from "../../lib/api.js";
import { uploadProductImage } from "../../lib/upload.js";
import { PRESET_COLORS, COLOR_HEX } from "../../lib/colors.js";
import { variantKey } from "../../lib/variantStock.js";
import AdminLayout from "../../components/AdminLayout.jsx";

const ALL_SIZES = ["XS", "S", "M", "L", "XL", "XXL", "XXXL"];

// Every field is optional -- a blank slug is filled in from the name
// (English, falling back to Arabic) instead of blocking the save.
function generateSlug(base) {
  const cleaned = (base || "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const suffix = Math.random().toString(36).slice(2, 8);
  return cleaned ? `${cleaned}-${suffix}` : `product-${suffix}`;
}

// Drops every variant_stock entry whose key matches `shouldRemove` --
// used when a size/color is deselected so stale grid cells can't linger.
function pruneVariantStock(variantStock, shouldRemove) {
  return Object.fromEntries(Object.entries(variantStock).filter(([key]) => !shouldRemove(key)));
}

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
  price: "",
  stock: "",
  category_id: "",
  sizes: [],
  colors: [],
  color_images: {},
  images: [],
  sold_out_sizes: [],
  sold_out_colors: [],
  discount_percent: "",
  variant_stock: {},
};

// CHECKPOINT NOTE (admin/ProductForm.jsx):
// Rebuilt per your request for an easier product-adding experience:
// - Sizes and colors are now click-to-toggle menus (ALL_SIZES /
//   PRESET_COLORS above), not comma-separated text you had to type
//   correctly. Both are stored as plain string arrays on the product
//   (e.g. sizes: ["S","M","L"], colors: ["Black","Gold"]) -- add more
//   options to either constant if you need sizes/colors not listed here.
// - Images are uploaded straight from your device/gallery via
//   src/lib/upload.js (Supabase Storage), not pasted as URLs. Multiple
//   files can be selected at once; each shows a thumbnail with a remove
//   (x) button. Requires the "product-images" Storage bucket, created
//   automatically by schema.sql / migration_v6.sql.
// - English translations are now collapsed behind one "Add English"
//   toggle instead of a field-for-field EN twin next to every Arabic
//   field -- Arabic is this store's primary language, English is a nice-
//   to-have, so the form now looks like that by default. Auto-expands
//   when editing a product that already has English text, so existing
//   translations are never hidden from view by surprise.
// - Care instructions are no longer a per-product field at all -- it's
//   one static, store-wide text now (see src/lib/contentManifest.js,
//   editable from /admin/content), since it's realistically the same
//   wording for every garment. One less thing to fill in per product.
// - Stock: when a product has BOTH sizes and colors selected, a per-
//   combo grid replaces the single stock number (a grey shirt might have
//   10 in S while the same shirt in blue only has 5 in S) -- see
//   src/lib/variantStock.js. The product's plain aggregate `stock` is
//   computed automatically as the sum of the grid so every OTHER screen
//   that already reads product.stock (ProductCard's "out of stock"
//   ribbon, Cart.jsx) keeps working unchanged. A product with only sizes,
//   only colors, or neither keeps the simple single stock field.
export default function AdminProductForm() {
  const { t } = useTranslation("admin");
  const { t: tc } = useTranslation("common");
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(id);

  const [form, setForm] = useState(empty);
  const [categories, setCategories] = useState([]);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [showEnglish, setShowEnglish] = useState(false);

  useEffect(() => {
    api.get("/categories").then(setCategories).catch(() => {});
  }, []);

  useEffect(() => {
    if (!isEdit) return;
    api
      .get(`/admin/products/${id}`)
      .then((data) => {
        if (!data) return;
        const name_en = data.name?.en || "";
        const description_en = data.description?.en || "";
        const material_en = data.material?.en || "";
        const fit_en = data.fit?.en || "";
        setForm({
          slug: data.slug,
          name_ar: data.name?.ar || "",
          name_en,
          description_ar: data.description?.ar || "",
          description_en,
          material_ar: data.material?.ar || "",
          material_en,
          fit_ar: data.fit?.ar || "",
          fit_en,
          price: data.price,
          stock: data.stock,
          category_id: data.category_id || "",
          sizes: data.sizes || [],
          colors: data.colors || [],
          color_images: data.color_images || {},
          images: data.images || [],
          sold_out_sizes: data.sold_out_sizes || [],
          sold_out_colors: data.sold_out_colors || [],
          discount_percent: data.discount_percent || "",
          variant_stock: data.variant_stock || {},
        });
        // Don't hide English content the product already has.
        if (name_en || description_en || material_en || fit_en) setShowEnglish(true);
      })
      .catch(() => {});
  }, [id, isEdit]);

  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  function toggleInArray(key, value) {
    setForm((f) => ({
      ...f,
      [key]: f[key].includes(value) ? f[key].filter((v) => v !== value) : [...f[key], value],
    }));
  }

  // Deselecting a size/color it's offered in no longer makes sense as
  // "sold out" either, and any stock-grid cells for it are meaningless --
  // keep both in sync so they can't silently reference an option the
  // product doesn't even have anymore.
  function toggleSize(size) {
    setForm((f) => {
      const nowOffered = !f.sizes.includes(size);
      return {
        ...f,
        sizes: nowOffered ? [...f.sizes, size] : f.sizes.filter((s) => s !== size),
        sold_out_sizes: nowOffered ? f.sold_out_sizes : f.sold_out_sizes.filter((s) => s !== size),
        variant_stock: nowOffered
          ? f.variant_stock
          : pruneVariantStock(f.variant_stock, (key) => key.endsWith(`__${size}`)),
      };
    });
  }
  function toggleColor(color) {
    setForm((f) => {
      const nowOffered = !f.colors.includes(color);
      return {
        ...f,
        colors: nowOffered ? [...f.colors, color] : f.colors.filter((c) => c !== color),
        sold_out_colors: nowOffered ? f.sold_out_colors : f.sold_out_colors.filter((c) => c !== color),
        variant_stock: nowOffered
          ? f.variant_stock
          : pruneVariantStock(f.variant_stock, (key) => key.startsWith(`${color}__`)),
      };
    });
  }

  function setVariantStock(color, size, rawValue) {
    const qty = Math.max(0, Number(rawValue) || 0);
    setForm((f) => ({ ...f, variant_stock: { ...f.variant_stock, [variantKey(color, size)]: qty } }));
  }

  async function handleFilesSelected(e) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setUploading(true);
    setError("");

    // Promise.allSettled (not Promise.all): one rejected file — e.g. a
    // fake/oversized upload rejected by src/lib/upload.js's checks —
    // should not also block the OTHER, valid files in the same batch
    // from uploading successfully.
    const results = await Promise.allSettled(files.map(uploadProductImage));
    const urls = results.filter((r) => r.status === "fulfilled").map((r) => r.value);
    const failures = results.filter((r) => r.status === "rejected").map((r) => r.reason.message);

    if (urls.length > 0) setForm((f) => ({ ...f, images: [...f.images, ...urls] }));
    if (failures.length > 0) setError(failures.join(" "));

    setUploading(false);
    e.target.value = ""; // allow re-selecting the same file later
  }

  function removeImage(url) {
    setForm((f) => ({ ...f, images: f.images.filter((i) => i !== url) }));
  }

  const hasVariantGrid = form.sizes.length > 0 && form.colors.length > 0;

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    setSaving(true);

    // With a size x color grid, the aggregate stock other screens read
    // (ProductCard's "out of stock" ribbon, Cart.jsx) is just the sum of
    // every cell -- never hand-entered directly in that mode.
    const variantStockTotal = Object.values(form.variant_stock).reduce((sum, n) => sum + (Number(n) || 0), 0);

    const payload = {
      slug: form.slug.trim() || generateSlug(form.name_en || form.name_ar),
      name: { ar: form.name_ar, en: form.name_en },
      description: { ar: form.description_ar, en: form.description_en },
      material: { ar: form.material_ar, en: form.material_en },
      fit: { ar: form.fit_ar, en: form.fit_en },
      price: Number(form.price) || 0,
      stock: hasVariantGrid ? variantStockTotal : Number(form.stock) || 0,
      category_id: form.category_id || null,
      sizes: form.sizes,
      colors: form.colors,
      color_images: form.color_images,
      images: form.images,
      sold_out_sizes: form.sold_out_sizes,
      sold_out_colors: form.sold_out_colors,
      discount_percent: Number(form.discount_percent) || 0,
      variant_stock: hasVariantGrid ? form.variant_stock : {},
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
          <Label>{t("products.slugOptional")}</Label>
          <input className="input" value={form.slug} onChange={update("slug")} dir="ltr" />
        </FullRow>

        <FullRow>
          <Label>{t("products.nameAr")}</Label>
          <input className="input" dir="rtl" value={form.name_ar} onChange={update("name_ar")} />
        </FullRow>

        <FullRow>
          <Label>{t("products.descAr")}</Label>
          <textarea className="input" dir="rtl" rows={3} value={form.description_ar} onChange={update("description_ar")} />
        </FullRow>

        <FullRow>
          <Label>{tc("product.material")}</Label>
          <input className="input" dir="rtl" value={form.material_ar} onChange={update("material_ar")} />
        </FullRow>

        <FullRow>
          <Label>{tc("product.fit")}</Label>
          <input className="input" dir="rtl" value={form.fit_ar} onChange={update("fit_ar")} />
        </FullRow>

        {/* English is optional -- collapsed by default so a quick add
            only asks for Arabic. Auto-expands on edit when the product
            already has English text (see the data-loading effect above). */}
        <FullRow>
          <button
            type="button"
            onClick={() => setShowEnglish((v) => !v)}
            className="flex items-center gap-1.5 text-sm font-medium text-enzo-gold hover:text-enzo-goldBright"
          >
            <ChevronDown size={16} className={`transition-transform ${showEnglish ? "rotate-180" : ""}`} />
            {t("products.addEnglish")}
          </button>
        </FullRow>

        {showEnglish && (
          <>
            <FullRow>
              <Label>{t("products.nameEn")}</Label>
              <input className="input" dir="ltr" value={form.name_en} onChange={update("name_en")} />
            </FullRow>
            <FullRow>
              <Label>{t("products.descEn")}</Label>
              <textarea className="input" dir="ltr" rows={3} value={form.description_en} onChange={update("description_en")} />
            </FullRow>
            <FullRow>
              <Label>{tc("product.material")} (EN)</Label>
              <input className="input" dir="ltr" value={form.material_en} onChange={update("material_en")} />
            </FullRow>
            <FullRow>
              <Label>{tc("product.fit")} (EN)</Label>
              <input className="input" dir="ltr" value={form.fit_en} onChange={update("fit_en")} />
            </FullRow>
          </>
        )}

        <div>
          <Label>{t("products.price")}</Label>
          <input className="input" type="number" step="0.01" value={form.price} onChange={update("price")} />
        </div>
        {!hasVariantGrid && (
          <div>
            <Label>{t("products.stock")}</Label>
            <input className="input" type="number" value={form.stock} onChange={update("stock")} />
          </div>
        )}

        <div>
          <Label>{t("products.discountPercent")}</Label>
          <input
            className="input"
            type="number"
            min="0"
            max="100"
            step="1"
            placeholder="0"
            value={form.discount_percent}
            onChange={update("discount_percent")}
          />
        </div>

        <FullRow>
          <Label>{t("products.category")}</Label>
          <select className="input" value={form.category_id} onChange={update("category_id")}>
            <option value="">—</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name?.en} / {c.name?.ar}
              </option>
            ))}
          </select>
        </FullRow>

        {/* Sizes menu */}
        <FullRow>
          <Label>{t("products.sizes")}</Label>
          <div className="flex flex-wrap gap-2">
            {ALL_SIZES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => toggleSize(s)}
                className={`rounded-md border px-3 py-1.5 text-sm ${
                  form.sizes.includes(s)
                    ? "border-enzo-goldBright bg-enzo-goldBright text-enzo-black"
                    : "border-enzo-line text-enzo-muted"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </FullRow>

        {/* Mark any offered size as currently sold out -- the storefront
            disables it and shows a red "Sold out" mark, see ProductDetail.jsx */}
        {form.sizes.length > 0 && (
          <FullRow>
            <Label>{t("products.soldOutSizes")}</Label>
            <div className="flex flex-wrap gap-2">
              {form.sizes.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggleInArray("sold_out_sizes", s)}
                  className={`rounded-md border px-3 py-1.5 text-sm ${
                    form.sold_out_sizes.includes(s)
                      ? "border-enzo-error bg-enzo-error/20 text-enzo-error"
                      : "border-enzo-line text-enzo-muted"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </FullRow>
        )}

        {/* Colors menu */}
        <FullRow>
          <Label>{t("products.colors")}</Label>
          <div className="flex flex-wrap gap-3">
            {PRESET_COLORS.map((c) => {
              const active = form.colors.includes(c.name);
              return (
                <button
                  key={c.name}
                  type="button"
                  onClick={() => toggleColor(c.name)}
                  title={c.name}
                  className={`flex flex-col items-center gap-1 rounded-md p-1.5 ${active ? "ring-2 ring-enzo-goldBright" : ""}`}
                >
                  <span className="h-7 w-7 rounded-full border border-enzo-line" style={{ backgroundColor: c.hex }} />
                  <span className="text-[10px] text-enzo-muted">{c.name}</span>
                </button>
              );
            })}
          </div>
        </FullRow>

        {/* Mark any offered color as currently sold out, independently of
            sizes (e.g. "Black is sold out in every size") */}
        {form.colors.length > 0 && (
          <FullRow>
            <Label>{t("products.soldOutColors")}</Label>
            <div className="flex flex-wrap gap-2">
              {form.colors.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => toggleInArray("sold_out_colors", c)}
                  className={`rounded-md border px-3 py-1.5 text-sm ${
                    form.sold_out_colors.includes(c)
                      ? "border-enzo-error bg-enzo-error/20 text-enzo-error"
                      : "border-enzo-line text-enzo-muted"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </FullRow>
        )}

        {/* Per size+color stock grid -- only once both sizes and colors
            are chosen (a grey shirt might have 10 in S while the same
            shirt in blue only has 5 in S). The plain "stock" field above
            is hidden in this mode; its value is computed from this grid
            on save (see handleSubmit). */}
        {hasVariantGrid && (
          <FullRow>
            <Label>{t("products.stockGrid")}</Label>
            <div className="overflow-x-auto">
              <div
                className="inline-grid items-center gap-x-3 gap-y-2"
                style={{ gridTemplateColumns: `110px repeat(${form.sizes.length}, 56px)` }}
              >
                <div />
                {form.sizes.map((s) => (
                  <div key={s} className="text-center text-xs font-medium text-enzo-muted">
                    {s}
                  </div>
                ))}
                {form.colors.map((c) => (
                  <Fragment key={c}>
                    <div className="flex items-center gap-1.5 text-sm">
                      <span className="h-3 w-3 shrink-0 rounded-full border border-enzo-line" style={{ backgroundColor: COLOR_HEX[c] || "#333" }} />
                      {c}
                    </div>
                    {form.sizes.map((s) => (
                      <input
                        key={`${c}-${s}`}
                        type="number"
                        min="0"
                        className="input w-14 px-1 py-1 text-center text-sm"
                        value={form.variant_stock[variantKey(c, s)] ?? ""}
                        placeholder="0"
                        onChange={(e) => setVariantStock(c, s, e.target.value)}
                      />
                    ))}
                  </Fragment>
                ))}
              </div>
            </div>
            <p className="mt-2 text-xs text-enzo-muted">
              {t("products.stockGridTotal", {
                total: Object.values(form.variant_stock).reduce((sum, n) => sum + (Number(n) || 0), 0),
              })}
            </p>
          </FullRow>
        )}

        {/* Image upload from gallery */}
        <FullRow>
          <Label>{t("products.images")}</Label>
          <label className="flex w-fit cursor-pointer items-center gap-2 rounded-md border border-dashed border-enzo-line px-4 py-2 text-sm text-enzo-muted hover:border-enzo-goldBright hover:text-enzo-white">
            <Upload size={16} />
            {uploading ? t("products.uploading") : t("products.uploadImages")}
            <input type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif" multiple className="hidden" onChange={handleFilesSelected} disabled={uploading} />
          </label>

          {form.images.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-3">
              {form.images.map((url) => (
                <div key={url} className="group relative h-20 w-16 overflow-hidden rounded-md bg-enzo-panel">
                  <img src={url} alt="" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removeImage(url)}
                    aria-label={t("products.removeImage")}
                    className="absolute end-1 top-1 rounded-full bg-enzo-black/80 p-1 text-enzo-white opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </FullRow>

        {/* Assign one photo per color — this is what lets the storefront
            swap the shown photo when a shopper picks a color (see
            ProductCard.jsx / ProductDetail.jsx). Optional: a color with
            no assigned photo just falls back to the product's default image. */}
        {form.colors.length > 0 && form.images.length > 0 && (
          <FullRow>
            <Label>{t("products.colorImages")}</Label>
            <div className="flex flex-col gap-2">
              {form.colors.map((colorName) => (
                <div key={colorName} className="flex items-center gap-3">
                  <span className="w-20 text-sm text-enzo-muted">{colorName}</span>
                  <select
                    className="input w-auto py-1.5 text-sm"
                    value={form.color_images[colorName] || ""}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, color_images: { ...f.color_images, [colorName]: e.target.value } }))
                    }
                  >
                    <option value="">{t("products.noImageAssigned")}</option>
                    {form.images.map((url, i) => (
                      <option key={url} value={url}>
                        {t("products.photoNumber", { n: i + 1 })}
                      </option>
                    ))}
                  </select>
                  {form.color_images[colorName] && (
                    <img src={form.color_images[colorName]} alt="" className="h-10 w-8 rounded object-cover" />
                  )}
                </div>
              ))}
            </div>
          </FullRow>
        )}

        {error && (
          <FullRow>
            <p className="text-sm text-enzo-error">{error}</p>
          </FullRow>
        )}

        <FullRow>
          <button
            type="submit"
            disabled={saving || uploading}
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
