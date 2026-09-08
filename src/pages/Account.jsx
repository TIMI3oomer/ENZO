import { useEffect, useState } from "react";
import { Navigate, useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronDown, LayoutDashboard } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { useLocalizedField } from "../context/LanguageContext.jsx";
import { formatPrice } from "../lib/formatPrice.js";
import { api } from "../lib/api.js";

// CHECKPOINT NOTE (pages/Account.jsx):
// Each order row expands on click to show its line items (product, size,
// quantity) via GET /api/orders/:id/items, fetched lazily only when
// expanded (not all at once) to keep the page fast with many orders.
export default function Account() {
  const { t } = useTranslation("common");
  const localize = useLocalizedField();
  const { session, isAdmin, loading: authLoading, logout } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [itemsByOrder, setItemsByOrder] = useState({});

  const [profile, setProfile] = useState({ full_name: "", phone: "", default_city: "", default_address: "" });
  const [savingProfile, setSavingProfile] = useState(false);
  const [savedMessage, setSavedMessage] = useState(false);

  useEffect(() => {
    if (!session?.user) return;
    api.get("/orders/mine").then((data) => setOrders(data || [])).finally(() => setLoading(false));
    api.get("/account/profile").then((data) => {
      setProfile({
        full_name: data.full_name || session.user.user_metadata?.full_name || "",
        phone: data.phone || "",
        default_city: data.default_city || "",
        default_address: data.default_address || "",
      });
    });
  }, [session]);

  if (authLoading) return null;
  if (!session) return <Navigate to="/login" state={{ from: "/account" }} replace />;

  async function handleLogout() {
    await logout();
    navigate("/");
  }

  const update = (key) => (e) => setProfile((p) => ({ ...p, [key]: e.target.value }));

  async function handleSaveProfile(e) {
    e.preventDefault();
    setSavingProfile(true);
    setSavedMessage(false);
    try {
      await api.put("/account/profile", profile);
      setSavedMessage(true);
      setTimeout(() => setSavedMessage(false), 2000);
    } finally {
      setSavingProfile(false);
    }
  }

  async function toggleExpand(orderId) {
    if (expanded === orderId) {
      setExpanded(null);
      return;
    }
    setExpanded(orderId);
    if (!itemsByOrder[orderId]) {
      const data = await api.get(`/orders/${orderId}/items`).catch(() => []);
      setItemsByOrder((prev) => ({ ...prev, [orderId]: data || [] }));
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 text-start">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="font-display text-2xl">{t("auth.myAccount")}</h1>
        <button onClick={handleLogout} className="text-sm text-enzo-muted underline">
          {t("auth.logout")}
        </button>
      </div>

      {isAdmin && (
        <Link
          to="/admin"
          className="mb-8 flex items-center justify-between rounded-lg border border-enzo-goldBright/40 bg-enzo-gold/10 p-4 text-start transition-colors hover:bg-enzo-gold/20"
        >
          <div className="flex items-center gap-3">
            <LayoutDashboard size={20} className="text-enzo-goldBright" />
            <span className="font-medium text-enzo-white">{t("auth.controlPanel")}</span>
          </div>
          <span className="text-sm text-enzo-muted">{t("auth.controlPanelHint")}</span>
        </Link>
      )}

      <form onSubmit={handleSaveProfile} className="mb-12 rounded-lg border hairline p-5">
        <h2 className="mb-4 text-lg font-medium">{t("auth.fullName")}</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input className="input" placeholder={t("auth.fullName")} value={profile.full_name} onChange={update("full_name")} />
          <input className="input" placeholder={t("auth.email")} value={session.user.email} disabled dir="ltr" />
          <input className="input" dir="ltr" placeholder="Phone" value={profile.phone} onChange={update("phone")} />
          <input className="input" placeholder="City" value={profile.default_city} onChange={update("default_city")} />
          <input
            className="input sm:col-span-2"
            placeholder="Address"
            value={profile.default_address}
            onChange={update("default_address")}
          />
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button
            type="submit"
            disabled={savingProfile}
            className="rounded-md bg-enzo-gradient px-5 py-2 text-sm font-semibold text-enzo-black disabled:opacity-40"
          >
            Save
          </button>
          {savedMessage && <span className="text-sm text-enzo-muted">✓</span>}
        </div>
      </form>

      <h2 className="mb-4 text-lg font-medium">{t("auth.myOrders")}</h2>
      {loading ? (
        <p className="text-enzo-muted">…</p>
      ) : orders.length === 0 ? (
        <p className="text-enzo-muted">{t("auth.noOrders")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {orders.map((o) => (
            <li key={o.id} className="rounded-md border hairline">
              <button
                onClick={() => toggleExpand(o.id)}
                className="flex w-full items-center justify-between p-4 text-start"
              >
                <div>
                  <p className="font-medium">#{o.order_number}</p>
                  <p className="text-sm text-enzo-muted">{new Date(o.created_at).toLocaleDateString()}</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-end">
                    <p className="font-medium">{formatPrice(o.total)}</p>
                    {!o.delivery_fee_confirmed && (
                      <p className="text-xs text-enzo-muted">{t("auth.deliveryPending")}</p>
                    )}
                    <p className="text-sm text-enzo-muted">{o.status}</p>
                  </div>
                  <ChevronDown
                    size={18}
                    className={`text-enzo-muted transition-transform ${expanded === o.id ? "rotate-180" : ""}`}
                  />
                </div>
              </button>

              {expanded === o.id && (
                <div className="border-t hairline px-4 py-3">
                  {o.admin_note && (
                    <p className="mb-3 rounded bg-enzo-panel p-3 text-sm text-enzo-muted">{o.admin_note}</p>
                  )}
                  {!itemsByOrder[o.id] ? (
                    <p className="text-sm text-enzo-muted">…</p>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {itemsByOrder[o.id].map((item) => (
                        <li key={item.id} className="flex justify-between text-sm">
                          <span>
                            {localize(item.product_name)} × {item.quantity}
                            {[item.color, item.size].filter(Boolean).map((v) => ` (${v})`).join("")}
                          </span>
                          <span>{formatPrice(item.unit_price * item.quantity)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
