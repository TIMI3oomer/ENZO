import { useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Menu, X, ShoppingBag, Search, User } from "lucide-react";
import LanguageSwitcher from "./LanguageSwitcher.jsx";
import CartDrawer from "./CartDrawer.jsx";
import { useCart } from "../context/CartContext.jsx";
import { useAuth } from "../context/AuthContext.jsx";

// CHECKPOINT NOTE (Navbar.jsx):
// Uses margin-inline-start/end (via Tailwind's `ms-*`/`me-*` utilities) and
// flex, never left/right classes, so it mirrors correctly for RTL/LTR
// without any conditional className branching. Icons come from lucide-react
// (external icon library, per your note to lean on outside libs).
export default function Navbar() {
  const { t } = useTranslation("common");
  const [menuOpen, setMenuOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const { count } = useCart();
  const { session } = useAuth();

  const links = [
    { to: "/", label: t("nav.home") },
    { to: "/shop", label: t("nav.shop") },
  ];

  return (
    <header className="sticky top-0 z-40 border-b hairline bg-enzo-black/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
        {/* Logo */}
        <Link to="/" className="flex items-center">
          <img src="/logo.jpg" alt="ENZO" className="h-9 w-9 rounded-full sm:h-10 sm:w-10" />
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-8 md:flex">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.to === "/"}
              className={({ isActive }) =>
                `text-sm font-medium transition-colors ${
                  isActive ? "text-enzo-white" : "text-enzo-muted hover:text-enzo-white"
                }`
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-4">
          <LanguageSwitcher className="hidden sm:flex" />

          <button
            aria-label={t("nav.search")}
            className="hidden text-enzo-muted transition-colors hover:text-enzo-white sm:block"
          >
            <Search size={20} />
          </button>

          {/* Account: goes straight to order history if logged in, otherwise to sign-in */}
          <Link
            to={session ? "/account" : "/login"}
            aria-label={t("auth.myAccount")}
            className="hidden text-enzo-muted transition-colors hover:text-enzo-white sm:block"
          >
            <User size={20} />
          </Link>

          <button
            aria-label={t("nav.cart")}
            onClick={() => setCartOpen(true)}
            className="relative text-enzo-white"
          >
            <ShoppingBag size={22} />
            {count > 0 && (
              <span className="absolute -top-2 -end-2 flex h-5 w-5 items-center justify-center rounded-full bg-enzo-gold text-[11px] font-semibold text-enzo-black">
                {count}
              </span>
            )}
          </button>

          <button
            className="text-enzo-white md:hidden"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="menu"
          >
            {menuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="border-t hairline px-4 py-4 md:hidden">
          <nav className="flex flex-col gap-4">
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                onClick={() => setMenuOpen(false)}
                className="text-base font-medium text-enzo-white"
              >
                {link.label}
              </NavLink>
            ))}
            <Link
              to={session ? "/account" : "/login"}
              onClick={() => setMenuOpen(false)}
              className="text-base font-medium text-enzo-white"
            >
              {session ? t("auth.myAccount") : t("auth.login")}
            </Link>
            <LanguageSwitcher />
          </nav>
        </div>
      )}

      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} />
    </header>
  );
}
