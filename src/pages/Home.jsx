import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api.js";
import { useContent } from "../hooks/useContent.js";
import { ArrowRight } from "lucide-react";
import AnimatedHero from "../components/AnimatedHero.jsx";
import ScrollShowcase from "../components/ScrollShowcase.jsx";
import TrustBadges from "../components/TrustBadges.jsx";
import ProductCard from "../components/ProductCard.jsx";
import Reveal from "../components/Reveal.jsx";

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

      {/* Soft ambient gold glow behind the badges/sale/shop run below --
          one subtle, blurred accent (not a repeated motif) so the page
          doesn't feel like flat stacked boxes once the hero's done. */}
      <div className="relative isolate overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 start-1/2 -z-10 h-72 w-72 -translate-x-1/2 rounded-full bg-enzo-gold/15 blur-3xl sm:h-96 sm:w-96"
        />

        <TrustBadges />

        {saleProducts.length > 0 && (
          <div className="mx-auto max-w-7xl px-4 pt-12 sm:px-6">
            <Reveal>
              <SectionKicker />
              <h2 className="text-start font-display text-2xl">{t("product.onSale")}</h2>
            </Reveal>

            {/* Mobile: horizontal snap-scroll strip (feels native on a
                phone, no awkward 2-up grid squeeze). sm+: back to a grid. */}
            <div className="-mx-4 mt-5 flex gap-4 overflow-x-auto px-4 pb-1 snap-x snap-mandatory [&::-webkit-scrollbar]:hidden sm:mx-0 sm:grid sm:grid-cols-3 sm:gap-4 sm:overflow-visible sm:px-0 sm:pb-0 md:grid-cols-4">
              {saleProducts.map((p) => (
                <div key={p.id} className="w-[44%] shrink-0 snap-start sm:w-auto">
                  <ProductCard product={p} />
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="pt-14">
          <Reveal className="mx-auto max-w-7xl px-4 sm:px-6">
            <SectionKicker />
            <h2 className="text-start font-display text-2xl">{t("nav.shop")}</h2>
          </Reveal>
          <ScrollShowcase products={products} />
          <div className="mx-auto max-w-7xl px-4 pb-20 text-center sm:px-6">
            <Link
              to="/shop"
              className="group inline-flex items-center gap-1.5 text-sm font-medium text-enzo-gold underline underline-offset-4 transition-colors hover:text-enzo-goldBright"
            >
              {content.hero.cta}
              <ArrowRight size={15} className="rtl:rotate-180 transition-transform group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

// Tiny gold accent bar above a section heading -- a common premium-brand
// "kicker" touch, reused by both headings above so they feel like one
// family instead of each page section inventing its own heading style.
function SectionKicker() {
  return <span className="mb-2 block h-[3px] w-8 rounded-full bg-enzo-gradient" />;
}
