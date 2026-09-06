import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api.js";
import AnimatedHero from "../components/AnimatedHero.jsx";
import ScrollShowcase from "../components/ScrollShowcase.jsx";
import TrustBadges from "../components/TrustBadges.jsx";

// CHECKPOINT NOTE (Home.jsx):
// AnimatedHero.jsx is the entry sequence (logo flips from background to
// front, then garments scatter and spin around it as you keep scrolling
// -- see that file for the full breakdown). ScrollShowcase.jsx below is a
// second, separate moment further down the page (a flat grid, cards
// rising/rotating in). Products come from the Node backend; a failed
// fetch is caught so a backend hiccup never leaves the page stuck on a
// blank/broken state -- both hero sections fall back to placeholder
// content in that case.
export default function Home() {
  const { t } = useTranslation("common");
  const [products, setProducts] = useState([]);

  useEffect(() => {
    api
      .get("/products")
      .then((data) => setProducts((data || []).slice(0, 8)))
      .catch(() => setProducts([]));
  }, []);

  return (
    <div>
      <AnimatedHero products={products} />
      <TrustBadges />

      <div>
        <h2 className="mx-auto max-w-7xl px-4 pt-4 text-start font-display text-2xl sm:px-6">
          {t("nav.shop")}
        </h2>
        <ScrollShowcase products={products} />
        <div className="mx-auto max-w-7xl px-4 pb-20 text-center sm:px-6">
          <Link to="/shop" className="text-sm font-medium text-enzo-gold underline underline-offset-4">
            {t("hero.cta")}
          </Link>
        </div>
      </div>
    </div>
  );
}
