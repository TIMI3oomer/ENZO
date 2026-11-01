import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useLocalizedField } from "../context/LanguageContext.jsx";
import { formatPrice, getDiscountedPrice } from "../lib/formatPrice.js";
import { COLOR_HEX } from "../lib/colors.js";
import { ShoppingBag } from "lucide-react";
import { isProductSoldOut } from "../lib/variantStock.js";

// CHECKPOINT NOTE (ProductCard.jsx):
// `text-start` (not text-left) so captions align correctly in both
// directions. Previously the ring glow (`.enzo-ring`, defined in
// index.css) sat directly on the image with no real card shell around
// it -- just a photo floating over a caption. It's now wrapped in an
// actual bordered/elevated panel (image + footer in one rounded-2xl
// shell) so the grid reads as a set of cards, not a loose photo grid.
// `.enzo-ring-card` is a rectangular variant of that same glow (see
// index.css) sized to this shell's corners instead of the pill-shaped
// original, which is kept as-is for the circular/avatar use elsewhere.
//
// COLOR SWATCH PREVIEW: if a product has 2+ colors AND the admin assigned
// photos to them (product.color_images, set in admin/ProductForm.jsx),
// swatch chips appear over the image. Hovering (desktop) or tapping
// (mobile -- "click" fires on tap too) swaps the shown photo without
// leaving the grid. Chips sit on a translucent bar (not bare dots on the
// photo) so they stay legible over any image, and are sized a bit larger
// than before since most shoppers here are on mobile tapping, not
// hovering with a precise cursor. The swatches sit INSIDE the card's
// <Link> for layout reasons, so their clicks call
// preventDefault/stopPropagation to stop that click from also triggering
// navigation to the product page.
//
// LAYOUT: flat, photo-first streetwear card (no boxed shell): tall photo,
// uppercase two-line name, gold price and a small round bag button.
export default function ProductCard({ product }) {
  const { t } = useTranslation("common");
  const localize = useLocalizedField();
  const [previewColor, setPreviewColor] = useState(null);

  const colorImages = product.color_images || {};
  const hasColorPreviews = (product.colors?.length || 0) > 1 && Object.keys(colorImages).length > 0;
  const displayedImage = (previewColor && colorImages[previewColor]) || product.images?.[0];
  const name = localize(product.name);
  const soldOut = isProductSoldOut(product);

  function handleSwatchClick(e, color) {
    e.preventDefault();
    e.stopPropagation();
    setPreviewColor((current) => (current === color ? null : color));
  }

  return (
    <Link to={`/product/${product.slug}`} className="group block h-full">
      <div className="flex h-full flex-col transition-transform duration-300 ease-out group-active:scale-[0.98]">
        <div className="relative aspect-[3/4] overflow-hidden bg-enzo-panel">
          {displayedImage ? (
            <img
              src={displayedImage}
              alt={name}
              loading="lazy"
              className={`h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-105 ${
                soldOut ? "opacity-50 grayscale" : ""
              }`}
            />
          ) : (
            <div className="flex h-full items-center justify-center font-display text-lg tracking-wide text-enzo-muted">
              ENZO
            </div>
          )}

          {soldOut && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="w-full bg-enzo-black/85 py-2 text-center font-display text-sm uppercase tracking-[0.25em] text-enzo-white">
                {t("product.soldOut")}
              </span>
            </div>
          )}

          {product.discount_percent > 0 && !soldOut && (
            <span className="absolute bottom-2 end-2 bg-enzo-error px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-enzo-white">
              -{product.discount_percent}%
            </span>
          )}

          {hasColorPreviews && (
            <div className="absolute inset-x-0 top-0 flex justify-center pt-2">
              <div className="flex items-center gap-1.5 rounded-full bg-enzo-black/45 px-2 py-1.5 backdrop-blur-sm">
                {product.colors.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onMouseEnter={() => setPreviewColor(c)}
                    onClick={(e) => handleSwatchClick(e, c)}
                    title={c}
                    aria-label={c}
                    aria-pressed={previewColor === c}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-transform"
                  >
                    <span
                      className={`h-3.5 w-3.5 rounded-full border transition-transform ${
                        previewColor === c
                          ? "scale-110 border-enzo-goldBright ring-1 ring-enzo-goldBright"
                          : "border-white/50"
                      }`}
                      style={{ backgroundColor: COLOR_HEX[c] || "#333" }}
                    />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-2 pt-3 text-start">
          <p className="line-clamp-2 min-h-[2.5em] text-xs font-semibold uppercase leading-tight tracking-wide sm:text-[13px]">
            {name}
          </p>
          <div className={`mt-auto flex items-center justify-between gap-2 ${soldOut ? "opacity-50" : ""}`}>
            {product.discount_percent > 0 ? (
              <p className="flex flex-wrap items-baseline gap-x-2 text-sm font-semibold">
                <span className="text-enzo-goldBright">{formatPrice(getDiscountedPrice(product.price, product.discount_percent))}</span>
                <span className="text-xs text-enzo-muted line-through">{formatPrice(product.price)}</span>
              </p>
            ) : (
              <p className="text-sm font-semibold text-enzo-goldBright">{formatPrice(product.price)}</p>
            )}
            <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full border border-enzo-line text-enzo-muted transition-colors group-hover:border-enzo-gold group-hover:bg-enzo-gold group-hover:text-enzo-black">
              <ShoppingBag size={14} />
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
