import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api.js";
import { useLocalizedField, useLanguage } from "../context/LanguageContext.jsx";
import ProductCard from "../components/ProductCard.jsx";
import ErrorBanner from "../components/ErrorBanner.jsx";
import { useContent } from "../hooks/useContent.js";
import { isProductSoldOut, soldOutLast, getAvailableStock, usesVariantStock } from "../lib/variantStock.js";
import { Check } from "lucide-react";

const SIZE_ORDER = ["XS", "S", "M", "L", "XL", "XXL", "XXXL"];

// Is this size actually buyable right now (in any color)? Same rules as
// the product page: not marked sold out, and -- for products tracked per
// color+size -- at least one color has it in stock.
function sizeInStock(product, size) {
  if (!product.sizes?.includes(size) || product.sold_out_sizes?.includes(size)) return false;
  if (usesVariantStock(product)) return (product.colors || []).some((c) => getAvailableStock(product, size, c) > 0);
  return (Number(product.stock) || 0) > 0;
}

function sortSizes(sizes) {
  return [...sizes].sort((a, b) => {
    const ia = SIZE_ORDER.indexOf(a);
    const ib = SIZE_ORDER.indexOf(b);
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    return a.localeCompare(b, undefined, { numeric: true }); // 30, 32, 42...
  });
}

// CHECKPOINT NOTE (Shop.jsx):
// Category tabs come from GET /api/categories (backend), so the Pants +
// Trainings categories (added in supabase/migration_v2.sql) show up
// automatically once that migration is run — no frontend change needed.
// Filtering/sorting is now done server-side too (GET /api/products?category=
// &size=&sort=), which is both correct (no joined-table filtering bug)
// and faster (the database does the filtering, not the browser).
//
// SIZE FILTER is done here instead: pick several sizes at once, only sizes
// that exist in the current list are offered (with how many products have
// each), and "in stock only" hides products whose chosen size is sold out
// in every color.
export default function Shop() {
  const { t } = useTranslation("common");
  const { lang } = useLanguage();
  const { categorySlug } = useParams();
  const localize = useLocalizedField();

  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState("newest");
  const [selectedSizes, setSelectedSizes] = useState([]);
  const [inStockOnly, setInStockOnly] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get("/categories").then((data) => setCategories(data || [])).catch(() => {});
  }, []);

  function loadProducts() {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (categorySlug) params.set("category", categorySlug);
    if (sort !== "newest") params.set("sort", sort);

    api
      .get(`/products?${params.toString()}`)
      .then((data) => setProducts(data || []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categorySlug, sort]);

  // Sold-out products sit at the end of the grid, or are hidden entirely
  // when the admin turns that off in the CMS (site.catalog.showSoldOut).
  const site = useContent("site");
  const catalog =
    site.catalog?.showSoldOut === "off" ? products.filter((p) => !isProductSoldOut(p)) : soldOutLast(products);

  const hasSize = (p, size) => (inStockOnly ? sizeInStock(p, size) : p.sizes?.includes(size));
  const sizeOptions = sortSizes([...new Set(catalog.flatMap((p) => p.sizes || []))]).map((size) => ({
    size,
    count: catalog.filter((p) => hasSize(p, size)).length,
  }));
  const visible = selectedSizes.length ? catalog.filter((p) => selectedSizes.some((size) => hasSize(p, size))) : catalog;
  const toggleSize = (size) =>
    setSelectedSizes((cur) => (cur.includes(size) ? cur.filter((s) => s !== size) : [...cur, size]));

  const activeCategory = categories.find((c) => c.slug === categorySlug);
  const hasFilters = Boolean(categorySlug || selectedSizes.length || sort !== "newest");

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <h1 className="mb-6 font-display text-3xl">
        {activeCategory ? localize(activeCategory.name) : t("nav.shop")}
      </h1>

      {/* Category tabs */}
      <div className="mb-4 flex flex-wrap gap-3">
        <Link
          to="/shop"
          className={`rounded-full border px-4 py-1.5 text-sm ${
            !categorySlug ? "border-enzo-white text-enzo-white" : "hairline text-enzo-muted hover:border-enzo-white hover:text-enzo-white"
          }`}
        >
          {lang === "ar" ? "الكل" : "All"}
        </Link>
        {categories.map((c) => (
          <Link
            key={c.id}
            to={`/shop/${c.slug}`}
            className={`rounded-full border px-4 py-1.5 text-sm ${
              categorySlug === c.slug
                ? "border-enzo-white text-enzo-white"
                : "hairline text-enzo-muted hover:border-enzo-white hover:text-enzo-white"
            }`}
          >
            {localize(c.name)}
          </Link>
        ))}
      </div>

      {/* Sort + size filters */}
      <div className="mb-8 flex flex-wrap items-center gap-4 border-y hairline py-4">
        <div className="flex items-center gap-2">
          <label className="text-sm text-enzo-muted">{t("filters.sortBy")}</label>
          <select value={sort} onChange={(e) => setSort(e.target.value)} className="input w-auto py-1.5 text-sm">
            <option value="newest">{t("filters.newest")}</option>
            <option value="price_asc">{t("filters.priceLowHigh")}</option>
            <option value="price_desc">{t("filters.priceHighLow")}</option>
          </select>
        </div>

        {sizeOptions.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-enzo-muted">{t("filters.size")}</span>
            <div className="flex flex-wrap gap-1.5">
              {sizeOptions.map(({ size, count }) => {
                const on = selectedSizes.includes(size);
                return (
                  <button
                    key={size}
                    type="button"
                    onClick={() => toggleSize(size)}
                    disabled={count === 0 && !on}
                    aria-pressed={on}
                    className={`flex min-w-[2.75rem] items-center justify-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${
                      on
                        ? "border-enzo-goldBright bg-enzo-goldBright text-enzo-black"
                        : "border-enzo-line text-enzo-white hover:border-enzo-white"
                    }`}
                  >
                    {size}
                    <span className={`text-[10px] font-normal ${on ? "text-enzo-black/70" : "text-enzo-muted"}`}>{count}</span>
                  </button>
                );
              })}
            </div>
            <label className="ms-1 flex cursor-pointer items-center gap-1.5 text-xs text-enzo-muted">
              <span
                className={`flex h-4 w-4 items-center justify-center rounded border ${
                  inStockOnly ? "border-enzo-goldBright bg-enzo-goldBright text-enzo-black" : "border-enzo-line"
                }`}
              >
                {inStockOnly && <Check size={11} strokeWidth={3} />}
              </span>
              <input type="checkbox" className="sr-only" checked={inStockOnly} onChange={(e) => setInStockOnly(e.target.checked)} />
              {t("filters.inStockOnly")}
            </label>
          </div>
        )}

        {hasFilters && (
          <Link
            to="/shop"
            onClick={() => {
              setSort("newest");
              setSelectedSizes([]);
            }}
            className="ms-auto text-sm text-enzo-muted underline"
          >
            {t("filters.clear")}
          </Link>
        )}
      </div>

      {error ? (
        <ErrorBanner message={error} onRetry={loadProducts} />
      ) : loading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="animate-pulse overflow-hidden rounded-2xl border border-enzo-line/60 bg-enzo-panel">
              <div className="aspect-[3/4] bg-enzo-black/40" />
              <div className="flex flex-col gap-2 px-3 py-3">
                <div className="h-3 w-3/4 rounded bg-enzo-black/40" />
                <div className="h-3 w-1/3 rounded bg-enzo-black/40" />
              </div>
            </div>
          ))}
        </div>
      ) : visible.length === 0 ? (
        <p className="text-enzo-muted">{t("product.outOfStock")}</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {visible.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      )}
    </div>
  );
}
