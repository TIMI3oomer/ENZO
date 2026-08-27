import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api.js";
import CoinFlipHero from "../components/CoinFlipHero.jsx";
import ScrollShowcase from "../components/ScrollShowcase.jsx";

// CHECKPOINT NOTE (Home.jsx):
// CoinFlipHero.jsx is the entry moment (logo pinned + flipping like a
// coin as you scroll), ScrollShowcase.jsx is the follow-up moment
// (4-8 products rising/rotating into place, each linking to /shop).
// Products come from the Node backend; a failed fetch is caught so a
// backend hiccup never leaves the page stuck on a blank/broken state —
// ScrollShowcase falls back to placeholder cards in that case.
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
      <CoinFlipHero />

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
