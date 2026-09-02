import { NavLink, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LayoutGrid, Package, ClipboardList, Users, Tags, LogOut } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import LanguageSwitcher from "./LanguageSwitcher.jsx";

// CHECKPOINT NOTE (AdminLayout.jsx):
// Shared shell for every admin screen: sidebar nav + logout + language
// switcher. Because it uses the same LanguageContext as the storefront,
// switching to Arabic here flips this sidebar to RTL too — the admin
// dashboard is never English-only, per requirement #6.
export default function AdminLayout({ children, title }) {
  const { t } = useTranslation("admin");
  const { logout } = useAuth();
  const navigate = useNavigate();

  const links = [
    { to: "/admin", label: t("nav.dashboard"), icon: LayoutGrid, end: true },
    { to: "/admin/products", label: t("nav.products"), icon: Package },
    { to: "/admin/orders", label: t("nav.orders"), icon: ClipboardList },
    { to: "/admin/customers", label: t("nav.customers"), icon: Users },
    { to: "/admin/categories", label: t("nav.categories"), icon: Tags },
  ];

  async function handleLogout() {
    await logout();
    navigate("/");
  }

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="hidden w-60 flex-none flex-col border-e hairline bg-enzo-panel p-6 md:flex">
        <img src="/logo.jpg" alt="ENZO" className="mb-8 h-10 w-10 rounded-full" />
        <nav className="flex flex-1 flex-col gap-1">
          {links.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-md px-3 py-2 text-sm ${
                  isActive ? "bg-enzo-black text-enzo-white" : "text-enzo-muted hover:text-enzo-white"
                }`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>
        <LanguageSwitcher className="mb-4" />
        <button onClick={handleLogout} className="flex items-center gap-3 text-sm text-enzo-muted hover:text-enzo-white">
          <LogOut size={18} />
          {t("nav.logout")}
        </button>
      </aside>

      <div className="w-full md:hidden">
        <div className="border-b hairline bg-enzo-panel px-3 py-3">
          <nav className="flex gap-2 overflow-x-auto pb-1">
            {links.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `flex shrink-0 items-center gap-2 rounded-md border px-3 py-2 text-xs ${
                    isActive ? "border-enzo-gold bg-enzo-gold/10 text-enzo-white" : "border-transparent text-enzo-muted"
                  }`
                }
              >
                <Icon size={14} />
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="flex items-center justify-between border-b hairline bg-enzo-panel px-4 py-3">
          <div className="flex items-center gap-3">
            <img src="/logo.jpg" alt="ENZO" className="h-8 w-8 rounded-full" />
            <h1 className="font-display text-xl">{title}</h1>
          </div>
          <div className="flex items-center gap-2">
            <LanguageSwitcher className="text-xs" />
            <button onClick={handleLogout} className="text-sm text-enzo-muted hover:text-enzo-white" aria-label={t("nav.logout")}>
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </div>

      <main className="flex-1 p-4 sm:p-6 md:p-10">
        <h1 className="mb-8 hidden font-display text-2xl md:block">{title}</h1>
        {children}
      </main>
    </div>
  );
}
