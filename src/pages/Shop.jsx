import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api.js";
import { useLocalizedField, useLanguage } from "../context/LanguageContext.jsx";
import ProductCard from "../components/ProductCard.jsx";

const ALL_SIZES = ["XS", "S", "M", "L", "XL", "XXL"];

// CHECKPOINT NOTE (Shop.jsx):
// Category tabs come from GET /api/categories (backend), so the Pants +
// Trainings categories (added in supabase/migration_v2.sql) show up
// automatically once that migration is run — no frontend change needed.
// Filtering/sorting is now done server-side too (GET /api/products?category=
// &size=&sort=), which is both correct (no joined-table filtering bug)
// and faster (the database does the filtering, not the browser).
export default function Shop() {
  const { t } = useTranslation("common");
  const { lang } = useLanguage();
  const { categorySlug } = useParams();
  const localize = useLocalizedField();

  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState("newest");
  const [sizeFilter, setSizeFilter] = useState(null);

  useEffect(() => {
    api.get("/categories").then((data) => setCategories(data || []));
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (categorySlug) params.set("category", categorySlug);
    if (sizeFilter) params.set("size", sizeFilter);
    if (sort !== "newest") params.set("sort", sort);

    api
      .get(`/products?${params.toString()}`)
      .then((data) => setProducts(data || []))
      .finally(() => setLoading(false));
  }, [categorySlug, sort, sizeFilter]);

  const activeCategory = categories.find((c) => c.slug === categorySlug);
  const hasFilters = Boolean(categorySlug || sizeFilter || sort !== "newest");

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

        <div className="flex items-center gap-2">
          <span className="text-sm text-enzo-muted">{t("filters.size")}</span>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setSizeFilter(null)}
              className={`rounded border px-2.5 py-1 text-xs ${
                !sizeFilter ? "border-enzo-white text-enzo-white" : "border-enzo-line text-enzo-muted"
              }`}
            >
              {t("filters.allSizes")}
            </button>
            {ALL_SIZES.map((s) => (
              <button
                key={s}
                onClick={() => setSizeFilter(s)}
                className={`rounded border px-2.5 py-1 text-xs ${
                  sizeFilter === s ? "border-enzo-white text-enzo-white" : "border-enzo-line text-enzo-muted"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {hasFilters && (
          <Link
            to="/shop"
            onClick={() => {
              setSort("newest");
              setSizeFilter(null);
            }}
            className="ms-auto text-sm text-enzo-muted underline"
          >
            {t("filters.clear")}
          </Link>
        )}
      </div>

      {loading ? (
        <p className="text-enzo-muted">…</p>
      ) : products.length === 0 ? (
        <p className="text-enzo-muted">{t("product.outOfStock")}</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      )}
    </div>
  );
}
