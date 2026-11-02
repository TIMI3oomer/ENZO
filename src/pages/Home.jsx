import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api.js";
import { useContent } from "../hooks/useContent.js";
import { useLocalizedField } from "../context/LanguageContext.jsx";
import HeroSlider from "../components/HeroSlider.jsx";
import EditorialBanner from "../components/EditorialBanner.jsx";
import TrustBadges from "../components/TrustBadges.jsx";
import { MarqueeStrip, SectionTitle, ProductRail, CategoryTiles, BrandMarquee, PointsBanner } from "../components/storefront.jsx";
import { isProductSoldOut, soldOutLast } from "../lib/variantStock.js";

// CHECKPOINT NOTE (Home.jsx):
// Streetwear-store layout: campaign banner slider -> promo strip -> new
// arrivals rail -> category photo tiles -> editorial banner -> sale rail
// -> more tiles -> one rail per category -> trust badges. All banner
// images and strip texts are editable in the CMS (admin/Content.jsx), and
// each section can be switched off there (home.sections.*). Sold-out
// products go to the end of every row, or are hidden when the admin turns
// off site.catalog.showSoldOut.
//
// Products and categories are fetched ONCE and split client-side, so the
// page makes two requests no matter how many category rails it shows. A
// failed fetch just leaves those sections out -- the banners still render.
export default function Home() {
  const { t } = useTranslation("common");
  const localize = useLocalizedField();
  const content = useContent("home");
  const site = useContent("site");
  const show = (key) => content.sections?.[key] !== "off";
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);

  useEffect(() => {
    api.get("/products").then((d) => setProducts(d || [])).catch(() => setProducts([]));
    api.get("/categories").then((d) => setCategories(d || [])).catch(() => setCategories([]));
  }, []);

  const catalog =
    site.catalog?.showSoldOut === "off" ? products.filter((p) => !isProductSoldOut(p)) : soldOutLast(products);
  const newArrivals = catalog.slice(0, 10);
  const onSale = catalog.filter((p) => p.discount_percent > 0).slice(0, 10);
  const withProducts = categories.filter((c) => catalog.some((p) => p.category_id === c.id));

  return (
    <div className="pb-6">
      <HeroSlider hero={content.hero} products={products} />

      <MarqueeStrip
        text={show("showPromo") && content.promo.text}
        className="border-y border-enzo-gold/30 bg-enzo-gradient py-2.5 text-xs font-semibold uppercase tracking-[0.2em] text-enzo-black"
      />

      {show("showNewArrivals") && newArrivals.length > 0 && (
        <>
          <SectionTitle>{t("home.newArrivals")}</SectionTitle>
          <ProductRail products={newArrivals} />
        </>
      )}

      {show("showCategories") && <CategoryTiles categories={withProducts.slice(0, 3)} products={catalog} />}

      {show("showEditorial") && <EditorialBanner editorial={content.editorial} />}

      {show("showBrandStrip") && <BrandMarquee words={["ENZO", t("home.brandWord1"), "ENZO", t("home.brandWord2")]} />}

      {show("showSale") && onSale.length > 0 && (
        <>
          <SectionTitle>{t("product.onSale")}</SectionTitle>
          <ProductRail products={onSale} />
        </>
      )}

      {show("showPoints") && (
        <PointsBanner title={t("home.pointsTitle")} text={t("home.pointsText")} cta={t("home.pointsCta")} />
      )}

      {show("showCategories") && <CategoryTiles categories={withProducts.slice(3, 6)} products={catalog} />}

      {show("showCategoryRails") && withProducts.slice(0, 4).map((c) => (
        <section key={c.id}>
          <SectionTitle to={`/shop/${c.slug}`} linkLabel={t("home.viewAll")}>
            {localize(c.name)}
          </SectionTitle>
          <ProductRail products={catalog.filter((p) => p.category_id === c.id).slice(0, 10)} />
        </section>
      ))}

      {show("showTrust") && (
        <div className="mt-16">
          <TrustBadges />
        </div>
      )}
    </div>
  );
}
