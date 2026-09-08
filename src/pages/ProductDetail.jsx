import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api.js";
import { useLocalizedField } from "../context/LanguageContext.jsx";
import { useCart } from "../context/CartContext.jsx";
import { formatPrice } from "../lib/formatPrice.js";
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
        setSize(data?.sizes?.[0] ?? null);
        setColor(data?.colors?.[0] ?? null);
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
        <p className="mt-2 text-xl text-enzo-muted">{formatPrice(product.price)}</p>
        <p className="mt-6 leading-relaxed text-enzo-muted">{localize(product.description)}</p>

        {product.colors?.length > 0 && (
          <div className="mt-6">
            <p className="mb-2 text-sm font-medium">{t("product.color")}</p>
            <div className="flex gap-2">
              {product.colors.map((c) => (
                <button
                  key={c}
                  onClick={() => handleColorSelect(c)}
                  title={c}
                  className={`h-9 w-9 rounded-full border-2 ${color === c ? "border-enzo-goldBright" : "border-enzo-line"}`}
                  style={{ backgroundColor: COLOR_HEX[c] || "#333" }}
                />
              ))}
            </div>
          </div>
        )}

        {product.sizes?.length > 0 && (
          <div className="mt-6">
            <p className="mb-2 text-sm font-medium">{t("product.size")}</p>
            <div className="flex flex-wrap gap-2">
              {product.sizes.map((s) => (
                <button
                  key={s}
                  onClick={() => setSize(s)}
                  className={`rounded border px-4 py-2 text-sm ${
                    size === s ? "border-enzo-white bg-enzo-white text-enzo-black" : "border-enzo-line text-enzo-muted"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={handleAdd}
          disabled={product.stock === 0}
          className="mt-8 w-full rounded-md bg-enzo-gradient py-3 font-semibold text-enzo-black disabled:opacity-40"
        >
          {product.stock === 0 ? t("product.outOfStock") : added ? t("success.addedToCart") : t("product.addToCart")}
        </button>

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
