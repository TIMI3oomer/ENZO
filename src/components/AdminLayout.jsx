import { useEffect, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LayoutGrid, Package, ClipboardList, Users, Tags, FileText, ShoppingBag, Store, LogOut, Ticket, ShieldCheck, Menu, X } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import LanguageSwitcher from "./LanguageSwitcher.jsx";
import AdminHelp from "./AdminHelp.jsx";

// CHECKPOINT NOTE (AdminLayout.jsx):
// Shared shell for every admin screen: sidebar nav + logout + language
// switcher. Because it uses the same LanguageContext as the storefront,
// switching to Arabic here flips this sidebar to RTL too — the admin
// dashboard is never English-only, per requirement #6.
//
// PHONES: the sidebar is too wide for a phone, so below md there's a top
// bar instead -- logo, page menu button and a sign-out button -- and the
// menu opens the same links in a slide-in panel. Sign-out is a clear
// red-outlined button in both places.
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
    { to: "/admin/content", label: t("nav.content"), icon: FileText },
    { to: "/admin/in-store-sale", label: t("nav.inStoreSale"), icon: ShoppingBag },
    { to: "/admin/discount-codes", label: t("nav.discountCodes"), icon: Ticket },
    { to: "/admin/admins", label: t("nav.admins"), icon: ShieldCheck },
  ];

  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => setMenuOpen(false), [pathname]);

  async function handleLogout() {
    await logout();
    navigate("/");
  }

  const nav = (onNavigate) => (
    <>
      <nav className="flex flex-1 flex-col gap-1">
        {links.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNavigate}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-md px-3 py-2.5 text-sm ${
                isActive ? "bg-enzo-black text-enzo-white" : "text-enzo-muted hover:text-enzo-white"
              }`
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>
      <Link
        to="/"
        className="mb-4 mt-4 flex items-center gap-3 rounded-md px-3 py-2 text-sm text-enzo-gold transition-colors hover:text-enzo-goldBright"
      >
        <Store size={18} />
        {t("nav.backToStore")}
      </Link>
      <LanguageSwitcher className="mb-4" />
      <SignOutButton onClick={handleLogout} label={t("nav.logout")} />
    </>
  );

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      {/* Phones: top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b hairline bg-enzo-panel/95 px-4 py-3 backdrop-blur md:hidden">
        <button type="button" onClick={() => setMenuOpen(true)} aria-label="menu" className="text-enzo-white">
          <Menu size={24} />
        </button>
        <img src="/logo.jpg" alt="ENZO" className="h-9 w-9 rounded-full" />
        <button
          type="button"
          onClick={handleLogout}
          aria-label={t("nav.logout")}
          className="flex items-center gap-1.5 rounded-md border border-enzo-error/60 px-2.5 py-1.5 text-xs font-semibold text-enzo-error"
        >
          <LogOut size={15} />
          {t("nav.logout")}
        </button>
      </header>

      {menuOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 md:hidden" onClick={() => setMenuOpen(false)}>
          <aside
            onClick={(e) => e.stopPropagation()}
            className="flex h-full w-72 max-w-[85%] flex-col overflow-y-auto border-e hairline bg-enzo-panel p-5"
          >
            <div className="mb-6 flex items-center justify-between">
              <img src="/logo.jpg" alt="ENZO" className="h-10 w-10 rounded-full" />
              <button type="button" onClick={() => setMenuOpen(false)} aria-label="close" className="text-enzo-white">
                <X size={22} />
              </button>
            </div>
            {nav(() => setMenuOpen(false))}
          </aside>
        </div>
      )}

      {/* Desktop: sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 flex-none flex-col overflow-y-auto border-e hairline bg-enzo-panel p-6 md:flex">
        <img src="/logo.jpg" alt="ENZO" className="mb-8 h-10 w-10 rounded-full" />
        {nav()}
      </aside>

      <main className="min-w-0 flex-1 p-4 sm:p-10">
        <div className="mb-8 flex items-center gap-3">
          <h1 className="font-display text-2xl">{title}</h1>
          <AdminHelp />
        </div>
        {children}
      </main>
    </div>
  );
}

function SignOutButton({ onClick, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-center gap-2 rounded-md border border-enzo-error/60 px-3 py-2.5 text-sm font-semibold text-enzo-error transition-colors hover:bg-enzo-error hover:text-enzo-white"
    >
      <LogOut size={17} />
      {label}
    </button>
  );
}
