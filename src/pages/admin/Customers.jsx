import { Fragment, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown } from "lucide-react";
import { api } from "../../lib/api.js";
import { useLocalizedField } from "../../context/LanguageContext.jsx";
import { formatPrice } from "../../lib/formatPrice.js";
import AdminLayout from "../../components/AdminLayout.jsx";
import { OrderItemRow } from "./Orders.jsx";

// CHECKPOINT NOTE (admin/Customers.jsx):
// Data comes from GET /api/admin/customers, which merges Supabase Auth's
// user list (email/signup date) with the `profiles` table (phone/address,
// added in migration_v4.sql) and an order count per customer.
//
// HISTORY: clicking a customer opens their full order history
// (GET /api/admin/customers/:id/orders -- signed-in orders plus guest
// orders placed with the same email), with totals and every item's
// color + size. Loaded on first open and cached.
export default function AdminCustomers() {
  const { t } = useTranslation("admin");
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [history, setHistory] = useState({}); // { [customerId]: orders[] | "error" }

  useEffect(() => {
    api
      .get("/admin/customers")
      .then((data) => setCustomers(data || []))
      .finally(() => setLoading(false));
  }, []);

  function toggle(c) {
    if (expanded === c.id) return setExpanded(null);
    setExpanded(c.id);
    if (!history[c.id]) {
      api
        .get(`/admin/customers/${c.id}/orders`)
        .then((data) => setHistory((h) => ({ ...h, [c.id]: data || [] })))
        .catch(() => setHistory((h) => ({ ...h, [c.id]: "error" })));
    }
  }

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
                <th className="px-4 py-3 text-start">{t("customersPage.name")}</th>
                <th className="px-4 py-3 text-start">{t("customersPage.email")}</th>
                <th className="px-4 py-3 text-start">{t("customersPage.phone")}</th>
                <th className="px-4 py-3 text-start">{t("customersPage.orders")}</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <Fragment key={c.id}>
                  <tr onClick={() => toggle(c)} className="cursor-pointer border-t hairline hover:bg-enzo-panel/60">
                    <td className="px-4 py-3">{c.fullName || "—"}</td>
                    <td className="px-4 py-3" dir="ltr">{c.email}</td>
                    <td className="px-4 py-3" dir="ltr">{c.phone || "—"}</td>
                    <td className="px-4 py-3">{c.orderCount}</td>
                    <td className="px-4 py-3">
                      <ChevronDown size={16} className={`transition-transform ${expanded === c.id ? "rotate-180" : ""}`} />
                    </td>
                  </tr>
                  {expanded === c.id && (
                    <tr className="border-t hairline bg-enzo-panel/30">
                      <td colSpan={5} className="px-4 py-4">
                        <CustomerHistory customer={c} orders={history[c.id]} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminLayout>
  );
}

function CustomerHistory({ customer, orders }) {
  const { t } = useTranslation("admin");
  const localize = useLocalizedField();

  if (!orders) return <p className="text-enzo-muted">…</p>;
  if (orders === "error") return <p className="text-enzo-error">{t("customersPage.historyError")}</p>;

  // Cancelled and refunded orders don't count toward what they've spent.
  const counted = orders.filter((o) => o.status !== "cancelled" && o.payment_status !== "refunded");
  const spent = counted.reduce((sum, o) => sum + Number(o.total || 0), 0);
  const pieces = counted.reduce((sum, o) => sum + o.items.reduce((n, i) => n + i.quantity, 0), 0);

  const stats = [
    [t("customersPage.totalSpent"), formatPrice(spent)],
    [t("customersPage.orders"), orders.length],
    [t("customersPage.pieces"), pieces],
    [t("customersPage.memberSince"), new Date(customer.createdAt).toLocaleDateString()],
  ];

  return (
    <div className="flex flex-col gap-4">
      {(customer.city || customer.address) && (
        <p className="text-enzo-muted">{[customer.city, customer.address].filter(Boolean).join(" · ")}</p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map(([label, value]) => (
          <div key={label} className="rounded-md border hairline bg-enzo-black px-3 py-2">
            <p className="text-xs text-enzo-muted">{label}</p>
            <p className="mt-0.5 font-semibold">{value}</p>
          </div>
        ))}
      </div>

      {orders.length === 0 ? (
        <p className="text-enzo-muted">{t("customersPage.noOrders")}</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {orders.map((o) => (
            <li key={o.id} className="rounded-md border hairline bg-enzo-black p-3">
              <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-medium">#{o.order_number}</span>
                <span className="text-enzo-muted">{new Date(o.created_at).toLocaleString()}</span>
                <span className="rounded-full border hairline px-2 py-0.5 text-xs text-enzo-muted">
                  {t(`orders.status${o.status[0].toUpperCase()}${o.status.slice(1)}`)}
                </span>
                {o.channel === "in_store" && (
                  <span className="rounded-full bg-enzo-gold/10 px-2 py-0.5 text-xs text-enzo-goldBright">
                    {t("customersPage.inStore")}
                  </span>
                )}
                {o.payment_status === "refunded" && (
                  <span className="text-xs text-enzo-error">{t("orders.refunded")}</span>
                )}
                <span className="ms-auto font-semibold">{formatPrice(o.total)}</span>
              </div>
              <ul className="flex flex-col gap-1.5 text-sm">
                {o.items.map((item) => (
                  <OrderItemRow key={item.id} item={item} localize={localize} t={t} />
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
