import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api.js";
import { useContent } from "../hooks/useContent.js";
import AnimatedHero from "../components/AnimatedHero.jsx";
import ScrollShowcase from "../components/ScrollShowcase.jsx";
import TrustBadges from "../components/TrustBadges.jsx";
import ProductCard from "../components/ProductCard.jsx";

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
  const [saleProducts, setSaleProducts] = useState([]);
  const content = useContent("home");

  useEffect(() => {
    api
      .get("/products")
      .then((data) => setProducts((data || []).slice(0, 8)))
      .catch(() => setProducts([]));
    api
      .get("/products?on_sale=true")
      .then((data) => setSaleProducts((data || []).slice(0, 8)))
      .catch(() => setSaleProducts([]));
  }, []);

  return (
    <div>
      <AnimatedHero products={products} hero={content.hero} />
      <TrustBadges />

      {saleProducts.length > 0 && (
        <div className="mx-auto max-w-7xl px-4 pt-10 sm:px-6">
          <h2 className="text-start font-display text-2xl">{t("product.onSale")}</h2>
          <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {saleProducts.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </div>
      )}

      <div>
        <h2 className="mx-auto max-w-7xl px-4 pt-4 text-start font-display text-2xl sm:px-6">
          {t("nav.shop")}
        </h2>
        <ScrollShowcase products={products} />
        <div className="mx-auto max-w-7xl px-4 pb-20 text-center sm:px-6">
          <Link to="/shop" className="text-sm font-medium text-enzo-gold underline underline-offset-4">
            {content.hero.cta}
          </Link>
        </div>
      </div>
    </div>
  );
}
