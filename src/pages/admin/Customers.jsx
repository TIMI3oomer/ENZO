import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../lib/api.js";
import AdminLayout from "../../components/AdminLayout.jsx";

// CHECKPOINT NOTE (admin/Customers.jsx):
// Data comes from GET /api/admin/customers, which merges Supabase Auth's
// user list (email/signup date) with the `profiles` table (phone/address,
// added in migration_v4.sql) and an order count per customer.
export default function AdminCustomers() {
  const { t } = useTranslation("admin");
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get("/admin/customers")
      .then((data) => setCustomers(data || []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <AdminLayout title={t("nav.customers")}>
      {loading ? (
        <p className="text-enzo-muted">…</p>
      ) : customers.length === 0 ? (
        <p className="text-enzo-muted">—</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border hairline">
          <table className="w-full text-start text-sm">
            <thead className="bg-enzo-panel text-enzo-muted">
              <tr>
                <th className="px-4 py-3 text-start">Name</th>
                <th className="px-4 py-3 text-start">Email</th>
                <th className="px-4 py-3 text-start">Phone</th>
                <th className="px-4 py-3 text-start">{t("orders.title")}</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id} className="border-t hairline">
                  <td className="px-4 py-3">{c.fullName || "—"}</td>
                  <td className="px-4 py-3" dir="ltr">{c.email}</td>
                  <td className="px-4 py-3" dir="ltr">{c.phone || "—"}</td>
                  <td className="px-4 py-3">{c.orderCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminLayout>
  );
}
