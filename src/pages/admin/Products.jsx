import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Plus, Zap } from "lucide-react";
import { uploadProductImage } from "../../lib/upload.js";
import { api } from "../../lib/api.js";
import { useLocalizedField } from "../../context/LanguageContext.jsx";
import AdminLayout from "../../components/AdminLayout.jsx";
import { isProductSoldOut } from "../../lib/variantStock.js";

// CHECKPOINT NOTE (admin/Products.jsx):
// List/delete now go through GET/DELETE /api/admin/products (backend),
// protected by requireAdmin. Table columns don't hardcode text-align —
// `text-start` follows the active admin language direction.
//
// OPTIMIZE PHOTOS: photos uploaded before automatic shrinking (see
// lib/upload.js) can be 4-5 MB each. The button re-uploads every photo
// over 500 KB through the same shrinking upload, then swaps the URLs on
// the product (PATCH /admin/products/:id/images -- photos only). The old
// files stay in Storage untouched, so nothing is lost if it's stopped.
export default function AdminProducts() {
  const { t } = useTranslation("admin");
  const localize = useLocalizedField();
  const [products, setProducts] = useState([]);
  const [optimizing, setOptimizing] = useState(null); // { done, total, saved } while running
  const [optimizeResult, setOptimizeResult] = useState("");

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const data = await api.get("/admin/products").catch(() => []);
    setProducts(data || []);
  }

  async function optimizePhotos() {
    if (!confirm(t("products.optimizeConfirm"))) return;
    setOptimizeResult("");
    const urls = [...new Set(products.flatMap((p) => [...(p.images || []), ...Object.values(p.color_images || {})]))];
    const replaced = {};
    let saved = 0;
    let failed = 0;
    setOptimizing({ done: 0, total: urls.length, saved: 0 });

    for (const [i, url] of urls.entries()) {
      try {
        const res = await fetch(url);
        const blob = await res.blob();
        if (blob.size > 500 * 1024) {
          const name = decodeURIComponent(url.split("/").pop().split("?")[0]);
          const newUrl = await uploadProductImage(new File([blob], name, { type: blob.type || "image/jpeg" }));
          const after = await fetch(newUrl, { method: "HEAD" }).then((r) => Number(r.headers.get("content-length")) || 0);
          if (after && after < blob.size) {
            replaced[url] = newUrl;
            saved += blob.size - after;
          }
        }
      } catch {
        failed += 1;
      }
      setOptimizing({ done: i + 1, total: urls.length, saved });
    }

    for (const p of products) {
      const images = (p.images || []).map((u) => replaced[u] || u);
      const colorImages = Object.fromEntries(Object.entries(p.color_images || {}).map(([c, u]) => [c, replaced[u] || u]));
      const changed = images.some((u, i) => u !== p.images[i]) || Object.keys(colorImages).some((c) => colorImages[c] !== p.color_images[c]);
      if (changed) {
        try {
          await api.patch(`/admin/products/${p.id}/images`, { images, color_images: colorImages });
        } catch {
          failed += 1;
        }
      }
    }

    setOptimizing(null);
    setOptimizeResult(
      t("products.optimizeDone", { count: Object.keys(replaced).length, saved: (saved / 1024 / 1024).toFixed(1) }) +
        (failed ? ` ${t("products.optimizeFailed", { count: failed })}` : "")
    );
    load();
  }

  async function handleDelete(id) {
    if (!confirm("?")) return;
    await api.del(`/admin/products/${id}`);
    load();
  }

  return (
    <AdminLayout title={t("products.title")}>
      <div className="mb-4 flex flex-wrap items-center justify-end gap-3">
        {optimizeResult && <p className="me-auto text-sm text-enzo-goldBright">{optimizeResult}</p>}
        <button
          type="button"
          onClick={optimizePhotos}
          disabled={!!optimizing || products.length === 0}
          title={t("products.optimizeHint")}
          className="flex items-center gap-2 rounded-md border hairline px-4 py-2 text-sm font-semibold hover:border-enzo-gold disabled:opacity-60"
        >
          <Zap size={16} className="text-enzo-goldBright" />
          {optimizing
            ? t("products.optimizing", { done: optimizing.done, total: optimizing.total })
            : t("products.optimize")}
        </button>
        <Link
          to="/admin/products/new"
          className="flex items-center gap-2 rounded-md bg-enzo-gradient px-4 py-2 text-sm font-semibold text-enzo-black"
        >
          <Plus size={16} />
          {t("products.add")}
        </Link>
      </div>

      <div className="overflow-x-auto rounded-lg border hairline">
        <table className="w-full text-start text-sm">
          <thead className="bg-enzo-panel text-enzo-muted">
            <tr>
              <th className="px-4 py-3 text-start">{t("products.nameEn")}</th>
              <th className="px-4 py-3 text-start">{t("products.price")}</th>
              <th className="px-4 py-3 text-start">{t("products.stock")}</th>
              <th className="px-4 py-3 text-start"></th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className="border-t hairline">
                <td className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {localize(p.name)}
                    {isProductSoldOut(p) ? (
                      <span className="rounded-full bg-enzo-error/20 px-2 py-0.5 text-xs font-semibold text-enzo-error">
                        {t("products.soldOutBadge")}
                      </span>
                    ) : (
                      [...(p.sold_out_sizes || []), ...(p.sold_out_colors || [])].length > 0 && (
                        <span className="rounded-full border border-enzo-error/40 px-2 py-0.5 text-xs text-enzo-error">
                          {t("products.partlySoldOut", {
                            list: [...(p.sold_out_sizes || []), ...(p.sold_out_colors || [])].join(", "),
                          })}
                        </span>
                      )
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">{p.price}</td>
                <td className="px-4 py-3">
                  {p.stock}
                  {p.variant_stock && Object.keys(p.variant_stock).length > 0 && (
                    <span className="ms-2 text-xs text-enzo-muted" dir="ltr">
                      ({Object.entries(p.variant_stock)
                        .map(([key, qty]) => `${key.replace("__", " ")}:${qty}`)
                        .join(" ")})
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-3">
                    <Link to={`/admin/products/${p.id}/edit`} className="text-enzo-gold hover:underline">
                      {t("products.edit")}
                    </Link>
                    <button onClick={() => handleDelete(p.id)} className="text-enzo-error hover:underline">
                      {t("products.delete")}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminLayout>
  );
}
