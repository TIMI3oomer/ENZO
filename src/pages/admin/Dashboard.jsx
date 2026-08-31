import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, BarChart, Bar,
} from "recharts";
import { api } from "../../lib/api.js";
import AdminLayout from "../../components/AdminLayout.jsx";

const STATUS_COLORS = { pending: "#C9A227", confirmed: "#FFD23F", shipped: "#8A6D1F", delivered: "#FAFAF7", cancelled: "#E5484D" };

// CHECKPOINT NOTE (admin/Dashboard.jsx):
// Charts use recharts (added to package.json — run npm install to pick it
// up). Data comes from GET /api/admin/analytics: a 14-day orders/revenue
// line chart, a status breakdown donut, and a top-5-products bar chart.
// ResponsiveContainer makes every chart resize to its parent automatically
// — no manual breakpoint handling needed for mobile vs desktop.
export default function AdminDashboard() {
  const { t } = useTranslation("admin");
  const [stats, setStats] = useState({ products: 0, pendingOrders: 0, totalOrders: 0 });
  const [analytics, setAnalytics] = useState(null);

  useEffect(() => {
    api.get("/admin/stats").then(setStats).catch(() => {});
    api.get("/admin/analytics").then(setAnalytics).catch(() => {});
  }, []);

  return (
    <AdminLayout title={t("nav.dashboard")}>
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label={t("nav.products")} value={stats.products} />
        <StatCard label={t("orders.statusPending")} value={stats.pendingOrders} />
        <StatCard label={t("nav.orders")} value={stats.totalOrders} />
      </div>

      {analytics && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ChartCard title={t("analytics.salesLast14Days")}>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={analytics.salesByDay}>
                <CartesianGrid stroke="#333333" strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fill: "#A8A89F", fontSize: 11 }} tickFormatter={(d) => d.slice(5)} />
                <YAxis tick={{ fill: "#A8A89F", fontSize: 11 }} />
                <Tooltip contentStyle={{ background: "#161616", border: "1px solid #333333" }} />
                <Line type="monotone" dataKey="revenue" name={t("analytics.revenue")} stroke="#C9A227" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="orders" name={t("analytics.orders")} stroke="#FAFAF7" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title={t("analytics.ordersByStatus")}>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={analytics.statusBreakdown} dataKey="count" nameKey="status" innerRadius={60} outerRadius={90}>
                  {analytics.statusBreakdown.map((entry) => (
                    <Cell key={entry.status} fill={STATUS_COLORS[entry.status] || "#A8A89F"} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: "#161616", border: "1px solid #333333" }} />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title={t("analytics.topProducts")} className="lg:col-span-2">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={analytics.topProducts} layout="vertical" margin={{ left: 24 }}>
                <CartesianGrid stroke="#333333" strokeDasharray="3 3" />
                <XAxis type="number" tick={{ fill: "#A8A89F", fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fill: "#A8A89F", fontSize: 11 }} width={140} />
                <Tooltip contentStyle={{ background: "#161616", border: "1px solid #333333" }} />
                <Bar dataKey="quantity" fill="#C9A227" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      )}
    </AdminLayout>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="rounded-lg border hairline bg-enzo-panel p-6 text-start">
      <p className="text-sm text-enzo-muted">{label}</p>
      <p className="mt-2 font-display text-3xl">{value}</p>
    </div>
  );
}

function ChartCard({ title, children, className = "" }) {
  return (
    <div className={`rounded-lg border hairline bg-enzo-panel p-5 text-start ${className}`}>
      <p className="mb-4 text-sm font-medium text-enzo-muted">{title}</p>
      {children}
    </div>
  );
}
