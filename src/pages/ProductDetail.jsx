import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api.js";
import { useLocalizedField } from "../context/LanguageContext.jsx";
import { useCart } from "../context/CartContext.jsx";
import { formatPrice, getDiscountedPrice } from "../lib/formatPrice.js";
import ErrorBanner from "../components/ErrorBanner.jsx";
import { COLOR_HEX } from "../lib/colors.js";

// CHECKPOINT NOTE (ProductDetail.jsx):
// Fetches from GET /api/products/:slug (backend). The product stays the
// SAME object across a language switch (slugs are language-neutral).
// Clicking a color swatch now also swaps the displayed photo if the
// admin assigned one to that color (product.color_images, set in
// admin/ProductForm.jsx) — falls back to the default photo if that color
// has no specific image assigned.
export default function ProductDetail() {
  const { slug } = useParams();
  const { t } = useTranslation("common");
  const localize = useLocalizedField();
  const { addItem } = useCart();

  const [product, setProduct] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState(null);
  const [size, setSize] = useState(null);
  const [color, setColor] = useState(null);
  const [activeImage, setActiveImage] = useState(0);
  const [added, setAdded] = useState(false);

  function load() {
    setError(null);
    api
      .get(`/products/${slug}`)
      .then((data) => {
        setProduct(data);
        const availableSize = data?.sizes?.find((s) => !data.sold_out_sizes?.includes(s)) ?? data?.sizes?.[0] ?? null;
        const availableColor =
          data?.colors?.find((c) => !data.sold_out_colors?.includes(c)) ?? data?.colors?.[0] ?? null;
        setSize(availableSize);
        setColor(availableColor);
      })
      .catch((err) => (err.status === 404 ? setNotFound(true) : setError(err.message)));
  }

  useEffect(load, [slug]);

  function handleColorSelect(c) {
    setColor(c);
    const assignedUrl = product.color_images?.[c];
    if (assignedUrl) {
      const idx = product.images.indexOf(assignedUrl);
      if (idx !== -1) setActiveImage(idx);
    }
  }

  if (error) return <div className="p-10"><ErrorBanner message={error} onRetry={load} /></div>;
  if (notFound) return <div className="p-10 text-center text-enzo-muted">{t("errors.notFound")}</div>;
  if (!product) return <div className="p-10 text-center text-enzo-muted">…</div>;

  const handleAdd = () => {
    addItem(product, size, color, 1);
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  };

  return (
    <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-4 py-10 sm:px-6 md:grid-cols-2">
      {/* Gallery */}
      <div>
        <div className="aspect-[3/4] overflow-hidden rounded-lg bg-enzo-panel">
          {product.images?.[activeImage] && (
            <img src={product.images[activeImage]} alt={localize(product.name)} className="h-full w-full object-cover" />
          )}
        </div>
        {product.images?.length > 1 && (
          <div className="mt-3 flex gap-2">
            {product.images.map((img, i) => (
              <button
                key={img}
                onClick={() => setActiveImage(i)}
                className={`h-16 w-14 overflow-hidden rounded border ${
                  i === activeImage ? "border-enzo-white" : "border-enzo-line"
                }`}
              >
                <img src={img} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="text-start">
        <h1 className="font-display text-3xl">{localize(product.name)}</h1>
        {product.discount_percent > 0 ? (
          <div className="mt-2 flex items-center gap-3">
            <p className="text-xl font-semibold text-enzo-gold">
              {formatPrice(getDiscountedPrice(product.price, product.discount_percent))}
            </p>
            <p className="text-base text-enzo-muted line-through">{formatPrice(product.price)}</p>
            <span className="rounded-full bg-enzo-error px-2.5 py-0.5 text-xs font-semibold text-enzo-white">
              -{product.discount_percent}%
            </span>
          </div>
        ) : (
          <p className="mt-2 text-xl text-enzo-muted">{formatPrice(product.price)}</p>
        )}
        <p className="mt-6 leading-relaxed text-enzo-muted">{localize(product.description)}</p>

        {product.colors?.length > 0 && (
          <div className="mt-6">
            <p className="mb-2 text-sm font-medium">{t("product.color")}</p>
            <div className="flex flex-wrap gap-3">
              {product.colors.map((c) => {
                const soldOut = product.sold_out_colors?.includes(c);
                return (
                  <button
                    key={c}
                    onClick={() => !soldOut && handleColorSelect(c)}
                    disabled={soldOut}
                    title={soldOut ? `${c} — ${t("product.soldOut")}` : c}
                    className="relative flex flex-col items-center gap-1"
                  >
                    <span
                      className={`h-9 w-9 rounded-full border-2 ${
                        soldOut
                          ? "border-enzo-error opacity-40"
                          : color === c
                            ? "border-enzo-goldBright"
                            : "border-enzo-line"
                      }`}
                      style={{ backgroundColor: COLOR_HEX[c] || "#333" }}
                    />
                    {soldOut && (
                      <span className="absolute inset-0 flex items-center justify-center">
                        <span className="h-[2px] w-10 rotate-45 bg-enzo-error" />
                      </span>
                    )}
                    {soldOut && <span className="text-[10px] font-medium text-enzo-error">{t("product.soldOut")}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {product.sizes?.length > 0 && (
          <div className="mt-6">
            <p className="mb-2 text-sm font-medium">{t("product.size")}</p>
            <div className="flex flex-wrap gap-2">
              {product.sizes.map((s) => {
                const soldOut = product.sold_out_sizes?.includes(s);
                return (
                  <button
                    key={s}
                    onClick={() => !soldOut && setSize(s)}
                    disabled={soldOut}
                    className={`relative rounded border px-4 py-2 text-sm ${
                      soldOut
                        ? "border-enzo-error text-enzo-error opacity-60"
                        : size === s
                          ? "border-enzo-white bg-enzo-white text-enzo-black"
                          : "border-enzo-line text-enzo-muted"
                    }`}
                  >
                    {s}
                    {soldOut && <span className="ms-1.5 text-[10px]">({t("product.soldOut")})</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {(() => {
          const sizeSoldOut = size && product.sold_out_sizes?.includes(size);
          const colorSoldOut = color && product.sold_out_colors?.includes(color);
          const unavailable = product.stock === 0 || sizeSoldOut || colorSoldOut;
          return (
            <button
              onClick={handleAdd}
              disabled={unavailable}
              className="mt-8 w-full rounded-md bg-enzo-gradient py-3 font-semibold text-enzo-black disabled:opacity-40"
            >
              {unavailable ? t("product.soldOut") : added ? t("success.addedToCart") : t("product.addToCart")}
            </button>
          );
        })()}

        <dl className="mt-10 space-y-3 border-t hairline pt-6 text-sm">
          {localize(product.material) && (
            <div className="flex justify-between">
              <dt className="text-enzo-muted">{t("product.material")}</dt>
              <dd>{localize(product.material)}</dd>
            </div>
          )}
          {localize(product.fit) && (
            <div className="flex justify-between">
              <dt className="text-enzo-muted">{t("product.fit")}</dt>
              <dd>{localize(product.fit)}</dd>
            </div>
          )}
          {localize(product.care_instructions) && (
            <div className="flex justify-between">
              <dt className="text-enzo-muted">{t("product.care")}</dt>
              <dd>{localize(product.care_instructions)}</dd>
            </div>
          )}
        </dl>
      </div>
    </div>
  );
}
