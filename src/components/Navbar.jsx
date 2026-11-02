import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link, NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Menu, X, ShoppingBag, Search, User, LayoutDashboard, LogOut } from "lucide-react";
import LanguageSwitcher from "./LanguageSwitcher.jsx";
import CartDrawer from "./CartDrawer.jsx";
import { useCart } from "../context/CartContext.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useContent } from "../hooks/useContent.js";
import { useLocalizedField } from "../context/LanguageContext.jsx";
import { api } from "../lib/api.js";
import { MarqueeStrip } from "./storefront.jsx";

// CHECKPOINT NOTE (Navbar.jsx):
// Uses margin-inline-start/end (via Tailwind's `ms-*`/`me-*` utilities) and
// flex, never left/right classes, so it mirrors correctly for RTL/LTR
// without any conditional className branching. Icons come from lucide-react
// (external icon library, per your note to lean on outside libs).
//
// ADMIN SHORTCUT: there's no separate admin login anymore (see
// ProtectedAdminRoute.jsx) — an admin account is just a regular account
// via /login that happens to be in admin_users. When that's the signed-in
// account, a small gold "Control Panel" icon appears here, linking
// straight to /admin. Invisible to every normal customer.
//
// LAYOUT: announcement strip (CMS: site.announcement.text) over a
// three-column bar -- menu/links at the start, logo centered, icons at
// the end. The menu opens a side drawer that also lists every category.
export default function Navbar() {
  const { t } = useTranslation("common");
  const localize = useLocalizedField();
  const [menuOpen, setMenuOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [categories, setCategories] = useState([]);
  const { count } = useCart();
  const { session, isAdmin, logout } = useAuth();
  const content = useContent("site");

  useEffect(() => {
    api.get("/categories").then((d) => setCategories(d || [])).catch(() => {});
  }, []);

  const links = [
    { to: "/", label: t("nav.home") },
    { to: "/shop", label: t("nav.shop") },
  ];

  const icon = "text-enzo-muted transition-colors hover:text-enzo-white";

  return (
    <header className="sticky top-0 z-40 bg-enzo-black/95 backdrop-blur">
      <MarqueeStrip
        text={content.announcement.text}
        className="bg-enzo-white py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-enzo-black"
      />

      <div className="border-b hairline">
        <div className="mx-auto grid max-w-7xl grid-cols-[1fr_auto_1fr] items-center px-4 py-3 sm:px-6">
          {/* Start: menu + desktop links */}
          <div className="flex items-center gap-6">
            <button className="text-enzo-white" onClick={() => setMenuOpen(true)} aria-label="menu">
              <Menu size={24} />
            </button>
            <nav className="hidden items-center gap-6 md:flex">
              {links.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  end={link.to === "/"}
                  className={({ isActive }) =>
                    `text-xs font-semibold uppercase tracking-[0.15em] transition-colors ${
                      isActive ? "text-enzo-white" : "text-enzo-muted hover:text-enzo-white"
                    }`
                  }
                >
                  {link.label}
                </NavLink>
              ))}
            </nav>
          </div>

          {/* Center: logo */}
          <Link to="/" className="flex items-center gap-2.5">
            <img src={content.images.logo} alt="ENZO" className="h-9 w-9 rounded-full sm:h-11 sm:w-11" />
            <span className="hidden font-display text-2xl tracking-[0.2em] text-enzo-white sm:block">ENZO</span>
          </Link>

          {/* End: icons */}
          <div className="flex items-center justify-end gap-4">
            <LanguageSwitcher className="hidden lg:flex" />
            <Link to="/shop" aria-label={t("nav.search")} className={`hidden sm:block ${icon}`}>
              <Search size={20} />
            </Link>
            <Link to={session ? "/account" : "/login"} aria-label={t("auth.myAccount")} className={`hidden sm:block ${icon}`}>
              <User size={20} />
            </Link>
            {isAdmin && (
              <Link
                to="/admin"
                aria-label={t("auth.controlPanel")}
                title={t("auth.controlPanel")}
                className="hidden text-enzo-gold transition-colors hover:text-enzo-goldBright sm:block"
              >
                <LayoutDashboard size={20} />
              </Link>
            )}
            <button aria-label={t("nav.cart")} onClick={() => setCartOpen(true)} className="relative text-enzo-white">
              <ShoppingBag size={22} />
              {count > 0 && (
                <span className="absolute -top-2 -end-2 flex h-5 w-5 items-center justify-center rounded-full bg-enzo-gold text-[11px] font-semibold text-enzo-black">
                  {count}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Side drawer menu -- portalled to <body>: the header's backdrop-blur
          would otherwise trap these fixed layers inside the header box. */}
      {createPortal(
        <>
      <div
        className={`fixed inset-0 z-50 bg-black/60 transition-opacity ${menuOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}
        onClick={() => setMenuOpen(false)}
      />
      <aside
        className={`fixed inset-y-0 start-0 z-50 flex w-[82%] max-w-sm flex-col border-e hairline bg-enzo-black transition-transform duration-300 ${
          menuOpen ? "translate-x-0" : "-translate-x-full rtl:translate-x-full"
        }`}
        aria-hidden={!menuOpen}
      >
        <div className="flex items-center justify-between border-b hairline px-5 py-4">
          <img src={content.images.logo} alt="ENZO" className="h-9 w-9 rounded-full" />
          <button onClick={() => setMenuOpen(false)} aria-label="close" className="text-enzo-white">
            <X size={24} />
          </button>
        </div>
        <nav className="flex flex-1 flex-col overflow-y-auto px-5 py-4">
          {[
            ...links,
            ...categories.map((c) => ({ to: `/shop/${c.slug}`, label: localize(c.name) })),
            { to: "/track", label: t("track.title") },
            { to: "/points", label: t("points.title") },
          ].map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end
              onClick={() => setMenuOpen(false)}
              className={({ isActive }) =>
                `border-b hairline py-3.5 text-sm font-semibold uppercase tracking-[0.12em] ${
                  isActive ? "text-enzo-goldBright" : "text-enzo-white"
                }`
              }
            >
              {link.label}
            </NavLink>
          ))}
          <Link
            to={session ? "/account" : "/login"}
            onClick={() => setMenuOpen(false)}
            className="flex items-center gap-2 py-3.5 text-sm text-enzo-muted"
          >
            <User size={16} />
            {session ? t("auth.myAccount") : t("auth.login")}
          </Link>
          {isAdmin && (
            <Link
              to="/admin"
              onClick={() => setMenuOpen(false)}
              className="flex items-center gap-2 py-2 text-sm text-enzo-gold"
            >
              <LayoutDashboard size={16} />
              {t("auth.controlPanel")}
            </Link>
          )}
        </nav>
        <div className="flex flex-col gap-4 border-t hairline px-5 py-4">
          <LanguageSwitcher />
          {session && (
            <button
              type="button"
              onClick={async () => {
                setMenuOpen(false);
                await logout();
              }}
              className="flex w-full items-center justify-center gap-2 rounded-md border border-enzo-error/60 py-2.5 text-sm font-semibold text-enzo-error"
            >
              <LogOut size={16} />
              {t("auth.logout")}
            </button>
          )}
        </div>
      </aside>
        </>,
        document.body
      )}

      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} />
    </header>
  );
}
