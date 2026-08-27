import { NavLink, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LayoutGrid, Package, ClipboardList, Users, LogOut } from "lucide-react";
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
  ];

  async function handleLogout() {
    await logout();
    navigate("/admin/login");
  }

  return (
    <div className="flex min-h-screen">
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

      <main className="flex-1 p-6 sm:p-10">
        <h1 className="mb-8 font-display text-2xl">{title}</h1>
        {children}
      </main>
    </div>
  );
}
