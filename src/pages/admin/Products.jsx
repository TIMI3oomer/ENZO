import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import { api } from "../../lib/api.js";
import { useLocalizedField } from "../../context/LanguageContext.jsx";
import AdminLayout from "../../components/AdminLayout.jsx";

// CHECKPOINT NOTE (admin/Products.jsx):
// List/delete now go through GET/DELETE /api/admin/products (backend),
// protected by requireAdmin. Table columns don't hardcode text-align —
// `text-start` follows the active admin language direction.
export default function AdminProducts() {
  const { t } = useTranslation("admin");
  const localize = useLocalizedField();
  const [products, setProducts] = useState([]);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const data = await api.get("/admin/products").catch(() => []);
    setProducts(data || []);
  }

  async function handleDelete(id) {
    if (!confirm("?")) return;
    await api.del(`/admin/products/${id}`);
    load();
  }

  return (
    <AdminLayout title={t("products.title")}>
      <div className="mb-4 flex justify-end">
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
                <td className="px-4 py-3">{localize(p.name)}</td>
                <td className="px-4 py-3">{p.price}</td>
                <td className="px-4 py-3">{p.stock}</td>
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
